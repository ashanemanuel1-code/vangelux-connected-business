import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Shirt, Eye, EyeOff, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mediaUrl } from '../lib/storage';
import { money } from '../lib/format';
import { useLiveRefresh } from '../lib/useRealtime';
import type { Product, StockLevel } from '../lib/types';
import { useLookups, nameOf } from './useAdminData';
import { Badge, Button, Empty, PageHeader, Spinner, useToast, errMsg } from '../components/ui';

export default function Products() {
  const nav = useNavigate();
  const toast = useToast();
  const lk = useLookups();
  const [rows, setRows] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'draft' | 'published' | 'archived' | 'all'>('active');
  const [collection, setCollection] = useState('');

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from('products').select('*, product_images(*), product_tags(tag_id), product_costs(total_unit_cost)').order('sort_order').order('created_at', { ascending: false }),
      supabase.from('stock_levels').select('*'),
    ]);
    if (p.error) toast('error', errMsg(p.error));
    setRows((p.data ?? []) as Product[]);
    setStock((s.data ?? []) as StockLevel[]);
    setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['products', 'product_images', 'product_tags', 'inventory_movements'], load);

  const filtered = useMemo(() => rows.filter((p) => {
    if (status === 'active' && p.status === 'archived') return false;
    if (status !== 'active' && status !== 'all' && p.status !== status) return false;
    if (collection && p.collection_id !== collection) return false;
    const t = q.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t);
  }), [rows, q, status, collection]);

  const stockOf = (id: string) => stock.filter((s) => s.product_id === id).reduce((a, s) => a + s.quantity, 0);

  async function togglePublish(p: Product) {
    const next = p.status === 'published' ? 'draft' : 'published';
    const { error } = await supabase.from('products').update({ status: next }).eq('id', p.id);
    if (error) return toast('error', errMsg(error));
    toast('ok', next === 'published' ? `“${p.name}” is now live on the showroom` : `“${p.name}” removed from the showroom`);
    load();
  }

  return (
    <div>
      <PageHeader title="Products" subtitle={`${rows.filter((r) => r.status === 'published').length} published · ${rows.length} total`}
        actions={<Button variant="gold" onClick={() => nav('/admin/products/new')}><Plus className="h-4 w-4" /> Add product</Button>} />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
          <input className="field pl-9" placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">Active (not archived)</option><option value="published">Published</option>
          <option value="draft">Draft</option><option value="archived">Archived</option><option value="all">All</option>
        </select>
        <select className="field w-auto" value={collection} onChange={(e) => setCollection(e.target.value)}>
          <option value="">All collections</option>
          {lk.collections.map((c) => <option key={c.id} value={c.id}>{[c.volume_label, c.name].filter(Boolean).join(' — ')}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <Empty icon={<Shirt className="h-10 w-10" />} title="No products yet" text="Add your first design with photos straight from your phone or computer."
          action={<Button variant="gold" onClick={() => nav('/admin/products/new')}><Plus className="h-4 w-4" /> Add product</Button>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            const main = p.product_images?.find((i) => i.is_main) ?? p.product_images?.[0];
            const qty = stockOf(p.id);
            return (
              <div key={p.id} className="group overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <Link to={`/admin/products/${p.id}`} className="relative block aspect-[4/5] bg-charcoal">
                  {main ? <img src={mediaUrl(main.storage_path)} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                    : <div className="flex h-full items-center justify-center text-neutral-600"><Shirt className="h-10 w-10" /></div>}
                  <div className="absolute left-2 top-2"><Badge tone={p.status}>{p.status}</Badge></div>
                  {p.is_concept && <div className="absolute right-2 top-2"><Badge>concept</Badge></div>}
                </Link>
                <div className="p-3">
                  <Link to={`/admin/products/${p.id}`} className="line-clamp-1 font-semibold hover:text-gold-dark">{p.name}</Link>
                  <p className="text-xs text-neutral-500">{p.sku} · {nameOf(lk.categories, p.category_id) || 'No category'}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{money(p.selling_price)}</span>
                    <span className={`text-xs ${qty > 0 && qty <= p.low_stock_threshold ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>{qty > 0 ? `${qty} in stock` : 'made to order'}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.product_tags?.slice(0, 3).map((t) => { const tag = lk.tags.find((x) => x.id === t.tag_id); return tag ? <Badge key={t.tag_id} color={tag.color}>{tag.name}</Badge> : null; })}
                  </div>
                  {p.status !== 'archived' && (
                    <button onClick={() => togglePublish(p)} className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-semibold ${p.status === 'published' ? 'border-neutral-300 text-neutral-600 hover:bg-neutral-50' : 'border-gold bg-gold/10 text-gold-dark hover:bg-gold/20'}`}>
                      {p.status === 'published' ? <><EyeOff className="h-3.5 w-3.5" /> Unpublish</> : <><Eye className="h-3.5 w-3.5" /> Publish</>}
                    </button>
                  )}
                  {main && !main.is_main && <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-700"><Star className="h-3 w-3" /> No main image chosen</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
