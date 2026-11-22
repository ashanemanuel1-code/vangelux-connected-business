export const BRAND = {
  name: 'VANGELUX',
  heroTitle: 'MORE THAN CLOTHING. A MESSAGE.',
  tagline: "If your voice won't, let your clothing speak.",
  philosophy: 'A message to the world. A reminder to yourself.',
  instagram: 'https://www.instagram.com/vangelux.co/',
  facebook: 'https://www.facebook.com/profile.php?id=61596051526579',
  email: 'ashanemanuel1@gmail.com',
  whatsappNumber: '94776271143',
  whatsapp: 'https://wa.me/94776271143',
  currency: 'LKR',
};

export function whatsappLink(message: string, number = BRAND.whatsappNumber) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Resolve a public asset bundled with the app (works under any GitHub Pages sub-path). */
export function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
