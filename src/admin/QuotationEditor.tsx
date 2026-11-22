import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, X, Eye, Download, Printer, MessageCircle, Mail, Save, ShoppingBag, Trash2, Shirt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mediaUrl } from '../lib/storage';
import { money, num, today, addDays, fmtDate, label } from '../lib/format';
import { buildQuotationPdf, quoteTotals, toWhatsAppNumber } from '../lib/pdf';
import { whatsappLink, BRAND } from '../lib/brand';
import { QUOTE_STATUSES, type Customer, type Quotation, type QuotationItem, type QuoteStatus } from '../lib/types';
import { Badge, Button, Card, Field, Modal, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type P = { id: string; name: string; sku: string; sizes: string[]; colors: string[]; selling_price: number; discount_percent: number; product_images: { storage_path: string; is_main: boolean }[] };

const DEFAULT_TERMS = [
  'All prices are in Sri Lankan Rupees (LKR).',
  'A 50% advance payment is required to confirm the order; the balance is payable before dispatch.',
  'Production timelines begin after artwork, sizes and the advance payment are confirmed.',
  'Colours may vary slightly between screen and print. Final sizes are as per the VANGELUX size chart.',
  'This quotation is valid for the period stated above.',
].map((t, i) => `${i + 1}. ${t}`).join('\n');

const blankItem = (n = 0): QuotationItem => ({ product_id: null, description: '', sku: null, size: '', color: '', quantity: 1, unit_price: 0, discount_amount: 0, sort_order: n });

export default function QuotationEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [products, setProducts] = useState<P[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState<Quotation>({
    id: '', quote_number: '', customer_id: null, customer_name: '', customer_phone: '', customer_email: '', customer_address: '',
    issue_date: today(), validity_days: 14, discount_amount: 0, delivery_fee: 0, terms: DEFAULT_TERMS, notes: '', status: 'draft', converted_sale_id: null, created_at: '',
  });
  const [items, setItems] = useState<QuotationItem[]>([blankItem()]);
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from('products').select('id,name,sku,sizes,colors,selling_price,discount_percent,product_images(storage_path,is_main)').neq('status', 'archived').order('name'),
        supabase.from('customers').select('*').order('name'),
      ]);
      setProducts((p.data ?? []) as P[]); setCustomers((c.data ?? []) as Customer[]);
      if (id) {
        const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', id).single();
        if (error || !data) { toast('error', 'Quotation not found'); nav('/admin/quotations'); return; }
        const { quotation_items, ...rest } = data as Quotation;
        setQ(rest as Quotation);
        setItems((quotation_items ?? []).sort((a, b) => a.sort_order - b.sort_order));
      }
      setLoading(false);
    })();
  }, [id, nav, toast]);

  const t = quoteTotals(q, items);
  const imageFor = (pid: string | null) => {
    const p = products.find((x) => x.id === pid);
    const img = p?.product_images?.find((i) => i.is_main) ?? p?.product_images?.[0];
    return img ? mediaUrl(img.storage_path) : null;
  };
  const setItem = (i: number, patch: Partial<QuotationItem>) => setItems((it) => it.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  function pickProduct(i: number, pid: string) {
    const p = products.find((x) => x.id === pid);
    if (!p) return setItem(i, { product_id: null, sku: null });
    setItem(i, { product_id: p.id, description: p.name, sku: p.sku, size: p.sizes[0] ?? '', color: p.colors[0] ?? '', unit_price: Math.round(num(p.selling_price) * (1 - num(p.discount_percent) / 100) * 100) / 100 });
  }
  function pickCustomer(cid: string) {
    const c = customers.find((x) => x.id === cid);
    setQ((x) => ({ ...x, customer_id: c?.id ?? null, customer_name: c?.name ?? x.customer_name, customer_phone: c?.phone ?? x.customer_phone, customer_email: c?.email ?? x.customer_email, customer_address: c?.address ?? x.customer_address }));
  }

  async function save(statusOverride?: QuoteStatus): Promise<Quotation | null> {
    if (!q.customer_name.trim()) { toast('error', 'Customer name is required'); return null; }
    const clean = items.filter((i) => i.description.trim() || i.product_id);
    if (!clean.length) { toast('error', 'Add at least one item'); return null; }
    setSaving(true);
    try {
      const payload = {
        customer_id: q.customer_id, customer_name: q.customer_name.trim(), customer_phone: q.customer_phone || null, customer_email: q.customer_email || null,
        customer_address: q.customer_address || null, issue_date: q.issue_date, validity_days: num(q.validity_days), discount_amount: num(q.discount_amount),
        delivery_fee: num(q.delivery_fee), terms: q.terms || null, notes: q.notes || null, status: statusOverride ?? q.status,
      };
      const res = q.id ? await supabase.from('quotations').update(payload).eq('id', q.id).select().single() : await supabase.from('quotations').insert(payload).select().single();
      if (res.error) throw res.error;
      const saved = res.data as Quotation;
      // items are simple children of the quotation (no stock effect) — replace them
      await supabase.from('quotation_items').delete().eq('quotation_id', saved.id);
      const { error } = await supabase.from('quotation_items').insert(clean.map((it, i) => ({
        quotation_id: saved.id, product_id: it.product_id, description: it.description.trim() || 'Item', sku: it.sku, size: it.size || null, color: it.color || null,
        quantity: Math.max(1, num(it.quantity)), unit_price: num(it.unit_price), discount_amount: num(it.discount_amount), sort_order: i,
      })));
      if (error) throw error;
      setQ(saved); setItems(clean);
      if (!q.id) nav(`/admin/quotations/${saved.id}`, { replace: true });
      toast('ok', `Quotation ${saved.quote_number} saved`);
      return saved;
    } catch (e) { toast('error', errMsg(e)); return null; } finally { setSaving(false); }
  }

  async function makePdf(saved?: Quotation | null) {
    const qq = saved ?? (await save());
    if (!qq) return null;
    const clean = items.filter((i) => i.description.trim() || i.product_id);
    const doc = await buildQuotationPdf(qq, clean, clean.map((i) => imageFor(i.product_id)));
    const blob = doc.output('blob');
    return { doc, blob, file: new File([blob], `${qq.quote_number}-VANGELUX.pdf`, { type: 'application/pdf' }), qq };
  }

  async function action(kind: 'preview' | 'download' | 'print' | 'whatsapp' | 'email') {
    setBusy(kind);
    try {
      const r = await makePdf();
      if (!r) return;
      const url = URL.createObjectURL(r.blob);
      const summary = `VANGELUX Quotation ${r.qq.quote_number}\nFor: ${r.qq.customer_name}\nTotal: ${money(quoteTotals(r.qq, items).total)}\nValid until: ${fmtDate(addDays(r.qq.issue_date, r.qq.validity_days))}`;
      if (kind === 'preview') setPreviewUrl(url);
      if (kind === 'download') { const a = document.createElement('a'); a.href = url; a.download = r.file.name; a.click(); }
      if (kind === 'print') {
        const w = window.open(url, '_blank');
        if (!w) { const a = document.createElement('a'); a.href = url; a.download = r.file.name; a.click(); }
        else setTimeout(() => { try { w.print(); } catch { /* user can print from the viewer */ } }, 800);
      }
      if (kind === 'whatsapp' || kind === 'email') {
        // Phones: share the actual PDF file through the system share sheet (WhatsApp, Gmail, …)
        if (navigator.canShare?.({ files: [r.file] })) {
          try { await navigator.share({ files: [r.file], title: r.file.name, text: summary }); }
          catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
        } else {
          // Desktop: download the PDF, then open WhatsApp / email with the message ready to attach it
          const a = document.createElement('a'); a.href = url; a.download = r.file.name; a.click();
          if (kind === 'whatsapp') window.open(whatsappLink(summary + '\n\n(PDF attached)', toWhatsAppNumber(r.qq.customer_phone) || BRAND.whatsappNumber), '_blank');
          else window.location.href = `mailto:${r.qq.customer_email ?? ''}?subject=${encodeURIComponent(`VANGELUX Quotation ${r.qq.quote_number}`)}&body=${encodeURIComponent(`Dear ${r.qq.customer_name},\n\nPlease find our quotation attached.\n\n${summary}\n\nThank you,\nVANGELUX`)}`;
          toast('ok', 'PDF downloaded — attach it to your message');
        }
        if (r.qq.status === 'draft') { await supabase.from('quotations').update({ status: 'sent' }).eq('id', r.qq.id); setQ((x) => ({ ...x, status: 'sent' })); }
      }
    } catch (e) { toast('error', errMsg(e)); } finally { setBusy(''); }
  }

  async function convert() {
    if (q.status !== 'accepted') { if (!confirmDialog('Mark this quotation as Accepted and create an order?')) return; }
    const saved = await save('accepted');
    if (!saved) return;
    const { data, error } = await supabase.rpc('convert_quotation_to_sale', { p_quotation_id: saved.id });
    if (error) return toast('error', errMsg(error));
    toast('ok', 'Order created — stock has been reserved/deducted'); setQ((x) => ({ ...x, status: 'accepted', converted_sale_id: data as string }));
    nav('/admin/sales');
  }

  async function remove() {
    if (!confirmDialog(`Delete quotation ${q.quote_number}?`)) return;
    const { error } = await supabase.from('quotations').delete().eq('id', q.id);
    if (error) return toast('error', errMsg(error));
    nav('/admin/quotations');
  }

  if (loading) return <Spinner />;
  const locked = !!q.converted_sale_id;

  return (
    <div className="pb-20">
      <Link to="/admin/quotations" className="mb-3 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Quotations</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">{q.quote_number || 'New quotation'}</h1>
        <Badge tone={q.status}>{q.status}</Badge>
        {locked && <Badge tone="completed">converted to order</Badge>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-1">
          <h2 className="font-semibold">Customer</h2>
          <Field label="Existing customer (optional)"><select className="field" value={q.customer_id ?? ''} onChange={(e) => pickCustomer(e.target.value)}><option value="">— New / not saved —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Customer name *"><input className="field" value={q.customer_name} onChange={(e) => setQ({ ...q, customer_name: e.target.value })} /></Field>
          <Field label="Phone"><input className="field" type="tel" value={q.customer_phone ?? ''} onChange={(e) => setQ({ ...q, customer_phone: e.target.value })} /></Field>
          <Field label="Email"><input className="field" type="email" value={q.customer_email ?? ''} onChange={(e) => setQ({ ...q, customer_email: e.target.value })} /></Field>
          <Field label="Address"><textarea className="field" value={q.customer_address ?? ''} onChange={(e) => setQ({ ...q, customer_address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issue date"><input type="date" className="field" value={q.issue_date} onChange={(e) => setQ({ ...q, issue_date: e.target.value })} /></Field>
            <Field label="Valid (days)"><input type="number" min={1} className="field" value={q.validity_days} onChange={(e) => setQ({ ...q, validity_days: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Status"><select className="field" value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value as QuoteStatus })}>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Items</h2>
          <div className="space-y-3">
            {items.map((it, i) => {
              const p = products.find((x) => x.id === it.product_id);
              const img = imageFor(it.product_id);
              return (
                <div key={i} className="flex gap-3 rounded-xl border border-neutral-200 p-3">
                  <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-charcoal">{img ? <img src={img} className="h-full w-full object-cover" alt="" /> : <Shirt className="m-auto mt-6 h-6 w-6 text-neutral-600" />}</div>
                  <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-6">
                    <select className="field col-span-2 sm:col-span-3" value={it.product_id ?? ''} onChange={(e) => pickProduct(i, e.target.value)}>
                      <option value="">— Custom item —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.sku})</option>)}
                    </select>
                    <input className="field col-span-2 sm:col-span-3" placeholder="Description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                    <select className="field" value={it.size ?? ''} onChange={(e) => setItem(i, { size: e.target.value })}><option value="">Size</option>{(p?.sizes ?? []).map((s) => <option key={s}>{s}</option>)}{it.size && !p?.sizes.includes(it.size) && <option>{it.size}</option>}</select>
                    <input className="field" placeholder="Colour" list={`colors-${i}`} value={it.color ?? ''} onChange={(e) => setItem(i, { color: e.target.value })} />
                    <datalist id={`colors-${i}`}>{p?.colors.map((c) => <option key={c} value={c} />)}</datalist>
                    <Field label="Qty"><input type="number" min={1} className="field" value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} /></Field>
                    <Field label="Unit price"><input type="number" className="field" value={it.unit_price || ''} onChange={(e) => setItem(i, { unit_price: Number(e.target.value) })} /></Field>
                    <Field label="Discount"><input type="number" className="field" value={it.discount_amount || ''} onChange={(e) => setItem(i, { discount_amount: Number(e.target.value) })} /></Field>
                    <div className="flex items-end justify-between gap-2"><b className="text-sm">{money(num(it.quantity) * num(it.unit_price) - num(it.discount_amount))}</b>
                      <button onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="rounded p-1 text-red-700 hover:bg-red-50"><X className="h-4 w-4" /></button></div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="mt-3" onClick={() => setItems([...items, blankItem(items.length)])}><Plus className="h-4 w-4" /> Add item</Button>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Field label="Overall discount (LKR)"><input type="number" className="field" value={q.discount_amount || ''} onChange={(e) => setQ({ ...q, discount_amount: Number(e.target.value) })} /></Field>
              <Field label="Delivery fee (LKR)"><input type="number" className="field" value={q.delivery_fee || ''} onChange={(e) => setQ({ ...q, delivery_fee: Number(e.target.value) })} /></Field>
            </div>
            <div className="rounded-xl bg-ink p-4 text-sm text-ivory">
              <div className="flex justify-between"><span className="text-neutral-400">Subtotal</span><span>{money(t.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Discount</span><span>- {money(t.discount)}</span></div>
              <div className="flex justify-between"><span className="text-neutral-400">Delivery</span><span>{money(t.delivery)}</span></div>
              <div className="gold-rule my-2" />
              <div className="flex justify-between text-lg font-semibold text-gold"><span>Final amount</span><span>{money(t.total)}</span></div>
            </div>
          </div>
          <Field label="Notes (shown on PDF)" className="mt-4"><textarea className="field" value={q.notes ?? ''} onChange={(e) => setQ({ ...q, notes: e.target.value })} /></Field>
          <Field label="Terms & conditions" className="mt-3"><textarea className="field min-h-32 text-xs" value={q.terms ?? ''} onChange={(e) => setQ({ ...q, terms: e.target.value })} /></Field>
        </Card>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          {q.id && <Button variant="ghost" className="mr-auto text-red-700" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}
          <Button variant="outline" loading={busy === 'preview'} onClick={() => action('preview')}><Eye className="h-4 w-4" /> Preview</Button>
          <Button variant="outline" loading={busy === 'download'} onClick={() => action('download')}><Download className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" loading={busy === 'print'} onClick={() => action('print')}><Printer className="h-4 w-4" /></Button>
          <Button variant="outline" loading={busy === 'whatsapp'} onClick={() => action('whatsapp')}><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
          <Button variant="outline" loading={busy === 'email'} onClick={() => action('email')}><Mail className="h-4 w-4" /></Button>
          <Button variant="primary" loading={saving} onClick={() => save()}><Save className="h-4 w-4" /> Save</Button>
          {!locked && q.id && ['sent', 'accepted', 'draft'].includes(q.status) && <Button variant="gold" onClick={convert}><ShoppingBag className="h-4 w-4" /> Convert to order</Button>}
        </div>
      </div>

      <Modal open={!!previewUrl} onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }} title="Quotation preview" wide>
        <iframe src={previewUrl} title="PDF preview" className="h-[75vh] w-full rounded-lg border" />
        <p className="mt-2 text-xs text-neutral-500">If the preview is blank on your phone, use the PDF button to open it.</p>
      </Modal>
    </div>
  );
}
