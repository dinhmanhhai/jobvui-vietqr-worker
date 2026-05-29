import express, { type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { computeAmount } from "./lib/pricing";
import { randomBookingCode } from "./lib/code";

export function startApiServer(): void {
  const app = express();
  app.use(express.json());

  const origins = (process.env.CORS_ORIGIN ?? "https://xumxuecoffee.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins }));

  app.get("/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Tạo booking → trả mã nội dung CK + số tiền (tính server-side)
  app.post("/api/bookings", async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const required = [
        "customerName",
        "customerPhone",
        "customerEmail",
        "roomId",
        "date",
        "startHour",
        "endHour",
      ];
      for (const k of required) {
        if (b[k] === undefined || b[k] === null || String(b[k]).trim() === "") {
          return res.status(400).json({ error: `Thiếu trường: ${k}` });
        }
      }
      const startHour = Number(b.startHour);
      const endHour = Number(b.endHour);
      let amount: number;
      try {
        amount = computeAmount(String(b.roomId), startHour, endHour);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }

      // sinh code unique
      let code = randomBookingCode();
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.booking.findUnique({ where: { code } });
        if (!exists) break;
        code = randomBookingCode();
      }

      const booking = await prisma.booking.create({
        data: {
          code,
          customerName: String(b.customerName).trim(),
          customerPhone: String(b.customerPhone).trim(),
          customerEmail: String(b.customerEmail).trim(),
          roomId: String(b.roomId),
          bookingDate: String(b.date),
          startHour,
          endHour,
          amount,
          note: b.note ? String(b.note) : null,
          status: "pending",
        },
      });

      return res.json({
        code: booking.code,
        amount: booking.amount,
        status: booking.status,
        transferNote: booking.code, // khách nhập đúng nội dung này khi CK
      });
    } catch (e) {
      console.error("[api] POST /api/bookings:", e instanceof Error ? e.message : e);
      return res.status(500).json({ error: "internal error" });
    }
  });

  // Poll trạng thái (frontend dùng để hiện "đã nhận thanh toán")
  app.get("/api/bookings/:code", async (req: Request, res: Response) => {
    const bk = await prisma.booking.findUnique({
      where: { code: req.params.code },
      select: { status: true, amount: true },
    });
    if (!bk) return res.status(404).json({ error: "not found" });
    return res.json(bk);
  });

  const port = Number(process.env.PORT ?? "8080");
  app.listen(port, () => {
    console.info(`[vietqr-worker] API listening on :${port} (CORS: ${origins.join(", ")})`);
  });
}
