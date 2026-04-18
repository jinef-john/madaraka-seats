"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog } from "radix-ui";
import { X, ExternalLink, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  MonthDay,
  TrainType,
  SearchResponse,
  StandardTrainResult,
  PremiumTrainResult,
} from "@/types/train";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    weekday: d.toLocaleDateString("en-KE", { weekday: "long" }),
    short: d.toLocaleDateString("en-KE", { month: "short", day: "numeric" }),
    year: String(d.getFullYear()),
  };
}

function formatTime(dep: string): string {
  // Handle full datetime like "2026-04-18 22:00:00" — extract HH:MM first
  const timeMatch = dep.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    const isPm = timeMatch[3].toLowerCase() === "pm";
    if (isPm && h !== 12) h += 12;
    if (!isPm && h === 12) h = 0;
    const period = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
  }
  // Extract HH:MM from datetime or plain time
  const hhmm = dep.match(/(\d{2}):(\d{2})/);
  if (!hhmm) return dep;
  const h = parseInt(hhmm[1], 10);
  const m = parseInt(hhmm[2], 10);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── normalised train shape ────────────────────────────────────────────────────

interface SeatClass {
  label: string;
  count: number;
}

interface FareRow {
  label: string;
  adult: string;
  child: string;
}

interface TrainInfo {
  trainNo: string;
  departure: string;
  totalSeats: number;
  seatClasses: SeatClass[];
  fares: FareRow[];
}

function fromSearchResult(
  r: StandardTrainResult | PremiumTrainResult,
): TrainInfo {
  if (r.resultType === "standard") {
    const eco = parseInt(r.openSeats.economy, 10) || 0;
    const fc = parseInt(r.openSeats.firstClass, 10) || 0;
    const seatClasses: SeatClass[] = [{ label: "Economy", count: eco }];
    if (fc > 0 || r.fare.firstAdult)
      seatClasses.push({ label: "1st Class", count: fc });
    const fares: FareRow[] = [];
    if (r.fare.economyAdult)
      fares.push({
        label: "Economy",
        adult: r.fare.economyAdult,
        child: r.fare.economyChild,
      });
    if (r.fare.firstAdult)
      fares.push({
        label: "1st Class",
        adult: r.fare.firstAdult,
        child: r.fare.firstChild,
      });
    return {
      trainNo: r.trainNo,
      departure: r.departure,
      totalSeats: eco + fc,
      seatClasses,
      fares,
    };
  }
  const totalSeats = r.seatGroups.reduce((sum, g) => {
    const avail =
      typeof g.availableSeats !== "undefined"
        ? Number(g.availableSeats)
        : Math.max(0, g.seats.length - g.bookedSeats.length);
    return sum + avail;
  }, 0);
  const fares: FareRow[] = [];
  if (r.fares.premiumAdult)
    fares.push({
      label: "Premium",
      adult: r.fares.premiumAdult,
      child: r.fares.premiumChild,
    });
  return {
    trainNo: r.trainNo,
    departure: r.departure,
    totalSeats,
    seatClasses: [{ label: "Premium", count: totalSeats }],
    fares,
  };
}

/** Extract HH:MM from a departure string (handles "2026-05-20 08:00:00" and "08:00"). */
function extractHHMM(dep: string): string {
  const m = dep.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : dep;
}

/**
 * Merge search results by departure time so that one physical train
 * (which has separate standard and premium entries) becomes one TrainInfo card.
 */
function mergeSearchResults(
  results: (StandardTrainResult | PremiumTrainResult)[],
): TrainInfo[] {
  const infos = results.map(fromSearchResult);
  const byDep = new Map<string, TrainInfo>();

  for (const info of infos) {
    const hm = extractHHMM(info.departure);
    const existing = byDep.get(hm);
    if (existing) {
      // Merge seat classes (avoid duplicates)
      for (const sc of info.seatClasses) {
        if (!existing.seatClasses.find((e) => e.label === sc.label)) {
          existing.seatClasses.push(sc);
        }
      }
      // Merge fares
      for (const f of info.fares) {
        if (!existing.fares.find((e) => e.label === f.label)) {
          existing.fares.push(f);
        }
      }
      existing.totalSeats += info.totalSeats;
      // Keep the standard trainNo (more recognizable)
      if (!existing.trainNo) existing.trainNo = info.trainNo;
    } else {
      byDep.set(hm, { ...info });
    }
  }

  return [...byDep.values()];
}

function fromMonthTrain(t: {
  trainNo: string;
  departure: string;
  economy: number;
  firstClass: number;
  premium?: number;
}): TrainInfo {
  const premium = t.premium ?? 0;
  const seatClasses: SeatClass[] = [];
  if (t.economy > 0 || t.firstClass > 0) {
    seatClasses.push({ label: "Economy", count: t.economy });
    if (t.firstClass > 0)
      seatClasses.push({ label: "1st Class", count: t.firstClass });
  }
  if (premium > 0) seatClasses.push({ label: "Premium", count: premium });
  if (seatClasses.length === 0)
    seatClasses.push({ label: "Economy", count: 0 });
  return {
    trainNo: t.trainNo,
    departure: t.departure,
    totalSeats: t.economy + t.firstClass + premium,
    seatClasses,
    fares: [],
  };
}

// ─── TrainCard ────────────────────────────────────────────────────────────────

