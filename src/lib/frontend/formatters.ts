export function money(amountMinor: number, currency: string) {
 const formatter = new Intl.NumberFormat("en", { style: "currency", currency });
 const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
 return formatter.format(amountMinor / 10 ** digits);
}
export function dateLabel(iso: string) { if (!iso || !Number.isFinite(Date.parse(iso))) return "—"; return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)); }
