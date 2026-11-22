import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Layers, ImagePlus, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadMedia, mediaUrl, deleteMedia } from '../lib/storage';
import { label } from '../lib/format';
import { useLiveRefresh } from '../lib/useRealtime';
import { COLLECTION_STATUSES, type Collection, type CollectionStatus } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type ProductLite = { id: string; name: string; sku: string; status: string; collection_id: string | null };
const blank: Omit<Collection, 'id'> = { volume_label: '', name: '', tagline: '', scripture: '', description: '', artwork_path: null, status: 'concept', is_published: false, sort_order: 0 };

export default function Collections() {
  const toast = useToast();
  const [rows, setRows] = useState<Collection[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<(Omit<Collection, 'id'> & { id?: string }) | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('collections').select('*').order('sort_order').order('created_at'),
      supabase.from('products').select('id,name,sku,status,collection_id').neq('status', 'archived').order('name'),
    ]);
    setRows((c.data ?? []) as Collection[]); setProducts((p.data ?? []) as ProductLite[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['collections', 'products'], load);

  function open(c?: Collection) {
    setEdit(c ? { ...c } : { ...blank, sort_order: rows.length + 1 });
    setAssigned(c ? products.filter((p) => p.collection_id === c.id).map((p) => p.id) : []);
  }

  async function onArtwork(file?: File) {
    if (!file || !edit) return;
    setUploading(true);
    try {
      const path = await uploadMedia(file, 'collections');
      setEdit({ ...edit, artwork_path: path });
    } catch (e) { toast('error', errMsg(e)); } finally { setUploading(false); }
  }

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) return toast('error', 'Collection name is required');
    setSaving(true);
    try {
      const { id, ...rest } = edit;
      const payload = { ...rest, volume_label: rest.volume_label || null, tagline: rest.tagline || null, scripture: rest.scripture || null, description: rest.description || null };
      const res = id ? await supabase.from('collections').update(payload).eq('id', id).select().single()
        : await supabase.from('collections').insert(payload).select().single();
      if (res.error) throw res.error;
      const cid = res.data.id as string;
      // remove old artwork file if replaced
      const prev = rows.find((r) => r.id === id);
      if (prev?.artwork_path && prev.artwork_path !== edit.artwork_path) await deleteMedia([prev.artwork_path]);
      // product membership
      const before = products.filter((p) => p.collection_id === cid).map((p) => p.id);
      const toRemove = before.filter((x) => !assigned.includes(x));
      const toAdd = assigned.filter((x) => !before.includes(x));
      if (toRemove.length) { const { error } = await supabase.from('products').update({ collection_id: null }).in('id', toRemove); if (error) throw error; }
      if (toAdd.length) { const { error } = await supabase.from('products').update({ collection_id: cid }).in('id', toAdd); if (error) throw error; }
      toast('ok', 'Collection saved'); setEdit(null); load();
    } catch (e) { toast('error', errMsg(e)); } finally { setSaving(false); }
  }

  async function remove(c: Collection) {
    if (!confirmDialog(`Delete collection “${c.name}”? Its products stay, but will no longer belong to a collection.`)) return;
    const { error } = await supabase.from('collections').delete().eq('id', c.id);
    if (error) return toast('error', errMsg(error));
    if (c.artwork_path) await deleteMedia([c.artwork_path]);
    toast('ok', 'Collection deleted'); load();
  }

  async function toggleVisible(c: Collection) {
    const { error } = await supabase.from('collections').update({ is_published: !c.is_published }).eq('id', c.id);
    if (error) return toast('error', errMsg(error));
    toast('ok', !c.is_published ? 'Collection is visible on the showroom' : 'Collection hidden from the showroom'); load();
  }

  return (
    <div>
      <PageHeader title="Collections" subtitle="Volumes, artwork and which products belong to each."
        actions={<Button variant="gold" onClick={() => open()}><Plus className="h-4 w-4" /> New collection</Button>} />
      {loading ? <Spinner /> : rows.length === 0 ? <Empty icon={<Layers className="h-10 w-10" />} title="No collections yet" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const count = products.filter((p) => p.collection_id === c.id).length;
            return (
              <Card key={c.id} className="overflow-hidden p-0 sm:p-0">
                <div className="relative aspect-[16/10] bg-ink">
                  {c.artwork_path ? <img src={mediaUrl(c.artwork_path)} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-neutral-600"><Layers className="h-10 w-10" /></div>}
                  <div className="absolute left-2 top-2 flex gap-1"><Badge tone={c.status}>{label(c.status)}</Badge>{c.is_published ? <Badge tone="published">Visible</Badge> : <Badge>Hidden</Badge>}</div>
                </div>
                <div className="p-4">
                  <p className="font-display text-xs tracking-[0.25em] text-gold-dark">{c.volume_label}</p>
                  <h3 className="font-display text-lg font-semibold">{c.name}</h3>
                  {c.tagline && <p className="text-sm text-neutral-600">{c.tagline}</p>}
                  <p className="mt-1 text-xs text-neutral-500">{count} product{count === 1 ? '' : 's'}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" className="flex-1 py-2" onClick={() => open(c)}><Pencil className="h-4 w-4" /> Edit</Button>
                    <Button variant="outline" className="py-2" onClick={() => toggleVisible(c)} title={c.is_published ? 'Hide' : 'Show'}>{c.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                    <Button variant="outline" className="py-2 text-red-700" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit collection' : 'New collection'} wide
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="gold" loading={saving} onClick={save}>Save collection</Button></>}>
        {edit && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onArtwork(e.target.files?.[0]); e.target.value = ''; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-ink">
                {edit.artwork_path ? <img src={mediaUrl(edit.artwork_path)} className="h-full w-full object-contain" alt="" />
                  : <span className="flex flex-col items-center gap-1 text-sm text-neutral-400"><ImagePlus className="h-7 w-7" />Upload collection artwork</span>}
                {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="h-6 w-6 animate-spin text-gold" /></span>}
              </button>
              {edit.artwork_path && <button className="text-xs text-red-700" onClick={() => setEdit({ ...edit, artwork_path: null })}>Remove artwork</button>}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Volume"><input className="field" placeholder="VOL. 03" value={edit.volume_label ?? ''} onChange={(e) => setEdit({ ...edit, volume_label: e.target.value })} /></Field>
                <Field label="Name *" className="col-span-2"><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              </div>
              <Field label="Tagline"><input className="field" value={edit.tagline ?? ''} onChange={(e) => setEdit({ ...edit, tagline: e.target.value })} /></Field>
              <Field label="Scripture reference"><input className="field" placeholder="e.g. Romans 1:16" value={edit.scripture ?? ''} onChange={(e) => setEdit({ ...edit, scripture: e.target.value })} /></Field>
              <Field label="Description"><textarea className="field min-h-24" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <select className="field" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as CollectionStatus })}>
                    {COLLECTION_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </Field>
                <Field label="Display order"><input type="number" className="field" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> Visible on public showroom</label>
            </div>
            <div>
              <p className="field-label">Products in this collection</p>
              <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2">
                {products.length === 0 && <p className="p-3 text-sm text-neutral-500">No products yet.</p>}
                {products.map((p) => {
                  const other = p.collection_id && p.collection_id !== edit.id ? rows.find((r) => r.id === p.collection_id) : null;
                  return (
                    <label key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
                      <input type="checkbox" className="accent-gold" checked={assigned.includes(p.id)}
                        onChange={(e) => setAssigned((a) => (e.target.checked ? [...a, p.id] : a.filter((x) => x !== p.id)))} />
                      <span className="flex-1">{p.name} <span className="text-xs text-neutral-400">{p.sku}</span></span>
                      {other && <span className="text-[10px] text-amber-700">in {other.name}</span>}
                      <Badge tone={p.status}>{p.status}</Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
