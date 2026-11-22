import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Lock, Globe, UserPlus, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { StaffMember } from '../lib/types';
import { useLookups } from './useAdminData';
import { Badge, Button, Card, Field, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

const TABS = ['Tags', 'Categories', 'Fit types', 'Target customers', 'Sizes', 'Expense categories', 'Staff'] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const [tab, setTab] = useState<Tab>('Tags');
  const lk = useLookups();
  return (
    <div>
      <PageHeader title="Settings & Tags" subtitle="Every option list in the app is managed here — no code changes needed." />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${tab === t ? 'bg-ink text-ivory' : 'bg-white text-neutral-600 hover:bg-neutral-100'}`}>{t}</button>
        ))}
      </div>
      {lk.loading ? <Spinner /> : (
        <>
          {tab === 'Tags' && <TagsEditor reload={lk.reload} tags={lk.tags} />}
          {tab === 'Categories' && <LookupEditor table="categories" rows={lk.categories} reload={lk.reload} />}
          {tab === 'Fit types' && <LookupEditor table="fit_types" rows={lk.fitTypes} reload={lk.reload} />}
          {tab === 'Target customers' && <LookupEditor table="target_customers" rows={lk.targets} reload={lk.reload} />}
          {tab === 'Sizes' && <SizesEditor rows={lk.sizes} reload={lk.reload} />}
          {tab === 'Expense categories' && <ExpenseCatEditor rows={lk.expenseCategories} reload={lk.reload} />}
          {tab === 'Staff' && <StaffEditor />}
        </>
      )}
    </div>
  );
}

function useSaver(reload: () => Promise<void> | void) {
  const toast = useToast();
  return async (p: PromiseLike<{ error: unknown }>, msg = 'Saved') => {
    const { error } = await p;
    if (error) { toast('error', errMsg(error)); return false; }
    toast('ok', msg); await reload(); return true;
  };
}

function TagsEditor({ tags, reload }: { tags: { id: string; name: string; color: string; is_public: boolean; sort_order: number }[]; reload: () => Promise<void> }) {
  const run = useSaver(reload);
  const [name, setName] = useState(''); const [color, setColor] = useState('#C9A24A');
  const [drafts, setDrafts] = useState<Record<string, { name: string; color: string }>>({});
  return (
    <Card>
      <p className="mb-3 text-sm text-neutral-500">Public tags appear on showroom product cards. <Lock className="inline h-3.5 w-3.5" /> Internal tags are only visible here.</p>
      <div className="space-y-2">
        {tags.map((t) => {
          const d = drafts[t.id] ?? { name: t.name, color: t.color };
          const dirty = d.name !== t.name || d.color !== t.color;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2">
              <input type="color" value={d.color} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, color: e.target.value } })} className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent" />
              <input className="field min-w-40 flex-1 py-2" value={d.name} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, name: e.target.value } })} />
              <Badge color={d.color}>{d.name || '…'}</Badge>
              {dirty && <Button className="py-2" variant="gold" onClick={async () => { if (await run(supabase.from('tags').update({ name: d.name.trim(), color: d.color }).eq('id', t.id), 'Tag updated')) setDrafts((x) => { const n = { ...x }; delete n[t.id]; return n; }); }}><Check className="h-4 w-4" /></Button>}
              <Button variant="outline" className="py-2" title={t.is_public ? 'Public — click to make internal' : 'Internal — click to make public'}
                onClick={() => run(supabase.from('tags').update({ is_public: !t.is_public }).eq('id', t.id), t.is_public ? 'Tag is now internal' : 'Tag is now public')}>
                {t.is_public ? <><Globe className="h-4 w-4" /> Public</> : <><Lock className="h-4 w-4" /> Internal</>}
              </Button>
              <Button variant="outline" className="py-2 text-red-700" onClick={() => confirmDialog(`Delete tag “${t.name}”? It will be removed from all products.`) && run(supabase.from('tags').delete().eq('id', t.id), 'Tag deleted')}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-12 rounded" />
        <input className="field max-w-xs" placeholder="New tag name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="gold" disabled={!name.trim()} onClick={async () => { if (await run(supabase.from('tags').insert({ name: name.trim(), color, sort_order: tags.length + 1 }), 'Tag created')) setName(''); }}><Plus className="h-4 w-4" /> Add tag</Button>
      </div>
    </Card>
  );
}

function LookupEditor({ table, rows, reload }: { table: string; rows: { id: string; name: string; sort_order: number; is_active: boolean }[]; reload: () => Promise<void> }) {
  const run = useSaver(reload);
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <Card>
      <p className="mb-3 text-sm text-neutral-500">Rename, reorder or hide options. Hidden options stay on existing products but can't be chosen for new ones.</p>
      <div className="space-y-2">
        {rows.map((r) => {
          const d = drafts[r.id] ?? r.name;
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <input type="number" title="Display order" className="field w-20 py-2" defaultValue={r.sort_order} key={`${r.id}-${r.sort_order}`}
                onBlur={(e) => Number(e.target.value) !== r.sort_order && run(supabase.from(table).update({ sort_order: Number(e.target.value) }).eq('id', r.id), 'Order updated')} />
              <input className={`field flex-1 py-2 ${!r.is_active ? 'text-neutral-400 line-through' : ''}`} value={d} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} />
              {d !== r.name && <Button variant="gold" className="py-2" onClick={() => run(supabase.from(table).update({ name: d.trim() }).eq('id', r.id), 'Renamed')}><Check className="h-4 w-4" /></Button>}
              <Button variant="outline" className="py-2" onClick={() => run(supabase.from(table).update({ is_active: !r.is_active }).eq('id', r.id))}>{r.is_active ? 'Hide' : 'Show'}</Button>
              <Button variant="outline" className="py-2 text-red-700" onClick={() => confirmDialog(`Delete “${r.name}”? Products using it will be left blank.`) && run(supabase.from(table).delete().eq('id', r.id), 'Deleted')}><Trash2 className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <input className="field max-w-xs" placeholder="Add new option" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="gold" disabled={!name.trim()} onClick={async () => { if (await run(supabase.from(table).insert({ name: name.trim(), sort_order: rows.length + 1 }), 'Added')) setName(''); }}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    </Card>
  );
}

function SizesEditor({ rows, reload }: { rows: { id: string; size_group: string; label: string; sort_order: number; is_active: boolean }[]; reload: () => Promise<void> }) {
  const run = useSaver(reload);
  const [labelText, setLabel] = useState(''); const [group, setGroup] = useState('adult');
  return (
    <Card>
      {(['adult', 'kids', 'other'] as const).map((g) => (
        <div key={g} className="mb-4">
          <p className="field-label">{g === 'adult' ? 'Adult sizes' : g === 'kids' ? 'Kids sizes' : 'Other sizes'}</p>
          <div className="flex flex-wrap gap-2">
            {rows.filter((r) => r.size_group === g).map((r) => (
              <span key={r.id} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${r.is_active ? 'border-neutral-300 bg-white' : 'border-dashed text-neutral-400'}`}>
                {r.label}
                <button title={r.is_active ? 'Hide' : 'Show'} onClick={() => run(supabase.from('size_options').update({ is_active: !r.is_active }).eq('id', r.id))} className="text-[10px] text-neutral-500 underline">{r.is_active ? 'hide' : 'show'}</button>
                <button onClick={() => confirmDialog(`Delete size ${r.label}?`) && run(supabase.from('size_options').delete().eq('id', r.id), 'Deleted')}><Trash2 className="h-3.5 w-3.5 text-red-700" /></button>
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" value={group} onChange={(e) => setGroup(e.target.value)}><option value="adult">Adult</option><option value="kids">Kids</option><option value="other">Other</option></select>
        <input className="field max-w-xs" placeholder="e.g. 4XL or 14–15 years" value={labelText} onChange={(e) => setLabel(e.target.value)} />
        <Button variant="gold" disabled={!labelText.trim()} onClick={async () => { if (await run(supabase.from('size_options').insert({ size_group: group, label: labelText.trim(), sort_order: rows.filter((r) => r.size_group === group).length + 1 }), 'Size added')) setLabel(''); }}><Plus className="h-4 w-4" /> Add size</Button>
      </div>
    </Card>
  );
}

