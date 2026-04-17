import { Session } from "httpcloak";

import type {
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
