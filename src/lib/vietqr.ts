import { getBearerToken, refreshBearerToken } from "./vietqrAuth";

export type VietQrTransaction = {
  transactionId: string;
  amount: string;
  bankAccount: string;
  content: string;
  time: number;
  timePaid: number;
  status: number;
  type: number;
  transType: string;
  terminalCode: string;
  note: string;
  referenceNumber: string;
  orderId: string;
  bankShortName: string;
  subCode: string;
};

export function parseVietQrAmount(amount: string): number {
  const n = Number(String(amount).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function previewText(s: string, max = 96): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function logApiDebug(message: string, payload: Record<string, unknown>): void {
  console.info(`[vietqr-worker] ${message}`, payload);
}

/** Set `VIETQR_LOG_FULL_URL=1` to log full request URL (query includes `value`; avoid in shared logs). */
function shouldLogFullUrl(): boolean {
  const v = process.env.VIETQR_LOG_FULL_URL ?? "";
  return v === "1" || v.toLowerCase() === "true";
}

/** Set `VIETQR_LOG_RESPONSE_FULL=1` to log full JSON array (có thể dài; chỉ bật khi debug). */
function shouldLogResponseFull(): boolean {
  const v = process.env.VIETQR_LOG_RESPONSE_FULL ?? "";
  return v === "1" || v.toLowerCase() === "true";
}

const RESPONSE_SUMMARY_MAX_ITEMS = 20;

function summarizeResponseItem(item: unknown, index: number): Record<string, unknown> {
  if (item === null || typeof item !== "object") {
    return { index, value: item };
  }
  const o = item as Record<string, unknown>;
  return {
    index,
    transactionId: o.transactionId,
    amount: o.amount,
    content:
      typeof o.content === "string" ? previewText(String(o.content), 200) : o.content,
    time: o.time,
    timePaid: o.timePaid,
    status: o.status,
    type: o.type,
    transType: o.transType,
    referenceNumber: o.referenceNumber,
    bankAccount: o.bankAccount,
    bankShortName: o.bankShortName,
  };
}

function logVietQrResponseBody(
  registrationId: string | undefined,
  data: unknown[],
  httpStatus: number,
  durationMs: number,
): void {
  const items = data
    .slice(0, RESPONSE_SUMMARY_MAX_ITEMS)
    .map((item, index) => summarizeResponseItem(item, index));
  logApiDebug("VietQR API response body (tóm tắt từng bản ghi)", {
    registrationId: registrationId ?? null,
    httpStatus,
    durationMs,
    itemCount: data.length,
    items,
    ...(data.length > RESPONSE_SUMMARY_MAX_ITEMS
      ? { note: `chỉ log ${RESPONSE_SUMMARY_MAX_ITEMS} bản đầu, còn lại ${data.length - RESPONSE_SUMMARY_MAX_ITEMS} bản` }
      : {}),
  });

  if (shouldLogResponseFull() && data.length > 0) {
    const raw = JSON.stringify(data);
    const max = 15_000;
    logApiDebug("VietQR API response body (full JSON)", {
      registrationId: registrationId ?? null,
      jsonChars: raw.length,
      json:
        raw.length > max
          ? `${raw.slice(0, max)}… (truncated log, totalChars=${raw.length})`
          : raw,
    });
  }
}

export async function fetchVietQrTransactionList(params: {
  baseUrl: string;
  bankId: string;
  value: string;
  from: string;
  to: string;
  sessionCookie?: string;
  offset?: number;
  transactionType?: number;
  /** Registration id for correlating logs */
  registrationId?: string;
}): Promise<VietQrTransaction[]> {
  const {
    baseUrl,
    bankId,
    value,
    from,
    to,
    sessionCookie,
    offset = 0,
    transactionType = 3,
    registrationId,
  } = params;

  const token = (await getBearerToken()).trim();

  const url = new URL("/vqr/api/transactions/list", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("bankId", bankId);
  url.searchParams.set("type", String(transactionType));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("value", value);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Accept-Language": "vi",
  };
  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  const querySnapshot = {
    bankId,
    type: transactionType,
    offset,
    from,
    to,
    valueLength: value.length,
    valuePreview: previewText(value, 120),
  };

  logApiDebug("VietQR API request", {
    registrationId: registrationId ?? null,
    method: "GET",
    path: `${url.pathname}`,
    query: querySnapshot,
    headers: {
      Authorization: "Bearer ***",
      Accept: headers.Accept,
      "Accept-Language": headers["Accept-Language"],
      Cookie: sessionCookie ? "present (hidden)" : undefined,
    },
    ...(shouldLogFullUrl() ? { fullUrl: url.toString() } : {}),
  });

  const started = Date.now();

  const res = await fetch(url.toString(), {
    method: "GET",
    headers,
  });

  const durationMs = Date.now() - started;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logApiDebug("VietQR API response error", {
      registrationId: registrationId ?? null,
      httpStatus: res.status,
      durationMs,
      bodyPreview: previewText(text, 400),
      query: querySnapshot,
    });
    // Non-200 → token có thể đã expired hoặc bị revoke. Login lại, ghi đè token Redis,
    // bỏ qua tick này (không đụng DB) — tick sau sẽ tự dùng token mới.
    try {
      await refreshBearerToken();
    } catch (e) {
      logApiDebug("VietQR token refresh failed after non-200", {
        registrationId: registrationId ?? null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw new Error(`VietQR list HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    logApiDebug("VietQR API unexpected body", {
      registrationId: registrationId ?? null,
      httpStatus: res.status,
      durationMs,
      bodyType: typeof data,
    });
    throw new Error("VietQR list: expected JSON array");
  }

  logApiDebug("VietQR API response ok", {
    registrationId: registrationId ?? null,
    httpStatus: res.status,
    durationMs,
    transactionCount: data.length,
    query: querySnapshot,
  });

  logVietQrResponseBody(registrationId, data, res.status, durationMs);

  return data as VietQrTransaction[];
}
