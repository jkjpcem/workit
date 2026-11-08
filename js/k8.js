// K-8 students (grades K to 8) turn in 2 work samples per LP, in any subjects, instead of one
// per class. They still need all 4 core subjects (English, Math, Social Studies, Science) in
// each reporting period. So WiSH recommends the cores still missing this RP, and in the last
// LP of an RP (LP3, LP6, LP8) the missing cores are required. Code.gs (k8Plan_) matches this.
const K8 = (() => {
  const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
  const PER_LP = 2;
  const AREAS = ['English', 'Math', 'Social Studies', 'Science'];
  const RPS = { RP1: ['LP1', 'LP2', 'LP3'], RP2: ['LP4', 'LP5', 'LP6'], RP3: ['LP7', 'LP8'] };
  // Same as js/core.js. Checked in this order, so "Political Science" is Social Studies.
  const KEYWORDS = [
    ['English', /\b(english|ela|literature|lit|language arts|composition|writing|reading)\b/i],
    ['Math', /\b(math\w*|algebra|geometry|pre-?calc\w*|calculus|statistics|stats|trigonometry|trig)\b/i],
    ['Social Studies', /\b(history|government|govt|gov|economics|econ|civics|geography|social studies|political)\b/i],
    [null, /\bcomputer science\b/i],
    ['Science', /\b(science|biology|bio|chemistry|chem|physics|anatomy|physiology|environmental|astronomy|geology|zoology|botany|marine)\b/i],
  ];

  const is = (student) => !!student && GRADES.includes(String(student.grade || '').trim().toUpperCase());
  const rpOf = (lp) => Object.keys(RPS).find(rp => RPS[rp].includes(lp)) || 'RP1';
  const isLast = (lp) => { const l = RPS[rpOf(lp)]; return l[l.length - 1] === lp; };

  /** The core area a class counts for (null = elective). sorting is the ES's own sorting, by lower-case name. */
  function areaOf(name, sorting) {
    const set = sorting && sorting[String(name || '').trim().toLowerCase()];
    if (set) return set === 'None' ? null : set;
    for (const [area, re] of KEYWORDS) if (re.test(name)) return area;
    return null;
  }

  // A sample counts once it's in and not sent back for a redo or set aside by the ES.
  const counts = (i) => !i.trashedAt && !i.redo && !i.setAside && !Classes.isPe(i.subject);

  /**
   * What a K-8 student has and still needs. items: the student's uploads (any LP).
   * opts: { sorting, marks: [{ rp, area }] }
   * Returns { rp, last, have, left, history: [{ lp, subjects }], cores: [{ area, done, hint }],
   *           missing: [core], recommend: [core], required: [core], toDo, done }
   */
  function plan(student, items, lp, opts = {}) {
    const rp = rpOf(lp), lps = RPS[rp], last = isLast(lp);
    const inRp = items.filter(i => lps.includes(i.lp) && counts(i));
    const have = inRp.filter(i => i.lp === lp).length;
    const left = Math.max(0, PER_LP - have);
    const seen = {}, classes = [];
    lps.forEach(l => Classes.forLp(student, l).forEach(c => {
      const k = c.name.toLowerCase();
      if (!seen[k] && !Classes.isPe(c.name)) { seen[k] = true; classes.push(c.name); }
    }));
    const area = (n) => areaOf(n, opts.sorting);
    const electives = classes.filter(c => !area(c));
    const marks = (opts.marks || []).filter(m => m.rp === rp);
    const cores = AREAS.map(a => {
      const mine = classes.filter(c => area(c) === a);
      return { area: a, elective: !mine.length, hint: mine.length ? mine : electives,
        done: marks.some(m => m.area === a) || (!!mine.length && inRp.some(i => area(i.subject) === a)) };
    });
    // A core with no class this RP is filled by an elective sample, a different one for each.
    const used = new Set();
    cores.filter(c => c.elective && !c.done).forEach(c => {
      const pick = inRp.find(i => !area(i.subject) && !used.has(i.id));
      if (pick) { used.add(pick.id); c.done = true; }
    });
    const missing = cores.filter(c => !c.done);
    const required = last ? missing : [];
    const recommend = last ? [] : missing.slice(0, left);
    const toDo = last ? Math.max(left, missing.length) : left;
    const history = lps.slice(0, lps.indexOf(lp) + 1).map(l => ({
      lp: l, subjects: inRp.filter(i => i.lp === l).map(i => i.subject).filter((s, n, a) => a.indexOf(s) === n),
    }));
    return { rp, last, have, left, history, cores, missing, recommend, required, toDo, done: toDo === 0 };
  }

  /** "English" or, for a core with no class, "an elective (for Science)"; with the class names as a hint. */
  const label = (c) => c.elective ? `an elective (in place of ${c.area})` : c.area;
  const hint = (c) => c.hint.length ? c.hint.join(' or ') : '';

  return { GRADES, PER_LP, AREAS, RPS, is, rpOf, isLast, areaOf, plan, label, hint };
})();
