export type TrainType = "express" | "inter_county" | "phase2";

export interface SelectOption {
  value: string;
  label: string;
}

export interface TrainTypeConfig {
  type: TrainType;
  label: string;
  searchEndpoint: string;
  bookingEndpoint: string;
  reviewEndpoint: string;
  defaultOrigin: string;
  defaultDestination: string;
  stationCatalog: string[];
  knownDestinationsByOrigin: Record<string, string[]>;
  departureOptions: SelectOption[];
  /** How far ahead (in days from today) the site allows bookings */
  bookingHorizonDays: number;
}

export interface SearchQuery {
  scheduleType: TrainType;
  from: string;
  to: string;
  date: string;
  departure?: string;
  allTrains?: boolean;
}

export interface SearchResultBase {
  resultType: "standard" | "premium";
  title: string;
  trainId: string;
  trainNo: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  queriedDeparture: string;
  queriedDepartureLabel: string;
  bookingEndpoint: string;
  reviewEndpoint: string;
  statusCode: number;
  protocol: string;
}

export interface StandardTrainResult extends SearchResultBase {
  resultType: "standard";
  fare: {
    economyAdult: string;
    economyChild: string;
    firstAdult: string;
    firstChild: string;
  };
  openSeats: {
    economy: string;
    firstClass: string;
  };
  coachOptions: SelectOption[];
}

export interface PremiumSeatGroup {
  id?: string | number;
  name?: string;
  availableSeats?: string | number;
  seats: string[];
  bookedSeats: string[];
  decodeError?: string;
}

export interface PremiumTrainResult extends SearchResultBase {
  resultType: "premium";
  coach: string;
  fares: {
    premiumAdult: string;
    premiumChild: string;
  };
  seatGroups: PremiumSeatGroup[];
}

export type TrainSearchResult = StandardTrainResult | PremiumTrainResult;

export interface RoutesResponse {
  scheduleType: TrainType;
  terminals: SelectOption[];
  destinations: SelectOption[];
  departures: SelectOption[];
}

export interface SearchResponse extends RoutesResponse {
  query: SearchQuery;
  results: TrainSearchResult[];
  fullyBooked?: boolean;
}

export interface MonthDayTrain {
  trainNo: string;
  /** Departure time in HH:MM format */
  departure: string;
  /** Open economy seats */
  economy: number;
  /** Open first class seats */
  firstClass: number;
  /** Open premium seats (inter_county only) */
  premium: number;
}

export interface MonthDay {
  /** YYYY-MM-DD */
  date: string;
  trains: MonthDayTrain[];
  /** True when the site indicated sold-out (no bookable forms) */
  fullyBooked?: boolean;
}

export interface MonthResponse {
  scheduleType: TrainType;
  from: string;
  to: string;
  year: number;
  month: number;
  days: MonthDay[];
}
