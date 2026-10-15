// Core subjects: each reporting period, every student needs one annotated sample in
// English, Math, Social Studies and Science. A student with no class in one of those
// areas that period fills that slot with an annotated elective instead (a different
// elective sample for each such slot). The ES can also mark a slot done by hand, for
// work annotated outside Workit. Used by the Core subjects page and the viewer panel.
function AdminCore(ctx) {
  const { $, esc, toast, busy, call, show } = ctx;

  const AREAS = ['English', 'Math', 'Social Studies', 'Science'];
  const RPS = { RP1: ['LP1', 'LP2', 'LP3'], RP2: ['LP4', 'LP5', 'LP6'], RP3: ['LP7', 'LP8'] };
  // Checked in this order, so "Political Science" is Social Studies, not Science.
  const KEYWORDS = [
    ['English', /\b(english|ela|literature|lit|language arts|composition|writing)\b/i],
    ['Math', /\b(math\w*|algebra|geometry|pre-?calc\w*|calculus|statistics|stats|trigonometry|trig)\b/i],
    ['Social Studies', /\b(history|government|govt|gov|economics|econ|civics|geography|social studies|political)\b/i],
    [null, /\bcomputer science\b/i],
    ['Science', /\b(science|biology|bio|chemistry|chem|physics|anatomy|physiology|environmental|astronomy|geology|zoology|botany|marine)\b/i],
  ];

  let core = null;     // last adminCore answer
  let loading = null;

  function load(force) {
    if (force || !core) {
      loading = call('adminCore').then(res => { core = res; return res; }).finally(() => { loading = null; });
    }
    return loading || Promise.resolve(core);
  }

  const rpOf = (lp) => Object.keys(RPS).find(rp => RPS[rp].includes(lp)) || 'RP1';

  /** The core area a class counts for, or null for an elective. */
  function autoArea(name) {
    for (const [area, re] of KEYWORDS) if (re.test(name)) return area;
    return null;
  }
  function areaOf(name) {
    const set = core && core.sorting[String(name).trim().toLowerCase()];
    if (set) return set === 'None' ? null : set;
    return autoArea(name);
  }

  // A student's classes over a reporting period (RP2 crosses from Sem 1 into Sem 2).
  function classesFor(student, rp) {
    const seen = {}, out = [];
    RPS[rp].forEach(lp => Classes.forLp(student, lp).forEach(c => {
      if (!seen[c.name.toLowerCase()]) { seen[c.name.toLowerCase()] = true; out.push(c.name); }
    }));
    return out;
  }

  function ended(rp) {
    const lps = RPS[rp], last = (core.lpDates || {})[lps[lps.length - 1]];
    if (!last) return false;
    const today = new Date().toISOString().slice(0, 10);
    return today > last.end;
  }

  /**
   * The 4 slots for one student and reporting period:
   * { area, elective, hint: [class names], state: 'annotated'|'manual'|'needed'|'missed', item, note }
   */
  function slots(student, rp) {
    const classes = classesFor(student, rp);
    const electives = classes.filter(c => !areaOf(c));
    const items = core.items
      .filter(i => i.studentId === student.id && RPS[rp].includes(i.lp))
      .sort((a, b) => a.finalizedAt - b.finalizedAt);
    const marks = core.marks.filter(m => m.studentId === student.id && m.rp === rp);
    const late = ended(rp);

    const out = AREAS.map(area => {
      const mine = classes.filter(c => areaOf(c) === area);
      const slot = { area, elective: !mine.length, hint: mine.length ? mine : electives, state: late ? 'missed' : 'needed' };
      if (!slot.elective) slot.item = items.find(i => areaOf(i.subject) === area);
      return slot;
    });

    // Elective slots each take a different annotated elective sample, different classes first.
    const pool = items.filter(i => !areaOf(i.subject));
    const used = new Set(), usedClass = new Set();
    out.filter(s => s.elective).forEach(s => {
      const pick = pool.find(i => !used.has(i.id) && !usedClass.has(i.subject.toLowerCase())) || pool.find(i => !used.has(i.id));
      if (pick) { s.item = pick; used.add(pick.id); usedClass.add(pick.subject.toLowerCase()); }
    });

    out.forEach(s => {
      const mark = marks.find(m => m.area === s.area);
      if (s.item) s.state = 'annotated';
      else if (mark) { s.state = 'manual'; s.note = mark.note; }
    });
    return out;
  }

  const done = (s) => s.state === 'annotated' || s.state === 'manual';
  const hintText = (s) => s.elective
    ? (s.hint.length ? `Elective: ${s.hint.join(' or ')}` : 'Any elective')
    : s.hint.join(' or ');

  function cell(student, rp, s) {
    const label = s.elective ? `<span class="core-elective">elective</span>` : '';
    if (s.state === 'annotated') {
      const what = esc(s.item.subject) + ' · ' + esc(s.item.lp);
      return `<td class="core-cell annotated">${s.item.finalUrl
        ? `<a href="${esc(s.item.finalUrl)}" target="_blank" rel="noopener" title="Open the annotated copy">✓ ${what}</a>`
        : `✓ ${what}`}${label}</td>`;
    }
    const btn = (cls, text, title) => `<button type="button" class="core-mark ${cls}" data-student="${esc(student.id)}" data-area="${esc(s.area)}" title="${esc(title)}">${text}</button>`;
    if (s.state === 'manual') {
      return `<td class="core-cell manual">${btn('undo', `✓ Marked done${s.note ? `<small>${esc(s.note)}</small>` : ''}`, 'Click to undo')}${label}</td>`;
    }
    return `<td class="core-cell ${s.state}">
      <span class="core-need">${s.state === 'missed' ? 'Missed' : 'Needed'}</span>
      <small>${esc(hintText(s))}</small>
      ${btn('', 'Mark done', 'Mark done by hand, for work annotated outside Workit')}</td>`;
  }

  // ---------- Core subjects page ----------

  let rp = null;

  async function open() {
    busy('Loading core subjects…');
    try {
      await load(true);
      if (!rp) rp = rpOf(core.currentLp);
      render();
      show('core');
    } catch (err) {
      toast(/Unknown request/i.test(err.message) ? 'Your Workit script needs updating before Core subjects works.' : err.message);
    } finally {
      busy(false);
    }
  }

  function render() {
    $('#core-rp').innerHTML = Object.keys(RPS).map(r =>
      `<option value="${r}" ${r === rp ? 'selected' : ''}>${r} (${RPS[r][0]}–${RPS[r][RPS[r].length - 1]})</option>`).join('');
    const onlyMissing = $('#core-missing').checked;
    const rows = core.students.map(st => ({ st, slots: slots(st, rp) }))
      .sort((a, b) => a.st.lastName.localeCompare(b.st.lastName) || a.st.firstName.localeCompare(b.st.firstName));
    const complete = rows.filter(r => r.slots.every(done)).length;
    const filled = rows.reduce((n, r) => n + r.slots.filter(done).length, 0);
    $('#core-summary').innerHTML = rows.length
      ? `<b>${complete} of ${rows.length}</b> students complete for ${rp} · ${filled} of ${rows.length * 4} subjects covered${ended(rp) ? ' · this reporting period has ended' : ''}`
      : 'No students yet.';
    const shown = onlyMissing ? rows.filter(r => !r.slots.every(done)) : rows;
    $('#core-body').innerHTML = shown.length ? shown.map(r => `
      <tr>
        <th scope="row">${esc(r.st.name)}<small>${r.slots.filter(done).length} of 4</small></th>
        ${r.slots.map(s => cell(r.st, rp, s)).join('')}
      </tr>`).join('')
      : `<tr><td colspan="5" class="empty">${rows.length ? 'Every student is complete. 🎉' : 'No students yet.'}</td></tr>`;
    renderSorting();
  }

  function renderSorting() {
    const names = {};
    core.students.forEach(st => [...(st.sem1 || []), ...(st.sem2 || [])].forEach(c => { names[c.name.toLowerCase()] = c.name; }));
    const list = Object.values(names).sort((a, b) => a.localeCompare(b));
    const opt = (v, label, sel) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${label}</option>`;
    $('#core-sorting').innerHTML = list.length ? `<div class="core-sort-grid">${list.map(name => {
      const set = core.sorting[name.toLowerCase()] || '';
      const auto = autoArea(name);
      return `<label><span>${esc(name)}</span>
        <select data-class="${esc(name)}">
          ${opt('', `Automatic: ${auto || 'Elective'}`, set)}
          ${AREAS.map(a => opt(a, a, set)).join('')}
          ${opt('None', 'Elective (not core)', set)}
        </select></label>`;
    }).join('')}</div>` : '<p class="hint">No classes yet.</p>';
  }

  $('#open-core').addEventListener('click', open);
  $('#core-back').addEventListener('click', () => ctx.openDash());
  $('#core-rp').addEventListener('change', (e) => { rp = e.target.value; render(); });
  $('#core-missing').addEventListener('change', render);

  $('#core-body').addEventListener('click', async (e) => {
    const b = e.target.closest('.core-mark');
    if (!b) return;
    const student = core.students.find(s => s.id === b.dataset.student);
    const area = b.dataset.area;
    await mark(student, rp, area, b.classList.contains('undo'));
    render();
  });

  async function mark(student, forRp, area, undo) {
    let note = '';
    if (undo) {
      if (!confirm(`Take away the “done” mark for ${student.name}, ${area}, ${forRp}?`)) return false;
    } else {
      note = prompt(`Mark ${area} done for ${student.name} in ${forRp}?\n\nAdd a note if you like (for example: Annotated on paper in LP1). Click OK to mark it done.`, '');
      if (note === null) return false;
    }
    busy('Saving…');
    try {
      await call('adminCoreMark', { studentId: student.id, rp: forRp, area, done: !undo, note });
      core.marks = core.marks.filter(m => !(m.studentId === student.id && m.rp === forRp && m.area === area));
      if (!undo) core.marks.push({ studentId: student.id, rp: forRp, area, note: note.trim() });
      toast(undo ? 'Mark taken away.' : `✓ ${area} marked done for ${forRp}.`);
      return true;
    } catch (err) {
      toast(err.message);
      return false;
    } finally {
      busy(false);
    }
  }

  $('#core-sorting').addEventListener('change', async (e) => {
    const sel = e.target.closest('select[data-class]');
    if (!sel) return;
    const name = sel.dataset.class;
    try {
      await call('adminCoreSort', { name, area: sel.value });
      if (sel.value) core.sorting[name.toLowerCase()] = sel.value; else delete core.sorting[name.toLowerCase()];
      render();
      toast(`${name}: ${sel.value === 'None' ? 'elective' : sel.value || `automatic (${autoArea(name) || 'elective'})`}.`);
    } catch (err) {
      toast(err.message);
    }
  });

  // ---------- Panel beside a sample in the viewer ----------

  let panelFor = null;

  async function panel(it) {
    const box = $('#v-core');
    panelFor = it;
    try {
      await load(false);
    } catch (err) {
      box.hidden = true;
      return;
    }
    if (panelFor !== it) return;
    const student = core.students.find(s => s.id === it.studentId);
    if (!student) { box.hidden = true; return; }
    const forRp = rpOf(it.lp);
    const list = slots(student, forRp);
    const area = areaOf(it.subject);
    const counted = list.find(s => s.item && s.item.id === it.id);
    let tag = '';
    if (counted) {
      tag = `<p class="core-tag ok">✓ This sample covers ${esc(counted.area)}${counted.elective ? ' (elective)' : ''} for ${forRp}.</p>`;
    } else {
      const missing = list.filter(s => !done(s));
      const fills = area ? missing.find(s => s.area === area && !s.elective) : missing.find(s => s.elective);
      if (fills) tag = `<p class="core-tag fill">★ Annotating this fills ${esc(fills.area)}${fills.elective ? ' (elective)' : ''} for ${forRp}.</p>`;
      else if (area && list.find(s => s.area === area && done(s))) tag = `<p class="core-tag">${esc(area)} is already covered for ${forRp}.</p>`;
    }
    box.innerHTML = `
      <h2>Core subjects · ${forRp}</h2>
      ${tag}
      <ul class="core-mini">${list.map(s => `
        <li class="${s.state}">
          <span class="core-dot"></span>
          <span><b>${esc(s.area)}</b>${s.elective ? ' <span class="core-elective">elective</span>' : ''}
            <small>${s.state === 'annotated' ? `✓ ${esc(s.item.subject)} · ${esc(s.item.lp)}`
              : s.state === 'manual' ? `✓ Marked done${s.note ? `: ${esc(s.note)}` : ''}`
              : `${s.state === 'missed' ? 'Missed. ' : ''}${esc(hintText(s))}`}</small></span>
        </li>`).join('')}</ul>
      <p class="hint"><button type="button" class="linkish" id="v-core-open">Open Core subjects</button></p>`;
    box.hidden = false;
    $('#v-core-open').addEventListener('click', () => { ctx.closeViewer(); rp = forRp; open(); });
  }

  /** The viewer just filed a sample: count it (or stop counting it) right away. */
  function filed(it) {
    if (!core) return;
    core.items = core.items.filter(i => i.id !== it.id);
    if (it.finalizedAt && it.filedAs === 'Annotated') {
      core.items.push({ id: it.id, studentId: it.studentId, lp: it.lp, subject: it.subject, finalUrl: it.finalUrl, finalizedAt: it.finalizedAt });
    }
  }

  return { open, panel, filed, reset: () => { core = null; } };
}
