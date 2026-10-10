import { Session } from "httpcloak";

export function createSession(): Session {
  const timeout = parseInt(process.env.SCRAPER_TIMEOUT ?? "30", 10);
  const retry = parseInt(process.env.SCRAPER_RETRY ?? "2", 10);
  const session = new Session({ preset: "chrome-latest", timeout, retry });
  session.headers["Accept-Language"] = "en-US,en;q=0.9";
  return session;
}

let shared: Session | null = null;

export function sharedSession(): Session {
  shared ??= createSession();
  return shared;
}

export function closeSharedSession(): void {
  shared?.close();
  shared = null;
}
