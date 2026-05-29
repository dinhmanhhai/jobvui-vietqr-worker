import sgMail from "@sendgrid/mail";
import { ROOM_NAME } from "./pricing";

let configured = false;

function ensureConfigured(): boolean {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return false;
  if (!configured) {
    sgMail.setApiKey(key);
    configured = true;
  }
  return true;
}

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}

export type BookingEmail = {
  customerEmail: string;
  customerName: string;
  roomId: string;
  bookingDate: string;
  startHour: number;
  endHour: number;
  amount: number;
  code: string;
};

/** Gửi email xác nhận khi đã nhận được thanh toán. Trả false nếu thiếu cấu hình (bỏ qua). */
export async function sendBookingConfirmed(b: BookingEmail): Promise<boolean> {
  if (!ensureConfigured()) {
    console.warn("[vietqr-worker] SENDGRID_API_KEY thiếu → bỏ qua gửi email");
    return false;
  }
  const from = process.env.SENDGRID_FROM;
  if (!from) {
    console.warn("[vietqr-worker] SENDGRID_FROM thiếu → bỏ qua gửi email");
    return false;
  }
  const room = ROOM_NAME[b.roomId] ?? b.roomId;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#3a2a1f">
      <h2 style="color:#6b4423">Xum Xuê Coffee — Xác nhận đặt phòng</h2>
      <p>Chào ${b.customerName},</p>
      <p>Chúng tôi đã <b>nhận được thanh toán</b> cho lịch đặt phòng của bạn. Chi tiết:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0">Phòng</td><td style="padding:6px 0"><b>${room}</b></td></tr>
        <tr><td style="padding:6px 0">Ngày</td><td style="padding:6px 0"><b>${b.bookingDate}</b></td></tr>
        <tr><td style="padding:6px 0">Giờ</td><td style="padding:6px 0"><b>${b.startHour}:00 – ${b.endHour}:00</b></td></tr>
        <tr><td style="padding:6px 0">Số tiền</td><td style="padding:6px 0"><b>${vnd(b.amount)}</b></td></tr>
        <tr><td style="padding:6px 0">Mã đặt phòng</td><td style="padding:6px 0"><b>${b.code}</b></td></tr>
      </table>
      <p>Hẹn gặp bạn tại quán! ☕</p>
      <p style="color:#8a7a6f;font-size:13px">Xum Xuê Coffee — Tầng 2, số 12 ngõ 4C Đặng Văn Ngữ, Trung Tự, Đống Đa, Hà Nội</p>
    </div>`;
  await sgMail.send({
    to: b.customerEmail,
    from,
    subject: `Xác nhận đặt phòng ${b.code} — Xum Xuê Coffee`,
    html,
  });
  return true;
}
