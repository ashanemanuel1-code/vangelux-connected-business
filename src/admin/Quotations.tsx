import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, fmtDate, addDays, today, label } from '../lib/format';
import { quoteTotals } from '../lib/pdf';
import { useLiveRefresh } from '../lib/useRealtime';
import { QUOTE_STATUSES, type Quotation } from '../lib/types';
import { Badge, Button, Card, Empty, PageHeader, Spinner } from '../components/ui';

export default function Quotations() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false });
    setRows((data ?? []) as Quotation[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['quotations'], load);

  const shown = rows.filter((r) => !status || r.status === status);
  return (
    <div>
      <PageHeader title="Quotations" subtitle="Quotations never count as sales until converted into an order."
        actions={<Button variant="gold" onClick={() => nav('/admin/quotations/new')}><Plus className="h-4 w-4" /> New quotation</Button>} />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        {['', ...QUOTE_STATUSES].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${status === s ? 'bg-ink text-ivory' : 'bg-white text-neutral-600'}`}>
            {s ? label(s) : 'All'} <span className="text-xs opacity-60">{s ? rows.filter((r) => r.status === s).length : rows.length}</span>
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : shown.length === 0 ? (
        <Empty icon={<FileText className="h-10 w-10" />} title="No quotations" action={<Button variant="gold" onClick={() => nav('/admin/quotations/new')}>Create quotation</Button>} />
      ) : (
        <Card className="divide-y divide-neutral-100 p-0 sm:p-0">
          {shown.map((q) => {
            const validUntil = addDays(q.issue_date, q.validity_days);
            const lapsed = ['draft', 'sent'].includes(q.status) && validUntil < today();
            return (
              <button key={q.id} onClick={() => nav(`/admin/quotations/${q.id}`)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-neutral-50 sm:p-4">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{q.customer_name} <span className="text-xs text-neutral-400">{q.quote_number}</span></p>
                  <p className="text-xs text-neutral-500">{fmtDate(q.issue_date)} · valid until {fmtDate(validUntil)} · {(q.quotation_items ?? []).length} item(s)</p>
                </div>
                {lapsed && <Badge tone="expired">validity passed</Badge>}
                {q.converted_sale_id && <Badge tone="completed">order created</Badge>}
                <Badge tone={q.status}>{q.status}</Badge>
                <b className="w-28 text-right">{money(quoteTotals(q, q.quotation_items ?? []).total)}</b>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}
