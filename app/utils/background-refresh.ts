import { TRAIN_TYPE_CONFIG, lastBookableDate } from "@/utils/train-config";
import { scrapeMonth } from "@/utils/scraper";
import { setMonth } from "@/utils/month-cache";
import type { TrainType } from "@/types/train";

const BATCH_SIZE = 6;

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

async function warmOne(r: {
  scheduleType: TrainType;
  from: string;
  to: string;
  year: number;
  month: number;
}) {
  try {
    const days = await scrapeMonth(
      r.scheduleType,
      r.from,
      r.to,
      r.year,
      r.month,
    );
    await setMonth(r.scheduleType, r.from, r.to, r.year, r.month, days);
  } catch {
    // retain previous data on error
  }
}

async function warmRoutes(
  routes: {
    scheduleType: TrainType;
    from: string;
    to: string;
    year: number;
    month: number;
  }[],
) {
  for (let i = 0; i < routes.length; i += BATCH_SIZE) {
    const batch = routes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(warmOne));
  }
}

export async function refresh() {
  // Warm ALL route pairs for every month within each type's booking horizon.
  const jobs: {
    scheduleType: TrainType;
    from: string;
    to: string;
    year: number;
    month: number;
  }[] = [];
  for (const cfg of Object.values(TRAIN_TYPE_CONFIG)) {
    const months = monthsInRange(lastBookableDate(cfg.type));
    const pairs = Object.entries(cfg.knownDestinationsByOrigin);
    for (const { year, month } of months) {
      for (const [from, destinations] of pairs) {
        for (const to of destinations) {
          jobs.push({ scheduleType: cfg.type, from, to, year, month });
        }
      }
    }
  }
  console.log(`[refresh] warming ${jobs.length} route-months`);
  await warmRoutes(jobs);
}
