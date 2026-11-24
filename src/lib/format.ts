const lkr = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lkr0 = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });

export const money = (n: number | string | null | undefined) => lkr.format(Number(n || 0));
export const money0 = (n: number | string | null | undefined) => lkr0.format(Number(n || 0));
export const num = (n: number | string | null | undefined) => Number(n || 0);
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00' : d) : d;
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
export const label = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export function effectivePrice(price: number, discountPercent: number) {
  return round2(num(price) * (1 - num(discountPercent) / 100));
}

/** Discount (LKR) for a line from a product's discount %, e.g. 4,500 × 2 at 10% → 900. */
export function productDiscount(unitPrice: number, qty: number, discountPercent: number) {
  return Math.round(num(unitPrice) * Math.max(1, num(qty)) * num(discountPercent)) / 100;
}

/**
 * When the quantity changes, keep a product's automatic discount in step
 * (only if the line still carries exactly the automatic amount — manual discounts are left alone).
 */
export function rescaleDiscount(line: { unit_price: number; quantity: number; discount_amount: number }, newQty: number, discountPercent: number) {
  if (!num(discountPercent)) return line.discount_amount;
  const auto = productDiscount(line.unit_price, line.quantity, discountPercent);
  return Math.abs(num(line.discount_amount) - auto) < 0.01 ? productDiscount(line.unit_price, newQty, discountPercent) : line.discount_amount;
}
