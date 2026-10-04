// Class lists per semester. LP1-LP4 are Semester 1 and LP5-LP8 are Semester 2.
// An accelerated class, typed with "(Accel)" after its name, is finished in one
// semester, so it needs 2 samples per LP instead of 1. These match Code.gs.
const Classes = (() => {
  const ACCEL = /\(\s*accel(erated)?\s*\)/ig;

  const semOf = (lp) => (Number(String(lp || '').replace(/\D/g, '')) >= 5 ? 2 : 1);

  function parse(text) {
    const seen = {};
    return String(text || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => {
      const accel = new RegExp(ACCEL.source, 'i').test(s);
      return { name: s.replace(ACCEL, '').replace(/\s+/g, ' ').trim(), need: accel ? 2 : 1 };
    }).filter(c => c.name && !seen[c.name.toLowerCase()] && (seen[c.name.toLowerCase()] = true));
  }

  // "US History A H" -> "US History B H", "Algebra 1A H" -> "Algebra 1B H".
  function toB(name) {
    const re = /(^|[\s\d])A(?=\s|$)/g;
    let m, at = -1;
    while ((m = re.exec(name))) at = m.index + m[1].length;
    return at === -1 ? name : name.slice(0, at) + 'B' + name.slice(at + 1);
  }

  // What Sem 2 is when the ES leaves it blank: A classes become B. Accelerated classes
  // (done in Sem 1) and one-semester classes with no A, like Econ, are left out.
  const sem2From = (sem1) => sem1.filter(c => c.need === 1 && toB(c.name) !== c.name).map(c => ({ name: toB(c.name), need: 1 }));

  // A student's classes for one LP. Older sign-ins only have a flat list.
  function forLp(student, lp) {
    if (!student) return [];
    const list = semOf(lp) === 2 ? student.sem2 : student.sem1;
    return list || (student.classes || []).map(name => ({ name, need: 1 }));
  }

  return { semOf, parse, toB, sem2From, forLp };
})();
