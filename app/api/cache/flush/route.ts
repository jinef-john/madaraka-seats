import { flushMonthCache } from "@/utils/month-cache";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CACHE_FLUSH_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await flushMonthCache();
  return Response.json({ flushed: count });
}
