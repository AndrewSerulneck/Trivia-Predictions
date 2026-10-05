// The live coupon's clock (docs/reward-live-redemption-plan.md Phase 2). A screenshot freezes the
// time, so staff compare it with the real time. The time shown is the SERVER's, carried as an
// offset from the phone's own clock, so a phone with a wrong clock still shows the right time
// (and a coupon is never "fake" just because the phone is a few minutes off).

/** Server time minus the phone's time, measured when the wallet response arrived. */
export const clockOffsetFromServer = (serverNowMs: unknown, clientNowMs: number): number => {
  if (typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs)) return 0;
  return serverNowMs - clientNowMs;
};

/** Milliseconds until the corrected clock next rolls over to a new second (always 1–1000). */
export const msUntilNextSecond = (correctedNowMs: number): number => 1000 - (((correctedNowMs % 1000) + 1000) % 1000);

const pad = (value: number): string => String(value).padStart(2, "0");

/** "3:04:09 PM", in the phone's local time zone (the guest is standing in the venue). */
export const formatCouponClock = (correctedNowMs: number): string => {
  const date = new Date(correctedNowMs);
  const hours = date.getHours();
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 === 0 ? 12 : hours % 12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${suffix}`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Fri, Oct 3", in the phone's local time zone. */
export const formatCouponDate = (correctedNowMs: number): string => {
  const date = new Date(correctedNowMs);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
};
