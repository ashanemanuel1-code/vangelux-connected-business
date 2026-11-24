import * as XLSX from 'xlsx';
import { isNativeApp, saveFile } from './native';

export function exportRows(rows: Record<string, unknown>[], filename: string, sheet = 'Data') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const bookType = filename.endsWith('.csv') ? 'csv' : 'xlsx';
  if (isNativeApp()) {
    // Android app: hand the file to the share menu (WhatsApp, Drive, Save to Files…)
    const out = XLSX.write(wb, { type: 'array', bookType });
    void saveFile(new Blob([out], { type: bookType === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    return;
  }
  XLSX.writeFile(wb, filename, { bookType });
}

/** "Cost per Item (LKR)" → "cost_per_item", "Invoice number" → "invoice_number". */
export function headerKey(k: string) {
  return k.toString().toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Excel dates → YYYY-MM-DD in the user's own calendar (toISOString would shift the day in Sri Lanka's UTC+5:30). */
function dateOnly(d: Date) {
  const x = new Date(d.getTime() + 12 * 3600 * 1000); // centre on the day, so tiny Excel time offsets can't change it
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const cellText = (v: unknown) => (v instanceof Date ? dateOnly(v) : String(v ?? '').trim());

/**
 * Reads a sheet of an .xlsx/.xls/.csv file into objects keyed by tidied header (see headerKey).
 * - `preferSheet`: use the first sheet whose name matches (e.g. /expense/i), otherwise the first sheet.
 * - The header row is found automatically: the first row (within the top 15) that contains a "date"
 *   column and at least two filled cells. Notes or titles above the table are skipped.
 * - Completely empty rows are dropped.
 */
export async function readRows(file: File, preferSheet?: RegExp): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const name = (preferSheet && wb.SheetNames.find((n) => preferSheet.test(n))) || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false });
  let h = grid.slice(0, 15).findIndex((r) => r.some((c) => /\bdate\b/i.test(cellText(c))) && r.filter((c) => cellText(c)).length >= 2);
  if (h < 0) h = 0;
  const headers = (grid[h] ?? []).map((c) => headerKey(cellText(c)));
  return grid.slice(h + 1)
    .filter((r) => r.some((c) => cellText(c)))
    .map((r) => {
      const out: Record<string, string> = {};
      headers.forEach((k, i) => { if (k) out[k] = cellText(r[i]); });
      return out;
    });
}

/** Accepts 2026-11-22, 22/11/2026, 22-11-2026 or an Excel serial number. */
export function parseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}$/.test(v)) { const d = XLSX.SSF.parse_date_code(Number(v)); return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  return null;
}

/** "Rs. 2,000.00", "LKR 1,500", "2000" → number. */
export const toNum = (v: string) => Number(String(v ?? '').replace(/rs\.?|lkr/gi, '').replace(/[^0-9.-]/g, '')) || 0;
