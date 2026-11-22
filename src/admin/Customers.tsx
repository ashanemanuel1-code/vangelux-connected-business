import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, Phone, Mail, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, fmtDate, num } from '../lib/format';
import { exportRows } from '../lib/excel';
import { useLiveRefresh } from '../lib/useRealtime';
import type { Customer, Sale } from '../lib/types';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

export function saleTotal(s: Sale) {
  const items = (s.sale_items ?? []).reduce((a, i) => a + num(i.quantity) * num(i.unit_price) - num(i.discount_amount), 0);
  return items - num(s.discount_amount) + num(s.delivery_fee);
}

export default function Customers() {
  const toast = useToast();
  const [rows, setRows] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const [view, setView] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('sales').select('*, sale_items(*)').not('customer_id', 'is', null).order('sale_date', { ascending: false }),
    ]);
    setRows((c.data ?? []) as Customer[]); setSales((s.data ?? []) as Sale[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['customers', 'sales'], load);

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; outstanding: number; count: number }>();
    for (const s of sales) {
      if (!s.customer_id || ['cancelled', 'returned'].includes(s.order_status)) continue;
      const t = saleTotal(s);
      const cur = m.get(s.customer_id) ?? { total: 0, outstanding: 0, count: 0 };
      cur.total += t; cur.count += 1;
      if (s.payment_status !== 'refunded') cur.outstanding += Math.max(t - num(s.amount_paid), 0);
      m.set(s.customer_id, cur);
    }
    return m;
  }, [sales]);

  const filtered = rows.filter((c) => { const t = q.toLowerCase(); return !t || [c.name, c.phone, c.email].some((x) => x?.toLowerCase().includes(t)); });

  async function save() {
    if (!edit?.name?.trim()) return toast('error', 'Name is required');
    const payload = { name: edit.name.trim(), phone: edit.phone || null, email: edit.email || null, address: edit.address || null, notes: edit.notes || null };
    const { error } = edit.id ? await supabase.from('customers').update(payload).eq('id', edit.id) : await supabase.from('customers').insert(payload);
    if (error) return toast('error', errMsg(error));
    toast('ok', 'Customer saved'); setEdit(null); load();
  }
  async function remove(c: Customer) {
    if (!confirmDialog(`Delete ${c.name}? Their past sales stay but are unlinked.`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', c.id);
    if (error) return toast('error', errMsg(error)); setView(null); load();
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle="Private — never visible on the public showroom."
        actions={<>
          <Button variant="outline" onClick={() => exportRows(rows.map((c) => ({ Name: c.name, Phone: c.phone, Email: c.email, Address: c.address, 'Total purchases': stats.get(c.id)?.total ?? 0, Outstanding: stats.get(c.id)?.outstanding ?? 0 })), 'vangelux-customers.xlsx', 'Customers')}>Export</Button>
          <Button variant="gold" onClick={() => setEdit({})}><Plus className="h-4 w-4" /> Add customer</Button></>} />
      <div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-neutral-400" /><input className="field pl-9" placeholder="Search name, phone, email…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {loading ? <Spinner /> : filtered.length === 0 ? <Empty icon={<Users className="h-10 w-10" />} title="No customers yet" text="Customers are also created automatically when a quotation is converted into an order." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const st = stats.get(c.id);
            return (
              <Card key={c.id} className="cursor-pointer hover:border-gold" >
                <button className="w-full text-left" onClick={() => setView(c)}>
                  <p className="font-semibold">{c.name}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-500">{c.phone && <><Phone className="h-3 w-3" />{c.phone}</>} {c.email && <><Mail className="ml-2 h-3 w-3" />{c.email}</>}</p>
                  <div className="mt-3 flex justify-between text-sm"><span>{st?.count ?? 0} orders · {money(st?.total)}</span>
                    {(st?.outstanding ?? 0) > 0 && <span className="font-semibold text-red-700">Owes {money(st?.outstanding)}</span>}</div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit customer' : 'New customer'}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="gold" onClick={save}>Save</Button></>}>
        {edit && <div className="space-y-3">
          <Field label="Name *"><input className="field" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone"><input className="field" type="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Email"><input className="field" type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          </div>
          <Field label="Address"><textarea className="field" value={edit.address ?? ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <Field label="Notes"><textarea className="field" value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
        </div>}
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={view?.name ?? ''} wide
        footer={view && <><Button variant="ghost" className="mr-auto text-red-700" onClick={() => remove(view)}><Trash2 className="h-4 w-4" /> Delete</Button><Button variant="outline" onClick={() => { setEdit(view); setView(null); }}>Edit details</Button></>}>
        {view && (() => {
          const st = stats.get(view.id); const hist = sales.filter((s) => s.customer_id === view.id);
          return (
            <div>
              <div className="mb-4 grid gap-1 text-sm">
                {view.phone && <p><b>Phone:</b> <a className="text-gold-dark" href={`tel:${view.phone}`}>{view.phone}</a></p>}
                {view.email && <p><b>Email:</b> {view.email}</p>}
                {view.address && <p><b>Address:</b> {view.address}</p>}
                {view.notes && <p className="text-neutral-500">{view.notes}</p>}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <Card><p className="text-xs text-neutral-500">Total purchases</p><p className="text-lg font-semibold">{money(st?.total)}</p></Card>
                <Card><p className="text-xs text-neutral-500">Outstanding</p><p className={`text-lg font-semibold ${(st?.outstanding ?? 0) > 0 ? 'text-red-700' : ''}`}>{money(st?.outstanding)}</p></Card>
              </div>
              <p className="field-label">Purchase history</p>
              {hist.length === 0 ? <p className="text-sm text-neutral-500">No purchases yet.</p> : (
                <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                  {hist.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div><p className="font-medium">{s.invoice_number} · {fmtDate(s.sale_date)}</p>
                        <p className="text-xs text-neutral-500">{(s.sale_items ?? []).map((i) => `${i.quantity}× ${i.description}${i.size ? ` (${i.size})` : ''}`).join(', ')}</p></div>
                      <div className="flex items-center gap-2"><Badge tone={s.payment_status}>{s.payment_status}</Badge><b>{money(saleTotal(s))}</b></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
