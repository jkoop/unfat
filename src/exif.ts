import * as exifr from "exifr";

export async function extractTakenAt(buffer: ArrayBuffer): Promise<string> {
  try {
    const parsed = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "CreateDate", "DateTime"],
    });

    const raw = parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.DateTime;

    if (raw) {
      if (raw instanceof Date && !isNaN(raw.getTime())) {
        return raw.toISOString().slice(0, 19).replace("T", " ");
      }
      // EXIF format: "YYYY:MM:DD HH:MM:SS"
      const normalized = String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 19).replace("T", " ");
      }
    }
  } catch {
    // fallthrough
  }
  return nowLocal();
}

export function nowLocal(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function toLocalInputValue(isoOrSql: string): string {
  // Converts SQL UTC string to datetime-local value.
  const d = new Date(isoOrSql.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return isoOrSql.slice(0, 16).replace(" ", "T");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function fromInputValue(val: string, tzOffsetMinutes?: number): string {
  // Convert browser-local datetime-local value to SQL UTC string when offset provided.
  if (!val) return nowLocal();
  if (typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)) {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!m) return val.replace("T", " ") + ":00";
    const [, ys, ms, ds, hs, mins] = m;
    const utcMs =
      Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), 0) +
      tzOffsetMinutes * 60_000;
    return new Date(utcMs).toISOString().slice(0, 19).replace("T", " ");
  }
  return val.replace("T", " ") + ":00";
}
