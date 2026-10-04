// Turns any PDF's pages into images, using Mozilla's pdf.js. It is only
// downloaded the first time someone opens a PDF that Workit didn't make itself.

const PdfView = (() => {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  let loading = null;

  const addScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the PDF reader. Check your internet connection and try again.'));
    document.head.appendChild(s);
  });

  function ready() {
    if (!loading) {
      loading = (async () => {
        await addScript(BASE + 'pdf.min.js');
        // Loading the worker as a plain script makes pdf.js run on the page itself,
        // which works on every host (some block separate worker files).
        await addScript(BASE + 'pdf.worker.min.js');
        return window.pdfjsLib;
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }

  // bytes: Uint8Array of a PDF -> [canvas] one per page, `width` pixels wide.
  async function render(bytes, { width = 1275, maxPages = 20 } = {}) {
    const lib = await ready();
    let doc;
    try {
      doc = await lib.getDocument({ data: bytes.slice() }).promise;
    } catch {
      throw new Error('That PDF could not be opened. It may be damaged or password-protected.');
    }
    if (doc.numPages > maxPages) throw new Error(`That PDF has ${doc.numPages} pages. The most Workit takes is ${maxPages}.`);
    const out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const c = document.createElement('canvas');
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport }).promise;
      out.push(c);
    }
    doc.destroy();
    return out;
  }

  return { render };
})();
