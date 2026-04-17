import type { MonthDay, TrainType } from "@/types/train";

interface Entry {
  days: MonthDay[];
}

const store = new Map<string, Entry>();

function key(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
) {
  return `${t}|${from}|${to}|${year}|${month}`;
}

export function getMonth(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
): MonthDay[] | null {
  return store.get(key(t, from, to, year, month))?.days ?? null;
}

export function setMonth(
  t: TrainType,
  from: string,
  to: string,
  year: number,
  month: number,
  days: MonthDay[],
) {
  store.set(key(t, from, to, year, month), { days });
}

export function allCachedRoutes(): {
  scheduleType: TrainType;
  from: string;
  to: string;
  year: number;
  month: number;
}[] {
  return Array.from(store.keys()).map((k) => {
    const [scheduleType, from, to, year, month] = k.split("|");
    return {
      scheduleType: scheduleType as TrainType,
      from,
      to,
      year: Number(year),
      month: Number(month),
    };
  });
}
