// Talks to the ES's Google Apps Script (Code.gs).
// SCRIPT_URL in config.js is the main copy. A student link like worksample.app/smith (or the
// older .../?es=smith) points the app at that ES's own copy instead; the main copy says where
// it is (esLookup).

const Api = (() => {
  const home = () => (window.WORKIT_CONFIG || {}).SCRIPT_URL;
  const ES_KEY = 'workit.es';
  const isAdminPage = document.body.classList.contains('admin');

  // { es, name, url } for the ES this device's students belong to, or null for the main copy.
  let es = null;
  try { es = JSON.parse(localStorage.getItem(ES_KEY)) || null; } catch { es = null; }
  // The ES is the last part of the address (worksample.app/smith), or ?es=smith on older links.
  const RESERVED = ['', 'index', 'index.html', 'admin', 'admin.html', 'workit'];
  const last = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '').toLowerCase();
  const fromPath = /^[a-z0-9._-]{3,30}$/.test(last) && !RESERVED.includes(last) ? last : '';
  // The plain link (worksample.app with no name) asks for the ES's school email first, unless
  // this device already remembers its ES.
  let param = new URLSearchParams(location.search).get('es') || fromPath;
  // A student signed in on the plain link back when it went straight to DEFAULT_ES stays there.
  let legacy = false;
  try { legacy = !param && !es && !!localStorage.getItem('workit.session'); } catch { /* ignore */ }
  if (legacy) param = (window.WORKIT_CONFIG || {}).DEFAULT_ES || '';
  if (!isAdminPage && param) {
    const id = param.trim().toLowerCase();
    if (!es || es.es !== id) {
      // Another ES's link: whoever was signed in on this device belongs to someone else.
      if (!legacy) {
        try { localStorage.removeItem('workit.session'); } catch { /* ignore */ }
      }
      es = { es: id, name: '', url: '' };
      saveEs();
    }
  }
  function saveEs() {
    try { localStorage.setItem(ES_KEY, JSON.stringify(es)); } catch { /* ignore */ }
  }

  // Looks the ES up each time the app opens, so a link that was turned off stops working.
  let lookupError = null;
  const ready = (async () => {
    if (isAdminPage || !es || !navigator.onLine) return;
    try {
      const res = await send(home(), { action: 'esLookup', es: es.es });
      es.name = res.name;
      es.url = res.scriptUrl;
      saveEs();
    } catch (err) {
      if (err.offline) return;
      lookupError = err;
      es.url = '';
      saveEs();
    }
  })();

  // Requests that only read. A stuck one is safe to send again; saves never are.
  const READS = ['login', 'list', 'file', 'checkLink', 'esLookup', 'esLogin', 'schoolDates',
    'adminOverview', 'adminStudent', 'adminFile', 'adminRoster', 'adminCore', 'superEsList', 'ping'];
  const READ_WAIT = 60000;   // Google sometimes takes a while to wake up; past this, try once more.
  const SAVE_WAIT = 180000;  // uploads can be large, so saves get longer before giving up.

  async function send(target, body) {
    if (!target) throw new Error('Your ES has not finished setting up WiSH yet.');
    const isRead = READS.includes(body.action);
    let res;
    for (let attempt = 0; ; attempt++) {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), isRead ? READ_WAIT : SAVE_WAIT);
      try {
        // text/plain keeps this a "simple" request, which Apps Script accepts from any site.
        res = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          signal: stop.signal,
        });
        break;
      } catch {
        if (!navigator.onLine) {
          const err = new Error('You are offline.');
          err.offline = true;
          throw err;
        }
        if (isRead && attempt === 0) continue;
        const err = new Error(stop.signal.aborted
          ? 'WiSH is slow to answer right now. Try again in a minute.'
          : 'Could not reach WiSH. Try again in a minute.');
        err.offline = true;
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    let json;
    try { json = await res.json(); } catch { throw new Error('WiSH sent back something unexpected. Try again.'); }
    if (!json.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
  }

  // Throws an Error with a student-friendly message when anything goes wrong.
  // opts.url sends to that copy (the dashboard uses it; '' is the main copy).
  async function call(action, payload = {}, opts = {}) {
    if (opts.url !== undefined) return send(opts.url || home(), { action, ...payload });
    await ready;
    if (es && !es.url) throw lookupError || new Error('Your ES hasn’t finished setting up WiSH yet.');
    return send(es ? es.url : home(), { action, ...payload });
  }

  // The link an ES gives their students: worksample.app/smith. The old GitHub address can't
  // open made-up paths, so there it stays .../?es=smith.
  function studentLink(user) {
    const base = new URL('./', location.href).href;
    if (!user) return base;
    return location.hostname === 'jkjpcem.github.io' ? `${base}?es=${encodeURIComponent(user)}` : base + encodeURIComponent(user);
  }

  // The ES turning work in for a student (dashboard > Upload for student): every request goes to
  // the ES's own copy and carries the ES's sign-in, so the server knows it's the ES.
  function actAsEs(o) {
    const inner = api.call;
    api.call = (action, payload = {}) =>
      inner(action, { ...payload, byEs: true, adminUser: o.adminUser, adminKey: o.adminKey }, { url: o.url || '' });
  }

  // The landing page: the ES whose school email starts with this (their username is that part),
  // or an Error saying it wasn't found. Doesn't change which ES this device belongs to.
  async function findEs(handle) {
    const id = String(handle || '').split('@')[0].trim().toLowerCase();
    const notFound = () => new Error(`There’s no ES in WiSH with ${id || 'that'}@suncoastcharter.org. Check the spelling, or ask your ES for their WiSH link.`);
    if (!/^[a-z0-9._-]{3,30}$/.test(id) || RESERVED.includes(id)) throw notFound();
    let res;
    try {
      res = await send(home(), { action: 'esLookup', es: id });
    } catch (err) {
      if (err.offline) throw err;
      if (/isn’t right|isn't right/.test(err.message)) throw notFound();
      if (/turned off/.test(err.message)) throw new Error('That ES’s WiSH is turned off right now. Ask your ES.');
      if (/finished setting up/.test(err.message)) throw new Error('That ES hasn’t finished setting up WiSH yet. Ask your ES when it’s ready.');
      throw err;
    }
    return { es: id, name: res.name || '' };
  }
  // "Not your ES?": forget this device's ES so the landing page asks again.
  function forgetEs() {
    es = null;
    try { localStorage.removeItem(ES_KEY); } catch { /* ignore */ }
  }

  const api = {
    call,
    findEs,
    forgetEs,
    hasEs: () => !!es,
    actAsEs,
    ready,
    studentLink,
    configured: () => !!home(),
    esName: () => (es && es.name) || '',
  };
  return api;
})();
