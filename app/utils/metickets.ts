import type {
  RoutesResponse,
  SearchQuery,
  SearchResponse,
} from "@/types/train";
import { scrapeRoutes, scrapeSearch } from "@/utils/scraper";

export async function getMeticketsRoutes(
  scheduleType: SearchQuery["scheduleType"],
  from?: string,
): Promise<RoutesResponse> {
  const { terminals, destinations, departures } = await scrapeRoutes(
    scheduleType,
    from,
  );
  return { scheduleType, terminals, destinations, departures };
}

export async function searchMetickets(
  query: SearchQuery,
): Promise<SearchResponse> {
  const { terminals, destinations, departures, results, fullyBooked } =
    await scrapeSearch({
      schedule: query.scheduleType,
      from: query.from,
      to: query.to,
      date: query.date,
      departure: query.departure,
      allTrains: query.allTrains,
    });
  return {
    scheduleType: query.scheduleType,
    terminals,
    destinations,
    departures,
    query,
    results,
    fullyBooked,
  };
}
