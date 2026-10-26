// LP meetings: families book a time on your Google Calendar booking page for each LP, and
// WiSH reads those bookings from your calendar (Code.gs readBookings_). Shown as a line on each
// student card, a card on the student page, and the Meetings page (links, who booked, who
// hasn't, and bookings from emails that aren't on the roster yet).
function AdminMeetings(ctx) {
  const { $, esc, toast, busy, show, call } = ctx;

  let res = null;       // last adminMeetings answer
  let loading = null;
  let pageLp = null;

  function load(force) {
    if (force || (!res && !loading)) {
      loading = call('adminMeetings', force ? { fresh: true } : {})
        .then(r => { res = r; return r; })
        .catch(err => { if (/unknown request/i.test(err.message)) res = { old: true, links: {}, items: [] }; throw err; })
        .finally(() => { loading = null; });
    }
    return loading || Promise.resolve(res);
  }
  function reset() { res = null; $('#meet-form').dataset.filled = ''; }

  const active = (b) => !b.ignored;
  // An LP's own booking link, or the one for every LP.
  const linkFor = (lp) => (res && res.links ? res.links[lp] || res.links.ALL || '' : '');
  const forLp = (lp) => (res ? res.items : []).filter(b => b.lp === lp && active(b));
  const forStudent = (id) => (res ? res.items : []).filter(b => b.studentIds.includes(id));
  // Only shown for an LP that has a booking link or already has bookings.
  const on = (lp) => !!res && !res.old && !res.error && (!!linkFor(lp) || forLp(lp).length > 0);

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
    return ['meet', `${n} of ${students.length}`, 'Booked an LP meeting'];
  }

  /** Card on the student page: every LP with a link or a booking. */
  function studentCard(s) {
    const box = $('#student-meetings');
    if (!res || res.old || res.error) { box.hidden = true; return; }
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
    fillLinks();
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
    const notYet = data.students.filter(s => !booked.has(s.id) && s.active !== false)
      .sort((a, b) => (a.lastName || a.name).localeCompare(b.lastName || b.name));
    const link = linkFor(lp);
    const whoText = (b) => b.who.map(w => esc(w.name || w.email) + (w.name ? ` <span class="meta">${esc(w.email)}</span>` : '')).join(', ');
    const options = '<option value="">Choose a student…</option>' + data.students
      .slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    body.innerHTML = `
      <div class="tiles">
        <div class="tile meet"><b>${booked.size} of ${data.students.length}</b><span>Students booked for ${esc(lp)}</span></div>
        <div class="tile"><b>${notYet.length}</b><span>Not booked yet</span></div>
        <div class="tile ${unmatched.length ? 'redo' : ''}"><b>${unmatched.length}</b><span>Booked by someone not on the roster</span></div>
      </div>
      ${link ? '' : `<p class="note">${esc(lp)} has no booking link yet. Paste it under “Booking pages” so families can book from WiSH.</p>`}
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

  function fillLinks() {
    const form = $('#meet-form');
    if (form.dataset.filled) return;
    form.dataset.filled = '1';
    $('#meet-all').value = res.links.ALL || '';
    $('#meet-links').innerHTML = ctx.data().lps.map(lp => `<label class="meet-link"><span>${lp}</span>
      <input name="${lp}" type="url" placeholder="Same as every LP" value="${esc(res.links[lp] || '')}" spellcheck="false"></label>`).join('');
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
