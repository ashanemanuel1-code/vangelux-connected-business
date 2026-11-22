-- =====================================================================
-- VANGELUX — "From stock or to order" (pre-orders)
--
-- * Products are the catalogue. Inventory is what you physically have.
--   Any product (concept or not) can hold stock.
-- * Every sale line is split automatically:
--     from_stock = how many come out of what you have in hand
--     the rest   = to order / produce (pre-order)
-- * supply_status tracks the "to order" part: to_order → ordered → received.
-- * Customers never see stock: nothing here is exposed to the showroom.
--
-- Safe to run more than once. Existing data is kept.
-- =====================================================================

alter table public.sale_items add column if not exists from_stock int check (from_stock >= 0);
alter table public.sale_items add column if not exists supply_status text not null default 'none';
do $$ begin
  alter table public.sale_items add constraint sale_items_supply_status_check
    check (supply_status in ('none','to_order','ordered','received'));
exception when duplicate_object then null; end $$;

-- Stock = everything recorded in Inventory, for every product.
create or replace view public.stock_levels with (security_invoker = true) as
select m.product_id, m.size, m.color, sum(m.quantity)::int as quantity
from public.inventory_movements m
join public.products p on p.id = m.product_id
group by m.product_id, m.size, m.color;

-- Decide how much of each line comes from stock (unless the app sends a number).
create or replace function public.trg_sale_item_allocate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  avail int := 0;
  mine  int := 0;
  auto  boolean;
begin
  auto := new.from_stock is null
       or (tg_op = 'UPDATE'
           and new.from_stock is not distinct from old.from_stock
           and (new.product_id is distinct from old.product_id
             or new.size is distinct from old.size
             or new.color is distinct from old.color
             or new.quantity is distinct from old.quantity));

  if new.product_id is null then
    new.from_stock := 0;                         -- custom item: always made to order
  elsif auto then
    select coalesce(sum(quantity), 0) into avail
      from public.inventory_movements
     where product_id = new.product_id and size = coalesce(new.size, '') and color = coalesce(new.color, '');
    if tg_op = 'UPDATE' then                     -- this line's own deduction is still "available" to it
      select coalesce(-sum(quantity), 0) into mine
        from public.inventory_movements
       where sale_item_id = new.id and product_id = new.product_id
         and size = coalesce(new.size, '') and color = coalesce(new.color, '');
    end if;
    new.from_stock := greatest(0, least(new.quantity, avail + mine));
  end if;

  new.from_stock := least(new.from_stock, new.quantity);

  if new.quantity - new.from_stock <= 0 then
    new.supply_status := 'none';
  elsif new.supply_status = 'none' then
    new.supply_status := 'to_order';
  end if;
  return new;
end $$;

drop trigger if exists sale_items_allocate on public.sale_items;
create trigger sale_items_allocate
before insert or update on public.sale_items
for each row execute function public.trg_sale_item_allocate();

-- Only the "from stock" part is deducted from inventory.
create or replace function public.sync_sale_item_stock(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it record;
begin
  select si.*, s.order_status into it
  from public.sale_items si join public.sales s on s.id = si.sale_id
  where si.id = p_item_id;

  if not found
     or it.product_id is null
     or it.order_status in ('cancelled','returned')
     or coalesce(it.from_stock, 0) = 0 then
    delete from public.inventory_movements where sale_item_id = p_item_id;
    return;
  end if;

  insert into public.inventory_movements (product_id, size, color, movement_type, quantity, sale_item_id, note)
  values (it.product_id, coalesce(it.size,''), coalesce(it.color,''), 'sale', -it.from_stock, it.id, 'Auto: sale line (from stock)')
  on conflict (sale_item_id) where sale_item_id is not null do update
    set product_id = excluded.product_id,
        size       = excluded.size,
        color      = excluded.color,
        quantity   = excluded.quantity;
end $$;

revoke execute on function public.trg_sale_item_allocate() from public, anon;
revoke execute on function public.sync_sale_item_stock(uuid) from public, anon;

-- Existing sale lines: keep exactly what was deducted before.
update public.sale_items si
   set from_stock = coalesce((select -m.quantity from public.inventory_movements m where m.sale_item_id = si.id), 0)
 where si.from_stock is null;
