import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND, asset } from './brand';
import { fmtDate, addDays, num } from './format';
import { urlToDataUrl } from './image';
import type { Quotation, QuotationItem } from './types';

const GOLD: [number, number, number] = [201, 162, 74];
const INK: [number, number, number] = [11, 11, 11];
const fmt = (n: number) => 'LKR ' + num(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function quoteTotals(q: Pick<Quotation, 'discount_amount' | 'delivery_fee'>, items: QuotationItem[]) {
  const gross = items.reduce((a, i) => a + num(i.quantity) * num(i.unit_price), 0);
  const lineDiscounts = items.reduce((a, i) => a + num(i.discount_amount), 0);
  const subtotal = gross - lineDiscounts;
  const discount = num(q.discount_amount);
  const delivery = num(q.delivery_fee);
  return { gross, lineDiscounts, subtotal, discount, delivery, total: subtotal - discount + delivery };
}

async function loadLogo() {
  try {
    const res = await fetch(asset('brand/logo-white.png'));
    const blob = await res.blob();
    const data: string = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
    const img = await createImageBitmap(blob);
    return { data, w: img.width, h: img.height };
  } catch { return null; }
}

/** Builds a branded A4 quotation PDF. `imageUrls` maps item index → product image URL. */
export async function buildQuotationPdf(q: Quotation, items: QuotationItem[], imageUrls: (string | null)[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  // header band
  doc.setFillColor(...INK); doc.rect(0, 0, W, 40, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 40, W, 0.8, 'F');
  const logo = await loadLogo();
  if (logo) { const h = 22; doc.addImage(logo.data, 'PNG', M, 9, (logo.w / logo.h) * h, h); }
  else { doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text('VANGELUX', M, 24); }
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('QUOTATION', W - M, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(230, 230, 230);
  doc.text(q.quote_number, W - M, 25, { align: 'right' });
  doc.text(`Date: ${fmtDate(q.issue_date)}`, W - M, 30, { align: 'right' });
  doc.text(`Valid until: ${fmtDate(addDays(q.issue_date, q.validity_days))}`, W - M, 35, { align: 'right' });

  // parties
  let y = 52;
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('PREPARED FOR', M, y); doc.text('FROM', W / 2 + 4, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const cust = [q.customer_name, q.customer_phone, q.customer_email, q.customer_address].filter(Boolean) as string[];
  const custLines = cust.flatMap((l) => doc.splitTextToSize(l, W / 2 - M - 4) as string[]);
  custLines.forEach((l, i) => doc.text(l, M, y + 6 + i * 5));
  ['VANGELUX', 'Faith-driven Christian streetwear', `WhatsApp: +${BRAND.whatsappNumber}`, BRAND.email, 'instagram.com/vangelux.co'].forEach((l, i) => doc.text(l, W / 2 + 4, y + 6 + i * 5));
  y += 8 + Math.max(custLines.length, 5) * 5;

  // pre-load thumbnails
  const thumbs = await Promise.all(imageUrls.map((u) => (u ? urlToDataUrl(u) : Promise.resolve(null))));
  const hasImg = thumbs.some(Boolean);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [[...(hasImg ? [''] : []), 'Item', 'Size', 'Colour', 'Qty', 'Unit price', 'Discount', 'Amount']],
    body: items.map((it) => [
      ...(hasImg ? [''] : []),
      `${it.description}${it.sku ? `\n${it.sku}` : ''}`, it.size || '—', it.color || '—', String(it.quantity),
      fmt(it.unit_price), num(it.discount_amount) ? fmt(it.discount_amount) : '—', fmt(num(it.quantity) * num(it.unit_price) - num(it.discount_amount)),
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5, valign: 'middle', lineColor: [225, 220, 205], lineWidth: 0.2, textColor: INK },
    headStyles: { fillColor: INK, textColor: GOLD, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 248, 242] },
    columnStyles: hasImg
      ? { 0: { cellWidth: 18, minCellHeight: 18 }, 4: { halign: 'center' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } }
      : { 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' } },
    didDrawCell: (d) => {
      if (!hasImg || d.section !== 'body' || d.column.index !== 0) return;
      const t = thumbs[d.row.index];
      if (!t) return;
      const size = Math.min(d.cell.width, d.cell.height) - 2;
      const w = t.w >= t.h ? size : (t.w / t.h) * size;
      const h = t.h >= t.w ? size : (t.h / t.w) * size;
      doc.addImage(t.data, 'JPEG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h);
    },
  });

  // totals
  const t = quoteTotals(q, items);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;
  if (y > H - 70) { doc.addPage(); y = 20; }
  const rows: [string, string][] = [['Subtotal', fmt(t.subtotal)]];
  if (t.discount) rows.push(['Discount', '- ' + fmt(t.discount)]);
  rows.push(['Delivery', t.delivery ? fmt(t.delivery) : 'Free']);
  const x1 = W - M - 76;
  const xr = W - M - 3;
  doc.setFontSize(10);
  rows.forEach(([k, v], i) => { doc.setTextColor(90, 90, 90); doc.text(k, x1, y + i * 6); doc.setTextColor(...INK); doc.text(v, xr, y + i * 6, { align: 'right' }); });
  y += rows.length * 6 + 1;
  doc.setFillColor(...INK); doc.rect(x1 - 3, y - 1, W - M - (x1 - 3), 10, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('TOTAL', x1, y + 5.5); doc.text(fmt(t.total), xr, y + 5.5, { align: 'right' });
  y += 18;

  // terms
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  if (q.notes) { doc.text('NOTES', M, y); doc.setFont('helvetica', 'normal'); const n = doc.splitTextToSize(q.notes, W - 2 * M); doc.text(n, M, y + 5); y += 7 + n.length * 4.5; doc.setFont('helvetica', 'bold'); }
  if (q.terms) {
    if (y > H - 40) { doc.addPage(); y = 20; }
    doc.text('TERMS & CONDITIONS', M, y); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(q.terms, W - 2 * M); doc.text(lines, M, y + 5);
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...GOLD); doc.rect(M, H - 16, W - 2 * M, 0.4, 'F');
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text("IF YOUR VOICE WON'T, LET YOUR CLOTHING SPEAK.", M, H - 10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${q.quote_number} · Page ${i}/${pages}`, W - M, H - 10, { align: 'right' });
  }
  return doc;
}

/** Local Sri Lankan numbers (07x…) → international (947x…) for wa.me links. */
export function toWhatsAppNumber(phone: string | null | undefined) {
  if (!phone) return '';
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('0')) d = '94' + d.slice(1);
  return d;
}
