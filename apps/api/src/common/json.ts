import { createHash, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
export function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function constantEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function safeSummary(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const clean = (v: unknown, depth = 0): unknown => {
    if (depth > 8) return "[depth limit]";
    if (typeof v === "string") return v.slice(0, 4000);
    if (Array.isArray(v)) return v.slice(0, 200).map(value => clean(value, depth + 1));
    if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).slice(0, 100)
      .filter(([key]) => !/password|token|secret|authorization|cookie/i.test(key)).map(([key, data]) => [key, clean(data, depth + 1)]));
    return v;
  };
  return json(clean(value));
}
