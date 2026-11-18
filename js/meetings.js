// LP meetings: families book a time on your Google Calendar booking page for each LP, and
// WiSH reads those bookings from your calendar (Code.gs readBookings_). Shown as a line on each
// student card, a card on the student page, and the Meetings page (links, who booked, who
// hasn't, and bookings from emails that aren't on the roster yet).
function AdminMeetings(ctx) {
  const { $, esc, toast, busy, show, call } = ctx;

  let res = null;       // last adminMeetings answer
  let loading = null;
  let pageLp = null;
  const opens = {};     // LP -> open times read from its booking page ([{ start, end }] or null)
  const keepOpen = (r) => { if (r && r.openLp) opens[r.openLp] = r.open; return r; };

  function load(force) {
    if (force || (!res && !loading)) {
      const body = pageLp ? { lp: pageLp } : {};
      if (force) body.fresh = true;
      loading = call('adminMeetings', body)
        .then(r => { res = keepOpen(r); return r; })
        .catch(err => { if (/unknown request/i.test(err.message)) res = { old: true, links: {}, items: [] }; throw err; })
        .finally(() => { loading = null; });
    }
    return loading || Promise.resolve(res);
  }
  function reset() { res = null; Object.keys(opens).forEach(k => delete opens[k]); $('#meet-form').dataset.filled = ''; }

  const active = (b) => !b.ignored;
  // An LP's own booking link, or the one for every LP.
  const linkFor = (lp) => (res && res.links ? res.links[lp] || res.links.ALL || '' : '');
  const forLp = (lp) => (res ? res.items : []).filter(b => b.lp === lp && active(b));
  const forStudent = (id) => (res ? res.items : []).filter(b => b.studentIds.includes(id));
  // Only shown for an LP that has a booking link or already has bookings.
  const on = (lp) => !!res && !res.old && !res.error && !res.off && (!!linkFor(lp) || forLp(lp).length > 0);

  function when(b, withDay = true) {
    const d = new Date(b.start);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return withDay ? `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}` : time;
  }
  const past = (b) => b.end < Date.now();

  /** The line at the bottom of a dashboard card. */
  function cardLine(studentId, lp) {
    if (!on(lp)) return '';
    const mine = forStudent(studentId).filter(b => b.lp === lp);
    if (!mine.length) return '<div class="meet none">No meeting booked</div>';
    return mine.map(b => `<div class="meet booked ${past(b) ? 'past' : ''}" title="LP meeting${past(b) ? ' (done)' : ''}">📅 ${esc(when(b))}</div>`).join('');
  }

  /** Tile on the dashboard. */
  function tile(lp, students) {
    if (!on(lp)) return null;
    const booked = new Set(forLp(lp).flatMap(b => b.studentIds));
    const n = students.filter(s => booked.has(s.id)).length;
    return ['t-info', `${n} <small class="of">of</small> ${students.length}`, 'Booked an LP meeting'];
  }

  /** Card on the student page: every LP with a link or a booking. */
  function studentCard(s) {
    const box = $('#student-meetings');
    if (!res || res.old || res.error || res.off) { box.hidden = true; return; }
    const mine = forStudent(s.id);
    const lps = ctx.lps().filter(lp => linkFor(lp) || mine.some(b => b.lp === lp));
    if (!lps.length) { box.hidden = true; return; }
    box.innerHTML = `<h2>LP meetings</h2><ul class="cc-list meet-list">${lps.map(lp => {
      const got = mine.filter(b => b.lp === lp);
      return `<li class="${got.length ? 'ok' : 'no'}"><span class="cc-mark">${got.length ? '✓' : '–'}</span><b>${esc(lp)}</b><span></span><small>${got.length
        ? got.map(b => esc(when(b)) + (past(b) ? ' (done)' : '')).join('; ')
        : 'Not booked yet'}</small></li>`;
    }).join('')}</ul>`;
    box.hidden = false;
  }

  // ---------- The Meetings page ----------

  async function open(lp) {
    pageLp = pageLp || lp;
    show('meetings');
    render();
    try {
      await load(true);
    } catch (err) {
      $('#meet-body').innerHTML = `<div class="empty">${esc(/unknown request/i.test(err.message) ? 'Meetings start working after the next WiSH update.' : err.message)}</div>`;
      return;
    }
    render();
  }

  function render() {
    const data = ctx.data();
    $('#meet-lp').innerHTML = data.lps.map(lp => `<option ${lp === pageLp ? 'selected' : ''}>${lp}</option>`).join('');
    const body = $('#meet-body');
    if (!res) { body.innerHTML = '<div class="empty">Reading your calendar…</div>'; return; }
    if (res.off) { body.innerHTML = '<div class="empty">LP meeting booking is turned off. You can turn it on in Settings.</div>'; return; }
    fillLinks();
    if (!(pageLp in opens) && res && !res.error) loadOpen(pageLp);
    $('#meet-cal').textContent = res.calendar ? `Reading the calendar “${res.calendar}”` : '';
    $('#meet-allow').hidden = !res.error;
    $('#meet-allow').textContent = res.error === 'allow'
      ? 'WiSH isn’t allowed to read your calendar yet. It needs the next WiSH update, and then one Allow click in Google.'
      : res.error || '';
    const lp = pageLp;
    const nameOf = (id) => (data.students.find(s => s.id === id) || {}).name || id;
    const all = (res.items || []).filter(b => b.lp === lp);
    const matched = all.filter(b => b.studentIds.length);
    const unmatched = all.filter(b => !b.studentIds.length && !b.ignored);
    const booked = new Set(matched.flatMap(b => b.studentIds));
    // Only students who owe samples this LP count (not inactive, withdrawn before it, or not started yet).
    const owing = data.students.filter(s => (ctx.owes ? ctx.owes(s, lp) : s.active !== false));
    const notYet = owing.filter(s => !booked.has(s.id))
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name));
    const link = linkFor(lp);
    const whoText = (b) => b.who.map(w => esc(w.name || w.email) + (w.name ? ` <span class="meta">${esc(w.email)}</span>` : '')).join(', ');
    const options = '<option value="">Choose a student…</option>' + data.students
      .slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    body.innerHTML = `
      <div class="tiles">
        <div class="tile meet"><b>${owing.filter(s => booked.has(s.id)).length} <small class="of">of</small> ${owing.length}</b><span>Students booked for ${esc(lp)}</span></div>
        <div class="tile"><b>${notYet.length}</b><span>Not booked yet</span></div>
        ${Array.isArray(opens[lp]) ? `<div class="tile"><b>${opens[lp].length}</b><span>Open times left</span></div>` : ''}
        <div class="tile ${unmatched.length ? 'redo' : ''}"><b>${unmatched.length}</b><span>Booked by someone not on the roster</span></div>
      </div>
      ${link ? '' : `<p class="note">${esc(lp)} has no booking link yet. Paste it under “Booking pages” so families can book from WiSH.</p>`}
      ${weekGrid(lp, all, link, nameOf)}
      ${unmatched.length ? `<section class="card meet-card">
        <h2>Who is this? <span class="meta">These emails aren’t on the roster. Link each one to a student once; WiSH remembers it.</span></h2>
        <ul class="meet-rows">${unmatched.map(b => `<li>
          <span class="meet-when">${esc(when(b))}</span>
          <span class="meet-who">${whoText(b) || '<span class="meta">No email on the booking</span>'}<small class="meta">${esc(b.title)}</small></span>
          ${b.who.length ? `<span class="meet-act"><select data-email="${esc(b.who[0].email)}" aria-label="Student for ${esc(b.who[0].email)}">${options}</select>
            <button class="btn small ghost" type="button" data-ignore="${esc(b.who[0].email)}">Not a family</button></span>` : ''}
        </li>`).join('')}</ul>
      </section>` : ''}
      <section class="card meet-card">
        <h2>Booked for ${esc(lp)} <span class="meta">${matched.length} meeting${matched.length === 1 ? '' : 's'}</span></h2>
        ${matched.length ? `<ul class="meet-rows">${matched.map(b => `<li class="${past(b) ? 'past' : ''}">
          <span class="meet-when">${esc(when(b))}${past(b) ? ' <span class="meta">done</span>' : ''}</span>
          <span class="meet-who">${b.studentIds.map(id => `<button class="linklike" type="button" data-student="${esc(id)}">${esc(nameOf(id))}</button>`).join(', ')}
            <small class="meta">Booked by ${whoText(b)}</small></span>
        </li>`).join('')}</ul>` : '<p class="meta">No bookings yet.</p>'}
      </section>
      <section class="card meet-card">
        <h2>Not booked yet <span class="meta">${notYet.length} student${notYet.length === 1 ? '' : 's'}</span></h2>
        ${notYet.length ? `<div class="subjects">${notYet.map(s => `<button class="subj missing" type="button" data-student="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>`
          : '<p class="meta">Every student has a meeting.</p>'}
      </section>`;
  }

  // ---------- Week grid: booked and open times, one week at a time ----------
  let weekStart = {};
  let oldServer = false; // the Google script is older than v54 and doesn't send open times   // LP -> Monday (ms, local) of the week shown

  const DAY = 864e5;
  const monday = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
  const hm = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const short = (name) => { const p = String(name || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || ''; };

  function lpWeeks(lp, times) {
    const r = (ctx.data().lpDates || {})[lp];
    let first, last;
    if (r && r.start && r.end) { first = monday(Date.parse(r.start + 'T12:00:00')); last = monday(Date.parse(r.end + 'T12:00:00')); }
    if (times.length) {
      const lo = monday(Math.min(...times)), hi = monday(Math.max(...times));
      first = first == null ? lo : Math.min(first, lo);
      last = last == null ? hi : Math.max(last, hi);
    }
    if (first == null) { first = last = monday(Date.now()); }
    const out = [];
    for (let w = first; w <= last && out.length < 20; w = addDays(w, 7)) out.push(w);
    return out;
  }

  function weekGrid(lp, all, link, nameOf) {
    const open = opens[lp];
    const booked = all.filter(b => !b.ignored);
    const weeks = lpWeeks(lp, booked.map(b => b.start).concat((open || []).map(o => o.start)));
    let w = weekStart[lp];
    if (w == null || !weeks.includes(w)) {
      const now = monday(Date.now());
      w = weeks.includes(now) ? now : weeks[0];
      weekStart[lp] = w;
    }
    const end = addDays(w, 7);
    const inWeek = (ms) => ms >= w && ms < end;
    const cells = {};   // 'dayIndex|minutes' -> [{ kind, html }]
    const rows = new Set();
    let weekend = false;
    const put = (ms, item) => {
      const d = new Date(ms);
      const di = (d.getDay() + 6) % 7;
      if (di > 4) weekend = true;
      const mins = d.getHours() * 60 + d.getMinutes();
      rows.add(mins);
      (cells[`${di}|${mins}`] = cells[`${di}|${mins}`] || []).push(item);
    };
    booked.filter(b => inWeek(b.start)).forEach(b => {
      const names = b.studentIds.length ? b.studentIds.map(id => short(nameOf(id))).join(', ') : (b.who[0] ? (b.who[0].name ? short(b.who[0].name) : b.who[0].email) : 'Booked');
      const tip = `${when(b)}: ${b.studentIds.length ? b.studentIds.map(nameOf).join(', ') : 'not on the roster'}`;
      put(b.start, { kind: `bk${past(b) ? ' past' : ''}${b.studentIds.length ? '' : ' who'}`, attr: b.studentIds[0] ? `data-student="${esc(b.studentIds[0])}"` : '', tip, text: names });
    });
    (open || []).filter(o => inWeek(o.start)).forEach(o => {
      const taken = booked.some(b => b.start < o.end && b.end > o.start);
      if (!taken) put(o.start, { kind: 'op', tip: `Open: ${when(o)}`, text: 'Open' });
    });
    const days = weekend ? 7 : 5;
    const times = [...rows].sort((a, b) => a - b);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const head = Array.from({ length: days }, (_, i) => {
      const d = new Date(addDays(w, i));
      return `<span class="mg-h ${d.getTime() === today.getTime() ? 'today' : ''}">${d.toLocaleDateString([], { weekday: 'short' })} <small>${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</small></span>`;
    }).join('');
    const body = times.map(mins => {
      const label = hm(addDays(w, 0) + mins * 60000);
      return `<span class="mg-t">${esc(label)}</span>` + Array.from({ length: days }, (_, i) => {
        const items = cells[`${i}|${mins}`] || [];
        return `<span class="mg-c">${items.map(it => it.attr
          ? `<button type="button" class="mg-slot ${it.kind}" ${it.attr} title="${esc(it.tip)}">${esc(it.text)}</button>`
          : `<span class="mg-slot ${it.kind}" title="${esc(it.tip)}">${esc(it.text)}</span>`).join('')}</span>`;
      }).join('');
    }).join('');
    const i = weeks.indexOf(w);
    const why = open === undefined ? 'Reading open times from your booking page…'
      : !link ? ''
      : open === null ? (oldServer ? 'Open times show after the next WiSH update.' : 'WiSH couldn’t read the open times from your booking page. Use “Booking page ↗” to see them.')
      : '';
    return `<section class="card meet-card meet-grid">
      <div class="mg-top">
        <h2>${esc(lp)} times <span class="meta">Week of ${esc(new Date(w).toLocaleDateString([], { month: 'short', day: 'numeric' }))}</span></h2>
        <span class="mg-nav">
          <button class="btn small ghost" type="button" data-week="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Previous week">‹ Previous</button>
          <button class="btn small ghost" type="button" data-week="1" ${i >= weeks.length - 1 ? 'disabled' : ''} aria-label="Next week">Next ›</button>
        </span>
      </div>
      <div class="mg-legend"><span class="mg-slot bk">Booked</span><span class="mg-slot op">Open</span>
        ${link ? `<a class="btn small ghost" href="${esc(link)}" target="_blank" rel="noopener">Booking page ↗</a>` : ''}</div>
      ${why ? `<p class="meta">${esc(why)}</p>` : ''}
      ${times.length ? `<div class="mg-scroll"><div class="mg" style="grid-template-columns: 64px repeat(${days}, minmax(88px, 1fr))"><span></span>${head}${body}</div></div>`
        : '<p class="meta">Nothing booked or open this week.</p>'}
    </section>`;
  }

  async function loadOpen(lp) {
    if (lp in opens) return;
    opens[lp] = undefined;
    try {
      const r = await call('adminMeetings', { lp });
      if (!r.openLp) oldServer = true;
      keepOpen(r);
      if (!(lp in opens) || opens[lp] === undefined) opens[lp] = null;
    } catch (err) {
      opens[lp] = null;
    }
    if (pageLp === lp) render();
  }

  function fillLinks() {
    const form = $('#meet-form');
    if (form.dataset.filled) return;
    form.dataset.filled = '1';
    $('#meet-all').value = res.links.ALL || '';
    $('#meet-all-box').open = !!res.links.ALL;
    const now = ctx.data().currentLp;
    $('#meet-links').innerHTML = ctx.data().lps.map(lp => `<label class="meet-link${lp === now ? ' now' : ''}"><span>${lp}${lp === now ? '<small>now</small>' : ''}</span>
      <input name="${lp}" type="url" placeholder="${res.links.ALL ? 'Uses the page below' : 'https://calendar.app.google/…'}" value="${esc(res.links[lp] || '')}" spellcheck="false" aria-label="${lp} booking page"></label>`).join('');
    form.words.value = res.words || '';
  }

  async function match(email, studentId) {
    busy('Saving…');
    try {
      res = await call('adminMeetingMatch', { email, studentId });
      render();
      ctx.redraw();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  }

  $('#meet-lp').addEventListener('change', (e) => { pageLp = e.target.value; render(); });
  $('#meet-refresh').addEventListener('click', () => open().catch(err => toast(err.message)));
  $('#meet-body').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-email]');
    if (sel && sel.value) match(sel.dataset.email, sel.value);
  });
  $('#meet-body').addEventListener('click', (e) => {
    const wk = e.target.closest('[data-week]');
    if (wk) {
      const lp = pageLp;
      const weeks = lpWeeks(lp, (res.items || []).filter(b => b.lp === lp).map(b => b.start).concat((opens[lp] || []).map(o => o.start)));
      const i = weeks.indexOf(weekStart[lp]) + Number(wk.dataset.week);
      if (weeks[i] != null) { weekStart[lp] = weeks[i]; render(); }
      return;
    }
    const st = e.target.closest('[data-student]');
    if (st) return ctx.openStudent(st.dataset.student);
    const ig = e.target.closest('[data-ignore]');
    if (ig && confirm(`Stop showing bookings from ${ig.dataset.ignore}?`)) match(ig.dataset.ignore, '-');
  });
  $('#meet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const links = { ALL: e.target.ALL.value.trim() };
    ctx.data().lps.forEach(lp => { links[lp] = e.target[lp].value.trim(); });
    busy('Saving…');
    try {
      res = await call('adminSaveMeetings', { links, words: e.target.words.value.trim() });
      toast('Saved.');
      render();
      ctx.redraw();
    } catch (err) {
      toast(/unknown request/i.test(err.message) ? 'Meetings start working after the next WiSH update.' : err.message);
    } finally {
      busy(false);
    }
  });

  return {
    load, reset, cardLine, tile, studentCard, open,
    setLp: (lp) => { pageLp = lp; },
    link: linkFor,
  };
}
