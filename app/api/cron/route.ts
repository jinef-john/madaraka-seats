import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { refresh } from "@/utils/background-refresh";

async function handler() {
  await refresh();
  return Response.json({ ok: true });
}

export const POST = verifySignatureAppRouter(handler);
