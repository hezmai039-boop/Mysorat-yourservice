function escapeCsvValue(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  // Neutralize formula injection (CWE-1236): Excel/Sheets treat a leading
  // =, +, -, or @ as the start of a formula when opening a CSV.
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escapeCsvValue(row[h])).join(","))];
  return "﻿" + lines.join("\n");
}

/** One data line (no trailing newline) for a row against a fixed header order - used when
 * streaming a CSV export in batches rather than building the whole file in memory. */
export function csvLine(row: Record<string, unknown>, headers: string[]): string {
  return headers.map((h) => escapeCsvValue(row[h])).join(",");
}

export function rangeStartDate(range: string): Date {
  const now = new Date();
  if (range === "daily") return new Date(now.getTime() - 24 * 3600 * 1000);
  if (range === "weekly") return new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  return new Date(now.getTime() - 30 * 24 * 3600 * 1000);
}
