import { useEffect, useState } from 'react';

/**
 * Website & contact details. These are the defaults — you can change all of them in
 * Admin → Website & contact (saved in the database, no code needed).
 */
export const SITE_DEFAULTS = {
  // contact & social
  email: 'vangeluxclothing@gmail.com',
  whatsappNumber: '94776271143',
  whatsappDisplay: '+94 77 627 1143',
  instagram: 'https://www.instagram.com/vangelux.co/',
  instagramHandle: '@vangelux.co',
  facebook: 'https://www.facebook.com/profile.php?id=61596051526579',
  facebookLabel: 'VANGELUX on Facebook',
  tiktok: '',
  tiktokHandle: '',
  // website text
  heroEyebrow: 'FAITH-DRIVEN STREETWEAR',
  heroTitle: 'MORE THAN CLOTHING.',
  heroTitleGold: 'A MESSAGE.',
  tagline: "If your voice won't, let your clothing speak.",
  storyTitle: 'A message to the world.\nA reminder to yourself.',
  storyText: 'VANGELUX was born from a simple thought: what if the clothes we wear could do more than make a fashion statement? What if they could carry a message, start conversations about Jesus, and remind us daily of whom we represent?',
  toWorld: 'Biblical truth through meaningful design — creating curiosity, respectful conversations and hope in everyday places.',
  toWearer: 'A daily reminder to live with grace, stand firm in faith, and honour Jesus — even when no one is watching.',
  scripture: '“I tell you that, if these should hold their peace, the stones would immediately cry out.” — Luke 19:40 (KJV)',
  collectionsTitle: 'Wear the message',
  shopTitle: 'Shop the message',
  footerAbout: 'Faith-driven Christian streetwear. A message to the world. A reminder to yourself.',
  howToOrder: "Choose a design and size, then tap Enquire on WhatsApp. We'll confirm availability, delivery and payment with you personally.",
  // invoices & quotations
  docSubtitle: 'Faith-driven Christian streetwear',
  invoiceThanks: 'Thank you for supporting VANGELUX.\nPlease keep this invoice for any exchange or return enquiries.',
};
export type SiteContent = typeof SITE_DEFAULTS;

/** Current values (defaults until the saved settings load). Read at render / PDF time. */
export const SITE: SiteContent = { ...SITE_DEFAULTS };

export const BRAND = {
  name: 'VANGELUX',
  heroTitle: 'MORE THAN CLOTHING. A MESSAGE.',
  tagline: SITE.tagline,
  philosophy: 'A message to the world. A reminder to yourself.',
  instagram: SITE.instagram,
  facebook: SITE.facebook,
  email: SITE.email,
  whatsappNumber: SITE.whatsappNumber,
  whatsapp: `https://wa.me/${SITE.whatsappNumber}`,
  currency: 'LKR',
};

const listeners = new Set<() => void>();
let version = 0;

/** Apply saved settings (from the database). Empty values fall back to the defaults. */
export function applySite(content: Partial<SiteContent> | null | undefined) {
  if (!content) return;
  for (const k of Object.keys(SITE_DEFAULTS) as (keyof SiteContent)[]) {
    const v = content[k];
    // tiktok fields may be blank on purpose; everything else falls back to the default
    SITE[k] = typeof v === 'string' && (v.trim() || k.startsWith('tiktok')) ? v.trim() : SITE_DEFAULTS[k];
  }
  SITE.whatsappNumber = SITE.whatsappNumber.replace(/\D/g, '') || SITE_DEFAULTS.whatsappNumber;
  Object.assign(BRAND, {
    tagline: SITE.tagline, instagram: SITE.instagram, facebook: SITE.facebook, email: SITE.email,
    whatsappNumber: SITE.whatsappNumber, whatsapp: `https://wa.me/${SITE.whatsappNumber}`,
  });
  version++;
  listeners.forEach((l) => l());
}

/** Re-render a component whenever the website settings change. */
export function useSite(): SiteContent {
  const [, setV] = useState(version);
  useEffect(() => { const l = () => setV(version); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return SITE;
}

export function whatsappLink(message: string, number = BRAND.whatsappNumber) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Resolve a public asset bundled with the app (works under any GitHub Pages sub-path). */
export function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
