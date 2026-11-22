import { supabase, MEDIA_BUCKET, RECEIPTS_BUCKET } from './supabase';
import { asset } from './brand';
import { prepareImage } from './image';

/** Public URL for a product/collection image. Bundled brand files ('brand/…') resolve locally. */
export function mediaUrl(path: string | null | undefined) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith('brand/')) return asset(path);
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  // no cache-busting needed: a replaced image always gets a new random path
  return data.publicUrl;
}

function randomName(ext: string) {
  return `${crypto.randomUUID()}.${ext}`;
}

/** Resize/compress a photo on the device, then upload to Supabase Storage. Returns the storage path. */
export async function uploadMedia(file: File, folder: string): Promise<string> {
  const prepared = await prepareImage(file, 2000);
  const ext = prepared.type === 'image/png' ? 'png' : prepared.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${randomName(ext)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, prepared, {
    cacheControl: '31536000', upsert: false, contentType: prepared.type,
  });
  if (error) throw error;
  return path;
}

export async function deleteMedia(paths: string[]) {
  const real = paths.filter((p) => p && !p.startsWith('brand/') && !/^https?:/.test(p));
  if (!real.length) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(real);
}

export async function uploadReceipt(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf';
  const body = isPdf ? file : await prepareImage(file, 1800);
  const ext = isPdf ? 'pdf' : body.type === 'image/png' ? 'png' : 'jpg';
  const path = `${new Date().getFullYear()}/${randomName(ext)}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, body, { contentType: body.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function receiptUrl(path: string) {
  const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteReceipt(path: string) {
  await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
}
