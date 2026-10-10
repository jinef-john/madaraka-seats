import type { Session } from "httpcloak";

import type {
  MonthDay,
  MonthDayTrain,
  SelectOption,
  StandardTrainResult,
  TrainSearchResult,
} from "../types/train.js";
import { METICKETS_BASE_URL, lastBookableDate, runsOn } from "./train-config.js";
import { createSession } from "./http-client.js";
import { premiumDayTrains, premiumSearch } from "./premium-api.js";

// ---------------------------------------------------------------------------
// Upstream path constants
// ---------------------------------------------------------------------------

const STANDARD_SEARCH_PATH = "/search-view-results.php";
const STANDARD_BOOKING_PATH = "/booking-details.php";
const STANDARD_REVIEW_PATH = "/review-and-pay.php";

// ---------------------------------------------------------------------------
// String / HTML helpers
// ---------------------------------------------------------------------------

function normalizeSpace(value: unknown): string {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return normalizeSpace(value)
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatDateForSite(dateValue: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    throw new Error(`Invalid date '${dateValue}'. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateValue.split("-");
  return `${month}/${day}/${year}`;
}

function buildFetchUrl(path: string, params: Record<string, string>): string {
  const url = new URL(path, METICKETS_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// HTML parsing
// ---------------------------------------------------------------------------

export function extractCsrf(html: string): string | null {
  const match = html.match(
    /name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i,
  );
  return match ? match[1] : null;
}

export function extractOptions(html: string): SelectOption[] {
  return [
    ...html.matchAll(
      /<option[^>]*value=['"]?([^'">]*)['"]?[^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map(([, value, label]) => ({
      value: decodeHtml(value),
      label: decodeHtml(label.replace(/<[^>]+>/g, " ")),
    }))
    .filter((o) => o.value && o.label && o.label.toLowerCase() !== "select...");
}

export function extractNamedSelectOptions(
  html: string,
  selectName: string,
): SelectOption[] {
  const pattern = new RegExp(
    `<select[^>]+name=["']${escapeRegExp(selectName)}["'][^>]*>([\\s\\S]*?)<\\/select>`,
    "i",
  );
  const match = html.match(pattern);
  return match ? extractOptions(match[1]) : [];
}

export function findOption(
  options: SelectOption[],
  target: string,
): SelectOption | null {
  const want = normalizeSpace(target).toLowerCase();
  return (
    options.find((o) => o.label.toLowerCase() === want) ??
    options.find((o) => o.value.toLowerCase() === want) ??
    options.find((o) => o.label.toLowerCase().includes(want)) ??
    options.find(
      (o) => o.label.length >= 4 && want.startsWith(o.label.toLowerCase()),
    ) ??
    null
  );
}

function extractForms(html: string, actionName: string): string[] {
  const pattern = new RegExp(
    `<form[^>]+action=["'][^"']*${escapeRegExp(actionName)}[^"']*["'][^>]*>([\\s\\S]*?)<\\/form>`,
    "gi",
  );
  return [...html.matchAll(pattern)].map((m) => m[1]);
}

function extractInputs(fragment: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const m of fragment.matchAll(
    /<input[^>]+name=["']([^"']+)["'][^>]*>/gi,
  )) {
    const valueMatch = m[0].match(/value=["']([^"']*)["']/i);
    fields[m[1]] = decodeHtml(valueMatch ? valueMatch[1] : "");
  }
  return fields;
}

function extractSelectOptions(
  fragment: string,
  selectName: string,
): SelectOption[] {
  const pattern = new RegExp(
    `<select[^>]+name=["']${escapeRegExp(selectName)}["'][^>]*>([\\s\\S]*?)<\\/select>`,
    "i",
  );
  const match = fragment.match(pattern);
  if (!match) return [];
  return [
    ...match[1].matchAll(
      /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map(([, value, label]) => ({
      value: decodeHtml(value),
      label: decodeHtml(label.replace(/<[^>]+>/g, " ")),
    }))
    .filter((o) => o.value && o.label);
}

function extractHeading(fragment: string): string {
  const match = fragment.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function to24h(time12: string): string {
  const m = time12.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return time12;
  let h = parseInt(m[1], 10);
  if (m[3].toLowerCase() === "pm" && h !== 12) h += 12;
  if (m[3].toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function extractVisibleTimes(fragment: string): {
  departure: string;
  arrival: string;
} {
  const dep = fragment.match(/Departure:\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
  const arr = fragment.match(/Arrival:\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
  return {
    departure: dep ? to24h(dep[1]) : "",
    arrival: arr ? to24h(arr[1]) : "",
  };
}

// ---------------------------------------------------------------------------
// "Fully Booked" / sold-out detection
// ---------------------------------------------------------------------------

// The waiting-list form is now part of every page template, so only the
// explicit message counts.
function isSoldOut(html: string): boolean {
  return /fully\s+booked/i.test(html);
}

function departureTimeFromSlot(label: string): string {
  const m = label.match(/(\d{1,2})[.:]\s*(\d{2})\s*(am|pm)/i);
  if (m) return to24h(`${m[1]}:${m[2]} ${m[3]}`);
  return "";
}

// ---------------------------------------------------------------------------
// Result parsers  (queriedDeparture/statusCode/protocol filled in later)
// ---------------------------------------------------------------------------

type PartialStandard = Omit<
  StandardTrainResult,
  "queriedDeparture" | "queriedDepartureLabel" | "statusCode" | "protocol"
>;

function parseStandardResults(html: string): PartialStandard[] {
  return extractForms(html, "booking-details.php")
    .map((fragment): PartialStandard => {
      const f = extractInputs(fragment);
      const visible = extractVisibleTimes(fragment);
      return {
        resultType: "standard",
        title: extractHeading(fragment),
        trainId: f.idTrain || "",
        trainNo: f.train || "",
        from: f.from || f.leaving_from || "",
        to: f.to || f.going_to || "",
        departure: f.departure || visible.departure,
        arrival: f.arrival || visible.arrival,
        fare: {
          economyAdult: f.ecoAdult || "",
          economyChild: f.ecoChild || "",
          firstAdult: f.firstAdult || "",
          firstChild: f.firstChild || "",
        },
        openSeats: {
          economy: f.ecoOpen || "",
          firstClass: f.firstOpen || "",
        },
        coachOptions: extractSelectOptions(fragment, "coach"),
        bookingEndpoint: `${METICKETS_BASE_URL}${STANDARD_BOOKING_PATH}`,
        reviewEndpoint: `${METICKETS_BASE_URL}${STANDARD_REVIEW_PATH}`,
      };
    })
    .filter((t) => t.trainId || t.trainNo);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upstream network calls
// ---------------------------------------------------------------------------

type Schedule = "express" | "phase2" | "inter_county";

async function loadHome(
  session: Session,
): Promise<{ csrfToken: string; html: string }> {
  const response = await session.get(METICKETS_BASE_URL);
  const csrfToken = extractCsrf(response.text);
  if (!csrfToken) {
    throw new Error("Could not find csrf_token on the booking home page.");
  }
  return { csrfToken, html: response.text };
}

async function loadTerminals(
  session: Session,
  schedule: Schedule,
): Promise<SelectOption[]> {
  const html = (
    await session.get(
      buildFetchUrl("/fetch.php", { type: "terminals", schedule_type: schedule }),
    )
  ).text;
  return extractOptions(html);
}

async function loadDestinations(
  session: Session,
  schedule: Schedule,
  terminalId: string,
): Promise<SelectOption[]> {
  const html = (
    await session.get(
      buildFetchUrl("/fetch.php", {
        type: "destinations",
        schedule_type: schedule,
        terminal_id: terminalId,
      }),
    )
  ).text;
  return extractOptions(html);
}

interface LegacySession {
  session: Session;
  csrfToken: string;
}

// A rejected search (stale CSRF, server under load) redirects to index.php
// with a 200, which must not be mistaken for an empty or sold-out result.
async function submitSearch(
  ctx: LegacySession,
  config: {
    schedule: Schedule;
    fromId: string;
    toId: string;
    date: string;
    departure: string;
  },
) {
  for (let attempt = 0; ; attempt++) {
    const response = await ctx.session.post(
      `${METICKETS_BASE_URL}${STANDARD_SEARCH_PATH}`,
      {
        data: {
          csrf_token: ctx.csrfToken,
          schedule_type: config.schedule,
          terminal_id: config.fromId,
          destination_id: config.toId,
          "travel-date": formatDateForSite(config.date),
          depature_time: config.departure,
        },
      },
    );
    if (response.url.includes(STANDARD_SEARCH_PATH)) return response;
    if (attempt >= 1) throw new Error(`search rejected (${response.url})`);
    ctx.csrfToken = (await loadHome(ctx.session)).csrfToken;
  }
}

interface ResolvedRoute {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  terminals: SelectOption[];
  destinations: SelectOption[];
  departures: SelectOption[];
  departuresToQuery: SelectOption[];
}

async function resolveRoute(
  session: Session,
  homeHtml: string,
  schedule: Schedule,
  from: string,
  to: string,
): Promise<ResolvedRoute> {
  const terminals = await loadTerminals(session, schedule);
  const departures = extractNamedSelectOptions(homeHtml, "depature_time");

  const fromOption = findOption(terminals, from);
  if (!fromOption) {
    throw new Error(`Departure terminal '${from}' was not found.`);
  }
  const destinations = await loadDestinations(session, schedule, fromOption.value);
  const toOption = findOption(destinations, to);
  if (!toOption) {
    throw new Error(`Destination '${to}' was not found for ${fromOption.label}.`);
  }

  return {
    fromId: fromOption.value,
    toId: toOption.value,
    fromLabel: fromOption.label,
    toLabel: toOption.label,
    terminals,
    destinations,
    departures,
    departuresToQuery: uniqueBy(
      [{ value: "", label: "<blank>" }, ...departures],
      (o) => o.value,
    ),
  };
}

async function queryLegacyDay(
  ctx: LegacySession,
  schedule: Schedule,
  route: ResolvedRoute,
  date: string,
  departuresToQuery: SelectOption[],
): Promise<{
  results: StandardTrainResult[];
  soldOutSlots: string[];
  failedSlots: number;
}> {
  const results: StandardTrainResult[] = [];
  const soldOutSlots: string[] = [];
  let failedSlots = 0;
  const fromLower = route.fromLabel.toLowerCase();
  const toLower = route.toLabel.toLowerCase();

  for (const option of departuresToQuery) {
    try {
      const response = await submitSearch(ctx, {
        schedule,
        fromId: route.fromId,
        toId: route.toId,
        date,
        departure: option.value,
      });

      const matching = parseStandardResults(response.text).filter(
        (r) =>
          r.from.toLowerCase() === fromLower && r.to.toLowerCase() === toLower,
      );

      if (
        matching.length === 0 &&
        option.value &&
        schedule !== "phase2" &&
        isSoldOut(response.text)
      ) {
        soldOutSlots.push(option.value);
      }

      for (const result of matching) {
        results.push({
          ...result,
          queriedDeparture: option.value || "<blank>",
          queriedDepartureLabel: option.label || option.value || "<blank>",
          statusCode: response.statusCode,
          protocol: response.protocol,
        });
      }
    } catch {
      failedSlots++;
    }
  }

  return { results, soldOutSlots, failedSlots };
}

function soldOutDeparture(
  slot: string,
  departuresToQuery: SelectOption[],
): { dep: string; label: string } | null {
  const depOpt = departuresToQuery.find((o) => o.value === slot);
  const dep = depOpt ? departureTimeFromSlot(depOpt.label) : "";
  return dep ? { dep, label: depOpt?.label || slot } : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RoutesData {
  terminals: SelectOption[];
  destinations: SelectOption[];
  departures: SelectOption[];
}

export interface SearchData extends RoutesData {
  results: TrainSearchResult[];
  fullyBooked?: boolean;
}

export interface SearchOptions {
  schedule: Schedule;
  from: string;
  to: string;
  date: string;
  departure?: string;
  allTrains?: boolean;
}

export async function scrapeRoutes(
  schedule: Schedule,
  from?: string,
): Promise<RoutesData> {
  const session = createSession();
  try {
    const home = await loadHome(session);
    const terminals = await loadTerminals(session, schedule);
    const departures = extractNamedSelectOptions(home.html, "depature_time");

    const fromOption = from
      ? findOption(terminals, from)
      : (terminals[0] ?? null);
    if (!fromOption) {
      throw new Error(`Departure terminal '${from}' was not found.`);
    }

    const destinations = await loadDestinations(
      session,
      schedule,
      fromOption.value,
    );

    return { terminals, destinations, departures };
  } finally {
    session.close();
  }
}

export async function scrapeSearch(
  options: SearchOptions,
): Promise<SearchData> {
  if (!runsOn(options.schedule, options.date)) {
    return { terminals: [], destinations: [], departures: [], results: [] };
  }

  const premiumPromise = premiumSearch(
    options.schedule,
    options.from,
    options.to,
    options.date,
  ).catch(() => []);

  const session = createSession();
  try {
    const home = await loadHome(session);
    const route = await resolveRoute(
      session,
      home.html,
      options.schedule,
      options.from,
      options.to,
    );

    const departuresToQuery =
      options.departure && !options.allTrains
        ? [{ value: options.departure, label: options.departure }]
        : route.departuresToQuery;

    const legacy = await queryLegacyDay(
      { session, csrfToken: home.csrfToken },
      options.schedule,
      route,
      options.date,
      departuresToQuery,
    );

    const results: TrainSearchResult[] = uniqueBy(
      legacy.results,
      (r) =>
        `${r.trainId}|${r.trainNo}|${r.departure}|${r.arrival}|${r.from}|${r.to}`,
    );
    results.push(...(await premiumPromise));

    const fullyBooked = legacy.soldOutSlots.length > 0;

    if (fullyBooked && options.schedule === "express") {
      const foundDepartures = new Set(
        results.map((r) => extractTime(r.departure)),
      );
      for (const slot of legacy.soldOutSlots) {
        const sold = soldOutDeparture(slot, departuresToQuery);
        if (!sold || foundDepartures.has(sold.dep)) continue;
        results.push({
          resultType: "standard",
          title: "",
          trainId: "",
          trainNo: "",
          from: route.fromLabel,
          to: route.toLabel,
          departure: sold.dep,
          arrival: "",
          fare: {
            economyAdult: "",
            economyChild: "",
            firstAdult: "",
            firstChild: "",
          },
          openSeats: { economy: "0", firstClass: "0" },
          coachOptions: [],
          bookingEndpoint: "",
          reviewEndpoint: "",
          queriedDeparture: slot,
          queriedDepartureLabel: sold.label,
          statusCode: 200,
          protocol: "",
        });
      }
    }

    return {
      terminals: route.terminals,
      destinations: route.destinations,
      departures: route.departures,
      results,
      fullyBooked,
    };
  } finally {
    session.close();
  }
}

// ---------------------------------------------------------------------------
// Month scraper
// ---------------------------------------------------------------------------

function extractTime(datetime: string): string {
  const ampm = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (ampm) return to24h(datetime);
  const match = datetime.match(/\d{2}:\d{2}/);
  return match ? match[0] : datetime;
}

function toMonthDayTrain(result: StandardTrainResult): MonthDayTrain {
  return {
    trainNo: result.trainNo,
    departure: extractTime(result.departure),
    economy: parseInt(result.openSeats.economy, 10) || 0,
    firstClass: parseInt(result.openSeats.firstClass, 10) || 0,
    premium: 0,
  };
}

function mergeTrains(trains: MonthDayTrain[]): MonthDayTrain[] {
  const byDep = new Map<string, MonthDayTrain>();
  for (const t of trains) {
    const existing = byDep.get(t.departure);
    if (existing) {
      existing.economy = existing.economy || t.economy;
      existing.firstClass = existing.firstClass || t.firstClass;
      existing.premium = existing.premium || t.premium;
      if (!existing.trainNo) existing.trainNo = t.trainNo;
    } else {
      byDep.set(t.departure, { ...t });
    }
  }
  return [...byDep.values()];
}

// Scrape a single day using an already-established session and CSRF token.
// Departure queries run sequentially within the session to stay friendly to
// PHP's per-session file lock (concurrent requests sharing the same
// PHPSESSID are serialised server-side anyway).
async function scrapeDayWithSession(
  ctx: LegacySession,
  schedule: Schedule,
  route: ResolvedRoute,
  from: string,
  to: string,
  date: string,
): Promise<MonthDay> {
  const [legacy, premium] = await Promise.all([
    queryLegacyDay(ctx, schedule, route, date, route.departuresToQuery),
    premiumDayTrains(schedule, from, to, date).catch(() => []),
  ]);
  if (legacy.failedSlots > 0) {
    throw new Error(`${date}: ${legacy.failedSlots} departure slot(s) failed`);
  }

  const trains = mergeTrains([
    ...uniqueBy(
      legacy.results,
      (r) => `${r.trainId}|${r.trainNo}|${r.departure}`,
    ).map(toMonthDayTrain),
    ...premium,
  ]);

  const fullyBooked = legacy.soldOutSlots.length > 0;

  if (fullyBooked && schedule === "express") {
    const foundDepartures = new Set(trains.map((t) => t.departure));
    for (const slot of legacy.soldOutSlots) {
      const sold = soldOutDeparture(slot, route.departuresToQuery);
      if (sold && !foundDepartures.has(sold.dep)) {
        trains.push({
          trainNo: "",
          departure: sold.dep,
          economy: 0,
          firstClass: 0,
          premium: 0,
        });
      }
    }
  }

  return { date, trains, fullyBooked };
}

// How many parallel PHP sessions to open for a month scrape.
const MONTH_CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY ?? "20", 10);

/**
 * Scrape a full month using multiple parallel sessions.
 *
 * `onDay` is called once per day as each result arrives (potentially out of
 * calendar order since workers race). Callers that need sorted output should
 * sort after all calls have settled (see `scrapeMonth`).
 */
export async function scrapeMonthStreaming(
  schedule: Schedule,
  from: string,
  to: string,
  year: number,
  month: number,
  onDay: (day: MonthDay) => void,
  signal?: AbortSignal,
): Promise<void> {
  let route: ResolvedRoute;
  {
    const setup = createSession();
    try {
      const home = await loadHome(setup);
      route = await resolveRoute(setup, home.html, schedule, from, to);
    } finally {
      setup.close();
    }
  }

  // Each worker opens its own homepage -> own PHPSESSID -> no session lock contention.
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const horizonStr = lastBookableDate(schedule);
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }).filter(
    (date) => date >= todayStr && date <= horizonStr && runsOn(schedule, date),
  );

  const chunkSize = Math.ceil(dates.length / MONTH_CONCURRENCY);
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const worker = createSession();
      try {
        const ctx: LegacySession = {
          session: worker,
          csrfToken: (await loadHome(worker)).csrfToken,
        };

        for (const date of chunk) {
          if (signal?.aborted) break;

          try {
            onDay(
              await scrapeDayWithSession(
                ctx,
                schedule,
                route,
                from,
                to,
                date,
              ),
            );
          } catch {
            // Skipped days keep their previously cached value.
          }

          worker.refresh();
        }
      } finally {
        worker.close();
      }
    }),
  );
}

/**
 * Blocking version — collects all days and returns them sorted.
 */
export async function scrapeMonth(
  schedule: Schedule,
  from: string,
  to: string,
  year: number,
  month: number,
): Promise<MonthDay[]> {
  const days: MonthDay[] = [];
  await scrapeMonthStreaming(schedule, from, to, year, month, (day) =>
    days.push(day),
  );
  return days.sort((a, b) => a.date.localeCompare(b.date));
}
