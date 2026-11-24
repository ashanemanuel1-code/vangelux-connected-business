import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ShoppingBag, Trash2, Upload, Download, FileSpreadsheet, X, Eye, Printer, MessageCircle, Mail, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, fmtDate, today, num, label } from '../lib/format';
import { exportRows, readRows, parseDate, toNum } from '../lib/excel';
import { useLiveRefresh } from '../lib/useRealtime';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, type Customer, type Sale, type SaleItem, type StockLevel } from '../lib/types';
import { saleTotal } from './Customers';
import { buildInvoicePdf, saleTotals, toWhatsAppNumber } from '../lib/pdf';
import { whatsappLink, BRAND } from '../lib/brand';
import { isNativeApp, shareNativeFile } from '../lib/native';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type P = { id: string; name: string; sku: string; sizes: string[]; colors: string[]; selling_price: number; discount_percent: number; status: string; is_concept: boolean };
type Draft = Partial<Sale> & { items: SaleItem[]; newCustomer?: { phone: string; email: string; address: string } };

const blankItem = (): SaleItem => ({ product_id: null, description: '', size: '', color: '', quantity: 1, unit_price: 0, discount_amount: 0 });
const blank = (): Draft => ({ sale_date: today(), customer_id: null, customer_name: '', discount_amount: 0, delivery_fee: 0, amount_paid: 0, payment_method: 'cash', payment_status: 'unpaid', order_status: 'confirmed', notes: '', items: [blankItem()] });

