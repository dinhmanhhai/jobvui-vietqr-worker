// Giá phòng (VND/giờ) — phải KHỚP với lib/config.ts của frontend xumxue.
export const ROOM_PRICING: Record<string, number> = {
  large: 200_000,
  small: 50_000,
};

export const ROOM_NAME: Record<string, string> = {
  large: "Phòng họp lớn",
  small: "Phòng họp nhỏ",
};

/** Tính tiền server-side (không tin client). Ném lỗi nếu input không hợp lệ. */
export function computeAmount(roomId: string, startHour: number, endHour: number): number {
  const price = ROOM_PRICING[roomId];
  if (!price) throw new Error(`roomId không hợp lệ: ${roomId}`);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    throw new Error("startHour/endHour phải là số nguyên");
  }
  const hours = endHour - startHour;
  if (hours <= 0 || hours > 16) throw new Error("khoảng giờ không hợp lệ");
  return price * hours;
}
