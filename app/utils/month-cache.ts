import type { MonthDay, TrainType } from "@/types/train";
import { redis } from "@/utils/redis";

const REFRESH_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "300000",
  10,
);
const TTL = Math.ceil((REFRESH_MS * 3) / 1000);

function key(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
) {
  return `month:${t}|${from}|${to}|${year}|${month}`;
}

export async function getMonth(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
): Promise<MonthDay[] | null> {
  const data = await redis.get<MonthDay[]>(key(t, from, to, year, month));
  return data ?? null;
}

export async function setMonth(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
  days: MonthDay[],
) {
  await redis.set(key(t, from, to, year, month), days, { ex: TTL });
}

export async function allCachedRoutes(): Promise<
  {
    scheduleType: TrainType;
    from: string;
    to: string;
    year: number;
    month: number;
  }[]
> {
  const keys = await redis.keys("month:*");
  return keys.map((k) => {
    const parts = k.replace("month:", "").split("|");
    return {
      scheduleType: parts[0] as TrainType,
      from: parts[1],
      to: parts[2],
      year: Number(parts[3]),
      month: Number(parts[4]),
    };
  });
}

/** Delete all cached month entries from Redis. */
export async function flushMonthCache(): Promise<number> {
  const keys = await redis.keys("month:*");
  if (keys.length === 0) return 0;
  await redis.del(...keys);
  return keys.length;
}
