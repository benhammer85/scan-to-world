/**
 * A file handed over to be kept: in the iPhone app by the share sheet (to Files, Notes, Mail, anywhere); in a
 * phone's browser by its own share sheet, where it has one; else downloaded. Whether it was, or was turned down.
 */
import { NATIVE } from '../volcano/native';

export async function shareFile(text: string, name: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  try {
    if (NATIVE) {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const file = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      try { await Share.share({ files: [file.uri] }); return 'shared'; } catch { return 'cancelled'; }
    }
    const f = new File([text], name, { type });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f] }); return 'shared'; } catch (e) { return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'failed'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = name;
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  } catch { return 'failed'; }
}
