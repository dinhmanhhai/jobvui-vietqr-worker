import { getRedis } from "./redis";

const DEFAULT_TOKEN_KEY = "vietqr:bearer_token";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

function tokenKey(): string {
  return process.env.VIETQR_TOKEN_REDIS_KEY?.trim() || DEFAULT_TOKEN_KEY;
}

function baseUrl(): string {
  return (process.env.VIETQR_API_BASE ?? "https://api.vietqr.org").replace(/\/$/, "");
}

function loginCredentials(): { phone: string; password: string } | null {
  const phone = (process.env.VIETQR_LOGIN_PHONE ?? "").trim();
  const password = (process.env.VIETQR_LOGIN_PASSWORD ?? "").trim();
  if (!phone || !password) return null;
  return { phone, password };
}

/** JWT: ba đoạn base64url ngăn bởi dấu chấm (đoạn signature có thể rỗng cho `alg=none`). */
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

function extractTokenFromBody(body: unknown): string | null {
  if (typeof body === "string") {
    const t = body.trim().replace(/^"|"$/g, "");
    return JWT_REGEX.test(t) ? t : null;
  }
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [
    root.accessToken,
    root.access_token,
    root.token,
    root.bearerToken,
    root.jwt,
  ];
  const data = root.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    candidates.push(inner.accessToken, inner.access_token, inner.token, inner.bearerToken, inner.jwt);
  }
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

/** POST /vqr/api/accounts to log in and return a fresh bearer token. */
async function loginToVietQr(): Promise<string> {
  const creds = loginCredentials();
  if (!creds) {
    throw new Error(
      "VIETQR_LOGIN_PHONE / VIETQR_LOGIN_PASSWORD missing — cannot fetch bearer token",
    );
  }

  const url = `${baseUrl()}/vqr/api/accounts`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    Accept: "*/*",
    Referer: "https://vietqr.vn/",
    "User-Agent": DEFAULT_USER_AGENT,
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Cache-Control": "no-cache",
  };
  const payload = {
    phoneNo: creds.phone,
    email: "",
    password: creds.password,
    fcmToken: "",
    device: DEFAULT_USER_AGENT,
    platform: "Web",
    sharingCode: "",
  };

  console.info(`[vietqr-worker] VietQR login → POST ${url} (phone=${creds.phone})`);
  const started = Date.now();

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - started;
  const rawBody = await res.text();

  if (!res.ok) {
    console.error("[vietqr-worker] VietQR login failed", {
      httpStatus: res.status,
      durationMs,
      bodyPreview: rawBody.slice(0, 300),
    });
    throw new Error(`VietQR login HTTP ${res.status}: ${rawBody.slice(0, 200)}`);
  }

  // VietQR /vqr/api/accounts trả JWT thẳng dạng plain text (không bọc JSON).
  // Vẫn thử JSON.parse trước cho compat — fallback: lấy raw text nếu match JWT regex.
  let parsed: unknown = rawBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Ignore: rawBody không phải JSON → coi như chuỗi.
  }

  const token = extractTokenFromBody(parsed);
  if (!token) {
    console.error("[vietqr-worker] VietQR login response missing token", {
      bodyPreview: rawBody.slice(0, 300),
    });
    throw new Error("VietQR login: token not found in response");
  }

  console.info(`[vietqr-worker] VietQR login ok (httpStatus=${res.status}, durationMs=${durationMs}, tokenLength=${token.length})`);
  return token;
}

/** Login VietQR and overwrite the Redis cache. Returns the new token. */
export async function refreshBearerToken(): Promise<string> {
  const token = await loginToVietQr();
  const redis = getRedis();
  await redis.set(tokenKey(), token);
  console.info(`[vietqr-worker] cached new bearer token in redis key="${tokenKey()}"`);
  return token;
}

/** Read token from Redis; if missing, log in once to populate. */
export async function getBearerToken(): Promise<string> {
  const redis = getRedis();
  const cached = await redis.get(tokenKey());
  if (cached && cached.length > 0) return cached;
  console.info(`[vietqr-worker] redis key="${tokenKey()}" empty — logging in to VietQR`);
  return refreshBearerToken();
}

/** True when login credentials are configured (i.e. worker can recover from non-200). */
export function hasLoginCredentials(): boolean {
  return loginCredentials() !== null;
}
