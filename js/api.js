// Talks to the ES's Google Apps Script (Code.gs).

const Api = (() => {
  const url = () => (window.WORKIT_CONFIG || {}).SCRIPT_URL;

  // Throws an Error with a student-friendly message when anything goes wrong.
  async function call(action, payload = {}) {
    if (!url()) throw new Error('Your ES has not finished setting up Workit yet.');
    let res;
    try {
      // text/plain keeps this a "simple" request, which Apps Script accepts from any site.
      res = await fetch(url(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch {
      const err = new Error(navigator.onLine ? 'Could not reach Workit. Try again in a minute.' : 'You are offline.');
      err.offline = true;
      throw err;
    }
    let json;
    try { json = await res.json(); } catch { throw new Error('Workit sent back something unexpected. Try again.'); }
    if (!json.ok) throw new Error(json.error || 'Something went wrong.');
    return json;
  }

  return { call, configured: () => !!url() };
})();
