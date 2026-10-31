import { Field, formText } from "./forms";
import { Input } from "./primitives";
export function currencyDigits(currency: string) { try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; } catch { return 2; } }
export function amountInput(minor: number, currency: string) { return (minor / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency)); }
export function parseAmount(raw: string, currency: string) {
 const digits = currencyDigits(currency);
 if (!/^\d+(\.\d+)?$/.test(raw) || (raw.split(".")[1]?.length ?? 0) > digits) throw new Error(`Enter a nonnegative amount with at most ${digits} decimal places for ${currency}.`);
 const [whole, fraction = ""] = raw.split("."); const value = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0");
 if (value > 2147483647n) throw new Error("Amount exceeds the supported range."); return Number(value);
}
export const formAmount = (data: FormData, name: string, currency: string) => parseAmount(formText(data, name), currency);
export function MoneyField({ name, label, currency, defaultMinor = 0, required = true }: { name: string; label: string; currency: string; defaultMinor?: number; required?: boolean }) { const digits = currencyDigits(currency); return <Field label={`${label} (${currency})`}><Input name={name} type="number" min="0" step={digits ? 1 / 10 ** digits : 1} required={required} defaultValue={amountInput(defaultMinor, currency)}/></Field>; }
