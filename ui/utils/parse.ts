export function parseSQLiteDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  // If it doesn't contain 'T', replace space with 'T' and append 'Z' for UTC.
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  return new Date(normalized);
}

export function parseJSON(str: string | null | undefined): Record<string, unknown> {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