function TrainCard({
  trainNo,
  departure,
  totalSeats,
  seatClasses,
  fares,
  bookingUrl,
}: TrainInfo & { bookingUrl: string }) {
  const avail =
    totalSeats === 0 ? "sold-out" : totalSeats >= 1000 ? "high" : "filling";
  const cols =
    seatClasses.length === 1
      ? "grid-cols-1"
      : seatClasses.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div
        className={cn(
          "h-1 w-full",
          avail === "high" && "bg-amber-container",
          avail === "filling" && "bg-primary",
          avail === "sold-out" && "bg-destructive/40",
        )}
      />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {trainNo ? `Train ${trainNo}` : "Train"}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                  avail === "high" && "bg-amber-container/20 text-amber",
                  avail === "filling" && "bg-primary/10 text-primary",
                  avail === "sold-out" && "bg-destructive/10 text-destructive",
                )}
              >
                {avail === "high"
                  ? "Available"
                  : avail === "filling"
                    ? "Filling Fast"
                    : "Sold Out"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-lg font-semibold leading-none">
                {formatTime(departure)}
              </span>
            </div>
          </div>

          {totalSeats > 0 && (
            <Button asChild size="sm" className="rounded-full shrink-0 h-8">
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                Book
                <ExternalLink className="size-3 ml-1" />
              </a>
            </Button>
          )}
        </div>

        <div className={cn("grid gap-2", cols)}>
          {seatClasses.map(({ label, count }) => (
            <div
              key={label}
              className={cn(
                "rounded-xl px-3 py-2.5 text-center",
                count > 0 ? "bg-surface-low" : "bg-muted/40",
              )}
            >
              <p
                className={cn(
                  "text-xl font-bold leading-none",
                  count === 0 ? "text-muted-foreground/40" : "text-foreground",
                )}
              >
                {count === 0 ? "—" : count}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">
                {label}
              </p>
            </div>
          ))}
        </div>

        {fares.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30 grid gap-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Fares (adult / child)
            </p>
            {fares.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium tabular-nums">
                  {row.adult}
                  <span className="text-muted-foreground/70 font-normal">
                    {" "}
                    / {row.child}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DaySheet ─────────────────────────────────────────────────────────────────

interface Props {
  day: MonthDay | null;
  scheduleType: TrainType;
  from: string;
  to: string;
  bookingUrl: string;
  onClose: () => void;
}

export function DaySheet({
  day,
  scheduleType,
  from,
  to,
  bookingUrl,
  onClose,
}: Props) {
  const isOpen = day !== null;
  const date = day ? formatDate(day.date) : null;

  // If the month cache already shows zero total seats for this day,
  // skip the per-date search — let the background refresh handle updates.
  // Array.every on an empty array returns true, so this also covers
  // Suswa/phase2 dates with no trains listed.
  const alreadySoldOut =
    day !== null &&
    day.trains.every(
      (t) => t.economy + t.firstClass + (t.premium ?? 0) === 0,
    );

  const { data: searchData, isFetching: isSearching } =
    useQuery<SearchResponse>({
      queryKey: ["search", scheduleType, from, to, day?.date],
      queryFn: async ({ signal }) => {
        const params = new URLSearchParams({
          scheduleType,
          from,
          to,
          date: day!.date,
        });
        const res = await fetch(`/api/trains/search?${params}`, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      enabled: isOpen && !alreadySoldOut,
      staleTime: 30_000,
    });

  const trains: TrainInfo[] = searchData?.results
    ? mergeSearchResults(searchData.results)
    : (day?.trains ?? []).map(fromMonthTrain);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "duration-200",
          )}
        />

        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col outline-none bg-background",
            "bottom-0 left-0 right-0 max-h-[87dvh]",
            "rounded-t-[28px]",
            "shadow-[0_-2px_32px_rgba(0,0,0,0.10)]",
            "sm:bottom-auto sm:right-auto",
            "sm:left-[50%] sm:top-[50%]",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-[440px] sm:max-h-[90vh]",
            "sm:rounded-[28px]",
            "sm:shadow-2xl sm:border sm:border-border/30",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
            "data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:slide-out-to-bottom-6",
            "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=closed]:slide-out-to-left-1/2",
            "sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-top-[48%]",
            "sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95",
            "duration-300 ease-out",
          )}
        >
          <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
            <div className="w-10 h-1 rounded-full bg-border/70" />
          </div>

          <div className="shrink-0 px-5 pt-3 sm:pt-5 pb-4 border-b border-border/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                {date && (
                  <>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                      {date.weekday}
                    </p>
                    <Dialog.Title className="text-2xl font-bold text-foreground leading-tight">
                      {date.short}
                      <span className="text-lg font-normal text-muted-foreground ml-2">
                        {date.year}
                      </span>
                    </Dialog.Title>
                  </>
                )}
                <Dialog.Description className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  {from} → {to}
                  {isSearching && (
                    <Loader2 className="size-3 animate-spin text-muted-foreground/50" />
                  )}
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full h-8 w-8 shrink-0 -mt-1 -mr-1"
                >
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isSearching && trains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground/40 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Loading availability…
                </p>
              </div>
            ) : trains.length === 0 && (searchData?.fullyBooked || alreadySoldOut) ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
                  <X className="size-5 text-destructive/60" />
                </div>
                <p className="font-semibold text-foreground">Fully Booked</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-[220px]">
                  All trains on this date are sold out. Try another date.
                </p>
              </div>
            ) : trains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                  <Clock className="size-5 text-muted-foreground/50" />
                </div>
                <p className="font-semibold text-foreground">
                  No trains listed
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-[180px]">
                  Availability may not be published yet for this date.
                </p>
              </div>
            ) : (
              trains.map((train, i) => (
                <TrainCard
                  key={train.trainNo || `train-${i}`}
                  {...train}
                  bookingUrl={bookingUrl}
                />
              ))
            )}
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-border/30">
            <p className="text-[11px] text-muted-foreground">
              Availability sourced from{" "}
              <a
                href="https://metickets.krc.co.ke"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                metickets.krc.co.ke
              </a>
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
