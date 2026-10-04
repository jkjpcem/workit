// Workit app: sign in, the upload steps, the page editor, history, and sync with Drive.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const DEFAULT_LPS = ['LP1', 'LP2', 'LP3', 'LP4', 'LP5', 'LP6', 'LP7', 'LP8'];

  // ---------- Session ----------
  // { student: { id, name, firstName, grade, classes }, currentLp, lps }

  const SESSION_KEY = 'workit.session';
  let session = readJson(SESSION_KEY);

  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }
  const lps = () => (session && session.lps) || DEFAULT_LPS;

  // First 2 letters of first name + grade + first 2 letters of city, e.g. MA10SP
  function makeStudentId({ name2, grade, city2 }) {
    if (name2.length !== 2 || !grade || city2.length !== 2) return '';
    return `${name2}${grade}${city2}`;
  }

  // ---------- Sign in ----------

  const loginForm = $('#login-form');
  const letters = (v) => String(v || '').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
  const readLogin = () => ({
    name2: letters(loginForm.name2.value), grade: loginForm.grade.value, city2: letters(loginForm.city2.value),
  });
  // Letters only; upper or lower case both work.
  $$('input.letters-input', loginForm).forEach(inp => inp.addEventListener('input', () => {
    const clean = inp.value.replace(/[^A-Za-z]/g, '').slice(0, 2);
    if (clean !== inp.value) inp.value = clean;
  }));
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = makeStudentId(readLogin());
    if (!id) return toast('Answer every question.');
    busy('Signing in…');
    try {
      const res = await Api.call('login', { studentId: id });
      saveSession({ student: res.student, currentLp: res.currentLp, lps: res.lps, lpDates: res.lpDates || {} });
      showAlerts(res.alerts);
      loginForm.reset();
      resetWizard();
      show('upload');
      toast(`Welcome, ${res.student.firstName || res.student.id}!`);
      syncHistory();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });

  // Pick up a new current LP or class list the ES set, without blocking the app.
  async function refreshSession() {
    if (!session || !Api.configured() || !navigator.onLine) return;
    try {
      const res = await Api.call('login', { studentId: session.student.id });
      // Follow the new current LP unless the student deliberately picked another one.
      if (wiz.lp === session.currentLp) wiz.lp = res.currentLp;
      saveSession({ student: res.student, currentLp: res.currentLp, lps: res.lps, lpDates: res.lpDates || {} });
      showAlerts(res.alerts);
      renderAll();
    } catch (err) {
      if (!err.offline && /not find|not found/i.test(err.message)) {
        saveSession(null);
        show('login');
        toast('Your account was changed. Please sign in again.');
      }
    }
  }

  // ---------- Redo alerts ----------

  const alertDialog = $('#alert-dialog');
  let alertIds = [];
  function showAlerts(alerts) {
    if (!alerts || !alerts.length || alertDialog.open) return;
    alertIds = alerts.map(a => a.id);
    $('#alert-list').innerHTML = alerts.map(a => `
      <div class="alert-item">
        <strong>${esc(a.subject)}</strong> <span class="meta">${esc(a.lp)} · ${esc(niceDate(a.dateCompleted))}</span>
        ${a.reasons.length ? `<ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') +
      '<p class="hint">Find it in My uploads and tap Resubmit.</p>';
    alertDialog.showModal();
  }
  alertDialog.addEventListener('close', async () => {
    const ids = alertIds;
    alertIds = [];
    show('history');
    try { await Api.call('ackAlerts', { studentId: session.student.id, ids }); } catch { /* shown again next time */ }
  });

  // ---------- Screens & navigation ----------

  let current = 'login';
  function show(name) {
    if (!session) name = 'login';
    if (name === 'history' && current !== 'history') historyFilter.lp = session.currentLp;
    current = name;
    $$('.screen').forEach(s => { s.hidden = s.id !== `screen-${name}`; });
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.screen === name));
    $('.tabs').hidden = !session;
    document.body.classList.toggle('signed-in', !!session);
    renderAll();
    if (name === 'history') syncHistory();
    window.scrollTo(0, 0);
  }
  $$('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.screen)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) show(go.dataset.goto);
  });

  function renderAll() {
    $('#who').textContent = session ? (session.student.firstName || session.student.id) : '';
    $('#account').hidden = !session;
    $('#account-head').innerHTML = session
      ? `<strong>${esc(session.student.name || session.student.firstName || '')}</strong><span>Grade ${esc(session.student.grade)} · ${esc(session.currentLp)}</span>` : '';
    if (!session) closeMenu();
    $('#greeting').textContent = session ? `Welcome, ${session.student.firstName || session.student.id}` : '';
    if (!session) return;
    if (current === 'upload') renderWizard();
    if (current === 'history') renderHistory();
    if (current === 'me') renderMe();
  }

  // ---------- Upload steps ----------
  // pages (subject, then add pages from camera, photos or files, in any mix) -> details -> done

  // pages: [{ result, thumb, preview, from: 'scan'|'photo'|'pdf', src?, corners?, mode? }]
  // doc: a Word file ({ type: 'docx', name, blob }) or a Google Doc/Slides ({ type: 'gdoc', name, kind, link }).
  // Either is turned into a PDF by the server, so it always goes in by itself.
  // queue: photos picked together, waiting their turn in the page editor.
  const MAX_PAGES = 20;
  const wiz = { step: 'pages', lp: null, pages: [], editing: null, source: 'camera', resubmit: null, doc: null, queue: [] };

  function resetWizard() {
    Object.assign(wiz, { step: 'pages', lp: session ? session.currentLp : null, pages: [], editing: null, resubmit: null, doc: null, queue: [] });
    $('#subject-select').value = '';
    $('#step-review').reset();
  }

  // How the work came in, as the ES dashboard shows it.
  function kindOf() {
    if (wiz.doc) return wiz.doc.type;
    const kinds = [...new Set(wiz.pages.map(p => p.from))];
    return kinds.length === 1 ? kinds[0] : 'mixed';
  }

  // ---------- Date completed: a weekday inside the LP ----------

  const isWeekend = (ymd) => { const d = new Date(`${ymd}T12:00:00`).getDay(); return d === 0 || d === 6; };
  const lpRange = (lp) => (session && session.lpDates && session.lpDates[lp]) || null;
  function dateProblem(ymd, lp) {
    if (!ymd) return 'Enter the date you completed it.';
    if (ymd > today()) return 'The date completed can’t be in the future.';
    if (isWeekend(ymd)) return 'The date completed must be a weekday (Monday to Friday).';
    const r = lpRange(lp);
    if (r && (ymd < r.start || ymd > r.end)) return `The date completed must be during ${lp} (${niceDate(r.start)} to ${niceDate(r.end)}).`;
    return '';
  }
  function setDateLimits() {
    const inp = $('#step-review').dateCompleted;
    const r = lpRange(wiz.lp);
    const max = r && r.end < today() ? r.end : today();
    inp.max = max;
    inp.min = r ? r.start : '';
    $('#date-hint').textContent = r
      ? `A weekday from ${niceDate(r.start)} to ${niceDate(r.end)}`
      : 'A weekday (Monday to Friday)';
    if (!inp.value || dateProblem(inp.value, wiz.lp)) {
      // Start from the most recent day that's allowed.
      let d = new Date(`${max}T12:00:00`), pick = '';
      for (let i = 0; i < 7 && !pick; i++) {
        const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (r && y < r.start) break;
        if (!isWeekend(y)) pick = y;
        d.setDate(d.getDate() - 1);
      }
      inp.value = pick;
    }
  }

  function go(step) {
    wiz.step = step;
    renderWizard();
    window.scrollTo(0, 0);
  }

  // " (Sep 16 to Nov 2)" after an LP's name, from the dates the ES set.
  function lpDatesText(lp) {
    const r = lpRange(lp);
    if (!r) return '';
    const short = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return ` <span class="lp-dates">(${esc(short(r.start))} to ${esc(short(r.end))})</span>`;
  }

  function renderWizard() {
    if (!wiz.lp) wiz.lp = session.currentLp;
    const isCurrent = wiz.lp === session.currentLp;
    $('#lp-banner').className = `lp-banner ${isCurrent ? '' : 'off'}`;
    $('#lp-banner').innerHTML = `<span class="lp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span><span class="lp-text">${isCurrent
      ? `Uploading to <strong>${esc(wiz.lp)}</strong>${lpDatesText(wiz.lp)}`
      : `Uploading to <strong>${esc(wiz.lp)}</strong>${lpDatesText(wiz.lp)}. The current LP is ${esc(session.currentLp)}.
         <button class="linklike" id="lp-reset">Switch back</button>`}</span>` +
      (wiz.step === 'done' ? '' : '<button class="btn change-lp-btn" type="button" id="change-lp">Change LP</button>');
    if (wiz.resubmit) {
      $('#lp-banner').insertAdjacentHTML('beforeend',
        `<div class="resubmit-note">↺ Resubmitting <strong>${esc(wiz.resubmit.subject)}</strong> from ${esc(niceDate(wiz.resubmit.dateCompleted))}</div>`);
    }
    const reset = $('#lp-reset');
    if (reset) reset.addEventListener('click', () => { wiz.lp = session.currentLp; renderWizard(); });

    for (const s of ['pages', 'review', 'done']) $(`#step-${s}`).hidden = wiz.step !== s;

    if (wiz.step === 'pages') renderPages();
    if (wiz.step === 'review') renderReview();
  }

  // ---------- Step 1 and 2: subject, then pages ----------

  function renderSubjects() {
    const sel = $('#subject-select');
    const classes = Classes.forLp(session.student, wiz.lp || session.currentLp).map(c => c.name);
    const keep = sel.value;
    sel.innerHTML = '<option value="">Choose a subject</option>' +
      classes.map(c => `<option>${esc(c)}</option>`).join('');
    if (wiz.resubmit && !classes.includes(wiz.resubmit.subject)) {
      sel.insertAdjacentHTML('beforeend', `<option>${esc(wiz.resubmit.subject)}</option>`);
    }
    if (wiz.presetSubject && classes.includes(wiz.presetSubject)) { sel.value = wiz.presetSubject; wiz.presetSubject = null; }
    else if (wiz.resubmit && !keep) sel.value = wiz.resubmit.subject;
    else if (classes.includes(keep) || (wiz.resubmit && keep === wiz.resubmit.subject)) sel.value = keep;
    else if (classes.length === 1) sel.value = classes[0];
  }

  function renderPages() {
    renderSubjects();
    const n = wiz.pages.length;
    const hasSubject = !!$('#subject-select').value;
    const full = wiz.pages.length >= MAX_PAGES;
    $('#add-card').classList.toggle('locked', !hasSubject);
    // Highlight the step the student is on; fade the others.
    const currentCard = hasSubject ? 'add' : 'subject';
    $('#subject-card').classList.toggle('current', currentCard === 'subject');
    $('#subject-card').classList.toggle('faded', currentCard !== 'subject');
    $('#add-card').classList.toggle('current', currentCard === 'add');
    $('#add-card').classList.toggle('faded', currentCard !== 'add');
    $('#list-card').classList.toggle('current', currentCard === 'add' && (n > 0 || !!wiz.doc));
    $('#list-card').classList.toggle('faded', !(currentCard === 'add' && (n > 0 || !!wiz.doc)));
    $$('.add-btn').forEach(b => { b.disabled = !hasSubject || !!wiz.doc || full; });
    $('#add-hint').textContent = !hasSubject ? 'Choose a subject first.'
      : wiz.doc ? `${wiz.doc.type === 'docx' ? 'A Word file' : 'A Google Doc or Slides'} goes in by itself. Remove it to add other pages.`
      : full ? `That’s the most pages one turn-in can have (${MAX_PAGES}).`
      : wiz.pages.length ? 'Add more pages if you have them. They go at the end of the list.'
      : 'Add pages in any order. You can mix photos and files, then put them in order below.';

    $('#list-title').textContent = wiz.doc ? 'Your file' : n ? `Your pages (${n})` : 'Your pages';
    const list = $('#page-list');
    if (wiz.doc) {
      list.innerHTML = `<li class="file-card">${docCard()}
        <button class="icon-btn danger" type="button" data-act="remove-doc" aria-label="Remove ${esc(wiz.doc.name)}">✕</button></li>`;
    } else {
      list.innerHTML = wiz.pages.map((p, i) => `
        <li class="page-item">
          <button class="page-thumb" type="button" data-act="${p.from === 'scan' ? 'fix' : 'view'}" data-i="${i}" aria-label="Page ${i + 1}${p.from === 'scan' ? ', tap to fix' : ''}">
            <img alt="" src="${p.thumb}"><span class="num">${i + 1}</span>
          </button>
          <div class="page-tools">
            <button class="icon-btn" type="button" data-act="up" data-i="${i}" aria-label="Move page ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" type="button" data-act="down" data-i="${i}" aria-label="Move page ${i + 1} down" ${i === n - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon-btn danger" type="button" data-act="remove" data-i="${i}" aria-label="Remove page ${i + 1}">✕</button>
          </div>
        </li>`).join('');
    }
    $('#empty-pages').hidden = !!(n || wiz.doc);
    const ready = hasSubject && (n > 0 || !!wiz.doc);
    $('#to-details').disabled = !ready;
    $('#to-details').textContent = ready
      ? `Next: add details for ${wiz.doc ? 'your file' : `${n} page${n > 1 ? 's' : ''}`} →`
      : 'Next: add details →';
  }

  $('#subject-select').addEventListener('change', renderPages);

  $('#page-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    const act = b.dataset.act;
    if (act === 'remove-doc') wiz.doc = null;
    if (act === 'remove') {
      if (!confirm(`Remove page ${i + 1}?`)) return;
      wiz.pages.splice(i, 1);
    }
    if (act === 'up' && i > 0) [wiz.pages[i - 1], wiz.pages[i]] = [wiz.pages[i], wiz.pages[i - 1]];
    if (act === 'down' && i < wiz.pages.length - 1) [wiz.pages[i + 1], wiz.pages[i]] = [wiz.pages[i], wiz.pages[i + 1]];
    if (act === 'fix') {
      const p = wiz.pages[i];
      wiz.editing = i;
      Editor.open(p.src, { corners: p.corners, mode: p.mode });
      return;
    }
    if (act === 'view') return window.open(wiz.pages[i].preview, '_blank');
    renderPages();
    if (act === 'up' || act === 'down') {
      const moved = $(`#page-list [data-act="${act}"][data-i="${act === 'up' ? i - 1 : i + 1}"]`);
      if (moved && !moved.disabled) moved.focus();
    }
  });

  const needSubject = () => {
    if ($('#subject-select').value) return false;
    $('#subject-select').focus();
    toast('Choose a subject first.');
    return true;
  };
  $('#add-camera').addEventListener('click', () => { if (!needSubject()) $('#camera-input').click(); });
  $('#add-gallery').addEventListener('click', () => { if (!needSubject()) $('#gallery-input').click(); });
  $('#add-file').addEventListener('click', () => { if (!needSubject()) $('#file-input').click(); });

  $('#to-details').addEventListener('click', () => {
    if (needSubject()) return;
    if (!wiz.pages.length && !wiz.doc) return toast('Add at least one page.');
    go('review');
  });
  $('#review-back').addEventListener('click', () => go('pages'));

  const room = () => MAX_PAGES - wiz.pages.length;
  const tooMany = (adding) => `That would make ${wiz.pages.length + adding} pages. The most one turn-in can have is ${MAX_PAGES}.`;

  const docLabel = () => !wiz.doc ? '' : wiz.doc.type === 'docx' ? 'Word file' : wiz.doc.kind;
  function docCard() {
    const d = wiz.doc;
    const icon = d.type === 'docx' ? 'W' : d.kind === 'Google Slides' ? 'S' : 'G';
    return `<span class="file-icon ${d.type === 'gdoc' ? (d.kind === 'Google Slides' ? 'slides' : 'gdoc') : ''}" aria-hidden="true">${icon}</span>
      <div class="grow"><strong>${esc(d.name)}</strong><div class="meta">${esc(docLabel())}. Your ES gets it as a PDF.</div></div>`;
  }

  // ---------- Adding a Google Doc or Slides (by its share link) ----------

  const linkDialog = $('#link-dialog');
  $('#add-link').addEventListener('click', () => {
    if (needSubject()) return;
    if (wiz.pages.length) {
      return toast('A Google Doc or Slides has to go in by itself. To combine it with other pages, download it as a PDF first (File → Download → PDF), then add the PDF.');
    }
    $('#link-input').value = '';
    linkDialog.showModal();
    $('#link-input').focus();
  });
  $('#link-cancel').addEventListener('click', () => linkDialog.close());
  $('#link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = $('#link-input').value.trim();
    if (!link) { $('#link-input').focus(); return toast('Paste the link first.'); }
    if (!/^https:\/\/(docs|drive)\.google\.com\//.test(link)) {
      $('#link-input').focus();
      return toast('That doesn’t look like a Google Docs or Slides link. Copy it from the Share button and try again.');
    }
    busy('Checking your link…');
    try {
      const res = await Api.call('checkLink', { studentId: session.student.id, link });
      wiz.doc = { type: 'gdoc', name: res.name, kind: res.kind, link };
      linkDialog.close();
      renderPages();
    } catch (err) {
      toast(err.offline ? 'You need to be online to add a Google Doc or Slides.' : err.message);
    } finally {
      busy(false);
    }
  });

  // ---------- Adding files (PDF, Word, JPG, PNG) ----------

  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  $('#file-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const type = (f) => {
      const n = f.name.toLowerCase();
      if (/\.pdf$/.test(n) || f.type === 'application/pdf') return 'pdf';
      if (/\.docx$/.test(n)) return 'docx';
      if (/\.(jpe?g|png)$/.test(n) || /^image\/(jpeg|png)$/.test(f.type)) return 'photo';
      if (/\.doc$/.test(n)) return 'olddoc';
      return 'other';
    };
    const kinds = files.map(type);
    if (kinds.includes('olddoc')) return toast('That is an old Word file (.doc). Save it as .docx or PDF, then add it.');
    if (kinds.includes('other')) return toast('Workit takes PDF, Word (.docx), JPG and PNG files.');
    if (files.some(f => f.size > MAX_FILE_BYTES)) return toast('That file is too big. The most is 15 MB.');
    if (kinds.includes('docx')) {
      if (files.length > 1 || wiz.pages.length) {
        return toast('A Word file has to go in by itself. To combine it with other pages, save it as a PDF first, then add the PDF.');
      }
      wiz.doc = { type: 'docx', name: files[0].name, blob: files[0] };
      return renderPages();
    }
    busy(files.length > 1 ? 'Opening your files…' : 'Opening your file…');
    try {
      const added = [];
      for (const f of files) {
        const canvases = type(f) === 'pdf'
          ? await PdfView.render(new Uint8Array(await f.arrayBuffer()), { maxPages: MAX_PAGES })
          : [await imageToCanvas(f)];
        for (const c of canvases) added.push(asPage(c, type(f)));
        if (added.length > room()) throw new Error(tooMany(added.length));
      }
      wiz.pages.push(...added);
      renderPages();
      toast(`Added ${added.length} page${added.length > 1 ? 's' : ''}.`);
    } catch (err) {
      toast(err.message || 'Could not open that file.');
    } finally {
      busy(false);
    }
  });

  const asPage = (c, from) => ({ result: c, thumb: shrink(c, 200, 0.6), preview: shrink(c, 900, 0.8), from });

  // A picture that is already digital (a screenshot, a photo of finished work) is used as is.
  async function imageToCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error(`Could not open ${file.name}.`));
        i.src = url;
      });
      const scale = Math.min(1, 1700 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- Adding photos (each one is flattened and cleaned up) ----------

  for (const [id, source] of [['#camera-input', 'camera'], ['#gallery-input', 'gallery']]) {
    $(id).addEventListener('change', (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (!files.length) return;
      if (wiz.editing === null && files.length > room()) return toast(tooMany(files.length));
      wiz.source = source;
      // A rescan replaces the page being checked; the rest wait their turn.
      wiz.queue = [...files, ...wiz.queue];
      nextPhoto();
    });
  }

  async function nextPhoto() {
    const file = wiz.queue.shift();
    if (!file) return;
    busy('Scanning your page…');
    try {
      const src = await Scan.loadImage(file);
      const left = wiz.queue.length;
      await Editor.open(src, { title: left ? `Check this page (${left} more to go)` : '' });
    } catch (err) {
      toast(err.message || 'Could not open that photo.');
      nextPhoto();
    } finally {
      busy(false);
    }
  }

  function rescan() {
    $(wiz.source === 'gallery' ? '#gallery-input' : '#camera-input').click();
  }

  function keepPage(page) {
    if (wiz.editing !== null) {
      wiz.pages[wiz.editing] = { ...page, from: 'scan' };
      wiz.editing = null;
    } else {
      wiz.pages.push({ ...page, from: 'scan' });
    }
    if (wiz.step !== 'pages') go('pages'); else renderPages();
    if (wiz.queue.length) nextPhoto();
  }

  // ---------- Step 3: details ----------

  function renderReview() {
    const subject = $('#subject-select').value;
    const n = wiz.pages.length;
    $('#details-title').textContent = `${subject} details`;
    $('#upload-btn').textContent = `Submit to ${wiz.lp}`;
    $('#summary-line').innerHTML = `<strong>${esc(subject)}</strong> · ${wiz.doc ? esc(docLabel()) : `${n} page${n > 1 ? 's' : ''}`} · ${esc(wiz.lp)}`;
    setDateLimits();
    $('#review-pages').innerHTML = wiz.doc
      ? `<div class="file-card">${docCard()}</div>`
      : wiz.pages.map((p, i) => `<figure class="page-thumb"><img alt="Page ${i + 1}" src="${p.thumb}"><span class="num">${i + 1}</span></figure>`).join('');
  }

  $('#step-review').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const minutes = Number(f.minutes.value);
    if (!(minutes >= 1 && minutes <= 600 && Number.isInteger(minutes))) { f.minutes.focus(); return toast('Enter the minutes you spent (1 to 600).'); }
    const badDate = dateProblem(f.dateCompleted.value, wiz.lp);
    if (badDate) { f.dateCompleted.focus(); return toast(badDate); }
    if (!f.score.value.trim()) { f.score.focus(); return toast('Enter your grade or score.'); }
    busy('Making your file…');
    await tick();
    try {
      const pdfPages = [];
      if (!wiz.doc) for (const p of wiz.pages) pdfPages.push(await Pdf.canvasToJpeg(p.result));
      const now = Date.now();
      const item = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        studentId: session.student.id,
        createdAt: now,
        lp: wiz.lp,
        subject: $('#subject-select').value,
        minutes,
        dateCompleted: f.dateCompleted.value,
        score: f.score.value.trim(),
        feedback: '',
        comments: f.comments.value.trim(),
        pageCount: Math.max(1, wiz.pages.length),
        source: kindOf(),
        thumb: wiz.pages.length ? wiz.pages[0].thumb : '',
        // A Word file goes up as it is; the server turns it into a PDF.
        link: wiz.doc && wiz.doc.type === 'gdoc' ? wiz.doc.link : '',
        docKind: wiz.doc && wiz.doc.type === 'gdoc' ? wiz.doc.kind : '',
        pdf: wiz.doc && wiz.doc.type === 'gdoc' ? null
          : wiz.doc ? new Blob([wiz.doc.blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
          : Pdf.build(pdfPages),
        favorite: false,
        status: 'pending',
        resubmitOf: wiz.resubmit ? wiz.resubmit.id : '',
      };
      await Store.put(item);
      busy(`Uploading to ${item.lp}…`);
      const result = await send(item);
      showDone(item, result);
    } catch (err) {
      console.error(err);
      toast('Something went wrong. Please try again.');
    } finally {
      busy(false);
    }
  });

  // "3 pages", "Word file" or "Google Slides", for the done screen and My uploads.
  function sizeLabel(item) {
    if (item.source === 'docx') return 'Word file';
    if (item.source === 'gdoc') return item.docKind || 'Google Doc or Slides';
    return `${item.pageCount} page${item.pageCount > 1 ? 's' : ''}`;
  }

  function showDone(item, result) {
    const ok = result.ok;
    $('#done-mark').textContent = ok ? '✓' : '💾';
    $('#done-mark').className = `done-mark ${ok ? '' : 'saved'}`;
    $('#done-title').textContent = ok ? `Uploaded to ${item.lp}!` : 'Saved, not sent yet';
    $('#done-text').textContent = ok
      ? `${item.subject}, ${esc(sizeLabel(item))}. Your ES has it.`
      : `${result.error} It’s saved on this device. ${result.offline ? 'It will send by itself when you’re back online.' : 'You can send it again from My uploads.'}`;
    go('done');
  }
  $('#done-again').addEventListener('click', () => { resetWizard(); renderWizard(); });

  // ---------- Change LP ----------

  const lpDialog = $('#lp-dialog');
  let lpChoice = null;
  $('#lp-banner').addEventListener('click', (e) => {
    if (!e.target.closest('#change-lp')) return;
    $('#lp-list').innerHTML = lps().map(lp => `
      <button class="lp-option ${lp === wiz.lp ? 'selected' : ''}" value="${esc(lp)}">
        <strong>${esc(lp)}</strong>${lp === session.currentLp ? '<span class="pill">Current</span>' : ''}
      </button>`).join('');
    $('#lp-pick').hidden = false;
    $('#lp-warn').hidden = true;
    lpDialog.showModal();
  });
  $('#lp-list').addEventListener('click', (e) => {
    const b = e.target.closest('.lp-option');
    if (!b) return;
    e.preventDefault();
    lpChoice = b.value;
    if (lpChoice === session.currentLp) {
      wiz.lp = lpChoice;
      lpDialog.close();
      renderWizard();
      return;
    }
    $('#lp-warn-title').textContent = `Upload to ${lpChoice}?`;
    $('#lp-warn-text').innerHTML = `We are in <strong>${esc(session.currentLp)}</strong> right now. ` +
      `You picked <strong>${esc(lpChoice)}</strong>, which is not the current Learning Period. ` +
      'Your work may be missed if it goes to the wrong LP.';
    $('#lp-warn-yes').textContent = `Yes, upload to ${lpChoice}`;
    $('#lp-pick').hidden = true;
    $('#lp-warn').hidden = false;
  });
  lpDialog.addEventListener('close', () => {
    if (lpDialog.returnValue === 'confirm' && lpChoice) {
      wiz.lp = lpChoice;
      renderWizard();
    }
    lpDialog.returnValue = '';
  });

  // ---------- Page editor ----------

  const Editor = (() => {
    const el = $('#editor');
    const canvas = $('#ed-canvas');
    const ctx = canvas.getContext('2d');
    let state = null; // { src, view, viewScale, corners, mode, warped, result, step }
    let drag = -1;

    // Opens straight onto the cleaned-up page, ready to keep or rescan.
    async function open(src, { corners = null, mode = 'color', title = '' } = {}) {
      state = { src, mode, title, corners: corners ? corners.map(c => ({ ...c })) : Scan.detectCorners(src) };
      makeView();
      el.hidden = false;
      document.body.style.overflow = 'hidden';
      await process();
    }
    function close() {
      el.hidden = true;
      document.body.style.overflow = '';
      state = null;
    }

    async function process() {
      busy('Cleaning up your page…');
      await tick();
      try {
        state.warped = Scan.warp(state.src, state.corners);
        state.result = Scan.enhance(Scan.copy(state.warped), state.mode);
        setStep('preview');
      } finally {
        busy(false);
      }
    }

    function makeView() {
      const s = Math.min(1, 1400 / Math.max(state.src.width, state.src.height));
      const v = document.createElement('canvas');
      v.width = Math.round(state.src.width * s);
      v.height = Math.round(state.src.height * s);
      v.getContext('2d').drawImage(state.src, 0, 0, v.width, v.height);
      state.view = v;
      state.viewScale = s;
    }

    function setStep(step) {
      state.step = step;
      $('#ed-tools-crop').hidden = step !== 'crop';
      $('#ed-tools-preview').hidden = step !== 'preview';
      $('#ed-title').textContent = step === 'crop' ? 'Drag the dots to the page corners' : (state.title || 'Check your page');
      $$('#ed-tools-preview .seg').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
      draw();
    }

    function draw() {
      if (!state) return;
      if (state.step === 'preview') {
        canvas.width = state.result.width;
        canvas.height = state.result.height;
        ctx.drawImage(state.result, 0, 0);
        return;
      }
      const v = state.view, s = state.viewScale;
      canvas.width = v.width;
      canvas.height = v.height;
      ctx.drawImage(v, 0, 0);
      const pts = state.corners.map(c => ({ x: c.x * s, y: c.y * s }));
      const k = cssToCanvas();

      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath();
      ctx.rect(0, 0, v.width, v.height);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 3; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();

      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = '#5b80ff';
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();

      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (drag === i ? 18 : 14) * k, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(91,128,255,.35)';
        ctx.fill();
        ctx.lineWidth = 3 * k;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      });
    }

    function cssToCanvas() {
      const r = canvas.getBoundingClientRect();
      return r.width ? canvas.width / r.width : 1;
    }
    function toSource(e) {
      const r = canvas.getBoundingClientRect();
      const k = canvas.width / r.width;
      return { x: ((e.clientX - r.left) * k) / state.viewScale, y: ((e.clientY - r.top) * k) / state.viewScale };
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!state || state.step !== 'crop') return;
      const p = toSource(e);
      const reach = (40 * cssToCanvas()) / state.viewScale;
      let best = -1, bestD = Infinity;
      state.corners.forEach((c, i) => {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (bestD <= reach) {
        drag = best;
        canvas.setPointerCapture(e.pointerId);
        draw();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const p = toSource(e);
      state.corners[drag] = {
        x: Math.max(0, Math.min(state.src.width, p.x)),
        y: Math.max(0, Math.min(state.src.height, p.y)),
      };
      draw();
    });
    const endDrag = () => { if (drag >= 0) { drag = -1; draw(); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', draw);

    $('#ed-cancel').addEventListener('click', () => {
      wiz.editing = null;
      close();
      if (wiz.queue.length) nextPhoto(); // skip this photo, keep going with the rest
    });
    $('#ed-rescan').addEventListener('click', () => {
      close();
      rescan(); // must run inside the tap so the camera is allowed to open
    });
    $('#ed-edges').addEventListener('click', () => setStep('crop'));
    $('#ed-crop-done').addEventListener('click', process);
    $('#ed-rotate').addEventListener('click', () => {
      const w = state.src.height; // width after turning is the old height
      state.src = Scan.rotate90(state.src);
      const c = state.corners.map(p => ({ x: w - p.y, y: p.x }));
      state.corners = [c[3], c[0], c[1], c[2]]; // keep TL, TR, BR, BL order
      makeView();
      draw();
    });
    $('#ed-auto').addEventListener('click', () => { state.corners = Scan.detectCorners(state.src); draw(); });
    $('#ed-full').addEventListener('click', () => {
      const { width: w, height: h } = state.src;
      state.corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
      draw();
    });
    $$('#ed-tools-preview .seg').forEach(b => b.addEventListener('click', async () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      busy('Fixing the lighting…');
      await tick();
      try {
        state.result = Scan.enhance(Scan.copy(state.warped), state.mode);
        setStep('preview');
      } finally {
        busy(false);
      }
    }));
    $('#ed-keep').addEventListener('click', () => {
      const page = {
        src: state.src,
        corners: state.corners,
        mode: state.mode,
        result: state.result,
        thumb: shrink(state.result, 200, 0.6),
        preview: shrink(state.result, 900, 0.8),
      };
      close();
      keepPage(page);
    });

    return { open };
  })();

  // ---------- Sending & syncing ----------

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function fileNameFor(item) {
    const subject = item.subject.replace(/[\\/:*?"<>|]+/g, ' ').trim();
    return `${item.studentId} - ${subject} - ${item.dateCompleted}.pdf`;
  }

  // Returns { ok } or { ok: false, error, offline }.
  async function send(item) {
    try {
      await Api.call('upload', {
        studentId: item.studentId,
        uploadId: item.id,
        resubmitOf: item.resubmitOf || '',
        lp: item.lp,
        subject: item.subject,
        dateCompleted: item.dateCompleted,
        minutes: item.minutes || '',
        score: item.score,
        feedback: item.feedback,
        comments: item.comments,
        pageCount: item.pageCount,
        source: item.source || 'scan',
        fileName: fileNameFor(item),
        thumb: item.thumb,
        ...(item.source === 'gdoc' ? { link: item.link } : { data: await blobToBase64(item.pdf) }),
      });
      await Store.update(item.id, { status: 'sent', error: '' });
      if (item.resubmitOf) await Store.update(item.resubmitOf, { resubmitted: true });
      return { ok: true };
    } catch (err) {
      const waiting = err.offline || !Api.configured();
      await Store.update(item.id, { status: waiting ? 'pending' : 'failed', error: err.message });
      return { ok: false, error: err.message, offline: waiting };
    }
  }

  let retrying = false;
  async function retryPending() {
    if (retrying || !session || !Api.configured() || !navigator.onLine) return;
    retrying = true;
    try {
      const mine = (await Store.all()).filter(i => i.studentId === session.student.id && i.status === 'pending');
      let sent = 0;
      for (const item of mine) if ((await send(item)).ok) sent++;
      if (sent) {
        toast(`✅ Sent ${sent} saved upload${sent > 1 ? 's' : ''} to your ES.`);
        renderAll();
      }
    } finally {
      retrying = false;
    }
  }
  window.addEventListener('online', () => { retryPending(); refreshSession(); });

  // Bring in uploads from Drive (including ones made on another device).
  let syncing = false;
  async function syncHistory() {
    if (syncing || !session || !Api.configured() || !navigator.onLine) return;
    syncing = true;
    try {
      const res = await Api.call('list', { studentId: session.student.id });
      for (const s of res.items) {
        const local = await Store.get(s.id);
        await Store.put({
          ...(local || {}),
          ...s,
          studentId: session.student.id,
          createdAt: (local && local.createdAt) || s.receivedAt,
          thumb: s.thumb || (local && local.thumb) || '',
          status: 'sent',
          error: '',
        });
      }
      if (current === 'history') renderHistory();
    } catch { /* show what we have */ } finally {
      syncing = false;
    }
  }

  // ---------- My uploads ----------

  // My uploads opens on the current LP each time.
  const historyFilter = { lp: null };

  function renderChips() {
    const opts = ['all', ...lps()];
    $('#lp-chips').innerHTML = opts.map(v => `
      <button class="chip ${historyFilter.lp === v ? 'active' : ''}" data-lp="${esc(v)}" role="tab"
        aria-selected="${historyFilter.lp === v}">${v === 'all' ? 'All' : esc(v)}${v === session.currentLp ? ' •' : ''}</button>`).join('');
  }
  $('#lp-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    historyFilter.lp = b.dataset.lp;
    renderHistory();
  });

  // Every class needs one sample per LP, and an accelerated class needs two.
  // An upload waiting on a redo doesn't count yet.
  function renderMissing(items) {
    const lp = historyFilter.lp === 'all' ? session.currentLp : historyFilter.lp;
    const classes = Classes.forLp(session.student, lp);
    const box = $('#missing');
    if (!classes.length) { box.hidden = true; return; }
    const inLp = items.filter(i => i.lp === lp);
    const have = (c) => inLp.filter(i => i.subject === c.name && !(i.redo && !i.resubmitted)).length;
    const missing = classes.filter(c => have(c) < c.need);
    const accel = classes.some(c => c.need > 1);
    box.hidden = false;
    box.className = `card stack missing ${missing.length ? '' : 'all-done'}`;
    box.innerHTML = missing.length
      ? `<h2>Missing samples for ${esc(lp)} <span class="count">${missing.length} of ${classes.length} subjects</span></h2>
         <p class="hint">Every subject needs one sample each LP${accel ? ', and an accelerated subject needs two' : ''}.</p>
         <ul class="missing-list">${missing.map(c => `<li><span>${esc(c.name)}${c.need > 1
           ? ` <span class="need">${have(c)} of ${c.need} · accelerated</span>` : ''}</span>
           <button class="btn small primary" type="button" data-turnin="${esc(c.name)}" data-lp="${esc(lp)}">Turn in</button></li>`).join('')}</ul>`
      : `<h2>✓ Every subject has its samples for ${esc(lp)}</h2>`;
  }
  $('#missing').addEventListener('click', (e) => {
    const b = e.target.closest('[data-turnin]');
    if (!b) return;
    resetWizard();
    wiz.lp = b.dataset.lp;
    wiz.presetSubject = b.dataset.turnin;
    show('upload');
  });

  async function renderHistory() {
    if (!session) return;
    if (!historyFilter.lp) historyFilter.lp = session.currentLp;
    renderChips();
    const list = $('#history-list');
    const mine = (await Store.all()).filter(i => i.studentId === session.student.id);
    renderMissing(mine);
    const items = historyFilter.lp === 'all' ? mine : mine.filter(i => i.lp === historyFilter.lp);
    if (!items.length) {
      list.innerHTML = `<div class="empty">${historyFilter.lp === 'all' ? 'Nothing uploaded yet.' : `Nothing uploaded to ${esc(historyFilter.lp)} yet.`}</div>`;
      return;
    }
    list.innerHTML = '';
    // Group by subject, in the order of the student's classes; newest first inside each subject.
    const classes = [...Classes.forLp(session.student, 'LP1'), ...Classes.forLp(session.student, 'LP5')].map(c => c.name);
    const rank = (c) => { const i = classes.indexOf(c); return i === -1 ? classes.length : i; };
    items.sort((x, y) => rank(x.subject) - rank(y.subject) || x.subject.localeCompare(y.subject)
      || String(y.dateCompleted).localeCompare(String(x.dateCompleted)) || y.createdAt - x.createdAt);
    let group = null;
    for (const item of items) {
      if (item.subject !== group) {
        group = item.subject;
        const n = items.filter(i => i.subject === group).length;
        list.insertAdjacentHTML('beforeend', `<h2 class="subject-head">${esc(group)} <span class="count">${n} sample${n > 1 ? 's' : ''}</span></h2>`);
      }
      const el = document.createElement('div');
      el.className = 'card item';
      const badge = {
        sent: '<span class="badge sent">✓ Uploaded</span>',
        pending: '<span class="badge pending">Waiting to send</span>',
        failed: '<span class="badge failed">Not sent</span>',
      }[item.status] || '';
      const needsRedo = item.redo && !item.resubmitted;
      const review = needsRedo ? '<span class="badge redo">↺ Redo needed</span>'
        : item.redo ? '<span class="badge resubmitted">Resubmitted</span>'
        : item.approved || item.finalized ? '<span class="badge approved">✓ Approved</span>' : '';
      el.classList.toggle('needs-redo', needsRedo);
      el.innerHTML = `
        ${item.thumb ? `<img src="${item.thumb}" alt="First page">` : '<div class="nothumb">📄</div>'}
        <div class="body">
          <h3>${esc(item.subject)}</h3>
          <div class="meta">${esc(item.lp)} · Completed ${esc(niceDate(item.dateCompleted))} · ${esc(sizeLabel(item))}</div>
          ${item.score ? `<div class="score">Score: <strong>${esc(item.score)}</strong>${item.minutes ? ` · ${esc(item.minutes)} min` : ''}</div>` : ''}
          <div class="badges">${badge}${review}</div>
          ${needsRedo && item.reasons && item.reasons.length ? `<ul class="reasons">${item.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
          ${item.feedback ? `<div class="notes"><b>Feedback:</b> ${esc(item.feedback)}</div>` : ''}
          ${item.comments ? `<div class="notes"><b>Comments:</b> ${esc(item.comments)}</div>` : ''}
          ${item.status !== 'sent' && item.error ? `<div class="meta">${esc(item.error)}</div>` : ''}
          <div class="actions">
            <button class="btn" data-act="view">View</button>
            ${needsRedo ? '<button class="btn primary" data-act="resubmit">Resubmit</button>' : ''}
            ${item.status !== 'sent' ? '<button class="btn primary" data-act="retry">Send now</button><button class="btn" data-act="discard">Delete</button>' : ''}
          </div>
        </div>`;
      el.addEventListener('click', (e) => onItem(e, item));
      list.appendChild(el);
    }
  }

  async function onItem(e, item) {
    const act = e.target.closest('[data-act]')?.dataset.act || (e.target.tagName === 'IMG' ? 'view' : null);
    if (!act) return;
    if (act === 'resubmit') {
      resetWizard();
      wiz.lp = item.lp;
      wiz.resubmit = { id: item.id, subject: item.subject, dateCompleted: item.dateCompleted };
      show('upload');
      return;
    }
    if (act === 'view') {
      // Open the tab during the tap, then fill it, so it isn't blocked as a popup.
      const win = window.open('', '_blank');
      try {
        // A Word file or Google Doc is only a PDF once the server has made it one.
        let blob = item.source === 'docx' || item.source === 'gdoc' ? item.serverPdf : item.pdf;
        if (!blob) {
          busy('Opening…');
          const res = await Api.call('file', { studentId: item.studentId, id: item.id });
          blob = new Blob([Uint8Array.from(atob(res.data), c => c.charCodeAt(0))], { type: 'application/pdf' });
          await Store.update(item.id, item.source === 'docx' || item.source === 'gdoc' ? { serverPdf: blob } : { pdf: blob });
        }
        const url = URL.createObjectURL(blob);
        if (win) win.location.href = url; else location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
      } catch (err) {
        if (win) win.close();
        toast(err.message);
      } finally {
        busy(false);
      }
    } else if (act === 'retry') {
      busy('Sending…');
      const r = await send(item);
      busy(false);
      toast(r.ok ? `✅ Uploaded to ${item.lp}!` : r.error);
      renderHistory();
    } else if (act === 'discard') {
      if (confirm('This upload has not been sent. Delete it from this device?')) {
        await Store.remove(item.id);
        renderHistory();
      }
    }
  }

  // ---------- Me ----------

  function renderMe() {
    const s = session.student;
    $('#me-card').innerHTML = `
      <div><div class="meta">Name</div><strong>${esc(s.name || s.firstName || '')}</strong></div>
      <div><div class="meta">Grade</div><strong>${esc(s.grade)}</strong></div>
      <div><div class="meta">Current Learning Period</div><strong>${esc(session.currentLp)}</strong></div>
      ${[1, 2].map(sem => {
        const list = Classes.forLp(s, sem === 1 ? 'LP1' : 'LP5');
        const now = Classes.semOf(session.currentLp) === sem;
        return `<div><div class="meta">Semester ${sem} classes (LP${sem === 1 ? '1 to 4' : '5 to 8'})${now ? ' · now' : ''}</div>
          <div class="class-list">${list.map(c => `<span class="pill">${esc(c.name)}${c.need > 1 ? ' · accelerated' : ''}</span>`).join('') || 'None yet. Ask your ES.'}</div></div>`;
      }).join('')}`;
  }
  // Families share devices, so logging out is one tap from every screen.
  async function logOut() {
    if (!session) return;
    const unsent = (await Store.all()).filter(i => i.studentId === session.student.id && i.status !== 'sent');
    if (unsent.length && !confirm(`You have ${unsent.length} upload(s) that haven’t been sent. They’ll stay on this device and send next time you sign in. Log out?`)) return;
    saveSession(null);
    resetWizard();
    show('login');
    toast('Logged out.');
  }
  $('#sign-out').addEventListener('click', logOut);

  // ---------- Account menu (name in the top bar) ----------

  const menuBtn = $('#account-btn');
  function closeMenu() {
    $('#account-menu').hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
  }
  menuBtn.addEventListener('click', () => {
    const open = $('#account-menu').hidden;
    $('#account-menu').hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) $('#account-menu [role=menuitem]').focus();
  });
  $('#account-menu').addEventListener('click', (e) => {
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    closeMenu();
    if (item.dataset.menu === 'me') show('me');
    if (item.dataset.menu === 'logout') logOut();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#account')) closeMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#account-menu').hidden) { closeMenu(); menuBtn.focus(); }
  });

  // ---------- Little helpers ----------

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; }
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function niceDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return ymd || '';
    return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function shrink(canvas, size, quality) {
    const s = Math.min(1, size / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * s);
    c.height = Math.round(canvas.height * s);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
  const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

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
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  }

  // ---------- Start ----------

  resetWizard();
  show(session ? 'upload' : 'login');
  if (session) {
    refreshSession();
    retryPending();
    syncHistory();
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
