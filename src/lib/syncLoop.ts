import {
  normalizePaymentDescription,
  stripWhitespaceForPaymentCompare,
} from "./normalize";
import { prisma } from "./prisma";
import { getTransactionListRange } from "./timeRange";
import {
  fetchVietQrTransactionList,
  parseVietQrAmount,
  type VietQrTransaction,
} from "./vietqr";
import { hasLoginCredentials } from "./vietqrAuth";
import { sendBookingConfirmed } from "./email";

let loopStarted = false;

function readEnv() {
  const pollMs = Number(process.env.POLL_INTERVAL_MS ?? "5000");
  const lookbackDays = Math.max(1, Number(process.env.VIETQR_LOOKBACK_DAYS ?? "3"));
  const baseUrl = (process.env.VIETQR_API_BASE ?? "https://api.vietqr.org").replace(/\/$/, "");
  const bankId = process.env.VIETQR_BANK_ID ?? "";
  // số TK nhận tiền (hoặc phone login) để query giao dịch của 1 tài khoản cố định
  const queryValue = process.env.VIETQR_QUERY_VALUE ?? "";
  const sessionCookie = process.env.VIETQR_SESSION_COOKIE || undefined;
  const transactionType = Number(process.env.VIETQR_TRANSACTION_TYPE ?? "3");
  const expireHours = Math.max(1, Number(process.env.BOOKING_EXPIRE_HOURS ?? "24"));
  return {
    pollMs: Number.isFinite(pollMs) && pollMs >= 1000 ? pollMs : 5000,
    lookbackDays,
    baseUrl,
    bankId,
    queryValue,
    sessionCookie,
    transactionType,
    expireHours,
  };
}

type BookingShape = { id: string; code: string; amount: number };

/** Khớp 1 giao dịch với 1 booking: hoàn tất + nội dung chứa code + đúng số tiền. */
function txMatchesBooking(
  tx: { content: string; amount: string; status: number },
  booking: BookingShape,
): boolean {
  if (tx.status !== 1) return false;
  const content = stripWhitespaceForPaymentCompare(normalizePaymentDescription(tx.content));
  const code = stripWhitespaceForPaymentCompare(normalizePaymentDescription(booking.code));
  if (!code.length) return false;
  if (!content.includes(code)) return false;
  const amt = parseVietQrAmount(tx.amount);
  return Number.isFinite(amt) && amt === booking.amount;
}

async function runTick(): Promise<void> {
  const env = readEnv();
  if (!env.bankId) return; // queryValue rỗng = lấy tất cả giao dịch của TK

  // 1) hết hạn các booking pending quá lâu
  const expireBefore = new Date(Date.now() - env.expireHours * 3600 * 1000);
  await prisma.booking.updateMany({
    where: { status: "pending", createdAt: { lt: expireBefore } },
    data: { status: "expired" },
  });

  // 2) lấy booking pending
  const pending = await prisma.booking.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  if (pending.length === 0) return;

  // 3) query 1 lần giao dịch của TK cố định
  const { from, to } = getTransactionListRange(env.lookbackDays);
  let list: VietQrTransaction[] = [];
  try {
    list = await fetchVietQrTransactionList({
      baseUrl: env.baseUrl,
      bankId: env.bankId,
      value: env.queryValue,
      from,
      to,
      sessionCookie: env.sessionCookie,
      offset: 0,
      transactionType: env.transactionType,
    });
  } catch (e) {
    console.error("[vietqr-worker] fetch transactions:", e instanceof Error ? e.message : e);
    return; // tick sau thử lại (vietqr.ts đã tự refresh token khi non-200)
  }

  // 4) khớp từng booking
  for (const booking of pending) {
    const match = list.find((tx) => txMatchesBooking(tx, booking));
    if (!match) continue;

    const updated = await prisma.booking.updateMany({
      where: { id: booking.id, status: "pending" },
      data: { status: "paid", paidTxId: String(match.transactionId), paidAt: new Date() },
    });
    if (updated.count === 0) continue; // race

    console.info(
      `[vietqr-worker] PAID booking=${booking.code} tx=${match.transactionId} amount=${booking.amount}`,
    );

    try {
      const full = await prisma.booking.findUnique({ where: { id: booking.id } });
      if (full) {
        const ok = await sendBookingConfirmed({
          customerEmail: full.customerEmail,
          customerName: full.customerName,
          customerPhone: full.customerPhone,
          roomId: full.roomId,
          bookingDate: full.bookingDate,
          startHour: full.startHour,
          endHour: full.endHour,
          amount: full.amount,
          code: full.code,
        });
        if (ok) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { emailSentAt: new Date() },
          });
        }
      }
    } catch (e) {
      console.error(`[vietqr-worker] email booking=${booking.code}:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startTransferSyncLoop(): void {
  if (loopStarted) return;
  loopStarted = true;

  const env = readEnv();
  if (!process.env.DATABASE_URL) {
    console.warn("[vietqr-worker] DATABASE_URL thiếu → loop tắt.");
    return;
  }
  if (!env.bankId) {
    console.warn("[vietqr-worker] VIETQR_BANK_ID thiếu → loop tắt.");
    return;
  }
  if (!hasLoginCredentials()) {
    console.warn("[vietqr-worker] VIETQR login creds thiếu → loop tắt.");
    return;
  }

  console.info(
    `[vietqr-worker] sync loop mỗi ${env.pollMs}ms lookbackDays=${env.lookbackDays} queryValue=***`,
  );
  void runTick();
  setInterval(() => void runTick(), env.pollMs);
}
