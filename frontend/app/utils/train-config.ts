import type { TrainType, TrainTypeConfig } from "@/types/train";

export const METICKETS_BASE_URL = "https://metickets.krc.co.ke";

// Every station on a given line can be an origin; `allPairs` builds the
// knownDestinationsByOrigin map automatically from the station list.
function allPairs(stations: string[]): Record<string, string[]> {
  return Object.fromEntries(
    stations.map((s) => [s, stations.filter((d) => d !== s)]),
  );
}

export const TRAIN_TYPE_CONFIG: Record<TrainType, TrainTypeConfig> = {
  express: {
    type: "express",
    label: "Express",
    searchEndpoint: "/search-view-results.php",
    bookingEndpoint: "/booking-details.php",
    reviewEndpoint: "/review-and-pay.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Mombasa Terminus",
    // Linear route: Nairobi ↔ Voi ↔ Mombasa
    stationCatalog: ["Nairobi Terminus", "Mombasa Terminus", "Voi"],
    knownDestinationsByOrigin: allPairs([
      "Nairobi Terminus",
      "Mombasa Terminus",
      "Voi",
    ]),
    departureOptions: [
      { value: "3.00", label: "3.00 pm" },
      { value: "10.00", label: "10.00 pm" },
    ],
    bookingHorizonDays: 60,
  },
  inter_county: {
    type: "inter_county",
    label: "Inter-County",
    searchEndpoint: "/search-view-results-return.php",
    bookingEndpoint: "/booking-details-premium.php",
    reviewEndpoint: "/review-and-pay-premium.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Mombasa Terminus",
    // Linear corridor: Nairobi → … → Mombasa
    stationCatalog: [
      "Nairobi Terminus",
      "Athi River",
      "Emali",
      "Kibwezi",
      "Mtito Andei",
      "Voi",
      "Miasenyi",
      "Mariakani",
      "Mombasa Terminus",
    ],
    knownDestinationsByOrigin: {
      // Nairobi cannot reach Athi River; Mombasa cannot reach Mariakani.
      "Nairobi Terminus": [
        "Mombasa Terminus",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
      "Athi River": [
        "Nairobi Terminus",
        "Mombasa Terminus",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
      Emali: [
        "Nairobi Terminus",
        "Athi River",
        "Mombasa Terminus",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
      Kibwezi: [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Mombasa Terminus",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
      "Mtito Andei": [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Kibwezi",
        "Mombasa Terminus",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
      Voi: [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Mombasa Terminus",
        "Miasenyi",
        "Mariakani",
      ],
      Miasenyi: [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Mombasa Terminus",
        "Mariakani",
      ],
      Mariakani: [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mombasa Terminus",
      ],
      "Mombasa Terminus": [
        "Nairobi Terminus",
        "Athi River",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
      ],
    },
    departureOptions: [
      { value: "3:00 PM", label: "3.00 pm" },
      { value: "10:00 PM", label: "10.00 pm" },
    ],
    bookingHorizonDays: 60,
  },
  phase2: {
    type: "phase2",
    label: "Suswa",
    searchEndpoint: "/search-view-results.php",
    bookingEndpoint: "/booking-details.php",
    reviewEndpoint: "/review-and-pay.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Suswa",
    // Suburban corridor: Nairobi → Ongata Rongai → Ngong → Maai Mahiu → Suswa
    stationCatalog: [
      "Nairobi Terminus",
      "Ongata Rongai",
      "Ngong",
      "Maai Mahiu",
      "Suswa",
    ],
    knownDestinationsByOrigin: allPairs([
      "Nairobi Terminus",
      "Ongata Rongai",
      "Ngong",
      "Maai Mahiu",
      "Suswa",
    ]),
    departureOptions: [],
    bookingHorizonDays: 30,
  },
};

export const TRAIN_TYPES = Object.values(TRAIN_TYPE_CONFIG);

/** Returns the last bookable date (YYYY-MM-DD) for a given train type. */
export function lastBookableDate(type: TrainType): string {
  const horizon = TRAIN_TYPE_CONFIG[type].bookingHorizonDays;
  const d = new Date();
  d.setDate(d.getDate() + horizon - 1);
  return d.toISOString().slice(0, 10);
}

export const FRONTEND_HARDCODE_GUIDANCE = {
  safeToHardcode: [
    "train type identifiers and labels",
    "known booking and review endpoint paths",
    "default origin and destination per train type",
    "station catalogs captured in the HAR",
    "known departure values exposed on the homepage for express and inter_county",
  ],
  keepDynamic: [
    "csrf token",
    "live terminals and destinations from fetch.php/fetch-premium.php",
    "train availability and fares",
    "seat availability and seat numbers",
    "booking form payloads and payment flow state",
  ],
} as const;
