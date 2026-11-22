import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, AlertTriangle, Plus, Download, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtDate, label, num } from '../lib/format';
import { exportRows } from '../lib/excel';
import { useLiveRefresh } from '../lib/useRealtime';
import { MOVEMENT_TYPES, type InventoryMovement, type StockLevel } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg } from '../components/ui';

type P = { id: string; name: string; sku: string; sizes: string[]; colors: string[]; is_concept: boolean; low_stock_threshold: number; status: string };

export default function Inventory() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<P[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [moves, setMoves] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ product_id: string; size: string; color: string; type: string; qty: number; note: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulk, setBulk] = useState<{ product_id: string; qty: Record<string, number>; note: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const productFilter = params.get('product') ?? '';

  const load = useCallback(async () => {
    const [p, s, m] = await Promise.all([
      supabase.from('products').select('id,name,sku,sizes,colors,is_concept,low_stock_threshold,status').neq('status', 'archived').order('name'),
      supabase.from('stock_levels').select('*'),
      supabase.from('inventory_movements').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setProducts((p.data ?? []) as P[]); setStock((s.data ?? []) as StockLevel[]); setMoves((m.data ?? []) as InventoryMovement[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['inventory_movements', 'products'], load);

  // Inventory is separate from the catalogue: any product can hold stock.
  const physical = products;
  const low = useMemo(() => stock.filter((s) => { const p = physical.find((x) => x.id === s.product_id); return p && s.quantity <= p.low_stock_threshold; }), [stock, physical]);
  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? '(deleted product)';
  const hasStock = (id: string) => stock.some((s) => s.product_id === id && s.quantity !== 0);
  const shown = physical.filter((p) => (productFilter ? p.id === productFilter : showAll || hasStock(p.id)));

  function openForm(product_id = productFilter || physical[0]?.id || '') {
    const p = products.find((x) => x.id === product_id);
    setForm({ product_id, size: p?.sizes[0] ?? '', color: p?.colors[0] ?? '', type: 'addition', qty: 1, note: '' });
  }

  async function save() {
    if (!form?.product_id) return toast('error', 'Choose a product');
    if (!form.qty) return toast('error', 'Enter a quantity');
    const signed = form.type === 'damaged' ? -Math.abs(form.qty) : form.type === 'adjustment' ? form.qty : Math.abs(form.qty);
    setSaving(true);
    const { error } = await supabase.from('inventory_movements').insert({ product_id: form.product_id, size: form.size, color: form.color, movement_type: form.type, quantity: signed, note: form.note || null });
    setSaving(false);
    if (error) return toast('error', errMsg(error));
    toast('ok', 'Stock updated'); setForm(null); load();
  }

  const fp = products.find((p) => p.id === form?.product_id);
  const bp = products.find((p) => p.id === bulk?.product_id);
  const combos = (p?: P) => (p ? (p.sizes.length ? p.sizes : ['']).flatMap((sz) => (p.colors.length ? p.colors : ['']).map((c) => ({ size: sz, color: c, key: `${sz}|${c}` }))) : []);

  async function saveBulk() {
    if (!bulk?.product_id) return toast('error', 'Choose a product');
    const rows = Object.entries(bulk.qty).filter(([, q]) => num(q) > 0).map(([k, q]) => {
      const [size, color] = k.split('|');
      return { product_id: bulk.product_id, size, color, movement_type: 'addition', quantity: Math.round(num(q)), note: bulk.note || 'Stock in hand' };
    });
    if (!rows.length) return toast('error', 'Enter at least one quantity');
    setSaving(true);
    const { error } = await supabase.from('inventory_movements').insert(rows);
    setSaving(false);
    if (error) return toast('error', errMsg(error));
    toast('ok', `Added ${rows.reduce((a, r) => a + r.quantity, 0)} pieces to stock`); setBulk(null); load();
  }

  return (
    <div>
      <PageHeader title="Inventory" subtitle="What you have in hand, by design, size and colour. Orders use this stock first; anything missing goes on the To order list. Customers never see stock."
        actions={<>
          <Button variant="outline" onClick={() => exportRows(stock.map((s) => ({ Product: pName(s.product_id), Size: s.size, Colour: s.color, Quantity: s.quantity })), 'vangelux-stock.xlsx', 'Stock')}><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" onClick={() => openForm()} disabled={!physical.length}><SlidersHorizontal className="h-4 w-4" /> Adjust</Button>
          <Button variant="gold" onClick={() => setBulk({ product_id: productFilter || physical[0]?.id || '', qty: {}, note: '' })} disabled={!physical.length}><Plus className="h-4 w-4" /> Add stock</Button></>} />

      {low.length > 0 && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <p className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> Low stock ({low.length})</p>
          <div className="flex flex-wrap gap-2">{low.map((s) => <span key={s.product_id + s.size + s.color} className="rounded-full bg-white px-3 py-1 text-xs">{pName(s.product_id)} {[s.size, s.color].filter(Boolean).join(' · ')}: <b className="text-red-700">{s.quantity}</b></span>)}</div>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="field max-w-sm" value={productFilter} onChange={(e) => setParams(e.target.value ? { product: e.target.value } : {})}>
          <option value="">{showAll ? 'All designs' : 'Designs with stock'}</option>{physical.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!productFilter && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show designs with no stock</label>}
      </div>

      {loading ? <Spinner /> : physical.length === 0 ? <Empty icon={<Boxes className="h-10 w-10" />} title="Add your designs in Products first" text="Then come back here and add the stock you have in hand." />
        : shown.length === 0 ? <Empty icon={<Boxes className="h-10 w-10" />} title="No stock in hand yet" text="Tap “Add stock” to record what you already have. Designs without stock are taken as pre-orders." /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {shown.map((p) => {
            const rows = stock.filter((s) => s.product_id === p.id);
            const total = rows.reduce((a, s) => a + s.quantity, 0);
            return (
              <Card key={p.id}>
                <div className="mb-2 flex items-center justify-between"><div><p className="font-semibold">{p.name}</p><p className="text-xs text-neutral-500">{p.sku}</p></div>
                  <div className="text-right"><p className="text-xl font-semibold">{total}</p><p className="text-[10px] uppercase text-neutral-500">units</p></div></div>
                {rows.length === 0 ? <p className="text-sm text-neutral-500">No stock recorded.</p> : (
                  <div className="flex flex-wrap gap-1.5">{rows.map((s) => (
                    <span key={s.size + s.color} className={`rounded-lg border px-2 py-1 text-xs ${s.quantity <= p.low_stock_threshold ? 'border-red-300 bg-red-50 text-red-800' : 'border-neutral-200'}`}>{[s.size || 'One size', s.color].filter(Boolean).join(' · ')}: <b>{s.quantity}</b></span>
                  ))}</div>
                )}
                <div className="mt-3 flex gap-4 text-sm font-semibold text-gold-dark">
                  <button onClick={() => setBulk({ product_id: p.id, qty: {}, note: '' })}>+ Add stock</button>
                  <button onClick={() => openForm(p.id)}>Adjust</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-2 mt-8 font-display text-lg">Recent movements</h2>
      <Card className="overflow-x-auto p-0 sm:p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500"><tr><th className="p-3">Date</th><th>Product</th><th>Size / colour</th><th>Type</th><th className="text-right">Qty</th><th className="p-3">Note</th></tr></thead>
          <tbody>{moves.filter((m) => !productFilter || m.product_id === productFilter).map((m) => (
            <tr key={m.id} className="border-t border-neutral-100"><td className="p-3">{fmtDate(m.created_at)}</td><td>{pName(m.product_id)}</td><td>{[m.size, m.color].filter(Boolean).join(' · ') || '—'}</td>
              <td><Badge>{label(m.movement_type)}</Badge></td><td className={`text-right font-semibold ${m.quantity < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td><td className="p-3 text-neutral-500">{m.note}</td></tr>
          ))}</tbody>
        </table>
      </Card>

      <Modal open={!!bulk} onClose={() => setBulk(null)} title="Add stock in hand"
        footer={<><Button variant="ghost" onClick={() => setBulk(null)}>Cancel</Button><Button variant="gold" loading={saving} onClick={saveBulk}>Add to stock</Button></>}>
        {bulk && <div className="space-y-3">
          <Field label="Design"><select className="field" value={bulk.product_id} onChange={(e) => setBulk({ ...bulk, product_id: e.target.value, qty: {} })}>
            {physical.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></Field>
          <div>
            <p className="field-label">How many do you have? <span className="font-normal text-neutral-500">(leave blank for none)</span></p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {combos(bp).map((c) => {
                const now = stock.find((s) => s.product_id === bulk.product_id && s.size === c.size && s.color === c.color)?.quantity ?? 0;
                return (
                  <label key={c.key} className="rounded-xl border border-neutral-200 p-2 text-sm">
                    <span className="block font-medium">{[c.size || 'One size', c.color].filter(Boolean).join(' · ')}</span>
                    <span className="block text-[11px] text-neutral-500">now {now}</span>
                    <input type="number" min={0} inputMode="numeric" className="field mt-1 py-1.5" placeholder="0" value={bulk.qty[c.key] || ''}
                      onChange={(e) => setBulk({ ...bulk, qty: { ...bulk.qty, [c.key]: Number(e.target.value) } })} />
                  </label>
                );
              })}
            </div>
            {bp && !bp.sizes.length && !bp.colors.length && <p className="mt-2 text-xs text-neutral-500">Tip: add sizes and colours to this design in Products to record stock per size.</p>}
          </div>
          <Field label="Note (optional)"><input className="field" value={bulk.note} onChange={(e) => setBulk({ ...bulk, note: e.target.value })} placeholder="e.g. Stock in hand, Batch 2 from printer" /></Field>
        </div>}
      </Modal>

      <Modal open={!!form} onClose={() => setForm(null)} title="Adjust stock"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button variant="gold" loading={saving} onClick={save}>Save</Button></>}>
        {form && <div className="space-y-3">
          <Field label="Product"><select className="field" value={form.product_id} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setForm({ ...form, product_id: e.target.value, size: p?.sizes[0] ?? '', color: p?.colors[0] ?? '' }); }}>
            {physical.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Size"><select className="field" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}><option value="">One size / none</option>{fp?.sizes.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Colour"><select className="field" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}><option value="">— none —</option>{fp?.colors.map((s) => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
            <Field label="Quantity" hint={form.type === 'adjustment' ? 'Use a negative number to reduce stock' : form.type === 'damaged' ? 'Will be removed from stock' : 'Will be added to stock'}>
              <input type="number" className="field" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Note"><input className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. Batch from printer, 2 returned by customer…" /></Field>
        </div>}
      </Modal>
    </div>
  );
}
