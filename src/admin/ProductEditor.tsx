import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { isNativeApp } from '../lib/native';
import {
  ArrowLeft, Camera, ImagePlus, Star, Trash2, RefreshCw, Loader2, X, Eye, Archive, Lock, Save,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadMedia, mediaUrl, deleteMedia } from '../lib/storage';
import { money, num, round2, effectivePrice } from '../lib/format';
import type { ImageKind, Product, ProductStatus, StockLevel } from '../lib/types';
import { useLookups } from './useAdminData';
import { Badge, Button, Card, Field, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

interface EditImage { id?: string; storage_path: string; kind: ImageKind; is_main: boolean; sort_order: number; uploading?: boolean; previewUrl?: string; key: string }

const emptyCosts = { manufacturing_cost: 0, fabric_cost: 0, printing_cost: 0, packaging_cost: 0, transport_cost: 0, other_cost: 0, wholesale_price: 0, supplier: '', internal_notes: '' };
type Costs = typeof emptyCosts;

export default function ProductEditor() {
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const toast = useToast();
  const lk = useLookups();
  const [charts, setCharts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { supabase.from('size_charts').select('id,name').order('sort_order').order('created_at').then(({ data }) => setCharts(data ?? [])); }, []);
  const [productId] = useState(() => id ?? crypto.randomUUID());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState({
    name: '', sku: '', description: '', collection_id: '', size_chart_id: '', category_id: '', target_customer_id: '', fit_type_id: '',
    sizes: [] as string[], colors: [] as string[], selling_price: 0, discount_percent: 0, is_concept: false,
    status: 'draft' as ProductStatus, low_stock_threshold: 5, sort_order: 0,
  });
  const [costs, setCosts] = useState<Costs>(emptyCosts);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [images, setImages] = useState<EditImage[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [newColor, setNewColor] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const [{ data, error }, st] = await Promise.all([
        supabase.from('products').select('*, product_images(*), product_tags(tag_id), product_costs(*)').eq('id', productId).single(),
        supabase.from('stock_levels').select('*').eq('product_id', productId),
      ]);
      if (error || !data) { toast('error', 'Product not found'); nav('/admin/products'); return; }
      const p = data as Product;
      setF({
        name: p.name, sku: p.sku, description: p.description ?? '', collection_id: p.collection_id ?? '', size_chart_id: p.size_chart_id ?? '', category_id: p.category_id ?? '',
        target_customer_id: p.target_customer_id ?? '', fit_type_id: p.fit_type_id ?? '', sizes: p.sizes ?? [], colors: p.colors ?? [],
        selling_price: num(p.selling_price), discount_percent: num(p.discount_percent), is_concept: p.is_concept, status: p.status,
        low_stock_threshold: p.low_stock_threshold, sort_order: p.sort_order,
      });
      const c = Array.isArray(p.product_costs) ? p.product_costs[0] : p.product_costs;
      if (c) setCosts({
        manufacturing_cost: num(c.manufacturing_cost), fabric_cost: num(c.fabric_cost), printing_cost: num(c.printing_cost),
        packaging_cost: num(c.packaging_cost), transport_cost: num(c.transport_cost), other_cost: num(c.other_cost),
        wholesale_price: num(c.wholesale_price), supplier: c.supplier ?? '', internal_notes: c.internal_notes ?? '',
      });
      setTagIds((p.product_tags ?? []).map((t) => t.tag_id));
      setImages((p.product_images ?? []).sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ ...i, key: i.id })));
      setStock((st.data ?? []) as StockLevel[]);
      setLoading(false);
    })();
  }, [isNew, productId, nav, toast]);

  // suggest a SKU for new products
  useEffect(() => {
    if (!isNew || f.sku) return;
    const n = String(Math.floor(Math.random() * 9000) + 1000);
    setF((x) => ({ ...x, sku: `VGX-${n}` }));
  }, [isNew, f.sku]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  // ---------- pricing ----------
  const totalCost = round2(costs.manufacturing_cost + costs.fabric_cost + costs.printing_cost + costs.packaging_cost + costs.transport_cost + costs.other_cost);
  const sell = effectivePrice(f.selling_price, f.discount_percent);
  const profit = round2(sell - totalCost);
  const margin = sell > 0 ? round2((profit / sell) * 100) : 0;
  const wholesaleProfit = round2(costs.wholesale_price - totalCost);

  // ---------- sizes ----------
  const targetName = lk.targets.find((t) => t.id === f.target_customer_id)?.name ?? '';
  const sizeGroups = useMemo(() => {
    const groups: { title: string; items: string[] }[] = [];
    const adult = lk.sizes.filter((s) => s.size_group === 'adult' && s.is_active).map((s) => s.label);
    const kids = lk.sizes.filter((s) => s.size_group === 'kids' && s.is_active).map((s) => s.label);
    const other = lk.sizes.filter((s) => s.size_group === 'other' && s.is_active).map((s) => s.label);
    if (targetName !== 'Kids') groups.push({ title: 'Adult sizes', items: adult });
    // don't show the same label (e.g. "Custom") twice
    if (targetName === 'Kids' || targetName === 'Custom' || targetName === 'Unisex' || !targetName) groups.push({ title: 'Kids sizes', items: targetName === 'Kids' ? kids : kids.filter((k) => !adult.includes(k)) });
    if (other.length) groups.push({ title: 'Other', items: other });
    return groups;
  }, [lk.sizes, targetName]);
  const toggleSize = (s: string) => set('sizes', f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s]);

  // ---------- images ----------
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const pending = useRef<{ kind: ImageKind; replaceKey?: string }>({ kind: 'detail' });

  function pick(kind: ImageKind, camera = false, replaceKey?: string) {
    pending.current = { kind, replaceKey };
    (camera ? camRef : fileRef).current?.click();
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const { kind, replaceKey } = pending.current;
    const files = Array.from(list).slice(0, replaceKey || kind !== 'detail' ? 1 : 12);
    for (const file of files) {
      const key = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setImages((imgs) => {
        let next = [...imgs];
        let isMain = next.length === 0;
        if (replaceKey) {
          const old = next.find((i) => i.key === replaceKey);
          if (old) { isMain = old.is_main; markRemoved(old); next = next.filter((i) => i.key !== replaceKey); }
        } else if (kind !== 'detail') {
          // only one front and one back image — replace any existing one
          const old = next.find((i) => i.kind === kind);
          if (old) { isMain = old.is_main; markRemoved(old); next = next.filter((i) => i.key !== old.key); }
          if (kind === 'front' && !next.some((i) => i.is_main)) isMain = true;
        }
        return [...next, { key, storage_path: '', kind, is_main: isMain, sort_order: next.length, uploading: true, previewUrl }];
      });
      try {
        const path = await uploadMedia(file, `products/${productId}`);
        setImages((imgs) => imgs.map((i) => (i.key === key ? { ...i, storage_path: path, uploading: false } : i)));
      } catch (e) {
        toast('error', 'Upload failed: ' + errMsg(e));
        setImages((imgs) => imgs.filter((i) => i.key !== key));
      }
    }
  }

  function markRemoved(img: EditImage) {
    if (img.id) setRemovedIds((r) => [...r, img.id!]);
    if (img.storage_path) setRemovedPaths((r) => [...r, img.storage_path]);
  }
  function removeImage(img: EditImage) {
    markRemoved(img);
    setImages((imgs) => {
      const next = imgs.filter((i) => i.key !== img.key);
      if (img.is_main && next.length) next[0] = { ...next[0], is_main: true };
      return next;
    });
  }
  const setMain = (img: EditImage) => setImages((imgs) => imgs.map((i) => ({ ...i, is_main: i.key === img.key })));
  const setKind = (img: EditImage, kind: ImageKind) => setImages((imgs) => imgs.map((i) => (i.key === img.key ? { ...i, kind } : i)));

  // ---------- tags ----------
  const toggleTag = (tid: string) => setTagIds((t) => (t.includes(tid) ? t.filter((x) => x !== tid) : [...t, tid]));
  async function createTag() {
    const name = newTag.trim(); if (!name) return;
    const { data, error } = await supabase.from('tags').insert({ name, color: '#C9A24A', sort_order: lk.tags.length + 1 }).select().single();
    if (error) return toast('error', errMsg(error));
    setNewTag(''); await lk.reload(); setTagIds((t) => [...t, data.id]);
  }

  // ---------- save ----------
  async function save(statusOverride?: ProductStatus) {
    if (!f.name.trim()) return toast('error', 'Product name is required');
    if (!f.sku.trim()) return toast('error', 'SKU is required');
    if (images.some((i) => i.uploading)) return toast('error', 'Please wait for images to finish uploading');
    const status = statusOverride ?? f.status;
    if (status === 'published' && !images.length) {
      if (!confirmDialog('This product has no images. Publish anyway?')) return;
    }
    setSaving(true);
    try {
      const row = {
        id: productId, name: f.name.trim(), sku: f.sku.trim(), description: f.description.trim() || null,
        collection_id: f.collection_id || null, size_chart_id: f.size_chart_id || null, category_id: f.category_id || null, target_customer_id: f.target_customer_id || null,
        fit_type_id: f.fit_type_id || null, sizes: f.sizes, colors: f.colors, selling_price: num(f.selling_price),
        discount_percent: num(f.discount_percent), is_concept: f.is_concept, status, low_stock_threshold: num(f.low_stock_threshold), sort_order: num(f.sort_order),
      };
      const { error: pe } = await supabase.from('products').upsert(row);
      if (pe) throw pe;

      const { error: ce } = await supabase.from('product_costs').upsert({
        product_id: productId, manufacturing_cost: num(costs.manufacturing_cost), fabric_cost: num(costs.fabric_cost),
        printing_cost: num(costs.printing_cost), packaging_cost: num(costs.packaging_cost), transport_cost: num(costs.transport_cost),
        other_cost: num(costs.other_cost), wholesale_price: num(costs.wholesale_price), supplier: costs.supplier || null, internal_notes: costs.internal_notes || null,
      });
      if (ce) throw ce;

      // tags: replace set
      await supabase.from('product_tags').delete().eq('product_id', productId);
      if (tagIds.length) {
        const { error } = await supabase.from('product_tags').insert(tagIds.map((tag_id) => ({ product_id: productId, tag_id })));
        if (error) throw error;
      }

      // images: delete removed, clear main flag, then upsert all
      if (removedIds.length) await supabase.from('product_images').delete().in('id', [...new Set(removedIds)]);
      await supabase.from('product_images').update({ is_main: false }).eq('product_id', productId);
      if (images.length) {
        const imgRows = images.map((i, idx) => ({
          ...(i.id ? { id: i.id } : {}), product_id: productId, storage_path: i.storage_path, kind: i.kind, is_main: i.is_main, sort_order: idx,
        }));
        const withId = imgRows.filter((r) => 'id' in r);
        const withoutId = imgRows.filter((r) => !('id' in r));
        if (withId.length) { const { error } = await supabase.from('product_images').upsert(withId); if (error) throw error; }
        if (withoutId.length) { const { error } = await supabase.from('product_images').insert(withoutId); if (error) throw error; }
      }
      if (removedPaths.length) await deleteMedia([...new Set(removedPaths)]);

      toast('ok', status === 'published' ? 'Saved — live on the public showroom' : 'Product saved');
      nav('/admin/products');
    } catch (e) {
      toast('error', errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function hardDelete() {
    if (!confirmDialog('Permanently delete this product and its images? Sales history keeps the line description. This cannot be undone. (Tip: Archive keeps the record.)')) return;
    setSaving(true);
    const paths = images.map((i) => i.storage_path).filter(Boolean);
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) { setSaving(false); return toast('error', errMsg(error)); }
    await deleteMedia(paths);
    toast('ok', 'Product deleted');
    nav('/admin/products');
  }

  if (loading || lk.loading) return <Spinner />;

  const front = images.find((i) => i.kind === 'front');
  const back = images.find((i) => i.kind === 'back');
  const details = images.filter((i) => i.kind === 'detail');

  return (
    <div className="pb-20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to="/admin/products" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-ink"><ArrowLeft className="h-4 w-4" /> Products</Link>
        <div className="flex items-center gap-2">
          <Badge tone={f.status}>{f.status}</Badge>
          {f.status === 'published' && !isNativeApp() && <Link to={`/product/${productId}`} target="_blank" className="flex items-center gap-1 text-xs text-gold-dark hover:underline"><Eye className="h-3.5 w-3.5" /> View live</Link>}
        </div>
      </div>
      <h1 className="mb-5 font-display text-2xl font-semibold">{isNew ? 'Add product' : f.name || 'Edit product'}</h1>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ---------------- images ---------------- */}
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Product images</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['front', 'back'] as const).map((kind) => {
              const img = kind === 'front' ? front : back;
              return (
                <div key={kind}>
                  <p className="field-label">{kind === 'front' ? 'Front design' : 'Back design'}</p>
                  {img ? <ImageTile img={img} onMain={setMain} onRemove={removeImage} onReplace={() => pick(kind, false, img.key)} />
                    : <UploadSlot onGallery={() => pick(kind)} onCamera={() => pick(kind, true)} />}
                </div>
              );
            })}
          </div>
          <p className="field-label mt-4">Additional detail images</p>
          <div className="grid grid-cols-3 gap-2">
            {details.map((img) => (
              <ImageTile key={img.key} img={img} small onMain={setMain} onRemove={removeImage} onReplace={() => pick('detail', false, img.key)} onKind={setKind} />
            ))}
            <UploadSlot small onGallery={() => pick('detail')} onCamera={() => pick('detail', true)} />
          </div>
          <p className="mt-3 text-xs text-neutral-500">Tap ★ to choose the main image shown on the showroom. Photos are resized on your device and uploaded straight to cloud storage.</p>
        </Card>

        {/* ---------------- details ---------------- */}
        <Card className="space-y-4 lg:col-span-3">
          <h2 className="font-semibold">Product details</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product name *" className="sm:col-span-2"><input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Great Commission Oversized Tee" /></Field>
            <Field label="Product code / SKU *"><input className="field font-mono" value={f.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} /></Field>
          </div>
          <Field label="Description"><textarea className="field min-h-24" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="The message, fabric, print details…" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Size chart" hint={charts.length ? 'Shown to customers as “Size guide”' : undefined}>
              <select className="field" value={f.size_chart_id} onChange={(e) => set('size_chart_id', e.target.value)}>
                <option value="">— None —</option>
                {charts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!charts.length && <Link to="/admin/size-charts" className="mt-1 inline-block text-xs font-semibold text-gold-dark hover:underline">+ Upload size charts first →</Link>}
            </Field>
            <Field label="Collection">
              <select className="field" value={f.collection_id} onChange={(e) => set('collection_id', e.target.value)}>
                <option value="">— None —</option>
                {lk.collections.map((c) => <option key={c.id} value={c.id}>{[c.volume_label, c.name].filter(Boolean).join(' — ')}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className="field" value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>
                <option value="">— Select —</option>
                {lk.categories.filter((c) => c.is_active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Target customer">
              <select className="field" value={f.target_customer_id} onChange={(e) => set('target_customer_id', e.target.value)}>
                <option value="">— Select —</option>
                {lk.targets.filter((c) => c.is_active || c.id === f.target_customer_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Fit type">
              <select className="field" value={f.fit_type_id} onChange={(e) => set('fit_type_id', e.target.value)}>
                <option value="">— Select —</option>
                {lk.fitTypes.filter((c) => c.is_active || c.id === f.fit_type_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <p className="field-label">Sizes</p>
            {sizeGroups.map((g) => (
              <div key={g.title} className="mb-2">
                <p className="mb-1 text-[11px] text-neutral-400">{g.title}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <button key={g.title + s} type="button" onClick={() => toggleSize(s)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${f.sizes.includes(s) ? 'border-ink bg-ink text-ivory' : 'border-neutral-300 bg-white hover:border-gold'}`}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {f.sizes.filter((s) => !sizeGroups.some((g) => g.items.includes(s))).map((s) => (
                <span key={s} className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs text-ivory">{s}<button onClick={() => toggleSize(s)}><X className="h-3 w-3" /></button></span>
              ))}
              <input className="field w-40 py-1.5 text-xs" placeholder="Custom size…" value={customSize} onChange={(e) => setCustomSize(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && customSize.trim()) { e.preventDefault(); set('sizes', [...f.sizes, customSize.trim()]); setCustomSize(''); } }} />
            </div>
          </div>

          <div>
            <p className="field-label">Colours</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {f.colors.map((c) => (
                <span key={c} className="flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs">{c}<button onClick={() => set('colors', f.colors.filter((x) => x !== c))}><X className="h-3 w-3" /></button></span>
              ))}
              {['Black', 'White', 'Ivory'].filter((c) => !f.colors.includes(c)).map((c) => (
                <button key={c} type="button" onClick={() => set('colors', [...f.colors, c])} className="rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500 hover:border-gold">+ {c}</button>
              ))}
              <input className="field w-36 py-1.5 text-xs" placeholder="Add colour…" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newColor.trim()) { e.preventDefault(); if (!f.colors.includes(newColor.trim())) set('colors', [...f.colors, newColor.trim()]); setNewColor(''); } }} />
            </div>
          </div>

          <div>
            <p className="field-label">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {lk.tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} title={t.is_public ? 'Shown on showroom' : 'Internal only'}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${on ? 'text-white' : 'bg-white text-neutral-600 hover:border-gold'}`}
                    style={on ? { background: t.color, borderColor: t.color } : { borderColor: '#d4d4d4' }}>
                    {!t.is_public && <Lock className="mr-1 inline h-3 w-3" />}{t.name}
                  </button>
                );
              })}
              <input className="field w-36 py-1.5 text-xs" placeholder="New tag…" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createTag(); } }} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Product status">
              <select className="field" value={f.status} onChange={(e) => set('status', e.target.value as ProductStatus)}>
                <option value="draft">Draft (hidden)</option><option value="published">Published (on showroom)</option><option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Low-stock alert at"><input type="number" min={0} className="field" value={f.low_stock_threshold} onChange={(e) => set('low_stock_threshold', Number(e.target.value))} /></Field>
            <Field label="Display order"><input type="number" className="field" value={f.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-gold" checked={f.is_concept} onChange={(e) => set('is_concept', e.target.checked)} />
            <span><b>Concept / mockup design</b> — shows a “concept” label in your product list. Stock is handled separately in Inventory.</span>
          </label>
        </Card>

        {/* ---------------- pricing ---------------- */}
        <Card className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Pricing & costs</h2>
            <span className="flex items-center gap-1 text-xs text-neutral-500"><Lock className="h-3.5 w-3.5" /> Costs are private — never shown publicly</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['manufacturing_cost', 'Manufacturing'], ['fabric_cost', 'Fabric'], ['printing_cost', 'Printing'], ['packaging_cost', 'Packaging'], ['transport_cost', 'Transport'], ['other_cost', 'Other']] as const).map(([k, l]) => (
              <Field key={k} label={`${l} cost (LKR)`}>
                <input type="number" min={0} step="0.01" inputMode="decimal" className="field" value={costs[k] || ''} onChange={(e) => setCosts((c) => ({ ...c, [k]: Number(e.target.value) }))} />
              </Field>
            ))}
          </div>
          <div className="my-4 rounded-xl bg-neutral-50 px-4 py-3 text-sm">Total unit cost: <b>{money(totalCost)}</b></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Retail selling price (LKR) *"><input type="number" min={0} step="0.01" inputMode="decimal" className="field" value={f.selling_price || ''} onChange={(e) => set('selling_price', Number(e.target.value))} /></Field>
            <Field label="Discount %"><input type="number" min={0} max={100} step="0.5" className="field" value={f.discount_percent || ''} onChange={(e) => set('discount_percent', Number(e.target.value))} /></Field>
            <Field label="Wholesale price (LKR)"><input type="number" min={0} step="0.01" inputMode="decimal" className="field" value={costs.wholesale_price || ''} onChange={(e) => setCosts((c) => ({ ...c, wholesale_price: Number(e.target.value) }))} /></Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Customer pays" value={money(sell)} />
            <Stat label="Profit / unit" value={money(profit)} tone={profit < 0 ? 'bad' : 'good'} />
            <Stat label="Gross margin" value={`${margin.toFixed(1)}%`} tone={margin < 0 ? 'bad' : 'good'} />
            <Stat label="Wholesale profit" value={money(wholesaleProfit)} tone={wholesaleProfit < 0 ? 'bad' : undefined} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Supplier (private)"><input className="field" value={costs.supplier} onChange={(e) => setCosts((c) => ({ ...c, supplier: e.target.value }))} /></Field>
            <Field label="Internal notes (private)"><input className="field" value={costs.internal_notes} onChange={(e) => setCosts((c) => ({ ...c, internal_notes: e.target.value }))} /></Field>
          </div>
        </Card>

        {/* ---------------- stock ---------------- */}
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Stock</h2>
          <p className="mb-3 text-xs text-neutral-500">Products are your catalogue. What you have in hand is recorded in <b>Inventory</b>; orders use it first and the rest goes on the <b>To order</b> list.</p>
          {isNew ? <p className="text-sm text-neutral-500">Save the product, then add the stock you have in Inventory.</p> : (
            <>
              {stock.length === 0 ? <p className="text-sm text-neutral-500">No stock in hand — orders for this design are made to order.</p> : (
                <table className="w-full text-sm"><tbody>
                  {stock.map((s) => (
                    <tr key={s.size + s.color} className="border-b border-neutral-100"><td className="py-1.5">{[s.size || 'One size', s.color].filter(Boolean).join(' · ')}</td>
                      <td className={`text-right font-semibold ${s.quantity <= f.low_stock_threshold ? 'text-red-700' : ''}`}>{s.quantity}</td></tr>
                  ))}
                </tbody></table>
              )}
              <Link to={`/admin/inventory?product=${productId}`} className="mt-3 inline-block text-sm font-semibold text-gold-dark hover:underline">Add / adjust stock in Inventory →</Link>
            </>
          )}
        </Card>
      </div>

      {/* sticky actions */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2">
          {!isNew && <Button variant="ghost" className="mr-auto text-red-700" onClick={hardDelete} disabled={saving}><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Delete</span></Button>}
          {!isNew && f.status !== 'archived' && <Button variant="outline" onClick={() => save('archived')} disabled={saving}><Archive className="h-4 w-4" /><span className="hidden sm:inline">Archive</span></Button>}
          <Button variant="outline" onClick={() => save()} loading={saving}><Save className="h-4 w-4" /> Save</Button>
          {f.status !== 'published'
            ? <Button variant="gold" onClick={() => save('published')} loading={saving}><Eye className="h-4 w-4" /> Save & publish</Button>
            : <Button variant="outline" onClick={() => save('draft')} disabled={saving}>Unpublish</Button>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`mt-0.5 font-semibold ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : ''}`}>{value}</p>
    </div>
  );
}

function UploadSlot({ onGallery, onCamera, small }: { onGallery: () => void; onCamera: () => void; small?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 ${small ? 'aspect-square p-1' : 'aspect-[4/5] p-3'}`}>
      <button type="button" onClick={onGallery} className="flex flex-col items-center gap-1 text-xs font-medium text-neutral-600 hover:text-gold-dark">
        <ImagePlus className={small ? 'h-5 w-5' : 'h-7 w-7'} />{small ? 'Add' : 'Upload image'}
      </button>
      <button type="button" onClick={onCamera} className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-neutral-500 shadow-sm hover:text-gold-dark">
        <Camera className="h-3.5 w-3.5" />{!small && ' Camera'}
      </button>
    </div>
  );
}

function ImageTile({ img, small, onMain, onRemove, onReplace, onKind }: {
  img: EditImage; small?: boolean; onMain: (i: EditImage) => void; onRemove: (i: EditImage) => void; onReplace: () => void; onKind?: (i: EditImage, k: ImageKind) => void;
}) {
  const src = img.previewUrl ?? mediaUrl(img.storage_path);
  return (
    <div className={`group relative overflow-hidden rounded-xl bg-charcoal ${small ? 'aspect-square' : 'aspect-[4/5]'} ${img.is_main ? 'ring-2 ring-gold ring-offset-2' : ''}`}>
      <img src={src} alt="" className="h-full w-full object-cover" />
      {img.uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-1.5">
        <button type="button" onClick={() => onMain(img)} title="Set as main image" className={`rounded-full p-1.5 ${img.is_main ? 'bg-gold text-ink' : 'bg-black/50 text-white'}`}><Star className="h-3.5 w-3.5" /></button>
        <div className="flex gap-1">
          <button type="button" onClick={onReplace} title="Replace" className="rounded-full bg-black/50 p-1.5 text-white"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => onRemove(img)} title="Delete" className="rounded-full bg-black/50 p-1.5 text-white hover:bg-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {onKind && !small && (
        <select value={img.kind} onChange={(e) => onKind(img, e.target.value as ImageKind)} className="absolute right-1 top-1 rounded bg-black/60 text-[10px] text-white">
          <option value="front">Front</option><option value="back">Back</option><option value="detail">Detail</option>
        </select>
      )}
      {img.is_main && <span className="absolute left-1.5 top-1.5 rounded bg-gold px-1.5 py-0.5 text-[9px] font-bold text-ink">MAIN</span>}
    </div>
  );
}
