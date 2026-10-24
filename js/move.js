// When WiSH moves to its own web address, the old address sends everyone there.
// To switch, set NEW_HOME in config.js (for example 'https://wish.example.org/').
(() => {
  const home = (window.WORKIT_CONFIG || {}).NEW_HOME;
  if (!home || location.hostname !== 'jkjpcem.github.io') return;
  const target = new URL(location.pathname.replace(/^\/workit\/?/, ''), home);
  target.search = location.search;
  target.hash = location.hash;
  const go = () => location.replace(target.href);
  // Offline, the new address won't open either, so stay here for now.
  if (!navigator.onLine) return;
  // Uploads still waiting to send are saved under this address, so let them send first.
  // The student page sends them by itself; the next visit then moves over.
  if (typeof Store === 'undefined') return go();
  Store.all()
    .then(items => { if (!items.some(i => i.status === 'pending')) go(); })
    .catch(go);
})();
