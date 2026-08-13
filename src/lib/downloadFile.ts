/**
 * Download a remote file without opening a new tab.
 *
 * Opening a storage signed URL with window.open triggers popup/tab blocking in
 * some browsers ("<host> is blocked"). Fetching the bytes and clicking a
 * synthetic anchor keeps the download in-page and preserves the file name.
 */
export async function downloadUrlAsFile(url: string, fileName?: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  } catch {
    // Fall back to a direct navigation-style anchor if the fetch is blocked (CORS etc).
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/** Download in-memory text (transcripts, reports) as a file, no popup/tab. */
export function downloadTextAsFile(
  text: string,
  fileName: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  const blob = new Blob([text], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}
