import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { Client } from "@upstash/qstash";
import { buildJobs } from "@/utils/background-refresh";

const CHUNK_SIZE = 20;

async function handler() {
  const jobs = buildJobs();
  const baseUrl =
    process.env.APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

  // Split jobs into chunks and publish each as a separate QStash message.
  const chunks: (typeof jobs)[] = [];
  for (let i = 0; i < jobs.length; i += CHUNK_SIZE) {
    chunks.push(jobs.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((chunk) =>
      qstash.publishJSON({
        url: `${baseUrl}/api/cron/warm`,
        body: chunk,
      }),
    ),
  );

  console.log(
    `[cron] dispatched ${chunks.length} chunks (${jobs.length} total route-months)`,
  );
  return Response.json({
    ok: true,
    dispatched: chunks.length,
    totalJobs: jobs.length,
  });
}

export const POST = verifySignatureAppRouter(handler);
