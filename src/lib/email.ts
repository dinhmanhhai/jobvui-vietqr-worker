import sgMail from "@sendgrid/mail";
import { ROOM_NAME, ROOM_PRICING } from "./pricing";

let configured = false;

function ensureConfigured(): boolean {
  const key = process.env.SENDGRID_API_KEY;
  if (!key || key.startsWith("REPLACE_ME")) return false;
  if (!configured) {
    sgMail.setApiKey(key);
    configured = true;
  }
  return true;
}

function vnd(n: number): string {
  return n.toLocaleString("vi-VN") + "đ";
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function formatDateVN(d: string): string {
  // d = YYYY-MM-DD
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function endLabel(endHour: number): string {
  return endHour >= 24 ? "23:59" : `${pad2(endHour)}:00`;
}

export type BookingEmail = {
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  roomId: string;
  bookingDate: string;
  startHour: number;
  endHour: number;
  amount: number;
  code: string;
};

const ADDRESS = "Tầng 2, số 12 ngõ 4C Đặng Văn Ngữ, Trung Tự, Đống Đa, Hà Nội";
const HOURS = "8h – 24h hàng ngày";
const HOTLINE = "0966 967 016";

/** Gửi email xác nhận đã ghi nhận yêu cầu đặt phòng (gọi ngay lúc tạo booking). */
export async function sendBookingReceived(b: BookingEmail): Promise<boolean> {
  if (!ensureConfigured()) {
    console.warn("[vietqr-worker] SENDGRID_API_KEY chưa cấu hình → bỏ qua gửi email");
    return false;
  }
  const from = process.env.SENDGRID_FROM;
  if (!from) {
    console.warn("[vietqr-worker] SENDGRID_FROM thiếu → bỏ qua gửi email");
    return false;
  }

  const room = ROOM_NAME[b.roomId] ?? b.roomId;
  const pricePerHour = ROOM_PRICING[b.roomId] ?? 0;
  const hours = b.endHour - b.startHour;
  const start = `${pad2(b.startHour)}:00 ngày ${formatDateVN(b.bookingDate)}`;
  const end = endLabel(b.endHour);

  const text = `Kính chào ${b.customerName},

Xum Xuê Coffee đã ghi nhận yêu cầu đặt phòng của anh/chị. Dưới đây là thông tin chi tiết:

THÔNG TIN ĐẶT PHÒNG
Phòng:       ${room}
Bắt đầu:     ${start}
Kết thúc:    ${end}
Thời lượng:  ${hours} giờ
Giá thuê:    ${vnd(pricePerHour)}/giờ
Tạm tính:    ${vnd(b.amount)}
Mã đặt phòng: ${b.code}
SĐT liên hệ: ${b.customerPhone}

Quán sẽ liên hệ với anh/chị qua số điện thoại đã đăng ký trong vòng 30 phút (giờ hành chính) hoặc đầu giờ sáng hôm sau (nếu đặt ngoài giờ làm việc) để xác nhận chi tiết và hướng dẫn thanh toán.

ĐỊA CHỈ: ${ADDRESS}
GIỜ MỞ CỬA: ${HOURS}
Hotline: ${HOTLINE}

Cảm ơn anh/chị và hẹn gặp tại quán.`;

  const row = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:9px 0;color:#8a7a6f;font-size:14px;width:140px;vertical-align:top">${label}</td>
      <td style="padding:9px 0;color:${strong ? "#5b3a1f" : "#3a2a1f"};font-size:14px;font-weight:${strong ? "700" : "500"}">${value}</td>
    </tr>`;

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4ece0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:#6b4423;border-radius:16px 16px 0 0;padding:28px 28px 22px;text-align:center">
      <div style="color:#f7efe2;font-size:22px;font-weight:800;letter-spacing:.5px">Xum Xuê Coffee</div>
      <div style="color:#e7d6bf;font-size:13px;margin-top:4px">Cà phê &amp; cho thuê phòng họp theo giờ</div>
    </div>
    <div style="background:#fffdf8;padding:28px;border:1px solid #ead9c2;border-top:none">
      <p style="color:#3a2a1f;font-size:15px;margin:0 0 6px">Kính chào <b>${b.customerName}</b>,</p>
      <p style="color:#5a4a3f;font-size:14px;line-height:1.6;margin:0 0 18px">
        Xum Xuê Coffee đã <b>ghi nhận yêu cầu đặt phòng</b> của anh/chị. Dưới đây là thông tin chi tiết:
      </p>

      <div style="background:#faf3e6;border:1px solid #ecdcc4;border-radius:12px;padding:8px 18px;margin-bottom:18px">
        <div style="color:#6b4423;font-size:12px;font-weight:700;letter-spacing:1px;padding:10px 0 4px;text-transform:uppercase">Thông tin đặt phòng</div>
        <table style="width:100%;border-collapse:collapse">
          ${row("Phòng", room)}
          ${row("Bắt đầu", start)}
          ${row("Kết thúc", end)}
          ${row("Thời lượng", `${hours} giờ`)}
          ${row("Giá thuê", `${vnd(pricePerHour)}/giờ`)}
          ${row("Tạm tính", vnd(b.amount), true)}
          ${row("Mã đặt phòng", b.code, true)}
          ${row("SĐT liên hệ", b.customerPhone)}
        </table>
      </div>

      <p style="color:#5a4a3f;font-size:13.5px;line-height:1.65;margin:0 0 20px">
        Quán sẽ liên hệ với anh/chị qua số điện thoại đã đăng ký trong vòng <b>30 phút</b> (giờ hành chính)
        hoặc đầu giờ sáng hôm sau (nếu đặt ngoài giờ làm việc) để xác nhận chi tiết và hướng dẫn thanh toán.
      </p>

      <table style="width:100%;border-top:1px solid #ecdcc4;margin-top:6px">
        <tr><td style="padding:14px 0 2px;color:#8a7a6f;font-size:12px">ĐỊA CHỈ</td></tr>
        <tr><td style="padding:0 0 10px;color:#3a2a1f;font-size:13.5px">${ADDRESS}</td></tr>
        <tr><td style="padding:0;color:#8a7a6f;font-size:12px">GIỜ MỞ CỬA: <span style="color:#3a2a1f">${HOURS}</span></td></tr>
        <tr><td style="padding:6px 0 0;color:#8a7a6f;font-size:12px">HOTLINE: <span style="color:#6b4423;font-weight:700">${HOTLINE}</span></td></tr>
      </table>

      <p style="color:#5a4a3f;font-size:14px;margin:22px 0 0">Cảm ơn anh/chị và hẹn gặp tại quán! ☕</p>
    </div>
    <div style="background:#efe2cf;border-radius:0 0 16px 16px;padding:14px;text-align:center;color:#9a8a7c;font-size:11px">
      © Xum Xuê Coffee · xumxuecoffee.com
    </div>
  </div>
</body></html>`;

  await sgMail.send({
    to: b.customerEmail,
    from: { email: from, name: "Xum Xuê Coffee" },
    subject: `Xác nhận đặt phòng ${b.code} — Xum Xuê Coffee`,
    text,
    html,
  });
  return true;
}

// Giữ tương thích: gọi khi thanh toán đã khớp (dùng chung template).
export const sendBookingConfirmed = sendBookingReceived;
