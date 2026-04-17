import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";

import type { TrainType } from "@/types/train";
import { scrapeMonth } from "@/utils/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stale-while-revalidate: users always get the cached result instantly;
// a fresh scrape runs in the background at most once every 5 minutes.
// The month view doesn't need 30-second precision — 5-minute granularity
// is fine for seat availability trends, and keeps the scrape cost low.
const getCachedMonth = unstable_cache(
  (
    scheduleType: TrainType,
    from: string,
    to: string,
    year: number,
    month: number,
  ) => scrapeMonth(scheduleType, from, to, year, month),
  ["trains-month"],
  { revalidate: 300 },
);

function isTrainType(v: string | null): v is TrainType {
  return v === "express" || v === "inter_county" || v === "phase2";
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const scheduleType = sp.get("scheduleType");
  const from = sp.get("from");
  const to = sp.get("to");

  const now = new Date();
  const year = parseInt(sp.get("year") ?? String(now.getFullYear()), 10);
  const month = parseInt(sp.get("month") ?? String(now.getMonth() + 1), 10);

  if (!isTrainType(scheduleType)) {
    return Response.json(
      {
        error:
          "Invalid or missing scheduleType. Use express, inter_county, or phase2.",
      },
      { status: 400 },
    );
  }

  if (!from || !to) {
    return Response.json(
      { error: "Missing required parameters: from and to." },
      { status: 400 },
    );
  }

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: "Invalid year or month." }, { status: 400 });
  }

  try {
    const days = await getCachedMonth(scheduleType, from, to, year, month);

    return Response.json(
      { scheduleType, from, to, year, month, days },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
