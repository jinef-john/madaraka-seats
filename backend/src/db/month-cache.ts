import { pool } from "./index.js";
import type { MonthDay, TrainType } from "../types/train.js";

export async function getMonth(
  scheduleType: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
): Promise<MonthDay[] | null> {
  const res = await pool.query<{ days: MonthDay[] }>(
    `SELECT days FROM month_cache
     WHERE schedule_type = $1 AND from_station = $2 AND to_station = $3
       AND year = $4 AND month = $5`,
    [scheduleType, from, to, year, month],
  );
  return res.rows[0]?.days ?? null;
}

export async function setMonth(
  scheduleType: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
  days: MonthDay[],
): Promise<void> {
  await pool.query(
    `INSERT INTO month_cache (schedule_type, from_station, to_station, year, month, days, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (schedule_type, from_station, to_station, year, month)
     DO UPDATE SET days = EXCLUDED.days, updated_at = NOW()`,
    [scheduleType, from, to, year, month, JSON.stringify(days)],
  );
}

export async function allCachedRoutes(): Promise<
  { scheduleType: TrainType; from: string; to: string; year: number; month: number }[]
> {
  const res = await pool.query<{
    schedule_type: TrainType;
    from_station: string;
    to_station: string;
    year: number;
    month: number;
  }>(
    `SELECT schedule_type, from_station, to_station, year, month FROM month_cache`,
  );
  return res.rows.map((r) => ({
    scheduleType: r.schedule_type,
    from: r.from_station,
    to: r.to_station,
    year: r.year,
    month: r.month,
  }));
}

export async function flushMonthCache(): Promise<number> {
  const res = await pool.query(`DELETE FROM month_cache`);
  return res.rowCount ?? 0;
}
