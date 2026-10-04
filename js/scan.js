// Document scanning: find the page, flatten it, and even out the lighting.
// Plain canvas code, no libraries, so it works offline on any phone.

const Scan = (() => {
  const MAX_SOURCE = 2400; // longest side we keep from the camera photo
  const MAX_OUTPUT = 2000; // longest side of the flattened page

  // Load a File/Blob into a canvas, shrinking huge camera photos.
  async function loadImage(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not read that photo.'));
        img.src = URL.createObjectURL(file);
      });
    }
    const w = bitmap.width, h = bitmap.height;
    const scale = Math.min(1, MAX_SOURCE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function rotate90(src) {
    const out = document.createElement('canvas');
    out.width = src.height;
    out.height = src.width;
    const ctx = out.getContext('2d');
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, 0, 0);
    return out;
  }

  // Guess the four corners of the paper. Paper is usually the largest bright
  // area in the photo, so threshold a small copy and take the biggest blob.
  // Returns corners in source pixels: [topLeft, topRight, bottomRight, bottomLeft].
  function detectCorners(src) {
    const S = 320;
    const scale = Math.min(1, S / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.filter = 'blur(2px)';
    ctx.drawImage(src, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;

    const gray = new Uint8Array(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0; i < w * h; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      // Paper is bright and low in colour; penalise saturated pixels.
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const v = Math.max(0, Math.min(255, 0.299 * r + 0.587 * g + 0.114 * b - sat * 0.5));
      gray[i] = v;
      hist[v | 0]++;
    }
    const thresh = otsu(hist, w * h);

    // Largest 4-connected bright component.
    const label = new Int32Array(w * h).fill(-1);
    let best = null;
    const stack = new Int32Array(w * h);
    for (let start = 0; start < w * h; start++) {
      if (label[start] !== -1 || gray[start] <= thresh) continue;
      let sp = 0, count = 0;
      const pts = [];
      stack[sp++] = start;
      label[start] = start;
      while (sp) {
        const p = stack[--sp];
        count++;
        pts.push(p);
        const x = p % w, y = (p / w) | 0;
        const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of nb) {
          if (q >= 0 && label[q] === -1 && gray[q] > thresh) {
            label[q] = start;
            stack[sp++] = q;
          }
        }
      }
      if (!best || count > best.count) best = { count, pts };
    }

    const area = w * h;
    if (!best || best.count < area * 0.08 || best.count > area * 0.97) return defaultCorners(src);

    // Extreme points along the diagonals give the corners of a quadrilateral.
    let tl, tr, br, bl;
    let mTl = Infinity, mTr = -Infinity, mBr = -Infinity, mBl = Infinity;
    for (const p of best.pts) {
      const x = p % w, y = (p / w) | 0;
      const s = x + y, df = x - y;
      if (s < mTl) { mTl = s; tl = [x, y]; }
      if (s > mBr) { mBr = s; br = [x, y]; }
      if (df > mTr) { mTr = df; tr = [x, y]; }
      if (df < mBl) { mBl = df; bl = [x, y]; }
    }
    const corners = [tl, tr, br, bl].map(([x, y]) => ({ x: (x + 0.5) / scale, y: (y + 0.5) / scale }));
    if (quadArea(corners) < src.width * src.height * 0.08) return defaultCorners(src);
    return corners;
  }

  function defaultCorners(src) {
    const mx = src.width * 0.06, my = src.height * 0.06;
    return [
      { x: mx, y: my },
      { x: src.width - mx, y: my },
      { x: src.width - mx, y: src.height - my },
      { x: mx, y: src.height - my },
    ];
  }

  function otsu(hist, total) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thresh = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thresh = t; }
    }
    return thresh;
  }

  function quadArea(q) {
    let a = 0;
    for (let i = 0; i < 4; i++) {
      const p = q[i], n = q[(i + 1) % 4];
      a += p.x * n.y - n.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Solve for the homography mapping the output rectangle onto the source quad.
  function homography(from, to) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], { x: u, y: v } = to[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    const h = solve(A, B);
    return [...h, 1];
  }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      [M[col], M[piv]] = [M[piv], M[col]];
      const div = M[col][col] || 1e-12;
      for (let c = col; c <= n; c++) M[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (!f) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map(row => row[n]);
  }

  // Flatten the quad into a straight rectangle.
  function warp(src, corners) {
    const [tl, tr, br, bl] = corners;
    let ow = Math.max(dist(tl, tr), dist(bl, br));
    let oh = Math.max(dist(tl, bl), dist(tr, br));
    const s = Math.min(1, MAX_OUTPUT / Math.max(ow, oh));
    ow = Math.max(10, Math.round(ow * s));
    oh = Math.max(10, Math.round(oh * s));

    const H = homography(
      [{ x: 0, y: 0 }, { x: ow, y: 0 }, { x: ow, y: oh }, { x: 0, y: oh }],
      corners,
    );
    const sw = src.width, sh = src.height;
    const sd = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    const octx = out.getContext('2d');
    const img = octx.createImageData(ow, oh);
    const od = img.data;

    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const X = x + 0.5, Y = y + 0.5;
        const z = H[6] * X + H[7] * Y + H[8];
        let u = (H[0] * X + H[1] * Y + H[2]) / z - 0.5;
        let v = (H[3] * X + H[4] * Y + H[5]) / z - 0.5;
        u = Math.max(0, Math.min(sw - 1.001, u));
        v = Math.max(0, Math.min(sh - 1.001, v));
        const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
        const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
        const o = (y * ow + x) * 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
          const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
          od[o + c] = top * (1 - fy) + bot * fy;
        }
        od[o + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  // Even out shadows and uneven light, then make the paper white and ink dark.
  // mode: 'color' keeps colours, 'bw' gives a clean grayscale page.
  function enhance(src, mode = 'color') {
    const w = src.width, h = src.height;
    const ctx = src.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, w, h);
    const d = data.data;

    // Background (paper) brightness map: small copy, max filter wipes out the
    // ink, then blur and scale back up.
    const bs = 64;
    const bw = Math.max(4, Math.round(w / Math.max(w, h) * bs));
    const bh = Math.max(4, Math.round(h / Math.max(w, h) * bs));
    const small = document.createElement('canvas');
    small.width = bw; small.height = bh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(src, 0, 0, bw, bh);
    const sd = sctx.getImageData(0, 0, bw, bh);
    // Per colour channel, so a yellow lamp or blue daylight cast is removed too.
    for (let c = 0; c < 3; c++) {
      const ch = new Float32Array(bw * bh);
      for (let i = 0; i < bw * bh; i++) ch[i] = sd.data[i * 4 + c];
      const bg = boxBlur(maxFilter(ch, bw, bh, 2), bw, bh, 2);
      for (let i = 0; i < bw * bh; i++) sd.data[i * 4 + c] = Math.max(1, bg[i]);
    }
    for (let i = 0; i < bw * bh; i++) sd.data[i * 4 + 3] = 255;
    sctx.putImageData(sd, 0, 0);
    const big = document.createElement('canvas');
    big.width = w; big.height = h;
    const bctx = big.getContext('2d', { willReadFrequently: true });
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, w, h);
    const bgd = bctx.getImageData(0, 0, w, h).data;

    // Divide by the background, then find the ink level for contrast stretching.
    const norm = new Float32Array(w * h * 3);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const r = Math.min(1.1, d[p] / Math.max(24, bgd[p]));
      const g = Math.min(1.1, d[p + 1] / Math.max(24, bgd[p + 1]));
      const bl = Math.min(1.1, d[p + 2] / Math.max(24, bgd[p + 2]));
      norm[i * 3] = r; norm[i * 3 + 1] = g; norm[i * 3 + 2] = bl;
      const l = 0.299 * r + 0.587 * g + 0.114 * bl;
      hist[Math.max(0, Math.min(255, Math.round(l * 230)))]++;
    }
    const black = percentile(hist, w * h, 0.01) / 230;
    const white = 0.92;
    const range = Math.max(0.2, white - black);

    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      if (mode === 'bw') {
        const l = 0.299 * norm[i * 3] + 0.587 * norm[i * 3 + 1] + 0.114 * norm[i * 3 + 2];
        const v = tone((l - black) / range);
        d[p] = d[p + 1] = d[p + 2] = v;
      } else {
        for (let c = 0; c < 3; c++) d[p + c] = tone((norm[i * 3 + c] - black) / range);
      }
    }
    ctx.putImageData(data, 0, 0);
    return src;
  }

  // Gentle S-curve so paper goes white and pencil stays readable.
  function tone(t) {
    t = Math.max(0, Math.min(1, t));
    t = Math.pow(t, 1.35);
    return Math.round(255 * Math.min(1, t * 1.05));
  }

  function percentile(hist, total, q) {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= total * q) return i;
    }
    return 255;
  }

  function maxFilter(a, w, h, r) {
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.max(0, Math.min(h - 1, y + dy));
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.max(0, Math.min(w - 1, x + dx));
            if (a[yy * w + xx] > m) m = a[yy * w + xx];
          }
        }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function boxBlur(a, w, h, r) {
    const out = new Float32Array(a.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.max(0, Math.min(h - 1, y + dy));
          for (let dx = -r; dx <= r; dx++) {
            const xx = Math.max(0, Math.min(w - 1, x + dx));
            s += a[yy * w + xx]; n++;
          }
        }
        out[y * w + x] = s / n;
      }
    }
    return out;
  }

  function copy(canvas) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    return c;
  }

  // Full pipeline for one page.
  function process(src, corners, mode) {
    return enhance(warp(src, corners), mode);
  }

  return { loadImage, rotate90, detectCorners, defaultCorners, warp, enhance, process, copy };
})();
