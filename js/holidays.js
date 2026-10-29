// Federal holidays (the days federal offices close, moved to Friday or Monday when they fall on
// a weekend), the same list Code.gs uses, so the dashboard can flag dates without asking it.
const Holidays = (() => {
  function federal(y) {
    const iso = (m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const nth = (m, dow, n) => { // n-th weekday of a month; n = -1 for the last one
      if (n > 0) return 1 + ((dow - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return last - ((new Date(Date.UTC(y, m - 1, last)).getUTCDay() - dow + 7) % 7);
    };
    const observed = (m, d) => {
      const t = new Date(Date.UTC(y, m - 1, d)), day = t.getUTCDay();
      if (day === 6) t.setUTCDate(d - 1);
      if (day === 0) t.setUTCDate(d + 1);
      return t.toISOString().slice(0, 10);
    };
    return [
      [observed(1, 1), 'New Year’s Day'], [iso(1, nth(1, 1, 3)), 'Martin Luther King Jr. Day'],
      [iso(2, nth(2, 1, 3)), 'Presidents’ Day'], [iso(5, nth(5, 1, -1)), 'Memorial Day'],
      [observed(6, 19), 'Juneteenth'], [observed(7, 4), 'Independence Day'], [iso(9, nth(9, 1, 1)), 'Labor Day'],
      [iso(10, nth(10, 1, 2)), 'Columbus Day / Indigenous Peoples’ Day'], [observed(11, 11), 'Veterans Day'],
      [iso(11, nth(11, 4, 4)), 'Thanksgiving'], [observed(12, 25), 'Christmas Day'],
    ].map(h => ({ from: h[0], to: h[0], name: h[1] }));
  }

  /** What's wrong with a date as a school day: 'Saturday', 'Veterans Day', … or ''. */
  function problem(ymd, school = []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return '';
    const day = new Date(+m[1], m[2] - 1, +m[3]).getDay();
    if (day === 0 || day === 6) return day === 0 ? 'a Sunday' : 'a Saturday';
    const h = [...school, ...federal(+m[1])].find(x => ymd >= x.from && ymd <= (x.to || x.from));
    return h ? `a holiday (${h.name || 'no school'})` : '';
  }

  return { federal, problem };
})();
