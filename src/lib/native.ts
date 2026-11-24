import { Capacitor } from '@capacitor/core';

/** True inside the VANGELUX Admin Android app (false on the website). */
export const isNativeApp = () => Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Android app: saves the file and opens the Android share menu
 * (WhatsApp, Gmail, Drive, "Save to Files", a PDF viewer to print…).
 * Returns false if the user simply closed the menu.
 */
export async function shareNativeFile(blob: Blob, filename: string, text?: string): Promise<boolean> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const safe = filename.replace(/[^\w.-]+/g, '_');
  const res = await Filesystem.writeFile({ path: safe, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, text, files: [res.uri], dialogTitle: 'Share or save' });
    return true;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}

/** Website: normal download. Android app: share menu. */
export async function saveFile(blob: Blob, filename: string) {
  if (isNativeApp()) { await shareNativeFile(blob, filename); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
