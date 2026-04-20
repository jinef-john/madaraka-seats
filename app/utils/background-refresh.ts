import { TRAIN_TYPE_CONFIG, lastBookableDate } from "@/utils/train-config";
import { scrapeMonth } from "@/utils/scraper";
import { setMonth } from "@/utils/month-cache";
import type { TrainType } from "@/types/train";

const CONCURRENCY = 6;

export interface WarmJob {
  scheduleType: TrainType;
  from: string;
  to: string;
  year: number;
  month: number;
}

/** Returns list of {year, month} pairs from now up to and including the month containing `lastDate`. */
function monthsInRange(lastDate: string): { year: number; month: number }[] {
  const now = new Date();
  const [endYear, endMonth] = lastDate.split("-").map(Number);
  const result: { year: number; month: number }[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return result;
}

async function warmOne(r: WarmJob) {
  try {
    const days = await scrapeMonth(r.scheduleType, r.from, r.to, r.year, r.month);
    await setMonth(r.scheduleType, r.from, r.to, r.year, r.month, days);
  } catch {
    // retain previous data on error
  }
}

/** Build the full list of route-months that need warming. */
export function buildJobs(): WarmJob[] {
  const jobs: WarmJob[] = [];
  for (const cfg of Object.values(TRAIN_TYPE_CONFIG)) {
    const months = monthsInRange(lastBookableDate(cfg.type));
    const pairs = Object.entries(cfg.knownDestinationsByOrigin);
    for (const { year, month } of months) {
      for (const [from, destinations] of pairs) {
        for (const to of destinations) {
          jobs.push({ scheduleType: cfg.type as TrainType, from, to, year, month });
        }
      }
    }
  }
  return jobs;
}

/** Scrape and cache a chunk of route-months (designed to run within a single function invocation). */
export async function warmChunk(jobs: WarmJob[]) {
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(warmOne));
  }
}
