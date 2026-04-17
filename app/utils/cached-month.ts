import type { TrainType } from "@/types/train";
import { scrapeMonth } from "@/utils/scraper";
import { getMonth, setMonth } from "@/utils/month-cache";

export async function getCachedMonth(
  scheduleType: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
) {
  const cached = getMonth(scheduleType, from, to, year, month);
  if (cached) return cached;
  const days = await scrapeMonth(scheduleType, from, to, year, month);
  setMonth(scheduleType, from, to, year, month, days);
  return days;
}
