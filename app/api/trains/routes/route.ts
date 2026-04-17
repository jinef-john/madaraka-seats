import type { NextRequest } from "next/server";

import { getMeticketsRoutes } from "@/utils/metickets";
import type { TrainType } from "@/types/train";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTrainType(value: string | null): value is TrainType {
  return value === "express" || value === "inter_county" || value === "phase2";
}

export async function GET(request: NextRequest) {
  const scheduleType = request.nextUrl.searchParams.get("scheduleType");
  const origin = request.nextUrl.searchParams.get("from") || undefined;

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

  try {
    const data = await getMeticketsRoutes(scheduleType, origin);
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
