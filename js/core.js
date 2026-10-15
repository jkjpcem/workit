// Core subjects: each reporting period, every student needs one annotated sample in
// English, Math, Social Studies and Science. A student with no class in one of those
// areas that period fills that slot with an annotated elective instead (a different
// elective sample for each such slot). The ES can also mark a slot done by hand, for
// work annotated outside Workit. Shown beside the dashboard and beside a sample in the viewer.
function AdminCore(ctx) {
  const { $, esc, toast, busy, call } = ctx;

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
  const SHORT = { English: 'Eng', Math: 'Math', 'Social Studies': 'SS', Science: 'Sci' };
  // What was annotated in one LP, as subjects: "Eng, Math, Piano" (electives by class name).
  function lpAreas(studentId, lp) {
    const names = [];
    core.items.filter(i => i.studentId === studentId && i.lp === lp).forEach(i => {
      const a = areaOf(i.subject);
      const label = a ? SHORT[a] : i.subject;
      if (!names.includes(label)) names.push(label);
    });
    return names;
  }
  const lpLine = (studentId, lp) => {
    const names = lpAreas(studentId, lp);
    return `<span class="${names.length ? '' : 'none'}"><b>${lp}</b> ${names.length ? esc(names.join(', ')) : '—'}</span>`;
  };
  const hintText = (s) => s.elective
    ? (s.hint.length ? `Elective: ${s.hint.join(' or ')}` : 'Any elective')
    : s.hint.join(' or ');

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
    const gains = [];
    if (counted) {
      tag = `<p class="core-tag ok">✓ This sample covers ${esc(counted.area)}${counted.elective ? ' (elective)' : ''} for ${forRp}.</p>`;
    } else {
      const missing = list.filter(s => !done(s));
      const fills = area ? missing.find(s => s.area === area && !s.elective) : missing.find(s => s.elective);
      if (fills) gains.push(`fills ${esc(fills.area)}${fills.elective ? ' (elective)' : ''} for ${forRp}`);
      else if (area && list.find(s => s.area === area && done(s))) tag = `<p class="core-tag">${esc(area)} is already covered for ${forRp}.</p>`;
    }
    if (gains.length) tag = `<p class="core-tag fill">★ Annotating this ${gains.join(' and ')}.</p>` + tag;
    box.innerHTML = `
      <h2>${esc(student.firstName)} · ${forRp} (${RPS[forRp][0]}–${RPS[forRp][RPS[forRp].length - 1]})</h2>
      ${tag}
      <h3 class="core-sub">Core subjects: ${list.filter(done).length} of 4</h3>
      <ul class="core-mini">${list.map(s => `
        <li class="${s.state}">
          <span class="core-dot"></span>
          <span><b>${esc(s.area)}</b>${s.elective ? ' <span class="core-elective">elective</span>' : ''}
            <small>${s.state === 'annotated' ? `✓ ${esc(s.item.subject)} · ${esc(s.item.lp)}`
              : s.state === 'manual' ? `✓ Marked done${s.note ? `: ${esc(s.note)}` : ''}`
              : `${s.state === 'missed' ? 'Missed. ' : ''}${esc(hintText(s))}`}</small></span>
        </li>`).join('')}</ul>
      <h3 class="core-sub">Annotated so far</h3>
      <div class="core-lps">${RPS[forRp].map(lp => lpLine(student.id, lp)).join('')}</div>`;
    box.hidden = false;
  }

  // ---------- Dashboard: running totals beside the student cards ----------

  let failed = false;

  /** Loads once, then calls back so the dashboard can draw the totals and card strips. */
  function whenReady(redraw) {
    if (core) return true;
    if (!loading && !failed) load(false).then(redraw, () => { failed = true; });
    return false;
  }

  function strip(student, lp) {
    if (!core) return '';
    const forRp = rpOf(lp);
    return `<div class="core-strip" title="Core subjects for ${forRp}">${slots(student, forRp).map(s =>
      `<span class="${s.state}">${done(s) ? '✓ ' : ''}${SHORT[s.area]}${s.elective ? '*' : ''}</span>`).join('')}</div>`;
  }

  // Each student and how many core subjects they're missing for the reporting period.
  // Click a name to see what was annotated when, what's missing, and to mark one done.
  let sideLp = null, expanded = null;
  const niceDay = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });

  function side(viewLp) {
    const box = $('#rp-side');
    if (!core) { box.hidden = true; return; }
    sideLp = viewLp;
    const forRp = rpOf(viewLp);
    const lps = RPS[forRp];
    const late = ended(forRp);
    const rows = core.students.map(st => {
      const list = slots(st, forRp);
      return { st, list, missing: list.filter(x => !done(x)).length };
    }).sort((a, b) => b.missing - a.missing || a.st.lastName.localeCompare(b.st.lastName) || a.st.firstName.localeCompare(b.st.firstName));
    const complete = rows.filter(r => !r.missing).length;
    const range = [(core.lpDates || {})[lps[0]], (core.lpDates || {})[lps[lps.length - 1]]];
    const nice = (ymd) => new Date(ymd + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' });
    box.innerHTML = `
      <h2>${forRp} core subjects</h2>
      <p class="meta">${lps[0]}–${lps[lps.length - 1]}${range[0] && range[1] ? ` · ${nice(range[0].start)} to ${nice(range[1].end)}` : ''}</p>
      <p class="side-sum"><b>${complete} of ${rows.length}</b> students have all 4</p>
      <ul class="side-students">${rows.map(r => `
        <li class="${r.missing ? (late ? 'late' : 'open') : 'done'} ${expanded === r.st.id ? 'expanded' : ''}">
          <button type="button" class="side-name" data-act="toggle" data-student="${esc(r.st.id)}" aria-expanded="${expanded === r.st.id}">
            <span>${esc(r.st.name)}</span>
            <b>${r.missing ? `missing ${r.missing} of 4` : '✓ done'}</b>
          </button>
          ${expanded === r.st.id ? detail(r.st, forRp, r.list) : ''}
        </li>`).join('')}</ul>`;
    box.hidden = false;
  }

  function detail(st, forRp, list) {
    const btn = (act, area, text) => `<button type="button" class="core-mark ${act === 'undo' ? 'undo' : ''}" data-act="${act}" data-student="${esc(st.id)}" data-area="${esc(area)}">${text}</button>`;
    return `<div class="side-detail">
      <ul>${list.map(x => {
        const name = `<b>${esc(x.area)}</b>${x.elective ? ' <span class="core-elective">elective</span>' : ''}`;
        if (x.state === 'annotated') {
          const what = `${esc(x.item.subject)} · ${esc(x.item.lp)}${x.item.finalizedAt ? `, ${esc(niceDay(x.item.finalizedAt))}` : ''}`;
          return `<li class="annotated"><span class="core-dot"></span><span>${name}
            <small>✓ ${x.item.finalUrl ? `<a href="${esc(x.item.finalUrl)}" target="_blank" rel="noopener">${what}</a>` : what}</small></span></li>`;
        }
        if (x.state === 'manual') {
          return `<li class="manual"><span class="core-dot"></span><span>${name}
            <small>✓ Marked done${x.note ? `: ${esc(x.note)}` : ''} ${btn('undo', x.area, 'Undo')}</small></span></li>`;
        }
        return `<li class="${x.state}"><span class="core-dot"></span><span>${name}
          <small>${x.state === 'missed' ? 'Missed. ' : 'Missing. '}${esc(hintText(x))}</small>
          ${btn('mark', x.area, 'Mark done')}</span></li>`;
      }).join('')}</ul>
      <button type="button" class="btn small" data-act="samples" data-student="${esc(st.id)}">Open ${esc(st.firstName)}’s samples</button>
    </div>`;
  }

  $('#rp-side').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !core) return;
    const st = core.students.find(x => x.id === b.dataset.student);
    if (!st) return;
    const act = b.dataset.act;
    if (act === 'toggle') expanded = expanded === st.id ? null : st.id;
    if (act === 'samples') return ctx.openStudent(st.id);
    if (act === 'mark' || act === 'undo') {
      if (!(await mark(st, rpOf(sideLp), b.dataset.area, act === 'undo'))) return;
      return ctx.redraw();
    }
    side(sideLp);
  });

  /** The viewer just filed a sample: count it (or stop counting it) right away. */
  function filed(it) {
    if (!core) return;
    core.items = core.items.filter(i => i.id !== it.id);
    if (it.finalizedAt && it.filedAs === 'Annotated') {
      core.items.push({ id: it.id, studentId: it.studentId, lp: it.lp, subject: it.subject, finalUrl: it.finalUrl, finalizedAt: it.finalizedAt });
    }
  }

  return { panel, filed, whenReady, strip, side, reset: () => { core = null; failed = false; } };
}
