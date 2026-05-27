import cron from "node-cron";
import { TRAIN_TYPE_CONFIG, lastBookableDate } from "../utils/train-config.js";
import { scrapeMonth } from "../utils/scraper.js";
import { setMonth, allCachedRoutes } from "../db/month-cache.js";
import { pruneExpiredSearch } from "../db/search-cache.js";
import type { TrainType } from "../types/train.js";

const BATCH_SIZE = 6;
const REFRESH_CRON = process.env.REFRESH_CRON ?? "*/5 * * * *";

function monthsInRange(lastDate: string): { year: number; month: number }[] {
  const now = new Date();
  const [endYear, endMonth] = lastDate.split("-").map(Number);
  const result: { year: number; month: number }[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
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
    const days = await scrapeMonth(r.scheduleType, r.from, r.to, r.year, r.month);
    await setMonth(r.scheduleType, r.from, r.to, r.year, r.month, days);
  } catch {
    // retain previous data on error
  }
}

async function warmBatch(
  jobs: { scheduleType: TrainType; from: string; to: string; year: number; month: number }[],
) {
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    await Promise.all(jobs.slice(i, i + BATCH_SIZE).map(warmOne));
  }
}

export async function refresh(): Promise<void> {
  const jobs: { scheduleType: TrainType; from: string; to: string; year: number; month: number }[] = [];

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

  // Also refresh any on-demand routes that were requested and are cached
  const extra = await allCachedRoutes();
  for (const r of extra) {
    if (!jobs.some(j => j.scheduleType === r.scheduleType && j.from === r.from && j.to === r.to && j.year === r.year && j.month === r.month)) {
      jobs.push(r);
    }
  }

  console.log(`[scheduler] refreshing ${jobs.length} route-months`);
  await warmBatch(jobs);
  await pruneExpiredSearch();
  console.log(`[scheduler] refresh complete`);
}

export function startScheduler(): void {
  // Run once on startup to warm the cache
  refresh().catch((err) => console.error("[scheduler] initial refresh failed:", err));

  cron.schedule(REFRESH_CRON, () => {
    refresh().catch((err) => console.error("[scheduler] refresh failed:", err));
  });

  console.log(`[scheduler] started, cron: ${REFRESH_CRON}`);
}
