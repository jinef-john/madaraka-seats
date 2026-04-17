import { Session } from "httpcloak";

import type {
  MonthDay,
  MonthDayTrain,
  PremiumSeatGroup,
  PremiumTrainResult,
  SelectOption,
  StandardTrainResult,
  TrainSearchResult,
} from "@/types/train";
import { METICKETS_BASE_URL } from "@/utils/train-config";

// ---------------------------------------------------------------------------
// Upstream path constants
// ---------------------------------------------------------------------------

const STANDARD_SEARCH_PATH = "/search-view-results.php";
const PREMIUM_SEARCH_PATH = "/search-view-results-return.php";
const STANDARD_BOOKING_PATH = "/booking-details.php";
const PREMIUM_BOOKING_PATH = "/booking-details-premium.php";
const STANDARD_REVIEW_PATH = "/review-and-pay.php";
const PREMIUM_REVIEW_PATH = "/review-and-pay-premium.php";

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

// ---------------------------------------------------------------------------
// PHP serialization decoder
// ---------------------------------------------------------------------------

function parsePhpSerialized(input: string): unknown {
  let offset = 0;

  function readUntil(char: string): string {
    const end = input.indexOf(char, offset);
    if (end === -1)
      throw new Error(`Unterminated token while looking for '${char}'`);
    const value = input.slice(offset, end);
    offset = end + 1;
    return value;
  }

  function readValue(): unknown {
    const type = input[offset];
    offset += 2;

    if (type === "N") return null;
    if (type === "i") return Number.parseInt(readUntil(";"), 10);
    if (type === "d") return Number.parseFloat(readUntil(";"));
    if (type === "b") return readUntil(";") === "1";

    if (type === "s") {
      const length = Number.parseInt(readUntil(":"), 10);
      if (input[offset] !== '"')
        throw new Error("Invalid serialized string start");
      offset += 1;
      const value = input.slice(offset, offset + length);
      offset += length;
      if (input[offset] !== '"' || input[offset + 1] !== ";")
        throw new Error("Invalid serialized string end");
      offset += 2;
      return value;
    }

    if (type === "a") {
      const count = Number.parseInt(readUntil(":"), 10);
      if (input[offset] !== "{")
        throw new Error("Invalid serialized array start");
      offset += 1;
      const entries: [unknown, unknown][] = [];
      for (let i = 0; i < count; i++) {
        entries.push([readValue(), readValue()]);
      }
      if (input[offset] !== "}")
        throw new Error("Invalid serialized array end");
      offset += 1;
      const isDense = entries.every(([k], i) => Number(k) === i);
      if (isDense) return entries.map(([, v]) => v);
      return Object.fromEntries(entries as [string, unknown][]);
    }

    throw new Error(`Unsupported PHP serialized type '${type}'`);
  }

  return readValue();
}

function parsePremiumSeatBlob(encoded: string): PremiumSeatGroup[] {
  if (!encoded) return [];
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = parsePhpSerialized(decoded);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Record<string, unknown>[]).map((coach) => ({
      id: coach.id as string | number | undefined,
      name: coach.name as string | undefined,
      availableSeats: coach.available_seats as string | number | undefined,
      seats: Array.isArray(coach.seats)
        ? (coach.seats as string[])
        : Object.values((coach.seats as Record<string, string>) ?? {}),
      bookedSeats: Array.isArray(coach.booked_seats)
        ? (coach.booked_seats as string[])
        : Object.values((coach.booked_seats as Record<string, string>) ?? {}),
    }));
  } catch (error) {
    return [
      { decodeError: (error as Error).message, seats: [], bookedSeats: [] },
    ];
  }
}

// ---------------------------------------------------------------------------
// Result parsers  (queriedDeparture/statusCode/protocol filled in later)
// ---------------------------------------------------------------------------

type PartialStandard = Omit<
  StandardTrainResult,
  "queriedDeparture" | "queriedDepartureLabel" | "statusCode" | "protocol"
