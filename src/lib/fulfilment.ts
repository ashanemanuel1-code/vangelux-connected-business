import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { num } from './format';
import { useLiveRefresh } from './useRealtime';
import { OPEN_ORDER_STATUSES, type Sale, type SaleItem } from './types';

export type OpenSale = Sale & { sale_items: SaleItem[] };
export type OrderLine = SaleItem & { sale: OpenSale; toOrder: number };
export type Group = { key: string; product_id: string | null; name: string; color: string; total: number; sizes: [string, number][]; lines: OrderLine[] };

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
const sizeRank = (s: string) => { const i = SIZE_ORDER.indexOf(s.toUpperCase()); return i >= 0 ? i : 100 + (Number.parseFloat(s) || 0); };

/** Pieces of a line that still have to be ordered / produced. */
export const toOrderQty = (i: SaleItem) => Math.max(0, num(i.quantity) - num(i.from_stock));

/** Group order lines by design + colour, adding up the sizes. */
export function groupLines(lines: OrderLine[], productName: (id: string) => string | undefined): Group[] {
  const m = new Map<string, Group>();
  for (const l of lines) {
    const name = (l.product_id && productName(l.product_id)) || l.description || 'Item';
    const color = l.color || '';
    const key = `${l.product_id ?? 'custom:' + name.toLowerCase()}|${color}`;
    const g = m.get(key) ?? { key, product_id: l.product_id, name, color, total: 0, sizes: [], lines: [] };
    g.total += l.toOrder;
    g.lines.push(l);
    m.set(key, g);
  }
  for (const g of m.values()) {
    const sz = new Map<string, number>();
    g.lines.forEach((l) => sz.set(l.size || 'One size', (sz.get(l.size || 'One size') ?? 0) + l.toOrder));
    g.sizes = [...sz.entries()].sort((a, b) => sizeRank(a[0]) - sizeRank(b[0]));
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Loads open orders (pending / confirmed / processing) and splits them into the To order workflow. */
export function useFulfilment() {
  const [sales, setSales] = useState<OpenSale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sales').select('*, sale_items(*)').in('order_status', OPEN_ORDER_STATUSES).order('sale_date', { ascending: true });
    setSales((data ?? []) as OpenSale[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['sales', 'sale_items', 'inventory_movements'], load, { pollMs: 60000 });

  const lines = sales.flatMap((s) => s.sale_items.map((i) => ({ ...i, sale: s, toOrder: toOrderQty(i) })));
  const toOrder = lines.filter((l) => l.toOrder > 0 && l.supply_status === 'to_order');
  const onOrder = lines.filter((l) => l.toOrder > 0 && l.supply_status === 'ordered');
  const ready = sales.filter((s) => s.sale_items.length > 0 && s.sale_items.every((i) => toOrderQty(i) === 0 || i.supply_status === 'received'));
  return {
    loading, reload: load, sales, toOrder, onOrder, ready,
    piecesToOrder: toOrder.reduce((a, l) => a + l.toOrder, 0),
    piecesOnOrder: onOrder.reduce((a, l) => a + l.toOrder, 0),
  };
}
