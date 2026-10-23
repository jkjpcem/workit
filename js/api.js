// Talks to the ES's Google Apps Script (Code.gs).
// SCRIPT_URL in config.js is the main copy. A student link like .../?es=smith points the app
// at that ES's own copy instead; the main copy says where it is (esLookup).

const Api = (() => {
  const home = () => (window.WORKIT_CONFIG || {}).SCRIPT_URL;
  const ES_KEY = 'workit.es';
  const isAdminPage = document.body.classList.contains('admin');

  // { es, name, url } for the ES this device's students belong to, or null for the main copy.
  let es = null;
  try { es = JSON.parse(localStorage.getItem(ES_KEY)) || null; } catch { es = null; }
  const param = new URLSearchParams(location.search).get('es');
  if (!isAdminPage && param) {
    const id = param.trim().toLowerCase();
    if (!es || es.es !== id) {
      // Another ES's link: whoever was signed in on this device belongs to someone else.
      try { localStorage.removeItem('workit.session'); } catch { /* ignore */ }
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

  return {
    call,
    ready,
    configured: () => !!home(),
    esName: () => (es && es.name) || '',
  };
})();
