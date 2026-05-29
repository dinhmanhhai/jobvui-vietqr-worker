/** Logic khớp BE/src/lib/constants.ts `normalizeNoAccent`. */
function normalizeNoAccent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

/**
 * Giống BE `normalizePaymentDescription`: bỏ dấu nguyên âm, Đ→D / đ→d, chuẩn hóa khoảng trắng.
 * Worker gọi trước khi set query `value` cho VietQR và khi so khớp (sau đó còn strip whitespace trong syncLoop).
 */
export function normalizePaymentDescription(description: string): string {
  return normalizeNoAccent(description);
}

/** Bỏ mọi khoảng trắng Unicode để so sánh nội dung CK (DB vs API). */
export function stripWhitespaceForPaymentCompare(value: string): string {
  return value.replace(/\p{White_Space}/gu, "");
}
