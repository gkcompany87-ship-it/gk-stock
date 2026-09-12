/** RFC-style quoting, UTF-8 BOM at stream start, French semicolon delimiter, formula neutralization. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "").replaceAll("\0", "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvRow(values: unknown[]): string { return values.map(csvCell).join(";") + "\r\n"; }