export default function Sales() {
  const toast = useToast();
  const [rows, setRows] = useState<Sale[]>([]);
  const [products, setProducts] = useState<P[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [payFilter, setPayFilter] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    let q = supabase.from('sales').select('*, sale_items(*)').order('sale_date', { ascending: false }).order('created_at', { ascending: false });
    if (month) { const [y, m] = month.split('-').map(Number); q = q.gte('sale_date', `${month}-01`).lt('sale_date', new Date(y, m, 1).toISOString().slice(0, 10)); }
    const [s, p, c, st] = await Promise.all([
      q,
      supabase.from('products').select('id,name,sku,sizes,colors,selling_price,discount_percent,status,is_concept').neq('status', 'archived').order('name'),
      supabase.from('customers').select('*').order('name'),
      supabase.from('stock_levels').select('*'),
    ]);
    if (s.error) toast('error', errMsg(s.error));
    setRows((s.data ?? []) as Sale[]); setProducts((p.data ?? []) as P[]); setCustomers((c.data ?? []) as Customer[]); setStock((st.data ?? []) as StockLevel[]);
    setLoading(false);
  }, [month, toast]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['sales', 'customers'], load);

  const shown = rows.filter((r) => !payFilter || r.payment_status === payFilter);
  const valid = shown.filter((r) => !['cancelled', 'returned'].includes(r.order_status));
  const totals = useMemo(() => ({
    sales: valid.reduce((a, s) => a + saleTotal(s), 0),
    outstanding: valid.filter((s) => s.payment_status !== 'refunded').reduce((a, s) => a + Math.max(saleTotal(s) - num(s.amount_paid), 0), 0),
  }), [valid]);

  // ---------- editor helpers ----------
  const setItem = (idx: number, patch: Partial<SaleItem>) => setEdit((e) => e && ({ ...e, items: e.items.map((it, i) => {
    if (i !== idx) return it;
    // Changing what is sold lets the app re-check stock (unless the stock number itself is being set).
    const reAllocate = !('from_stock' in patch) && ['product_id', 'size', 'color', 'quantity'].some((k) => k in patch);
    return { ...it, ...patch, ...(reAllocate ? { from_stock: null } : {}) };
  }) }));
  function pickProduct(idx: number, pid: string) {
    const p = products.find((x) => x.id === pid);
    if (!p) return setItem(idx, { product_id: null });
    setItem(idx, { product_id: p.id, description: p.name, size: p.sizes[0] ?? '', color: p.colors[0] ?? '', unit_price: Math.round(num(p.selling_price) * (1 - num(p.discount_percent) / 100) * 100) / 100 });
  }
  const draftTotal = edit ? edit.items.reduce((a, i) => a + num(i.quantity) * num(i.unit_price) - num(i.discount_amount), 0) - num(edit.discount_amount) + num(edit.delivery_fee) : 0;
  const inHand = (it: SaleItem) => stock.find((s) => s.product_id === it.product_id && s.size === (it.size ?? '') && s.color === (it.color ?? ''))?.quantity ?? 0;
  /** Stock this line may use: what's in hand + what this same line already took (when editing). */
  const available = (it: SaleItem) => {
    const orig = it.id ? rows.find((r) => r.id === edit?.id)?.sale_items?.find((x) => x.id === it.id) : undefined;
    const origOrder = rows.find((r) => r.id === edit?.id);
    const own = orig && origOrder && !['cancelled', 'returned'].includes(origOrder.order_status) && orig.product_id === it.product_id && (orig.size ?? '') === (it.size ?? '') && (orig.color ?? '') === (it.color ?? '') ? num(orig.from_stock) : 0;
    return Math.max(0, inHand(it) + own);
  };
  /** How many of this line come from stock (preview of what will be saved). */
  const fromStock = (it: SaleItem) => !it.product_id ? 0 : Math.min(Math.max(1, num(it.quantity)), it.from_stock ?? available(it));

  async function save(keepOpen = false): Promise<string | null> {
    if (!edit) return null;
    const items = edit.items.filter((i) => i.description.trim() || i.product_id);
    if (!items.length) { toast('error', 'Add at least one item'); return null; }
    if (!edit.customer_id && !edit.customer_name?.trim()) { toast('error', 'Enter a customer'); return null; }
    setSaving(true);
    try {
      let customer_id = edit.customer_id || null;
      if (!customer_id && edit.customer_name?.trim()) {
        const { data, error } = await supabase.from('customers').insert({ name: edit.customer_name.trim(), phone: edit.newCustomer?.phone || null, email: edit.newCustomer?.email || null, address: edit.newCustomer?.address || null }).select().single();
        if (error) throw error;
        customer_id = data.id;
      }
      const cust = customers.find((c) => c.id === customer_id);
      const payload = {
        sale_date: edit.sale_date, customer_id, customer_name: cust?.name ?? edit.customer_name ?? null,
        discount_amount: num(edit.discount_amount), delivery_fee: num(edit.delivery_fee), amount_paid: num(edit.amount_paid),
        payment_method: edit.payment_method, payment_status: edit.payment_status, order_status: edit.order_status, notes: edit.notes || null,
        ...(edit.invoice_number ? { invoice_number: edit.invoice_number } : {}),
      };
      const res = edit.id ? await supabase.from('sales').update(payload).eq('id', edit.id).select().single() : await supabase.from('sales').insert(payload).select().single();
      if (res.error) throw res.error;
      const saleId = res.data.id as string;

      // Diff items so each line keeps its id => stock deduction is updated, never duplicated.
      const before = rows.find((r) => r.id === saleId)?.sale_items ?? [];
      const keepIds = items.filter((i) => i.id).map((i) => i.id!);
      const toDelete = before.filter((b) => !keepIds.includes(b.id!)).map((b) => b.id!);
      if (toDelete.length) { const { error } = await supabase.from('sale_items').delete().in('id', toDelete); if (error) throw error; }
      for (const it of items) {
        const row = { sale_id: saleId, product_id: it.product_id || null, description: it.description.trim() || 'Item', size: it.size || null, color: it.color || null, quantity: Math.max(1, num(it.quantity)), unit_price: num(it.unit_price), discount_amount: num(it.discount_amount), from_stock: it.from_stock ?? null };
        const { error } = it.id ? await supabase.from('sale_items').update(row).eq('id', it.id) : await supabase.from('sale_items').insert(row);
        if (error) throw error;
      }
      if (keepOpen) {
        // Reload the saved sale (with item ids) so further edits update the same lines.
        const { data: fresh, error } = await supabase.from('sales').select('*, sale_items(*)').eq('id', saleId).single();
        if (error) throw error;
        await load();
        setEdit({ ...(fresh as Sale), items: ((fresh as Sale).sale_items ?? []).map((i) => ({ ...i })) });
      } else { toast('ok', `Sale ${res.data.invoice_number} saved`); setEdit(null); load(); }
      return saleId;
    } catch (e) { toast('error', errMsg(e)); return null; } finally { setSaving(false); }
  }

  // ---------- invoice ----------
  async function invoice(kind: 'preview' | 'download' | 'print' | 'whatsapp' | 'email') {
    setBusy(kind);
    try {
      const id = await save(true); // saves any changes first, so the invoice always matches the sale
      if (!id) return;
      const { data, error } = await supabase.from('sales').select('*, sale_items(*)').eq('id', id).single();
      if (error) throw error;
      const sale = data as Sale;
      const items = sale.sale_items ?? [];
      const cust = sale.customer_id ? (await supabase.from('customers').select('phone,email,address').eq('id', sale.customer_id).maybeSingle()).data : null;
      const doc = await buildInvoicePdf(sale, items, cust);
      const blob = doc.output('blob');
      const file = new File([blob], `${sale.invoice_number}-VANGELUX.pdf`, { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const t = saleTotals(sale, items);
      const summary = `VANGELUX Invoice ${sale.invoice_number}\nFor: ${sale.customer_name || 'Customer'}\nTotal: ${money(t.total)}${t.balance > 0 && sale.payment_status !== 'refunded' ? `\nBalance due: ${money(t.balance)}` : '\nPaid in full — thank you!'}`;
      if (isNativeApp()) { await shareNativeFile(blob, file.name, kind === 'whatsapp' || kind === 'email' ? summary : undefined); return; } // Android app: share menu for every option
      const download = () => { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); };
      if (kind === 'preview') setPreviewUrl(url);
      if (kind === 'download') download();
      if (kind === 'print') {
        const w = window.open(url, '_blank');
        if (!w) download(); else setTimeout(() => { try { w.print(); } catch { /* print from the viewer */ } }, 800);
      }
      if (kind === 'whatsapp' || kind === 'email') {
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: file.name, text: summary }); }
          catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
        } else {
          download();
          if (kind === 'whatsapp') window.open(whatsappLink(summary + '\n\n(PDF attached)', toWhatsAppNumber(cust?.phone) || BRAND.whatsappNumber), '_blank');
          else window.location.href = `mailto:${cust?.email ?? ''}?subject=${encodeURIComponent(`VANGELUX Invoice ${sale.invoice_number}`)}&body=${encodeURIComponent(`Dear ${sale.customer_name || 'Customer'},\n\nPlease find your invoice attached.\n\n${summary}\n\nThank you,\nVANGELUX`)}`;
          toast('ok', 'PDF downloaded — attach it to your message');
        }
      }
    } catch (e) { toast('error', errMsg(e)); } finally { setBusy(''); }
  }

  async function remove(s: Sale) {
    if (!confirmDialog(`Delete sale ${s.invoice_number}? Its stock deduction will be reversed.`)) return;
    const { error } = await supabase.from('sales').delete().eq('id', s.id);
    if (error) return toast('error', errMsg(error)); setEdit(null); load();
  }

  // ---------- import / export ----------
  async function onImport(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const data = await readRows(file, /sale/i);
      const groups = new Map<string, Record<string, string>[]>();
      data.forEach((r, i) => { const k = r.invoice_number || r.invoice || `row-${i}`; groups.set(k, [...(groups.get(k) ?? []), r]); });
      let count = 0;
      for (const [, lines] of groups) {
        const h = lines[0];
        const custName = h.customer || h.customer_name || 'Walk-in customer';
        let cust = customers.find((c) => c.name.toLowerCase() === custName.toLowerCase());
        if (!cust) { const { data: c, error } = await supabase.from('customers').insert({ name: custName, phone: h.phone || null }).select().single(); if (error) throw error; cust = c as Customer; customers.push(cust); }
        const sale = { sale_date: parseDate(h.date || h.sale_date || '') ?? today(), customer_id: cust.id, customer_name: cust.name,
          payment_method: PAYMENT_METHODS.includes((h.payment_method || '').toLowerCase()) ? h.payment_method.toLowerCase() : 'cash',
          payment_status: PAYMENT_STATUSES.includes((h.payment_status || '').toLowerCase()) ? h.payment_status.toLowerCase() : 'paid',
          order_status: ORDER_STATUSES.includes((h.order_status || '').toLowerCase()) ? h.order_status.toLowerCase() : 'completed',
          delivery_fee: toNum(h.delivery_fee || '0'), amount_paid: toNum(h.amount_paid || '0'),
          ...(h.invoice_number || h.invoice ? { invoice_number: h.invoice_number || h.invoice } : {}) };
        const { data: s, error } = await supabase.from('sales').insert(sale).select().single();
        if (error) throw error;
        const items = lines.map((l) => {
          const p = products.find((x) => x.sku.toLowerCase() === (l.sku || '').toLowerCase()) ?? products.find((x) => x.name.toLowerCase() === (l.product || '').toLowerCase());
          return { sale_id: s.id, product_id: p?.id ?? null, description: p?.name ?? (l.product || 'Item'), size: l.size || null, color: l.colour || l.color || null,
            quantity: Math.max(1, toNum(l.quantity || '1')), unit_price: toNum(l.unit_price || l.selling_price || l.price || '0'), discount_amount: toNum(l.discount || '0'),
            // Past orders that were already handed over don't touch the stock you have now.
            ...(['completed', 'delivered', 'shipped'].includes(sale.order_status) ? { from_stock: 0, supply_status: 'received' } : {}) };
        });
        const { error: ie } = await supabase.from('sale_items').insert(items);
        if (ie) throw ie;
        if (!h.amount_paid && sale.payment_status === 'paid') {
          const tot = items.reduce((a, i) => a + i.quantity * i.unit_price - i.discount_amount, 0) + sale.delivery_fee;
          await supabase.from('sales').update({ amount_paid: tot }).eq('id', s.id);
        }
        count++;
      }
      toast('ok', `Imported ${count} sales`); load();
    } catch (e) { toast('error', 'Import stopped: ' + errMsg(e)); load(); } finally { setImporting(false); }
  }

  const exportAll = (ext: 'xlsx' | 'csv') => exportRows(rows.flatMap((s) => (s.sale_items ?? []).map((i) => ({
    Date: s.sale_date, 'Invoice number': s.invoice_number, Customer: s.customer_name, Product: i.description, SKU: products.find((p) => p.id === i.product_id)?.sku ?? '',
    Size: i.size, Colour: i.color, Quantity: i.quantity, 'Unit price': num(i.unit_price), Discount: num(i.discount_amount), 'Line total': num(i.quantity) * num(i.unit_price) - num(i.discount_amount),
    'Sale total': saleTotal(s), 'Amount paid': num(s.amount_paid), 'Payment method': s.payment_method, 'Payment status': s.payment_status, 'Order status': s.order_status,
  }))), `vangelux-sales-${month || 'all'}.${ext}`, 'Sales');

  return (
    <div>
      <PageHeader title="Sales & orders" subtitle={`${money(totals.sales)} sales · ${money(totals.outstanding)} outstanding`}
        actions={<>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant="outline" loading={importing} onClick={() => importRef.current?.click()}><Upload className="h-4 w-4" /> Import</Button>
          <Button variant="outline" onClick={() => exportAll('xlsx')}><Download className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => exportAll('csv')}>CSV</Button>
          <Button variant="gold" onClick={() => setEdit(blank())}><Plus className="h-4 w-4" /> Record sale</Button></>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="month" className="field w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
        <Button variant="ghost" onClick={() => setMonth('')}>All time</Button>
        <select className="field w-auto" value={payFilter} onChange={(e) => setPayFilter(e.target.value)}><option value="">All payments</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <button className="ml-auto flex items-center gap-1 text-xs text-gold-dark underline" onClick={() => exportRows([{ Date: today(), 'Invoice number': '', Customer: 'Kasun Perera', Phone: '0771234567', SKU: products[0]?.sku ?? 'VGX-1001', Product: '', Size: 'L', Colour: 'Black', Quantity: 2, 'Unit price': 4500, Discount: 0, 'Delivery fee': 400, 'Payment method': 'cash', 'Payment status': 'paid', 'Order status': 'completed' }], 'vangelux-sales-import-template.xlsx', 'Sales')}><FileSpreadsheet className="h-3.5 w-3.5" /> Import template</button>
      </div>

      {loading ? <Spinner /> : shown.length === 0 ? <Empty icon={<ShoppingBag className="h-10 w-10" />} title="No sales for this period" /> : (
        <Card className="divide-y divide-neutral-100 p-0 sm:p-0">
          {shown.map((s) => {
            const t = saleTotal(s); const due = Math.max(t - num(s.amount_paid), 0);
            return (
              <button key={s.id} onClick={() => setEdit({ ...s, items: (s.sale_items ?? []).map((i) => ({ ...i })) })} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-neutral-50 sm:p-4">
                <div className="min-w-48 flex-1"><p className="font-medium">{s.customer_name || 'Customer'} <span className="text-xs text-neutral-400">{s.invoice_number}</span></p>
                  <p className="text-xs text-neutral-500">{fmtDate(s.sale_date)} · {(s.sale_items ?? []).map((i) => `${i.quantity}× ${i.description}${i.size ? ` ${i.size}` : ''}`).join(', ')}</p></div>
                <div className="flex items-center gap-1.5">{(() => { const n = (s.sale_items ?? []).filter((i) => i.supply_status === 'to_order' || i.supply_status === 'ordered').reduce((a, i) => a + i.quantity - num(i.from_stock), 0); return n > 0 && !['cancelled', 'returned'].includes(s.order_status) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{n} to order</span> : null; })()}<Badge tone={s.order_status}>{label(s.order_status)}</Badge><Badge tone={s.payment_status}>{s.payment_status}</Badge></div>
                <div className="w-28 text-right"><b>{money(t)}</b>{due > 0 && s.payment_status !== 'refunded' && <p className="text-[11px] text-red-700">due {money(due)}</p>}</div>
              </button>
            );
          })}
        </Card>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Sale ${edit.invoice_number}` : 'Record sale'} wide
        footer={edit && <>{edit.id && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => remove(edit as Sale)}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <span className="mr-2 text-sm">Total <b>{money(draftTotal)}</b></span>
          <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="gold" loading={saving && !busy} onClick={() => save()}>Save sale</Button></>}>
        {edit && <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 p-2">
            <span className="mr-1 flex items-center gap-1 text-sm font-medium"><FileText className="h-4 w-4" /> Invoice</span>
            <Button variant="outline" className="py-1.5 text-xs" loading={busy === 'preview'} onClick={() => invoice('preview')}><Eye className="h-4 w-4" /> Preview</Button>
            <Button variant="outline" className="py-1.5 text-xs" loading={busy === 'download'} onClick={() => invoice('download')}><Download className="h-4 w-4" /> PDF</Button>
            <Button variant="outline" className="py-1.5 text-xs" loading={busy === 'print'} onClick={() => invoice('print')}><Printer className="h-4 w-4" /></Button>
            <Button variant="outline" className="py-1.5 text-xs" loading={busy === 'whatsapp'} onClick={() => invoice('whatsapp')}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
            <Button variant="outline" className="py-1.5 text-xs" loading={busy === 'email'} onClick={() => invoice('email')}><Mail className="h-4 w-4" /></Button>
            {!edit.id && <span className="text-[11px] text-neutral-500">The sale is saved first, then the invoice is created.</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Sale date"><input type="date" className="field" value={edit.sale_date ?? ''} onChange={(e) => setEdit({ ...edit, sale_date: e.target.value })} /></Field>
            <Field label="Invoice number" hint={edit.id ? undefined : 'Leave blank to auto-number'}><input className="field" value={edit.invoice_number ?? ''} onChange={(e) => setEdit({ ...edit, invoice_number: e.target.value })} placeholder="INV-…" /></Field>
            <Field label="Customer">
              <select className="field" value={edit.customer_id ?? ''} onChange={(e) => setEdit({ ...edit, customer_id: e.target.value || null, customer_name: customers.find((c) => c.id === e.target.value)?.name ?? '' })}>
                <option value="">+ New customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
            </Field>
          </div>
          {!edit.customer_id && (
            <div className="grid gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-3">
              <Field label="New customer name"><input className="field" value={edit.customer_name ?? ''} onChange={(e) => setEdit({ ...edit, customer_name: e.target.value })} /></Field>
              <Field label="Phone"><input className="field" type="tel" value={edit.newCustomer?.phone ?? ''} onChange={(e) => setEdit({ ...edit, newCustomer: { phone: e.target.value, email: edit.newCustomer?.email ?? '', address: edit.newCustomer?.address ?? '' } })} /></Field>
              <Field label="Email"><input className="field" type="email" value={edit.newCustomer?.email ?? ''} onChange={(e) => setEdit({ ...edit, newCustomer: { phone: edit.newCustomer?.phone ?? '', email: e.target.value, address: edit.newCustomer?.address ?? '' } })} /></Field>
            </div>
          )}

          <div>
            <p className="field-label">Items</p>
            <div className="space-y-2">
              {edit.items.map((it, idx) => {
                const p = products.find((x) => x.id === it.product_id);
                const fs = fromStock(it);
                const toOrder = Math.max(1, num(it.quantity)) - fs;
                return (
                  <div key={it.id ?? idx} className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 bg-white p-2 sm:grid-cols-12">
                    <select className="field col-span-2 sm:col-span-4" value={it.product_id ?? ''} onChange={(e) => pickProduct(idx, e.target.value)}>
                      <option value="">— Custom item —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.sku})</option>)}
                    </select>
                    {!it.product_id && <input className="field col-span-2 sm:col-span-4" placeholder="Description" value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} />}
                    <select className="field sm:col-span-2" value={it.size ?? ''} onChange={(e) => setItem(idx, { size: e.target.value })}><option value="">Size</option>{(p?.sizes ?? []).map((s) => <option key={s}>{s}</option>)}{it.size && !p?.sizes.includes(it.size) && <option>{it.size}</option>}</select>
                    <select className="field sm:col-span-2" value={it.color ?? ''} onChange={(e) => setItem(idx, { color: e.target.value })}><option value="">Colour</option>{(p?.colors ?? []).map((s) => <option key={s}>{s}</option>)}{it.color && !p?.colors.includes(it.color) && <option>{it.color}</option>}</select>
                    <Field label="Qty" className="sm:col-span-1"><input type="number" min={1} className="field" value={it.quantity} onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} /></Field>
                    <Field label="Unit price" className="sm:col-span-2"><input type="number" className="field" value={it.unit_price || ''} onChange={(e) => setItem(idx, { unit_price: Number(e.target.value) })} /></Field>
                    <Field label="Discount" className="sm:col-span-2"><input type="number" className="field" value={it.discount_amount || ''} onChange={(e) => setItem(idx, { discount_amount: Number(e.target.value) })} /></Field>
                    <div className="col-span-2 flex items-end justify-between gap-2 sm:col-span-12">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
                        {it.product_id && <span>In hand: <b>{available(it)}</b></span>}
                        {it.product_id && <label className="flex items-center gap-1">From stock
                          <input type="number" min={0} max={Math.min(num(it.quantity), available(it))} className="field w-16 px-2 py-1 text-xs" value={fs}
                            onChange={(e) => setItem(idx, { from_stock: Math.max(0, Math.min(Number(e.target.value), num(it.quantity), available(it))) })} /></label>}
                        {toOrder > 0
                          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{toOrder} to order{it.supply_status && it.supply_status !== 'none' && it.supply_status !== 'to_order' ? ` · ${it.supply_status}` : ''}</span>
                          : <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">all from stock</span>}
                      </span>
                      <span className="text-sm">Line: <b>{money(num(it.quantity) * num(it.unit_price) - num(it.discount_amount))}</b></span>
                      <button onClick={() => setEdit({ ...edit, items: edit.items.filter((_, i) => i !== idx) })} className="rounded p-1 text-red-700 hover:bg-red-50"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" className="mt-2" onClick={() => setEdit({ ...edit, items: [...edit.items, blankItem()] })}><Plus className="h-4 w-4" /> Add item</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Order discount (LKR)"><input type="number" className="field" value={edit.discount_amount || ''} onChange={(e) => setEdit({ ...edit, discount_amount: Number(e.target.value) })} /></Field>
            <Field label="Delivery fee (LKR)"><input type="number" className="field" value={edit.delivery_fee || ''} onChange={(e) => setEdit({ ...edit, delivery_fee: Number(e.target.value) })} /></Field>
            <Field label="Amount paid (LKR)"><div className="flex gap-1"><input type="number" className="field" value={edit.amount_paid || ''} onChange={(e) => setEdit({ ...edit, amount_paid: Number(e.target.value) })} />
              <Button variant="outline" className="px-2 text-xs" onClick={() => setEdit({ ...edit, amount_paid: draftTotal, payment_status: 'paid' })}>Full</Button></div></Field>
            <Field label="Payment method"><select className="field" value={edit.payment_method} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
            <Field label="Payment status"><select className="field" value={edit.payment_status} onChange={(e) => setEdit({ ...edit, payment_status: e.target.value })}>{PAYMENT_STATUSES.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
            <Field label="Order status"><select className="field" value={edit.order_status} onChange={(e) => setEdit({ ...edit, order_status: e.target.value })}>{ORDER_STATUSES.map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></Field>
          </div>
          <Field label="Notes"><textarea className="field" value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          <p className="text-xs text-neutral-500">The app takes what you have in hand first; the rest goes on the <b>To order</b> list. Only the “from stock” part is deducted. Cancelling or returning the order puts the stock back.</p>
        </div>}
      </Modal>

      <Modal open={!!previewUrl} onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }} title="Invoice preview" wide>
        <iframe src={previewUrl} title="Invoice preview" className="h-[75vh] w-full rounded-lg border" />
        <p className="mt-2 text-xs text-neutral-500">If the preview is blank on your phone, use the PDF button to open it.</p>
      </Modal>
    </div>
  );
}
