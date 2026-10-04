// Tiny PDF writer: one JPEG per page, nothing else. Enough to combine a
// student's scanned pages into a single file for Drive.

const Pdf = (() => {
  // pages: [{ jpeg: Uint8Array, width, height }] -> Blob (application/pdf)
  function build(pages) {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = (part) => {
      const bytes = typeof part === 'string' ? enc.encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };
    const startObj = (n) => { offsets[n] = length; push(`${n} 0 obj\n`); };

    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    // Object layout: 1 catalog, 2 pages, then per page: page, image, content.
    const pageIds = pages.map((_, i) => 3 + i * 3);
    startObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    startObj(2);
    push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);

    pages.forEach((p, i) => {
      const pageId = pageIds[i], imgId = pageId + 1, contentId = pageId + 2;
      // US Letter width, height follows the page's shape.
      const pw = 612, ph = Math.round(612 * p.height / p.width);
      startObj(pageId);
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] ` +
        `/Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
      startObj(imgId);
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream\nendobj\n');
      const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
      startObj(contentId);
      push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    });

    const objCount = 3 + pages.length * 3;
    const xref = length;
    let table = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
    for (let n = 1; n < objCount; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    push(table);
    push(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function canvasToJpeg(canvas, quality = 0.82) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  }

  // Pull the page images back out of a PDF made by build(), so pages can be
  // shown as plain images on any device. Returns [] for other PDFs.
  function extractJpegs(bytes) {
    const text = new TextDecoder('latin1').decode(bytes);
    const re = /\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[0].length;
      out.push(new Blob([bytes.slice(start, start + Number(m[1]))], { type: 'image/jpeg' }));
    }
    return out;
  }

  return { build, canvasToJpeg, extractJpegs };
})();
