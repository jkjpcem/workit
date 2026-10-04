// Workit ES dashboard: student grid, one student's uploads, and the review viewer
// (approve or redo, annotate with text boxes, finalize into the Approved folder).

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const KEY = 'workit.admin';

  // Kept for this browser tab only; the real check happens in Code.gs.
  let creds = readCreds();
  let data = null;          // last overview: { lp, currentLp, lps, reasons, students, items }
  let viewLp = null;        // LP shown on the dashboard
  const studentCache = {};  // studentId -> all of that student's uploads
  let currentStudent = null;
  let studentLp = null;     // LP chip on the student page ('all' or LPx)

  const call = (action, payload = {}) =>
    Api.call(action, { adminUser: creds && creds.user, adminKey: creds && creds.key, ...payload });

  // ---------- Sign in ----------

  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    creds = { user: e.target.username.value.trim(), key: e.target.password.value };
    try {
      await loadOverview();
      saveCreds(creds);
      e.target.reset();
      $('#toast').hidden = true;
    } catch (err) {
      creds = null;
      toast(err.message);
    }
  });
  $('#admin-signout').addEventListener('click', () => {
    creds = null;
    saveCreds(null);
    data = null;
    show('login');
  });

  function show(name) {
    $$('.screen').forEach(s => { s.hidden = s.id !== `screen-${name}`; });
    $('#admin-controls').hidden = name === 'login';
    window.scrollTo(0, 0);
  }

  // ---------- Loading ----------

  async function loadOverview(lp) {
    busy('Loading…');
    try {
      data = await call('adminOverview', { lp });
      viewLp = data.lp;
      renderControls();
      renderDash();
      if (!currentStudent) show('dash');
    } finally {
      busy(false);
    }
  }

  function renderControls() {
    const opts = (sel) => data.lps.map(lp => `<option ${lp === sel ? 'selected' : ''}>${lp}</option>`).join('');
    $('#view-lp').innerHTML = opts(viewLp);
    $('#current-lp').innerHTML = opts(data.currentLp);
  }
  $('#view-lp').addEventListener('change', (e) => loadOverview(e.target.value).catch(err => toast(err.message)));
  $('#current-lp').addEventListener('change', async (e) => {
    const lp = e.target.value;
    if (!confirm(`Make ${lp} the current Learning Period? Every student's uploads will go to ${lp} by default.`)) {
      e.target.value = data.currentLp;
      return;
    }
    try {
      await call('adminSetLp', { lp });
      toast(`${lp} is now the current LP.`);
      await loadOverview(lp);
    } catch (err) {
      e.target.value = data.currentLp;
      toast(err.message);
    }
  });
  $('#refresh').addEventListener('click', async () => {
    Object.keys(studentCache).forEach(k => delete studentCache[k]);
    try {
      await loadOverview(viewLp);
      if (currentStudent) await openStudent(currentStudent.id, studentLp);
    } catch (err) { toast(err.message); }
  });

  // ---------- Status ----------

  function status(item) {
    if (item.redo) return item.resubmitted ? 'resubmitted' : 'redo';
    if (item.finalizedAt) return 'finalized';
    if (item.approved) return 'approved';
    return 'new';
  }
  const STATUS_LABEL = { new: 'To review', approved: 'Approved', finalized: 'Finalized', redo: 'Redo', resubmitted: 'Resubmitted' };
  const statusLabel = (i) => status(i) === 'finalized' ? (i.filedAs === 'Extra' ? 'Extra' : 'Annotated') : STATUS_LABEL[status(i)];

  // Joon needs 2 annotated samples per student per LP; the rest are filed as Extra.
  const ANNOTATED_NEEDED = 2;
  function annotatedCount(studentId, lp) {
    const all = studentCache[studentId] || data.items;
    return all.filter(i => i.studentId === studentId && i.lp === lp && i.finalizedAt && i.filedAs !== 'Extra').length;
  }

  // ---------- Dashboard ----------

  $('#student-search').addEventListener('input', renderDash);

  function renderDash() {
    const range = (data.lpDates || {})[viewLp];
    $('#dash-title').innerHTML = `${esc(viewLp)}${viewLp === data.currentLp ? ' (current)' : ''}` +
      (range ? ` <span class="lp-range">${esc(niceDate(range.start))} – ${esc(niceDate(range.end))}</span>` : '');
    const items = data.items;
    const count = (st) => items.filter(i => status(i) === st).length;
    const submitted = new Set(items.map(i => i.studentId));
    $('#tiles').innerHTML = [
      ['', data.students.length, 'Students'],
      ['', `${submitted.size}`, `Have uploaded to ${viewLp}`],
      ['', count('new'), 'To review'],
      ['approved', count('approved'), 'Approved, not filed yet'],
      ['finalized', count('finalized'), 'Filed (Annotated or Extra)'],
      ['redo', count('redo'), 'Waiting on redo'],
    ].map(([cls, n, label]) => `<div class="tile ${cls}"><b>${n}</b><span>${esc(label)}</span></div>`).join('');

    const q = $('#student-search').value.trim().toLowerCase();
    const grid = $('#student-grid');
    grid.innerHTML = '';
    const students = data.students
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name) || a.name.localeCompare(b.name));
    if (!students.length) {
      grid.innerHTML = `<div class="empty">${data.students.length ? 'No student matches that.' : 'No students yet. Add them in the Students tab of the Workit Admin sheet.'}</div>`;
      return;
    }
    for (const s of students) {
      const mine = items.filter(i => i.studentId === s.id).sort((a, b) => b.receivedAt - a.receivedAt);
      const by = { new: 0, approved: 0, finalized: 0, redo: 0, resubmitted: 0 };
      mine.forEach(i => by[status(i)]++);
      const card = document.createElement('div');
      card.className = `scard ${by.redo ? 'has-redo' : ''}`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });
      const subjects = s.classes.map(c => {
        const n = mine.filter(i => i.subject === c).length;
        return `<span class="subj ${n ? '' : 'missing'}">${esc(c)}${n ? ` · ${n}` : ''}</span>`;
      }).join('');
      const thumbs = mine.slice(0, mine.length > 6 ? 5 : 6).map(i =>
        `<img src="${i.thumb || blankThumb()}" alt="${esc(i.subject)}" class="st-${status(i)}" data-id="${esc(i.id)}">`).join('') +
        (mine.length > 6 ? `<span class="more">+${mine.length - 5}</span>` : '');
      card.innerHTML = `
        <div class="top"><h3>${esc(s.name)}</h3><span class="sid">${esc(s.id)} · Gr ${esc(s.grade)}</span></div>
        ${mine.length ? `
          <div class="bar" aria-hidden="true">${['finalized', 'approved', 'resubmitted', 'redo', 'new'].map(k =>
            by[k] ? `<i class="${k}" style="width:${(by[k] / mine.length) * 100}%"></i>` : '').join('')}</div>
          <div class="counts"><b>${mine.length}</b> upload${mine.length > 1 ? 's' : ''} ·
            ${by.new} to review · <span class="${annotatedCount(s.id, viewLp) >= ANNOTATED_NEEDED ? 'met' : ''}">${annotatedCount(s.id, viewLp)} of ${ANNOTATED_NEEDED} annotated</span>${by.redo ? ` · <b style="color:var(--st-redo)">${by.redo} redo</b>` : ''}</div>
          <div class="thumbs">${thumbs}</div>`
        : `<div class="empty-card">No uploads in ${esc(viewLp)} yet.</div>`}
        ${subjects ? `<div class="subjects">${subjects}</div>` : ''}`;
      card.addEventListener('click', (e) => {
        const img = e.target.closest('img[data-id]');
        if (img) {
          const idx = mine.findIndex(i => i.id === img.dataset.id);
          Viewer.open(mine, idx, s);
        } else {
          openStudent(s.id, viewLp).catch(err => toast(err.message));
        }
      });
      grid.appendChild(card);
    }
  }

  // ---------- One student ----------

  $('#back-to-dash').addEventListener('click', () => {
    currentStudent = null;
    renderDash();
    show('dash');
  });

  async function openStudent(id, lp) {
    currentStudent = data.students.find(s => s.id === id) || { id, name: id, classes: [], grade: '' };
    studentLp = lp || viewLp;
    show('student');
    renderStudent();
    if (!studentCache[id]) {
      busy('Loading uploads…');
      try {
        studentCache[id] = (await call('adminStudent', { studentId: id })).items;
      } finally {
        busy(false);
      }
      renderStudent();
    }
  }

  function studentItems() {
    const all = studentCache[currentStudent.id] || data.items.filter(i => i.studentId === currentStudent.id);
    return all.filter(i => studentLp === 'all' || i.lp === studentLp).sort((a, b) => b.receivedAt - a.receivedAt);
  }

  function renderStudent() {
    const s = currentStudent;
    $('#student-head').innerHTML = `<h1>${esc(s.name)}</h1>
      <div class="meta">${esc(s.id)} · Grade ${esc(s.grade)} · ${s.classes.map(esc).join(', ') || 'No classes set'}</div>`;
    $('#student-lps').innerHTML = ['all', ...data.lps].map(lp => `
      <button class="chip ${studentLp === lp ? 'active' : ''}" data-lp="${lp}">${lp === 'all' ? 'All' : lp}${lp === data.currentLp ? ' •' : ''}</button>`).join('');
    const items = studentItems();
    const grid = $('#upload-grid');
    if (!items.length) {
      grid.innerHTML = `<div class="empty">No uploads ${studentLp === 'all' ? 'yet' : `in ${studentLp}`}.</div>`;
      return;
    }
    grid.innerHTML = items.map((i, idx) => `
      <button class="utile st-${status(i)}" data-idx="${idx}">
        ${i.thumb ? `<img src="${i.thumb}" alt="">` : '<div class="noimg">📄</div>'}
        <span class="cap">
          <span class="tag">${statusLabel(i)}</span>
          <strong>${esc(i.subject)}</strong>
          <span class="meta">${esc(i.lp)} · ${esc(niceDate(i.dateCompleted))}${i.score ? ` · ${esc(i.score)}` : ''}</span>
        </span>
      </button>`).join('');
  }
  $('#student-lps').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    studentLp = b.dataset.lp;
    renderStudent();
  });
  $('#upload-grid').addEventListener('click', (e) => {
    const t = e.target.closest('.utile');
    if (t) Viewer.open(studentItems(), Number(t.dataset.idx), currentStudent);
  });

  // The same upload can be in the overview and the student cache; keep them matching.
  function syncCaches(item, fields) {
    for (const arr of [data.items, studentCache[item.studentId] || []]) {
      const other = arr.find(i => i.id === item.id && i.studentId === item.studentId);
      if (other && other !== item) for (const f of fields) other[f] = item[f];
    }
  }

  // ---------- Viewer ----------

  const FONTS = {
    sans: 'Arial, Helvetica, sans-serif',
    serif: '"Times New Roman", Times, serif',
    hand: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
    mono: '"Courier New", Courier, monospace',
  };
  const COLORS = ['#d0342c', '#1f5bd8', '#18864b', '#7b3fc4', '#e07a00', '#111111'];
  const PAGE_PT = 612; // text sizes are points on a letter-width page

  const Viewer = (() => {
    const el = $('#viewer');
    const files = new Map(); // upload id -> Promise<{ images: [url] } | { pdf: url, bytes }>
    let list = [], idx = 0, student = null;
    let reviewTimer = null, annoTimer = null;
    let annotating = false;
    let selected = -1;               // index into item.annotations
    let style = { font: 'sans', size: 14, color: COLORS[0], bold: false }; // for new boxes

    function item() { return list[idx]; }

    function open(items, start, who) {
      list = items;
      idx = Math.max(0, start);
      student = who;
      el.hidden = false;
      document.body.style.overflow = 'hidden';
      render();
    }
    function close() {
      flushSaves();
      setAnnotating(false);
      el.hidden = true;
      document.body.style.overflow = '';
      if (currentStudent) renderStudent();
      renderDash();
    }
    function go(step) {
      const n = idx + step;
      if (n < 0 || n >= list.length) return;
      flushSaves();
      setAnnotating(false);
      idx = n;
      render();
    }

    function loadFile(it) {
      if (!files.has(it.id)) {
        const p = call('adminFile', { studentId: it.studentId, id: it.id }).then(res => {
          const bytes = Uint8Array.from(atob(res.data), c => c.charCodeAt(0));
          const jpegs = Pdf.extractJpegs(bytes);
          if (jpegs.length) return { images: jpegs.map(b => URL.createObjectURL(b)) };
          // A PDF Workit didn't make (a converted Word file): draw its pages so they can be annotated too.
          const toUrl = (c) => new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/jpeg', 0.9));
          return PdfView.render(bytes, { width: 1275, maxPages: 40 })
            .then(canvases => Promise.all(canvases.map(toUrl)))
            .then(images => ({ images }))
            .catch(() => ({ pdf: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), bytes }));
        });
        p.catch(() => files.delete(it.id));
        files.set(it.id, p);
      }
      return files.get(it.id);
    }

    async function render() {
      const it = item();
      it.annotations = it.annotations || [];
      selected = -1;
      $('#v-title').textContent = `${student ? student.name : it.name} · ${it.subject}`;
      $('#v-count').textContent = `${idx + 1} of ${list.length}`;
      $('#v-prev').disabled = idx === 0;
      $('#v-next').disabled = idx === list.length - 1;
      $('#v-save').textContent = '';
      $('#v-body').scrollTop = 0;
      renderInfo(it);
      renderReview(it);

      const pages = $('#v-pages');
      pages.innerHTML = '<div class="loading">Loading pages…</div>';
      try {
        const f = await loadFile(it);
        if (item() !== it) return; // moved on meanwhile
        pages.innerHTML = f.images
          ? f.images.map((u, n) => `<div class="page-wrap" data-page="${n}"><img src="${u}" alt="Page ${n + 1}"><div class="anno-layer"></div></div>`).join('')
          : `<iframe src="${f.pdf}" title="PDF"></iframe>`;
        renderAnnotations();
      } catch (err) {
        if (item() === it) pages.innerHTML = `<div class="loading">${esc(err.message)}</div>`;
      }
      // Get the neighbours ready so arrowing feels instant.
      [list[idx + 1], list[idx - 1]].forEach(n => n && loadFile(n).catch(() => {}));
    }

    function renderInfo(it) {
      const original = it.resubmitOf && (studentCache[it.studentId] || data.items).find(i => i.id === it.resubmitOf);
      $('#v-info').innerHTML = `
        <h2>${esc(it.subject)}</h2>
        <div class="info-grid">
          <div><span>Student</span>${esc(student ? student.name : it.name)} (${esc(it.studentId)})</div>
          <div><span>Learning Period</span>${esc(it.lp)}</div>
          <div><span>Date completed</span>${esc(niceDate(it.dateCompleted))}</div>
          <div><span>Grade / score</span><strong>${esc(it.score || '—')}</strong></div>
          <div><span>Minutes spent</span>${esc(it.minutes || '—')}</div>
          <div><span>Pages</span>${it.pageCount}</div>
          <div><span>Uploaded</span>${esc(new Date(it.receivedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</div>
        </div>
        ${it.feedback ? `<div class="info-text"><span>Feedback</span>${esc(it.feedback)}</div>` : ''}
        <div class="info-text"><span>Comments</span>${esc(it.comments || '—')}</div>
        ${it.resubmitOf ? `<p class="meta">↺ Resubmission${original ? ` of the ${esc(niceDate(original.dateCompleted))} upload` : ''}.</p>` : ''}
        ${it.resubmitted ? '<p class="meta">The student has resubmitted this. The new version is in their uploads.</p>' : ''}
        ${it.fileUrl ? `<p><a href="${esc(it.fileUrl)}" target="_blank" rel="noopener">Open the original in Google Drive ↗</a></p>` : ''}`;
    }

    function renderReview(it) {
      const finalized = !!it.finalizedAt;
      $('#t-approve').setAttribute('aria-pressed', String(!!it.approved));
      $('#t-approve').disabled = finalized;
      $('#t-approve').textContent = it.approved ? '✓ Approved' : '✓ Approve';
      $('#t-redo').setAttribute('aria-pressed', String(!!it.redo));
      $('#t-redo').disabled = finalized;
      $('#reasons-box').hidden = !it.redo;
      $('#reasons').innerHTML = data.reasons.map(r => `
        <button class="reason" aria-pressed="${(it.reasons || []).includes(r)}" data-reason="${esc(r)}">${esc(r)}</button>`).join('');
      $('#finish-row').hidden = !it.approved;
      $('#t-annotate').setAttribute('aria-pressed', String(annotating));
      $('#t-annotate').textContent = annotating ? '✓ Done annotating' : '✏️ Annotate';
      const asExtra = finalized && it.filedAs === 'Extra';
      const asAnnotated = finalized && !asExtra;
      $('#t-finalize').textContent = asAnnotated ? (it.finalStale ? '🏁 Update annotated copy' : '🏁 Save annotated again') : '🏁 Finalize as Annotated';
      $('#t-extra').textContent = asExtra ? '✓ Filed as Extra' : '📁 File as Extra';
      $('#t-extra').disabled = asExtra;
      const n = annotatedCount(it.studentId, it.lp);
      const fs = $('#final-state');
      fs.className = `final-state ${finalized ? (it.finalStale ? 'stale' : 'done') : ''}`;
      fs.innerHTML = !it.approved ? ''
        : `<span class="anno-count ${n >= ANNOTATED_NEEDED ? 'met' : ''}">${esc(it.lp)} annotated samples: ${n} of ${ANNOTATED_NEEDED}${n >= ANNOTATED_NEEDED ? ' ✓' : ''}</span>` +
          (!finalized ? `Annotate and Finalize to save it to Approved › ${esc(it.lp)} Annotated, or File as Extra to save it as is to ${esc(it.lp)} Extra.`
          : `${it.finalStale ? 'You changed the annotations after finalizing. Click Update annotated copy to save them.' : `✓ Filed in ${esc(it.lp)} ${asExtra ? 'Extra' : 'Annotated'} ${esc(new Date(it.finalizedAt).toLocaleDateString())}.`}
           ${it.finalUrl ? `<a href="${esc(it.finalUrl)}" target="_blank" rel="noopener">Open the filed copy ↗</a>` : ''}`);
    }

    // ----- Approve / redo (saved a moment after the last click) -----

    function changeReview(fn) {
      const it = item();
      fn(it);
      if (it.redo) it.approved = false;
      if (!it.redo) it.reasons = [];
      if (!it.approved) setAnnotating(false);
      syncCaches(it, ['approved', 'redo', 'reasons']);
      renderReview(it);
      $('#v-save').textContent = 'Saving…';
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(() => saveReview(it), 500);
    }
    async function saveReview(it) {
      reviewTimer = null;
      try {
        await call('adminReview', { studentId: it.studentId, id: it.id, approved: !!it.approved, redo: !!it.redo, reasons: it.reasons || [] });
        if (item() === it) $('#v-save').textContent = 'Saved ✓';
      } catch (err) {
        if (item() === it) $('#v-save').textContent = 'Not saved';
        toast(`Couldn’t save: ${err.message}`);
      }
    }
    function flushSaves() {
      if (reviewTimer) { clearTimeout(reviewTimer); saveReview(item()); }
      if (annoTimer) { clearTimeout(annoTimer); saveAnnotations(item()); }
    }

    $('#t-approve').addEventListener('click', () => changeReview(i => { i.approved = !i.approved; if (i.approved) i.redo = false; }));
    $('#t-redo').addEventListener('click', () => changeReview(i => { i.redo = !i.redo; }));
    $('#reasons').addEventListener('click', (e) => {
      const b = e.target.closest('.reason');
      if (!b) return;
      const r = b.dataset.reason;
      changeReview(i => {
        const set = new Set(i.reasons || []);
        set.has(r) ? set.delete(r) : set.add(r);
        i.reasons = data.reasons.filter(x => set.has(x));
      });
    });

    // ----- Annotating -----

    function setAnnotating(on) {
      annotating = on && !!item() && !!item().approved;
      $('#v-pages').classList.toggle('annotating', annotating);
      $('#anno-bar').hidden = !annotating;
      $('#anno-hint').hidden = !annotating;
      if (!annotating) select(-1);
      const header = annotating && addHeader(item());
      if (item()) {
        renderAnnotations(); // switches text boxes between editable and read-only
        renderReview(item());
      }
      if (header) changed();
    }

    // Annotating an upload starts with a header box on page 1: the student's full name and
    // class, then blank lines for the ES to fill in. It comes back whenever it's missing,
    // except right after the ES deletes it; "＋ Header" adds it back any time.
    const isHeader = (a, it) => a.header || String(a.text || '').startsWith(`${it.name}\n${it.subject}\n`);
    function addHeader(it, { force = false } = {}) {
      if (!it.annotations) it.annotations = [];
      if (!force && (it.headerDeleted || it.annotations.some(a => isHeader(a, it)))) return false;
      it.annotations.push({
        ...style, page: 0, x: 0.6, y: 0.03, w: 0.36, header: true,
        text: [it.name, it.subject, 'Minutes:', 'Grade:', 'Date:', 'Std:'].join('\n'),
      });
      return true;
    }
    $('#a-header').addEventListener('click', () => {
      const it = item();
      if (!it) return;
      addHeader(it, { force: true });
      renderAnnotations();
      select(it.annotations.length - 1);
      changed();
      $('#v-body').scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#t-annotate').addEventListener('click', () => {
      setAnnotating(!annotating);
      if (annotating) $('#v-body').scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#a-done').addEventListener('click', () => setAnnotating(false));

    $('#a-colors').innerHTML = COLORS.map(c =>
      `<button class="swatch" role="radio" aria-checked="false" aria-label="${c}" data-color="${c}" style="background:${c}"></button>`).join('');

    function renderAnnotations() {
      const it = item();
      if (!it.annotations) return;
      $$('#v-pages .anno-layer').forEach(l => { l.innerHTML = ''; });
      it.annotations.forEach((a, i) => {
        const layer = $(`#v-pages .page-wrap[data-page="${a.page}"] .anno-layer`);
        if (layer) layer.appendChild(makeBox(a, i));
      });
      syncToolbar();
    }

    function makeBox(a, i) {
      const box = document.createElement('div');
      box.className = `anno ${i === selected ? 'selected' : ''}`;
      box.dataset.i = i;
      applyStyle(box, a);
      box.innerHTML = '<span class="grip" title="Drag to move">⠿</span><div class="txt"></div><span class="resize" title="Drag to resize"></span>';
      const txt = $('.txt', box);
      txt.textContent = a.text;
      txt.contentEditable = String(annotating);
      txt.addEventListener('focus', () => select(i, false));
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
      });
    }

    function select(i, rerender = true) {
      selected = i;
      $$('#v-pages .anno').forEach(b => b.classList.toggle('selected', Number(b.dataset.i) === i));
      syncToolbar();
      if (rerender === false) return;
    }

    function syncToolbar() {
      const a = item() && item().annotations[selected];
      const s = a || style;
      $('#a-font').value = s.font;
      $('#a-size').value = String(s.size);
      $('#a-bold').setAttribute('aria-pressed', String(!!s.bold));
      $$('#a-colors .swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
      $('#a-delete').disabled = !a;
    }

    // Toolbar changes apply to the selected box and become the style for new boxes.
    function setStyle(patch) {
      Object.assign(style, patch);
      const a = item().annotations[selected];
      if (a) {
        Object.assign(a, patch);
        const box = $(`#v-pages .anno[data-i="${selected}"]`);
        if (box) applyStyle(box, a);
        changed();
      }
      syncToolbar();
    }
    $('#a-font').addEventListener('change', (e) => setStyle({ font: e.target.value }));
    $('#a-size').addEventListener('change', (e) => setStyle({ size: Number(e.target.value) }));
    $('#a-bold').addEventListener('click', () => {
      const a = item().annotations[selected];
      setStyle({ bold: !(a ? a.bold : style.bold) });
    });
    $('#a-colors').addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) setStyle({ color: b.dataset.color });
    });
    $('#a-delete').addEventListener('click', () => {
      if (selected < 0) return;
      const it = item();
      if (isHeader(it.annotations[selected], it)) it.headerDeleted = true;
      it.annotations.splice(selected, 1);
      selected = -1;
      renderAnnotations();
      changed();
    });
    // Keep toolbar clicks from stealing focus from the text being edited.
    $('#anno-bar').addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });

    function addBox(page, x, y) {
      const a = { page, x: clamp(x, 0, 0.9), y: clamp(y, 0, 0.95), w: 0.4, text: '', ...style };
      item().annotations.push(a);
      selected = item().annotations.length - 1;
      renderAnnotations();
      const txt = $(`#v-pages .anno[data-i="${selected}"] .txt`);
      if (txt) txt.focus();
      changed();
    }

    // Click on an empty part of a page to drop a text box there.
    $('#v-pages').addEventListener('click', (e) => {
      if (!annotating) return;
      const layer = e.target.closest('.anno-layer');
      if (!layer || e.target !== layer) return;
      // First click away from a box just deselects it.
      if (selected >= 0) {
        document.activeElement.blur();
        select(-1);
        return;
      }
      const wrap = layer.closest('.page-wrap');
      const r = wrap.getBoundingClientRect();
      addBox(Number(wrap.dataset.page), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    $('#a-add').addEventListener('click', () => {
      // Put it on the page that's most in view.
      const body = $('#v-body').getBoundingClientRect();
      let best = null, bestSeen = -1;
      $$('#v-pages .page-wrap').forEach(w => {
        const r = w.getBoundingClientRect();
        const seen = Math.min(r.bottom, body.bottom) - Math.max(r.top, body.top);
        if (seen > bestSeen) { bestSeen = seen; best = w; }
      });
      if (!best) return;
      const r = best.getBoundingClientRect();
      const y = clamp((Math.max(r.top, body.top + 80) - r.top) / r.height + 0.05, 0, 0.9);
      addBox(Number(best.dataset.page), 0.08, y);
    });

    function startDrag(e, box, a, mode) {
      if (!annotating) return;
      e.preventDefault();
      e.stopPropagation();
      select(Number(box.dataset.i));
      const wrap = box.closest('.page-wrap');
      const r = wrap.getBoundingClientRect();
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
          a.w = clamp(start.aw + dx, 0.05, 1 - a.x);
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
      const it = item();
      if (it.finalizedAt && it.filedAs !== 'Extra') it.finalStale = true;
      syncCaches(it, ['annotations', 'finalStale']);
      renderReview(it);
      $('#v-save').textContent = 'Saving…';
      clearTimeout(annoTimer);
      annoTimer = setTimeout(() => saveAnnotations(it), 800);
    }
    async function saveAnnotations(it) {
      annoTimer = null;
      try {
        await call('adminAnnotate', { studentId: it.studentId, id: it.id, annotations: cleanAnnotations(it) });
        if (item() === it) $('#v-save').textContent = 'Saved ✓';
      } catch (err) {
        if (item() === it) $('#v-save').textContent = 'Not saved';
        toast(`Couldn’t save annotations: ${err.message}`);
      }
    }
    const cleanAnnotations = (it) => it.annotations.filter(a => a.text.trim());

    // ----- Finalize: bake the text boxes into the pages and save the PDF -----

    $('#t-finalize').addEventListener('click', async () => {
      const it = item();
      if (!it.approved) return;
      flushSaves();
      busy('Making the final copy…');
      try {
        const f = await loadFile(it);
        let blob;
        if (f.images) {
          const pages = [];
          for (let n = 0; n < f.images.length; n++) {
            const canvas = await renderPage(f.images[n], cleanAnnotations(it).filter(a => a.page === n));
            pages.push(await Pdf.canvasToJpeg(canvas, 0.85));
          }
          blob = Pdf.build(pages);
        } else {
          blob = new Blob([f.bytes], { type: 'application/pdf' });
        }
        busy(`Saving to ${it.lp} Annotated…`);
        const res = await call('adminFinalize', {
          studentId: it.studentId, id: it.id, filedAs: 'Annotated', annotations: cleanAnnotations(it), data: await blobToBase64(blob),
        });
        filed(it, res);
      } catch (err) {
        toast(`Couldn’t finalize: ${err.message}`);
      } finally {
        busy(false);
      }
    });

    $('#t-extra').addEventListener('click', async () => {
      const it = item();
      if (!it.approved || (it.finalizedAt && it.filedAs === 'Extra')) return;
      if (it.finalizedAt && !confirm(`Move this from ${it.lp} Annotated to ${it.lp} Extra? The annotated copy is removed.`)) return;
      flushSaves();
      busy(`Saving to ${it.lp} Extra…`);
      try {
        filed(it, await call('adminFinalize', { studentId: it.studentId, id: it.id, filedAs: 'Extra' }));
      } catch (err) {
        toast(`Couldn’t file it: ${err.message}`);
      } finally {
        busy(false);
      }
    });

    function filed(it, res) {
      Object.assign(it, { finalizedAt: res.finalizedAt, finalUrl: res.finalUrl, filedAs: res.filedAs || 'Annotated', finalStale: false, approved: true });
      syncCaches(it, ['finalizedAt', 'finalUrl', 'filedAs', 'finalStale', 'approved']);
      setAnnotating(false);
      renderReview(it);
      toast(`✓ Saved to ${it.lp} ${it.filedAs} as ${res.name}`);
    }

    // Draws one page with its text boxes, matching what's on screen.
    async function renderPage(url, annotations) {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Could not read a page image.'));
        i.src = url;
      });
      const W = img.naturalWidth, H = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      for (const a of annotations) {
        const px = a.size * W / PAGE_PT;
        const padX = 0.3 * px, padY = 0.15 * px, lineH = 1.25 * px;
        ctx.font = `${a.bold ? '700' : '400'} ${px}px ${FONTS[a.font] || FONTS.sans}`;
        ctx.fillStyle = a.color;
        ctx.textBaseline = 'top';
        const maxW = Math.max(px, a.w * W - 2 * padX);
        let y = a.y * H + padY + (lineH - px) / 2;
        for (const line of wrap(ctx, a.text, maxW)) {
          ctx.fillText(line, a.x * W + padX, y);
          y += lineH;
        }
      }
      return canvas;
    }

    function wrap(ctx, text, maxW) {
      const out = [];
      for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(/(\s+)/)) {
          const test = line + word;
          if (line && ctx.measureText(test).width > maxW && word.trim()) {
            out.push(line.trimEnd());
            line = word.trimStart();
          } else {
            line = test;
          }
          // A single word wider than the box gets broken by letters.
          while (ctx.measureText(line).width > maxW && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
            out.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        }
        out.push(line);
      }
      return out;
    }

    // ----- Navigation -----

    $('#v-close').addEventListener('click', close);
    $('#v-prev').addEventListener('click', () => go(-1));
    $('#v-next').addEventListener('click', () => go(1));
    document.addEventListener('keydown', (e) => {
      if (el.hidden) return;
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === 'Escape') {
        if (typing) document.activeElement.blur();
        else if (annotating) setAnnotating(false);
        else close();
        return;
      }
      if (typing) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && annotating && selected >= 0) $('#a-delete').click();
    });
    // Swipe left/right on a phone or tablet (not while annotating).
    let touchX = null;
    $('#v-pages').addEventListener('touchstart', (e) => { touchX = annotating ? null : e.touches[0].clientX; }, { passive: true });
    $('#v-pages').addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    });

    return { open };
  })();

  // ---------- Helpers ----------

  // ---------- LP dates ----------

  const datesDialog = $('#dates-dialog');
  $('#open-dates').addEventListener('click', () => {
    const d = data.lpDates || {};
    $('#dates-grid').innerHTML = '<span></span><b>Start</b><b>End</b>' + data.lps.map(lp => `
      <span class="lp-name">${esc(lp)}</span>
      <input type="date" data-lp="${esc(lp)}" data-end="0" value="${esc((d[lp] || {}).start || '')}" aria-label="${esc(lp)} start date">
      <input type="date" data-lp="${esc(lp)}" data-end="1" value="${esc((d[lp] || {}).end || '')}" aria-label="${esc(lp)} end date">`).join('');
    datesDialog.showModal();
  });
  $('#dates-cancel').addEventListener('click', () => datesDialog.close());
  $('#dates-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dates = {};
    $$('#dates-grid input').forEach(inp => {
      const lp = inp.dataset.lp;
      dates[lp] = dates[lp] || { start: '', end: '' };
      dates[lp][inp.dataset.end === '1' ? 'end' : 'start'] = inp.value;
    });
    busy('Saving dates…');
    try {
      const res = await call('adminSetLpDates', { dates });
      data.lpDates = res.lpDates;
      datesDialog.close();
      renderDash();
      toast('LP dates saved.');
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });

  // ---------- Students (bulk add and edit, like a spreadsheet) ----------

  const COLS = ['first', 'last', 'grade', 'city', 'classes'];
  const GRADE_LIST = ['8', '9', '10', '11', '12'];
  let roster = [];
  let rosterDirty = false;

  const onlyLetters = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  function rosterId(r) {
    const a = onlyLetters(r.first).slice(0, 2), c = onlyLetters(r.city).slice(0, 2), g = String(r.grade || '').trim();
    return a.length === 2 && c.length === 2 && GRADE_LIST.includes(g) ? a + g + c : '';
  }
  const blankRow = () => ({ first: '', last: '', grade: '', city: '', classes: '' });
  const isEmpty = (r) => COLS.every(k => !String(r[k] || '').trim());

  $('#open-roster').addEventListener('click', async () => {
    busy('Loading students…');
    try {
      const res = await call('adminRoster');
      roster = res.rows.map(r => ({ ...blankRow(), ...r }));
      for (let i = 0; i < 5; i++) roster.push(blankRow());
      setDirty(false);
      currentStudent = null;
      renderRoster();
      show('roster');
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  $('#roster-back').addEventListener('click', () => {
    if (rosterDirty && !confirm('You have unsaved changes to the student list. Leave without saving?')) return;
    show('dash');
  });
  $('#roster-add').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) roster.push(blankRow());
    renderRoster();
  });

  function setDirty(on) {
    rosterDirty = on;
    $('#roster-state').textContent = on ? 'Unsaved changes' : '';
  }

  function renderRoster() {
    const counts = {};
    roster.forEach(r => { const id = rosterId(r); if (id) counts[id] = (counts[id] || 0) + 1; });
    $('#roster-count').textContent = `${roster.filter(r => !isEmpty(r)).length}`;
    $('#roster-body').innerHTML = roster.map((r, i) => {
      const id = rosterId(r);
      const problem = isEmpty(r) ? '' : !id ? 'Needs first name, grade 8–12 and city' : counts[id] > 1 ? 'Same sign-in as another row' : '';
      return `<tr data-r="${i}" class="${problem ? 'bad' : ''}">
        <td class="num">${i + 1}</td>
        ${COLS.map(k => `<td><input data-k="${k}" value="${esc(r[k])}" aria-label="${k} row ${i + 1}" ${k === 'grade' ? 'inputmode="numeric" list="grade-list"' : ''}></td>`).join('')}
        <td class="sid-cell" title="${esc(problem)}">${id ? `<b>${id}</b>` : ''}${problem ? `<span class="why">${esc(problem)}</span>` : ''}</td>
        <td><button class="row-x" type="button" title="Remove row" aria-label="Remove row ${i + 1}">✕</button></td>
      </tr>`;
    }).join('') + '<datalist id="grade-list">' + GRADE_LIST.map(g => `<option value="${g}">`).join('') + '</datalist>';
  }

  // Typing updates the row; the ID column refreshes without losing the cursor.
  $('#roster-body').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-k]');
    if (!inp) return;
    const i = Number(inp.closest('tr').dataset.r);
    roster[i][inp.dataset.k] = inp.value;
    setDirty(true);
    refreshIds();
  });
  function refreshIds() {
    const counts = {};
    roster.forEach(r => { const id = rosterId(r); if (id) counts[id] = (counts[id] || 0) + 1; });
    $$('#roster-body tr').forEach(tr => {
      const r = roster[Number(tr.dataset.r)];
      const id = rosterId(r);
      const problem = isEmpty(r) ? '' : !id ? 'Needs first name, grade 8–12 and city' : counts[id] > 1 ? 'Same sign-in as another row' : '';
      tr.classList.toggle('bad', !!problem);
      $('.sid-cell', tr).innerHTML = `${id ? `<b>${id}</b>` : ''}${problem ? `<span class="why">${esc(problem)}</span>` : ''}`;
    });
    $('#roster-count').textContent = `${roster.filter(r => !isEmpty(r)).length}`;
  }

  // Pasting several cells from a spreadsheet fills across and down from the clicked cell.
  $('#roster-body').addEventListener('paste', (e) => {
    const inp = e.target.closest('input[data-k]');
    if (!inp) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    let lines = text.replace(/\r/g, '').split('\n').filter((l, n, all) => l.trim() || n < all.length - 1);
    if (lines.length && /first/i.test(lines[0].split('\t')[0])) lines = lines.slice(1); // skip a header row
    const startRow = Number(inp.closest('tr').dataset.r);
    const startCol = COLS.indexOf(inp.dataset.k);
    lines.forEach((line, n) => {
      const i = startRow + n;
      while (roster.length <= i) roster.push(blankRow());
      line.split('\t').forEach((cell, m) => {
        const k = COLS[startCol + m];
        if (k) roster[i][k] = cell.trim();
      });
    });
    if (!roster.slice(-1)[0] || !isEmpty(roster[roster.length - 1])) for (let n = 0; n < 3; n++) roster.push(blankRow());
    setDirty(true);
    renderRoster();
    toast(`Pasted ${lines.length} row${lines.length === 1 ? '' : 's'}. Check them, then click Save students.`);
  });

  // Enter or the arrow keys move up and down a column, like a spreadsheet.
  $('#roster-body').addEventListener('keydown', (e) => {
    const inp = e.target.closest('input[data-k]');
    if (!inp || !['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = Number(inp.closest('tr').dataset.r) + (e.key === 'ArrowUp' ? -1 : 1);
    if (i >= roster.length) { roster.push(blankRow()); renderRoster(); }
    const next = $(`#roster-body tr[data-r="${i}"] input[data-k="${inp.dataset.k}"]`);
    if (next) next.focus();
  });

  $('#roster-body').addEventListener('click', (e) => {
    const x = e.target.closest('.row-x');
    if (!x) return;
    const i = Number(x.closest('tr').dataset.r);
    const r = roster[i];
    if (!isEmpty(r) && !confirm(`Remove ${r.first} ${r.last}? They won't be able to sign in. Their uploads stay in Drive.`)) return;
    roster.splice(i, 1);
    if (!roster.length) roster.push(blankRow());
    setDirty(true);
    renderRoster();
  });

  $('#roster-save').addEventListener('click', async () => {
    const rows = roster.filter(r => !isEmpty(r));
    if ($('#roster-body tr.bad')) return toast('Fix the rows marked in red first.');
    busy('Saving students…');
    try {
      const res = await call('adminSaveRoster', { rows });
      setDirty(false);
      roster = rows.concat([blankRow(), blankRow(), blankRow()]);
      renderRoster();
      Object.keys(studentCache).forEach(k => delete studentCache[k]);
      data = await call('adminOverview', { lp: viewLp });
      renderDash();
      toast(`Saved ${res.count} student${res.count === 1 ? '' : 's'}.`);
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  window.addEventListener('beforeunload', (e) => { if (rosterDirty) { e.preventDefault(); e.returnValue = ''; } });

  function readCreds() {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
  }
  function saveCreds(c) {
    try { c ? sessionStorage.setItem(KEY, JSON.stringify(c)) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function niceDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return ymd || '';
    return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function blankThumb() {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 4"><rect width="3" height="4" fill="#eef1f6"/></svg>');
  }
  function busy(text) {
    $('#busy').hidden = !text;
    if (text) $('#busy-text').textContent = text;
  }
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  // ---------- Start ----------

  if (creds) {
    loadOverview().catch(err => {
      toast(err.message);
      if (/password/i.test(err.message)) { creds = null; saveCreds(null); }
      show('login');
    });
  } else {
    show('login');
  }
})();
