// Pen marks on a page, shared by the ES dashboard and the student's ✏️ Annotate.
// A stroke is { type: 'ink', page, color, width, d }: width is points on a letter-width page
// and d packs the points as 2 characters per coordinate (0..4095 across the page), so a page of
// handwriting fits in one spreadsheet cell. Strokes are smoothed about 35% while drawing.
const Ink = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const MAX = 4095;
  const SMOOTH = 0.35;     // each new point moves 65% of the way to the pen
  const PAGE_PT = 612;
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const is = (a) => !!a && a.type === 'ink';

  function encode(pts) {
    let s = '';
    for (const [x, y] of pts) {
      for (const v of [x, y]) {
        const n = clamp(Math.round(v * MAX), 0, MAX);
        s += ABC[n >> 6] + ABC[n & 63];
      }
    }
    return s;
  }
  // -> [[x, y], ...] with x and y from 0 to 1
  function decode(d) {
    const out = [];
    const s = String(d || '');
    for (let i = 0; i + 3 < s.length; i += 4) {
      const v = (k) => ((ABC.indexOf(s[k]) << 6) | ABC.indexOf(s[k + 1])) / MAX;
      out.push([v(i), v(i + 2)]);
    }
    return out;
  }

  // Drops points that don't change the line's shape (Ramer-Douglas-Peucker), in pixels.
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let far = -1, farD = tol;
      for (let i = a + 1; i < b; i++) {
        const dist = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (dist > farD) { farD = dist; far = i; }
      }
      if (far > 0) { keep[far] = true; stack.push([a, far], [far, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // A smooth path through the points: curves that bend at each point and pass through the midpoints.
  function pathD(pts, sx, sy) {
    if (!pts.length) return '';
    const P = pts.map(([x, y]) => [+(x * sx).toFixed(1), +(y * sy).toFixed(1)]);
    if (P.length === 1) return `M${P[0][0]} ${P[0][1]}l0.01 0`;
    let d = `M${P[0][0]} ${P[0][1]}`;
    for (let i = 1; i < P.length - 1; i++) {
      const mx = ((P[i][0] + P[i + 1][0]) / 2).toFixed(1), my = ((P[i][1] + P[i + 1][1]) / 2).toFixed(1);
      d += `Q${P[i][0]} ${P[i][1]} ${mx} ${my}`;
    }
    const L = P[P.length - 1];
    return `${d}L${L[0]} ${L[1]}`;
  }

  function bbox(a) {
    const pts = decode(a.d);
    if (!pts.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return {
      x0: Math.min(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])),
      x1: Math.max(...pts.map(p => p[0])), y1: Math.max(...pts.map(p => p[1])),
    };
  }

  // The drawing surface of a page layer (created on first use, always the bottom layer).
  function svgOf(layer) {
    let svg = layer.querySelector(':scope > svg.ink');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'ink');
      svg.setAttribute('viewBox', `0 0 ${MAX} ${MAX}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      layer.prepend(svg);
    }
    return svg;
  }

  function line(a, cls) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', pathD(decode(a.d), MAX, MAX));
    if (cls === 'ink-line') {
      p.style.stroke = a.color;
      p.style.strokeWidth = `calc(${a.width} * 100cqw / ${PAGE_PT})`;
    }
    return p;
  }

  /** Adds stroke a (index i) to its page layer, with a wider invisible line that's easy to tap. */
  function show(layer, a, i, extraClass = '') {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `ink-mark ${extraClass}`.trim());
    if (i != null) g.dataset.i = i;
    g.append(line(a, 'ink-hit'), line(a, 'ink-line'));
    svgOf(layer).appendChild(g);
    return g;
  }

  /** Shows ✕ by the top-right corner of a stroke; clicking it calls onDelete. */
  function deleteButton(layer, a, onDelete) {
    const b = bbox(a);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ink-x';
    x.title = 'Delete this pen mark';
    x.setAttribute('aria-label', 'Delete this pen mark');
    x.textContent = '✕';
    x.style.left = `${clamp(b.x1, 0, 0.97) * 100}%`;
    x.style.top = `${clamp(b.y0, 0.01, 1) * 100}%`;
    x.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    x.addEventListener('click', (e) => { e.stopPropagation(); onDelete(); });
    layer.appendChild(x);
  }

  /**
   * Draws a stroke from a pointerdown on a page layer. When the pen lifts, done(stroke) gets the
   * finished stroke (page is left for the caller to fill in).
   */
  function capture(e, layer, st, done) {
    e.preventDefault();
    const r = layer.getBoundingClientRect();
    const live = document.createElementNS(NS, 'path');
    live.setAttribute('class', 'ink-line');
    live.style.stroke = st.color;
    live.style.strokeWidth = `calc(${st.width} * 100cqw / ${PAGE_PT})`;
    svgOf(layer).appendChild(live);
    const pts = [];
    let last = null;
    const at = (ev) => [clamp(ev.clientX - r.left, 0, r.width), clamp(ev.clientY - r.top, 0, r.height)];
    const add = (ev) => {
      const [x, y] = at(ev);
      last = last ? [last[0] + (x - last[0]) * (1 - SMOOTH), last[1] + (y - last[1]) * (1 - SMOOTH)] : [x, y];
      pts.push(last);
    };
    const draw = () => live.setAttribute('d', pathD(pts, MAX / r.width, MAX / r.height));
    add(e);
    draw();
    layer.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
      (evs.length ? evs : [ev]).forEach(add);
      draw();
    };
    const up = (ev) => {
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', up);
      layer.removeEventListener('pointercancel', up);
      if (ev.type === 'pointerup' && pts.length > 1) pts.push(at(ev)); // end where the pen lifted
      live.remove();
      const kept = simplify(pts, Math.max(0.35, r.width / 2000)).map(([x, y]) => [x / r.width, y / r.height]);
      done({ type: 'ink', color: st.color, width: st.width, d: encode(kept.slice(0, 1500)) });
    };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
  }

  /** Draws a stroke onto a W x H canvas (for the exported PDF). */
  function paint(ctx, a, W, H) {
    const pts = decode(a.d);
    if (!pts.length) return;
    ctx.save();
    ctx.strokeStyle = a.color;
    ctx.lineWidth = a.width * W / PAGE_PT;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(pathD(pts, W, H)));
    ctx.restore();
  }

  return { is, show, capture, paint, deleteButton, bbox };
})();
