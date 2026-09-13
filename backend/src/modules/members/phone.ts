/**
 * Normalizes a phone number into a bare MSISDN (e.g. "254712345678" -
 * country code, no "+", no leading zero). Accepts common Kenyan input shapes:
 * "0712345678", "+254712345678", "254712345678", with arbitrary
 * spaces/dashes. Returns null for anything that doesn't reduce to a
 * plausible MSISDN, so callers can reject/report it instead of matching
 * against a bad number.
 *
 * This is the key a Member is looked up by everywhere a device pairs itself
 * to one - see modules/members/device-token.routes.ts.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;

  let normalized: string;
  if (digits.startsWith('254') && digits.length === 12) {
    normalized = digits;
  } else if (digits.startsWith('0') && digits.length === 10) {
    normalized = `254${digits.slice(1)}`;
  } else if (digits.length === 9) {
    // Bare subscriber number without any leading 0 or country code.
    normalized = `254${digits}`;
  } else {
    return null;
  }

  // Kenyan mobile numbers: 2547XXXXXXXX or 2541XXXXXXXX, 12 digits total.
  return /^254[17]\d{8}$/.test(normalized) ? normalized : null;
}
