import { startApiServer } from "./api";
import { startTransferSyncLoop } from "./lib/syncLoop";

console.info(`[vietqr-worker] booting at ${new Date().toISOString()}`);

startApiServer();          // HTTP API: POST /api/bookings, GET /healthz
startTransferSyncLoop();   // background loop: khớp giao dịch → paid → email

function shutdown(signal: string): void {
  console.info(`[vietqr-worker] received ${signal}, exiting`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
