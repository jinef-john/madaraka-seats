import type { NextRequest } from "next/server";

import type { TrainType } from "@/types/train";
import { searchMetickets } from "@/utils/metickets";
import { getSearch, setSearch } from "@/utils/search-cache";

function isTrainType(value: string | null): value is TrainType {
  return value === "express" || value === "inter_county" || value === "phase2";
}

function parseBoolean(value: string | null) {
  if (value === null) {
    return undefined;
  }

  return value === "1" || value === "true" || value === "yes";
}

export async function GET(request: NextRequest) {
  const scheduleType = request.nextUrl.searchParams.get("scheduleType");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const date = request.nextUrl.searchParams.get("date");
  const departure = request.nextUrl.searchParams.get("departure") || undefined;
  const allTrains = parseBoolean(request.nextUrl.searchParams.get("allTrains"));

  if (!isTrainType(scheduleType)) {
    return Response.json(
      {
        error:
          "Invalid or missing scheduleType. Use express, inter_county, or phase2.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (!from || !to || !date) {
    return Response.json(
      {
        error: "Missing required parameters. Provide from, to, and date.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const cacheKey = `${scheduleType}|${from}|${to}|${date}|${departure ?? ""}`;
    const cached = getSearch(cacheKey);
    if (cached) {
      return Response.json(cached, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const data = await searchMetickets({
      scheduleType,
      from,
      to,
      date,
      departure,
      allTrains,
    });

    setSearch(cacheKey, data);
    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: (error as Error).message,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
