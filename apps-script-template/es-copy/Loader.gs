/**
 * WiSH, in an ES's own copy of the WiSH sheet.
 *
 * This file is all the code an ES's copy holds, and it never needs changing. The rest of WiSH
 * (the "engine": uploads, reviews, reminders, everything) is es-engine/Code.gs in WiSH's GitHub.
 * This file loads it, keeps a copy in the ES's Drive, and looks for a newer one every hour, so
 * when Joon updates WiSH every ES copy picks it up on its own. Nobody has to paste or redeploy.
 *
 *  - The engine runs here, as the ES, in their own Google account, with the permissions they
 *    approved for this copy (appsscript.json). An engine that needs a new permission would make
 *    every ES approve again, so the list there already covers everything WiSH does.
 *  - A newer engine is only used once it is checked: it must read as code, be an ES copy's code
 *    (no admin password) and say its version. The one before it is kept, and used if the new one
 *    won't start.
 *  - Google only lets this file's function names be called from outside (the web app link, the
 *    WiSH menu, timers), so each one hands over to the engine function with the same name.
 */

const LOADER_VERSION = 1;
// Where the engine comes from, tried in order.
const ENGINE_URLS = [
  'https://raw.githubusercontent.com/jkjpcem/workit/main/es-engine/Code.gs',
  'https://jkjpcem.github.io/workit/es-engine/Code.gs',
];
const ENGINE_FILE_NAME = 'WiSH engine (WiSH keeps this up to date, please leave it here).js';
const ENGINE_OLD_FILE_NAME = 'WiSH engine, previous (please leave it here).js';
const ENGINE_CHECK_HOURS = 1;
const ENGINE_CACHE_SECONDS = 6 * 60 * 60;
const ENGINE_CHUNK = 90 * 1024;

// ---------- What Google calls ----------

function doGet(e) { return wish_('doGet', arguments); }

function doPost(e) {
  // Answered here, so the dashboard can see the loader even if the engine won't start.
  if (/"action"\s*:\s*"engineStatus"/.test(String((e && e.postData && e.postData.contents) || ''))) {
    return ContentService.createTextOutput(JSON.stringify(engineStatus_())).setMimeType(ContentService.MimeType.JSON);
  }
  return wish_('doPost', arguments);
}

/** Runs with no permissions when the sheet opens, so it can't load the engine: the menu is kept here. */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('WiSH');
    menuItems_().forEach((item, n) => menu.addItem(item[0], 'wishMenu' + (n + 1)));
    menu.addToUi();
  } catch (ignored) {}
}

function setupFromMenu() { engineTimer_(); return wish_('setupFromMenu', arguments); }
function setup() { engineTimer_(); return wish_('setup', arguments); }
function wishTick() { return wish_('wishTick', arguments); }
function checkPeEmails() { return wish_('checkPeEmails', arguments); }
function recheckPeEmails() { return wish_('recheckPeEmails', arguments); }
function turnOnEmails() { return wish_('turnOnEmails', arguments); }
function allowCalendar() { return wish_('allowCalendar', arguments); }
// Spare names for menu items and timers a later engine may add (see menuItems_).
function wishMenu1() { return menuRun_(0); }
function wishMenu2() { return menuRun_(1); }
function wishMenu3() { return menuRun_(2); }
function wishMenu4() { return menuRun_(3); }
function wishMenu5() { return menuRun_(4); }

/** Hourly timer: fetches a newer engine if there is one. Also handy to run by hand. */
function wishEngineCheck() { return updateEngine_(); }

// ---------- Loading the engine ----------

let ENGINE_ = null;

function wish_(name, args) {
  const fn = engine_()(name);
  if (typeof fn !== 'function') throw new Error('WiSH is updating. Please try again in a minute.');
  return fn.apply(null, Array.prototype.slice.call(args));
}

/** The engine, started once per run. Returns a lookup: function name -> engine function. */
function engine_() {
  if (ENGINE_) return ENGINE_;
  let src = savedEngine_();
  if (!src) { updateEngine_(); src = savedEngine_(); }
  if (!src) throw new Error('WiSH couldn’t load. Check the internet connection and try again in a minute.');
  try {
    ENGINE_ = start_(src);
  } catch (err) {
    // The newest engine won't start: go back to the one before it until a fixed one comes out.
    const old = readFile_(ENGINE_OLD_FILE_NAME);
    if (!old) throw err;
    ENGINE_ = start_(old);
    setProp_('ENGINE_ERROR', 'v' + versionOf_(src) + ' would not start: ' + err.message);
  }
  return ENGINE_;
}

function start_(src) {
  // The engine's top-level names stay inside this function; eval(n) finds its functions by name.
  return new Function(src + '\n;return function (n) { try { return eval(n); } catch (e) { return undefined; } };')();
}

/** The engine kept in this account: the cache first (fast), then the Drive file. */
function savedEngine_() {
  const cache = CacheService.getScriptCache();
  const parts = Number(cache.get('engine_parts')) || 0;
  if (parts) {
    const keys = [];
    for (let i = 0; i < parts; i++) keys.push('engine_' + i);
    const got = cache.getAll(keys);
    if (keys.every(k => got[k] !== undefined && got[k] !== null)) return keys.map(k => got[k]).join('');
  }
  const src = readFile_(ENGINE_FILE_NAME);
  if (src) cacheEngine_(src);
  return src;
}

function cacheEngine_(src) {
  const cache = CacheService.getScriptCache();
  const values = {};
  let n = 0;
  for (let i = 0; i < src.length; i += ENGINE_CHUNK) values['engine_' + n++] = src.slice(i, i + ENGINE_CHUNK);
  try {
    cache.putAll(values, ENGINE_CACHE_SECONDS);
    cache.put('engine_parts', String(n), ENGINE_CACHE_SECONDS);
  } catch (ignored) { /* too big for the cache: the Drive file still works */ }
}

