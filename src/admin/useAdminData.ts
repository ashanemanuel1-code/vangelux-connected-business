import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLiveRefresh } from '../lib/useRealtime';
import type { Collection, ExpenseCategory, Lookup, SizeOption, Tag } from '../lib/types';

export interface Lookups {
  categories: Lookup[]; fitTypes: Lookup[]; targets: Lookup[]; sizes: SizeOption[]; tags: Tag[];
  collections: Collection[]; expenseCategories: ExpenseCategory[];
}
const empty: Lookups = { categories: [], fitTypes: [], targets: [], sizes: [], tags: [], collections: [], expenseCategories: [] };

/** Editable option lists used across the admin app (always loaded from the database). */
export function useLookups() {
  const [data, setData] = useState<Lookups>(empty);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [c, f, t, s, tg, col, ec] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order').order('name'),
      supabase.from('fit_types').select('*').order('sort_order'),
      supabase.from('target_customers').select('*').order('sort_order'),
      supabase.from('size_options').select('*').order('size_group').order('sort_order'),
      supabase.from('tags').select('*').order('sort_order').order('name'),
      supabase.from('collections').select('*').order('sort_order'),
      supabase.from('expense_categories').select('*').order('sort_order'),
    ]);
    setData({
      categories: (c.data ?? []) as Lookup[], fitTypes: (f.data ?? []) as Lookup[], targets: (t.data ?? []) as Lookup[],
      sizes: (s.data ?? []) as SizeOption[], tags: (tg.data ?? []) as Tag[], collections: (col.data ?? []) as Collection[],
      expenseCategories: (ec.data ?? []) as ExpenseCategory[],
    });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveRefresh(['tags', 'collections'], load);
  return { ...data, loading, reload: load };
}

export const nameOf = (list: { id: string; name: string }[], id: string | null | undefined) =>
  list.find((x) => x.id === id)?.name ?? '';