>;
type PartialPremium = Omit<
  PremiumTrainResult,
  "queriedDeparture" | "queriedDepartureLabel" | "statusCode" | "protocol"
>;

function parseStandardResults(html: string): PartialStandard[] {
  return extractForms(html, "booking-details.php")
    .map((fragment): PartialStandard => {
      const f = extractInputs(fragment);
      return {
        resultType: "standard",
        title: extractHeading(fragment),
        trainId: f.idTrain || "",
        trainNo: f.train || "",
        from: f.from || f.leaving_from || "",
        to: f.to || f.going_to || "",
        departure: f.departure || "",
        arrival: f.arrival || "",
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

function parsePremiumResults(html: string): PartialPremium[] {
  return extractForms(html, "booking-details-premium.php")
    .map((fragment): PartialPremium => {
      const f = extractInputs(fragment);
      return {
        resultType: "premium",
        title: extractHeading(fragment),
        trainId: f.idTrain || f.schedule_id || "",
        trainNo: f.train || "",
        from: f.from || f.leaving_from || "",
        to: f.to || f.going_to || "",
        departure: f.departure || "",
        arrival: f.arrival || "",
        coach: f.coach || "",
        fares: {
          premiumAdult: f.premiumAdult || "",
          premiumChild: f.premiumChild || "",
        },
        seatGroups: parsePremiumSeatBlob(f.seats),
        bookingEndpoint: `${METICKETS_BASE_URL}${PREMIUM_BOOKING_PATH}`,
        reviewEndpoint: `${METICKETS_BASE_URL}${PREMIUM_REVIEW_PATH}`,
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
// Session factory
// ---------------------------------------------------------------------------

function createSession(): Session {
  const session = new Session({
    preset: "chrome-latest",
    timeout: 30,
    httpVersion: "auto",
    allowRedirects: true,
    retry: 2,
  });
  session.headers["Accept-Language"] = "en-US,en;q=0.9";
  return session;
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
): Promise<{ basePath: string; terminals: SelectOption[] }> {
  const basePath =
    schedule === "inter_county" ? "/fetch-premium.php" : "/fetch.php";
  const html = (
    await session.get(
      buildFetchUrl(basePath, {
        type: "terminals",
        schedule_type: schedule,
      }),
    )
  ).text;
  return { basePath, terminals: extractOptions(html) };
}

async function loadDestinations(
  session: Session,
  basePath: string,
  schedule: Schedule,
  terminalId: string,
): Promise<SelectOption[]> {
  const html = (
    await session.get(
      buildFetchUrl(basePath, {
        type: "destinations",
        schedule_type: schedule,
        terminal_id: terminalId,
      }),
    )
  ).text;
  return extractOptions(html);
}

async function submitSearch(
  session: Session,
  csrfToken: string,
  config: {
    schedule: Schedule;
    fromId: string;
    toId: string;
    date: string;
    departure: string;
  },
) {
  if (config.schedule === "inter_county") {
    return session.post(`${METICKETS_BASE_URL}${PREMIUM_SEARCH_PATH}`, {
      data: {
        csrf_token: csrfToken,
        trip_type: "one_way",
        premium_train_type: config.schedule,
        premium_terminal_id: config.fromId,
        premium_destination_id: config.toId,
        premium_travel_date: formatDateForSite(config.date),
        premium_depature_time: config.departure,
      },
    });
  }
  return session.post(`${METICKETS_BASE_URL}${STANDARD_SEARCH_PATH}`, {
    data: {
      csrf_token: csrfToken,
      schedule_type: config.schedule,
      terminal_id: config.fromId,
      destination_id: config.toId,
      "travel-date": formatDateForSite(config.date),
      depature_time: config.departure,
    },
  });
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
    const { basePath, terminals } = await loadTerminals(session, schedule);

    const departures = extractNamedSelectOptions(
      home.html,
      schedule === "inter_county" ? "premium_depature_time" : "depature_time",
    );

    const fromOption = from
      ? findOption(terminals, from)
      : (terminals[0] ?? null);
    if (!fromOption) {
      throw new Error(`Departure terminal '${from}' was not found.`);
    }

    const destinations = await loadDestinations(
      session,
      basePath,
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
  const session = createSession();
  try {
    const home = await loadHome(session);
    const { basePath, terminals } = await loadTerminals(
      session,
      options.schedule,
    );

    const departures = extractNamedSelectOptions(
      home.html,
      options.schedule === "inter_county"
        ? "premium_depature_time"
        : "depature_time",
    );

    const fromOption = findOption(terminals, options.from);
    if (!fromOption) {
      throw new Error(`Departure terminal '${options.from}' was not found.`);
    }

    const destinations = await loadDestinations(
      session,
      basePath,
      options.schedule,
      fromOption.value,
    );

    const toOption = findOption(destinations, options.to);
    if (!toOption) {
      throw new Error(
        `Destination '${options.to}' was not found for ${fromOption.label}.`,
      );
    }

    const departuresToQuery =
      options.departure && !options.allTrains
        ? [{ value: options.departure, label: options.departure }]
        : uniqueBy(
            [{ value: "", label: "<blank>" }, ...departures],
            (o) => o.value,
          );

    const allResults: TrainSearchResult[] = [];

    for (const option of departuresToQuery) {
      const response = await submitSearch(session, home.csrfToken, {
        schedule: options.schedule,
        fromId: fromOption.value,
        toId: toOption.value,
        date: options.date,
        departure: option.value,
      });

      const parsed =
        options.schedule === "inter_county"
          ? parsePremiumResults(response.text)
          : parseStandardResults(response.text);

      for (const result of parsed) {
        allResults.push({
          ...result,
          queriedDeparture: option.value || "<blank>",
          queriedDepartureLabel: option.label || option.value || "<blank>",
          statusCode: response.statusCode,
          protocol: response.protocol,
        } as TrainSearchResult);
      }
    }

    const results = uniqueBy(
      allResults,
      (r) =>
        `${r.trainId}|${r.trainNo}|${r.departure}|${r.arrival}|${r.from}|${r.to}`,
    );

    return { terminals, destinations, departures, results };
  } finally {
    session.close();
  }
}

// ---------------------------------------------------------------------------
// Month scraper
// ---------------------------------------------------------------------------

function extractTime(datetime: string): string {
  const match = datetime.match(/\d{2}:\d{2}/);
  return match ? match[0] : datetime;
}

function toMonthDayTrain(result: TrainSearchResult): MonthDayTrain {
  if (result.resultType === "standard") {
    return {
      trainNo: result.trainNo,
      departure: extractTime(result.departure),
      economy: parseInt(result.openSeats.economy, 10) || 0,
      firstClass: parseInt(result.openSeats.firstClass, 10) || 0,
    };
  }
  // inter_county: sum available seats across all coaches
  const total = result.seatGroups.reduce((sum, g) => {
    if (g.decodeError) return sum;
    const n =
      typeof g.availableSeats === "number"
        ? g.availableSeats
        : parseInt(String(g.availableSeats ?? "0"), 10) || 0;
    return sum + n;
  }, 0);
  return {
    trainNo: result.trainNo,
    departure: extractTime(result.departure),
    economy: total,
    firstClass: 0,
  };
}

// Scrape a single day using an already-established session and CSRF token.
// Departure queries run sequentially within the session to stay friendly to
// PHP's per-session file lock (concurrent requests sharing the same
// PHPSESSID are serialised server-side anyway).
async function scrapeDayWithSession(
  session: Session,
  csrfToken: string,
  config: {
    schedule: Schedule;
    fromId: string;
    toId: string;
    date: string;
    departuresToQuery: SelectOption[];
  },
): Promise<MonthDay> {
  const dayResults: TrainSearchResult[] = [];

  for (const option of config.departuresToQuery) {
    try {
      const response = await submitSearch(session, csrfToken, {
        schedule: config.schedule,
        fromId: config.fromId,
        toId: config.toId,
        date: config.date,
        departure: option.value,
      });

      const parsed =
        config.schedule === "inter_county"
          ? parsePremiumResults(response.text)
          : parseStandardResults(response.text);

      for (const result of parsed) {
        dayResults.push({
          ...result,
          queriedDeparture: option.value || "<blank>",
          queriedDepartureLabel: option.label || option.value || "<blank>",
          statusCode: response.statusCode,
          protocol: response.protocol,
        } as TrainSearchResult);
      }
    } catch {
      // A single departure-slot failure should not kill the whole day.
    }
  }

  const trains = uniqueBy(
    dayResults,
    (r) => `${r.trainId}|${r.trainNo}|${r.departure}`,
  ).map(toMonthDayTrain);

  return { date: config.date, trains };
}

// How many parallel PHP sessions to open for a month scrape.
// Each session gets its own PHPSESSID so PHP does not serialise requests
// across workers via its session file lock. Benchmarks show diminishing
// returns beyond 14 independent sessions; 14 workers × ceil(31/14)=3 days
// each brings a 31-day month down to ~10-12 s.
// NOTE: do NOT use httpcloak fork() here — fork() shares the cookie jar, so
// all forked tabs end up with the same PHPSESSID and PHP serialises them.
const MONTH_CONCURRENCY = 14;

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
  // Phase 1: one setup session to resolve terminal / destination IDs and the
  // list of departure slots. Single CSRF request — cheap.
  let fromId: string;
  let toId: string;
  let departuresToQuery: SelectOption[];

  {
    const setup = createSession();
    try {
      await setup.warmup(METICKETS_BASE_URL);
      const home = await loadHome(setup);
      const { basePath, terminals } = await loadTerminals(setup, schedule);

      const departures = extractNamedSelectOptions(
        home.html,
        schedule === "inter_county"
          ? "premium_depature_time"
          : "depature_time",
      );

      const fromOption = findOption(terminals, from);
      if (!fromOption) {
        throw new Error(`Departure terminal '${from}' was not found.`);
      }

      const destinations = await loadDestinations(
        setup,
        basePath,
        schedule,
        fromOption.value,
      );

      const toOption = findOption(destinations, to);
      if (!toOption) {
        throw new Error(
          `Destination '${to}' was not found for ${fromOption.label}.`,
        );
      }

      fromId = fromOption.value;
      toId = toOption.value;
      departuresToQuery =
        departures.length > 0
          ? departures
          : [{ value: "", label: "<blank>" }];
    } finally {
      setup.close();
    }
  }

  // Phase 2: distribute dates across MONTH_CONCURRENCY worker sessions.
  // Each worker opens its OWN homepage → own PHPSESSID → no session lock
  // contention. Within each worker, days are processed sequentially.
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dates = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }).filter((date) => date >= todayStr);

  const chunkSize = Math.ceil(dates.length / MONTH_CONCURRENCY);
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const worker = createSession();
      try {
        const { csrfToken } = await loadHome(worker);

        for (const date of chunk) {
          if (signal?.aborted) break;

          try {
            const day = await scrapeDayWithSession(worker, csrfToken, {
              schedule,
              fromId,
              toId,
              date,
              departuresToQuery,
            });
            onDay(day);
          } catch {
            // Emit an empty day rather than aborting the whole stream.
            onDay({ date, trains: [] });
          }
          // Simulate browser page refresh: closes TCP/QUIC connections but
          // keeps TLS session cache so the next day's requests look like a
          // returning visitor (0-RTT resumption).
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
 * Used by the cached `/api/trains/month` route handler.
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

