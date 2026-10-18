// Countries we deliver to (ISO 3166-1 alpha-2), with dialling codes for phone
// numbers. India first, then markets with large Indian communities, then the
// rest alphabetically. Extend this list to open more destinations.
export type Country = { code: string; name: string; dial: string };

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", dial: "91" },
  { code: "US", name: "United States", dial: "1" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "SA", name: "Saudi Arabia", dial: "966" },
  { code: "QA", name: "Qatar", dial: "974" },
  { code: "OM", name: "Oman", dial: "968" },
  { code: "KW", name: "Kuwait", dial: "965" },
  { code: "BH", name: "Bahrain", dial: "973" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "AT", name: "Austria", dial: "43" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "FJ", name: "Fiji", dial: "679" },
  { code: "FR", name: "France", dial: "33" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "KE", name: "Kenya", dial: "254" },
  { code: "MU", name: "Mauritius", dial: "230" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "LK", name: "Sri Lanka", dial: "94" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "TH", name: "Thailand", dial: "66" },
];

export const DOMESTIC_COUNTRY = "IN";

export function countryName(code: string | null | undefined): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code ?? "";
}

export function dialCode(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.dial ?? "91";
}

/** Dial codes for the login screen, de-duplicated (US and Canada share +1). */
export const DIAL_OPTIONS = COUNTRIES.filter((c, i, all) => all.findIndex((x) => x.dial === c.dial) === i).map((c) => ({
  dial: c.dial,
  label: c.dial === "1" ? "US / Canada" : c.name,
}));

/**
 * Builds an E.164 number from a national number and dial code. Indian numbers
 * must be 10 digits starting 6–9; others 6–14 digits. Returns null if invalid.
 */
export function toE164(national: string, dial: string): string | null {
  let digits = national.replace(/\D/g, "");
  if (national.trim().startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (dial === "91") {
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
  }
  digits = digits.replace(/^0+/, ""); // trunk prefix, e.g. UK 07…
  return digits.length >= 6 && digits.length <= 14 ? `+${dial}${digits}` : null;
}
