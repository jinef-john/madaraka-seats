import { TRAIN_TYPE_CONFIG } from "@/utils/train-config";
import { scrapeMonth } from "@/utils/scraper";
import { setMonth } from "@/utils/month-cache";
import type { TrainType } from "@/types/train";

const BATCH_SIZE = 3;

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
  const now = new Date();
  const currentMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };

  // Only refresh default routes for the current month (6 routes).
  // Future months and non-default routes are cached on-demand when users request them.
  const primary: {
    scheduleType: TrainType;
    from: string;
    to: string;
    year: number;
    month: number;
  }[] = [];
  for (const cfg of Object.values(TRAIN_TYPE_CONFIG)) {
    for (const [from, to] of [
      [cfg.defaultOrigin, cfg.defaultDestination],
      [cfg.defaultDestination, cfg.defaultOrigin],
    ]) {
      primary.push({ scheduleType: cfg.type, from, to, ...currentMonth });
    }
  }
  await warmRoutes(primary);
}
