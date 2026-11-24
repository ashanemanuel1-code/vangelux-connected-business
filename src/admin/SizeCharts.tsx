import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Ruler, ImagePlus, Camera, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadMedia, mediaUrl, deleteMedia } from '../lib/storage';
import { useLiveRefresh } from '../lib/useRealtime';
import type { SizeChart } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type Draft = Omit<SizeChart, 'id' | 'created_at'> & { id?: string };
const blank: Draft = { name: '', image_path: null, notes: '', is_published: true, sort_order: 0 };

export default function SizeCharts() {
  const toast = useToast();
  const [rows, setRows] = useState<SizeChart[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [oldPath, setOldPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from('size_charts').select('*').order('sort_order').order('created_at'),
      supabase.from('products').select('size_chart_id').not('size_chart_id', 'is', null),
    ]);
    setRows((c.data ?? []) as SizeChart[]);
    const count: Record<string, number> = {};
    (p.data ?? []).forEach((x) => { if (x.size_chart_id) count[x.size_chart_id] = (count[x.size_chart_id] ?? 0) + 1; });
    setUsed(count); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['size_charts', 'products'], load);

  function open(c?: SizeChart) {
    setEdit(c ? { ...c, notes: c.notes ?? '' } : { ...blank, sort_order: rows.length + 1 });
    setOldPath(c?.image_path ?? null);
  }

  async function onImage(file?: File) {
    if (!file || !edit) return;
    setUploading(true);
    try {
      const path = await uploadMedia(file, 'size-charts');
      // a picture uploaded but then replaced again before saving is removed straight away
      if (edit.image_path && edit.image_path !== oldPath) await deleteMedia([edit.image_path]);
      setEdit((e) => e && { ...e, image_path: path });
    } catch (e) { toast('error', errMsg(e)); } finally { setUploading(false); }
  }

  async function save() {
    if (!edit) return;
    if (!edit.name.trim()) return toast('error', 'Give the size chart a name, e.g. “Oversized Tee – Adult”');
    if (!edit.image_path) return toast('error', 'Upload the size chart picture');
    setSaving(true);
    const row = { name: edit.name.trim(), image_path: edit.image_path, notes: edit.notes?.trim() || null, is_published: edit.is_published, sort_order: edit.sort_order };
    const { error } = edit.id ? await supabase.from('size_charts').update(row).eq('id', edit.id) : await supabase.from('size_charts').insert(row);
    setSaving(false);
    if (error) return toast('error', errMsg(error));
    if (oldPath && oldPath !== edit.image_path) await deleteMedia([oldPath]);
    toast('ok', 'Size chart saved'); setEdit(null); load();
  }

  async function cancel() {
    if (edit?.image_path && edit.image_path !== oldPath) await deleteMedia([edit.image_path]); // unsaved upload
    setEdit(null);
  }

  async function remove(c: SizeChart) {
    const n = used[c.id] ?? 0;
    if (!confirmDialog(`Delete “${c.name}”?${n ? ` ${n} product${n === 1 ? '' : 's'} will no longer show a size guide.` : ''}`)) return;
    const { error } = await supabase.from('size_charts').delete().eq('id', c.id);
    if (error) return toast('error', errMsg(error));
    if (c.image_path) await deleteMedia([c.image_path]);
    toast('ok', 'Size chart deleted'); load();
  }

  async function togglePublished(c: SizeChart) {
    const { error } = await supabase.from('size_charts').update({ is_published: !c.is_published }).eq('id', c.id);
    if (error) return toast('error', errMsg(error));
    load();
  }

  return (
    <div>
      <PageHeader title="Size charts" subtitle="Upload your size charts once, then choose one on each product. Customers see it as “Size guide” in the showroom."
        actions={<Button variant="gold" onClick={() => open()}><Plus className="h-4 w-4" /> Add size chart</Button>} />

      {loading ? <Spinner /> : rows.length === 0 ? (
        <Empty icon={<Ruler className="h-10 w-10" />} title="No size charts yet"
          text="Add a picture of each chart, e.g. “Oversized Tee – Adult”, “Regular Tee”, “Kids Tee”."
          action={<Button variant="gold" onClick={() => open()}><Plus className="h-4 w-4" /> Add size chart</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Card key={c.id} className="overflow-hidden p-0 sm:p-0">
              <button className="block w-full bg-white" onClick={() => c.image_path && window.open(mediaUrl(c.image_path), '_blank')}>
                {c.image_path ? <img src={mediaUrl(c.image_path)} alt={c.name} loading="lazy" className="h-56 w-full object-contain" />
                  : <div className="flex h-56 items-center justify-center text-neutral-400"><Ruler className="h-10 w-10" /></div>}
              </button>
              <div className="border-t border-neutral-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-neutral-500">{used[c.id] ? `Used on ${used[c.id]} product${used[c.id] === 1 ? '' : 's'}` : 'Not used on any product yet'}</p>
                  </div>
                  <Badge tone={c.is_published ? 'published' : 'draft'}>{c.is_published ? 'shown' : 'hidden'}</Badge>
                </div>
                {c.notes && <p className="mt-2 line-clamp-2 text-xs text-neutral-600">{c.notes}</p>}
                <div className="mt-3 flex gap-4 text-sm font-semibold text-gold-dark">
                  <button className="flex items-center gap-1" onClick={() => open(c)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                  <button className="flex items-center gap-1" onClick={() => togglePublished(c)}>{c.is_published ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Show</>}</button>
                  <button className="ml-auto flex items-center gap-1 text-red-700" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={cancel} title={edit?.id ? 'Edit size chart' : 'New size chart'}
        footer={<><Button variant="ghost" onClick={cancel}>Cancel</Button><Button variant="gold" loading={saving} disabled={uploading} onClick={save}>Save</Button></>}>
        {edit && <div className="space-y-4">
          <Field label="Name *"><input className="field" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Oversized Tee – Adult" /></Field>

          <div>
            <p className="field-label">Size chart picture *</p>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-white">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-gold" />
                : edit.image_path ? <img src={mediaUrl(edit.image_path)} alt="Size chart" className="max-h-80 w-full object-contain" />
                : <p className="p-6 text-center text-sm text-neutral-500">A clear photo or screenshot of the chart.<br />PNG or JPG works best.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus className="h-4 w-4" /> {edit.image_path ? 'Replace' : 'Choose picture'}</Button>
              <Button variant="outline" onClick={() => camRef.current?.click()} disabled={uploading}><Camera className="h-4 w-4" /> Camera</Button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <Field label="Note for customers (optional)"><textarea className="field min-h-20" value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="e.g. Measurements in inches, taken flat. Oversized fit — size down for a regular fit." /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} /> Show in the public showroom</label>
        </div>}
      </Modal>
    </div>
  );
}
