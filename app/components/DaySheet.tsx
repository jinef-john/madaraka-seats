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
  const [h, m] = dep.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── normalised train shape ────────────────────────────────────────────────────

interface TrainInfo {
  trainNo: string;
  departure: string;
  economy: number;
  firstClass: number;
  fare?: {
    economyAdult?: string;
    economyChild?: string;
    firstAdult?: string;
    firstChild?: string;
    premiumAdult?: string;
    premiumChild?: string;
  };
}

function fromSearchResult(r: StandardTrainResult | PremiumTrainResult): TrainInfo {
  if (r.resultType === "standard") {
    return {
      trainNo: r.trainNo,
      departure: r.departure,
      economy: parseInt(r.openSeats.economy, 10) || 0,
      firstClass: parseInt(r.openSeats.firstClass, 10) || 0,
      fare: r.fare,
    };
  }
  const totalSeats = r.seatGroups.reduce((sum, g) => {
    const avail =
      typeof g.availableSeats !== "undefined"
        ? Number(g.availableSeats)
        : Math.max(0, g.seats.length - g.bookedSeats.length);
    return sum + avail;
  }, 0);
  return {
    trainNo: r.trainNo,
    departure: r.departure,
    economy: totalSeats,
    firstClass: 0,
    fare: { premiumAdult: r.fares.premiumAdult, premiumChild: r.fares.premiumChild },
  };
}

// ─── TrainCard ────────────────────────────────────────────────────────────────

function TrainCard({
  trainNo,
  departure,
  economy,
  firstClass,
  fare,
  bookingUrl,
}: TrainInfo & { bookingUrl: string }) {
  const total = economy + firstClass;
  const avail = total === 0 ? "sold-out" : total >= 1000 ? "high" : "filling";

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div
        className={cn(
          "h-1 w-full",
          avail === "high" && "bg-amber-container",
          avail === "filling" && "bg-primary",
          avail === "sold-out" && "bg-muted-foreground/20",
        )}
      />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Train {trainNo}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                  avail === "high" && "bg-amber-container/20 text-amber",
                  avail === "filling" && "bg-primary/10 text-primary",
                  avail === "sold-out" && "bg-muted text-muted-foreground",
                )}
              >
                {avail === "high" ? "Available" : avail === "filling" ? "Filling Fast" : "Sold Out"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Clock className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-lg font-semibold leading-none">{formatTime(departure)}</span>
            </div>
          </div>

          {total > 0 && (
            <Button asChild size="sm" className="rounded-full shrink-0 h-8">
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                Book
                <ExternalLink className="size-3 ml-1" />
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Economy", count: economy },
            { label: "1st Class", count: firstClass },
          ].map(({ label, count }) => (
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

        {fare && (
          <div className="mt-3 pt-3 border-t border-border/30 grid gap-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Fares (adult / child)
            </p>
            {fare.economyAdult && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Economy</span>
                <span className="font-medium tabular-nums">
                  {fare.economyAdult}
                  <span className="text-muted-foreground/70 font-normal">
                    {" "}
                    / {fare.economyChild}
                  </span>
                </span>
              </div>
            )}
            {fare.firstAdult && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">1st Class</span>
                <span className="font-medium tabular-nums">
                  {fare.firstAdult}
                  <span className="text-muted-foreground/70 font-normal">
                    {" "}
                    / {fare.firstChild}
                  </span>
                </span>
              </div>
            )}
            {fare.premiumAdult && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Premium</span>
                <span className="font-medium tabular-nums">
                  {fare.premiumAdult}
                  <span className="text-muted-foreground/70 font-normal">
                    {" "}
                    / {fare.premiumChild}
                  </span>
                </span>
              </div>
            )}
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

export function DaySheet({ day, scheduleType, from, to, bookingUrl, onClose }: Props) {
  const isOpen = day !== null;
  const date = day ? formatDate(day.date) : null;

  const { data: searchData, isPending: isSearching } = useQuery<SearchResponse>({
    queryKey: ["search", scheduleType, from, to, day?.date],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ scheduleType, from, to, date: day!.date });
      const res = await fetch(`/api/trains/search?${params}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: isOpen,
    staleTime: 30_000,
  });

  const trains: TrainInfo[] = searchData?.results
    ? searchData.results.map(fromSearchResult)
    : (day?.trains ?? []).map((t) => ({
        trainNo: t.trainNo,
        departure: t.departure,
        economy: t.economy,
        firstClass: t.firstClass,
      }));

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
                <p className="text-sm text-muted-foreground">Loading availability…</p>
              </div>
            ) : trains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                  <Clock className="size-5 text-muted-foreground/50" />
                </div>
                <p className="font-semibold text-foreground">No trains listed</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-[180px]">
                  Availability may not be published yet for this date.
                </p>
              </div>
            ) : (
              trains.map((train) => (
                <TrainCard key={train.trainNo} {...train} bookingUrl={bookingUrl} />
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
