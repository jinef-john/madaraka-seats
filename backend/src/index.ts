import express from "express";
import cors from "cors";
import { initDb } from "./db/index.js";
import { startScheduler } from "./scheduler/index.js";
import { monthHandler } from "./routes/month.js";
import { searchHandler } from "./routes/search.js";
import { routesHandler } from "./routes/routes.js";
import { configHandler } from "./routes/config.js";
import { refreshHandler, flushHandler } from "./routes/admin.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? ["*"];

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    methods: ["GET", "POST"],
  }),
);
app.use(express.json());

app.get("/api/trains/month", monthHandler);
app.get("/api/trains/search", searchHandler);
app.get("/api/trains/routes", routesHandler);
app.get("/api/trains/config", configHandler);

app.post("/api/admin/refresh", refreshHandler);
app.post("/api/admin/flush", flushHandler);

app.get("/health", (_req, res) => res.json({ ok: true }));

async function main() {
  await initDb();
  console.log("[db] schema ready");

  startScheduler();

  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
