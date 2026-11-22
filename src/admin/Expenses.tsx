import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Receipt, Upload, Download, Paperclip, Trash2, FileSpreadsheet, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, fmtDate, today, num } from '../lib/format';
import { uploadReceipt, receiptUrl, deleteReceipt } from '../lib/storage';
import { exportRows, readRows, parseDate, toNum } from '../lib/excel';
import { useLiveRefresh } from '../lib/useRealtime';
import { PAYMENT_METHODS, type Expense } from '../lib/types';
import { useLookups, nameOf } from './useAdminData';
import { Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

const blank = (): Partial<Expense> => ({ expense_date: today(), description: '', amount: 0, vendor: '', payment_method: 'cash', category_id: null, receipt_path: null });

export default function Expenses() {
  const toast = useToast();
  const lk = useLookups();
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [edit, setEdit] = useState<Partial<Expense> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    let q = supabase.from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false });
    if (month) { const [y, m] = month.split('-').map(Number); const end = new Date(y, m, 1).toISOString().slice(0, 10); q = q.gte('expense_date', `${month}-01`).lt('expense_date', end); }
    const { data, error } = await q;
    if (error) toast('error', errMsg(error));
    setRows((data ?? []) as Expense[]); setLoading(false);
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['expenses'], load);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(nameOf(lk.expenseCategories, r.category_id) || 'Uncategorised', (m.get(nameOf(lk.expenseCategories, r.category_id) || 'Uncategorised') ?? 0) + num(r.amount)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, lk.expenseCategories]);
  const total = rows.reduce((a, r) => a + num(r.amount), 0);

  async function onReceipt(file?: File) {
    if (!file || !edit) return;
    setUploading(true);
    try { const path = await uploadReceipt(file); setEdit((e) => ({ ...e!, receipt_path: path })); }
    catch (e) { toast('error', errMsg(e)); } finally { setUploading(false); }
  }

  async function save() {
    if (!edit) return;
    if (!edit.description?.trim() || !num(edit.amount)) return toast('error', 'Description and amount are required');
    setSaving(true);
    const payload = { expense_date: edit.expense_date, category_id: edit.category_id || null, description: edit.description.trim(), vendor: edit.vendor || null, amount: num(edit.amount), payment_method: edit.payment_method || null, receipt_path: edit.receipt_path || null };
    const old = rows.find((r) => r.id === edit.id);
    const { error } = edit.id ? await supabase.from('expenses').update(payload).eq('id', edit.id) : await supabase.from('expenses').insert(payload);
    setSaving(false);
    if (error) return toast('error', errMsg(error));
    if (old?.receipt_path && old.receipt_path !== edit.receipt_path) await deleteReceipt(old.receipt_path);
    toast('ok', 'Expense saved'); setEdit(null); load();
  }

  async function remove(r: Expense) {
    if (!confirmDialog(`Delete expense “${r.description}” (${money(r.amount)})?`)) return;
    const { error } = await supabase.from('expenses').delete().eq('id', r.id);
    if (error) return toast('error', errMsg(error));
    if (r.receipt_path) await deleteReceipt(r.receipt_path);
    setEdit(null); load();
  }

  async function openReceipt(path: string) {
    try { window.open(await receiptUrl(path), '_blank'); } catch (e) { toast('error', errMsg(e)); }
  }

  async function onImport(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const data = await readRows(file, /expense/i);
      // Accepts the app template (Category, Amount) and the VANGELUX expense sheet
      // (Expense Type, Quantity, Cost per Item, Total Cost).
      const parsed = data.map((r) => {
        const catName = (r.category || r.expense_type || r.type || '').trim();
        const qty = toNum(r.quantity || r.qty || '1') || 1;
        const unit = toNum(r.cost_per_item || r.unit_cost || r.cost || r.price || '0');
        const amount = toNum(r.amount || r.total_cost || r.total || '0') || Math.round(qty * unit * 100) / 100;
        const base = (r.description || r.item || catName || 'Expense').trim();
        const description = qty !== 1 && unit ? `${base} (${qty} × ${money(unit)})` : base;
        const pm = (r.payment_method || r.payment || '').trim().toLowerCase().replace(/\s+/g, '_');
        return { catName, row: { expense_date: parseDate(r.date ?? r.expense_date ?? '') ?? today(), description, vendor: r.vendor || r.supplier || null, amount, payment_method: pm ? (PAYMENT_METHODS.includes(pm) ? pm : pm.replace(/_/g, ' ')) : null } };
      }).filter((x) => x.row.amount > 0);
      if (!parsed.length) throw new Error('No rows with an amount were found. Use columns like: Date, Category (or Expense Type), Description, Quantity, Cost per Item, Total Cost (or Amount), Payment Method.');

      // Expense types that aren't categories yet are created automatically.
      const known = new Map(lk.expenseCategories.map((c) => [c.name.toLowerCase(), c.id]));
      const missing = [...new Set(parsed.map((x) => x.catName).filter((n) => n && !known.has(n.toLowerCase())))];
      if (missing.length) {
        const { data: added, error } = await supabase.from('expense_categories')
          .insert(missing.map((name, i) => ({ name, sort_order: lk.expenseCategories.length + i + 1 }))).select('id,name');
        if (error) throw error;
        (added ?? []).forEach((c) => known.set(c.name.toLowerCase(), c.id));
        await lk.reload();
      }

      // Skip rows already in the app (same date, description and amount), so importing the same sheet twice is safe.
      const dates = [...new Set(parsed.map((x) => x.row.expense_date))];
      const { data: existing, error: exErr } = await supabase.from('expenses').select('expense_date,description,amount').in('expense_date', dates);
      if (exErr) throw exErr;
      const seen = new Set((existing ?? []).map((e) => `${e.expense_date}|${e.description}|${num(e.amount)}`));
      const out = parsed
        .map((x) => ({ ...x.row, category_id: x.catName ? known.get(x.catName.toLowerCase()) ?? null : null }))
        .filter((r) => { const k = `${r.expense_date}|${r.description}|${r.amount}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const skipped = parsed.length - out.length;
      if (out.length) { const { error } = await supabase.from('expenses').insert(out); if (error) throw error; }
      toast('ok', `Imported ${out.length} expense${out.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} already in the app (skipped)` : ''}${missing.length ? ` · new categories: ${missing.join(', ')}` : ''}`);
      setMonth(''); load();
    } catch (e) { toast('error', errMsg(e)); } finally { setImporting(false); }
  }

  const exportAll = (ext: 'xlsx' | 'csv') => exportRows(rows.map((r) => ({ Date: r.expense_date, Category: nameOf(lk.expenseCategories, r.category_id), Description: r.description, Vendor: r.vendor, Amount: num(r.amount), 'Payment method': r.payment_method, 'Has receipt': r.receipt_path ? 'yes' : '' })), `vangelux-expenses-${month || 'all'}.${ext}`, 'Expenses');

  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${money(total)} in ${month || 'all time'}`}
        actions={<>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="outline" loading={importing} onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>
          <Button variant="outline" onClick={() => exportAll('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => exportAll('csv')}>CSV</Button>
          <Button variant="gold" onClick={() => setEdit(blank())}><Plus className="h-4 w-4" /> Add expense</Button></>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="month" className="field w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button variant="ghost" onClick={() => setMonth('')}>All time</Button>
        <button className="ml-auto flex items-center gap-1 text-xs text-gold-dark underline" onClick={() => exportRows([{ Date: today(), 'Expense Type': 'Printing', Description: 'DTF prints batch', Quantity: 10, 'Cost per Item (LKR)': 300, 'Total Cost (LKR)': 3000, 'Payment Method': 'Bank Transfer', Vendor: 'Print shop' }], 'vangelux-expense-import-template.xlsx', 'Expenses')}><FileSpreadsheet className="h-3.5 w-3.5" /> Import template</button>
      </div>

      {byCat.length > 0 && <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">{byCat.map(([n, v]) => <div key={n} className="shrink-0 rounded-xl border border-neutral-200 bg-white px-4 py-2"><p className="text-[11px] uppercase text-neutral-500">{n}</p><p className="font-semibold">{money(v)}</p></div>)}</div>}

      {loading ? <Spinner /> : rows.length === 0 ? <Empty icon={<Receipt className="h-10 w-10" />} title="No expenses for this period" /> : (
        <Card className="divide-y divide-neutral-100 p-0 sm:p-0">
          {rows.map((r) => (
            <button key={r.id} onClick={() => setEdit(r)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-neutral-50 sm:p-4">
              <div className="flex-1"><p className="font-medium">{r.description}</p><p className="text-xs text-neutral-500">{fmtDate(r.expense_date)} · {nameOf(lk.expenseCategories, r.category_id) || 'Uncategorised'}{r.vendor ? ` · ${r.vendor}` : ''}</p></div>
              {r.receipt_path && <Paperclip className="h-4 w-4 text-gold-dark" />}
              <b>{money(r.amount)}</b>
            </button>
          ))}
        </Card>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit expense' : 'Add expense'}
        footer={edit && <>{edit.id && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => remove(edit as Expense)}><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="gold" loading={saving} onClick={save}>Save</Button></>}>
        {edit && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" className="field" value={edit.expense_date ?? ''} onChange={(e) => setEdit({ ...edit, expense_date: e.target.value })} /></Field>
            <Field label="Amount (LKR) *"><input type="number" inputMode="decimal" className="field" value={edit.amount || ''} onChange={(e) => setEdit({ ...edit, amount: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Category"><select className="field" value={edit.category_id ?? ''} onChange={(e) => setEdit({ ...edit, category_id: e.target.value || null })}>
            <option value="">— Select —</option>{lk.expenseCategories.filter((c) => c.is_active || c.id === edit.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Description *"><input className="field" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor"><input className="field" value={edit.vendor ?? ''} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} /></Field>
            <Field label="Paid by"><select className="field" value={edit.payment_method ?? ''} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}>
              {['cash', 'bank_transfer', 'card', 'online', 'other'].map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></Field>
          </div>
          <div>
            <p className="field-label">Receipt</p>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onReceipt(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onReceipt(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" type="button" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" /> {edit.receipt_path ? 'Replace' : 'Attach'}</Button>
              <Button variant="outline" type="button" onClick={() => camRef.current?.click()}><Camera className="h-4 w-4" /> Photo</Button>
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-gold" />}
              {edit.receipt_path && !uploading && <><button className="text-sm text-gold-dark underline" onClick={() => openReceipt(edit.receipt_path!)}>View receipt</button>
                <button className="text-xs text-red-700" onClick={() => setEdit({ ...edit, receipt_path: null })}>Remove</button></>}
            </div>
            <p className="mt-1 text-xs text-neutral-500">Receipts are stored in a private bucket — only signed-in staff can open them.</p>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
