// WiSH ES dashboard: student grid, one student's uploads, and the review viewer
// (approve or redo, annotate with text boxes, finalize into the Approved folder).

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const KEY = 'workit.admin';
  const CONNECT_KEY = 'workit.connect';

  // The copy's "Finish in WiSH" button opens admin.html#connect=<its web app link>.
  const connectTo = /#connect=([^&]+)/.exec(location.hash);
  if (connectTo) {
    try { localStorage.setItem(CONNECT_KEY, decodeURIComponent(connectTo[1])); } catch { /* ignore */ }
    history.replaceState(null, '', location.pathname);
  }

  // Kept for this browser tab only; the real check happens in Code.gs.
  // { role: 'super' | 'es', user, key, url, name, step, mustChange }. 'super' is the main
  // copy's own username and password; an ES signs in through it and gets a key for their copy.
  let creds = readCreds();
  let data = null;          // last overview: { lp, currentLp, lps, reasons, students, items }
  let viewLp = null;        // LP shown on the dashboard
  const studentCache = {};  // studentId -> all of that student's uploads
  let currentStudent = null;
  let studentLp = null;     // LP chip on the student page ('all' or LPx)

  // Dashboard requests go to this account's own copy; '' is the main copy.
  const call = (action, payload = {}) =>
    Api.call(action, { adminUser: creds && creds.user, adminKey: creds && creds.key, ...payload }, { url: (creds && creds.url) || '' });
  // Sign-in, ES accounts and setup progress live in the main copy.
  const mainCall = (action, payload = {}) => Api.call(action, payload, { url: '' });

  // ---------- Sign in ----------

  // Forgot password: an ES gets a temporary password by email. (Your own is in the script.)
  const showForgot = (on) => {
    $('#admin-login').hidden = on;
    $('#forgot-form').hidden = !on;
    $('#forgot-done').hidden = true;
    if (on) $('#forgot-form').who.value = $('#admin-login').username.value.trim();
  };
  $('#forgot-open').addEventListener('click', () => showForgot(true));
  $('#forgot-back').addEventListener('click', () => showForgot(false));
  $('#forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    busy('Sending…');
    try {
      const res = await mainCall('esForgot', { who: e.target.who.value.trim(), link: location.origin + location.pathname });
      $('#forgot-done').textContent = res.message;
      $('#forgot-done').hidden = false;
    } catch (err) {
      toast(/unknown request/i.test(err.message) ? 'Password reset starts working after the next WiSH update.' : err.message);
    } finally {
      busy(false);
    }
  });

  $('#admin-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = e.target.username.value.trim(), pass = e.target.password.value;
    busy('Signing in…');
    try {
      let res;
      try {
        res = await mainCall('esLogin', { user, pass });
      } catch (err) {
        // A main copy from before ES accounts only knows its own username and password.
        if (!/Unknown request/i.test(err.message)) throw err;
        res = { role: 'super' };
      }
      creds = res.role === 'super'
        ? { role: 'super', user, key: pass }
        : { role: 'es', user: res.user, key: res.key, url: res.scriptUrl, name: res.name, step: res.step, mustChange: res.mustChange };
      if (creds.role === 'super') await loadOverview();
      saveCreds(creds);
      e.target.reset();
      $('#toast').hidden = true;
      if (creds.role === 'es') await startEs();
    } catch (err) {
      creds = null;
      saveCreds(null);
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  $('#admin-signout').addEventListener('click', signOut);
  function signOut() {
    creds = null;
    datesFollowed = false;
    saveCreds(null);
    data = null;
    currentStudent = null;
    Core.reset();
    Meetings.reset();
    show('login');
  }

  // An ES goes through the setup steps until they're done, then gets the dashboard.
  async function startEs() {
    const pending = localStorage.getItem(CONNECT_KEY);
    if (pending && !creds.mustChange) {
      localStorage.removeItem(CONNECT_KEY);
      return Setup.connect(pending);
    }
    if (creds.mustChange || !creds.url || (creds.step || 0) < Setup.STEPS) return Setup.open();
    await loadOverview();
  }

  function show(name) {
    $$('.screen').forEach(s => { s.hidden = s.id !== `screen-${name}`; });
    $('#admin-controls').hidden = name === 'login' || name === 'setup';
    const role = creds && creds.role;
    $('#open-accounts').hidden = role !== 'super';
    $('#open-setup').hidden = role !== 'es';
    $('#user-name').textContent = role === 'es' ? (creds.name || creds.user || 'ES') : 'Admin';
    closeUserMenu();
    window.scrollTo(0, 0);
  }

  // The name in the top bar opens a small menu: Settings and Sign out.
  function closeUserMenu() {
    $('#user-menu').hidden = true;
    $('#user-btn').setAttribute('aria-expanded', 'false');
  }
  $('#user-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $('#user-menu').hidden;
    $('#user-menu').hidden = !open;
    $('#user-btn').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.user-menu')) closeUserMenu(); });
  // Esc goes back one screen: it closes the name menu first, leaves a text box
  // on the first press, and otherwise works like the page's "← Back" button.
  // The sample viewer and pop-ups handle their own Esc.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (!$('#user-menu').hidden) { closeUserMenu(); return; }
    if (!$('#viewer').hidden || document.querySelector('dialog[open]')) return;
    const a = document.activeElement;
    if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) { a.blur(); return; }
    const screen = $$('.screen').find(s => !s.hidden);
    const back = screen && [...screen.querySelectorAll('.back-link, #forgot-back')].find(b => b.offsetParent);
    if (back) { e.preventDefault(); back.click(); }
  });

  // WiSH in the top bar always goes back to the dashboard home.
  $('#brand-home').addEventListener('click', (e) => {
    e.preventDefault();
    if (!creds || !data || !$('#screen-setup').hidden || !$('#screen-login').hidden) return;
    if (!$('#screen-roster').hidden && rosterDirty && !confirm('You have unsaved changes to the student list. Leave without saving?')) return;
    currentStudent = null;
    renderDash();
    show('dash');
  });

  // ---------- Loading ----------

  async function loadOverview(lp, { stay = false } = {}) {
    busy('Loading…');
    try {
      data = keepRecent(await call('adminOverview', { lp }));
      viewLp = data.lp;
      renderControls();
      renderDash();
      if (!currentStudent && !stay) show('dash');
    } finally {
      busy(false);
    }
    // Bookings come from the calendar, which can be slow, so they fill in afterwards.
    Meetings.load().then(() => redrawMeetings()).catch(() => {});
    // Checked once per visit, after the dashboard is already showing.
    if (creds && creds.role === 'es' && !datesFollowed) {
      datesFollowed = true;
      followSchoolDates().then(() => { renderControls(); renderDash(); }).catch(() => { datesFollowed = false; });
    }
  }
  let datesFollowed = false;

  // LP dates are the same for every ES, so an ES copy takes the main copy's dates each time
  // its dashboard loads. A new ES also starts on the main copy's current LP.
  async function followSchoolDates() {
    let school;
    try {
      school = await mainCall('schoolDates');
    } catch (err) {
      return;  // a main copy from before shared dates
    }
    const dates = school.lpDates || {};
    if (!Object.keys(dates).length) return;
    const have = data.lpDates || {};
    const same = data.lps.every(lp => JSON.stringify(dates[lp] || null) === JSON.stringify(have[lp] || null)) &&
      (!school.holidays || JSON.stringify(school.holidays) === JSON.stringify(data.holidays || []));
    if (!same) {
      const res = await call('adminSetLpDates', { dates, ...(school.holidays ? { holidays: school.holidays } : {}) });
      data.lpDates = res.lpDates;
      if (res.holidays) data.holidays = res.holidays;
    }
    if ((creds.step || 0) < 6 && school.currentLp && school.currentLp !== data.currentLp) {
      await call('adminSetLp', { lp: school.currentLp });
      data.currentLp = school.currentLp;
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
      await loadOverview(lp, { stay: true });
    } catch (err) {
      e.target.value = data.currentLp;
      toast(err.message);
    }
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
    Core.whenReady(() => { if (!$('#screen-dash').hidden) renderDash(); });
    Core.side(viewLp);
    const range = (data.lpDates || {})[viewLp];
    $('#dash-title').textContent = [range ? `${niceDate(range.start)} – ${niceDate(range.end)}` : '', viewLp === data.currentLp ? 'current LP' : ''].filter(Boolean).join(' · ');
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
      Meetings.tile(viewLp, data.students),
    ].filter(Boolean).map(([cls, n, label]) => `<div class="tile ${cls}"><b>${n}</b><span>${esc(label)}</span></div>`).join('');

    const q = $('#student-search').value.trim().toLowerCase();
    const grid = $('#student-grid');
    grid.innerHTML = '';
    const students = data.students
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name) || a.name.localeCompare(b.name));
    if (!students.length) {
      grid.innerHTML = `<div class="empty">${data.students.length ? 'No student matches that.' : 'No students yet. Add them in the Students tab of the WiSH Admin sheet.'}</div>`;
      return;
    }
    for (const s of students) {
      const mine = items.filter(i => i.studentId === s.id).sort((a, b) => b.receivedAt - a.receivedAt);
      const by = { new: 0, approved: 0, finalized: 0, redo: 0, resubmitted: 0 };
      mine.forEach(i => by[status(i)]++);
      const card = document.createElement('div');
      // Light blue once every class has its samples and every upload is annotated and filed.
      const classes = Classes.forLp(s, viewLp);
      // The bar is out of the samples this LP needs, so the empty part is what's still missing.
      const needed = classes.reduce((n, c) => n + c.need, 0);
      const allFiled = mine.length > 0 && by.finalized === mine.length &&
        classes.every(c => mine.filter(i => i.subject === c.name).length >= c.need);
      card.className = `scard ${by.redo ? 'has-redo' : ''} ${allFiled ? 'all-filed' : ''} ${s.active === false ? 'inactive' : ''}`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });
      // Sem 1 classes for LP1-4, Sem 2 for LP5-8; an accelerated class needs 2 samples.
      const subjects = classes.map(c => {
        const n = mine.filter(i => i.subject === c.name && !(i.redo && !i.resubmitted)).length;
        const label = ''; // no counts on the class names; the color shows done, partly done or missing
        return `<span class="subj ${n >= c.need ? '' : n ? 'short' : 'missing'}" title="${esc(c.name)}: ${c.need > 1 ? 'accelerated, 2 samples per LP' : '1 sample per LP'}" data-short="${esc(shortClass(c.name) + label)}">${esc(className(c.name))}${label}</span>`;
      }).join('');
      const thumbs = mine.slice(0, mine.length > 6 ? 5 : 6).map(i =>
        `<img src="${esc(i.thumb || blankThumb())}" alt="${esc(i.subject)}" class="st-${status(i)}" data-id="${esc(i.id)}">`).join('') +
        (mine.length > 6 ? `<span class="more">+${mine.length - 5}</span>` : '');
      card.innerHTML = `
        <div class="top"><h3>${esc(s.name)}</h3>${s.active === false ? '<span class="sid off" title="Can sign in, but can’t turn in work and gets no reminders">Inactive</span>' : ''}<span class="sid">Grade ${esc(s.grade)}</span></div>
        <div class="bar" aria-hidden="true">${['finalized', 'approved', 'resubmitted', 'redo', 'new'].map(k =>
          by[k] ? `<i class="${k}" style="width:${(by[k] / Math.max(mine.length, needed)) * 100}%"></i>` : '').join('')}</div>
        <div class="card-uploads">${mine.length ? `
          <div class="counts"><b>${mine.length}</b> upload${mine.length > 1 ? 's' : ''} ·
            ${by.new} to review · <span class="${annotatedCount(s.id, viewLp) >= ANNOTATED_NEEDED ? 'met' : ''}">${annotatedCount(s.id, viewLp)} of ${ANNOTATED_NEEDED} annotated</span>${by.redo ? ` · <b style="color:var(--st-redo)">${by.redo} redo</b>` : ''}</div>
          <div class="thumbs">${thumbs}</div>`
        : `<div class="counts">No uploads in ${esc(viewLp)} yet</div>`}</div>
        ${subjects ? `<div class="subjects" style="--rows:${Math.ceil(classes.length / 2)}">${subjects}</div>` : ''}
        <div class="card-foot">${Meetings.cardLine(s.id, viewLp)}</div>`;
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
    fitClasses();
    evenUploads();
  }

  // The upload area is as tall on every card as on the tallest, so class lists all start at the same height.
  function evenUploads() {
    const boxes = $$('#student-grid .card-uploads');
    boxes.forEach(b => { b.style.minHeight = ''; });
    const h = Math.max(0, ...boxes.map(b => b.offsetHeight));
    boxes.forEach(b => { b.style.minHeight = h ? h + 'px' : ''; });
  }
  let evenTimer = null;
  window.addEventListener('resize', () => { clearTimeout(evenTimer); evenTimer = setTimeout(() => { fitClasses(); evenUploads(); }, 150); });

  // Class names on the cards: the full name ("8th Grade English H"; the A/B semester part left off).
  // Only a name that doesn't fit is shortened, word by word ("8th Gr Eng H"). Full name in the tooltip.
  const WORD_SHORT = {
    english: 'Eng', algebra: 'Alg', geometry: 'Geo', biology: 'Bio', chemistry: 'Chem', physics: 'Phys', history: 'His',
    government: 'Govt', economics: 'Econ', calculus: 'Calc', statistics: 'Stat', science: 'Sci', spanish: 'Span', french: 'Fren',
    world: 'Wor', functional: 'Func', mathematics: 'Math', physical: 'Phys', education: 'Ed', marine: 'Mar', literature: 'Lit',
    language: 'Lang', integrated: 'Int', environmental: 'Env', american: 'Amer', precalculus: 'PreCalc', photography: 'Photo',
    grade: 'Gr', honors: 'H', technology: 'Tech',
  };
  // Course Catalog titles are used as they are (A/B semester letter included).
  function className(name) {
    return String(name || '').trim();
  }
  function shortWord(w) {
    if (/^a-?g$/i.test(w)) return 'ag';
    if (/^\d/.test(w) || w.length <= 4 || w === w.toUpperCase()) return w;
    if (/^pre-?calc/i.test(w)) return 'PreCalc';
    const known = WORD_SHORT[w.toLowerCase()];
    if (known) return known;
    return w.charAt(0).toUpperCase() + w.slice(1, 4);
  }
  function shortClass(name) {
    return className(name).replace(/\s*\(.*?\)/g, '').replace(/american sign language/i, 'ASL').split(/\s+/).filter(w => !/^(and|of|the|&)$/i.test(w)).map(shortWord).join(' ');
  }
  // After the cards are drawn: shorten only the class names that don't fit their space.
  function fitClasses() {
    $$('#student-grid .subj[data-short]').forEach(el => {
      if (!el.dataset.full) el.dataset.full = el.textContent;
      el.textContent = el.dataset.full;
      if (el.scrollWidth > el.clientWidth + 1) el.textContent = el.dataset.short;
    });
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
    // The page shows right away from the dashboard's list; the rest fills in when it arrives.
    if (!studentCache[id] && loadingStudent !== id) {
      loadingStudent = id;
      renderStudent();
      try {
        studentCache[id] = keepRecent({ items: (await call('adminStudent', { studentId: id })).items }).items;
      } catch (err) {
        toast(err.message);
      } finally {
        if (loadingStudent === id) loadingStudent = null;
      }
      if (currentStudent && currentStudent.id === id) renderStudent();
    }
  }
  let loadingStudent = null;

  function studentItems() {
    const all = studentCache[currentStudent.id] || data.items.filter(i => i.studentId === currentStudent.id);
    return all.filter(i => studentLp === 'all' || i.lp === studentLp).sort((a, b) => b.receivedAt - a.receivedAt);
  }

  function renderStudent() {
    const s = currentStudent;
    $('#student-head').innerHTML = `<h1>${esc(s.name)}</h1>
      <div class="meta">Grade ${esc(s.grade)}</div>
      ${[1, 2].map(sem => {
        const list = Classes.forLp(s, sem === 1 ? 'LP1' : 'LP5');
        return `<div class="meta sem-line"><b>Sem ${sem}</b> (LP${sem === 1 ? '1–4' : '5–8'}): ${list.map(c => esc(c.name) + (c.need > 1 ? ' <i>(accelerated, 2 per LP)</i>' : '')).join(', ') || 'No classes set'}${sem === 2 && s.sem2Typed === false && list.length ? ' <i>(from Sem 1)</i>' : ''}</div>`;
      }).join('')}`;
    Core.studentPage(s, studentLp);
    $('#student-lps').innerHTML = ['all', ...data.lps].map(lp => `
      <button class="chip ${studentLp === lp ? 'active' : ''}" data-lp="${lp}">${lp === 'all' ? 'All' : lp}${lp === data.currentLp ? ' •' : ''}</button>`).join('');
    renderClassCheck(s);
    Meetings.studentCard(s);
    const items = studentItems();
    const grid = $('#upload-grid');
    if (!items.length) {
      grid.innerHTML = loadingStudent === s.id && studentLp !== viewLp
        ? '<div class="empty">Loading uploads…</div>'
        : `<div class="empty">No uploads ${studentLp === 'all' ? 'yet' : `in ${studentLp}`}.</div>`;
      return;
    }
    grid.innerHTML = items.map((i, idx) => `
      <button class="utile st-${status(i)}" data-idx="${idx}">
        ${i.thumb ? `<img src="${esc(i.thumb)}" alt="">` : '<div class="noimg">📄</div>'}
        <span class="cap">
          <span class="tag">${statusLabel(i)}</span>
          <strong>${esc(i.subject)}</strong>
          <span class="meta">${esc(i.lp)} · ${esc(dayDate(i.dateCompleted))}${offDay(i.dateCompleted) ? ` <b class="off-day" title="Not a school day">⚠ ${esc(offDay(i.dateCompleted))}</b>` : ''}${i.score ? ` · ${esc(i.score)}` : ''}</span>
        </span>
      </button>`).join('');
  }
  // For the LP being viewed: every class this student takes then, and whether it has a sample.
  function renderClassCheck(s) {
    const box = $('#student-classes');
    if (studentLp === 'all' || (loadingStudent === s.id && studentLp !== viewLp)) { box.hidden = true; return; }
    const classes = Classes.forLp(s, studentLp);
    const all = studentCache[s.id] || data.items.filter(i => i.studentId === s.id);
    const mine = all.filter(i => i.lp === studentLp && !(i.redo && !i.resubmitted));
    let short = 0;
    const rows = classes.map(c => {
      const got = mine.filter(i => i.subject === c.name).sort((a, b) => b.receivedAt - a.receivedAt);
      const ok = got.length >= c.need;
      if (!ok) short++;
      const count = c.need > 1 ? ` <span class="cc-count">${Math.min(got.length, c.need)} of ${c.need}</span>` : '';
      const redo = !got.length && all.some(i => i.lp === studentLp && i.subject === c.name && i.redo && !i.resubmitted);
      const when = got.length ? `Turned in ${got.map(i => esc(niceDate(i.dateCompleted))).join(', ')}` : redo ? 'Waiting on a redo' : 'No sample yet';
      return `<li class="${ok ? 'ok' : got.length ? 'short' : 'no'}"><span class="cc-mark">${ok ? '✓' : '✗'}</span><b>${esc(c.name)}</b>${count}<small>${when}</small></li>`;
    });
    box.innerHTML = `<h2>${esc(studentLp)} work samples <span class="meta">${classes.length ? (short ? `${short} of ${classes.length} classes missing` : 'every class has a sample') : ''}</span></h2>
      ${classes.length ? `<ul class="cc-list">${rows.join('')}</ul>` : '<p class="meta">No classes set for this semester.</p>'}`;
    box.hidden = false;
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

  // Approve/Redo changes made in the last few minutes win over a list that comes back from
  // Google, which can be a moment behind (it was read just before the change was saved).
  const recent = new Map();
  const RECENT_MS = 6 * 60 * 1000;
  function keepRecent(res) {
    const now = Date.now();
    for (const [k, v] of recent) if (now - v.at > RECENT_MS) recent.delete(k);
    for (const it of (res && res.items) || []) {
      const mine = recent.get(it.studentId + '|' + it.id);
      if (mine) Object.assign(it, mine.fields);
    }
    return res;
  }

  // The same upload can be in the overview and the student cache; keep them matching.
  function syncCaches(item, fields) {
    if (fields.includes('redo')) {
      const f = {};
      for (const k of fields) f[k] = Array.isArray(item[k]) ? item[k].slice() : item[k];
      recent.set(item.studentId + '|' + item.id, { fields: f, at: Date.now() });
    }
    for (const arr of [data.items, studentCache[item.studentId] || []]) {
      const other = arr.find(i => i.id === item.id && i.studentId === item.studentId);
      if (other && other !== item) for (const f of fields) other[f] = item[f];
    }
  }

  // Forget a sample everywhere the dashboard keeps it.
  function dropItem(it) {
    const same = (i) => i.id === it.id && i.studentId === it.studentId;
    data.items = data.items.filter(i => !same(i));
    const cached = studentCache[it.studentId];
    if (cached) studentCache[it.studentId] = cached.filter(i => !same(i));
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
    let pen = false;                 // ✏️ Pen: drag on a page to write by hand
    const PEN_PT = 2.5;
    let hist = { id: null, stack: [], last: '', t: 0, sel: -2 }; // Undo, per upload

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
      if (!dropDraft()) return;
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
      if (!dropDraft()) return;
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
          // A PDF WiSH didn't make (a converted Word file): draw its pages so they can be annotated too.
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
          <div><span>Student</span>${esc(student ? student.name : it.name)}</div>
          <div><span>Learning Period</span>${esc(it.lp)}</div>
          <div class="${offDay(it.dateCompleted) ? 'page-flag' : ''}"><span>Date completed</span>${esc(dayDate(it.dateCompleted))}${offDay(it.dateCompleted) ? ` <small>(${esc(offDay(it.dateCompleted))})</small>` : ''}</div>
          <div><span>Grade / score</span><strong>${esc(it.score || '—')}</strong></div>
          <div><span>Minutes spent</span>${esc(it.minutes || '—')}</div>
          <div><span>Pages</span>${it.pageCount}</div>
          <div><span>Uploaded</span>${esc(new Date(it.receivedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</div>
          ${it.pageDate || it.pageCheck ? `<div class="${/typed|not found|not checked/.test(it.pageCheck || '') ? 'page-flag' : ''}"><span>Date on page</span>${it.pageDate ? esc(niceDate(it.pageDate)) : '—'}${it.pageCheck && it.pageCheck !== 'date read' ? ` <small>(${esc(it.pageCheck)})</small>` : ''}</div>` : ''}
        </div>
        ${it.feedback ? `<div class="info-text"><span>Feedback</span>${esc(it.feedback)}</div>` : ''}
        <div class="info-text"><span>Comments</span>${esc(it.comments || '—')}</div>
        ${it.familyNotes && it.familyNotes.length ? `<p class="meta family-line">✏️ The student or family added ${it.familyNotes.length} text box${it.familyNotes.length > 1 ? 'es' : ''} on the pages (marked Family). You can change or delete them like your own, and they’re included when you export.</p>` : ''}
        ${it.resubmitOf ? `<p class="meta">↺ Resubmission${original ? ` of the ${esc(niceDate(original.dateCompleted))} upload` : ''}.</p>` : ''}
        ${it.resubmitted ? '<p class="meta">The student has resubmitted this. The new version is in their uploads.</p>' : ''}
`;
    }

    function renderReview(it) {
      const finalized = !!it.finalizedAt;
      $('#t-approve').setAttribute('aria-pressed', String(!!it.approved));
      $('#t-approve').innerHTML = it.approved
        ? `✓ Approved${it.approvedAt ? `<small>${esc(stamp(it.approvedAt))}</small>` : ''}` : '✓ Approve';
      // Redo is picked first (a draft only you see), then sent with Send back to student.
      const redoing = !!it.redo || !!it.redoDraft;
      $('#t-redo').setAttribute('aria-pressed', String(redoing));
      $('#t-redo').innerHTML = it.redo
        ? `↺ Sent back${it.redoSentAt ? `<small>${esc(daysAgo(it.redoSentAt))} · ${esc(stamp(it.redoSentAt))}</small>` : ''}` : '↺ Redo';
      $('#reasons-box').hidden = !redoing;
      $('#reasons').innerHTML = data.reasons.map(r => `
        <button class="reason" aria-pressed="${(it.reasons || []).includes(r)}" data-reason="${esc(r)}" ${it.redo ? 'disabled' : ''}>${esc(r)}</button>`).join('');
      // Don't reset the box while it's being typed in.
      if (document.activeElement !== $('#redo-note')) $('#redo-note').value = it.redoNote || '';
      $('#redo-note').disabled = !!it.redo;
      $('#redo-hint').textContent = it.redo
        ? 'This was sent back to the student. To change the reasons, click Redo to take it back, then pick Redo again.'
        : 'Why does it need a redo? Pick all that apply, and type your own reason if you like. Nothing goes to the student until you click Send back to student.';
      $('#t-send').hidden = !!it.redo;
      $('#t-send').disabled = !hasReason(it);
      // Annotate works any time except on a redo; filing needs Approve first.
      $('#finish-row').hidden = redoing;
      $('#t-annotate').disabled = redoing;
      $('#t-annotate').setAttribute('aria-pressed', String(annotating));
      $('#t-annotate').textContent = annotating ? '✓ Done annotating' : '✏️ Annotations';
      const asExtra = finalized && it.filedAs === 'Extra';
      const asAnnotated = finalized && !asExtra;
      const filed = it.finalizedAt ? `<small>${esc(stamp(it.finalizedAt))}</small>` : '';
      $('#t-finalize').innerHTML = asAnnotated ? (it.finalStale ? '🏁 Update annotated copy' : '✓ Exported as Annotated') + filed : '🏁 Export as Annotated';
      $('#t-extra').innerHTML = asExtra ? '✓ Exported as Extra' + filed : '📁 Export as Extra';
      $('#t-extra').disabled = asExtra || !it.approved;
      $('#t-finalize').disabled = !it.approved;
      const n = annotatedCount(it.studentId, it.lp);
      const fs = $('#final-state');
      fs.className = `final-state ${finalized ? (it.finalStale ? 'stale' : 'done') : ''}`;
      fs.innerHTML = redoing ? ''
        : !it.approved ? 'You can annotate now. Click ✓ Approve when it’s ready, then Export as Annotated or Export as Extra.'
        : `<span class="anno-count ${n >= ANNOTATED_NEEDED ? 'met' : ''}">${esc(it.lp)} annotated samples: ${n} of ${ANNOTATED_NEEDED}${n >= ANNOTATED_NEEDED ? ' ✓' : ''}</span>` +
          (!finalized ? `Annotate and Export as Annotated to save it to Approved › ${esc(it.lp)} Annotated, or Export as Extra to save it as is to ${esc(it.lp)} Extra.`
          : `${it.finalStale ? 'You changed the annotations after exporting. Click Update annotated copy to save them.' : ''}
           <button type="button" class="btn small undo-export" data-unfile>↶ Undo export</button>`) +
        (it.oldExports || []).map(x => `<span class="old-export">↶ Taken back: the ${esc(x.filedAs)} copy${x.exportedAt ? ` from ${esc(stamp(x.exportedAt))}` : ''}.
          <button type="button" class="btn small" data-putback="${esc(x.fileId)}">Put it back</button></span>`).join('');
      renderFiles(it);
      Core.panel(it);
    }

    // Google Drive links for this sample: its files, and the LP's three folders, with the one
    // holding this sample's exported copy marked. Folder links come once per LP.
    const folderLinks = {};
    function renderFiles(it) {
      const box = $('#files-row');
      const f = folderLinks[it.lp];
      if (f === undefined) {
        folderLinks[it.lp] = null;
        call('adminFolders', { lp: it.lp })
          .then(res => { folderLinks[it.lp] = res; })
          .catch(() => { folderLinks[it.lp] = false; }) // a WiSH from before folder links
          .then(() => { if (item() === it) renderFiles(it); });
      }
      const link = (url, icon, label, cls = '') => url
        ? `<a class="drive-chip ${cls}" href="${esc(url)}" target="_blank" rel="noopener"><span aria-hidden="true">${icon}</span>${esc(label)}</a>` : '';
      const exported = it.finalizedAt ? (it.filedAs === 'Extra' ? 'extra' : 'annotated') : '';
      const files = [
        link(it.fileUrl, '📄', 'Original'),
        it.finalizedAt ? link(it.finalUrl, '📄', `Exported (${it.filedAs || 'Annotated'})`) : '',
      ].join('');
      const folders = f ? [
        link(f.uploads, '📁', 'Uploads'),
        link(f.annotated, '📁', 'Annotated', exported === 'annotated' ? 'here' : ''),
        link(f.extra, '📁', 'Extra', exported === 'extra' ? 'here' : ''),
      ].join('') : '';
      box.innerHTML = `<span class="files-label">Files in Google Drive</span><div class="drive-chips">${files}</div>` +
        (folders ? `<span class="files-label">${esc(it.lp)} folders</span><div class="drive-chips">${folders}</div>` : '');
      box.hidden = !files && !folders;
    }

    // ----- Approve / redo (saved a moment after the last click) -----

    function changeReview(fn, wait = 500) {
      const it = item();
      fn(it);
      if (it.redo) it.approved = false;
      if (!it.redo) { it.reasons = []; it.redoNote = ''; }
      if (it.redo) setAnnotating(false);
      syncCaches(it, ['approved', 'approvedAt', 'redo', 'reasons', 'redoNote', 'redoSentAt']);
      renderReview(it);
      $('#v-save').textContent = 'Saving…';
      clearTimeout(reviewTimer);
      reviewTimer = setTimeout(() => saveReview(it), wait);
    }
    async function saveReview(it) {
      reviewTimer = null;
      try {
        await call('adminReview', { studentId: it.studentId, id: it.id, approved: !!it.approved, redo: !!it.redo, reasons: it.reasons || [], note: it.redoNote || '' });
        if (item() === it) $('#v-save').textContent = 'Saved ✓';
        return true;
      } catch (err) {
        recent.delete(it.studentId + '|' + it.id);
        if (item() === it) $('#v-save').textContent = 'Not saved';
        toast(`Couldn’t save: ${err.message}`);
        return false;
      }
    }
    function flushSaves() {
      if (reviewTimer) { clearTimeout(reviewTimer); saveReview(item()); }
      if (annoTimer) { clearTimeout(annoTimer); saveAnnotations(item()); }
    }

    // "today", "yesterday", "3 days ago" (calendar days).
    function daysAgo(ms) {
      const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
      const n = Math.round((day(Date.now()) - day(ms)) / 86400000);
      return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
    }
    function stamp(ms) {
      return new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function hasReason(it) { return (it.reasons || []).length > 0 || !!String(it.redoNote || '').trim(); }
    // A redo that was picked but not sent: leaving the sample drops it (after asking, if reasons were picked).
    function dropDraft() {
      const it = item();
      if (!it || !it.redoDraft) return true;
      if (hasReason(it) && !confirm('You picked redo reasons but didn’t send them. Leave without sending this back to the student?')) return false;
      it.redoDraft = false; it.reasons = []; it.redoNote = '';
      return true;
    }

    // An exported sample can still be taken back: un-approving or sending it back for a redo
    // moves the exported copy to Drive's trash (Code.gs unfile_). The annotations stay.
    const exportedAs = (it) => `${it.lp} ${it.filedAs === 'Extra' ? 'Extra' : 'Annotated'}`;
    function unfiled(it) {
      Object.assign(it, { finalizedAt: 0, finalUrl: '', filedAs: '', finalStale: false });
      syncCaches(it, ['finalizedAt', 'finalUrl', 'filedAs', 'finalStale']);
      Core.filed({ ...it, finalizedAt: 0 });
    }
    $('#t-approve').addEventListener('click', () => {
      const it = item();
      if (it.finalizedAt && it.approved) {
        if (!confirm(`Take back the approval? The exported copy in Approved › ${exportedAs(it)} moves to WiSH’s Trash (you can put it back for 60 days), and this goes back to To review. Your annotations stay.`)) return;
        unfiled(it);
        return changeReview(i => { i.redoDraft = false; i.approved = false; i.approvedAt = 0; }, 0);
      }
      changeReview(i => {
      i.redoDraft = false;
      i.approved = !i.approved;
      i.approvedAt = i.approved ? Date.now() : 0;
      if (i.approved) { i.redo = false; i.redoSentAt = 0; }
      });
    });
    $('#t-redo').addEventListener('click', () => {
      const it = item();
      if (it.redo) {
        if (!confirm('Take back this redo? The student won’t see it anymore.')) return;
        return changeReview(i => { i.redo = false; i.redoSentAt = 0; }, 0);
      }
      if (!it.redoDraft && it.finalizedAt && !confirm(`This was exported to Approved › ${exportedAs(it)}. Send it back for a redo? When you click Send back to student, the exported copy moves to WiSH’s Trash, where you can put it back for 60 days. Your annotations stay.`)) return;
      it.redoDraft = !it.redoDraft;
      it.reasons = []; it.redoNote = '';
      if (it.redoDraft) setAnnotating(false);
      renderReview(it);
      if (it.redoDraft) $('#reasons-box').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    $('#reasons').addEventListener('click', (e) => {
      const b = e.target.closest('.reason');
      const it = item();
      if (!b || !it.redoDraft) return;
      const set = new Set(it.reasons || []);
      set.has(b.dataset.reason) ? set.delete(b.dataset.reason) : set.add(b.dataset.reason);
      it.reasons = data.reasons.filter(x => set.has(x));
      renderReview(it);
    });
    $('#redo-note').addEventListener('input', (e) => {
      const it = item();
      if (!it.redoDraft) return;
      it.redoNote = e.target.value;
      $('#t-send').disabled = !hasReason(it);
    });
    $('#t-send').addEventListener('click', async () => {
      const it = item();
      if (!it.redoDraft || !hasReason(it)) return;
      clearTimeout(reviewTimer);
      const wasFiled = it.finalizedAt ? { finalizedAt: it.finalizedAt, finalUrl: it.finalUrl, filedAs: it.filedAs, approved: it.approved, approvedAt: it.approvedAt } : null;
      if (wasFiled) unfiled(it);
      it.redoDraft = false; it.redo = true; it.approved = false; it.approvedAt = 0; it.redoSentAt = Date.now();
      syncCaches(it, ['approved', 'redo', 'reasons', 'redoNote', 'redoSentAt']);
      renderReview(it);
      $('#t-send').disabled = true;
      $('#v-save').textContent = 'Sending…';
      if (!(await saveReview(it))) {
        it.redoDraft = true; it.redo = false; it.redoSentAt = 0;
        if (wasFiled) { Object.assign(it, wasFiled); syncCaches(it, ['finalizedAt', 'finalUrl', 'filedAs', 'approvedAt']); Core.filed(it); }
        syncCaches(it, ['approved', 'redo', 'reasons', 'redoNote', 'redoSentAt']);
        if (item() === it) renderReview(it);
      } else if (item() === it) $('#v-save').textContent = 'Sent ✓';
    });

    // ----- Annotating -----

    function setAnnotating(on, { header: withHeader = true } = {}) {
      annotating = on && !!item() && !item().redo && !item().redoDraft;
      $('#v-pages').classList.toggle('annotating', annotating);
      $('#anno-bar').hidden = !annotating;
      $('#anno-hint').hidden = !annotating;
      if (!annotating) { select(-1); setPen(false); }
      const header = annotating && withHeader && addHeader(item());
      if (item()) {
        renderAnnotations(); // switches text boxes between editable and read-only
        renderReview(item());
      }
      if (header) changed();
    }

    // Annotating an upload starts with a header box on page 1: the student's full name and
    // class, then blank lines for the ES to fill in. It comes back whenever it's missing,
    // except right after the ES deletes it; "＋ Annotation" adds it back any time.
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

    // The family's own text boxes and pen marks join the ES's list (marked family) so the ES
    // can change them too; they're saved back to the family's column.
    function mergeFamily(it) {
      if (it._famMerged) return;
      it.annotations = [...(it.annotations || []), ...(it.familyNotes || []).map(a => ({ ...a, family: true }))];
      it._famMerged = true;
      it._famJson = JSON.stringify(it.familyNotes || []);
    }
    const esOnly = (list) => list.filter(a => !a.family);
    const famOnly = (list) => list.filter(a => a.family).map(({ family, ...a }) => a);

    function renderAnnotations() {
      const it = item();
      if (!it.annotations) return;
      mergeFamily(it);
      if (hist.id !== it.id) hist = { id: it.id, stack: [], last: JSON.stringify(it.annotations), t: 0, sel: -2 };
      $$('#v-pages .anno-layer').forEach(l => { l.innerHTML = ''; });
      const tagged = new Set();
      it.annotations.forEach((a, i) => {
        const layer = $(`#v-pages .page-wrap[data-page="${a.page}"] .anno-layer`);
        if (!layer) return;
        if (!Ink.is(a)) return layer.appendChild(makeBox(a, i));
        Ink.show(layer, a, i, a.family ? 'family' : '');
        if (a.family && !tagged.has(a.page)) {
          tagged.add(a.page);
          const b = Ink.bbox(a), tag = document.createElement('span');
          tag.className = 'family-tag ink-tag';
          tag.textContent = 'Family ✏️';
          Object.assign(tag.style, { left: `${b.x0 * 100}%`, top: `${b.y0 * 100}%` });
          layer.appendChild(tag);
        }
      });
      select(selected);
    }

    // Undo: each change keeps the step before it (typing in one box counts as one step).
    function remember(it) {
      const cur = JSON.stringify(it.annotations);
      if (hist.id !== it.id || cur === hist.last) return;
      const now = Date.now();
      if (now - hist.t > 1200 || hist.sel !== selected) hist.stack.push(hist.last);
      if (hist.stack.length > 100) hist.stack.shift();
      hist.last = cur;
      hist.t = now;
      hist.sel = selected;
    }
    function undo() {
      const it = item();
      if (!it || hist.id !== it.id || !hist.stack.length) return;
      hist.last = hist.stack.pop();
      hist.t = 0;
      it.annotations = JSON.parse(hist.last);
      selected = -1;
      renderAnnotations();
      changed();
    }

    function makeBox(a, i) {
      const box = document.createElement('div');
      box.className = `anno ${a.family ? 'family' : ''} ${i === selected ? 'selected' : ''}`;
      box.dataset.i = i;
      if (a.family) box.title = 'Added by the student or family';
      applyStyle(box, a);
      box.innerHTML = (a.family ? '<span class="family-tag">Family</span>' : '') +
        '<span class="grip" title="Drag to move">⠿</span><div class="txt"></div><span class="resize" title="Drag to resize"></span>' +
        '<button type="button" class="box-x" title="Delete this text box" aria-label="Delete this text box">✕</button>';
      const txt = $('.txt', box);
      txt.textContent = a.text;
      txt.contentEditable = String(annotating);
      txt.addEventListener('focus', () => select(i, false));
      $('.box-x', box).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      $('.box-x', box).addEventListener('click', (e) => { e.stopPropagation(); select(i); removeSelected(); });
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

    function select(i) {
      selected = i;
      $$('#v-pages .anno').forEach(b => b.classList.toggle('selected', Number(b.dataset.i) === i));
      $$('#v-pages .ink-mark').forEach(g => g.classList.toggle('selected', Number(g.dataset.i) === i));
      $$('#v-pages .ink-x').forEach(x => x.remove());
      const a = item() && item().annotations && item().annotations[i];
      if (annotating && Ink.is(a)) {
        const layer = $(`#v-pages .page-wrap[data-page="${a.page}"] .anno-layer`);
        if (layer) Ink.deleteButton(layer, a, removeSelected);
      }
      syncToolbar();
    }

    function syncToolbar() {
      const a = item() && item().annotations && item().annotations[selected];
      const s = a && !Ink.is(a) ? a : { ...style, color: a ? a.color : style.color };
      $('#a-font').value = s.font;
      $('#a-size').value = String(s.size);
      $('#a-bold').setAttribute('aria-pressed', String(!!s.bold));
      $$('#a-colors .swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.color === s.color)));
      $('#a-delete').disabled = !a;
      $('#a-delete').title = Ink.is(a) ? 'Delete this pen mark' : 'Delete this text box';
      $('#a-pen').setAttribute('aria-pressed', String(pen));
      $('#a-undo').disabled = !(item() && hist.id === item().id && hist.stack.length);
    }

    // ✏️ Pen on: dragging on a page writes; text boxes let the pen pass over them.
    function setPen(on) {
      pen = !!on;
      $('#v-pages').classList.toggle('pen', pen);
      $('#anno-hint').textContent = pen
        ? 'Write anywhere on a page. Click ✏️ Pen again to go back to text boxes. ⌘Z or Ctrl+Z undoes.'
        : 'Click anywhere on a page to add a text box. Click a box or pen mark to change it. Drag the ⠿ handle to move a box and the right edge to resize it. ⌘Z or Ctrl+Z undoes.';
      if (pen && document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      if (pen) select(-1);
      syncToolbar();
    }
    $('#a-pen').addEventListener('click', () => setPen(!pen));
    $('#a-undo').addEventListener('click', undo);
    $('#v-pages').addEventListener('pointerdown', (e) => {
      if (!annotating || !pen || e.button > 0) return;
      const layer = e.target.closest('.anno-layer');
      if (!layer) return;
      const page = Number(layer.closest('.page-wrap').dataset.page);
      Ink.capture(e, layer, { color: style.color, width: PEN_PT }, (stroke) => {
        item().annotations.push({ ...stroke, page });
        selected = -1;
        renderAnnotations();
        changed();
      });
    });

    // Toolbar changes apply to the selected box and become the style for new boxes.
    function setStyle(patch) {
      Object.assign(style, patch);
      const a = item().annotations[selected];
      if (a && Ink.is(a)) {
        if (patch.color) { a.color = patch.color; renderAnnotations(); changed(); }
      } else if (a) {
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
    $('#a-delete').addEventListener('click', () => removeSelected());
    function removeSelected() {
      if (selected < 0) return;
      const it = item();
      if (isHeader(it.annotations[selected], it)) it.headerDeleted = true;
      it.annotations.splice(selected, 1);
      selected = -1;
      renderAnnotations();
      changed();
    }
    // Keep toolbar clicks from stealing focus from the text being edited.
    $('#anno-bar').addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });

    function addBox(page, x, y) {
      // A box left empty goes away when the next one is added.
      const list = item().annotations;
      for (let i = list.length - 1; i >= 0; i--) {
        if (!Ink.is(list[i]) && !list[i].header && !String(list[i].text || '').trim()) list.splice(i, 1);
      }
      const a = { page, x: clamp(x, 0, 0.9), y: clamp(y, 0, 0.95), w: 0.4, text: '', ...style };
      list.push(a);
      selected = item().annotations.length - 1;
      renderAnnotations();
      const txt = $(`#v-pages .anno[data-i="${selected}"] .txt`);
      if (txt) txt.focus();
      changed();
    }

    // Click on an empty part of a page to drop a text box there (every click adds another one).
    // Clicking a box or pen mark from before opens it for changes, even before ✏️ Annotations.
    $('#v-pages').addEventListener('click', (e) => {
      const mark = e.target.closest('.ink-mark, .anno');
      if (mark && !pen) {
        const i = Number(mark.dataset.i);
        if (!annotating) {
          setAnnotating(true, { header: false });
          if (!annotating) return;
        }
        if (mark.classList.contains('ink-mark') || !annotating) return select(i);
        const txt = $(`#v-pages .anno[data-i="${i}"] .txt`);
        if (txt && document.activeElement !== txt) {
          txt.focus();
          const range = document.createRange();
          range.selectNodeContents(txt);
          range.collapse(false);
          getSelection().removeAllRanges();
          getSelection().addRange(range);
        }
        return;
      }
      if (!annotating || pen) return;
      const layer = e.target.closest('.anno-layer');
      if (!layer || e.target !== layer) return;
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
      remember(it);
      syncToolbar();
      if (it._famMerged) it.familyNotes = famOnly(it.annotations);
      syncCaches(it, ['annotations', 'finalStale', 'familyNotes', '_famMerged', '_famJson']);
      renderReview(it);
      $('#v-save').textContent = 'Saving…';
      clearTimeout(annoTimer);
      annoTimer = setTimeout(() => saveAnnotations(it), 800);
    }
    async function saveAnnotations(it) {
      annoTimer = null;
      try {
        const fam = famOnly(cleanAnnotations(it));
        const famJson = JSON.stringify(fam);
        await call('adminAnnotate', {
          studentId: it.studentId, id: it.id, annotations: esOnly(cleanAnnotations(it)),
          ...(it._famMerged && famJson !== it._famJson ? { familyNotes: fam } : {}),
        });
        if (it._famMerged) it._famJson = famJson;
        if (item() === it) $('#v-save').textContent = 'Saved ✓';
      } catch (err) {
        if (item() === it) $('#v-save').textContent = 'Not saved';
        toast(`Couldn’t save annotations: ${err.message}`);
      }
    }
    const cleanAnnotations = (it) => it.annotations.filter(a => Ink.is(a) || String(a.text || '').trim());

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
            const marks = it._famMerged ? cleanAnnotations(it) : [...(it.familyNotes || []), ...cleanAnnotations(it)];
            const canvas = await renderPage(f.images[n], marks.filter(a => a.page === n));
            pages.push(await Pdf.canvasToJpeg(canvas, 0.85));
          }
          blob = Pdf.build(pages);
        } else {
          blob = new Blob([f.bytes], { type: 'application/pdf' });
        }
        busy(`Saving to ${it.lp} Annotated…`);
        const res = await call('adminFinalize', {
          studentId: it.studentId, id: it.id, filedAs: 'Annotated', annotations: esOnly(cleanAnnotations(it)), data: await blobToBase64(blob),
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
      if (it.finalizedAt && !confirm(`Move this from ${it.lp} Annotated to ${it.lp} Extra? The annotated copy goes to WiSH’s Trash, where you can put it back for 60 days.`)) return;
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

    // Undo export: the exported copy goes to WiSH's Trash and the sample stays approved, ready to
    // export again. A taken-back copy can be put back from here or from the Trash page.
    function applyExport(it, x) {
      Object.assign(it, {
        finalizedAt: x.finalizedAt || 0, finalUrl: x.finalUrl || '', filedAs: x.filedAs || '',
        approved: !!x.approved, oldExports: x.oldExports || [], finalStale: false,
      });
      syncCaches(it, ['finalizedAt', 'finalUrl', 'filedAs', 'approved', 'oldExports', 'finalStale']);
      Core.filed(it);
      renderReview(it);
    }
    $('#final-state').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-unfile], [data-putback]');
      const it = item();
      if (!b || !it) return;
      const undo = b.hasAttribute('data-unfile');
      if (undo && !confirm(`Undo the export? The copy in Approved › ${exportedAs(it)} moves to WiSH’s Trash, where you can put it back for 60 days. The sample stays approved, so you can export it again.`)) return;
      flushSaves();
      busy(undo ? 'Taking back the export…' : 'Putting it back…');
      try {
        const res = undo
          ? await call('adminUnfile', { studentId: it.studentId, id: it.id })
          : await call('adminRestoreExport', { studentId: it.studentId, id: it.id, fileId: b.dataset.putback });
        applyExport(it, res.item);
        toast(undo ? 'Export taken back. The copy is in the Trash.' : `✓ Back in ${exportedAs(it)}.`);
      } catch (err) {
        toast(/unknown request/i.test(err.message) ? 'This needs the newest WiSH update first.' : err.message);
      } finally {
        busy(false);
      }
    });

    // Delete: the sample goes to WiSH's Trash, where it can be restored for 60 days.
    $('#t-trash').addEventListener('click', async () => {
      const it = item();
      const who = (student && student.name) || it.name || it.studentId;
      if (!confirm(`Delete ${who}’s ${it.subject} sample for ${it.lp}? It goes to the Trash, where you can restore it for 60 days.`)) return;
      flushSaves();
      setAnnotating(false);
      busy('Moving to the Trash…');
      try {
        await call('adminTrash', { studentId: it.studentId, id: it.id });
      } catch (err) {
        return toast(err.message);
      } finally {
        busy(false);
      }
      dropItem(it);
      Core.filed({ ...it, finalizedAt: 0 });
      list.splice(idx, 1);
      toast('Moved to the Trash.');
      if (!list.length) return close();
      idx = Math.min(idx, list.length - 1);
      render();
    });

    function filed(it, res) {
      Object.assign(it, { finalizedAt: res.finalizedAt, finalUrl: res.finalUrl, filedAs: res.filedAs || 'Annotated', finalStale: false, approved: true });
      if (res.oldExports) it.oldExports = res.oldExports;
      syncCaches(it, ['finalizedAt', 'finalUrl', 'filedAs', 'finalStale', 'approved', 'oldExports']);
      Core.filed(it);
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
        if (Ink.is(a)) { Ink.paint(ctx, a, W, H); continue; }
        if (!String(a.text || '').trim()) continue;
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
      else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && annotating) { e.preventDefault(); undo(); }
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

    return { open, close };
  })();

  // ---------- Trash ----------

  async function openTrash() {
    if (!data) return;
    closeUserMenu();
    currentStudent = null;
    show('trash');
    const grid = $('#trash-grid');
    grid.innerHTML = '<div class="empty">Loading…</div>';
    let res;
    try {
      res = await call('adminTrashList');
    } catch (err) {
      grid.innerHTML = `<div class="empty">${esc(/unknown request/i.test(err.message) ? 'The Trash needs the newest WiSH update first.' : err.message)}</div>`;
      return;
    }
    trashItems = res.items;
    trashExports = res.exports || [];
    renderTrash();
  }
  let trashItems = [], trashExports = [];
  function renderTrash() {
    const grid = $('#trash-grid');
    if (!trashItems.length && !trashExports.length) { grid.innerHTML = '<div class="empty">The Trash is empty.</div>'; return; }
    const day = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const nameOf = (i) => (data.students.find(s => s.id === i.studentId) || {}).name || i.name || i.studentId;
    grid.innerHTML = trashExports.map((i, n) => `
      <div class="card trash-item">
        ${i.thumb ? `<img src="${esc(i.thumb)}" alt="">` : '<div class="noimg">📄</div>'}
        <div class="trash-info">
          <strong>${esc(nameOf(i))}</strong>
          <span>${esc(i.subject)} · ${esc(i.lp)} · exported copy (${esc(i.oldExport.filedAs)})</span>
          <span class="meta">Export taken back on ${esc(day(i.oldExport.takenAt))}</span>
          <span class="meta">Deleted for good on <b>${esc(day(i.oldExport.deletesOn))}</b></span>
        </div>
        <div class="trash-actions">
          <button class="btn small primary" data-act="putback" data-n="${n}">Put back</button>
          <button class="btn small ghost" data-act="xnow" data-n="${n}">Delete now</button>
        </div>
      </div>`).join('') + trashItems.map((i, n) => `
      <div class="card trash-item">
        ${i.thumb ? `<img src="${esc(i.thumb)}" alt="">` : '<div class="noimg">📄</div>'}
        <div class="trash-info">
          <strong>${esc(nameOf(i))}</strong>
          <span>${esc(i.subject)} · ${esc(i.lp)}${i.filedAs && i.finalizedAt ? ` · was filed as ${esc(i.filedAs)}` : ''}</span>
          <span class="meta">Deleted by ${i.trashedBy === 'Student' ? 'the student' : 'an ES'} on ${esc(day(i.trashedAt))}</span>
          <span class="meta">Deleted for good on <b>${esc(day(i.deletesOn))}</b></span>
        </div>
        <div class="trash-actions">
          <button class="btn small primary" data-act="restore" data-n="${n}">Restore</button>
          <button class="btn small ghost" data-act="now" data-n="${n}">Delete now</button>
        </div>
      </div>`).join('');
  }
  $('#trash-grid').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'putback' || b.dataset.act === 'xnow') return trashExport(b.dataset.act, trashExports[Number(b.dataset.n)]);
    const it = trashItems[Number(b.dataset.n)];
    if (!it) return;
    if (b.dataset.act === 'now' && !confirm(`Delete this ${it.subject} sample for good? This can’t be undone.`)) return;
    busy(b.dataset.act === 'now' ? 'Deleting…' : 'Restoring…');
    try {
      if (b.dataset.act === 'now') {
        await call('adminDeleteNow', { studentId: it.studentId, id: it.id });
        toast('Deleted for good.');
      } else {
        const res = await call('adminRestore', { studentId: it.studentId, id: it.id });
        delete studentCache[it.studentId];
        if (res.item.lp === viewLp) data.items.push(res.item);
        Core.filed(res.item);
        toast(`Restored to ${res.item.lp}.`);
      }
      trashItems = trashItems.filter(i => i !== it);
      renderTrash();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  // An exported copy the ES took back: put it back in its Approved folder, or delete it for good.
  async function trashExport(act, it) {
    if (!it) return;
    const x = it.oldExport;
    if (act === 'xnow' && !confirm(`Delete this exported ${it.subject} copy for good? The sample itself stays.`)) return;
    busy(act === 'xnow' ? 'Deleting…' : 'Putting it back…');
    try {
      if (act === 'xnow') {
        await call('adminDeleteExport', { studentId: it.studentId, id: it.id, fileId: x.fileId });
        toast('Deleted for good.');
      } else {
        const res = await call('adminRestoreExport', { studentId: it.studentId, id: it.id, fileId: x.fileId });
        delete studentCache[it.studentId];
        const mine = data.items.find(i => i.id === it.id && i.studentId === it.studentId);
        if (mine) Object.assign(mine, res.item);
        Core.filed(res.item);
        toast(`✓ Back in Approved › ${res.item.lp} ${res.item.filedAs}.`);
      }
      // Putting one back may send the copy it replaced to the Trash, so ask again.
      openTrash();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  }
  $('#open-trash').addEventListener('click', openTrash);
  $('#trash-back').addEventListener('click', () => {
    renderDash();
    show('dash');
  });

  // ---------- Helpers ----------

  // ---------- LP dates ----------

  // Settings page: the current LP and the LP dates.
  let settingsBack = 'dash';
  function openSettings(from) {
    if (!data) return;
    settingsBack = from || 'dash';
    $('#settings-back').textContent = settingsBack === 'setup' ? '← Back to setup' : '← Dashboard';
    const d = data.lpDates || {};
    // An ES follows the school's dates, so they only see them.
    const shared = creds.role === 'es' && Object.keys(d).length > 0;
    const off = shared ? 'disabled' : '';
    $('#dates-grid').innerHTML = '<span></span><b>Start</b><b>End</b>' + data.lps.map(lp => `
      <span class="lp-name">${esc(lp)}</span>
      <input type="date" data-lp="${esc(lp)}" data-end="0" value="${esc((d[lp] || {}).start || '')}" aria-label="${esc(lp)} start date" ${off}>
      <input type="date" data-lp="${esc(lp)}" data-end="1" value="${esc((d[lp] || {}).end || '')}" aria-label="${esc(lp)} end date" ${off}>`).join('');
    renderHolidays(data.holidays || [], shared);
    $('#dates-shared').hidden = !shared;
    $('#dates-save').hidden = shared;
    currentStudent = null;
    show('settings');
  }

  // School holidays: one row each (from, to, name), saved with the LP dates.
  function holidayRow(h, off) {
    return `<div class="holiday-row">
      <label>From <input type="date" data-h="from" value="${esc(h.from || '')}" ${off}></label>
      <label>To <input type="date" data-h="to" value="${esc(h.to && h.to !== h.from ? h.to : '')}" ${off}></label>
      <label class="grow">Name <input data-h="name" maxlength="60" placeholder="e.g. Thanksgiving break" value="${esc(h.name || '')}" ${off}></label>
      ${off ? '' : '<button type="button" class="btn ghost small" data-h-del aria-label="Remove this holiday">×</button>'}
    </div>`;
  }
  function renderHolidays(list, shared) {
    const off = shared ? 'disabled' : '';
    $('#holiday-list').innerHTML = list.length ? list.map(h => holidayRow(h, off)).join('') : (shared ? '<p class="meta">No school holidays yet.</p>' : '');
    $('#holiday-add').hidden = shared;
    if (!list.length && !shared) $('#holiday-add').click();
  }
  $('#holiday-add').addEventListener('click', () => {
    $('#holiday-list').insertAdjacentHTML('beforeend', holidayRow({}, ''));
  });
  $('#holiday-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-h-del]');
    if (del) del.closest('.holiday-row').remove();
  });
  const readHolidays = () => $$('#holiday-list .holiday-row').map(r => ({
    from: r.querySelector('[data-h="from"]').value,
    to: r.querySelector('[data-h="to"]').value || r.querySelector('[data-h="from"]').value,
    name: r.querySelector('[data-h="name"]').value.trim(),
  })).filter(h => h.from);

  $('#open-dates').addEventListener('click', () => openSettings('dash'));
  $('#settings-back').addEventListener('click', () => {
    if (settingsBack === 'setup') return Setup.open();
    renderDash();
    show('dash');
  });
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
      const res = await call('adminSetLpDates', { dates, holidays: readHolidays() });
      data.lpDates = res.lpDates;
      if (res.holidays) { data.holidays = res.holidays; renderHolidays(data.holidays, false); }
      renderDash();
      toast('LP dates and holidays saved.');
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });

  // Your own password lives in the main copy, for you and for each ES.
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, cur = f.current.value, next = f.next.value;
    if (next !== f.again.value) return toast('The two new passwords don’t match.');
    busy('Changing password…');
    try {
      if (creds.role === 'super') {
        await mainCall('superChangePassword', { adminUser: creds.user, adminKey: cur, newPass: next });
        creds = { ...creds, key: next };
        saveCreds(creds);
      } else {
        await mainCall('esChangePassword', { esUser: creds.user, esKey: creds.key, currentPass: cur, newPass: next });
      }
      f.reset();
      toast('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      toast(/wrong username or password/i.test(err.message) ? 'Your current password isn’t right.'
        : /unknown request/i.test(err.message) ? 'Changing passwords starts working after the next WiSH update.' : err.message);
    } finally {
      busy(false);
    }
  });

  // ---------- Reminders: emails to families, and status reports to you ----------

  const remForm = $('#rem-form');
  const TPL_FILLS = {
    missing: ['student_first_name', 'lp', 'to do', 'count', 'days left', 'end date', 'link', 'booking link'],
    redo: ['student_first_name', 'class', 'lp', 'reasons', 'link'],
    approved: ['student_first_name', 'lp', 'link'],
    each: ['student_first_name', 'class', 'lp', 'link'],
    received: ['student_first_name', 'class', 'lp', 'link'],
    book: ['student_first_name', 'lp', 'booking link', 'end date', 'link'],
    meet: ['student_first_name', 'lp', 'when', 'meeting time', 'meet link', 'booking link'],
  };
  const WEEK_NAMES = ['Week 1–2', 'Week 3', 'Week 4', 'Week 5+'];
  const KIND_NAMES = { missing: 'Still to do', redo: 'Redo', approved: 'All done', each: 'Approved', received: 'Received', book: 'Book meeting', meet: 'Meeting soon', summary: 'Summary', report: 'Report', 'to you': 'To you' };
  let rem = null;          // last adminEmailSettings answer
  let tpls = {};           // the wording being edited, for every email
  let tplKind = 'missing';
  let tplField = null;     // where Insert puts a fill-in
  let remDirty = false;

  const weekSelects = (prefix, twice) => WEEK_NAMES.map((w, n) => `<div class="week" data-w="${n}"><span>${w.toUpperCase()}</span>
    <select name="${prefix}${n}" aria-label="${w}"><option value="none">None</option><option value="once">Once</option>${twice ? '<option value="twice">Twice</option>' : ''}<option value="every5">Every 5 days</option><option value="every4">Every 4 days</option><option value="every3">Every 3 days</option><option value="every2">Every 2 days</option><option value="daily">Every day</option></select></div>`).join('');
  $('#rem-weeks').innerHTML = weekSelects('week', false);
  $('#rem-book-weeks').innerHTML = weekSelects('bookWeek', true);

  const remError = (err) => /unknown request/i.test(err.message) ? 'Reminders start working after the next WiSH update.' : err.message;
  function setRemDirty(on) {
    remDirty = on;
    $('#rem-state').textContent = on ? 'Unsaved changes' : '';
  }
  const dayName = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

  async function openReminders() {
    if (!data) return;
    busy('Loading reminders…');
    try {
      rem = await call('adminEmailSettings');
      fillReminders();
      currentStudent = null;
      show('reminders');
    } catch (err) {
      toast(remError(err));
    } finally {
      busy(false);
    }
  }

  function fillReminders() {
    const s = rem.settings, f = remForm;
    const radio = (name, v) => $$(`input[name="${name}"]`, f).forEach(r => { r.checked = r.value === String(v); });
    radio('families', s.families);
    radio('report', s.report ? 'on' : 'off');
    ['parents', 'students', 'missing', 'approved', 'noWeekends', 'noHolidays', 'daily', 'weekly', 'live']
      .forEach(k => { f[k].checked = !!s[k]; });
    ['famHour', 'onceDay', 'reportHour', 'weeklyDay'].forEach(k => { f[k].value = String(s[k]); });
    s.weeks.slice(0, WEEK_NAMES.length).forEach((w, n) => { f[`week${n}`].value = w; });
    // LP meeting reminders arrived with a later WiSH update; older scripts don't have them.
    const meetings = !!rem.defaults.book;
    $('#rem-meetings').hidden = !meetings;
    $$('#rem-tabs [data-new]').forEach(l => { l.hidden = !meetings; });
    if (!meetings && (tplKind === 'book' || tplKind === 'meet')) tplKind = 'missing';
    if (meetings) {
      f.book.checked = !!s.book;
      f.meet.checked = !!s.meet;
      f.bookOnceDay.value = String(s.bookOnceDay);
      s.bookWeeks.slice(0, WEEK_NAMES.length).forEach((w, n) => { f[`bookWeek${n}`].value = w; });
    }
    $$('[data-in]', f).forEach(i => { i.checked = !!s.inReport[i.dataset.in]; });
    $$('[data-ev]', f).forEach(i => { i.checked = !!s.esEvents[i.dataset.ev]; });
    f.pauseFrom.value = s.pauseFrom || '';
    f.pauseTo.value = s.pauseTo || '';
    tpls = {};
    Object.keys(rem.defaults).forEach(k => { tpls[k] = { ...rem.defaults[k], ...((s.templates || {})[k] || {}) }; });
    showTemplate(tplKind);

    const st = rem.status;
    $('#rem-lp').textContent = st.week && st.week > 0 ? `${st.lp} · Week ${Math.min(st.week, st.weeks)} of ${st.weeks}` : st.lp;
    $('#rem-lp-sub').textContent = st.range ? `${dayName(st.range.start)} to ${dayName(st.range.end)}${st.daysLeft >= 0 ? ` · ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'} left` : ' · ended'}` : 'No LP dates set in Settings';
    $('#rem-next').textContent = st.nextReminder ? `${dayName(st.nextReminder.date)} · ${hourName(st.nextReminder.hour)}` : 'None scheduled';
    $('#rem-next-sub').textContent = s.families === 'off' ? 'Family emails are off' : `${st.missingFamilies} famil${st.missingFamilies === 1 ? 'y has' : 'ies have'} something still to do`;
    $('#rem-noemail').textContent = st.noEmail ? `${st.noEmail} student${st.noEmail === 1 ? '' : 's'}` : 'None';
    $$('#rem-weeks .week, #rem-book-weeks .week', f).forEach(w => {
      const n = Number(w.dataset.w);
      const now = st.week ? (st.week <= 2 ? 0 : st.week >= 5 ? 3 : st.week - 2) : -1;
      w.classList.toggle('now', n === now && st.daysLeft >= 0);
    });
    $('#rem-me-to').textContent = `How the LP is going, sent to ${s.me || 'you'}`;
    $('#rem-log').href = rem.logUrl || '#';
    $('#rem-recent').innerHTML = rem.recent.length ? rem.recent.map(e => `<div><span class="k">${esc(KIND_NAMES[e.kind] || e.kind)}</span>
      <span title="${esc(e.subject)}">${esc(e.student || e.subject)}</span><span class="t">${esc(when(e.at))}</span></div>`).join('')
      : '<p class="hint">Nothing sent yet.</p>';
    remAllow(rem.running ? '' : 'Reminders aren’t running yet. Google needs you to allow WiSH to send email on a schedule, once. Ask Claude to “turn on WiSH reminders”.');
    setRemDirty(false);
  }
  function remAllow(text) {
    $('#rem-allow').textContent = text;
    $('#rem-allow').hidden = !text;
  }
  function when(t) {
    const d = new Date(t), today = new Date();
    const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
    return days === 0 ? `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : days === 1 ? 'Yesterday'
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // ----- Email wording -----
  function showTemplate(kind) {
    tplKind = kind;
    $$('input[name="tpl"]', remForm).forEach(r => { r.checked = r.value === kind; });
    $('#tpl-subject').value = tpls[kind].subject;
    $('#tpl-body').value = tpls[kind].body;
    $('#tpl-insert').innerHTML = '<span>Insert:</span>' + TPL_FILLS[kind].map(k => `<button type="button" data-fill="${esc(k)}">{${esc(k)}}</button>`).join('');
    tplField = null;
    preview();
  }
  // A made-up family, or the first one missing samples, filled into the wording.
  function preview() {
    const sample = rem.sample || { first: 'Maya', to: [], missing: ['Algebra 2 (1 of 2 turned in)', 'Biology'] };
    const st = rem.status;
    const vars = {
      first: sample.first, student_first_name: sample.first, lp: st.lp, count: sample.count || `${sample.missing.length || 1} work sample${sample.missing.length === 1 ? '' : 's'}`,
      'missing classes': (sample.missing.length ? sample.missing : ['Biology']).map(m => `  • ${m}`).join('\n'),
      'days left': st.daysLeft === null || st.daysLeft === undefined ? '' : String(Math.max(0, st.daysLeft)),
      'end date': st.range ? dayName(st.range.end) : '', link: Api.studentLink(creds.role === 'es' ? creds.user : '').replace(/^https:\/\//, ''),
      class: 'Biology', reasons: '  • Missing date\n  • Please add your score',
      'to do': sample.todo || 'Still missing:\n  • Biology\n\nNeeds a redo (open My uploads and tap Resubmit):\n  • Algebra 2: Missing date',
      when: 'on Thursday', 'meeting time': 'Thursday, November 5 at 3:30 PM', 'meet link': 'https://meet.google.com/abc-defg-hij',
      'booking link': Meetings.link(st.lp) || 'calendar.app.google/…',
    };
    const put = (t) => String(t).replace(/\{([a-z_ ]+)\}/g, (m, k) => vars[k] ?? m);
    $('#pv-to').textContent = `To: ${sample.to && sample.to.length ? sample.to.join(', ') : 'parent@…, student@…'}`;
    $('#pv-subject').textContent = put(tpls[tplKind].subject);
    $('#pv-body').textContent = put(tpls[tplKind].body);
  }
  $('#rem-tabs').addEventListener('change', (e) => { if (e.target.name === 'tpl') showTemplate(e.target.value); });
  ['#tpl-subject', '#tpl-body'].forEach(sel => {
    $(sel).addEventListener('input', () => {
      tpls[tplKind][sel === '#tpl-subject' ? 'subject' : 'body'] = $(sel).value;
      preview();
    });
    $(sel).addEventListener('focus', () => { tplField = $(sel); });
  });
  $('#tpl-insert').addEventListener('mousedown', (e) => { if (e.target.closest('[data-fill]')) e.preventDefault(); }); // keep the cursor
  $('#tpl-insert').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    const el = tplField || $('#tpl-body');
    const text = `{${b.dataset.fill}}`;
    const at = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, at) + text + el.value.slice(el.selectionEnd ?? at);
    el.focus();
    el.selectionStart = el.selectionEnd = at + text.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('#tpl-reset').addEventListener('click', () => {
    tpls[tplKind] = { ...rem.defaults[tplKind] };
    showTemplate(tplKind);
    setRemDirty(true);
  });

  remForm.addEventListener('input', () => setRemDirty(true));
  remForm.addEventListener('change', () => setRemDirty(true));
  remForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = remForm;
    const val = (name) => ($(`input[name="${name}"]:checked`, f) || {}).value;
    const families = val('families') || 'test';
    if (families === 'on' && rem.settings.families !== 'on' &&
      !confirm('Turn on emails to students and families? They’ll start getting WiSH emails from your account.')) return;
    if ((f.pauseFrom.value && !f.pauseTo.value) || (!f.pauseFrom.value && f.pauseTo.value) || (f.pauseFrom.value > f.pauseTo.value)) {
      return toast('For a pause, pick a start date and an end date after it.');
    }
    const checks = (attr) => Object.fromEntries($$(`[data-${attr}]`, f).map(i => [i.dataset[attr], i.checked]));
    const settings = {
      families, report: val('report') === 'on',
      famHour: Number(f.famHour.value), onceDay: Number(f.onceDay.value), reportHour: Number(f.reportHour.value), weeklyDay: Number(f.weeklyDay.value),
      weeks: WEEK_NAMES.map((w, n) => f[`week${n}`].value),
      bookWeeks: WEEK_NAMES.map((w, n) => f[`bookWeek${n}`].value), bookOnceDay: Number(f.bookOnceDay.value),
      book: f.book.checked, meet: f.meet.checked,
      inReport: checks('in'), esEvents: checks('ev'),
      pauseFrom: f.pauseFrom.value, pauseTo: f.pauseTo.value,
      templates: tpls,
      link: Api.studentLink(creds.role === 'es' ? creds.user : ''),
    };
    ['parents', 'students', 'missing', 'approved', 'noWeekends', 'noHolidays', 'daily', 'weekly', 'live']
      .forEach(k => { settings[k] = f[k].checked; });
    // Families now get only Still to do and All done (redos are in Still to do).
    Object.assign(settings, { redo: false, each: false, received: false, famHow: 'daily' });
    busy('Saving…');
    try {
      rem = await call('adminSaveEmailSettings', { settings });
      fillReminders();
      toast(rem.needsAllow ? 'Saved. Reminders start once you allow WiSH in Google (see the note at the top).' : 'Reminders saved.');
    } catch (err) {
      toast(remError(err));
    } finally {
      busy(false);
    }
  });

  $('#open-reminders').addEventListener('click', openReminders);
  $('#rem-to-roster').addEventListener('click', (e) => {
    e.preventDefault();
    if (remDirty && !confirm('You have unsaved reminder changes. Leave without saving?')) return;
    setRemDirty(false);
    $('#open-roster').click();
  });
  $('#rem-back').addEventListener('click', () => {
    if (remDirty && !confirm('You have unsaved reminder changes. Leave without saving?')) return;
    setRemDirty(false);
    renderDash();
    show('dash');
  });

  // ---------- Students (bulk add and edit, like a spreadsheet) ----------

  // Spreadsheet order, for pasting. Classes are edited in their own table below the students.
  const COLS = ['first', 'last', 'grade', 'city', 'classes', 'classes2', 'email', 'family'];
  const MAIN_COLS = ['first', 'last', 'grade', 'city', 'email', 'family'];
  const GRADE_LIST = ['8', '9', '10', '11', '12'];
  let roster = [];
  let rosterDirty = false;

  const onlyLetters = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
  function rosterId(r) {
    const a = onlyLetters(r.first).slice(0, 2), c = onlyLetters(r.city).slice(0, 2), g = String(r.grade || '').trim();
    return a.length === 2 && c.length === 2 && GRADE_LIST.includes(g) ? a + g + c : '';
  }
  const blankRow = () => ({ first: '', last: '', grade: '', city: '', classes: '', classes2: '', email: '', family: '', status: 'Active' });
  // A blank Sem 2 means Sem 1 with A changed to B.
  const classList = (r, k) => k === 'classes2' && !String(r.classes2 || '').trim()
    ? Classes.sem2From(Classes.parse(r.classes)) : Classes.parse(r[k]);
  const classText = (list) => list.map(c => c.name + (c.need === 2 ? ' (Accel)' : '')).join(', ');
  const isEmpty = (r) => COLS.every(k => !String(r[k] || '').trim());
  // Last sign-in, or what stops this row from signing in.
  const sidCell = (r, problem) => problem ? `<span class="why">${esc(problem)}</span>` : isEmpty(r) ? ''
    : r.lastSignIn ? esc(new Date(r.lastSignIn).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))
    : '<span class="never">Never</span>';
  // Whether reminders can reach this family.
  const remCell = (r) => isEmpty(r) ? '<td class="rem-cell"></td>'
    : r.status === 'Inactive' ? '<td class="rem-cell">Off (inactive)</td>'
    : String(r.email || '').trim() || String(r.family || '').trim() ? '<td class="rem-cell on">● On</td>' : '<td class="rem-cell">No email yet</td>';

  // The setup steps open the Students page too, and come back to it.
  let rosterBack = 'dash';
  $('#open-roster').addEventListener('click', () => { rosterBack = 'dash'; $('#roster-back').textContent = '← Dashboard'; }, true);
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
      pinNames();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  $('#roster-back').addEventListener('click', () => {
    if (rosterDirty && !confirm('You have unsaved changes to the student list. Leave without saving?')) return;
    if (rosterBack === 'setup') return Setup.open();
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
      const problem = isEmpty(r) ? '' : !id ? 'Needs first name, grade 8–12 and city' : counts[id] > 1 ? 'Signs in the same way as another row (same first 2 letters, grade and city)' : '';
      return `<tr data-r="${i}" class="${problem ? 'bad' : ''}${r.status === 'Inactive' ? ' inactive' : ''}">
        <td class="num fz fz0">${i + 1}</td>
        ${MAIN_COLS.map(k => `<td class="col-${k}${k === 'first' ? ' fz fz1' : k === 'last' ? ' fz fz2' : ''}"><input data-k="${k}" value="${esc(r[k])}" aria-label="${k} row ${i + 1}" ${k === 'grade' ? 'inputmode="numeric" list="grade-list"' : ''}${k === 'email' || k === 'family' ? ' type="email" inputmode="email" spellcheck="false"' : ''}${k === 'family' ? ' multiple' : ''}${k === 'email' && !isEmpty(r) ? ' placeholder="Add student email"' : ''}${k === 'family' && !isEmpty(r) ? ' placeholder="parent@…, another@…"' : ''}></td>`).join('')}
        ${remCell(r)}
        <td class="sid-cell" title="${esc(problem)}">${sidCell(r, problem)}</td>
        <td class="status-cell">${isEmpty(r) ? '' : `<select data-k="status" class="${r.status === 'Inactive' ? 'off' : 'on'}" aria-label="Status row ${i + 1}" title="Inactive: can sign in, but can’t turn in work and gets no reminders">
          <option ${r.status !== 'Inactive' ? 'selected' : ''}>Active</option><option ${r.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>`}</td>
      </tr>`;
    }).join('') + '<datalist id="grade-list">' + GRADE_LIST.map(g => `<option value="${g}">`).join('') + '</datalist>';
    pinNames();
    renderClasses();
  }

  // ----- Classes: one tag per class, Sem 1 and Sem 2 side by side -----
  let classSem = 'classes'; // the Sem 1 or Sem 2 tab
  $$('.sem-tabs [data-sem]').forEach(b => b.addEventListener('click', () => {
    classSem = b.dataset.sem;
    $$('.sem-tabs [data-sem]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#classes-th').className = classSem === 'classes' ? 'sem1' : 'sem2';
    $('#classes-th').innerHTML = classSem === 'classes' ? 'Sem 1 classes <span>LP1–4</span>' : 'Sem 2 classes <span>LP5–8</span>';
    renderClasses();
  }));
  function renderClasses() {
    const rows = roster.map((r, i) => ({ r, i })).filter(x => !isEmpty(x.r));
    $('#classes-body').innerHTML = rows.length ? rows.map(({ r, i }) => `<tr data-r="${i}">
        <td class="cls-who">${esc(`${r.first} ${r.last}`.trim() || '(no name)')}</td>
        ${[classSem].map(k => {
          const derived = k === 'classes2' && !String(r.classes2 || '').trim();
          const list = classList(r, k);
          return `<td class="cls-cell${derived ? ' derived' : ''}" data-k="${k}">
            ${derived && list.length ? '<span class="cls-note">Same as Sem 1, A → B:</span>' : ''}
            <div class="cls-grid">${list.map((c, n) => `<span class="cls${c.need === 2 ? ' accel' : ''}"><button type="button" class="cls-name" data-acc="${n}" title="Click to switch Accel on or off">${esc(c.name)}${c.need === 2 ? '<b>Accel</b>' : ''}</button><button type="button" class="cls-x" data-del="${n}" aria-label="Remove ${esc(c.name)}">×</button></span>`).join('')}
<input class="cls-add" placeholder="＋ Add a class" aria-label="Add a ${k === 'classes' ? 'Sem 1' : 'Sem 2'} class for ${esc(r.first)}"></div>
          </td>`;
        }).join('')}
      </tr>`).join('') : '<tr><td colspan="2" class="cls-empty">Add students above, then their classes show here.</td></tr>';
  }
  function setClasses(i, k, list) {
    roster[i][k] = classText(list);
    setDirty(true);
    renderClasses();
  }
  $('#classes-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del], [data-acc]');
    if (!b) return;
    const i = Number(b.closest('tr').dataset.r), k = b.closest('td').dataset.k;
    const list = classList(roster[i], k);
    if (b.dataset.del !== undefined) list.splice(Number(b.dataset.del), 1);
    else { const c = list[Number(b.dataset.acc)]; c.need = c.need === 2 ? 1 : 2; }
    setClasses(i, k, list);
  });
  // Type a class and press Enter or a comma. "(Accel)" after a name marks it accelerated.
  function addClasses(inp) {
    const text = inp.value.trim();
    if (!text) return;
    const i = Number(inp.closest('tr').dataset.r), k = inp.closest('td').dataset.k;
    const list = classList(roster[i], k);
    Classes.parse(text).forEach(c => { if (!list.some(x => x.name.toLowerCase() === c.name.toLowerCase())) list.push(c); });
    setClasses(i, k, list);
    const again = $(`#classes-body tr[data-r="${i}"] td[data-k="${k}"] .cls-add`);
    if (again) again.focus();
  }
  $('#classes-body').addEventListener('keydown', (e) => {
    const inp = e.target.closest('.cls-add');
    if (!inp) return;
    if (e.key === 'Enter' || (e.key === ',' && !/\(/.test(inp.value.split(',').pop()))) { e.preventDefault(); addClasses(inp); }
    else if (e.key === 'Backspace' && !inp.value) {
      const i = Number(inp.closest('tr').dataset.r), k = inp.closest('td').dataset.k;
      const list = classList(roster[i], k);
      if (list.length) { list.pop(); setClasses(i, k, list); $(`#classes-body tr[data-r="${i}"] td[data-k="${k}"] .cls-add`).focus(); }
    }
  });
  $('#classes-body').addEventListener('focusout', (e) => { if (e.target.closest('.cls-add') && e.target.value.trim()) addClasses(e.target); });
  // The number and name columns stay put while the rest scrolls; each starts where the one before ends.
  function pinNames() {
    const ths = $$('#screen-roster th.fz');
    let left = 0;
    ths.forEach((th, n) => {
      $$(`#screen-roster .fz${n}`).forEach(el => { el.style.left = `${left}px`; });
      left += th.getBoundingClientRect().width;
    });
  }

  // Typing updates the row; the ID column refreshes without losing the cursor.
  $('#roster-body').addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-k]');
    if (!inp) return;
    const i = Number(inp.closest('tr').dataset.r);
    const wasEmpty = isEmpty(roster[i]);
    roster[i][inp.dataset.k] = inp.value;
    setDirty(true);
    if (wasEmpty !== isEmpty(roster[i])) {  // the Status box appears or goes with the row's content
      $('.status-cell', inp.closest('tr')).innerHTML = isEmpty(roster[i]) ? ''
        : '<select data-k="status" class="on" aria-label="Status"><option selected>Active</option><option>Inactive</option></select>';
    }
    refreshIds();
    if (inp.dataset.k === 'first' || inp.dataset.k === 'last' || isEmpty(roster[i]) !== !$(`#classes-body tr[data-r="${i}"]`)) renderClasses();
  });
  function refreshIds() {
    const counts = {};
    roster.forEach(r => { const id = rosterId(r); if (id) counts[id] = (counts[id] || 0) + 1; });
    $$('#roster-body tr').forEach(tr => {
      const r = roster[Number(tr.dataset.r)];
      const id = rosterId(r);
      const problem = isEmpty(r) ? '' : !id ? 'Needs first name, grade 8–12 and city' : counts[id] > 1 ? 'Signs in the same way as another row (same first 2 letters, grade and city)' : '';
      tr.classList.toggle('bad', !!problem);
      $('.rem-cell', tr).outerHTML = remCell(r);
      $('.sid-cell', tr).innerHTML = sidCell(r, problem);
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

  // Status: an inactive student can still sign in, but can't turn in work and gets no reminders.
  $('#roster-body').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-k="status"]');
    if (!sel) return;
    const tr = sel.closest('tr');
    roster[Number(tr.dataset.r)].status = sel.value;
    sel.className = sel.value === 'Inactive' ? 'off' : 'on';
    tr.classList.toggle('inactive', sel.value === 'Inactive');
    setDirty(true);
    refreshIds();
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
      data = keepRecent(await call('adminOverview', { lp: viewLp }));
      renderDash();
      toast(`Saved ${res.count} student${res.count === 1 ? '' : 's'}.`);
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });
  window.addEventListener('beforeunload', (e) => { if (rosterDirty || remDirty) { e.preventDefault(); e.returnValue = ''; } });

  // Your password stays in this tab only. An ES's key is kept across tabs, so the
  // "Finish in WiSH" button in their copy can open a new tab that's already signed in.
  function readCreds() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY)) || null; } catch { return null; }
  }
  function saveCreds(c) {
    try {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
      if (c) (c.role === 'es' ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(c));
    } catch { /* ignore */ }
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
  // "Wed, Oct 28, 2026", and whether that wasn't a school day (older uploads came in before the check).
  function dayDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return ymd || '';
    return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  const offDay = (ymd) => Holidays.problem(ymd, (data && data.holidays) || []);

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

  // ---------- Setup steps, student link and ES accounts (js/setup.js) ----------

  const Setup = AdminSetup({
    $, $$, esc, toast, busy, show, call, mainCall, signOut,
    creds: () => creds,
    setCreds: (patch) => { creds = { ...creds, ...patch }; saveCreds(creds); },
    data: () => data,
    loadData: () => loadOverview(undefined, { stay: true }),
    openDash: () => loadOverview(),
    openRoster: () => { $('#open-roster').click(); rosterBack = 'setup'; $('#roster-back').textContent = '← Back to setup'; },
    openDates: () => openSettings('setup'),
  });

  // ---------- LP meetings (js/meetings.js) ----------

  const Meetings = AdminMeetings({
    $, esc, toast, busy, show, call,
    data: () => data,
    lps: () => data.lps,
    openStudent: (id) => openStudent(id, viewLp).catch(err => toast(err.message)),
    redraw: () => redrawMeetings(),
  });
  function redrawMeetings() {
    if (!data) return;
    if (!$('#screen-dash').hidden) renderDash();
    if (!$('#screen-student').hidden && currentStudent) renderStudent();
  }
  $('#open-meetings').addEventListener('click', () => {
    if (!data) return;
    currentStudent = null;
    Meetings.setLp(viewLp);
    Meetings.open(viewLp).catch(err => toast(err.message));
  });
  $('#meet-back').addEventListener('click', () => {
    renderDash();
    show('dash');
  });

  // ---------- Core subjects (js/core.js) ----------

  const Core = AdminCore({
    $, esc, toast, busy, show, call,
    openStudent: (id) => openStudent(id, viewLp).catch(err => toast(err.message)),
    redraw: () => renderDash(),
  });

  // Another tab (the one "Finish in WiSH" opened) connected the copy: move on here too.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !creds || creds.role !== 'es' || creds.url) return;
    const c = readCreds();
    if (c && c.url) {
      creds = c;
      data = null;
      Setup.open();
    }
  });

  // ---------- Start ----------

  if (creds) {
    (creds.role === 'es' ? startEs() : loadOverview()).catch(err => {
      toast(err.message);
      if (/password|sign in again/i.test(err.message)) { creds = null; saveCreds(null); }
      show('login');
    });
  } else {
    show('login');
  }
})();
