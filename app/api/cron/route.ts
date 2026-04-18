import type { NextRequest } from "next/server";
import { refresh } from "@/utils/background-refresh";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await refresh();
  return Response.json({ ok: true });
}
