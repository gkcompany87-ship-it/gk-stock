import { moneyLabel } from "@as-tino/shared";
export const money = (value: string | undefined | null) => moneyLabel(value ?? "0.000", "TND");
export const quantity = (value: string | undefined | null) => (value ?? "0").replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1").replace(".", ",");
export function date(value: string | undefined | null, withTime = false): string {
  if (!value) return "\u2014";
  return new Intl.DateTimeFormat("fr-TN", { timeZone: "Africa/Tunis", dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}) }).format(new Date(value));
}
export const customerName = (value: { companyName?: string | null; contactName: string }) => value.companyName || value.contactName;
export function dateInput(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
export const formatMoney = money;
export const formatQuantity = quantity;
export const formatDate = date;