function ExpenseCatEditor({ rows, reload }: { rows: { id: string; name: string; is_operating: boolean; sort_order: number; is_active: boolean }[]; reload: () => Promise<void> }) {
  const run = useSaver(reload);
  const [name, setName] = useState('');
  return (
    <Card>
      <p className="mb-3 text-sm text-neutral-500">
        <b>Production</b> categories (fabric, printing…) are already included in each product's unit cost, which is charged as cost of goods sold when it sells.
        They count toward Total Expenses but are not subtracted a second time for Net Profit. <b>Operating</b> categories (marketing, software…) are.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2">
            <span className="flex-1 font-medium">{r.name}</span>
            <Button variant="outline" className="py-1.5 text-xs" onClick={() => run(supabase.from('expense_categories').update({ is_operating: !r.is_operating }).eq('id', r.id))}>{r.is_operating ? 'Operating' : 'Production'}</Button>
            <Button variant="outline" className="py-1.5 text-xs" onClick={() => run(supabase.from('expense_categories').update({ is_active: !r.is_active }).eq('id', r.id))}>{r.is_active ? 'Hide' : 'Show'}</Button>
            <Button variant="outline" className="py-1.5 text-red-700" onClick={() => confirmDialog(`Delete “${r.name}”?`) && run(supabase.from('expense_categories').delete().eq('id', r.id), 'Deleted')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input className="field max-w-xs" placeholder="New expense category" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="gold" disabled={!name.trim()} onClick={async () => { if (await run(supabase.from('expense_categories').insert({ name: name.trim(), sort_order: rows.length + 1 }), 'Added')) setName(''); }}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    </Card>
  );
}

function StaffEditor() {
  const { staff: me } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [email, setEmail] = useState(''); const [role, setRole] = useState('staff'); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from('staff').select('*').order('created_at'); setRows((data ?? []) as StaffMember[]); }, []);
  useEffect(() => { load(); }, [load]);
  const canManage = me?.role === 'owner' || me?.role === 'admin';

  async function add() {
    setBusy(true);
    const { error } = await supabase.rpc('add_staff_by_email', { p_email: email, p_role: role });
    setBusy(false);
    if (error) return toast('error', errMsg(error));
    toast('ok', 'Staff member added'); setEmail(''); load();
  }
  async function toggle(s: StaffMember) {
    const { error } = await supabase.from('staff').update({ is_active: !s.is_active }).eq('user_id', s.user_id);
    if (error) return toast('error', errMsg(error)); load();
  }

  return (
    <Card>
      <div className="space-y-2">
        {rows.map((s) => (
          <div key={s.user_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-3">
            <div className="flex-1"><p className="font-medium">{s.full_name || s.email}</p><p className="text-xs text-neutral-500">{s.email}</p></div>
            <Badge tone={s.role === 'owner' ? 'published' : undefined}>{s.role}</Badge>
            {!s.is_active && <Badge tone="cancelled">disabled</Badge>}
            {canManage && s.role !== 'owner' && s.user_id !== me?.user_id && <Button variant="outline" className="py-1.5 text-xs" onClick={() => toggle(s)}>{s.is_active ? 'Disable' : 'Enable'}</Button>}
          </div>
        ))}
      </div>
      {canManage && (
        <div className="mt-5 rounded-xl bg-neutral-50 p-4">
          <p className="mb-3 flex items-center gap-2 font-semibold"><UserPlus className="h-4 w-4" /> Add staff</p>
          <p className="mb-3 text-xs text-neutral-500">First invite the person in Supabase → Authentication → Users → “Invite user”. Once they've set a password, add their email here.</p>
          <div className="flex flex-wrap gap-2">
            <Field label="Email" className="min-w-56 flex-1"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Role"><select className="field" value={role} onChange={(e) => setRole(e.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option></select></Field>
            <div className="flex items-end"><Button variant="gold" loading={busy} disabled={!email} onClick={add}>Add</Button></div>
          </div>
        </div>
      )}
    </Card>
  );
}
