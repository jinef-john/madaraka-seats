import { sharedSession } from "./http-client.js";
import type {
  MonthDayTrain,
  PremiumSeat,
  PremiumSeatGroup,
  PremiumTrainResult,
  TrainType,
} from "../types/train.js";

export const PREMIUM_BASE_URL = "https://premium.metickets.krc.co.ke";
const API_BASE = `${PREMIUM_BASE_URL}/console/api/rest`;
export const PREMIUM_BOOKING_URL = `${PREMIUM_BASE_URL}/booking`;

const STATIONS_TTL_MS = 60 * 60 * 1000;

interface ApiEnvelope<T> {
  status: "success" | "error";
  message?: string;
  data: T;
}

interface ApiStation {
  id: number;
  name: string;
}

interface ApiTrip {
  id: number;
  ref: string;
  code: string;
  title: string;
  vehicle_route_id: number;
  departs_at: string;
  arrives_at: string;
  availability: {
    total_available: number;
    total_seats: number;
    classes: { id: number; name: string; available: number; total: number }[];
  };
}

interface ApiLayout {
  layout_id: number;
  layout_name: string;
  seat_class_id: number;
  deck_number: number;
  price: number;
  passenger_prices: Record<string, number>;
  total_seats: number;
  seats: {
    number: string;
    row: number;
    col: number;
    status: string;
  }[];
  booked_seats: string[];
  closed_seats: string[];
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await sharedSession().get(url.toString(), {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: PREMIUM_BOOKING_URL,
    },
  });
  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(res.text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`premium api ${path} -> ${res.statusCode}: non-JSON response`);
  }
  if (res.statusCode >= 400 || body.status !== "success") {
    throw new Error(
      `premium api ${path} -> ${res.statusCode}: ${body.message ?? "error"}`,
    );
  }
  return body.data;
}

let stationsCache: { at: number; stations: ApiStation[] } | null = null;

async function getStations(): Promise<ApiStation[]> {
  if (stationsCache && Date.now() - stationsCache.at < STATIONS_TTL_MS) {
    return stationsCache.stations;
  }
  const stations = await apiGet<ApiStation[]>("/booking-info/stations");
  stationsCache = { at: Date.now(), stations };
  return stations;
}

function stationKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bterminus\b/g, "")
    .replace(/[^a-z]/g, "");
}

export async function resolveStationId(name: string): Promise<number | null> {
  const want = stationKey(name);
  if (!want) return null;
  const stations = await getStations();
  const match =
    stations.find((s) => stationKey(s.name) === want) ??
    stations.find((s) => {
      const k = stationKey(s.name);
      return k.startsWith(want) || want.startsWith(k);
    });
  return match?.id ?? null;
}

function tripSchedule(trip: ApiTrip): TrainType {
  return /EXPRESS/i.test(trip.ref) ? "express" : "inter_county";
}

function localDateTime(iso: string): string {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : iso;
}

async function searchTrips(
  schedule: TrainType,
  from: string,
  to: string,
  date: string,
): Promise<{ trips: ApiTrip[]; fromId: number; toId: number } | null> {
  if (schedule === "phase2") return null;
  const [fromId, toId] = await Promise.all([
    resolveStationId(from),
    resolveStationId(to),
  ]);
  if (!fromId || !toId) return null;
  const trips = await apiGet<ApiTrip[]>("/booking-info/search-trips", {
    from: fromId,
    to: toId,
    date,
  });
  return {
    trips: trips.filter((t) => tripSchedule(t) === schedule),
    fromId,
    toId,
  };
}

async function getLayouts(
  tripId: number,
  fromId: number,
  toId: number,
  date: string,
): Promise<ApiLayout[]> {
  return apiGet<ApiLayout[]>(`/booking-info/trips/${tripId}/layouts`, {
    from: fromId,
    to: toId,
    date,
    booking_type: "oneway",
  });
}

function toSeatGroup(layout: ApiLayout): PremiumSeatGroup {
  const booked = new Set(layout.booked_seats);
  const closed = new Set(layout.closed_seats);
  const seatMap: PremiumSeat[] = layout.seats.map((s) => ({
    number: s.number,
    row: s.row,
    col: s.col,
    status:
      booked.has(s.number) || closed.has(s.number)
        ? "booked"
        : s.status === "available"
          ? "available"
          : "booked",
  }));
  return {
    id: layout.layout_id,
    name: layout.layout_name,
    availableSeats: seatMap.filter((s) => s.status === "available").length,
    seats: layout.seats.map((s) => s.number),
    bookedSeats: [...new Set([...layout.booked_seats, ...layout.closed_seats])],
    deck: layout.deck_number,
    seatMap,
  };
}

export async function premiumDayTrains(
  schedule: TrainType,
  from: string,
  to: string,
  date: string,
): Promise<MonthDayTrain[]> {
  const found = await searchTrips(schedule, from, to, date);
  if (!found) return [];
  return found.trips.map((t) => ({
    trainNo: t.code,
    departure: localDateTime(t.departs_at).slice(11, 16),
    economy: 0,
    firstClass: 0,
    premium: t.availability.total_available,
  }));
}

export async function premiumSearch(
  schedule: TrainType,
  from: string,
  to: string,
  date: string,
): Promise<PremiumTrainResult[]> {
  const found = await searchTrips(schedule, from, to, date);
  if (!found) return [];
  const { trips, fromId, toId } = found;

  return Promise.all(
    trips.map(async (t): Promise<PremiumTrainResult> => {
      let layouts: ApiLayout[] = [];
      try {
        layouts = await getLayouts(t.id, fromId, toId, date);
      } catch {}
      const seatGroups: PremiumSeatGroup[] = layouts.length
        ? layouts.map(toSeatGroup)
        : t.availability.classes.map((c) => ({
            id: c.id,
            name: c.name,
            availableSeats: c.available,
            seats: [],
            bookedSeats: [],
          }));
      const price = layouts[0]?.passenger_prices;
      return {
        resultType: "premium",
        title: t.title,
        trainId: String(t.id),
        trainNo: t.code,
        from,
        to,
        departure: localDateTime(t.departs_at),
        arrival: localDateTime(t.arrives_at),
        coach: seatGroups.map((g) => g.name).join(", "),
        fares: {
          premiumAdult: price?.adult != null ? String(price.adult) : "",
          premiumChild: price?.child != null ? String(price.child) : "",
        },
        seatGroups,
        bookingEndpoint: PREMIUM_BOOKING_URL,
        reviewEndpoint: PREMIUM_BOOKING_URL,
        queriedDeparture: "<api>",
        queriedDepartureLabel: "premium api",
        statusCode: 200,
        protocol: "fetch",
      };
    }),
  );
}
