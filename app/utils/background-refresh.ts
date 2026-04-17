import { TRAIN_TYPE_CONFIG } from "@/utils/train-config";
import { scrapeMonth } from "@/utils/scraper";
import { setMonth, allCachedRoutes } from "@/utils/month-cache";
import type { TrainType } from "@/types/train";

const INTERVAL_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "300000",
  10,
);

function upcomingMonths(): { year: number; month: number }[] {
  const now = new Date();
  return [0, 1, 2].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
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
  for (const r of routes) {
    try {
      const days = await scrapeMonth(
        r.scheduleType,
        r.from,
        r.to,
        r.year,
        r.month,
      );
      setMonth(r.scheduleType, r.from, r.to, r.year, r.month, days);
    } catch {
      // retain previous data on error
    }
  }
}

async function refresh() {
  const months = upcomingMonths();

  // Primary routes: each type's default origin ↔ destination, both directions
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
      for (const m of months) {
        primary.push({ scheduleType: cfg.type, from, to, ...m });
      }
    }
  }
  await warmRoutes(primary);

  // Re-warm any demand-cached routes accumulated since last refresh
  const primarySet = new Set(
    primary.map(
      (r) => `${r.scheduleType}|${r.from}|${r.to}|${r.year}|${r.month}`,
    ),
  );
  const extra = allCachedRoutes().filter(
    (r) =>
      !primarySet.has(
        `${r.scheduleType}|${r.from}|${r.to}|${r.year}|${r.month}`,
      ),
  );
  if (extra.length > 0) await warmRoutes(extra);
}

let started = false;

export function startBackgroundRefresh() {
  if (started) return;
  started = true;
  void refresh();
  setInterval(() => {
    void refresh();
  }, INTERVAL_MS);
}
