// Sinh mã nội dung chuyển khoản: "XX" + 6 ký tự (bỏ ký tự dễ nhầm O/0/I/1).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomBookingCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return "XX" + s;
}
