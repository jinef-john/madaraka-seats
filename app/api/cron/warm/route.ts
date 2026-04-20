import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { warmChunk } from "@/utils/background-refresh";
import type { WarmJob } from "@/utils/background-refresh";

async function handler(req: Request) {
  const jobs: WarmJob[] = await req.json();
  console.log(`[warm] processing chunk of ${jobs.length} route-months`);
  await warmChunk(jobs);
  return Response.json({ ok: true, processed: jobs.length });
}

export const POST = verifySignatureAppRouter(handler);
