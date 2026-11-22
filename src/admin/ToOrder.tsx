import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Truck, PackageCheck, Download, MessageCircle, CheckCircle2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, fmtDate, num, label } from '../lib/format';
import { exportRows } from '../lib/excel';
import { whatsappLink } from '../lib/brand';
import { toWhatsAppNumber } from '../lib/pdf';
import { useFulfilment, groupLines, type Group } from '../lib/fulfilment';
import { saleTotal } from './Customers';
import { Badge, Button, Card, Empty, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type Cust = { id: string; name: string; phone: string | null };

export default function ToOrder() {
  const toast = useToast();
  const f = useFulfilment();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [busy, setBusy] = useState('');

  const loadRefs = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('products').select('id,name'),
      supabase.from('customers').select('id,name,phone'),
    ]);
    setNames(new Map((p.data ?? []).map((x) => [x.id as string, x.name as string])));
    setCustomers((c.data ?? []) as Cust[]);
  }, []);
  useEffect(() => { loadRefs(); }, [loadRefs, f.sales.length]);

  const toOrder = useMemo(() => groupLines(f.toOrder, (id) => names.get(id)), [f.toOrder, names]);
  const onOrder = useMemo(() => groupLines(f.onOrder, (id) => names.get(id)), [f.onOrder, names]);
  const phoneOf = (customerId: string | null) => customers.find((c) => c.id === customerId)?.phone ?? null;

  async function setStatus(g: Group, status: 'ordered' | 'received' | 'to_order') {
    setBusy(g.key + status);
    const { error } = await supabase.from('sale_items').update({ supply_status: status }).in('id', g.lines.map((l) => l.id!));
    setBusy('');
    if (error) return toast('error', errMsg(error));
    toast('ok', status === 'ordered' ? `${g.total} × ${g.name} marked as ordered` : status === 'received' ? `${g.total} × ${g.name} received` : 'Moved back to To order');
    f.reload();
  }

  async function markAllOrdered() {
    if (!confirmDialog(`Mark all ${f.piecesToOrder} pieces as ordered from your printer/supplier?`)) return;
    setBusy('all');
    const { error } = await supabase.from('sale_items').update({ supply_status: 'ordered' }).in('id', f.toOrder.map((l) => l.id!));
    setBusy('');
    if (error) return toast('error', errMsg(error));
    toast('ok', 'All marked as ordered'); f.reload();
  }

  async function delivered(saleId: string) {
    const { error } = await supabase.from('sales').update({ order_status: 'delivered' }).eq('id', saleId);
    if (error) return toast('error', errMsg(error));
    toast('ok', 'Order marked as delivered'); f.reload();
  }

  const listText = (groups: Group[]) => 'VANGELUX — production list\n\n' + groups.map((g) =>
    `${g.name}${g.color ? ` (${g.color})` : ''}: ${g.sizes.map(([s, q]) => `${s} × ${q}`).join(', ')} = ${g.total}`).join('\n') +
    `\n\nTotal: ${groups.reduce((a, g) => a + g.total, 0)} pieces`;

  const exportList = () => exportRows(f.toOrder.map((l) => ({
    Design: (l.product_id && names.get(l.product_id)) || l.description, Colour: l.color ?? '', Size: l.size ?? '', 'Qty to order': l.toOrder,
    Customer: l.sale.customer_name ?? '', Invoice: l.sale.invoice_number, 'Order date': l.sale.sale_date, 'Payment': l.sale.payment_status,
  })), 'vangelux-to-order.xlsx', 'To order');

  if (f.loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="To order" subtitle="Orders are filled from your stock in hand first. Whatever is missing appears here, added up by design, colour and size."
        actions={<>
          <Button variant="outline" onClick={exportList} disabled={!f.toOrder.length}><Download className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(listText(toOrder))}`, '_blank')} disabled={!toOrder.length}><Send className="h-4 w-4" /> Send list</Button>
          <Button variant="gold" loading={busy === 'all'} onClick={markAllOrdered} disabled={!f.toOrder.length}><Truck className="h-4 w-4" /> Mark all ordered</Button></>} />

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Card className="text-center"><p className="text-2xl font-semibold text-amber-700">{f.piecesToOrder}</p><p className="text-xs text-neutral-500">pieces to order</p></Card>
        <Card className="text-center"><p className="text-2xl font-semibold text-sky-700">{f.piecesOnOrder}</p><p className="text-xs text-neutral-500">on order (waiting)</p></Card>
        <Card className="text-center"><p className="text-2xl font-semibold text-emerald-700">{f.ready.length}</p><p className="text-xs text-neutral-500">orders ready to give</p></Card>
      </div>

      {/* ---------- to order ---------- */}
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg"><ClipboardList className="h-5 w-5 text-amber-700" /> Need to order</h2>
      {toOrder.length === 0 ? <Card className="mb-8"><p className="text-sm text-neutral-500">Nothing to order — every open order can be filled from stock or is already ordered.</p></Card> : (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {toOrder.map((g) => <GroupCard key={g.key} g={g} phoneOf={phoneOf}
            action={<Button variant="gold" className="py-1.5 text-xs" loading={busy === g.key + 'ordered'} onClick={() => setStatus(g, 'ordered')}><Truck className="h-4 w-4" /> Mark ordered</Button>} />)}
        </div>
      )}

      {/* ---------- on order ---------- */}
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg"><Truck className="h-5 w-5 text-sky-700" /> On order — waiting to arrive</h2>
      {onOrder.length === 0 ? <Card className="mb-8"><p className="text-sm text-neutral-500">Nothing waiting from your printer/supplier.</p></Card> : (
        <div className="mb-8 grid gap-3 md:grid-cols-2">
          {onOrder.map((g) => <GroupCard key={g.key} g={g} phoneOf={phoneOf}
            action={<>
              <Button variant="ghost" className="py-1.5 text-xs" loading={busy === g.key + 'to_order'} onClick={() => setStatus(g, 'to_order')}>Undo</Button>
              <Button variant="gold" className="py-1.5 text-xs" loading={busy === g.key + 'received'} onClick={() => setStatus(g, 'received')}><PackageCheck className="h-4 w-4" /> Received</Button></>} />)}
        </div>
      )}

      {/* ---------- ready ---------- */}
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg"><CheckCircle2 className="h-5 w-5 text-emerald-700" /> Ready to hand over</h2>
      {f.ready.length === 0 ? <Empty title="No orders ready yet" text="Orders appear here when all their items are in stock or received." /> : (
        <Card className="divide-y divide-neutral-100 p-0 sm:p-0">
          {f.ready.map((s) => {
            const total = saleTotal(s); const due = Math.max(total - num(s.amount_paid), 0);
            const phone = toWhatsAppNumber(phoneOf(s.customer_id));
            const msg = `Hi ${s.customer_name || ''}! Your VANGELUX order ${s.invoice_number} is ready.${due > 0 ? ` Balance due: ${money(due)}.` : ' It is fully paid — thank you!'}\nIf your voice won't, let your clothing speak. ✝`;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{s.customer_name || 'Customer'} <span className="text-xs text-neutral-400">{s.invoice_number}</span></p>
                  <p className="text-xs text-neutral-500">{fmtDate(s.sale_date)} · {s.sale_items.map((i) => `${i.quantity}× ${i.description}${i.size ? ` ${i.size}` : ''}`).join(', ')}</p>
                </div>
                <div className="text-right text-sm"><b>{money(total)}</b>{due > 0 ? <p className="text-[11px] text-red-700">due {money(due)}</p> : <p className="text-[11px] text-emerald-700">paid</p>}</div>
                <div className="flex gap-2">
                  <Button variant="outline" className="py-1.5 text-xs" onClick={() => window.open(phone ? whatsappLink(msg, phone) : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')}><MessageCircle className="h-4 w-4" /> Tell customer</Button>
                  <Button variant="gold" className="py-1.5 text-xs" onClick={() => delivered(s.id)}>Delivered</Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function GroupCard({ g, action, phoneOf }: { g: Group; action: React.ReactNode; phoneOf: (id: string | null) => string | null }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-semibold">{g.name}</p>{g.color && <p className="text-xs text-neutral-500">{g.color}</p>}</div>
        <div className="text-right"><p className="text-2xl font-semibold">{g.total}</p><p className="text-[10px] uppercase text-neutral-500">pieces</p></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{g.sizes.map(([s, q]) => <span key={s} className="rounded-lg border border-neutral-200 px-2 py-1 text-xs">{s} × <b>{q}</b></span>)}</div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-gold-dark">{g.lines.length} order line{g.lines.length === 1 ? '' : 's'} · who ordered</summary>
        <ul className="mt-2 space-y-1">
          {g.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <Link to="/admin/sales" className="hover:underline">{l.sale.customer_name || 'Customer'} · {l.sale.invoice_number}{phoneOf(l.sale.customer_id) ? ` · ${phoneOf(l.sale.customer_id)}` : ''}</Link>
              <span>{l.size || 'One size'} × {l.toOrder} <Badge tone={l.sale.payment_status}>{label(l.sale.payment_status)}</Badge></span>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-3 flex justify-end gap-2">{action}</div>
    </Card>
  );
}
