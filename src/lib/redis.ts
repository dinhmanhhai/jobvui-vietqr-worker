import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL ?? "redis://redis:6379";
  client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });
  client.on("error", (err) => {
    console.error("[vietqr-worker] redis error:", err instanceof Error ? err.message : err);
  });
  client.on("connect", () => {
    console.info(`[vietqr-worker] redis connected (${url})`);
  });
  return client;
}