// ---------- Getting a newer engine ----------

/** Fetches the engine and keeps it if it changed and passes the checks. Returns what happened. */
function updateEngine_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return 'Another update is running.';
  try {
    setProp_('ENGINE_CHECKED', String(Date.now()));
    let src = '', problem = '';
    for (let i = 0; i < ENGINE_URLS.length && !src; i++) {
      try {
        const res = UrlFetchApp.fetch(ENGINE_URLS[i] + '?t=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
        if (res.getResponseCode() !== 200) { problem = ENGINE_URLS[i] + ' answered ' + res.getResponseCode(); continue; }
        const text = res.getContentText('UTF-8');
        problem = engineProblem_(text);
        if (!problem) src = text;
      } catch (err) {
        problem = err.message;
      }
    }
    if (!src) { setProp_('ENGINE_ERROR', problem); return 'Not updated: ' + problem; }
    const hash = hash_(src);
    if (hash === getProp_('ENGINE_HASH') && readFile_(ENGINE_FILE_NAME)) { setProp_('ENGINE_ERROR', ''); return 'Up to date (v' + versionOf_(src) + ').'; }
    const current = readFile_(ENGINE_FILE_NAME);
    if (current) writeFile_(ENGINE_OLD_FILE_NAME, current);
    writeFile_(ENGINE_FILE_NAME, src);
    CacheService.getScriptCache().remove('engine_parts');
    cacheEngine_(src);
    PropertiesService.getScriptProperties().setProperties({
      ENGINE_HASH: hash, ENGINE_VERSION: String(versionOf_(src)), ENGINE_UPDATED: String(Date.now()), ENGINE_ERROR: '',
    });
    ENGINE_ = null;
    return 'Updated to v' + versionOf_(src) + '.';
  } finally {
    lock.releaseLock();
  }
}

/** '' when the text is an engine this copy may run, else what's wrong with it. */
function engineProblem_(text) {
  if (!versionOf_(text)) return 'no version number';
  if (!/^function doPost\(/m.test(text)) return 'not WiSH code';
  // Only the ES-copy code, never a main copy with a real admin password.
  if (!/^const ADMIN_PASSWORD = '';$/m.test(text)) return 'not ES-copy code';
  try { new Function(text); } catch (err) { return 'does not read as code: ' + err.message; }
  return '';
}

function versionOf_(text) {
  const m = /^const WORKIT_VERSION = (\d+);/m.exec(text || '');
  return m ? Number(m[1]) : 0;
}

function engineStatus_() {
  const p = PropertiesService.getScriptProperties();
  return {
    ok: true, app: 'workit', loaderVersion: LOADER_VERSION,
    engineVersion: Number(p.getProperty('ENGINE_VERSION')) || 0,
    engineUpdated: Number(p.getProperty('ENGINE_UPDATED')) || 0,
    engineChecked: Number(p.getProperty('ENGINE_CHECKED')) || 0,
    engineError: p.getProperty('ENGINE_ERROR') || '',
  };
}

/** Puts in the hourly update check once. (Timers need the permission the setup step grants.) */
function engineTimer_() {
  if (getProp_('ENGINE_TIMER')) return;
  try {
    const have = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'wishEngineCheck');
    if (!have) ScriptApp.newTrigger('wishEngineCheck').timeBased().everyHours(ENGINE_CHECK_HOURS).create();
    setProp_('ENGINE_TIMER', '1');
  } catch (ignored) { /* not allowed yet: tried again next time */ }
}

// ---------- Menu ----------

/** [label, engine function] pairs. A later engine can change them with setProp WISH_MENU. */
function menuItems_() {
  try {
    const items = JSON.parse(getProp_('WISH_MENU') || 'null');
    if (Array.isArray(items) && items.length) return items.slice(0, 5);
  } catch (ignored) {}
  return [['Set up WiSH', 'setupFromMenu']];
}

function menuRun_(n) {
  const item = menuItems_()[n];
  if (!item) return null;
  engineTimer_();
  return wish_(item[1], []);
}

// ---------- Storage ----------

/** The engine files live next to this copy's sheet (or in My Drive if that can't be found). */
function engineFolder_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const parents = ss && DriveApp.getFileById(ss.getId()).getParents();
    if (parents && parents.hasNext()) return parents.next();
  } catch (ignored) {}
  return DriveApp.getRootFolder();
}

function engineFile_(name) {
  const key = name === ENGINE_FILE_NAME ? 'ENGINE_FILE' : 'ENGINE_OLD_FILE';
  const id = getProp_(key);
  if (id) {
    try {
      const file = DriveApp.getFileById(id);
      if (!file.isTrashed()) return file;
    } catch (ignored) {}
  }
  return null;
}

function readFile_(name) {
  const file = engineFile_(name);
  return file ? file.getBlob().getDataAsString('UTF-8') : '';
}

function writeFile_(name, text) {
  const have = engineFile_(name);
  if (have) return have.setContent(text);
  const file = engineFolder_().createFile(name, text, MimeType.PLAIN_TEXT);
  file.setDescription('Part of WiSH. WiSH replaces this file by itself when it updates.');
  setProp_(name === ENGINE_FILE_NAME ? 'ENGINE_FILE' : 'ENGINE_OLD_FILE', file.getId());
}

function getProp_(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }
function setProp_(key, value) { PropertiesService.getScriptProperties().setProperty(key, value); }

function hash_(text) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}
