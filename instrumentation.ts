export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackgroundRefresh } =
      await import("./app/utils/background-refresh");
    startBackgroundRefresh();
  }
}
