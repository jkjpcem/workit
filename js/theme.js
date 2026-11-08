// Applies the ES's chosen color theme and Light/Dark mode before the page draws.
// Saved in this browser only (Settings > Colors). Loaded in <head> so there is no flash.
(function () {
  const PALETTES = ['classic', 'charcoal', 'paper', 'ocean', 'electric', 'tangerine', 'bubblegum', 'bumblebee'];
  const MODES = ['auto', 'light', 'dark'];
  function read(key, list) {
    try { const v = localStorage.getItem(key); return list.includes(v) ? v : list[0]; } catch { return list[0]; }
  }
  function apply(palette, mode) {
    const root = document.documentElement;
    if (palette === 'classic') root.removeAttribute('data-palette'); else root.setAttribute('data-palette', palette);
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
  }
  window.WishTheme = {
    PALETTES, MODES,
    get: () => ({ palette: read('wish.palette', PALETTES), mode: read('wish.mode', MODES) }),
    set(palette, mode) {
      try { localStorage.setItem('wish.palette', palette); localStorage.setItem('wish.mode', mode); } catch { /* still applies for now */ }
      apply(palette, mode);
    },
  };
  const t = window.WishTheme.get();
  apply(t.palette, t.mode);
})();
