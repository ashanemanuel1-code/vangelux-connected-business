import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Timer, ImagePlus, Camera, Pencil, Trash2, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadMedia, mediaUrl, deleteMedia } from '../lib/storage';
import { useLiveRefresh } from '../lib/useRealtime';
import type { Launch } from '../lib/types';
import { Clock, useNow } from '../showroom/Launches';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type Draft = {
  id?: string; title: string; subtitle: string; image_path: string | null; when: string;
  button_label: string; link_url: string; ended_text: string; show_banner: boolean; is_active: boolean;
};

/** ISO time → value for <input type="datetime-local"> in this phone's/computer's own time zone. */
const toLocalInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const inDays = (n: number) => { const d = new Date(Date.now() + n * 86400000); d.setHours(19, 0, 0, 0); return toLocalInput(d.toISOString()); };

export default function Countdowns() {
  const toast = useToast();
  const [rows, setRows] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [oldPath, setOldPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const now = useNow(rows.length > 0);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('launches').select('*').order('launch_at', { ascending: false });
    if (error) toast('error', /launches/.test(error.message) ? 'Run the latest database update (SQL) in Supabase to use Countdowns.' : errMsg(error));
    setRows((data ?? []) as Launch[]); setLoading(false);
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['launches'], load);

  function open(l?: Launch) {
    setEdit(l
      ? { id: l.id, title: l.title, subtitle: l.subtitle ?? '', image_path: l.image_path, when: toLocalInput(l.launch_at), button_label: l.button_label ?? '', link_url: l.link_url ?? '', ended_text: l.ended_text ?? '', show_banner: l.show_banner, is_active: l.is_active }
      : { title: '', subtitle: '', image_path: null, when: inDays(7), button_label: '', link_url: '', ended_text: 'OUT NOW', show_banner: true, is_active: true });
    setOldPath(l?.image_path ?? null);
  }

  async function onImage(file?: File) {
    if (!file || !edit) return;
    setUploading(true);
    try {
      const path = await uploadMedia(file, 'launches');
      if (edit.image_path && edit.image_path !== oldPath) await deleteMedia([edit.image_path]);
      setEdit((e) => e && { ...e, image_path: path });
    } catch (e) { toast('error', errMsg(e)); } finally { setUploading(false); }
  }

  async function save() {
    if (!edit) return;
    if (!edit.title.trim()) return toast('error', 'Give the countdown a title, e.g. “VOL. 02 UNASHAMED”');
    const at = new Date(edit.when);
    if (!edit.when || Number.isNaN(at.getTime())) return toast('error', 'Choose the launch date and time');
    if (edit.link_url && !/^https?:\/\//i.test(edit.link_url)) return toast('error', 'The link should start with https://');
    setSaving(true);
    const row = {
      title: edit.title.trim(), subtitle: edit.subtitle.trim() || null, image_path: edit.image_path, launch_at: at.toISOString(),
      button_label: edit.button_label.trim() || null, link_url: edit.link_url.trim() || null, ended_text: edit.ended_text.trim() || null,
      show_banner: edit.show_banner, is_active: edit.is_active,
    };
    const { error } = edit.id ? await supabase.from('launches').update(row).eq('id', edit.id) : await supabase.from('launches').insert(row);
    setSaving(false);
    if (error) return toast('error', /launches/.test(error.message) ? 'Run the latest database update (SQL) in Supabase first.' : errMsg(error));
    if (oldPath && oldPath !== edit.image_path) await deleteMedia([oldPath]);
    toast('ok', at.getTime() > Date.now() ? 'Countdown saved — it is live on your website' : 'Saved (this time has already passed)');
    setEdit(null); load();
  }

  async function cancel() {
    if (edit?.image_path && edit.image_path !== oldPath) await deleteMedia([edit.image_path]);
    setEdit(null);
  }

  async function remove(l: Launch) {
    if (!confirmDialog(`Delete the countdown “${l.title}”?`)) return;
    const { error } = await supabase.from('launches').delete().eq('id', l.id);
    if (error) return toast('error', errMsg(error));
    if (l.image_path) await deleteMedia([l.image_path]);
    toast('ok', 'Countdown deleted'); load();
  }

  async function toggle(l: Launch) {
    const { error } = await supabase.from('launches').update({ is_active: !l.is_active }).eq('id', l.id);
    if (error) return toast('error', errMsg(error));
    load();
  }

  const status = (l: Launch) => {
    const left = new Date(l.launch_at).getTime() - now;
    if (!l.is_active) return { tone: 'draft', text: 'hidden' };
    if (left > 0) return { tone: 'published', text: 'counting down' };
    return l.ended_text && left > -14 * 86400000 ? { tone: 'confirmed', text: `shows “${l.ended_text}”` } : { tone: 'archived', text: 'finished' };
  };

  return (
    <div>
      <PageHeader title="Countdowns" subtitle="Build excitement for a new collection or drop. Add a picture and a date — the website shows a live countdown (days · hours · minutes · seconds)."
        actions={<Button variant="gold" onClick={() => open()}><Plus className="h-4 w-4" /> New countdown</Button>} />

      {loading ? <Spinner /> : rows.length === 0 ? (
        <Empty icon={<Timer className="h-10 w-10" />} title="No countdowns yet" text="Example: “VOL. 02 UNASHAMED” with your design picture, launching next Friday at 7 pm."
          action={<Button variant="gold" onClick={() => open()}><Plus className="h-4 w-4" /> New countdown</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((l) => {
            const left = new Date(l.launch_at).getTime() - now;
            const st = status(l);
            return (
              <Card key={l.id} className="overflow-hidden p-0 sm:p-0">
                <div className="relative bg-ink">
                  {l.image_path ? <img src={mediaUrl(l.image_path)} alt={l.title} className="aspect-[16/9] w-full object-cover opacity-80" loading="lazy" />
                    : <div className="flex aspect-[16/9] items-center justify-center text-neutral-600"><Timer className="h-10 w-10" /></div>}
                  <div className="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4">
                    <p className="font-display text-lg tracking-wide text-ivory">{l.title}</p>
                    {left > 0 ? <Clock ms={left} /> : <p className="text-xs tracking-[0.2em] text-gold">{l.ended_text ? l.ended_text.toUpperCase() : 'TIME REACHED'}</p>}
                  </div>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-neutral-500">{new Date(l.launch_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}{l.show_banner ? ' · top banner' : ''}</p>
                    <Badge tone={st.tone}>{st.text}</Badge>
                  </div>
                  <div className="mt-3 flex gap-4 text-sm font-semibold text-gold-dark">
                    <button className="flex items-center gap-1" onClick={() => open(l)}><Pencil className="h-3.5 w-3.5" /> Edit</button>
                    <button className="flex items-center gap-1" onClick={() => toggle(l)}>{l.is_active ? <><EyeOff className="h-3.5 w-3.5" /> Hide</> : <><Eye className="h-3.5 w-3.5" /> Show</>}</button>
                    <button className="ml-auto flex items-center gap-1 text-red-700" onClick={() => remove(l)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!edit} onClose={cancel} title={edit?.id ? 'Edit countdown' : 'New countdown'}
        footer={<><Button variant="ghost" onClick={cancel}>Cancel</Button><Button variant="gold" loading={saving} disabled={uploading} onClick={save}>Save</Button></>}>
        {edit && <div className="space-y-4">
          <Field label="Title *"><input className="field" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. VOL. 02 UNASHAMED" /></Field>
          <Field label="Short message (optional)"><textarea className="field min-h-20" value={edit.subtitle} onChange={(e) => setEdit({ ...edit, subtitle: e.target.value })} placeholder="e.g. Not ashamed of the gospel. Black & white oversized tees." /></Field>

          <div>
            <p className="field-label">Picture</p>
            <div className="relative flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-white">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-gold" />
                : edit.image_path ? <>
                  <img src={mediaUrl(edit.image_path)} alt="" className="max-h-64 w-full object-cover" />
                  <button onClick={() => setEdit({ ...edit, image_path: null })} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white" aria-label="Remove picture"><X className="h-4 w-4" /></button>
                </> : <p className="p-6 text-center text-sm text-neutral-500">Your design, a mockup or a teaser picture.<br />Wide (landscape) pictures look best.</p>}
            </div>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={uploading}><ImagePlus className="h-4 w-4" /> {edit.image_path ? 'Replace' : 'Choose picture'}</Button>
              <Button variant="outline" onClick={() => camRef.current?.click()} disabled={uploading}><Camera className="h-4 w-4" /> Camera</Button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <Field label="Launch date & time *" hint="Your local time (Sri Lanka). The countdown runs to this moment.">
            <input className="field" type="datetime-local" value={edit.when} onChange={(e) => setEdit({ ...edit, when: e.target.value })} />
          </Field>
          {edit.when && !Number.isNaN(new Date(edit.when).getTime()) && new Date(edit.when).getTime() > now && (
            <div className="rounded-xl bg-ink p-3"><p className="mb-2 text-center text-[10px] tracking-[0.25em] text-gold">PREVIEW</p><div className="flex justify-center"><Clock ms={new Date(edit.when).getTime() - now} /></div></div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Button text (optional)" hint="Blank = “Notify me on WhatsApp”"><input className="field" value={edit.button_label} onChange={(e) => setEdit({ ...edit, button_label: e.target.value })} placeholder="e.g. See the teaser" /></Field>
            <Field label="Button link (optional)" hint="Blank = opens WhatsApp"><input className="field" type="url" value={edit.link_url} onChange={(e) => setEdit({ ...edit, link_url: e.target.value })} placeholder="https://instagram.com/…" /></Field>
          </div>
          <Field label="When the time is reached, show" hint="Shown for 14 days after the launch. Leave blank to hide the countdown when it ends.">
            <input className="field" value={edit.ended_text} onChange={(e) => setEdit({ ...edit, ended_text: e.target.value })} placeholder="e.g. OUT NOW" />
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={edit.show_banner} onChange={(e) => setEdit({ ...edit, show_banner: e.target.checked })} /> Also show a slim gold countdown banner at the top of the website</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-gold" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Show on the website</label>
        </div>}
      </Modal>
    </div>
  );
}
