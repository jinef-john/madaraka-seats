"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Train,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MonthCalendar } from "@/components/MonthCalendar";
import { DaySheet } from "@/components/DaySheet";
import { TRAIN_TYPE_CONFIG } from "@/utils/train-config";
import type { MonthResponse, TrainType } from "@/types/train";

// ─── constants ────────────────────────────────────────────────────────────────

const METICKETS_BASE = "https://metickets.krc.co.ke";
const MAX_MONTHS_AHEAD = 2;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const LEGEND = [
  { label: "Available", bar: "bg-amber-container" },
  { label: "Filling",   bar: "bg-primary/70" },
  { label: "Sold Out",  bar: "bg-destructive/40" },
] as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isValidType(v: string | null): v is TrainType {
  return v === "express" || v === "inter_county" || v === "phase2";
}

// ─── CalendarPage (uses useSearchParams — needs Suspense boundary) ─────────────

function CalendarPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = new Date();

  // Initialise state from URL params so a page refresh restores the view.
  const rawType = searchParams.get("type");
  const initType: TrainType = isValidType(rawType) ? rawType : "express";
  const initCfg = TRAIN_TYPE_CONFIG[initType];

  const [scheduleType, setScheduleType] = useState<TrainType>(initType);
  const initFrom = searchParams.get("from") ?? initCfg.defaultOrigin;
  const initDests = initCfg.knownDestinationsByOrigin[initFrom] ?? [];
  const urlTo = searchParams.get("to") ?? "";
  const initTo =
    urlTo && urlTo !== initFrom && initDests.includes(urlTo)
      ? urlTo
      : (initDests[0] ?? initCfg.defaultDestination);
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);
  const [year, setYear] = useState(() => {
    const v = parseInt(searchParams.get("year") ?? "", 10);
    return isNaN(v) ? now.getFullYear() : v;
  });
  const [month, setMonth] = useState(() => {
    const v = parseInt(searchParams.get("month") ?? "", 10);
    return isNaN(v) || v < 1 || v > 12 ? now.getMonth() + 1 : v;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const config = TRAIN_TYPE_CONFIG[scheduleType];

  // Sync relevant state to the URL so the page survives a refresh.
  function pushUrl(updates: {
    type?: TrainType;
    from?: string;
    to?: string;
    year?: number;
    month?: number;
  }) {
    const next = new URLSearchParams({
      type: updates.type ?? scheduleType,
      from: updates.from ?? from,
      to: updates.to ?? to,
      year: String(updates.year ?? year),
      month: String(updates.month ?? month),
    });
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  // ── handlers ────────────────────────────────────────────────────────────────

  const handleTypeChange = (type: TrainType) => {
    const cfg = TRAIN_TYPE_CONFIG[type];
    setScheduleType(type);
    setFrom(cfg.defaultOrigin);
    setTo(cfg.defaultDestination);
    setSelectedDate(null);
    pushUrl({ type, from: cfg.defaultOrigin, to: cfg.defaultDestination });
  };

  const handleFromChange = (newFrom: string) => {
    const dests = config.knownDestinationsByOrigin[newFrom] ?? [];
    // Keep the current 'to' if it's still reachable from the new origin,
    // otherwise fall back to the first available destination.
    const newTo = dests.includes(to) ? to : (dests[0] ?? "");
    setFrom(newFrom);
    setTo(newTo);
    setSelectedDate(null);
    pushUrl({ from: newFrom, to: newTo });
  };

  const handleToChange = (newTo: string) => {
    setTo(newTo);
    setSelectedDate(null);
    pushUrl({ to: newTo });
  };

  // ── data fetching ────────────────────────────────────────────────────────────

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["month", scheduleType, from, to, year, month],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        scheduleType, from, to,
        year: String(year), month: String(month),
      });
      const res = await fetch(`/api/trains/month?${params}`, { signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<MonthResponse>;
    },
  });

  const monthDays = data?.days ?? null;
  const errorMsg = error ? (error as Error).message : null;

  // ── month navigation ─────────────────────────────────────────────────────────

  const canGoPrev =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month > now.getMonth() + 1);

  const canGoNext = (() => {
    const max = new Date(now);
    max.setMonth(max.getMonth() + MAX_MONTHS_AHEAD);
    return (
      year < max.getFullYear() ||
      (year === max.getFullYear() && month < max.getMonth() + 1)
    );
  })();

  const goPrev = () => {
    if (!canGoPrev) return;
    const [ny, nm] = month === 1 ? [year - 1, 12] : [year, month - 1];
    setYear(ny); setMonth(nm); setSelectedDate(null);
    pushUrl({ year: ny, month: nm });
  };

  const goNext = () => {
    if (!canGoNext) return;
    const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1];
    setYear(ny); setMonth(nm); setSelectedDate(null);
    pushUrl({ year: ny, month: nm });
  };

  // ── derived values ───────────────────────────────────────────────────────────

  const originOptions = config.stationCatalog;
  const destOptions =
    config.knownDestinationsByOrigin[from] ??
    config.stationCatalog.filter((s) => s !== from);
  const selectedDay = monthDays?.find((d) => d.date === selectedDate) ?? null;

  // ── render ───────────────────────────────────────────────────────────────────

  // Shared sub-components (inline to avoid prop-drilling through a file split)
  const TrainTypePicker = ({ mobile }: { mobile?: boolean }) => (
    <div
      className={cn(
        "flex gap-0.5 p-1 bg-muted/60 rounded-xl",
        mobile ? "w-fit" : "w-full",
      )}
    >
      {Object.values(TRAIN_TYPE_CONFIG).map((cfg) => (
        <button
          key={cfg.type}
          onClick={() => handleTypeChange(cfg.type as TrainType)}
          className={cn(
            "rounded-lg text-xs font-semibold transition-all duration-150",
            mobile ? "h-7 px-3.5" : "flex-1 h-7",
            scheduleType === cfg.type
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {cfg.label}
        </button>
      ))}
    </div>
  );

  const Brand = () => (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
        <Train className="size-[14px] text-white" />
      </div>
      <div className="leading-none">
        <p className="text-sm font-bold text-primary">KRC Availability</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Seat Monitor
        </p>
      </div>
    </div>
  );

  const LegendItems = () => (
    <>
      {LEGEND.map(({ label, bar }) => (
        <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("w-4 h-[3px] rounded-full shrink-0", bar)} />
          {label}
        </div>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen max-w-5xl mx-auto">

        {/* ── Sidebar (lg+) ──────────────────────────────────────────────── */}
        <aside
          className={cn(
            "hidden lg:flex flex-col",
            "w-56 xl:w-60 shrink-0",
            "px-5 py-8 gap-5",
            "border-r border-border/40 bg-card/50",
          )}
        >
          <Brand />
          <div className="border-t border-border/40" />

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Train Type
            </p>
            <TrainTypePicker />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Route
            </p>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground/70 pl-0.5">From</p>
              <Select value={from} onValueChange={handleFromChange}>
                <SelectTrigger className="w-full h-9 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {originOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-center py-0.5">
              <ArrowDown className="size-3.5 text-muted-foreground/30" />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground/70 pl-0.5">To</p>
              <Select value={to} onValueChange={handleToChange}>
                <SelectTrigger className="w-full h-9 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isPending}
            className="w-full rounded-xl gap-2 text-sm"
          >
            <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
            Refresh
          </Button>

          <div className="mt-auto space-y-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Legend
            </p>
            <LegendItems />
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 lg:py-10">

          {/* Mobile brand + controls */}
          <div className="lg:hidden mb-7 space-y-5">
            <Brand />
            <div className="flex flex-col gap-3">
              <TrainTypePicker mobile />
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={from} onValueChange={handleFromChange}>
                  <SelectTrigger className="w-[155px] h-9 text-sm rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {originOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm select-none">→</span>
                <Select value={to} onValueChange={handleToChange}>
                  <SelectTrigger className="w-[155px] h-9 text-sm rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {destOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => refetch()} disabled={isPending}
                  className="h-9 w-9 rounded-xl" title="Refresh"
                >
                  <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>

          {/* Month header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground leading-none">
                {MONTH_NAMES[month - 1]}
                <span className="text-muted-foreground font-normal ml-2.5">{year}</span>
              </h1>
              {errorMsg && (
                <p className="text-xs text-destructive mt-1.5">{errorMsg}</p>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost" size="icon" onClick={goPrev}
                disabled={!canGoPrev || isPending} className="h-8 w-8 rounded-full"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost" size="icon" onClick={goNext}
                disabled={!canGoNext || isPending} className="h-8 w-8 rounded-full"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Calendar grid */}
          <MonthCalendar
            year={year} month={month}
            days={monthDays} loading={isPending}
            selectedDate={selectedDate} onDayClick={setSelectedDate}
          />

          {/* Mobile legend */}
          <div className="lg:hidden flex items-center gap-5 mt-6">
            <LegendItems />
          </div>

        </main>
      </div>

      <DaySheet
        day={selectedDate ? (selectedDay ?? { date: selectedDate, trains: [] }) : null}
        scheduleType={scheduleType}
        from={from} to={to}
        bookingUrl={METICKETS_BASE}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}

// useSearchParams requires a Suspense boundary — CalendarPage is the async shell.
export default function Page() {
  return (
    <Suspense>
      <CalendarPage />
    </Suspense>
  );
}
