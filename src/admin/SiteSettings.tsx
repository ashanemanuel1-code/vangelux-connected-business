import { useEffect, useState } from 'react';
import { Globe, Save, RotateCcw, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SITE_DEFAULTS, applySite, type SiteContent } from '../lib/brand';
import { isNativeApp } from '../lib/native';
import { Button, Card, Field, PageHeader, Spinner, useToast, errMsg, confirmDialog } from '../components/ui';

type Key = keyof SiteContent;
type FieldDef = { key: Key; label: string; hint?: string; long?: boolean; type?: string };

const GROUPS: { title: string; text: string; fields: FieldDef[] }[] = [
  {
    title: 'Contact details', text: 'Shown on the website, invoices and quotations.',
    fields: [
      { key: 'email', label: 'Email', type: 'email', hint: 'Your VANGELUX business email' },
      { key: 'whatsappNumber', label: 'WhatsApp number', hint: 'Country code + number, digits only, e.g. 94776271143. Enquiry buttons open a chat with this number.' },
      { key: 'whatsappDisplay', label: 'WhatsApp number as shown', hint: 'How the number is written on the website, e.g. +94 77 627 1143' },
    ],
  },
  {
    title: 'Social media', text: 'Links in the website footer. Leave TikTok blank to hide it.',
    fields: [
      { key: 'instagram', label: 'Instagram link', type: 'url' },
      { key: 'instagramHandle', label: 'Instagram name shown', hint: 'e.g. @vangelux.co' },
      { key: 'facebook', label: 'Facebook link', type: 'url' },
      { key: 'facebookLabel', label: 'Facebook text shown' },
      { key: 'tiktok', label: 'TikTok link (optional)', type: 'url' },
      { key: 'tiktokHandle', label: 'TikTok name shown', hint: 'e.g. @vangelux' },
    ],
  },
  {
    title: 'Website — top of the page', text: 'The first thing visitors see.',
    fields: [
      { key: 'heroEyebrow', label: 'Small heading', hint: 'e.g. FAITH-DRIVEN STREETWEAR' },
      { key: 'heroTitle', label: 'Main headline (white)' },
      { key: 'heroTitleGold', label: 'Main headline (gold, second line)' },
      { key: 'tagline', label: 'Tagline', hint: 'Shown under the headline and in the footer' },
    ],
  },
  {
    title: 'Website — our story', text: 'Press Enter for a new line.',
    fields: [
      { key: 'storyTitle', label: 'Story heading', long: true },
      { key: 'storyText', label: 'Story text', long: true },
      { key: 'toWorld', label: '“To the world” box', long: true },
      { key: 'toWearer', label: '“To the wearer” box', long: true },
      { key: 'scripture', label: 'Scripture line (leave blank to hide)', long: true },
    ],
  },
  {
    title: 'Website — other text', text: '',
    fields: [
      { key: 'collectionsTitle', label: 'Collections heading' },
      { key: 'shopTitle', label: 'Catalogue heading' },
      { key: 'howToOrder', label: '“How to order” text (footer)', long: true },
      { key: 'footerAbout', label: 'Footer text under the logo', long: true },
    ],
  },
  {
    title: 'Invoices & quotations', text: 'Printed on every PDF you send.',
    fields: [
      { key: 'docSubtitle', label: 'Line under VANGELUX (FROM box)' },
      { key: 'invoiceThanks', label: 'Thank-you note at the bottom of invoices', long: true },
    ],
  },
];

export default function SiteSettings() {
  const toast = useToast();
  const [f, setF] = useState<SiteContent>({ ...SITE_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    supabase.from('site_settings').select('content').eq('id', 'main').maybeSingle().then(({ data }) => {
      const c = (data?.content ?? {}) as Partial<SiteContent>;
      setF({ ...SITE_DEFAULTS, ...Object.fromEntries(Object.entries(c).filter(([, v]) => typeof v === 'string')) } as SiteContent);
      setLoading(false);
    });
  }, []);

  const set = (k: Key, v: string) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };

  async function save() {
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast('error', 'Please check the email address');
    if (!f.whatsappNumber.replace(/\D/g, '')) return toast('error', 'Enter the WhatsApp number');
    for (const k of ['instagram', 'facebook', 'tiktok'] as Key[]) {
      if (f[k] && !/^https?:\/\//i.test(f[k])) return toast('error', `The ${k} link should start with https://`);
    }
    setSaving(true);
    const content = { ...f, whatsappNumber: f.whatsappNumber.replace(/\D/g, '') };
    const { error } = await supabase.from('site_settings').upsert({ id: 'main', content, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast('error', errMsg(error));
    applySite(content); setDirty(false);
    toast('ok', 'Saved — the website, invoices and quotations now use these details');
  }

  function resetAll() {
    if (!confirmDialog('Put every field back to the original VANGELUX text? (Nothing is saved until you press Save.)')) return;
    setF({ ...SITE_DEFAULTS }); setDirty(true);
  }

  if (loading) return <Spinner />;

  return (
    <div className="pb-24">
      <PageHeader title="Website & contact" subtitle="Change your email, WhatsApp, social media and the text on your website. Blank fields use the original VANGELUX text."
        actions={<>
          {!isNativeApp() && <a href="#/" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="h-4 w-4" /> View website</Button></a>}
          <Button variant="gold" loading={saving} onClick={save} disabled={!dirty}><Save className="h-4 w-4" /> Save</Button></>} />

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <h2 className="flex items-center gap-2 font-display text-lg"><Globe className="h-4 w-4 text-gold-dark" /> {g.title}</h2>
            {g.text && <p className="mb-4 text-xs text-neutral-500">{g.text}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              {g.fields.map((d) => (
                <Field key={d.key} label={d.label} hint={d.hint} className={d.long ? 'sm:col-span-2' : ''}>
                  {d.long
                    ? <textarea className="field min-h-24" value={f[d.key]} placeholder={SITE_DEFAULTS[d.key]} onChange={(e) => set(d.key, e.target.value)} />
                    : <input className="field" type={d.type ?? 'text'} value={f[d.key]} placeholder={SITE_DEFAULTS[d.key]} onChange={(e) => set(d.key, e.target.value)} />}
                </Field>
              ))}
            </div>
          </Card>
        ))}
        <button onClick={resetAll} className="flex items-center gap-2 text-sm text-neutral-500 hover:text-red-700"><RotateCcw className="h-4 w-4" /> Reset all to original text</button>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-ivory shadow-xl lg:bottom-6">
          <span>You have unsaved changes</span>
          <Button variant="gold" loading={saving} onClick={save}><Save className="h-4 w-4" /> Save</Button>
        </div>
      )}
    </div>
  );
}
