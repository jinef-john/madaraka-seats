import type { TrainType, TrainTypeConfig } from "@/types/train";

export const METICKETS_BASE_URL = "https://metickets.krc.co.ke";

export const TRAIN_TYPE_CONFIG: Record<TrainType, TrainTypeConfig> = {
  express: {
    type: "express",
    label: "Express",
    searchEndpoint: "/search-view-results.php",
    bookingEndpoint: "/booking-details.php",
    reviewEndpoint: "/review-and-pay.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Mombasa Terminus",
    stationCatalog: ["Nairobi Terminus", "Mombasa Terminus", "Voi"],
    knownDestinationsByOrigin: {
      "Nairobi Terminus": ["Mombasa Terminus", "Voi"],
    },
    departureOptions: [
      { value: "3.00", label: "3.00 pm" },
      { value: "10.00", label: "10.00 pm" },
    ],
  },
  inter_county: {
    type: "inter_county",
    label: "Inter-County",
    searchEndpoint: "/search-view-results-return.php",
    bookingEndpoint: "/booking-details-premium.php",
    reviewEndpoint: "/review-and-pay-premium.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Emali",
    stationCatalog: [
      "Nairobi Terminus",
      "Mombasa Terminus",
      "Athi River",
      "Emali",
      "Kibwezi",
      "Mtito Andei",
      "Voi",
      "Miasenyi",
      "Mariakani",
    ],
    knownDestinationsByOrigin: {
      "Nairobi Terminus": [
        "Mombasa Terminus",
        "Emali",
        "Kibwezi",
        "Mtito Andei",
        "Voi",
        "Miasenyi",
        "Mariakani",
      ],
    },
    departureOptions: [
      { value: "3:00 PM", label: "3.00 pm" },
      { value: "10:00 PM", label: "10.00 pm" },
    ],
  },
  phase2: {
    type: "phase2",
    label: "Suswa",
    searchEndpoint: "/search-view-results.php",
    bookingEndpoint: "/booking-details.php",
    reviewEndpoint: "/review-and-pay.php",
    defaultOrigin: "Nairobi Terminus",
    defaultDestination: "Suswa",
    stationCatalog: [
      "Nairobi Terminus",
      "Ongata Rongai",
      "Ngong",
      "Maai Mahiu",
      "Suswa",
    ],
    knownDestinationsByOrigin: {
      "Nairobi Terminus": ["Ongata Rongai", "Ngong", "Maai Mahiu", "Suswa"],
    },
    departureOptions: [],
  },
};

export const TRAIN_TYPES = Object.values(TRAIN_TYPE_CONFIG);

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
