import * as XLSX from 'xlsx';

export function exportRows(rows: Record<string, unknown>[], filename: string, sheet = 'Data') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename, { bookType: filename.endsWith('.csv') ? 'csv' : 'xlsx' });
}

/** Read the first sheet of an .xlsx/.xls/.csv file into objects keyed by (lower-cased, trimmed) header. */
export async function readRows(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return raw.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      const key = k.toString().trim().toLowerCase().replace(/\s+/g, '_');
      out[key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim();
    }
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
export const toNum = (v: string) => Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
