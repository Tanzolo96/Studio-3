// Read the text of a dropped PDF in the browser (pdf.js, no server, no upload).
// Loaded only when someone drops a file, so the rest of the app stays small.

export async function pdfToText(file: File): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  // Run pdf.js on the main thread: works the same in the normal build and the single-file build.
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs');
  (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    // Group text items into lines by their vertical position.
    let lastY: number | undefined;
    let line = '';
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = Math.round(item.transform[5]);
      if (lastY !== undefined && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = '';
      }
      line += item.str;
      lastY = y;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
        lastY = undefined;
      }
    }
    if (line) lines.push(line);
  }
  return { text: lines.join('\n'), pages: doc.numPages };
}
