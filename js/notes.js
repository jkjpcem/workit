// Text boxes and pen marks a student or family adds on top of an upload's pages (a score,
// feedback), the same kind the ES adds on the dashboard. They're saved apart from the ES's own annotations
// and can change until the ES approves or files the sample.
const Notes = (() => {
  const FONTS = {
    sans: 'Arial, Helvetica, sans-serif',
    serif: '"Times New Roman", Times, serif',
    hand: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
    mono: '"Courier New", Courier, monospace',
  };
  const COLORS = ['#d0342c', '#1f5bd8', '#18864b', '#7b3fc4', '#e07a00', '#111111'];
  const PAGE_PT = 612; // text sizes are points on a letter-width page
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const style = { font: 'sans', size: 18, bold: true, color: COLORS[0] };
  const PEN_PT = 3;
  let pagesEl = null, bar = null, notes = [], editing = false, selected = -1, onChange = null, pen = false;
  let hist = { stack: [], last: '[]', t: 0, sel: -2 }; // Undo

  // Builds the toolbar once.
  function buildBar(el) {
    el.innerHTML = `
      <button type="button" class="btn small primary" data-n="add">＋ Text box</button>
      <button type="button" class="btn small n-pen" data-n="pen" aria-pressed="false" title="Write by hand">✏️ Pen</button>
      <button type="button" class="btn small" data-n="undo" title="Undo the last change">↶ Undo</button>
      <select data-n="font" aria-label="Font">
        <option value="sans">Arial</option><option value="serif">Times</option>
        <option value="hand">Comic</option><option value="mono">Courier</option>
      </select>
      <select data-n="size" aria-label="Text size">${[10, 12, 14, 18, 24, 32, 48].map(n => `<option>${n}</option>`).join('')}</select>
      <span class="swatches" role="radiogroup" aria-label="Color">${COLORS.map(c =>
        `<button type="button" class="swatch" role="radio" aria-checked="false" aria-label="${c}" data-color="${c}" style="background:${c}"></button>`).join('')}</span>
      <button type="button" class="btn small n-bold" data-n="bold" aria-pressed="false" title="Bold"><b>B</b></button>
      <button type="button" class="btn small" data-n="delete" title="Delete" aria-label="Delete">🗑</button>`;
    el.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
    el.addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (sw) return setStyle({ color: sw.dataset.color });
      const b = e.target.closest('[data-n]');
      if (!b) return;
      if (b.dataset.n === 'add') { setPen(false); addInView(); }
      if (b.dataset.n === 'pen') setPen(!pen);
      if (b.dataset.n === 'undo') undo();
      if (b.dataset.n === 'bold') setStyle({ bold: !(notes[selected] ? notes[selected].bold : style.bold) });
      if (b.dataset.n === 'delete') removeSelected();
    });
    $('[data-n=font]', el).addEventListener('change', (e) => setStyle({ font: e.target.value }));
    $('[data-n=size]', el).addEventListener('change', (e) => setStyle({ size: Number(e.target.value) }));
    el.dataset.built = '1';
  }

  /** Shows the notes on the pages in pagesEl (each page is .npage[data-page] > img + .nlayer). */
  function mount(el, toolbar, list, change) {
    pagesEl = el;
    bar = toolbar;
    notes = (list || []).map(a => ({ ...a }));
    onChange = change;
    editing = false;
    selected = -1;
    if (bar && !bar.dataset.built) buildBar(bar);
    pagesEl.onclick = onPageClick;
    pagesEl.onpointerdown = onPenDown;
    pagesEl.onpointermove = onGestureMove;
    pagesEl.onpointerup = pagesEl.onpointercancel = onGestureEnd;
    touches.clear();
    gesture = null;
    hist = { stack: [], last: JSON.stringify(notes), t: 0, sel: -2 };
    setPen(false);
    render();
  }

  // Undo: each change keeps the step before it (typing in one box counts as one step).
  function remember() {
    const cur = JSON.stringify(notes);
    if (cur === hist.last) return;
    const now = Date.now();
    if (now - hist.t > 1200 || hist.sel !== selected) hist.stack.push(hist.last);
    if (hist.stack.length > 100) hist.stack.shift();
    Object.assign(hist, { last: cur, t: now, sel: selected });
  }
  function undo() {
    if (!hist.stack.length) return;
    hist.last = hist.stack.pop();
    hist.t = 0;
    notes = JSON.parse(hist.last);
    selected = -1;
    render();
    changed();
  }
  // ⌘Z / Ctrl+Z undoes, except while typing in a box (then it undoes the typing).
  document.addEventListener('keydown', (e) => {
    if (!editing || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    e.preventDefault();
    undo();
  });

  function setEditing(on) {
    editing = !!on;
    if (!editing) { select(-1); setPen(false); }
    pagesEl.classList.toggle('editing', editing);
    if (bar) bar.hidden = !editing;
    render();
  }

  function render() {
    if (!pagesEl) return;
    $$('.nlayer', pagesEl).forEach(l => { l.innerHTML = ''; });
    notes.forEach((a, i) => {
      const layer = $(`.npage[data-page="${a.page}"] .nlayer`, pagesEl);
      if (!layer) return;
      if (Ink.is(a)) Ink.show(layer, a, i);
      else layer.appendChild(makeBox(a, i));
    });
    select(selected);
  }

  // ✏️ Pen on: dragging on a page writes, smoothed as it goes; text boxes let the pen pass over.
  function setPen(on) {
    pen = !!on;
    if (!pagesEl) return;
    pagesEl.classList.toggle('pen', pen);
    const hint = document.getElementById('notes-hint');
    if (hint) {
      hint.textContent = pen
        ? 'Write with one finger, a stylus or the mouse. Pinch with two fingers (or tap ＋ at the bottom) to zoom in. Tap ✏️ Pen again to stop writing and scroll.'
        : 'Tap a page to add a text box, or tap ✏️ Pen to write by hand. Tap a box or mark, then ✕, to delete it.';
    }
    if (pen && document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
    if (pen) select(-1);
    syncBar();
  }

  // With the pen on, one finger writes and two fingers pinch to zoom and drag to move around.
  // Once an Apple Pencil (or other stylus) has written, fingers only move and zoom.
  const touches = new Map();
  let live = null, stylus = false, gesture = null, hooks = null;
  function onPenDown(e) {
    if (!editing || !pen || e.button > 0) return;
    const layer = e.target.closest('.nlayer');
    if (!layer) return;
    if (e.pointerType === 'pen') stylus = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size > 1 || stylus) {
        e.preventDefault();
        if (live) { live.cancel(); live = null; }
        gesture = gestureOf();
        return;
      }
    }
    const page = Number(layer.closest('.npage').dataset.page);
    live = Ink.capture(e, layer, { color: style.color, width: PEN_PT }, (stroke) => {
      live = null;
      notes.push({ ...stroke, page });
      selected = -1;
      render();
      changed();
    });
  }

  function gestureOf() {
    const pts = [...touches.values()];
    const mid = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { mid, dist, n: pts.length };
  }
  function onGestureMove(e) {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture || !hooks) return;
    const g = gestureOf();
    if (g.n !== gesture.n) { gesture = g; return; }
    hooks.pan(gesture.mid.x - g.mid.x, gesture.mid.y - g.mid.y);
    if (g.n > 1 && gesture.dist > 10) hooks.zoom(g.dist / gesture.dist, g.mid.x, g.mid.y);
    gesture = g;
  }
  function onGestureEnd(e) {
    touches.delete(e.pointerId);
    gesture = touches.size && gesture ? gestureOf() : null;
  }

  function removeSelected() {
    if (selected < 0 || !notes[selected]) return;
    notes.splice(selected, 1);
    selected = -1;
    render();
    changed();
  }

  function makeBox(a, i) {
    const box = document.createElement('div');
    box.className = `anno ${i === selected ? 'selected' : ''}`;
    box.dataset.i = i;
    applyStyle(box, a);
    box.innerHTML = '<span class="grip" title="Drag to move">⠿</span><div class="txt"></div><span class="resize" title="Drag to resize"></span>' +
      '<button type="button" class="box-x" title="Delete this text box" aria-label="Delete this text box">✕</button>';
    $('.box-x', box).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    $('.box-x', box).addEventListener('click', (e) => { e.stopPropagation(); selected = i; removeSelected(); });
    const txt = $('.txt', box);
    txt.textContent = a.text;
    txt.contentEditable = String(editing);
    txt.addEventListener('focus', () => select(i));
    txt.addEventListener('input', () => {
      a.text = txt.innerText.replace(/\n$/, '');
      changed();
    });
    $('.grip', box).addEventListener('pointerdown', (e) => startDrag(e, box, a, 'move'));
    $('.resize', box).addEventListener('pointerdown', (e) => startDrag(e, box, a, 'resize'));
    return box;
  }

  function applyStyle(box, a) {
    Object.assign(box.style, {
      left: `${a.x * 100}%`,
      top: `${a.y * 100}%`,
      width: `${a.w * 100}%`,
      fontFamily: FONTS[a.font] || FONTS.sans,
      fontSize: `calc(${a.size} * 100cqw / ${PAGE_PT})`,
      fontWeight: a.bold ? '700' : '400',
      color: a.color,
      transform: a.rot ? `rotate(${a.rot}deg)` : '',
    });
  }

  function select(i) {
    selected = i;
    if (pagesEl) {
      $$('.anno', pagesEl).forEach(b => b.classList.toggle('selected', Number(b.dataset.i) === i));
      $$('.ink-mark', pagesEl).forEach(g => g.classList.toggle('selected', Number(g.dataset.i) === i));
      $$('.ink-x', pagesEl).forEach(x => x.remove());
      const a = notes[i];
      const layer = a && $(`.npage[data-page="${a.page}"] .nlayer`, pagesEl);
      if (editing && Ink.is(a) && layer) Ink.deleteButton(layer, a, removeSelected);
    }
    syncBar();
  }

  function syncBar() {
    if (!bar || !bar.dataset.built) return;
    const a = notes[selected];
    const s = a && !Ink.is(a) ? a : { ...style, color: a ? a.color : style.color };
    $('[data-n=font]', bar).value = s.font;
    $('[data-n=size]', bar).value = String(s.size);
    $('[data-n=bold]', bar).setAttribute('aria-pressed', String(!!s.bold));
    $$('.swatch', bar).forEach(b => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
    $('[data-n=delete]', bar).disabled = !notes[selected];
    $('[data-n=pen]', bar).setAttribute('aria-pressed', String(pen));
    $('[data-n=undo]', bar).disabled = !hist.stack.length;
  }

  // Toolbar changes apply to the selected box and become the style for new boxes.
  function setStyle(patch) {
    Object.assign(style, patch);
    const a = notes[selected];
    if (a && Ink.is(a)) {
      if (patch.color) { a.color = patch.color; render(); changed(); }
    } else if (a) {
      Object.assign(a, patch);
      const box = $(`.anno[data-i="${selected}"]`, pagesEl);
      if (box) applyStyle(box, a);
      changed();
    }
    syncBar();
  }

  function addBox(page, x, y) {
    // A box left empty goes away when the next one is added.
    notes = notes.filter(a => Ink.is(a) || String(a.text || '').trim());
    notes.push({ page, x: clamp(x, 0, 0.6), y: clamp(y, 0, 0.95), w: 0.4, text: '', ...style });
    selected = notes.length - 1;
    render();
    const txt = $(`.anno[data-i="${selected}"] .txt`, pagesEl);
    if (txt) txt.focus();
  }

  // Tap an empty part of a page to drop a text box there (every tap adds another one);
  // tap a pen mark to pick it.
  function onPageClick(e) {
    if (!editing || pen) return;
    const mark = e.target.closest('.ink-mark');
    if (mark) return select(Number(mark.dataset.i));
    const layer = e.target.closest('.nlayer');
    if (!layer || e.target !== layer) return;
    const wrap = layer.closest('.npage');
    const r = wrap.getBoundingClientRect();
    addBox(Number(wrap.dataset.page), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  // The button adds a box near the top of the page that's most in view.
  function addInView() {
    const view = pagesEl.getBoundingClientRect();
    let best = null, bestSeen = -1;
    $$('.npage', pagesEl).forEach(w => {
      const r = w.getBoundingClientRect();
      const seen = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top);
      if (seen > bestSeen) { bestSeen = seen; best = w; }
    });
    if (!best) return;
    const r = best.getBoundingClientRect();
    addBox(Number(best.dataset.page), 0.08, clamp((Math.max(r.top, view.top + 40) - r.top) / r.height + 0.03, 0, 0.9));
  }

  function startDrag(e, box, a, mode) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    select(Number(box.dataset.i));
    const r = box.closest('.npage').getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, ax: a.x, ay: a.y, aw: a.w };
    const handle = e.target;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / r.width;
      const dy = (ev.clientY - start.y) / r.height;
      if (mode === 'move') {
        a.x = clamp(start.ax + dx, 0, 1 - Math.min(a.w, 0.98));
        a.y = clamp(start.ay + dy, 0, 0.98);
      } else {
        a.w = clamp(start.aw + dx, 0.08, 1 - a.x);
      }
      applyStyle(box, a);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      changed();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function changed() {
    remember();
    syncBar();
    if (onChange) onChange(notes.filter(a => Ink.is(a) || String(a.text || '').trim()));
  }

  return { mount, setEditing, isEditing: () => editing, setGestures: (h) => { hooks = h; } };
})();
