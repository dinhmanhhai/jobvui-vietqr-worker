import { parseISO, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Asia/Ho_Chi_Minh";

/**
 * `from` / `to` for VietQR list API — Vietnam wall-clock (UTC+7), same style as Postman.
 * Anchors at noon VN so Docker `TZ=UTC` does not skew start/end of day.
 */
export function getTransactionListRange(lookbackDays: number): { from: string; to: string } {
  const now = new Date();
  const todayYmd = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const todayNoonVn = parseISO(`${todayYmd}T12:00:00+07:00`);
  const fromDayInstant = subDays(todayNoonVn, lookbackDays);
  const fromYmd = formatInTimeZone(fromDayInstant, TZ, "yyyy-MM-dd");
  return {
    from: `${fromYmd} 00:00:00`,
    to: `${todayYmd} 23:59:59`,
  };
}
