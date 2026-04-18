"use client";

import { cn } from "@/lib/utils";
import type { MonthDay, MonthDayTrain } from "@/types/train";

// ─── helpers ──────────────────────────────────────────────────────────────────

type Status = "high" | "filling" | "sold-out" | "none";

function getStatus(trains: MonthDayTrain[]): Status {
  if (!trains.length) return "none";
  const total = trains.reduce(
    (s, t) => s + t.economy + t.firstClass + (t.premium ?? 0),
    0,
  );
  if (total === 0) return "sold-out";
  if (total >= 1000) return "high";
  return "filling";
}

function totalSeats(trains: MonthDayTrain[]) {
  return trains.reduce(
    (s, t) => s + t.economy + t.firstClass + (t.premium ?? 0),
    0,
  );
}

/** Compact seat count: 1940 → "1.9k", 450 → "450", 0 → "full" */
function fmtSeats(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 1500 ? 0 : 1)}k`;
  return String(n);
}

// ─── style maps ───────────────────────────────────────────────────────────────

// Background tint per status
const TINT: Record<Status, string> = {
  high: "bg-amber-container/25 hover:bg-amber-container/40",
  filling: "bg-primary/[0.10] hover:bg-primary/[0.18]",
  "sold-out": "bg-destructive/8 hover:bg-destructive/14",
  none: "hover:bg-muted/30",
};

// Bottom-edge bar colour
const BAR: Record<Status, string> = {
  high: "bg-amber-container",
  filling: "bg-primary/70",
  "sold-out": "bg-destructive/40",
  none: "bg-transparent",
};

// Seat-count hint colour
const HINT_COLOR: Record<Status, string> = {
  high: "text-amber",
  filling: "text-primary/75",
  "sold-out": "text-destructive/60",
  none: "",
};

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ─── component ────────────────────────────────────────────────────────────────

interface Props {
  year: number;
  month: number; // 1-based
  days: MonthDay[] | null;
  loading: boolean;
  selectedDate: string | null;
  onDayClick: (date: string) => void;
}

export function MonthCalendar({
  year,
  month,
  days,
  loading,
  selectedDate,
  onDayClick,
}: Props) {
  const dayMap = new Map<string, MonthDay>();
  days?.forEach((d) => dayMap.set(d.date, d));

  const startDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  type Cell = { key: string; day: number | null };
  const cells: Cell[] = [
    ...Array.from(
      { length: startDow },
      (_, i): Cell => ({ key: `e${i}`, day: null }),
    ),
    ...Array.from(
      { length: daysInMonth },
      (_, i): Cell => ({ key: `d${i + 1}`, day: i + 1 }),
    ),
  ];

  return (
    <div
      className={cn(
        "w-full transition-opacity duration-300",
        loading && "opacity-40 pointer-events-none",
      )}
    >
      {/* Column headers */}
      <div className="grid grid-cols-7 border-b border-border/40 mb-2">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {cells.map(({ key, day }) => {
          // Empty filler cells
          if (!day) {
            return <div key={key} className="h-14 sm:h-16" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const stored = dayMap.get(dateStr);
          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const status = stored ? getStatus(stored.trains) : "none";
          const seats = stored ? totalSeats(stored.trains) : 0;

          return (
            <button
              key={key}
              onClick={() => !isPast && onDayClick(dateStr)}
              disabled={isPast}
              title={
                !isPast && stored
                  ? status === "sold-out"
                    ? "Sold out"
                    : `${seats.toLocaleString()} seats available`
                  : undefined
              }
              className={cn(
                // layout — fixed height, slightly taller on sm
                "relative flex flex-col items-center justify-center overflow-hidden",
                "h-14 sm:h-16 rounded-xl",
                "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // past days
                isPast ? "cursor-default opacity-20" : "cursor-pointer",
                // availability tint (only when not selected)
                !isPast && !isSelected && TINT[status],
                // today ring
                isToday && !isSelected && "ring-1 ring-primary/50",
                // selected — solid primary fill, no scale to avoid overflow
                isSelected &&
                  "bg-primary ring-2 ring-primary/30 ring-offset-1 shadow-md shadow-primary/20 z-10",
              )}
            >
              {/* Day number */}
              <span
                className={cn(
                  "text-sm sm:text-[15px] font-semibold leading-none",
                  isSelected
                    ? "text-primary-foreground"
                    : isToday
                      ? "text-primary font-bold"
                      : "text-foreground",
                )}
              >
                {day}
              </span>

              {/* Seat-count hint — shown when data is present and cell isn't selected */}
              {!isPast && !isSelected && status !== "none" && (
                <span
                  className={cn(
                    "text-[10px] leading-none font-semibold mt-1 tabular-nums",
                    HINT_COLOR[status],
                  )}
                >
                  {status === "sold-out"
                    ? "full"
                    : loading
                      ? ""
                      : fmtSeats(seats)}
                </span>
              )}

              {/* Status bar — thin line at the bottom edge */}
              {!isPast && (
                <span
                  className={cn(
                    "absolute bottom-1.5 left-1/2 -translate-x-1/2",
                    "h-[3px] rounded-full transition-all duration-150",
                    isSelected
                      ? "w-5 bg-primary-foreground/50"
                      : status === "none"
                        ? loading
                          ? "w-5 bg-muted animate-pulse"
                          : "w-0"
                        : "w-5",
                    !isSelected && BAR[status],
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
