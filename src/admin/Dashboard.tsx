import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Eye, Palette, Layers, TrendingUp, Receipt, Wallet, PiggyBank, FileText, AlertCircle, Boxes, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money0, num } from '../lib/format';
import { useLiveRefresh } from '../lib/useRealtime';
import { Button, Card, PageHeader, Spinner, useToast, errMsg } from '../components/ui';

interface Dash {
  published_products: number; total_designs: number; total_collections: number; total_sales: number; sales_count: number; total_cogs: number;
  total_expenses: number; operating_expenses: number; pending_quotations: number; outstanding_payments: number; inventory_quantity: number;
  low_stock: { name: string; sku: string; size: string; color: string; quantity: number; product_id: string }[];
  monthly: { month: string; sales: number; expenses: number; cogs: number; gross_profit: number; net_profit: number }[];
  best_sellers: { name: string; quantity: number; revenue: number }[];
  collection_performance: { name: string; quantity: number; revenue: number }[];
}

const GOLD = '#C9A24A', INK = '#0B0B0B', GREY = '#9CA3AF', RED = '#9B1C1C';
const monthLabel = (m: string) => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const k = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

export default function Dashboard() {
  const toast = useToast();
  const [d, setD] = useState<Dash | null>(null);
  const [months, setMonths] = useState(12);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_dashboard', { p_months: months });
    if (error) toast('error', errMsg(error)); else setD(data as Dash);
  }, [months, toast]);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['sales', 'expenses', 'products', 'quotations', 'inventory_movements', 'collections'], load);

  if (!d) return <Spinner />;
  const gross = num(d.total_sales) - num(d.total_cogs);
  const net = gross - num(d.operating_expenses);
  const monthly = d.monthly.map((m) => ({ ...m, label: monthLabel(m.month), sales: num(m.sales), expenses: num(m.expenses), gross_profit: num(m.gross_profit), net_profit: num(m.net_profit) }));

  const kpis = [
    { label: 'Published products', value: d.published_products, icon: Eye, to: '/admin/products' },
    { label: 'Total designs', value: d.total_designs, icon: Palette, to: '/admin/products' },
    { label: 'Collections', value: d.total_collections, icon: Layers, to: '/admin/collections' },
    { label: 'Total sales', value: money0(d.total_sales), icon: TrendingUp, to: '/admin/sales', sub: `${d.sales_count} orders` },
    { label: 'Total expenses', value: money0(d.total_expenses), icon: Receipt, to: '/admin/expenses' },
    { label: 'Gross profit', value: money0(gross), icon: Wallet, tone: gross < 0 ? 'bad' : 'good', sub: 'Sales − cost of goods' },
    { label: 'Net profit', value: money0(net), icon: PiggyBank, tone: net < 0 ? 'bad' : 'good', sub: 'Gross − operating expenses' },
    { label: 'Pending quotations', value: d.pending_quotations, icon: FileText, to: '/admin/quotations' },
    { label: 'Outstanding payments', value: money0(d.outstanding_payments), icon: AlertCircle, to: '/admin/sales', tone: num(d.outstanding_payments) > 0 ? 'bad' : undefined },
    { label: 'Units in stock', value: d.inventory_quantity, icon: Boxes, to: '/admin/inventory', sub: d.low_stock.length ? `${d.low_stock.length} low` : undefined },
  ] as const;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live figures from your sales, expenses, stock and catalogue."
        actions={<>
          <select className="field w-auto" value={months} onChange={(e) => setMonths(Number(e.target.value))}><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option></select>
          <Link to="/admin/products/new"><Button variant="gold"><Plus className="h-4 w-4" /> Product</Button></Link></>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((x) => {
          const body = (
            <Card className="h-full transition hover:border-gold">
              <div className="flex items-start justify-between"><p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{x.label}</p><x.icon className="h-4 w-4 text-gold" /></div>
              <p className={`mt-2 text-xl font-semibold sm:text-2xl ${'tone' in x && x.tone === 'bad' ? 'text-red-700' : 'tone' in x && x.tone === 'good' ? 'text-emerald-700' : ''}`}>{x.value}</p>
              {'sub' in x && x.sub && <p className="text-xs text-neutral-500">{x.sub}</p>}
            </Card>
          );
          return 'to' in x && x.to ? <Link key={x.label} to={x.to}>{body}</Link> : <div key={x.label}>{body}</div>;
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Monthly sales vs expenses</h2>
          <div className="h-64"><ResponsiveContainer><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={k} fontSize={11} />
            <Tooltip formatter={(v) => money0(Number(v))} /><Legend /><Bar dataKey="sales" name="Sales" fill={GOLD} radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill={INK} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Profit trend</h2>
          <div className="h-64"><ResponsiveContainer><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="label" fontSize={11} /><YAxis tickFormatter={k} fontSize={11} />
            <Tooltip formatter={(v) => money0(Number(v))} /><Legend /><Line type="monotone" dataKey="gross_profit" name="Gross profit" stroke={GOLD} strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="net_profit" name="Net profit" stroke={INK} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Best-selling products</h2>
          {d.best_sellers.length === 0 ? <p className="py-16 text-center text-sm text-neutral-500">No sales recorded yet.</p> :
            <div className="space-y-3">{(() => {
              const max = Math.max(...d.best_sellers.map((b) => num(b.quantity)), 1);
              return d.best_sellers.map((b, i) => (
                <div key={b.name}>
                  <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate"><b className="mr-2 text-gold-dark">{i + 1}</b>{b.name}</span><span className="shrink-0 text-neutral-500">{num(b.quantity)} sold · {money0(b.revenue)}</span></div>
                  <div className="h-2.5 rounded-full bg-neutral-100"><div className="h-2.5 rounded-full bg-gold" style={{ width: `${(num(b.quantity) / max) * 100}%` }} /></div>
                </div>
              ));
            })()}</div>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Collection performance</h2>
          {d.collection_performance.length === 0 ? <p className="py-16 text-center text-sm text-neutral-500">No sales recorded yet.</p> :
            <div className="h-64"><ResponsiveContainer><BarChart data={d.collection_performance.map((c) => ({ ...c, revenue: num(c.revenue) }))}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="name" fontSize={10} /><YAxis tickFormatter={k} fontSize={11} />
              <Tooltip formatter={(v) => money0(Number(v))} /><Bar dataKey="revenue" name="Revenue" fill={INK} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}
        </Card>
      </div>

      {d.low_stock.length > 0 && (
        <Card className="mt-5 border-amber-300 bg-amber-50">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><AlertCircle className="h-4 w-4" /> Low stock</h2>
          <div className="flex flex-wrap gap-2">{d.low_stock.map((s) => (
            <Link key={s.product_id + s.size + s.color} to={`/admin/inventory?product=${s.product_id}`} className="rounded-full bg-white px-3 py-1 text-xs hover:ring-1 hover:ring-gold">{s.name} {[s.size, s.color].filter(Boolean).join(' · ')}: <b style={{ color: RED }}>{s.quantity}</b></Link>
          ))}</div>
        </Card>
      )}
      <p className="mt-4 text-xs" style={{ color: GREY }}>Quotations are not counted as sales. Cancelled/returned orders are excluded. Production expense categories are part of product unit cost, so they are not subtracted twice from net profit (Settings → Expense categories).</p>
    </div>
  );
}
