/**
 * WiSH backend. Runs as you, in your personal Google account.
 *
 *  - Homework PDFs go to:   My Drive / WiSH Homework / Uploads / LP1 ... LP8
 *  - You manage everything in the "WiSH Admin" spreadsheet in that folder:
 *      Students     one row per student: name, grade, city, Sem 1 classes, Sem 2 classes
 *      Settings     the current Learning Period
 *      Submissions  every upload, with a link to the file and your review
 *  - Approved work goes to WiSH Homework / Approved / LP# Annotated (your 2 annotated samples
 *    per LP) or LP# Extra (approved, not annotated).
 *  - The admin dashboard (admin.html in the app) signs in with ADMIN_USERNAME / ADMIN_PASSWORD below.
 *
 * Setup steps are in SETUP.md.
 *
 * The same code also runs in each other ES's own copy (made from the WiSH template sheet).
 * In those copies ADMIN_USERNAME and ADMIN_PASSWORD are blank: the ES signs in through the main
 * copy (yours), which keeps the "ES accounts" tab and hands their dashboard a key for their copy.
 */

// Blank in an ES's own copy: they sign in with their WiSH ES account instead.
const ADMIN_USERNAME = '';
const ADMIN_PASSWORD = '';

// Bumped when this file changes, so the dashboard can tell an ES their copy is out of date.
const WORKIT_VERSION = 30;
// The ES dashboard. An ES's copy sends them back here when it has set itself up.
const APP_URL = 'https://jkjpcem.github.io/workit/';

const ROOT_FOLDER_NAME = 'WiSH Homework';
const ADMIN_SHEET_NAME = 'WiSH Admin';
// Names from before the app was renamed (Workit), still looked for by name.
const OLD_ROOT_FOLDER_NAME = 'Workit Homework';
const OLD_ADMIN_SHEET_NAME = 'Workit Admin';
const UPLOADS_FOLDER_NAME = 'Uploads';
const APPROVED_FOLDER_NAME = 'Approved';
const TRASH_FOLDER_NAME = 'Trash';
const TRASH_DAYS = 60;  // a sample in WiSH's Trash is deleted for good this many days after it was trashed
const OLD_FINAL_FOLDER_NAME = 'Approved and Annotated'; // used before 2026-10-04; setup() moves its files
const FILED_AS = ['Annotated', 'Extra'];
const ANNOTATED_NEEDED = 2;
// LP1-LP4 are Semester 1 and LP5-LP8 are Semester 2.
const SEM2_FIRST_LP = 5;
const STUDENT_HEADERS = ['First name', 'Last name', 'Grade', 'City', 'Student ID',
  'Sem 1 classes (comma separated; add (Accel) after an accelerated class)',
  'Sem 2 classes (leave blank to use Sem 1 with A changed to B)', 'Student email', 'Family email (more than one: separate with commas)',
  'Status (Active or Inactive)'];
const LEARNING_PERIODS = ['LP1', 'LP2', 'LP3', 'LP4', 'LP5', 'LP6', 'LP7', 'LP8'];
const GRADES = ['8', '9', '10', '11', '12'];
const REDO_REASONS = ['Missing name', 'Missing date', 'Missing subject', 'Missing score/grade/feedback'];
const MAX_BYTES = 30 * 1024 * 1024;
const UPLOADS_PER_DAY = 30; // per student, so a guessed sign-in can't fill your Drive

// Columns in the Submissions sheet (1-based).
const SUB = {
  RECEIVED: 1, STUDENT_ID: 2, NAME: 3, LP: 4, SUBJECT: 5, DATE_DONE: 6, SCORE: 7,
  FEEDBACK: 8, COMMENTS: 9, PAGES: 10, FILE: 11, FAVORITE: 12, UPLOAD_ID: 13, FILE_ID: 14, THUMB: 15,
  APPROVED: 16, REDO: 17, REASONS: 18, NOTIFIED: 19, REPLACED_BY: 20, RESUBMIT_OF: 21,
  ANNOTATIONS: 22, FINALIZED: 23, FINAL_FILE: 24, FINAL_ID: 25, MINUTES: 26, SOURCE: 27, FILED_AS: 28, REDO_NOTE: 29, FAMILY_NOTES: 30, TRASHED: 31, TRASHED_BY: 32, REDO_MARKED: 33, APPROVED_AT: 34,
  PAGE_DATE: 35, PAGE_CHECK: 36,
};
const SUB_HEADERS = ['Received', 'Student ID', 'Student name', 'LP', 'Subject', 'Date completed',
  'Grade / score', 'Feedback', 'Comments', 'Pages', 'File', 'Favorite', 'Upload ID', 'File ID', 'Thumbnail',
  'Approved', 'Redo', 'Redo reasons', 'Student saw redo', 'Resubmitted as', 'Resubmission of',
  'Annotations', 'Finalized', 'Final file', 'Final file ID', 'Minutes spent', 'Uploaded as', 'Filed as', 'Redo note', 'Family notes', 'Trashed', 'Trashed by', 'Redo marked', 'Approved at',
  'Date on page', 'Page check'];
// Where each LP's start and end dates live on the Settings tab (header row, then LP1..LP8).
const LP_DATES_ROW = 5;
const SOURCES = ['scan', 'photo', 'pdf', 'docx', 'gdoc', 'mixed'];

/**
 * Run from the editor: creates the folders and the admin sheet, and asks for permission.
 * Safe to run again. It also moves folders from the older layout into the new one.
 */
function setup() {
  const root = getRootFolder_();
  const moved = moveOldFolders_(root);
  LEARNING_PERIODS.forEach(lp => {
    getUploadFolder_(lp);
    getApprovedFolder_(lp, 'Annotated');
    getApprovedFolder_(lp, 'Extra');
  });
  const ss = getAdmin_();
  getSubs_();
  studentHeaders_();
  memoClear_();
  Logger.log('Ready.' + (moved ? '\n' + moved : '') + '\nFolder: ' + root.getUrl() + '\nAdmin sheet: ' + ss.getUrl());
}

/**
 * Older versions kept LP1..LP8 and "Approved and Annotated" right inside WiSH Homework.
 * Moves them to Uploads / LP# and Approved / LP# Annotated. Links in the sheet keep working.
 */
function moveOldFolders_(root) {
  let count = 0;
  const uploads = getChildFolder_(root, UPLOADS_FOLDER_NAME);
  LEARNING_PERIODS.forEach(lp => {
    const old = root.getFoldersByName(lp);
    while (old.hasNext()) {
      const folder = old.next();
      const there = uploads.getFoldersByName(lp);
      if (!there.hasNext()) {
        folder.moveTo(uploads);
        count++;
        continue;
      }
      const target = there.next();
      const files = folder.getFiles();
      while (files.hasNext()) { files.next().moveTo(target); count++; }
      if (!folder.getFiles().hasNext() && !folder.getFolders().hasNext()) folder.setTrashed(true);
    }
  });
  const finals = root.getFoldersByName(OLD_FINAL_FOLDER_NAME);
  while (finals.hasNext()) {
    const folder = finals.next();
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const m = /_(LP[1-8])(_|\.|$)/.exec(file.getName());
      if (!m) continue; // left where it is so nothing is lost
      file.moveTo(getApprovedFolder_(m[1], 'Annotated'));
      count++;
    }
    if (!folder.getFiles().hasNext() && !folder.getFolders().hasNext()) folder.setTrashed(true);
  }
  return count ? 'Moved ' + count + ' item(s) into the new Uploads / Approved folders.' : '';
}

/** Opening the web app URL in a browser shows this. Handy for checking it works. */
function doGet() {
  if (isMain_()) return json_({ ok: true, app: 'workit', version: WORKIT_VERSION });
  // In an ES's copy, opening its web app link (from Google's Deploy box) finishes setup.
  const url = String(ScriptApp.getService().getUrl() || '');
  // Only a real visit to the live link proves the copy is on (Google's own check can't tell).
  if (/\/exec$/.test(url)) PropertiesService.getScriptProperties().setProperty('WEBAPP_URL', url);
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#121a2e;max-width:520px;margin:60px auto;text-align:center">' +
    '<h1 style="color:#13204a">WiSH is on ✓</h1><p>Your copy of WiSH is working. Click the button to finish setting up.</p>' +
    '<p>' + button_(APP_URL + 'admin.html#connect=' + encodeURIComponent(url), 'Finish in WiSH →', '_top') + '</p></div>')
    .setTitle('WiSH');
}

/** In an ES's own copy of the template sheet, adds the WiSH menu. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('WiSH').addItem('Set up WiSH', 'setupFromMenu').addToUi();
  } catch (ignored) {}
}

/**
 * WiSH > Set up WiSH (in an ES's copy): makes the folders and the admin sheet, then shows
 * the one step Google only lets a person do: turning the copy on in the Deploy box.
 * (A copy can't deploy itself: Google keeps the Apps Script API off in every copy's own project.)
 */
function setupFromMenu() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // already running from an earlier click
  try {
    setup();
    const url = webAppUrl_();
    if (url) {
      return dialog_('WiSH is set up',
        '<p>Your <b>WiSH Homework</b> folder is in Google Drive, and WiSH is on for your students.</p>' +
        '<p>' + button_(APP_URL + 'admin.html#connect=' + encodeURIComponent(url), 'Finish in WiSH →') + '</p>');
    }
    dialog_('Your folders are ready. One last step',
      '<p>Turn WiSH on for your students:</p><ol style="padding-left:20px;margin:0 0 12px">' +
      '<li>Click ' + button_('https://script.google.com/d/' + ScriptApp.getScriptId() + '/edit', 'Open the Deploy page') +
      '<br><span style="font-size:13px;color:#5b6579">If a box says “You’re signed in as…”, click <b>OK</b>.</span></li>' +
      '<li>Click the blue <b>Deploy</b> button (top right), then <b>New deployment</b>.</li>' +
      '<li>Click the gear ⚙ next to <i>Select type</i>, then <b>Web app</b>.</li>' +
      '<li>Who has access: <b>Anyone</b>. Click <b>Deploy</b>. If Google asks, click <b>Authorize access</b> and allow it like before.</li>' +
      '<li>Click the <b>Web app</b> link that appears. A WiSH page opens: click <b>Finish in WiSH</b>.</li></ol>', 470);
  } finally {
    lock.releaseLock();
  }
}

/**
 * This copy's web app link once its live link has been opened, else ''.
 * (ScriptApp.getService() reports a link even before the ES deploys, so it can't be trusted here.)
 */
function webAppUrl_() {
  return PropertiesService.getScriptProperties().getProperty('WEBAPP_URL') || '';
}

function dialog_(title, body, height) {
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#121a2e">' + body + '</div>')
    .setWidth(460).setHeight(height || 280);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function button_(href, label, target) {
  return '<a href="' + esc_(href) + '" target="' + (target || '_blank') + '" rel="noopener" style="display:inline-block;background:#3456d6;color:#fff;' +
    'padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">' + esc_(label) + '</a>';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const student = {
      login: login_, upload: upload_, list: list_, favorite: favorite_, file: file_, remove: remove_, restore: restore_, familyNotes: familyNotes_, ackAlerts: ackAlerts_, checkLink: checkLink_, checkPage: checkPage_,
    };
    const admin = {
      adminOverview: adminOverview_, adminStudent: adminStudent_, adminFile: adminFile_,
      adminReview: adminReview_, adminSetLp: adminSetLp_, adminAnnotate: adminAnnotate_, adminFinalize: adminFinalize_,
      adminRoster: adminRoster_, adminSaveRoster: adminSaveRoster_, adminSetLpDates: adminSetLpDates_,
      adminCore: adminCore_, adminCoreMark: adminCoreMark_, adminCoreSort: adminCoreSort_,
      adminTrash: adminTrash_, adminTrashList: adminTrashList_, adminRestore: adminRestore_, adminDeleteNow: adminDeleteNow_,
      adminEmailSettings: adminEmailSettings_, adminSaveEmailSettings: adminSaveEmailSettings_,
      adminMeetings: adminMeetings_, adminSaveMeetings: adminSaveMeetings_, adminMeetingMatch: adminMeetingMatch_,
    };
    const es = {
      esLogin: esLogin_, esForgot: esForgot_, esLookup: esLookup_, esChangePassword: esChangePassword_, esSaveSetup: esSaveSetup_, esClaim: esClaim_, schoolDates: schoolDates_,
    };
    const superAdmin = {
      superEsList: superEsList_, superEsAdd: superEsAdd_, superEsReset: superEsReset_, superEsSetActive: superEsSetActive_, superChangePassword: adminChangePassword_,
    };
    // Requests that only read use the remembered copy of the sheet; anything else reads the
    // sheet itself and makes the next request read it fresh too.
    MEMO_GEN_ = null;
    HOLIDAYS_ = null;
    FRESH_ = READ_ONLY_ACTIONS.indexOf(body.action) === -1;
    // Once a day, the first request empties samples that have been in the Trash for 60 days.
    if (emptyTrashDaily_()) { memoClear_(); FRESH_ = true; }
    let out;
    if (student[body.action]) out = student[body.action](body);
    else if (es[body.action]) out = es[body.action](body);
    else if (superAdmin[body.action]) out = checkSuper_(body) || superAdmin[body.action](body);
    else if (admin[body.action]) out = checkAdmin_(body) || admin[body.action](body);
    else out = { ok: false, error: 'Unknown request.' };
    if (FRESH_) memoClear_();
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: 'Server error: ' + err.message });
  }
}

// ---------- Student actions ----------

function login_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: "We couldn't find you. Did you enter all the letters correctly?" };
  noteSignIn_(student.id);
  // Redo requests the student hasn't seen yet are shown once, right after sign-in.
  const all = readSubs_().items.filter(i => i.studentId === student.id);
  const mine = all.filter(i => !i.trashedAt);
  const alerts = mine.filter(i => i.redo && !i.notified && !i.replacedBy)
    .map(i => ({ id: i.id, lp: i.lp, subject: i.subject, dateCompleted: i.dateCompleted, reasons: i.reasons, redoNote: i.redoNote }));
  // The student's uploads come along, so the app doesn't have to ask a second time.
  return { ok: true, student: student, currentLp: getCurrentLp_(), lps: LEARNING_PERIODS, lpDates: getLpDates_(), holidays: allHolidays_(), alerts: alerts,
    items: mine.map(publicItem_), trash: studentTrash_(all), meetings: studentMeetings_(student.id) };
}

/** Remembers when each student last signed in (shown in the Student Roster). Kept apart from the
 *  Students tab so saving the roster never erases it. */
function noteSignIn_(id) {
  try {
    const props = PropertiesService.getScriptProperties();
    const seen = JSON.parse(props.getProperty('LAST_SIGNIN') || '{}');
    seen[id] = Date.now();
    props.setProperty('LAST_SIGNIN', JSON.stringify(seen));
  } catch (e) { /* never block a sign-in over this */ }
}

function ackAlerts_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  const ids = (body.ids || []).map(String);
  const subs = readSubs_();
  subs.items.forEach(i => {
    if (i.studentId === student.id && ids.indexOf(i.id) !== -1) subs.sheet.getRange(i.row, SUB.NOTIFIED).setValue(true);
  });
  return { ok: true };
}

function upload_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found. Ask your ES.' };
  if (student.active === false) return { ok: false, error: 'Turning in work is paused on your account. Ask your ES.' };
  if (LEARNING_PERIODS.indexOf(body.lp) === -1) return { ok: false, error: 'Unknown Learning Period.' };
  if (!clean_(body.subject, 60)) return { ok: false, error: 'Pick a subject.' };
  const source = SOURCES.indexOf(body.source) !== -1 ? body.source : 'scan';
  if (source === 'gdoc' ? !body.link : !body.data) return { ok: false, error: 'No file was attached.' };
  const dateProblem = checkDate_(body.lp, clean_(body.dateCompleted, 20));
  if (dateProblem) return { ok: false, error: dateProblem };
  // The date written on page 1, read by the page check or typed by the student (see checkPage_).
  const pageDate = clean_(body.pageDate, 10);
  const pageProblem = pageDate ? checkDate_(body.lp, pageDate, 'The date on your page') : '';
  if (pageProblem) return { ok: false, error: pageProblem };
  // Date completed is the date of the assignment, so it has to match the date WiSH read on the page.
  if (pageDate && /^date read/.test(String(body.pageCheck || '')) && pageDate !== clean_(body.dateCompleted, 20)) {
    return { ok: false, error: 'The date on your assignment is ' + niceDay_(pageDate) + ', but you entered ' + niceDay_(clean_(body.dateCompleted, 20)) + '. Fix the date, or retake the picture.' };
  }
  const uploadId = /^[A-Za-z0-9_-]{1,60}$/.test(String(body.uploadId || '')) ? String(body.uploadId) : '';
  const resubmitOf = clean_(body.resubmitOf, 60);

  const bytes = source === 'gdoc' ? null : Utilities.base64Decode(body.data);
  if (bytes && bytes.length > MAX_BYTES) return { ok: false, error: 'That file is too big.' };
  let linked = null;
  if (source === 'gdoc') {
    try {
      linked = googleFileInfo_(body.link);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const subs = readSubs_();
    // A retry of an upload that already arrived: don't save it twice.
    const existing = uploadId && findItem_(subs, student.id, uploadId, true);
    if (existing) return { ok: true, fileUrl: existing.fileUrl, duplicate: true };
    const dayAgo = Date.now() - 24 * 3600000;
    if (subs.items.filter(i => i.studentId === student.id && i.receivedAt > dayAgo).length >= UPLOADS_PER_DAY) {
      return { ok: false, error: 'That’s the most uploads WiSH takes from one student in a day. Try again tomorrow, or ask your ES.' };
    }

    const folder = getUploadFolder_(body.lp);
    const name = uniqueName_(folder, workName_(student, body.lp, clean_(body.subject, 60)));
    // A Word file or Google Doc/Slides is turned into a PDF so it opens and can be annotated like the rest.
    let pdfBytes = bytes;
    try {
      if (source === 'docx') pdfBytes = convertDocx_(bytes, name);
      if (source === 'gdoc') pdfBytes = googleFilePdf_(linked);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    const file = folder.createFile(Utilities.newBlob(pdfBytes, 'application/pdf', name));
    const original = resubmitOf && findItem_(subs, student.id, resubmitOf);
    file.setDescription([
      'Student: ' + student.name + ' (' + student.id + ')',
      'Subject: ' + clean_(body.subject, 60),
      'Date completed: ' + clean_(body.dateCompleted, 20),
      'Minutes spent: ' + (minutes_(body.minutes) || '(none)'),
      'Grade / score: ' + (clean_(body.score, 40) || '(none)'),
      'Feedback: ' + (clean_(body.feedback, 1000) || '(none)'),
      'Comments: ' + (clean_(body.comments, 1000) || '(none)'),
      'Pages: ' + (Number(body.pageCount) || 1),
    ].concat(linked ? ['From: ' + linked.kind + ' "' + linked.name + '" ' + linked.url] : []).concat(original ? ['Resubmission of: ' + original.subject + ', ' + original.dateCompleted] : []).join('\n'));

    const row = [];
    row[SUB.RECEIVED - 1] = new Date();
    row[SUB.STUDENT_ID - 1] = student.id;
    row[SUB.NAME - 1] = student.name;
    row[SUB.LP - 1] = body.lp;
    row[SUB.SUBJECT - 1] = cell_(clean_(body.subject, 60));
    row[SUB.DATE_DONE - 1] = clean_(body.dateCompleted, 20);
    row[SUB.SCORE - 1] = cell_(clean_(body.score, 40));
    row[SUB.FEEDBACK - 1] = cell_(clean_(body.feedback, 1000));
    row[SUB.COMMENTS - 1] = cell_(clean_(body.comments, 1000));
    row[SUB.PAGES - 1] = Number(body.pageCount) || 1;
    row[SUB.FILE - 1] = file.getUrl();
    row[SUB.FAVORITE - 1] = false;
    row[SUB.UPLOAD_ID - 1] = uploadId;
    row[SUB.FILE_ID - 1] = file.getId();
    row[SUB.THUMB - 1] = /^data:image\/jpeg;base64,[A-Za-z0-9+\/]+=*$/.test(String(body.thumb || '')) && String(body.thumb).length <= 45000
      ? String(body.thumb) : '';
    row[SUB.APPROVED - 1] = false;
    row[SUB.REDO - 1] = false;
    row[SUB.REASONS - 1] = '';
    row[SUB.NOTIFIED - 1] = '';
    row[SUB.REPLACED_BY - 1] = '';
    row[SUB.RESUBMIT_OF - 1] = original ? original.id : '';
    row[SUB.ANNOTATIONS - 1] = '';
    row[SUB.FINALIZED - 1] = '';
    row[SUB.FINAL_FILE - 1] = '';
    row[SUB.FINAL_ID - 1] = '';
    row[SUB.MINUTES - 1] = minutes_(body.minutes);
    row[SUB.SOURCE - 1] = source;
    row[SUB.PAGE_DATE - 1] = pageDate;
    row[SUB.PAGE_CHECK - 1] = cell_(clean_(body.pageCheck, 120));
    subs.sheet.appendRow(row);
    if (original) subs.sheet.getRange(original.row, SUB.REPLACED_BY).setValue(uploadId);
    return { ok: true, fileUrl: file.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

function list_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found. Ask your ES.' };
  const all = readSubs_().items.filter(i => i.studentId === student.id);
  return { ok: true, items: all.filter(i => !i.trashedAt).map(publicItem_), trash: studentTrash_(all) };
}

function favorite_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  const subs = readSubs_();
  const item = findItem_(subs, student.id, clean_(body.id, 60));
  if (!item) return { ok: false, error: 'Upload not found.' };
  subs.sheet.getRange(item.row, SUB.FAVORITE).setValue(body.favorite === true);
  return { ok: true };
}

function file_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  const item = findItem_(readSubs_(), student.id, clean_(body.id, 60));
  if (!item) return { ok: false, error: 'Upload not found.' };
  return fileData_(item);
}

/**
 * A student deletes one of their own uploads. Once the ES has approved or filed it, it stays.
 * It goes to WiSH's Trash, where it can be restored for TRASH_DAYS days.
 */
function remove_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const subs = readSubs_();
    const item = findItem_(subs, student.id, clean_(body.id, 60));
    if (!item) return { ok: true }; // already gone
    if (item.approved || item.finalizedAt) {
      return { ok: false, error: 'Your ES already approved this sample, so it can\'t be deleted. Ask your ES if it needs to change.' };
    }
    trashItem_(subs, item, 'Student');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * A student or family adds their own text boxes (score, feedback) on an upload. They're kept
 * apart from the ES's annotations and can change until the ES approves or files the sample.
 */
function familyNotes_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  const json = JSON.stringify((Array.isArray(body.notes) ? body.notes : []).slice(0, 400).map(cleanNote_));
  if (json.length > 45000) return { ok: false, error: 'There is too much on this upload to save. Undo a few pen marks or remove a text box.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const subs = readSubs_();
    const item = findItem_(subs, student.id, clean_(body.id, 60));
    if (!item) return { ok: false, error: 'Upload not found.' };
    if (item.approved || item.finalizedAt) {
      return { ok: false, error: 'Your ES already approved this sample, so the notes can\'t change now.' };
    }
    subs.sheet.getRange(item.row, SUB.FAMILY_NOTES).setValue(json);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// A family text box or pencil mark, reduced to what they use, so nothing else rides along to
// the ES's screen. A pencil mark's points are packed 2 letters per coordinate (js/ink.js).
const NOTE_FONTS = ['sans', 'serif', 'hand', 'mono'];
function cleanNote_(n) {
  n = n || {};
  const num = (v, lo, hi, d) => { const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const color = /^#[0-9a-f]{6}$/i.test(String(n.color || '')) ? n.color : '#d0342c';
  if (n.type === 'ink') {
    const d = String(n.d || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 6000);
    return { type: 'ink', page: Math.round(num(n.page, 0, 99, 0)), color: color, width: num(n.width, 0.5, 20, 3), d: d.slice(0, d.length - d.length % 4) };
  }
  return {
    page: Math.round(num(n.page, 0, 99, 0)),
    x: num(n.x, 0, 1, 0), y: num(n.y, 0, 1, 0), w: num(n.w, 0.02, 1, 0.3),
    size: num(n.size, 6, 96, 18),
    font: NOTE_FONTS.indexOf(n.font) !== -1 ? n.font : 'sans',
    bold: n.bold === true,
    color: color,
    text: String(n.text == null ? '' : n.text).slice(0, 2000),
  };
}

/** A student takes back something they trashed themselves. */
function restore_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found.' };
  return withLock_(() => {
    const subs = readSubs_();
    const item = findItem_(subs, student.id, clean_(body.id, 60), true);
    if (!item || !item.trashedAt || item.trashedBy !== 'Student') return { ok: false, error: 'This sample can’t be restored. Ask your ES.' };
    restoreItem_(subs, item);
    return { ok: true, item: publicItem_(item) };
  });
}

// ---------- WiSH's Trash ----------
// Deleting a sample moves its PDF (and filed copy) into WiSH Homework / Trash and marks its row.
// It can be restored for TRASH_DAYS days; after that it is removed for good.

function trashFolder_() {
  return getChildFolder_(getRootFolder_(), TRASH_FOLDER_NAME);
}

function deletesOn_(item) {
  return item.trashedAt + TRASH_DAYS * 24 * 3600 * 1000;
}

/** A student's own trashed samples, so they can undo a mistake. */
function studentTrash_(items) {
  return items.filter(i => i.trashedAt && i.trashedBy === 'Student').map(i => {
    const p = publicItem_(i);
    p.trashedAt = i.trashedAt;
    p.deletesOn = deletesOn_(i);
    return p;
  });
}

function trashItem_(subs, item, by) {
  const trash = trashFolder_();
  [item.fileId, item.finalId].forEach(id => {
    if (!id) return;
    try { DriveApp.getFileById(id).moveTo(trash); } catch (err) { /* already gone */ }
  });
  // Undo the links between a redo and its resubmission, so the redo can be resubmitted again.
  subs.items.forEach(other => {
    if (other.studentId !== item.studentId) return;
    if (item.resubmitOf && other.id === item.resubmitOf && other.replacedBy === item.id) {
      subs.sheet.getRange(other.row, SUB.REPLACED_BY).setValue('');
    }
    if (other.resubmitOf === item.id) subs.sheet.getRange(other.row, SUB.RESUBMIT_OF).setValue('');
  });
  const now = new Date();
  subs.sheet.getRange(item.row, SUB.TRASHED, 1, 2).setValues([[now, by]]);
  item.trashedAt = now.getTime();
  item.trashedBy = by;
}

function restoreItem_(subs, item) {
  const move = (id, folder) => { if (id) try { DriveApp.getFileById(id).moveTo(folder); } catch (err) { /* gone */ } };
  move(item.fileId, getUploadFolder_(item.lp));
  if (item.finalId && item.filedAs) move(item.finalId, getApprovedFolder_(item.lp, item.filedAs));
  subs.sheet.getRange(item.row, SUB.TRASHED, 1, 2).setValues([['', '']]);
  item.trashedAt = 0;
  item.trashedBy = '';
}

/** Removes a trashed sample for good: its files go to Google's own trash and its row is deleted. */
function deleteItem_(sheet, item) {
  [item.fileId, item.finalId].forEach(id => {
    if (!id) return;
    try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* already gone */ }
  });
  sheet.deleteRow(item.row);
}

/**
 * Once a day, on whichever request comes first: deletes samples trashed more than TRASH_DAYS ago.
 * Returns true when it changed the sheet. Needs no timer, so no extra Google permission.
 */
function emptyTrashDaily_() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (props.getProperty('TRASH_EMPTIED') === today) return false;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    if (props.getProperty('TRASH_EMPTIED') === today) return false;
    props.setProperty('TRASH_EMPTIED', today);
    const sheet = getSubs_();
    const values = sheet.getDataRange().getValues();
    const cutoff = Date.now() - TRASH_DAYS * 24 * 3600 * 1000;
    let removed = 0;
    // Bottom up, so deleting a row doesn't move the ones still to check.
    for (let r = values.length - 1; r >= 1; r--) {
      const v = values[r];
      const at = v[SUB.TRASHED - 1] instanceof Date ? v[SUB.TRASHED - 1].getTime() : (Date.parse(v[SUB.TRASHED - 1]) || 0);
      if (!at || at > cutoff) continue;
      deleteItem_(sheet, { row: r + 1, fileId: String(v[SUB.FILE_ID - 1] || ''), finalId: String(v[SUB.FINAL_ID - 1] || '') });
      removed++;
    }
    return removed > 0;
  } catch (err) {
    return false;
  } finally {
    lock.releaseLock();
  }
}

// ---------- Admin actions ----------

/** Your username and password, or (in an ES's own copy) the key their account was given. */
function checkAdmin_(body) {
  const esKey = PropertiesService.getScriptProperties().getProperty('ES_KEY');
  if (esKey && String(body.adminKey || '') === esKey) return null;
  return checkSuper_(body);
}

/** Only your username and password; blank in the copies other ES make. */
function checkSuper_(body) {
  if (!isMain_()) return { ok: false, error: 'Wrong username or password.' };
  if (lockedOut_(ADMIN_USERNAME)) return LOCKED_OUT;
  if (String(body.adminUser || '').trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase() || !superPassOk_(body.adminKey)) {
    wrongPass_(ADMIN_USERNAME);
    return { ok: false, error: 'Wrong username or password.' };
  }
  return null;
}

// After 10 wrong passwords for one account in 15 minutes, that account waits 15 minutes.
const WRONG_PASS_LIMIT = 10;
const LOCKED_OUT = { ok: false, error: 'Too many wrong passwords. Wait 15 minutes, then try again.' };
function lockedOut_(user) {
  return Number(CacheService.getScriptCache().get('wrongpass:' + String(user).toLowerCase()) || 0) >= WRONG_PASS_LIMIT;
}
function wrongPass_(user) {
  const cache = CacheService.getScriptCache();
  const key = 'wrongpass:' + String(user).toLowerCase();
  cache.put(key, String(Number(cache.get(key) || 0) + 1), 900);
}

/** Once you change your password in Settings, its hash in Script properties replaces ADMIN_PASSWORD. */
function superPassOk_(pass) {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('ADMIN_PASS_HASH');
  if (saved) return hash_(props.getProperty('ADMIN_PASS_SALT'), String(pass || '')) === saved;
  return String(pass || '') === ADMIN_PASSWORD;
}

/** Your own password change, from Settings. adminKey is the current password. */
function adminChangePassword_(body) {
  const pass = String(body.newPass || '');
  if (pass.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
  const salt = randomHex_(32);
  PropertiesService.getScriptProperties().setProperties({ ADMIN_PASS_SALT: salt, ADMIN_PASS_HASH: hash_(salt, pass) });
  return { ok: true };
}

function isMain_() {
  return ADMIN_USERNAME !== '' && ADMIN_PASSWORD !== '';
}

// ---------- ES accounts (kept in your copy only) ----------

const ES_SHEET_NAME = 'ES accounts';
const ES = { USER: 1, NAME: 2, STATUS: 3, STEP: 4, SCRIPT_URL: 5, CREATED: 6, LAST_SIGNIN: 7, HASH: 8, SALT: 9, MUST_CHANGE: 10, KEY: 11, VERSION: 12, EMAIL: 13 };
const ES_HEADERS = ['Username', 'Name', 'Status', 'Setup step', 'Their WiSH link', 'Created', 'Last sign-in',
  'Password hash', 'Salt', 'Must change password', 'Key', 'Script version', 'Email'];
// 1 password, 2 copy, 3 set up, 4 turn on, 5 students, 6 LP dates, 7 student link.
const SETUP_STEPS = 7;
const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+\/|macros\/)s\/[A-Za-z0-9_-]{20,}\/exec$/;
const PASSWORD_WORDS = ['maple', 'river', 'cedar', 'orbit', 'pixel', 'comet', 'lemon', 'tiger', 'piano', 'coral',
  'amber', 'cloud', 'delta', 'ember', 'frost', 'grove', 'harbor', 'island', 'jasper', 'kite'];

function esSheet_() {
  const ss = getAdmin_();
  let sheet = ss.getSheetByName(ES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ES_SHEET_NAME);
    sheet.getRange(1, 1, 1, ES_HEADERS.length).setValues([ES_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideColumns(ES.HASH, 4);
  } else if (sheet.getRange(1, ES.EMAIL).getValue() !== 'Email') {
    sheet.getRange(1, ES.EMAIL).setValue('Email').setFontWeight('bold');
  }
  return sheet;
}

function readEs_() {
  const sheet = esSheet_();
  const list = sheet.getDataRange().getValues().slice(1).map((r, i) => ({
    row: i + 2,
    user: String(r[ES.USER - 1] || '').trim().toLowerCase(),
    name: text_(r[ES.NAME - 1]),
    active: String(r[ES.STATUS - 1]).trim() !== 'Off',
    step: Number(r[ES.STEP - 1]) || 0,
    scriptUrl: String(r[ES.SCRIPT_URL - 1] || '').trim(),
    created: dateText_(r[ES.CREATED - 1]),
    lastSignIn: dateText_(r[ES.LAST_SIGNIN - 1]),
    hash: String(r[ES.HASH - 1] || ''),
    salt: String(r[ES.SALT - 1] || ''),
    mustChange: bool_(r[ES.MUST_CHANGE - 1]),
    key: String(r[ES.KEY - 1] || ''),
    version: Number(r[ES.VERSION - 1]) || 0,
    email: String(r[ES.EMAIL - 1] || '').trim(),
  })).filter(e => e.user);
  return { sheet: sheet, list: list };
}

// An ES's username is also their student link (worksample.app/smith), so it can't be a name the site uses.
const ES_RESERVED = ['admin', 'index', 'workit', 'icons', 'js', 'api', 'setup', 'help'];

function findEs_(user) {
  const all = readEs_();
  const u = String(user || '').trim().toLowerCase();
  return { sheet: all.sheet, es: all.list.filter(e => e.user === u)[0] || null };
}

function esPublic_(es) {
  return {
    user: es.user, name: es.name, active: es.active, step: es.step, scriptUrl: es.scriptUrl,
    created: es.created, lastSignIn: es.lastSignIn, mustChange: es.mustChange, version: es.version, email: es.email,
  };
}

function hash_(salt, pass) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pass, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function randomHex_(n) {
  let s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}

/** Easy to read out loud, e.g. "cedar-4821". The ES picks their own at first sign-in. */
function tempPassword_() {
  const h = randomHex_(12);
  return PASSWORD_WORDS[parseInt(h.slice(0, 6), 16) % PASSWORD_WORDS.length] + '-' + (1000 + parseInt(h.slice(6), 16) % 9000);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** Dashboard sign-in for everyone: you (super admin) or an ES account. */
function esLogin_(body) {
  if (!isMain_()) return { ok: false, error: 'Unknown request.' };
  const user = String(body.user || '').trim().toLowerCase();
  const pass = String(body.pass || '');
  if (lockedOut_(user)) return LOCKED_OUT;
  if (user === ADMIN_USERNAME.toLowerCase()) {
    if (superPassOk_(pass)) return { ok: true, role: 'super', version: WORKIT_VERSION };
    wrongPass_(user);
    Utilities.sleep(800);
    return { ok: false, error: 'Wrong username or password.' };
  }
  const found = findEs_(user);
  const es = found.es;
  if (!es || !es.hash || (hash_(es.salt, pass) !== es.hash && !useResetPass_(found, pass))) {
    wrongPass_(user);
    Utilities.sleep(800); // slows down guessing
    return { ok: false, error: 'Wrong username or password.' };
  }
  if (!es.active) return { ok: false, error: 'Your WiSH account is turned off right now.' };
  found.sheet.getRange(es.row, ES.LAST_SIGNIN).setValue(new Date());
  const out = esPublic_(es);
  out.ok = true;
  out.role = 'es';
  out.key = es.key;
  out.latestVersion = WORKIT_VERSION;
  return out;
}

// ---------- Forgot password (ES accounts) ----------

const RESET_HOURS = 24;
const RESET_WAIT_MINUTES = 10;

/**
 * "Forgot password?" on the sign-in page. Emails a temporary password to the address on the
 * account. Their old password keeps working until the temporary one is used, so nobody can
 * lock an ES out by asking for one. The answer is the same whether or not the account exists.
 */
function esForgot_(body) {
  if (!isMain_()) return { ok: false, error: 'Unknown request.' };
  const done = { ok: true, message: 'If that matches a WiSH account, we’ve emailed a temporary password to it. It works for 24 hours. Check your spam folder too.' };
  const who = String(body.who || '').trim().toLowerCase();
  if (!who) return { ok: false, error: 'Type your username or school email.' };
  const all = readEs_();
  const es = all.list.filter(e => e.user === who || (e.email && e.email.toLowerCase() === who))[0];
  if (!es || !es.active || !es.email) return done;
  const props = PropertiesService.getScriptProperties();
  const key = 'ES_RESET_' + es.user;
  const old = JSON.parse(props.getProperty(key) || 'null');
  if (old && Date.now() - old.sent < RESET_WAIT_MINUTES * 60000) return done;
  const pass = tempPassword_();
  const salt = randomHex_(32);
  props.setProperty(key, JSON.stringify({ hash: hash_(salt, pass), salt: salt, sent: Date.now() }));
  // Anyone can ask, so the link in the email is only ever WiSH's own address.
  const asked = String(body.link || '');
  const link = /^https:\/\/(www\.)?worksample\.app\/[^\s]*$|^https:\/\/jkjpcem\.github\.io\/workit\/[^\s]*$/.test(asked) ? asked : 'https://worksample.app/admin';
  const text = [
    'Hi ' + es.name.split(' ')[0] + ',',
    '',
    'Someone (hopefully you) asked for a new WiSH password. If it wasn’t you, ignore this email: your current password still works.',
    '',
    '1. On a computer, open: ' + link,
    '2. Username: ' + es.user,
    '   Temporary password: ' + pass,
    '3. Choose your own password right after you sign in.',
    '',
    'The temporary password works for ' + RESET_HOURS + ' hours.',
  ].join('\n');
  try {
    MailApp.sendEmail({ to: es.email, subject: 'Your new WiSH password', body: text, name: 'WiSH' });
  } catch (err) {
    props.deleteProperty(key);
    return { ok: false, error: 'The email didn’t send. Please try again later, or ask the person who made your WiSH account for a new password.' };
  }
  return done;
}

/** Signing in with an emailed temporary password makes it their password until they choose one. */
function useResetPass_(found, pass) {
  const props = PropertiesService.getScriptProperties();
  const key = 'ES_RESET_' + found.es.user;
  const r = JSON.parse(props.getProperty(key) || 'null');
  if (!r || Date.now() - r.sent > RESET_HOURS * 3600000 || hash_(r.salt, pass) !== r.hash) return false;
  found.sheet.getRange(found.es.row, ES.HASH, 1, 3).setValues([[r.hash, r.salt, true]]);
  found.es.mustChange = true;
  props.deleteProperty(key);
  FRESH_ = true;
  return true;
}

/** Checks an ES's own requests to the main copy (password change, setup progress). */
function esAuth_(body) {
  if (!isMain_()) return { error: { ok: false, error: 'Unknown request.' } };
  const found = findEs_(body.esUser);
  const es = found.es;
  if (!es || !es.key || String(body.esKey || '') !== es.key || !es.active) {
    return { error: { ok: false, error: 'Please sign in again.' } };
  }
  return { sheet: found.sheet, es: es };
}

function esChangePassword_(body) {
  const pass = String(body.newPass || '');
  if (pass.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
  return withLock_(() => {
    const a = esAuth_(body);
    if (a.error) return a.error;
    // From Settings the current password is checked too; the first-sign-in change skips it.
    if (body.currentPass !== undefined && hash_(a.es.salt, String(body.currentPass)) !== a.es.hash) {
      return { ok: false, error: 'Your current password isn’t right.' };
    }
    const salt = randomHex_(32);
    a.sheet.getRange(a.es.row, ES.HASH, 1, 3).setValues([[hash_(salt, pass), salt, false]]);
    return { ok: true };
  });
}

/** Saves how far an ES got in the setup steps, and the link to their copy once it's turned on. */
function esSaveSetup_(body) {
  return withLock_(() => {
    const a = esAuth_(body);
    if (a.error) return a.error;
    if (body.scriptUrl !== undefined) {
      const url = String(body.scriptUrl || '').trim();
      if (!SCRIPT_URL_RE.test(url)) return { ok: false, error: 'That doesn’t look like a Web app link. It should end in /exec.' };
      a.sheet.getRange(a.es.row, ES.SCRIPT_URL).setValue(url);
      if (body.version) a.sheet.getRange(a.es.row, ES.VERSION).setValue(Number(body.version) || '');
    }
    if (body.step !== undefined) {
      const step = Math.max(0, Math.min(SETUP_STEPS, Math.round(Number(body.step) || 0)));
      a.sheet.getRange(a.es.row, ES.STEP).setValue(step);
    }
    return { ok: true };
  });
}

/** Students open .../?es=username; this tells the app which ES copy to talk to. */
function esLookup_(body) {
  if (!isMain_()) return { ok: false, error: 'Unknown request.' };
  const es = findEs_(body.es).es;
  if (!es) return { ok: false, error: 'This WiSH link isn’t right. Ask your ES for the link again.' };
  if (!es.active) return { ok: false, error: 'This WiSH link is turned off right now. Ask your ES.' };
  if (!es.scriptUrl) return { ok: false, error: 'Your ES hasn’t finished setting up WiSH yet.' };
  return { ok: true, name: es.name, scriptUrl: es.scriptUrl };
}

/**
 * Runs in an ES's own copy: connects it to their account the first time, so only their
 * dashboard can open it. The main copy (yours) never takes a key.
 */
function esClaim_(body) {
  if (isMain_()) return { ok: false, error: 'That is the main WiSH link, not your own copy. Copy the Web app link from your own Apps Script.' };
  const key = String(body.esKey || '');
  if (key.length < 32) return { ok: false, error: 'Please sign in again.' };
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_SHEET_ID')) {
    return { ok: false, error: 'WiSH isn’t set up in your copy yet. In your copy of the WiSH sheet, click WiSH, then Set up WiSH.' };
  }
  return withLock_(() => {
    const have = props.getProperty('ES_KEY');
    if (have && have !== key) return { ok: false, error: 'This copy of WiSH is already connected to a different ES account.' };
    if (!have) props.setProperty('ES_KEY', key);
    return { ok: true, version: WORKIT_VERSION };
  });
}

function superEsList_() {
  return { ok: true, latestVersion: WORKIT_VERSION, accounts: readEs_().list.map(esPublic_) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * New ES account from their first name, last name and email. The username is the part of
 * their email before the @. With a link (the dashboard address), WiSH emails them the
 * welcome message from your account.
 */
function superEsAdd_(body) {
  const first = clean_(body.first, 40), last = clean_(body.last, 40);
  const email = clean_(body.email, 100).toLowerCase();
  const name = body.first !== undefined ? (first + ' ' + last).trim() : clean_(body.name, 60);
  if (!name || (body.first !== undefined && (!first || !last))) return { ok: false, error: 'Type their first and last name.' };
  if (body.email !== undefined && !EMAIL_RE.test(email)) return { ok: false, error: 'That email address doesn’t look right.' };
  return withLock_(() => {
    let user = String(body.user || '').trim().toLowerCase();
    if (!user && email) {
      const base = email.split('@')[0].replace(/[^a-z0-9._-]/g, '').slice(0, 26) || 'es';
      user = base.length < 3 ? base + 'es' : base;
      for (let n = 2; findEs_(user).es || user === ADMIN_USERNAME.toLowerCase() || ES_RESERVED.indexOf(user) !== -1; n++) user = base + n;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(user)) return { ok: false, error: 'Usernames are 3 to 30 letters or numbers, with no spaces.' };
    if (user === ADMIN_USERNAME.toLowerCase() || ES_RESERVED.indexOf(user) !== -1) return { ok: false, error: 'That username is taken.' };
    const found = findEs_(user);
    if (found.es) return { ok: false, error: 'That username is taken.' };
    if (email && readEs_().list.some(e => e.email.toLowerCase() === email)) return { ok: false, error: 'There is already an account for ' + email + '.' };
    const pass = tempPassword_();
    const salt = randomHex_(32);
    const row = [];
    row[ES.USER - 1] = user;
    row[ES.NAME - 1] = cell_(name);
    row[ES.STATUS - 1] = 'Active';
    row[ES.STEP - 1] = 0;
    row[ES.SCRIPT_URL - 1] = '';
    row[ES.CREATED - 1] = new Date();
    row[ES.LAST_SIGNIN - 1] = '';
    row[ES.HASH - 1] = hash_(salt, pass);
    row[ES.SALT - 1] = salt;
    row[ES.MUST_CHANGE - 1] = true;
    row[ES.KEY - 1] = randomHex_(48);
    row[ES.VERSION - 1] = '';
    row[ES.EMAIL - 1] = email;
    found.sheet.appendRow(row);
    const res = { ok: true, user: user, name: name, email: email, tempPass: pass };
    return sendWelcome_(res, body.link, false);
  });
}

/** Emails the welcome message when there's an address and a dashboard link. Never fails the request. */
function sendWelcome_(res, link, reset) {
  link = String(link || '');
  if (!res.email || !/^https:\/\/[^\s]+$/.test(link)) return res;
  const first = res.name.split(' ')[0];
  const text = [
    'Hi ' + first + ',',
    '',
    reset ? 'Here is a new temporary password for WiSH.' : 'You now have a WiSH account. WiSH is where your students turn in their work samples, and where you review and annotate them.',
    '',
    '1. On a computer, open: ' + link,
    '2. Username: ' + res.user,
    '   Temporary password: ' + res.tempPass,
    '3. Choose your own password. WiSH then walks you through setup step by step. It takes about 10 minutes.',
    '',
    'Have your school Google account ready (the one ending in suncoastcharter.org). Student work is saved there.',
  ].join('\n');
  try {
    MailApp.sendEmail({ to: res.email, subject: reset ? 'Your new WiSH password' : 'Your WiSH account', body: text, name: 'WiSH' });
    res.emailed = true;
  } catch (err) {
    res.emailError = 'The account is ready, but the email didn’t send (' + err.message + '). Copy the message below and send it yourself.';
  }
  return res;
}

/** A new temporary password; they choose their own again at the next sign-in. */
function superEsReset_(body) {
  return withLock_(() => {
    const found = findEs_(body.user);
    if (!found.es) return { ok: false, error: 'No such account.' };
    const pass = tempPassword_();
    const salt = randomHex_(32);
    found.sheet.getRange(found.es.row, ES.HASH, 1, 3).setValues([[hash_(salt, pass), salt, true]]);
    return sendWelcome_({ ok: true, user: found.es.user, name: found.es.name, email: found.es.email, tempPass: pass }, body.link, !body.invite);
  });
}

/** Off: they can't sign in, and their student link stops working. Nothing is deleted. */
function superEsSetActive_(body) {
  return withLock_(() => {
    const found = findEs_(body.user);
    if (!found.es) return { ok: false, error: 'No such account.' };
    found.sheet.getRange(found.es.row, ES.STATUS).setValue(body.active ? 'Active' : 'Off');
    return { ok: true };
  });
}

/** Your LP dates and current LP. Every ES copy follows the dates (they're the same for everyone). */
function schoolDates_() {
  if (!isMain_()) return { ok: false, error: 'Unknown request' };
  return { ok: true, lpDates: getLpDates_(), currentLp: getCurrentLp_(), holidays: getHolidays_() };
}

/** Every student, plus every upload in one LP, for the dashboard grid. */
function adminOverview_(body) {
  const currentLp = getCurrentLp_();
  const lp = LEARNING_PERIODS.indexOf(body.lp) !== -1 ? body.lp : currentLp;
  return {
    ok: true,
    lp: lp,
    currentLp: currentLp,
    lps: LEARNING_PERIODS,
    reasons: REDO_REASONS,
    lpDates: getLpDates_(),
    holidays: getHolidays_(),
    students: getStudents_(),
    items: readSubs_().items.filter(i => i.lp === lp && !i.trashedAt).map(adminItem_),
  };
}

/** All of one student's uploads, every LP. */
function adminStudent_(body) {
  const id = String(body.studentId || '').toUpperCase();
  return { ok: true, items: readSubs_().items.filter(i => i.studentId === id && !i.trashedAt).map(adminItem_) };
}

/** The ES moves any sample to WiSH's Trash, even after approving or filing it. */
function adminTrash_(body) {
  return withLock_(() => {
    const subs = readSubs_();
    const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
    if (!item) return { ok: true }; // already gone
    trashItem_(subs, item, 'ES');
    return { ok: true, deletesOn: deletesOn_(item) };
  });
}

/** Everything in WiSH's Trash, newest first. */
function adminTrashList_() {
  const items = readSubs_().items.filter(i => i.trashedAt).sort((a, b) => b.trashedAt - a.trashedAt).map(i => {
    const p = adminItem_(i);
    p.trashedAt = i.trashedAt;
    p.trashedBy = i.trashedBy;
    p.deletesOn = deletesOn_(i);
    return p;
  });
  return { ok: true, days: TRASH_DAYS, items: items };
}

function adminRestore_(body) {
  return withLock_(() => {
    const subs = readSubs_();
    const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60), true);
    if (!item || !item.trashedAt) return { ok: false, error: 'That sample isn’t in the Trash any more.' };
    restoreItem_(subs, item);
    return { ok: true, item: adminItem_(item) };
  });
}

/** Deletes one trashed sample for good right away, instead of waiting out the 60 days. */
function adminDeleteNow_(body) {
  return withLock_(() => {
    const subs = readSubs_();
    const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60), true);
    if (!item) return { ok: true };
    if (!item.trashedAt) return { ok: false, error: 'Move it to the Trash first.' };
    deleteItem_(subs.sheet, item);
    return { ok: true };
  });
}

function adminFile_(body) {
  const item = findItem_(readSubs_(), String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
  if (!item) return { ok: false, error: 'Upload not found.' };
  return fileData_(item);
}

function adminReview_(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const subs = readSubs_();
    const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
    if (!item) return { ok: false, error: 'Upload not found.' };
    const redo = body.redo === true;
    const approved = !redo && body.approved === true;
    // Taking back the approval (or sending it back for a redo) un-files an exported sample:
    // the filed copy goes to Drive's trash and the sample counts as not done again.
    if (item.finalizedAt && !approved) unfile_(subs, item);
    const reasons = redo ? (body.reasons || []).map(r => clean_(r, 60)).filter(Boolean).join('; ') : '';
    // The ES's own typed reason. Older dashboards don't send one, so keep what's there.
    const note = !redo ? '' : body.note === undefined ? item.redoNote : clean_(body.note, 500);
    // A new or changed redo request is shown to the student again.
    const same = item.redo && reasons === item.reasons.join('; ') && note === item.redoNote;
    const notified = redo ? (same ? item.notified : false) : '';
    subs.sheet.getRange(item.row, SUB.APPROVED, 1, 4).setValues([[approved, redo, reasons, notified]]);
    subs.sheet.getRange(item.row, SUB.REDO_NOTE).setValue(cell_(note));
    // A new or changed redo is emailed to the family a few minutes later (see wishTick).
    if (!redo || !same) subs.sheet.getRange(item.row, SUB.REDO_MARKED).setValue(redo ? new Date() : '');
    // When it was approved, for the "each sample approved" family email.
    if (approved !== item.approved) subs.sheet.getRange(item.row, SUB.APPROVED_AT).setValue(approved ? new Date() : '');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Moves the exported copy to Drive's trash (it can be restored there) and clears the export. Annotations stay. */
function unfile_(subs, item) {
  if (item.finalId) {
    try { DriveApp.getFileById(item.finalId).setTrashed(true); } catch (ignored) {}
  }
  subs.sheet.getRange(item.row, SUB.FINALIZED, 1, 3).setValues([['', '', '']]);
  subs.sheet.getRange(item.row, SUB.FILED_AS).setValue('');
  item.finalizedAt = 0; item.finalUrl = ''; item.finalId = ''; item.filedAs = '';
}

/** Saves the text boxes so you can come back to them before finalizing. */
function adminAnnotate_(body) {
  const subs = readSubs_();
  const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
  if (!item) return { ok: false, error: 'Upload not found.' };
  const json = JSON.stringify(Array.isArray(body.annotations) ? body.annotations : []);
  if (json.length > 45000) return { ok: false, error: 'There is too much on this upload to save. Undo a few pen marks or remove a text box.' };
  // The ES can change the family's own boxes and marks too; they stay in the family's column.
  let fam = null;
  if (Array.isArray(body.familyNotes)) {
    fam = JSON.stringify(body.familyNotes.slice(0, 400).map(cleanNote_));
    if (fam.length > 45000) return { ok: false, error: 'There is too much on this upload to save. Undo a few pen marks or remove a text box.' };
  }
  subs.sheet.getRange(item.row, SUB.ANNOTATIONS).setValue(json);
  if (fam !== null) subs.sheet.getRange(item.row, SUB.FAMILY_NOTES).setValue(fam);
  return { ok: true };
}

/**
 * Files approved work under Approved / LP#:
 *   Annotated  the annotated PDF the dashboard sends (body.data)
 *   Extra      a copy of the student's upload as is
 * Filing it again (or switching) replaces the earlier copy.
 */
function adminFinalize_(body) {
  const filedAs = body.filedAs === 'Extra' ? 'Extra' : 'Annotated';
  let bytes = null;
  if (filedAs === 'Annotated') {
    if (!body.data) return { ok: false, error: 'No file was attached.' };
    bytes = Utilities.base64Decode(body.data);
    if (bytes.length > MAX_BYTES) return { ok: false, error: 'That file is too big.' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const subs = readSubs_();
    const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
    if (!item) return { ok: false, error: 'Upload not found.' };
    if (item.redo) return { ok: false, error: 'This upload is marked for redo. Approve it first.' };
    if (filedAs === 'Extra' && !item.approved) return { ok: false, error: 'Approve it first.' };
    const student = findStudent_(item.studentId) || { firstName: item.name, lastName: '' };
    const folder = getApprovedFolder_(item.lp, filedAs);
    if (item.finalId) {
      try { DriveApp.getFileById(item.finalId).setTrashed(true); } catch (ignored) {}
    }
    const name = uniqueName_(folder, workName_(student, item.lp, item.subject));
    const file = filedAs === 'Annotated'
      ? folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name))
      : DriveApp.getFileById(item.fileId).makeCopy(name, folder);
    file.setDescription('Approved and filed as ' + filedAs + ' ' + new Date().toDateString() + '\nOriginal upload: ' + item.fileUrl);
    const json = JSON.stringify(Array.isArray(body.annotations) ? body.annotations : item.annotations);
    const now = new Date();
    subs.sheet.getRange(item.row, SUB.APPROVED).setValue(true);
    subs.sheet.getRange(item.row, SUB.ANNOTATIONS, 1, 4).setValues([[json.length > 45000 ? '' : json, now, file.getUrl(), file.getId()]]);
    subs.sheet.getRange(item.row, SUB.FILED_AS).setValue(filedAs);
    return { ok: true, finalUrl: file.getUrl(), finalizedAt: now.getTime(), name: name, filedAs: filedAs };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Student list (the Students tab, edited from the dashboard) ----------

const MAX_STUDENTS = 500;

/** Every row of the Students tab, as typed. */
function adminRoster_() {
  const values = getSheet_('Students').getDataRange().getValues();
  const seen = JSON.parse(PropertiesService.getScriptProperties().getProperty('LAST_SIGNIN') || '{}');
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const row = {
      first: text_(v[0]).trim(), last: text_(v[1]).trim(), grade: String(v[2]).trim(), city: text_(v[3]).trim(),
      classes: text_(v[5]).trim(), classes2: text_(v[6]).trim(), email: String(v[7] || '').trim(), family: String(v[8] || '').trim(),
      status: /^\s*inactive/i.test(String(v[9] || '')) ? 'Inactive' : 'Active',
    };
    row.lastSignIn = seen[makeId_(row.first, row.grade, row.city)] || 0;
    if (row.first || row.last || row.grade || row.city || row.classes || row.classes2 || row.email || row.family) rows.push(row);
  }
  return { ok: true, grades: GRADES, rows: rows };
}

/** Replaces the Students tab with the rows from the dashboard. Column E (Student ID) is left to its formula. */
function adminSaveRoster_(body) {
  const input = Array.isArray(body.rows) ? body.rows : [];
  if (input.length > MAX_STUDENTS) return { ok: false, error: 'That is more than ' + MAX_STUDENTS + ' students.' };
  const rows = [];
  const problems = [];
  const seen = {};
  input.forEach((r, i) => {
    const row = {
      first: clean_(r.first, 60), last: clean_(r.last, 60), grade: clean_(r.grade, 2),
      city: clean_(r.city, 60), classes: clean_(r.classes, 500), classes2: clean_(r.classes2, 500),
      email: clean_(r.email, 120), family: clean_(r.family, 300), status: r.status === 'Inactive' ? 'Inactive' : 'Active',
    };
    if (!row.first && !row.last && !row.grade && !row.city && !row.classes && !row.classes2 && !row.email && !row.family) return;
    const id = makeId_(row.first, row.grade, row.city);
    const badEmail = [row.email].concat(row.family.split(/[,;\s]+/)).filter(e => e && !EMAIL_RE.test(e))[0];
    if (badEmail) problems.push('Row ' + (i + 1) + ': “' + badEmail + '” doesn’t look like an email address.');
    if (!id) problems.push('Row ' + (i + 1) + ' needs a first name, a grade from 8 to 12 and a city.');
    else if (seen[id]) problems.push('Rows ' + seen[id] + ' and ' + (i + 1) + ' would both sign in as ' + id + '.');
    else seen[id] = i + 1;
    rows.push(row);
  });
  if (problems.length) return { ok: false, error: problems.slice(0, 5).join(' '), problems: problems };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_('Students');
    const last = sheet.getLastRow();
    if (last > 1) {
      sheet.getRange(2, 1, last - 1, 4).clearContent();
      sheet.getRange(2, 6, last - 1, 5).clearContent();
    }
    studentHeaders_();
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows.map(r => [cell_(r.first), cell_(r.last), r.grade, cell_(r.city)]));
      sheet.getRange(2, 6, rows.length, 5).setValues(rows.map(r => [cell_(r.classes), cell_(r.classes2), r.email, r.family, r.status]));
    }
    return { ok: true, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/** Saves each LP's start and end dates (yyyy-mm-dd; blank means no limit). */
function adminSetLpDates_(body) {
  if (Array.isArray(body.holidays)) {
    const bad = setHolidays_(body.holidays);
    if (bad) return { ok: false, error: bad };
  }
  const dates = body.dates || {};
  const rows = [];
  for (let i = 0; i < LEARNING_PERIODS.length; i++) {
    const lp = LEARNING_PERIODS[i];
    const d = dates[lp] || {};
    const start = clean_(d.start, 10), end = clean_(d.end, 10);
    if ((start && !isYmd_(start)) || (end && !isYmd_(end))) return { ok: false, error: lp + ' has a date WiSH can’t read.' };
    if (!start !== !end) return { ok: false, error: 'Give ' + lp + ' both a start and an end date, or leave both blank.' };
    if (start && start > end) return { ok: false, error: lp + ' ends before it starts.' };
    rows.push([lp, start, end]);
  }
  const sheet = getSheet_('Settings');
  sheet.getRange(LP_DATES_ROW, 1, 1, 3).setValues([['LP', 'Start date', 'End date']]);
  sheet.getRange(LP_DATES_ROW + 1, 2, rows.length, 2).setNumberFormat('@');
  sheet.getRange(LP_DATES_ROW + 1, 1, rows.length, 3).setValues(rows);
  return { ok: true, lpDates: getLpDates_(), holidays: getHolidays_() };
}

function adminSetLp_(body) {
  if (LEARNING_PERIODS.indexOf(body.lp) === -1) return { ok: false, error: 'Unknown Learning Period.' };
  getSheet_('Settings').getRange(1, 2).setValue(body.lp);
  return { ok: true, currentLp: body.lp };
}

// ---------- Submissions ----------

/** Reads the Submissions tab once and turns each row into an object. */
function readSubs_() {
  if (!FRESH_) {
    const remembered = memoGet_('subs');
    if (remembered) return { get sheet() { return getSubs_(); }, items: remembered };
  }
  const sheet = getSubs_();
  const values = sheet.getDataRange().getValues();
  const items = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    if (!v[SUB.STUDENT_ID - 1]) continue;
    items.push({
      row: r + 1,
      id: String(v[SUB.UPLOAD_ID - 1] || ('row' + (r + 1))),
      studentId: String(v[SUB.STUDENT_ID - 1]).toUpperCase(),
      name: String(v[SUB.NAME - 1] || ''),
      receivedAt: v[SUB.RECEIVED - 1] instanceof Date ? v[SUB.RECEIVED - 1].getTime() : Date.parse(v[SUB.RECEIVED - 1]) || 0,
      lp: String(v[SUB.LP - 1]),
      subject: text_(v[SUB.SUBJECT - 1]),
      dateCompleted: dateText_(v[SUB.DATE_DONE - 1]),
      score: text_(v[SUB.SCORE - 1]),
      minutes: text_(v[SUB.MINUTES - 1]),
      source: String(v[SUB.SOURCE - 1] || 'scan'),
      feedback: text_(v[SUB.FEEDBACK - 1]),
      comments: text_(v[SUB.COMMENTS - 1]),
      pageCount: Number(v[SUB.PAGES - 1]) || 1,
      fileUrl: String(v[SUB.FILE - 1] || ''),
      fileId: String(v[SUB.FILE_ID - 1] || ''),
      favorite: bool_(v[SUB.FAVORITE - 1]),
      thumb: String(v[SUB.THUMB - 1] || ''),
      approved: bool_(v[SUB.APPROVED - 1]),
      redo: bool_(v[SUB.REDO - 1]),
      reasons: String(v[SUB.REASONS - 1] || '').split(';').map(s => s.trim()).filter(Boolean),
      redoNote: text_(v[SUB.REDO_NOTE - 1]),
      notified: bool_(v[SUB.NOTIFIED - 1]),
      replacedBy: String(v[SUB.REPLACED_BY - 1] || ''),
      resubmitOf: String(v[SUB.RESUBMIT_OF - 1] || ''),
      annotations: parseJson_(v[SUB.ANNOTATIONS - 1]),
      familyNotes: parseJson_(v[SUB.FAMILY_NOTES - 1]),
      finalizedAt: v[SUB.FINALIZED - 1] instanceof Date ? v[SUB.FINALIZED - 1].getTime() : (Date.parse(v[SUB.FINALIZED - 1]) || 0),
      finalUrl: String(v[SUB.FINAL_FILE - 1] || ''),
      finalId: String(v[SUB.FINAL_ID - 1] || ''),
      trashedAt: v[SUB.TRASHED - 1] instanceof Date ? v[SUB.TRASHED - 1].getTime() : (Date.parse(v[SUB.TRASHED - 1]) || 0),
      trashedBy: String(v[SUB.TRASHED_BY - 1] || ''),
      redoMarkedAt: v[SUB.REDO_MARKED - 1] instanceof Date ? v[SUB.REDO_MARKED - 1].getTime() : (Date.parse(v[SUB.REDO_MARKED - 1]) || 0),
      approvedAt: v[SUB.APPROVED_AT - 1] instanceof Date ? v[SUB.APPROVED_AT - 1].getTime() : (Date.parse(v[SUB.APPROVED_AT - 1]) || 0),
      filedAs: FILED_AS.indexOf(String(v[SUB.FILED_AS - 1])) !== -1 ? String(v[SUB.FILED_AS - 1]) : (v[SUB.FINALIZED - 1] ? 'Annotated' : ''),
      pageDate: dateText_(v[SUB.PAGE_DATE - 1] || ''),
      pageCheck: String(v[SUB.PAGE_CHECK - 1] || ''),
    });
  }
  memoPut_('subs', items);
  return { sheet: sheet, items: items };
}

/** Trashed samples count as gone unless withTrash is true. */
function findItem_(subs, studentId, id, withTrash) {
  if (!id) return null;
  for (let i = 0; i < subs.items.length; i++) {
    const it = subs.items[i];
    if (it.id === id && it.studentId === studentId && (withTrash || !it.trashedAt)) return it;
  }
  return null;
}

/** What a student may see about their own upload. */
function publicItem_(i) {
  return {
    id: i.id, receivedAt: i.receivedAt, lp: i.lp, subject: i.subject, dateCompleted: i.dateCompleted,
    score: i.score, minutes: i.minutes, source: i.source, feedback: i.feedback, comments: i.comments, pageCount: i.pageCount, favorite: i.favorite,
    thumb: i.thumb, approved: i.approved, finalized: !!i.finalizedAt, redo: i.redo, reasons: i.reasons, redoNote: i.redoNote,
    resubmitted: !!i.replacedBy, resubmitOf: i.resubmitOf, familyNotes: i.familyNotes || [],
  };
}

function adminItem_(i) {
  const p = publicItem_(i);
  p.studentId = i.studentId;
  p.name = i.name;
  p.fileUrl = i.fileUrl;
  p.annotations = i.annotations;
  p.finalizedAt = i.finalizedAt;
  p.finalUrl = i.finalUrl;
  p.filedAs = i.filedAs;
  p.redoSentAt = i.redo ? i.redoMarkedAt : 0;
  p.approvedAt = i.approved ? i.approvedAt : 0;
  p.pageDate = i.pageDate;
  p.pageCheck = i.pageCheck;
  return p;
}

function fileData_(item) {
  const file = DriveApp.getFileById(item.fileId);
  return { ok: true, name: file.getName(), data: Utilities.base64Encode(file.getBlob().getBytes()) };
}

// ---------- Core subjects ----------
// Each reporting period, every student needs one annotated sample in English, Math,
// Social Studies and Science. A student with no class in one of those areas fills that
// slot with an annotated elective instead. The dashboard works out who has what
// (js/core.js); this part only keeps the ES's own marks and class sorting.

const CORE_AREAS = ['English', 'Math', 'Social Studies', 'Science'];
const CORE_RPS = ['RP1', 'RP2', 'RP3'];
const CORE_SHEET = 'Core checks';
const CORE_HEADERS = ['Student ID', 'Student', 'Reporting period', 'Area', 'Note', 'Marked on'];
const SORT_SHEET = 'Class sorting';
const SORT_HEADERS = ['Class', 'Core area'];

function namedSheet_(name, headers) {
  const ss = getAdmin_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetRows_(sheet, width) {
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

/** Students, annotated samples, the ES's "done" marks and class sorting, for the Core subjects page. */
function adminCore_() {
  const marks = sheetRows_(namedSheet_(CORE_SHEET, CORE_HEADERS), 5)
    .filter(r => r[0])
    .map(r => ({ studentId: String(r[0]).toUpperCase(), rp: String(r[2]), area: String(r[3]), note: text_(r[4]) }));
  const sorting = {};
  sheetRows_(namedSheet_(SORT_SHEET, SORT_HEADERS), 2).forEach(r => {
    const name = String(r[0]).trim(), area = String(r[1]).trim();
    if (name && (CORE_AREAS.indexOf(area) !== -1 || area === 'None')) sorting[name.toLowerCase()] = area;
  });
  const items = readSubs_().items
    .filter(i => i.finalizedAt && i.filedAs === 'Annotated' && !i.redo && !i.trashedAt)
    .map(i => ({ id: i.id, studentId: i.studentId, lp: i.lp, subject: i.subject, finalUrl: i.finalUrl, finalizedAt: i.finalizedAt }));
  return {
    ok: true, students: getStudents_(), items: items, marks: marks, sorting: sorting,
    currentLp: getCurrentLp_(), lpDates: getLpDates_(),
  };
}

/** Marks one student's core area done for a reporting period (done: false takes the mark away). */
function adminCoreMark_(body) {
  const id = String(body.studentId || '').toUpperCase();
  const rp = String(body.rp || ''), area = String(body.area || '');
  const student = findStudent_(id);
  if (!student || CORE_RPS.indexOf(rp) === -1 || CORE_AREAS.indexOf(area) === -1) {
    return { ok: false, error: 'WiSH couldn’t find that student or subject. Refresh and try again.' };
  }
  return withLock_(() => {
    const sheet = namedSheet_(CORE_SHEET, CORE_HEADERS);
    const rows = sheetRows_(sheet, 4);
    for (let r = rows.length - 1; r >= 0; r--) {
      if (String(rows[r][0]).toUpperCase() === id && String(rows[r][2]) === rp && String(rows[r][3]) === area) sheet.deleteRow(r + 2);
    }
    if (body.done) sheet.appendRow([id, student.name, rp, area, cell_(clean_(body.note, 300)), new Date()]);
    return { ok: true };
  });
}

/** Puts a class in a core area by hand ('None' = not core, '' = let WiSH decide from its name). */
function adminCoreSort_(body) {
  const name = clean_(body.name, 100), area = String(body.area || '');
  if (!name || (area && area !== 'None' && CORE_AREAS.indexOf(area) === -1)) return { ok: false, error: 'Something was missing. Please try again.' };
  return withLock_(() => {
    const sheet = namedSheet_(SORT_SHEET, SORT_HEADERS);
    const rows = sheetRows_(sheet, 1);
    for (let r = rows.length - 1; r >= 0; r--) {
      if (String(rows[r][0]).trim().toLowerCase() === name.toLowerCase()) sheet.deleteRow(r + 2);
    }
    if (area) sheet.appendRow([cell_(name), area]);
    return { ok: true };
  });
}

// ---------- Students & settings ----------

/** First 2 letters of first name + grade + first 2 letters of city, e.g. Maya, 10, Springfield -> MA10SP */
function makeId_(first, grade, city) {
  const a = letters_(first).slice(0, 2);
  const c = letters_(city).slice(0, 2);
  const g = String(grade).trim();
  if (a.length < 2 || c.length < 2 || GRADES.indexOf(g) === -1) return '';
  return a + g + c;
}

function getStudents_() {
  if (!FRESH_) {
    const remembered = memoGet_('students');
    if (remembered) return remembered;
  }
  const values = getSheet_('Students').getDataRange().getValues();
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const id = makeId_(v[0], v[2], v[3]);
    if (!id) continue;
    out.push({
      id: id,
      name: (String(v[0]).trim() + ' ' + String(v[1]).trim()).trim(),
      firstName: String(v[0]).trim(),
      lastName: String(v[1]).trim(),
      grade: String(v[2]).trim(),
    });
    const st = out[out.length - 1];
    st.sem1 = parseClasses_(v[5]);
    st.sem2Typed = !!String(v[6] || '').trim();
    st.sem2 = st.sem2Typed ? parseClasses_(v[6]) : sem2From_(st.sem1);
    st.classes = st.sem1.map(c => c.name); // older app versions read this
    st.email = String(v[7] || '').trim();
    st.familyEmails = String(v[8] || '').split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    // Inactive: can still sign in and see their work, but can't upload and gets no reminders.
    st.active = !/^\s*inactive/i.test(String(v[9] || ''));
  }
  memoPut_('students', out);
  return out;
}

/**
 * "Algebra 2 (Accel), US History A H" -> [{ name: 'Algebra 2', need: 2 }, { name: 'US History A H', need: 1 }]
 * An accelerated class is finished in one semester, so it needs 2 samples per LP.
 */
function parseClasses_(text) {
  const seen = {};
  return String(text || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => {
    const accel = /\(\s*accel(erated)?\s*\)|\baccel\b/i.test(s); // "(Accel)" or a bare "Accel" word
    const name = s.replace(/\(\s*accel(erated)?\s*\)|\baccel\b/ig, '').replace(/\s+/g, ' ').trim();
    return { name: name, need: accel ? 2 : 1 };
  }).filter(c => c.name && !seen[c.name.toLowerCase()] && (seen[c.name.toLowerCase()] = true));
}

/**
 * Sem 2 when the ES leaves it blank: the same classes with the semester letter A changed to B
 * ("US History A H" -> "US History B H", "Algebra 1A H" -> "Algebra 1B H").
 * Left out: accelerated classes (finished in Sem 1) and classes with no A, which are
 * one-semester classes like Econ or US Govt.
 */
function sem2From_(sem1) {
  return sem1.filter(c => c.need === 1 && semesterB_(c.name) !== c.name).map(c => ({ name: semesterB_(c.name), need: 1 }));
}

function semesterB_(name) {
  const re = /(^|[\s\d])A(?=\s|$)/g;
  let m, at = -1;
  while ((m = re.exec(name))) at = m.index + m[1].length;
  return at === -1 ? name : name.slice(0, at) + 'B' + name.slice(at + 1);
}

/** Names the Sem 1 / Sem 2 class columns on the Students tab (older sheets had one Classes column). */
function studentHeaders_() {
  const sheet = getSheet_('Students');
  sheet.getRange(1, 6, 1, 5).setValues([STUDENT_HEADERS.slice(5)]).setFontWeight('bold');
  sheet.setColumnWidth(7, 320);
}

function findStudent_(id) {
  id = String(id || '').toUpperCase();
  if (!/^[A-Z]{2}(8|9|10|11|12)[A-Z]{2}$/.test(id)) return null;
  const all = getStudents_();
  for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  // Not in the remembered list: they may have just been added to the sheet by hand.
  if (!FRESH_) {
    FRESH_ = true;
    try { return findStudent_(id); } finally { FRESH_ = false; }
  }
  return null;
}

/** { LP1: { start: 'yyyy-mm-dd', end: 'yyyy-mm-dd' }, ... } for the LPs that have dates. */
function getLpDates_() {
  if (!FRESH_) {
    const remembered = memoGet_('lpDates');
    if (remembered) return remembered;
  }
  const values = getSheet_('Settings').getRange(LP_DATES_ROW + 1, 1, LEARNING_PERIODS.length, 3).getValues();
  const out = {};
  values.forEach(v => {
    const lp = String(v[0] || '').trim().toUpperCase();
    const start = dateText_(v[1]).trim(), end = dateText_(v[2]).trim();
    if (LEARNING_PERIODS.indexOf(lp) !== -1 && isYmd_(start) && isYmd_(end)) out[lp] = { start: start, end: end };
  });
  memoPut_('lpDates', out);
  return out;
}

/** Date completed must be a weekday, and inside the LP's dates when the LP has them. */
function checkDate_(lp, ymd, what) {
  what = what || 'The date completed';
  if (!isYmd_(ymd)) return 'Enter the date you completed it.';
  const day = new Date(ymd + 'T12:00:00Z').getUTCDay();
  if (day === 0 || day === 6) return what + ' must be a weekday (Monday to Friday).';
  const range = getLpDates_()[lp];
  if (range && (ymd < range.start || ymd > range.end)) {
    return what + ' must be during ' + lp + ' (' + niceDay_(range.start) + ' to ' + niceDay_(range.end) + ').';
  }
  const holiday = schoolHoliday_(ymd);
  if (holiday) return what + ' can’t be ' + niceDay_(ymd) + ', a school holiday (' + holiday + ').';
  return '';
}

// ---------- School holidays (set with the LP dates; no school, so no work dated then) ----------

// They live on the Holidays tab of the WiSH Admin sheet (Date, Holiday, Through for a break),
// so they can also be typed there. Federal holidays count without being listed.
const HOLIDAY_SHEET = 'Holidays';
const HOLIDAY_HEADERS = ['Date', 'Holiday', 'Through (for a break)'];
let HOLIDAYS_ = null; // read once per request

/** [{ from: 'yyyy-mm-dd', to: 'yyyy-mm-dd', name }] */
function getHolidays_() {
  if (HOLIDAYS_) return HOLIDAYS_;
  const sheet = getAdmin_().getSheetByName(HOLIDAY_SHEET);
  const out = [];
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(v => {
      const from = dateText_(v[0]).trim(), to = dateText_(v[2]).trim();
      if (isYmd_(from)) out.push({ from: from, to: isYmd_(to) && to > from ? to : from, name: text_(v[1]).trim() });
    });
  }
  out.sort((a, b) => a.from < b.from ? -1 : 1);
  HOLIDAYS_ = out;
  return out;
}

function setHolidays_(input) {
  const out = [];
  for (let i = 0; i < Math.min(input.length, 80); i++) {
    const h = input[i] || {};
    const from = clean_(h.from, 10), to = clean_(h.to, 10) || from;
    if (!from && !to) continue;
    if (!isYmd_(from) || !isYmd_(to)) return 'A school holiday has a date WiSH can’t read.';
    if (to < from) return 'A school holiday ends before it starts.';
    out.push({ from: from, to: to, name: clean_(h.name, 60) });
  }
  out.sort((a, b) => a.from < b.from ? -1 : 1);
  const sheet = namedSheet_(HOLIDAY_SHEET, HOLIDAY_HEADERS);
  sheet.getRange(1, 1, 1, 3).setValues([HOLIDAY_HEADERS]).setFontWeight('bold');
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  if (out.length) {
    sheet.getRange(2, 1, out.length, 3).setNumberFormat('@');
    sheet.getRange(2, 1, out.length, 3).setValues(out.map(h => [h.from, cell_(h.name), h.to !== h.from ? h.to : '']));
  }
  HOLIDAYS_ = out;
  return '';
}

/** The holiday's name if no school that day ('' if it's a school day): a federal holiday or one you added. */
function schoolHoliday_(ymd) {
  const h = getHolidays_().filter(x => ymd >= x.from && ymd <= x.to)[0];
  return h ? (h.name || 'no school') : federalHoliday_(ymd);
}

/**
 * The federal holidays (the days federal offices close), on the weekday they're observed:
 * one that falls on a Saturday is kept the Friday before, and on a Sunday the Monday after.
 */
function federalHoliday_(ymd) {
  const y = Number(ymd.slice(0, 4));
  return federalHolidays_(y).concat(federalHolidays_(y + 1)).filter(h => h.from === ymd).map(h => h.name)[0] || '';
}

function federalHolidays_(y) {
  const iso = (m, d) => y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
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
  ].map(h => ({ from: h[0], to: h[0], name: h[1], federal: true }));
}

/** Your holidays plus the federal ones for this school year and next, for the student app. */
function allHolidays_() {
  const y = new Date().getFullYear();
  return getHolidays_().concat(federalHolidays_(y - 1), federalHolidays_(y), federalHolidays_(y + 1));
}

// ---------- Page check: name, subject and date at the top of page 1 ----------
// No AI. The text comes from Google Drive's built-in text recognition (for photos and scans)
// or straight from the document (Word, Google Docs and Slides). The dates are found with plain
// patterns, and the name and subject by comparing words with the roster.

const MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function checkPage_(body) {
  const student = findStudent_(body.studentId);
  if (!student) return { ok: false, error: 'Your account was not found. Ask your ES.' };
  const lp = LEARNING_PERIODS.indexOf(body.lp) !== -1 ? body.lp : getCurrentLp_();
  if (String(body.image || body.docx || '').length > 4 * 1024 * 1024) return { ok: true, read: false };
  // At most 60 checks per student a day, so nobody can use your Drive as a text reader.
  const cache = CacheService.getScriptCache(), countKey = 'pagecheck_' + student.id + '_' + ymd_(new Date(), Session.getScriptTimeZone());
  const used = Number(cache.get(countKey)) || 0;
  if (used >= 60) return { ok: true, read: false };
  cache.put(countKey, String(used + 1), 6 * 3600);
  let text = '';
  try {
    if (body.link) text = googleFileText_(googleFileInfo_(body.link));
    else if (body.docx) text = docText_(Utilities.base64Decode(body.docx), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    else if (body.image) text = docText_(Utilities.base64Decode(body.image), 'image/jpeg');
  } catch (err) {
    return { ok: true, read: false };
  }
  return Object.assign({ ok: true }, pageCheck_(text.slice(0, 1500), student, clean_(body.subject, 80), lp));
}

function pageCheck_(text, student, subject, lp) {
  const dates = findDates_(text, getLpDates_()[lp]);
  const date = dates.filter(d => !checkDate_(lp, d))[0] || dates[0] || '';
  return {
    read: /[a-z0-9]/i.test(text), date: date,
    dateProblem: date ? checkDate_(lp, date, 'The date on your page') : '',
    name: wordsOnPage_(text, [student.firstName, student.lastName].join(' ').split(/[\s-]+/)),
    subject: wordsOnPage_(text, subjectWords_(subject)),
  };
}

/** Every date written in the text, as yyyy-mm-dd (a missing year is the LP's). */
function findDates_(text, range) {
  const t = String(text || '').toLowerCase();
  const years = range ? [Number(range.start.slice(0, 4)), Number(range.end.slice(0, 4))] : [new Date().getFullYear()];
  const out = [];
  const add = (m, d, y) => {
    m = Number(m); d = Number(d);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    (y ? [Number(String(y).length === 2 ? '20' + y : y)] : years).forEach(yy => {
      const ymd = yy + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
      if (isYmd_(ymd) && new Date(ymd + 'T12:00:00Z').getUTCDate() === d && out.indexOf(ymd) === -1) out.push(ymd);
    });
  };
  let r;
  const iso = /\b(20\d\d)[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g;
  while ((r = iso.exec(t))) add(r[2], r[3], r[1]);
  const num = /(^|[^\d])(\d{1,2}) ?[\/\-.] ?(\d{1,2})(?: ?[\/\-.] ?(\d{4}|\d{2}))?(?!\d)/g;
  while ((r = num.exec(t))) add(r[2], r[3], r[4]);
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  const md = new RegExp('\\b' + mon + ' *(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? *(\\d{4}))?', 'g');
  while ((r = md.exec(t))) add(MONTHS_.indexOf(r[1].slice(0, 3)) + 1, r[2], r[3]);
  const dm = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)? +(?:of +)?' + mon + '(?:,? *(\\d{4}))?', 'g');
  while ((r = dm.exec(t))) add(MONTHS_.indexOf(r[2].slice(0, 3)) + 1, r[1], r[3]);
  return out;
}

/** The words of a class name worth looking for, with their usual short forms ("a-g English 11A Honors" -> english, eng, ela). */
function subjectWords_(subject) {
  const words = String(subject || '').toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z]+/)
    .filter(w => w.length > 1 && ['ag', 'honors', 'of', 'and', 'the', 'grade', 'th', 'accel'].indexOf(w) === -1);
  const extra = { english: ['eng', 'ela'], algebra: ['alg', 'math'], geometry: ['geo', 'math'], statistics: ['stats', 'stat', 'math'],
    calculus: ['calc', 'math', 'precalc', 'precalculus'], pre: [], history: ['hist'], government: ['gov', 'govt'], economics: ['econ'],
    biology: ['bio'], chemistry: ['chem'], physics: ['phys'], science: ['sci'], spanish: ['span', 'espanol'], american: ['asl'],
    sign: ['asl'], physical: ['pe'], photography: ['photo'], math: ['math'] };
  return words.reduce((all, w) => all.concat([w], extra[w] || []), []).filter(w => w);
}

/** True when any of the words is in the text (a longer word may have one letter misread). */
function wordsOnPage_(text, words) {
  // Text recognition sometimes reads o, l or s as 0, 1 or 5 inside a word.
  const fixed = String(text || '').toLowerCase().replace(/[015](?=[a-z])|(?<=[a-z])[015]/g, c => ({ 0: 'o', 1: 'l', 5: 's' }[c]));
  const seen = fixed.split(/[^a-z]+/).filter(w => w.length > 1);
  return words.map(w => String(w || '').toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 1).some(w => {
    const slack = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
    return seen.some(s => s === w || (slack && Math.abs(s.length - w.length) <= slack && editDistance_(s, w) <= slack));
  });
}

/** Letters to add, drop, change or swap to turn a into b. */
function editDistance_(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Text of a picture (Drive's text recognition) or a Word file, through a temporary Google Doc that is deleted right away. */
function docText_(bytes, type) {
  const boundary = 'wishcheck' + Date.now();
  const meta = JSON.stringify({ name: 'WiSH page check (temporary)', mimeType: 'application/vnd.google-apps.document' });
  const head = Utilities.newBlob('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + boundary + '\r\nContent-Type: ' + type + '\r\n\r\n').getBytes();
  const tail = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
  const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=en', {
    method: 'post', contentType: 'multipart/related; boundary=' + boundary,
    payload: head.concat(Array.prototype.slice.call(bytes)).concat(tail), headers: auth, muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Couldn’t read the page.');
  const id = JSON.parse(res.getContentText()).id;
  try {
    const text = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/plain', { headers: auth, muteHttpExceptions: true });
    return text.getResponseCode() === 200 ? text.getContentText() : '';
  } finally {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'delete', headers: auth, muteHttpExceptions: true });
  }
}

/** The text of a shared Google Doc or Slides, read without your sign-in like the PDF export. */
function googleFileText_(info) {
  const res = UrlFetchApp.fetch(publicUrl_(info, info.kind === 'Google Slides' ? '/export/txt' : '/export?format=txt'), { muteHttpExceptions: true });
  return res.getResponseCode() === 200 ? res.getContentText() : '';
}

function isYmd_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(String(s) + 'T12:00:00Z'));
}

/** Word (.docx) bytes -> PDF bytes, by letting Google Docs open the file. The temporary Doc is trashed. */
function convertDocx_(bytes, name) {
  const boundary = 'workit' + Date.now();
  const meta = JSON.stringify({ name: String(name).replace(/\.pdf$/, ''), mimeType: 'application/vnd.google-apps.document' });
  const head = Utilities.newBlob('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + boundary + '\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n').getBytes();
  const tail = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
  const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'post',
    contentType: 'multipart/related; boundary=' + boundary,
    payload: head.concat(Array.prototype.slice.call(bytes)).concat(tail),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('WiSH couldn’t read that Word file. Save it as a PDF and upload that instead.');
  const doc = DriveApp.getFileById(JSON.parse(res.getContentText()).id);
  try {
    return doc.getAs('application/pdf').getBytes();
  } finally {
    doc.setTrashed(true);
  }
}

// ---------- Google Docs and Slides, sent as a share link ----------

const GOOGLE_KINDS = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.presentation': 'Google Slides',
};
const NO_ACCESS = 'WiSH can’t open that file. In Google Docs or Slides, tap Share, set General access to “Anyone with the link”, then copy the link again.';

// Looks a link up without saving anything, so the student knows right away if it will work.
function checkLink_(body) {
  if (!findStudent_(body.studentId)) return { ok: false, error: 'Your account was not found. Ask your ES.' };
  try {
    const info = googleFileInfo_(body.link);
    return { ok: true, name: info.name, kind: info.kind };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function driveGet_(path, info) {
  const headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  if (info.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = info.id + '/' + info.resourceKey;
  return UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(info.id) + path,
    { headers: headers, muteHttpExceptions: true });
}

// link -> { id, resourceKey, name, kind, url }. Throws a student-friendly Error.
function googleFileInfo_(link) {
  link = String(link || '').trim();
  const m = link.match(/\/d\/([A-Za-z0-9_-]{20,})/) || link.match(/[?&]id=([A-Za-z0-9_-]{20,})/);
  if (!/^https:\/\/(docs|drive)\.google\.com\//.test(link) || !m) {
    throw new Error('That doesn’t look like a Google Docs or Slides link. Copy it from the Share button and try again.');
  }
  const key = link.match(/[?&]resourcekey=([A-Za-z0-9_-]+)/i);
  const info = { id: m[1], resourceKey: key ? key[1] : '' };
  const res = driveGet_('?fields=name,mimeType,webViewLink&supportsAllDrives=true', info);
  if (res.getResponseCode() !== 200) throw new Error(NO_ACCESS);
  const meta = JSON.parse(res.getContentText());
  info.kind = GOOGLE_KINDS[meta.mimeType];
  if (!info.kind) throw new Error('That link isn’t a Google Doc or Google Slides. For other files, download them and use Choose a file.');
  info.name = String(meta.name || 'Untitled').slice(0, 120);
  info.url = meta.webViewLink || link;
  // The script runs as you, so it could open files only you can see. Students may only hand in
  // files anyone with the link can open, checked without your sign-in.
  const open = UrlFetchApp.fetch(publicUrl_(info, '/edit'), { followRedirects: false, muteHttpExceptions: true });
  if (open.getResponseCode() !== 200) throw new Error(NO_ACCESS);
  return info;
}

function publicUrl_(info, path) {
  const kind = info.kind === 'Google Slides' ? 'presentation' : 'document';
  return 'https://docs.google.com/' + kind + '/d/' + encodeURIComponent(info.id) + path +
    (info.resourceKey ? (path.indexOf('?') === -1 ? '?' : '&') + 'resourcekey=' + encodeURIComponent(info.resourceKey) : '');
}

// Exported without your sign-in too, so only a file shared with anyone with the link comes back.
function googleFilePdf_(info) {
  const res = UrlFetchApp.fetch(publicUrl_(info, info.kind === 'Google Slides' ? '/export/pdf' : '/export?format=pdf'), { muteHttpExceptions: true });
  const type = String((res.getHeaders() || {})['Content-Type'] || (res.getHeaders() || {})['content-type'] || '');
  if (res.getResponseCode() === 200 && /application\/pdf/i.test(type)) return res.getContent();
  if (res.getResponseCode() === 200 || res.getResponseCode() === 401 || res.getResponseCode() === 403 || res.getResponseCode() === 404) throw new Error(NO_ACCESS);
  throw new Error('That file is too big for Google to turn into a PDF, or Google is busy. Download it as a PDF and use Choose a file instead.');
}

function getCurrentLp_() {
  const remembered = FRESH_ ? null : memoGet_('currentLp');
  if (remembered) return remembered;
  const lp = String(getSheet_('Settings').getRange(1, 2).getValue()).trim().toUpperCase();
  const out = LEARNING_PERIODS.indexOf(lp) !== -1 ? lp : LEARNING_PERIODS[0];
  memoPut_('currentLp', out);
  return out;
}

// ---------- Short-term memory ----------
// Opening the admin sheet and reading whole tabs is most of the wait on every click. So the
// Students list, the Submissions rows, the current LP and the LP dates are remembered for a few
// minutes in Google's cache. Anything that changes them (and every request that isn't a plain
// read) forgets them, and edits made by hand in the sheet show up within MEMO_SECONDS.

const MEMO_SECONDS = 300;
const MEMO_CHUNK = 90000;      // a cache value can hold about 100 KB
const MEMO_MAX_CHUNKS = 60;    // above ~5 MB it isn't worth it; just read the sheet
const READ_ONLY_ACTIONS = ['login', 'list', 'file', 'checkLink', 'checkPage', 'adminOverview', 'adminStudent', 'adminFile', 'adminTrashList',
  'adminRoster', 'adminCore', 'adminEmailSettings', 'adminMeetings', 'schoolDates', 'esLookup', 'esLogin', 'superEsList', 'ping'];
let FRESH_ = true;  // outside web requests (the editor, menus) always read the sheet

// Each request keeps the generation it started with. A slow read that finishes after a change
// then saves its (now old) copy under the old generation, where nothing will use it.
let MEMO_GEN_ = null;
function memoGen_(cache) {
  if (MEMO_GEN_) return MEMO_GEN_;
  let gen = cache.get('memo-gen');
  if (!gen) {
    gen = String(Date.now());
    cache.put('memo-gen', gen, 21600);
  }
  MEMO_GEN_ = gen;
  return gen;
}

function memoGet_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const k = memoGen_(cache) + ':' + key;
    const n = Number(cache.get(k + ':n'));
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(k + ':' + i);
    const parts = cache.getAll(keys);
    let text = '';
    for (let i = 0; i < n; i++) {
      if (parts[keys[i]] == null) return null;
      text += parts[keys[i]];
    }
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function memoPut_(key, value) {
  try {
    const text = JSON.stringify(value);
    const n = Math.max(1, Math.ceil(text.length / MEMO_CHUNK));
    if (n > MEMO_MAX_CHUNKS) return;
    const cache = CacheService.getScriptCache();
    const k = memoGen_(cache) + ':' + key;
    const all = {};
    for (let i = 0; i < n; i++) all[k + ':' + i] = text.slice(i * MEMO_CHUNK, (i + 1) * MEMO_CHUNK);
    cache.putAll(all, MEMO_SECONDS);
    cache.put(k + ':n', String(n), MEMO_SECONDS);  // last, so a half-written copy is never used
  } catch (err) { /* too big or cache busy: the next request reads the sheet */ }
}

/** Forgets everything remembered, so the next request reads the sheet. */
function memoClear_() {
  try { CacheService.getScriptCache().put('memo-gen', String(Date.now()) + Math.random(), 21600); } catch (err) {}
}

// ---------- Drive & sheet plumbing ----------

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (ignored) {}
  }
  // Your copy reuses a folder by name; an ES's copy always starts its own, so trying it in an
  // account that already has WiSH can't mix with that account's real folder.
  let found = isMain_() ? DriveApp.getRootFolder().getFoldersByName(ROOT_FOLDER_NAME) : null;
  if (found && !found.hasNext()) found = DriveApp.getRootFolder().getFoldersByName(OLD_ROOT_FOLDER_NAME);
  const folder = found && found.hasNext() ? found.next() : DriveApp.getRootFolder().createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/** WiSH Homework / Uploads / LP# */
function getUploadFolder_(lp) {
  return getChildFolder_(getChildFolder_(getRootFolder_(), UPLOADS_FOLDER_NAME), lp);
}

/** WiSH Homework / Approved / LP# Annotated or LP# Extra */
function getApprovedFolder_(lp, filedAs) {
  return getChildFolder_(getChildFolder_(getRootFolder_(), APPROVED_FOLDER_NAME), lp + ' ' + filedAs);
}

function getChildFolder_(parent, name) {
  const found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

/** Once: gives a sheet and folder made before the rename their WiSH names. Both are found by ID. */
function useWishNames_(props, ss) {
  if (props.getProperty('WISH_NAMES')) return;
  props.setProperty('WISH_NAMES', '1');
  try { if (ss.getName() === OLD_ADMIN_SHEET_NAME) ss.rename(ADMIN_SHEET_NAME); } catch (ignored) {}
  try {
    const folder = getRootFolder_();
    if (folder.getName() === OLD_ROOT_FOLDER_NAME) folder.setName(ROOT_FOLDER_NAME);
  } catch (ignored) {}
}

let adminCache_ = null;
function getAdmin_() {
  if (adminCache_) return adminCache_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ADMIN_SHEET_ID');
  if (id) {
    try {
      adminCache_ = SpreadsheetApp.openById(id);
      useWishNames_(props, adminCache_);
      return adminCache_;
    } catch (ignored) {}
  }
  // In an ES's own copy, the sheet the script came with becomes their WiSH Admin sheet.
  const bound = boundSheet_();
  const ss = bound || SpreadsheetApp.create(ADMIN_SHEET_NAME);
  if (bound) ss.rename(ADMIN_SHEET_NAME);
  if (!ss.getSheetByName('Submissions')) buildAdmin_(ss);
  DriveApp.getFileById(ss.getId()).moveTo(getRootFolder_());
  props.setProperty('ADMIN_SHEET_ID', ss.getId());
  return (adminCache_ = ss);
}

function boundSheet_() {
  try { return SpreadsheetApp.getActiveSpreadsheet() || null; } catch (ignored) { return null; }
}

function getSheet_(name) {
  const sheet = getAdmin_().getSheetByName(name);
  if (!sheet) throw new Error('The "' + name + '" tab is missing from the WiSH Admin sheet.');
  return sheet;
}

/** The Submissions tab, with any review columns added by newer versions of this script. */
function getSubs_() {
  const sheet = getSheet_('Submissions');
  if (sheet.getLastColumn() < SUB_HEADERS.length) {
    sheet.getRange(1, 1, 1, SUB_HEADERS.length).setValues([SUB_HEADERS]).setFontWeight('bold');
    hideColumns_(sheet);
  }
  return sheet;
}

function buildAdmin_(ss) {
  const students = ss.getSheets()[0].setName('Students');
  students.getRange(1, 1, 1, 7).setValues([STUDENT_HEADERS]);
  // The ID column fills itself in, so you can read each student their ID.
  students.getRange('E1').setFormula(
    '={"Student ID";ARRAYFORMULA(IF((A2:A="")+(C2:C="")+(D2:D=""),"",' +
    'UPPER(LEFT(REGEXREPLACE(A2:A,"[^A-Za-z]",""),2))&C2:C&UPPER(LEFT(REGEXREPLACE(D2:D,"[^A-Za-z]",""),2))))}');
  students.getRange('C2:C').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(GRADES, true).setAllowInvalid(false).build());
  students.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E2<>"",COUNTIF($E:$E,$E2)>1)')
      .setBackground('#f8d7da')
      .setRanges([students.getRange('E2:E')])
      .build(),
  ]);
  students.getRange(1, 1, 1, 7).setFontWeight('bold');
  students.setFrozenRows(1);
  students.setColumnWidth(6, 320);
  students.getRange('C:C').setNumberFormat('@');

  const settings = ss.insertSheet('Settings');
  settings.getRange(1, 1, 1, 2).setValues([['Current LP', LEARNING_PERIODS[0]]]);
  settings.getRange(1, 2).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(LEARNING_PERIODS, true).setAllowInvalid(false).build());
  settings.getRange(3, 1).setValue('Students upload to the Current LP unless they choose another one on purpose.');
  settings.getRange(LP_DATES_ROW, 1, 1, 3).setValues([['LP', 'Start date', 'End date']]).setFontWeight('bold');
  settings.getRange(LP_DATES_ROW + 1, 1, LEARNING_PERIODS.length, 1).setValues(LEARNING_PERIODS.map(lp => [lp]));
  settings.getRange(LP_DATES_ROW - 1, 1).setValue('Student dates must be weekdays inside their LP. Leave an LP blank for no date limit.');
  settings.getRange('A1').setFontWeight('bold');
  settings.setColumnWidth(1, 140);

  const subs = ss.insertSheet('Submissions');
  subs.getRange(1, 1, 1, SUB_HEADERS.length).setValues([SUB_HEADERS]).setFontWeight('bold');
  subs.setFrozenRows(1);
  // Keep dates and scores like "9/10" as typed instead of turning them into dates.
  subs.getRange(1, SUB.DATE_DONE, subs.getMaxRows(), 2).setNumberFormat('@');
  hideColumns_(subs);
}

/** Columns the app needs but you don't. */
function hideColumns_(sheet) {
  sheet.hideColumns(SUB.UPLOAD_ID, 3);
  sheet.hideColumns(SUB.NOTIFIED, 4);
  sheet.hideColumns(SUB.FINAL_ID);
}

/** Lastname_Firstname_LP#_SubjectName, e.g. Lopez_Maya_LP5_Algebra2.pdf */
function workName_(student, lp, subject) {
  const part = s => String(s || '').replace(/[\\/:*?"<>|_]+/g, ' ').replace(/\s+/g, '');
  return [part(student.lastName), part(student.firstName), lp, part(subject)].filter(Boolean).join('_');
}

/** Adds _2, _3 ... when a file with that name is already in the folder. */
function uniqueName_(folder, base) {
  let name = base + '.pdf';
  for (let n = 2; folder.getFilesByName(name).hasNext(); n++) name = base + '_' + n + '.pdf';
  return name;
}

// ---------- Small helpers ----------

function letters_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

/** Whole minutes from 1 to 600, or '' when missing. */
function minutes_(v) {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 600 ? n : '';
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
}

/** Stops typed text like "=SUM(...)" from turning into a spreadsheet formula. */
function cell_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function text_(v) {
  return String(v == null ? '' : v).replace(/^'/, '');
}

function parseJson_(v) {
  try { const a = JSON.parse(String(v || '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function bool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function dateText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Reminders: emails to families, and status reports to you ----------
//
// Set on the dashboard's Reminders page. One timer (wishTick, every 10 minutes) does the
// sending once you allow it: run turnOnEmails once from the editor. Family emails start in
// Test mode, which sends each one to you instead of the family.

const EMAIL_LOG = 'Email log';
const REDO_WAIT_MINUTES = 5;    // time to finish picking redo reasons before it goes out
const QUIET_FROM = 20;          // family emails that happen in the evening wait until morning
const QUIET_UNTIL = 7;
const SCHEDULE_CHOICES = ['none', 'once', 'twice', 'every5', 'every4', 'every3', 'every2', 'daily'];

const EMAIL_TEMPLATES = {
  missing: {
    subject: '{student_first_name}’s {lp} work samples: {count} still to do',
    body: 'Hi {student_first_name} and family,\n\nHere is what {student_first_name} still needs to do for {lp}:\n\n{to do}\n\n' +
      '{lp} ends {end date} ({days left} days left). Turn work in at {link}\n\nThank you,\nYour ES',
  },
  redo: {
    subject: 'Please redo {student_first_name}’s {class} sample ({lp})',
    body: 'Hi {student_first_name} and family,\n\n{student_first_name}’s {class} work sample for {lp} needs a redo.\n\nWhat to fix:\n{reasons}\n\n' +
      'Sign in at {link}, open My uploads, and tap Resubmit on that sample.\n\nThank you,\nYour ES',
  },
  approved: {
    subject: 'Congratulations! {student_first_name} is all done for {lp}',
    body: 'Hi {student_first_name} and family,\n\nCongratulations! {student_first_name} has turned in every work sample needed for {lp}, and nothing needs a redo. ' +
      'Nothing else is needed for {lp}.\n\nThank you,\nYour ES',
  },
  each: {
    subject: '{student_first_name}’s {class} sample is approved',
    body: 'Hi {student_first_name} and family,\n\n{student_first_name}’s {class} work sample for {lp} is approved.\n\nThank you,\nYour ES',
  },
  book: {
    subject: 'Please book {student_first_name}’s {lp} meeting',
    body: 'Hi {student_first_name} and family,\n\nIt’s time to book {student_first_name}’s {lp} meeting with me. Please pick a time that works for you here:\n\n{booking link}\n\n' +
      '{lp} ends {end date}.\n\nThank you,\nYour ES',
  },
  meet: {
    subject: 'Reminder: {student_first_name}’s {lp} meeting is {when}',
    body: 'Hi {student_first_name} and family,\n\nThis is a reminder of {student_first_name}’s {lp} meeting with me {when}:\n\n  {meeting time}\n  Join with Google Meet: {meet link}\n\n' +
      'If you need a different time, you can pick a new one here: {booking link}\n\nSee you then,\nYour ES',
  },
  received: {
    subject: 'WiSH got {student_first_name}’s {class} sample',
    body: 'Hi {student_first_name} and family,\n\nWiSH received {student_first_name}’s {class} work sample for {lp}. Your ES will look at it soon.\n\nThank you,\nYour ES',
  },
};

const EMAIL_DEFAULTS = {
  families: 'test',              // 'off' | 'test' (send them to me) | 'on'
  parents: true, students: true,
  famHow: 'event',               // 'event' (as things happen) | 'daily' (one summary a day)
  famHour: 7,
  missing: true, redo: true, approved: true, each: false, received: false,
  weeks: ['none', 'once', 'once', 'every3'], // weeks 1-2, 3, 4, 5+
  onceDay: 1,                    // 1 = Monday ... 5 = Friday
  book: true,                    // LP meeting not booked yet (only while a booking link is set)
  bookWeeks: ['none', 'once', 'twice', 'every3'],
  bookOnceDay: 3,
  meet: true,                    // 3 days before a booked meeting, and the day before
  noWeekends: true, noHolidays: true,
  pauseFrom: '', pauseTo: '',
  report: true,
  daily: true, reportHour: 7,
  weekly: false, weeklyDay: 5,
  live: false,
  inReport: { uploads: true, daysLeft: true, families: true, waiting: true, sent: true },
  esEvents: { upload: false, resubmit: false, lpEnd: false },
  templates: {},                 // only the ones you changed
  link: APP_URL,
};

function emailSettings_() {
  const saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('EMAIL_SETTINGS') || '{}');
  const s = Object.assign({}, EMAIL_DEFAULTS, saved);
  s.inReport = Object.assign({}, EMAIL_DEFAULTS.inReport, saved.inReport || {});
  s.esEvents = Object.assign({}, EMAIL_DEFAULTS.esEvents, saved.esEvents || {});
  if (s.weeks.length > 4) s.weeks = s.weeks.slice(0, 4); // version 19 had a separate week 6
  s.me = Session.getEffectiveUser().getEmail();
  return s;
}

function template_(s, kind) {
  return Object.assign({}, EMAIL_TEMPLATES[kind], (s.templates || {})[kind] || {});
}

function timerOn_() {
  return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'wishTick');
}

/** Everything the Reminders page shows. */
function adminEmailSettings_() {
  const s = emailSettings_();
  let running = false;
  try { running = timerOn_(); } catch (e) { /* not allowed yet */ }
  const st = emailState_();
  const missingFamilies = st.students.filter(x => x.missing.length || x.redos.length).length;
  const noEmail = st.students.filter(x => !recipients_(Object.assign({}, s, { parents: true, students: true }), x.student).length).length;
  const sample = st.students.filter(x => x.missing.length && x.redos.length)[0] || st.students.filter(x => x.missing.length || x.redos.length)[0] || st.students[0] || null;
  return {
    ok: true, settings: s, defaults: EMAIL_TEMPLATES, running: running, quota: MailApp.getRemainingDailyQuota(),
    status: {
      lp: st.lp, range: st.range, daysLeft: st.daysLeft, week: st.week, weeks: st.weeks,
      nextReminder: nextReminder_(s, st), missingFamilies: missingFamilies, noEmail: noEmail, students: st.students.length,
    },
    sample: sample && {
      first: sample.student.firstName || sample.student.name,
      to: recipients_(s, sample.student),
      missing: sample.missing.map(m => m.name + (m.need > 1 ? ' (' + m.have + ' of ' + m.need + ' turned in)' : '')),
      todo: toDo_(sample), count: toDoCount_(sample),
    },
    recent: recentEmails_(8),
    logUrl: getAdmin_().getUrl() + '#gid=' + emailLogSheet_().getSheetId(),
  };
}

function adminSaveEmailSettings_(body) {
  const b = body.settings || {};
  const hour = (v, lo, hi, d) => { const n = Math.round(Number(v)); return n >= lo && n <= hi ? n : d; };
  const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const link = clean_(b.link, 300);
  const templates = {};
  Object.keys(EMAIL_TEMPLATES).forEach(k => {
    const t = (b.templates || {})[k];
    if (!t) return;
    const subject = clean_(t.subject, 200), text = String(t.body || '').replace(/\r/g, '').slice(0, 4000);
    const out = {};
    if (subject && subject !== EMAIL_TEMPLATES[k].subject) out.subject = subject;
    if (text.trim() && text !== EMAIL_TEMPLATES[k].body) out.body = text;
    if (Object.keys(out).length) templates[k] = out;
  });
  const weeks = EMAIL_DEFAULTS.weeks.map((d, n) => SCHEDULE_CHOICES.indexOf((b.weeks || [])[n]) !== -1 ? b.weeks[n] : d);
  const pick = (obj, defs) => { const o = {}; Object.keys(defs).forEach(k => { o[k] = (obj || {})[k] === true; }); return o; };
  const old = emailSettings_();
  const s = {
    families: ['off', 'test', 'on'].indexOf(b.families) !== -1 ? b.families : 'test',
    parents: b.parents === true, students: b.students === true,
    famHow: b.famHow === 'daily' ? 'daily' : 'event',
    famHour: hour(b.famHour, 5, 19, 7),
    missing: b.missing === true, redo: b.redo === true, approved: b.approved === true, each: b.each === true, received: b.received === true,
    weeks: weeks,
    onceDay: hour(b.onceDay, 1, 5, 1),
    book: b.book === true, meet: b.meet === true,
    bookWeeks: EMAIL_DEFAULTS.bookWeeks.map((d, n) => SCHEDULE_CHOICES.indexOf((b.bookWeeks || [])[n]) !== -1 ? b.bookWeeks[n] : d),
    bookOnceDay: hour(b.bookOnceDay, 1, 5, 3),
    noWeekends: b.noWeekends === true, noHolidays: b.noHolidays === true,
    pauseFrom: day(b.pauseFrom), pauseTo: day(b.pauseTo),
    report: b.report === true,
    daily: b.daily === true, reportHour: hour(b.reportHour, 5, 10, 7),
    weekly: b.weekly === true, weeklyDay: hour(b.weeklyDay, 1, 5, 5),
    live: b.live === true,
    inReport: pick(b.inReport, EMAIL_DEFAULTS.inReport),
    esEvents: pick(b.esEvents, EMAIL_DEFAULTS.esEvents),
    templates: templates,
    link: /^https:\/\/(www\.)?worksample\.app\/[^\s]*$|^https:\/\/jkjpcem\.github\.io\/workit\/[^\s]*$/.test(link) ? link : APP_URL,
  };
  const props = PropertiesService.getScriptProperties();
  props.setProperty('EMAIL_SETTINGS', JSON.stringify(s));
  // Only things that happen from now on are emailed about, never older uploads or redos.
  if (!props.getProperty('EMAIL_SINCE') || (old.families === 'off' && s.families !== 'off')) props.setProperty('EMAIL_SINCE', String(Date.now()));
  let allowed = true;
  try { if (!timerOn_()) setEmailTimer_(); } catch (e) { allowed = false; }
  const res = adminEmailSettings_();
  res.needsAllow = !allowed;
  return res;
}

function setEmailTimer_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['wishTick', 'wishMorning', 'wishSoon'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('wishTick').timeBased().everyMinutes(10).create();
}

/** Run this once from the Apps Script editor (Run > turnOnEmails) to allow WiSH to email on a schedule. */
function turnOnEmails() {
  setEmailTimer_();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('EMAIL_SINCE')) props.setProperty('EMAIL_SINCE', String(Date.now()));
  return 'WiSH reminders are on. Change them in the dashboard: Reminders.';
}

// ----- Days -----

function ymd_(d, tz) {
  return Utilities.formatDate(d, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function addDays_(ymd, n) {
  return new Date(Date.parse(ymd + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

function daysBetween_(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

function weekday_(ymd) {
  return new Date(ymd + 'T12:00:00Z').getUTCDay(); // 0 Sunday ... 6 Saturday
}

/** Major US holidays, plus the winter break from Dec 24 to Jan 1. */
function isHoliday_(ymd) {
  const y = Number(ymd.slice(0, 4)), md = ymd.slice(5);
  if (['01-01', '06-19', '07-04', '11-11'].indexOf(md) !== -1 || md >= '12-24') return true;
  const nth = (month, dow, n) => { // n-th weekday of a month; n = -1 for the last one
    if (n > 0) {
      const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
      return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
    }
    const lastDate = new Date(Date.UTC(y, month, 0)).getUTCDate();
    const last = new Date(Date.UTC(y, month - 1, lastDate)).getUTCDay();
    return lastDate - ((last - dow + 7) % 7);
  };
  const m = Number(ymd.slice(5, 7)), d = Number(ymd.slice(8));
  if (m === 1 && d === nth(1, 1, 3)) return true;               // Martin Luther King Jr. Day
  if (m === 2 && d === nth(2, 1, 3)) return true;               // Presidents' Day
  if (m === 5 && d === nth(5, 1, -1)) return true;              // Memorial Day
  if (m === 9 && d === nth(9, 1, 1)) return true;               // Labor Day
  if (m === 11 && (d === nth(11, 4, 4) || d === nth(11, 4, 4) + 1)) return true; // Thanksgiving and the day after
  return false;
}

function paused_(s, ymd) {
  return !!(s.pauseFrom && s.pauseTo && ymd >= s.pauseFrom && ymd <= s.pauseTo);
}

/** A day family emails and your reports may go out on. */
function sendDay_(s, ymd) {
  const wd = weekday_(ymd);
  return !paused_(s, ymd) && !(s.noWeekends && (wd === 0 || wd === 6)) && !(s.noHolidays && isHoliday_(ymd));
}

/** Week of the LP a day falls in, counted from the LP's start date (1, 2, ...). */
function lpWeek_(range, ymd) {
  return range ? Math.floor(daysBetween_(range.start, ymd) / 7) + 1 : null;
}

function weekRule_(s, week) {
  return week <= 2 ? s.weeks[0] : week >= 5 ? s.weeks[3] : s.weeks[week - 2];
}

/** The day in an LP week that "Once" reminders go out on. */
function onceTarget_(s, range, week) {
  const weekStart = addDays_(range.start, (week - 1) * 7);
  for (let n = 0; n < 7; n++) {
    const d = addDays_(weekStart, n);
    if (weekday_(d) === s.onceDay) return d;
  }
  return weekStart;
}

/** Would the schedule send missing-sample reminders on this day (to a family who last got one on `last`)? */
function reminderDue_(s, range, ymd, last) {
  if (!range || ymd < range.start || ymd > range.end || !sendDay_(s, ymd)) return false;
  const week = lpWeek_(range, ymd);
  const rule = weekRule_(s, week);
  if (rule === 'none') return false;
  if (last === ymd) return false;
  if (rule === 'daily') return true;
  const every = Number(rule.replace('every', ''));
  if (every) return !last || daysBetween_(last, ymd) >= every;
  if (rule === 'twice') { // the start of the LP week and its last weekday
    const weekStart = addDays_(range.start, (week - 1) * 7);
    let end = addDays_(weekStart, 6);
    while ([0, 6].indexOf(weekday_(end)) !== -1) end = addDays_(end, -1);
    const target = ymd >= end ? end : weekStart;
    return !(last && last >= target);
  }
  // once: on the chosen weekday, or the first send day after it if that one was skipped
  const target = onceTarget_(s, range, week);
  return ymd >= target && !(last && lpWeek_(range, last) === week);
}

function nextReminder_(s, st) {
  if (s.families === 'off' || !s.missing || !st.range) return null;
  const hourNow = Number(Utilities.formatDate(new Date(), st.tz, 'H'));
  for (let n = 0; n < 70; n++) {
    const d = addDays_(st.today, n);
    if (d > st.range.end) return null;
    if (n === 0 && hourNow >= s.famHour) continue;
    if (reminderDue_(s, st.range, d, null)) return { date: d, hour: s.famHour };
  }
  return null;
}

// ----- What each student has this LP -----

function emailState_() {
  FRESH_ = true;
  const lp = getCurrentLp_();
  const range = getLpDates_()[lp] || null;
  const tz = Session.getScriptTimeZone();
  const today = ymd_(new Date(), tz);
  const daysLeft = range ? daysBetween_(today, range.end) : null;
  const students = getStudents_().filter(x => x.active !== false);  // inactive students get no reminders
  const byId = {};
  students.forEach(x => { byId[x.id] = x; });
  const subs = readSubs_();
  const items = subs.items.filter(i => !i.trashedAt && i.lp === lp);
  const rows = students.map(student => {
    const mine = items.filter(i => i.studentId === student.id);
    const classes = Number(lp.replace(/\D/g, '')) >= 5 ? student.sem2 : student.sem1;
    const missing = [];
    classes.forEach(c => {
      const have = mine.filter(i => i.subject === c.name && !(i.redo && !i.replacedBy)).length;
      if (have < c.need) missing.push({ name: c.name, need: c.need, have: have });
    });
    const live = mine.filter(i => !(i.redo && i.replacedBy)); // a redo that was resubmitted is replaced
    const redos = live.filter(i => i.redo);
    const allApproved = classes.length > 0 && !missing.length && live.length > 0 && !redos.length &&
      live.every(i => i.approved || i.finalizedAt);
    return {
      student: student, uploads: mine.length, missing: missing, redos: redos, allApproved: allApproved,
      allIn: classes.length > 0 && !missing.length && !redos.length,
      toReview: live.filter(i => !i.approved && !i.finalizedAt && !i.redo).length,
      needed: classes.reduce((n, c) => n + c.need, 0),
    };
  });
  return {
    lp: lp, range: range, today: today, daysLeft: daysLeft, tz: tz,
    week: range ? lpWeek_(range, today) : null,
    weeks: range ? Math.ceil((daysBetween_(range.start, range.end) + 1) / 7) : null,
    students: rows, byId: byId, items: items, subs: subs,
  };
}

// ----- The timer -----

/** Every 10 minutes: whatever is due goes out. Nothing is sent twice (see the Email log tab). */
function wishTick() {
  // Keeps the LP meeting bookings fresh, so sign-in never waits for the calendar.
  if (Object.keys(meetingSettings_().links).length) { try { readBookings_(true); } catch (err) { /* not allowed yet */ } }
  const s = emailSettings_();
  if (s.families === 'off' && !s.report) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const st = emailState_();
    const now = new Date();
    const hourNow = Number(Utilities.formatDate(now, st.tz, 'H'));
    const sent = emailSent_();
    const since = Number(PropertiesService.getScriptProperties().getProperty('EMAIL_SINCE')) || now.getTime();
    if (s.report) yourEmails_(s, st, sent, hourNow, since);
    if (s.families !== 'off') familyEmails_(s, st, sent, hourNow, since);
  } finally {
    lock.releaseLock();
  }
}

function familyEmails_(s, st, sent, hourNow, since) {
  if (!sendDay_(s, st.today)) return;
  const due = {}; // student id -> list of { kind, key, mail }
  const add = (student, kind, key, vars) => {
    if (sent[tagged_(s, key)]) return;
    (due[student.id] = due[student.id] || { student: student, list: [] }).list.push({ kind: kind, key: key, mail: fill_(template_(s, kind), vars) });
  };
  const atSendHour = hourNow >= s.famHour;
  const daytime = hourNow >= QUIET_UNTIL && hourNow < QUIET_FROM;
  const now = Date.now();

  // Families get two kinds of email about samples (since version 24):
  //  - "still to do" on the schedule: what's missing and what needs a redo, in one email;
  //  - "all done" once per LP, when every sample is in and nothing needs a redo.
  if (s.approved && atSendHour) st.students.filter(x => x.allIn).forEach(x => {
    add(x.student, 'approved', 'done|' + st.lp + '|' + x.student.id, studentVars_(s, st, x));
  });

  if (s.missing && atSendHour && st.range) {
    const last = lastReminders_(s, st.lp, sent);
    st.students.filter(x => x.missing.length || x.redos.length).forEach(x => {
      if (reminderDue_(s, st.range, st.today, last[x.student.id] || null)) {
        add(x.student, 'missing', 'missing|' + st.lp + '|' + st.today + '|' + x.student.id, studentVars_(s, st, x));
      }
    });
  }

  if ((s.book || s.meet) && atSendHour) meetingEmails_(s, st, sent, add);

  Object.keys(due).forEach(id => {
    const d = due[id];
    if (!recipients_(s, d.student).length && s.families === 'on') return; // listed in your report instead
    if (d.list.length > 1) {
      const first = d.student.firstName || d.student.name;
      const mail = {
        subject: 'WiSH update for ' + first + ' (' + st.lp + ')',
        body: d.list.map(e => e.mail.body).join('\n\n──────────\n\n'),
      };
      sendFamily_(s, d.student, 'summary', mail, d.list.map(e => e.key));
    } else {
      d.list.forEach(e => sendFamily_(s, d.student, e.kind, e.mail, [e.key]));
    }
  });
}

/**
 * LP meetings: families with no booking this LP get the booking link on its own schedule;
 * families with a booking hear 3 days before and the day before (with the Google Meet link).
 */
function meetingEmails_(s, st, sent, add) {
  const ms = meetingSettings_();
  const link = meetingLink_(ms, st.lp);
  if (!link) return;
  let bookings;
  try { bookings = matchBookings_(readBookings_(false)); } catch (err) { return; } // calendar not allowed yet
  const mine = (id) => bookings.filter(b => b.lp === st.lp && b.studentIds.indexOf(id) !== -1);

  if (s.book && st.range) {
    const rule = { weeks: s.bookWeeks, onceDay: s.bookOnceDay, noWeekends: s.noWeekends, noHolidays: s.noHolidays, pauseFrom: s.pauseFrom, pauseTo: s.pauseTo };
    const last = lastReminders_(s, st.lp, sent, 'book');
    st.students.forEach(x => {
      if (mine(x.student.id).length) return;
      if (reminderDue_(rule, st.range, st.today, last[x.student.id] || null)) {
        add(x.student, 'book', 'book|' + st.lp + '|' + st.today + '|' + x.student.id, studentVars_(s, st, x));
      }
    });
  }

  if (s.meet) {
    const now = Date.now();
    bookings.forEach(b => {
      if (b.start <= now) return;
      const day = ymd_(new Date(b.start), st.tz);
      const days = daysBetween_(st.today, day);
      if (days < 1 || days > 10) return;
      // Each reminder goes out on the last send day on or before its date (weekends and holidays
      // move it earlier); the 3-day one always comes before the day-before one.
      const anchor = (n, before) => {
        for (let k = 0; k < 7; k++) {
          const d = addDays_(day, -n - k);
          if (sendDay_(s, d) && (!before || d < before)) return d;
        }
        return addDays_(day, -n);
      };
      const one = anchor(1);
      const due1 = st.today >= one;
      const due3 = !due1 && st.today >= anchor(3, one) && days >= 2;
      if (!due1 && !due3) return;
      b.studentIds.forEach(id => {
        const x = st.students.filter(r => r.student.id === id)[0];
        if (!x) return;
        const ev = String(b.key).replace(/\s+/g, '_'); // keys in the Email log are separated by spaces
        const k1 = 'meet1|' + ev + '|' + id, k3 = 'meet3|' + ev + '|' + id;
        if (sent[tagged_(s, due1 ? k1 : k3)]) return;
        const vars = Object.assign(studentVars_(s, st, x), meetingVars_(b, days, st.tz, link));
        add(x.student, 'meet', due1 ? k1 : k3, vars);
      });
    });
  }
}

function meetingVars_(b, days, tz, link) {
  const start = new Date(b.start);
  return {
    when: days === 1 ? 'tomorrow' : 'on ' + Utilities.formatDate(start, tz, 'EEEE'),
    'meeting time': Utilities.formatDate(start, tz, 'EEEE, MMMM d') + ' at ' + Utilities.formatDate(start, tz, 'h:mm a'),
    'meet link': b.meet || '(the Google Meet link is in your calendar invitation)',
    'booking link': link,
  };
}

/** The last day each student got a missing-sample reminder this LP. */
function lastReminders_(s, lp, sent, kind) {
  const out = {};
  const prefix = (s.families === 'test' ? 'test|' : '') + (kind || 'missing') + '|' + lp + '|';
  Object.keys(sent).forEach(k => {
    if (k.indexOf(prefix) !== 0) return;
    const parts = k.slice(prefix.length).split('|'); // date | student id
    if (!out[parts[1]] || parts[0] > out[parts[1]]) out[parts[1]] = parts[0];
  });
  return out;
}

function yourEmails_(s, st, sent, hourNow, since) {
  const allowed = sendDay_(s, st.today);
  if (s.daily && allowed && hourNow >= s.reportHour && !sent['report|' + st.today]) {
    sendReport_(s, st, 1, 'report|' + st.today);
  }
  if (s.weekly && !paused_(s, st.today) && weekday_(st.today) === s.weeklyDay && hourNow >= s.reportHour && !sent['weekly|' + st.today]) {
    sendReport_(s, st, 7, 'weekly|' + st.today);
  }
  if (!s.live || paused_(s, st.today)) return;
  const fresh = st.items.filter(i => i.receivedAt > since && !sent['es|' + i.id] &&
    (i.resubmitOf ? s.esEvents.resubmit : s.esEvents.upload));
  if (fresh.length) {
    const lines = fresh.map(i => '  • ' + i.name + ', ' + i.subject + (i.resubmitOf ? ' (resubmitted redo)' : ''));
    const n = fresh.length;
    MailApp.sendEmail({
      to: s.me, name: 'WiSH',
      subject: 'WiSH: ' + n + ' new upload' + (n > 1 ? 's' : '') + (fresh.some(i => i.resubmitOf) ? ' (with resubmitted redos)' : ''),
      body: ['New in ' + st.lp + ':', ''].concat(lines).concat(['', 'Open the dashboard: ' + dashLink_(s)]).join('\n'),
    });
    fresh.forEach(i => logEmail_(s.me, { name: i.name }, 'to you', 'New upload: ' + i.subject, 'es|' + i.id));
  }
  if (s.esEvents.lpEnd && st.daysLeft === 3 && hourNow >= s.reportHour && !sent['lpend|' + st.lp]) {
    const missing = st.students.filter(x => x.missing.length);
    if (missing.length) {
      MailApp.sendEmail({
        to: s.me, name: 'WiSH',
        subject: 'WiSH: ' + st.lp + ' ends in 3 days, ' + missing.length + ' student' + (missing.length > 1 ? 's' : '') + ' still missing samples',
        body: [st.lp + ' ends ' + niceDay_(st.range.end) + '. Still missing:', ''].concat(missing.map(x =>
          '  • ' + x.student.name + ': ' + x.missing.map(m => m.name).join(', '))).concat(['', 'Open the dashboard: ' + dashLink_(s)]).join('\n'),
      });
    }
    logEmail_(s.me, '', 'to you', st.lp + ' ends in 3 days', 'lpend|' + st.lp);
  }
}

// ----- Writing the emails -----

function niceDay_(ymd) {
  return ymd ? Utilities.formatDate(new Date(ymd + 'T12:00:00Z'), 'UTC', 'EEE, MMM d') : '';
}

function dashLink_(s) {
  return s.link.replace(/\?.*$/, '').replace(/\/?$/, '/') + 'admin.html';
}

function studentVars_(s, st, x) {
  return {
    first: x.student.firstName || x.student.name, student_first_name: x.student.firstName || x.student.name, lp: st.lp,
    count: toDoCount_(x),
    'missing classes': x.missing.map(m => '  • ' + m.name + (m.need > 1 ? ' (' + m.have + ' of ' + m.need + ' turned in)' : '')).join('\n'),
    'to do': toDo_(x),
    'days left': st.daysLeft === null ? '' : String(Math.max(0, st.daysLeft)),
    'end date': st.range ? niceDay_(st.range.end) : '', link: s.link, class: '', reasons: '',
    'booking link': meetingLink_(meetingSettings_(), st.lp),
    when: '', 'meeting time': '', 'meet link': '',
  };
}

/** Missing classes, less the ones already listed as a redo. */
function toDoMissing_(x) {
  return x.missing.filter(m => !(m.have === 0 && x.redos.some(i => i.subject === m.name)));
}

function toDoCount_(x) {
  const n = toDoMissing_(x).length + x.redos.length;
  return n + ' sample' + (n === 1 ? '' : 's');
}

/** What's missing and what needs a redo, as one list for the "still to do" email. */
function toDo_(x) {
  const out = [];
  const missing = toDoMissing_(x);
  if (missing.length) {
    out.push('Still missing:');
    missing.forEach(m => out.push('  • ' + m.name + (m.need > 1 ? ' (' + m.have + ' of ' + m.need + ' turned in)' : '')));
  }
  if (x.redos.length) {
    if (out.length) out.push('');
    out.push('Needs a redo (open My uploads and tap Resubmit):');
    x.redos.forEach(i => {
      const why = i.reasons.concat(i.redoNote ? [i.redoNote] : []);
      out.push('  • ' + i.subject + (why.length ? ': ' + why.join('; ') : ''));
    });
  }
  return out.join('\n');
}

function itemVars_(s, st, student, i) {
  const why = i.reasons.concat(i.redoNote ? [i.redoNote] : []).map(r => '  • ' + r).join('\n');
  return {
    first: student.firstName || student.name, student_first_name: student.firstName || student.name, lp: i.lp, count: '', 'missing classes': '',
    'days left': st.daysLeft === null ? '' : String(Math.max(0, st.daysLeft)),
    'end date': st.range ? niceDay_(st.range.end) : '', link: s.link, class: i.subject, reasons: why || '  • See the note on the sample',
    'booking link': meetingLink_(meetingSettings_(), i.lp),
  };
}

/** Puts each family's details into {student_first_name}, {lp} and the other fill-ins ({first} still works). */
function fill_(tpl, vars) {
  const put = (text) => String(text).replace(/\{([a-z_ ]+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
  return { subject: put(tpl.subject).replace(/\s+/g, ' ').trim(), body: put(tpl.body) };
}

function recipients_(s, student) {
  return [].concat(s.parents ? student.familyEmails || [] : [], s.students && student.email ? [student.email] : []);
}

/**
 * days = 1 for the daily report, 7 for the weekly summary.
 */
function sendReport_(s, st, days, key) {
  const all = st.students;
  const on = s.inReport;
  const after = Date.now() - days * 24 * 3600000;
  const fresh = st.items.filter(i => i.receivedAt > after);
  const count = (f) => st.items.filter(f).length;
  const toReview = count(i => !i.approved && !i.finalizedAt && !i.redo);
  const left = st.daysLeft === null ? '' : st.daysLeft > 0 ? st.daysLeft + ' day' + (st.daysLeft > 1 ? 's' : '') + ' left' : st.daysLeft === 0 ? 'ends today' : 'ended';
  const lines = [(days > 1 ? 'WiSH weekly summary, ' : 'WiSH report for ') + niceDay_(st.today), ''];
  if (on.daysLeft) lines.push(st.lp + (st.range ? ' (' + niceDay_(st.range.start) + ' to ' + niceDay_(st.range.end) + '): ' + left : ': no dates set'), '');
  if (on.uploads) {
    lines.push('New uploads ' + (days > 1 ? 'this week' : 'since yesterday') + ': ' + fresh.length);
    fresh.forEach(i => lines.push('  • ' + i.name + ', ' + i.subject + (i.resubmitOf ? ' (resubmitted redo)' : '')));
    lines.push('');
  }
  if (on.waiting) {
    lines.push('Waiting for you:',
      '  • To review: ' + toReview,
      '  • Approved, not filed yet: ' + count(i => i.approved && !i.finalizedAt),
      '  • Waiting on a student’s redo: ' + count(i => i.redo && !i.replacedBy), '');
  }
  if (on.families) {
    lines.push('Each student this LP (uploads / needed), ' + all.filter(x => !x.missing.length).length + ' of ' + all.length + ' have every sample in:');
    all.slice().sort((a, b) => (a.student.lastName || a.student.name).localeCompare(b.student.lastName || b.student.name)).forEach(x => {
      const bits = [];
      if (x.missing.length) bits.push('missing ' + x.missing.map(m => m.name).join(', '));
      if (x.toReview) bits.push(x.toReview + ' to review');
      if (x.redos.length) bits.push(x.redos.length + ' redo');
      if (x.allApproved) bits.push('all approved ✓');
      lines.push('  • ' + x.student.name + ': ' + x.uploads + ' / ' + x.needed + (bits.length ? ' · ' + bits.join(' · ') : ''));
    });
    lines.push('');
  }
  if (on.sent) {
    const mine = recentEmails_(200).filter(e => e.at > after && e.kind !== 'report' && e.kind !== 'to you');
    const kinds = {};
    mine.forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    lines.push('Emails sent to families: ' + (mine.length ? Object.keys(kinds).map(k => kinds[k] + ' ' + k).join(', ') : 'none'), '');
  }
  const noEmail = all.filter(x => !recipients_(s, x.student).length).map(x => x.student.name);
  if (noEmail.length && s.families !== 'off') lines.push('No email on file (add one in the Student Roster): ' + noEmail.join(', '), '');
  if (s.families === 'test') lines.push('Family emails are in Test mode: they come to you instead of families.', '');
  lines.push('Open the dashboard: ' + dashLink_(s));
  MailApp.sendEmail({
    to: s.me, name: 'WiSH', body: lines.join('\n'), htmlBody: reportHtml_(s, st, days, fresh, on),
    subject: (days > 1 ? 'WiSH week: ' : 'WiSH ') + st.lp + ': ' + toReview + ' to review' + (left ? ', ' + left : ''),
  });
  logEmail_(s.me, '', 'report', days > 1 ? 'Weekly summary' : 'Daily report', key);
}

// ----- The report as a colorful email (the plain text above goes along for mail apps without HTML) -----

const REPORT_COLORS = {
  fil: { bg: '#1f2f6b', fg: '#ffffff', name: 'Filed' },
  app: { bg: '#bfe8c4', fg: '#14532d', name: 'Approved' },
  res: { bg: '#f2c200', fg: '#1c2340', name: 'Resubmitted' },
  rev: { bg: '#fff1a8', fg: '#5c4a00', name: 'To review' },
  redo: { bg: '#e5484d', fg: '#ffffff', name: 'Redo' },
  miss: { bg: '#ffffff', fg: '#7a829e', name: 'Missing' },
};
const REPORT_ORDER = ['fil', 'app', 'res', 'rev', 'redo', 'miss'];
const REPORT_WORDS = {
  english: 'Eng', algebra: 'Alg', geometry: 'Geo', biology: 'Bio', chemistry: 'Chem', physics: 'Phys', history: 'His',
  government: 'Govt', economics: 'Econ', calculus: 'Calc', statistics: 'Stat', science: 'Sci', spanish: 'Span', french: 'Fren',
  world: 'Wor', functional: 'Func', mathematics: 'Math', physical: 'Phys', education: 'Ed', marine: 'Mar', literature: 'Lit',
  language: 'Lang', integrated: 'Int', environmental: 'Env', american: 'Amer', precalculus: 'PreCalc', photography: 'Photo',
  grade: 'Gr', honors: 'H', technology: 'Tech',
};

/** "a-g World History Honors A" -> "ag Wor His H A" (the same short names as the dashboard cards). */
function shortClass_(name) {
  const word = (w) => {
    if (/^a-?g$/i.test(w)) return 'ag';
    if (/^\d/.test(w) || w.length <= 4 || w === w.toUpperCase()) return w;
    if (/^pre-?calc/i.test(w)) return 'PreCalc';
    return REPORT_WORDS[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1, 4);
  };
  return String(name || '').trim().replace(/\s*\(.*?\)/g, '').replace(/american sign language/i, 'ASL').split(/\s+/).filter(w => w && !/^(and|of|the|&)$/i.test(w)).map(word).join(' ');
}

function itemStatus_(i) {
  if (i.redo) return 'redo';
  if (i.finalizedAt) return 'fil';
  if (i.approved) return 'app';
  return i.resubmitOf ? 'res' : 'rev';
}

/** Each student's classes this LP with one status each (the least finished sample decides). */
function reportGrid_(st) {
  const worst = ['redo', 'res', 'rev', 'app', 'fil'];
  return st.students.map(x => {
    const classes = Number(st.lp.replace(/\D/g, '')) >= 5 ? x.student.sem2 : x.student.sem1;
    const live = st.items.filter(i => i.studentId === x.student.id && !(i.redo && i.replacedBy));
    return {
      x: x,
      cells: classes.map(c => {
        const mine = live.filter(i => i.subject === c.name);
        const status = mine.length ? worst.filter(k => mine.some(i => itemStatus_(i) === k))[0] : 'miss';
        return { name: c.name, short: shortClass_(c.name), status: status, have: mine.length, need: c.need };
      }),
    };
  }).sort((a, b) => (a.x.student.lastName || a.x.student.name).localeCompare(b.x.student.lastName || b.x.student.name));
}

function reportHtml_(s, st, days, fresh, on) {
  const F = 'font-family:Arial,Helvetica,sans-serif;';
  const grid = reportGrid_(st);
  const tot = { fil: 0, app: 0, res: 0, rev: 0, redo: 0, miss: 0 };
  grid.forEach(g => g.cells.forEach(c => {
    const mine = st.items.filter(i => i.studentId === g.x.student.id && i.subject === c.name && !(i.redo && i.replacedBy));
    mine.forEach(i => { tot[itemStatus_(i)]++; });
    tot.miss += Math.max(0, c.need - mine.length);
  }));
  const all = REPORT_ORDER.reduce((n, k) => n + tot[k], 0);
  const inN = all - tot.miss;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const names = (list, max) => list.length <= max ? list.join(', ') : list.slice(0, max).join(', ') + ' and ' + (list.length - max) + ' more';
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const section = (t) => '<div style="' + F + 'font-size:12px;font-weight:bold;color:#5f78c8;letter-spacing:1px;text-transform:uppercase;padding:18px 0 8px">' + esc_(t) + '</div>';
  const bar = (parts, h) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #c9d0e4"><tr>' +
    parts.filter(p => p.n > 0).map(p => '<td width="' + p.w + '%" height="' + h + '" style="background:' + p.bg + ';font-size:0;line-height:0">&nbsp;</td>').join('') + '</tr></table>';
  const statusBar = (h) => bar(REPORT_ORDER.map(k => ({ n: tot[k], w: (tot[k] / Math.max(1, all) * 100).toFixed(1), bg: k === 'miss' ? '#eef0f6' : REPORT_COLORS[k].bg })), h);
  const legend = REPORT_ORDER.map(k => '<span style="display:inline-block;margin:0 12px 4px 0;' + F + 'font-size:12px;color:#4a5272;white-space:nowrap">' +
    '<span style="display:inline-block;width:10px;height:10px;background:' + (k === 'miss' ? '#ffffff' : REPORT_COLORS[k].bg) + ';border:1px ' + (k === 'miss' ? 'dashed' : 'solid') + ' #b9c1da;vertical-align:-1px"></span> ' +
    REPORT_COLORS[k].name + ' ' + tot[k] + '</span>').join('');
  const rows = [];

  // Header
  rows.push('<tr><td style="background:#1f2f6b;padding:18px 22px"><span style="' + F + 'font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:.5px">W<span style="color:#f2b705">i</span>SH</span>' +
    '<span style="' + F + 'font-size:13px;color:#b9c6f2;padding-left:10px">' + (days > 1 ? 'Weekly summary' : 'Daily report') + ' · ' + esc_(niceDay_(st.today)) + '</span></td></tr>');

  // LP progress
  if (on.daysLeft) {
    let lpHtml = '<div style="' + F + 'font-size:14px;color:#1c2340;padding-bottom:6px"><b>' + esc_(st.lp) + '</b>';
    if (st.range) {
      const total = Math.max(1, daysBetween_(st.range.start, st.range.end) + 1);
      const used = Math.min(total, Math.max(0, daysBetween_(st.range.start, st.today) + 1));
      const left = st.daysLeft > 0 ? plural(st.daysLeft, 'day') + ' left' : st.daysLeft === 0 ? 'ends today' : 'ended';
      lpHtml += ' · ' + esc_(niceDay_(st.range.start)) + ' to ' + esc_(niceDay_(st.range.end)) +
        ' <span style="color:#2442b8;font-weight:bold">· ' + left + '</span></div>' +
        bar([{ n: used, w: pct(used, total), bg: '#2442b8' }, { n: total - used, w: 100 - pct(used, total), bg: '#dfe5f6' }], 10) +
        '<div style="' + F + 'font-size:12px;color:#6b7393;padding-top:4px">' + pct(used, total) + '% of the LP is over · samples in: <b style="color:#1c2340">' + inN + ' of ' + all + '</b> (' + pct(inN, all) + '%)</div>';
    } else {
      lpHtml += ': no dates set</div>';
    }
    rows.push('<tr><td style="padding:18px 22px 4px">' + lpHtml + '</td></tr>');
  }

  // Number tiles
  const tile = (n, label, bg, fg, note) => '<td width="25%" style="padding:4px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + bg + ';border-radius:10px"><tr><td style="padding:12px 6px;text-align:center;' + F + '">' +
    '<div style="font-size:30px;font-weight:bold;color:' + fg + ';line-height:1">' + n + '</div><div style="font-size:12px;color:' + fg + ';padding-top:4px;font-weight:bold">' + label + '</div>' +
    '<div style="font-size:11px;color:' + fg + '">' + note + '</div></td></tr></table></td>';
  const tiles = [];
  if (on.waiting) {
    tiles.push(tile(tot.rev + tot.res, 'To review', '#fff1a8', '#5c4a00', tot.res ? 'incl. ' + plural(tot.res, 'resubmit') : 'new samples'));
    tiles.push(tile(tot.app, 'Approved', '#bfe8c4', '#14532d', 'not exported yet'));
    tiles.push(tile(tot.redo, 'Redos out', '#fde2e2', '#9b1c1f', 'waiting on students'));
  }
  if (on.uploads) tiles.push(tile(fresh.length, 'New uploads', '#dfe5f6', '#1f2f6b', days > 1 ? 'this week' : 'since yesterday'));
  if (tiles.length) rows.push('<tr><td style="padding:10px 18px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' + tiles.join('') + '</tr></table></td></tr>');

  // All samples bar
  rows.push('<tr><td style="padding:4px 22px">' + section('All samples this LP') + statusBar(22) + '<div style="padding-top:8px">' + legend + '</div></td></tr>');

  // Quick read: a few plain sentences worked out from the numbers
  const read = [];
  const nothing = grid.filter(g => g.cells.length && g.cells.every(c => c.status === 'miss')).map(g => esc_(g.x.student.name));
  if (nothing.length) read.push('<b>' + names(nothing, 4) + '</b> ' + (nothing.length === 1 ? 'has' : 'have') + ' nothing in yet' + (st.daysLeft > 0 ? ' with ' + plural(st.daysLeft, 'day') + ' left' : '') + '.');
  const oldRedos = st.items.filter(i => i.redo && !i.replacedBy && i.redoMarkedAt && Date.now() - i.redoMarkedAt > 3 * 864e5)
    .sort((a, b) => a.redoMarkedAt - b.redoMarkedAt);
  if (oldRedos.length) read.push(oldRedos.slice(0, 3).map(i => '<b>' + esc_(i.name) + '</b>’s ' + esc_(shortClass_(i.subject)) + ' redo has been out ' + Math.floor((Date.now() - i.redoMarkedAt) / 864e5) + ' days').join('; ') + (oldRedos.length > 3 ? '; and ' + (oldRedos.length - 3) + ' more' : '') + '.');
  const fullyIn = st.students.filter(x => x.allIn).length;
  const filed = grid.filter(g => g.cells.length && g.cells.every(c => c.status === 'fil' && c.have >= c.need)).length;
  read.push('<b>' + fullyIn + ' of ' + st.students.length + '</b> students have every sample in' + (filed ? '; <b>' + filed + '</b> ' + (filed === 1 ? 'is' : 'are') + ' completely filed' : '') + '.');
  if (st.daysLeft !== null && st.daysLeft >= 0 && st.daysLeft <= 7) {
    const behind = st.students.filter(x => x.missing.length).length;
    if (behind) read.push('<b>' + plural(behind, 'student') + '</b> still ' + (behind === 1 ? 'needs' : 'need') + ' samples and the LP ends ' + (st.daysLeft === 0 ? 'today' : 'in ' + plural(st.daysLeft, 'day')) + '.');
  }
  if (on.uploads) {
    const span = days * 864e5, now = Date.now();
    const before = st.subs.items.filter(i => !i.trashedAt && i.receivedAt > now - 2 * span && i.receivedAt <= now - span).length;
    read.push('Uploads: <b>' + fresh.length + '</b> ' + (days > 1 ? 'this week' : 'since yesterday') + ', ' + before + ' the ' + (days > 1 ? 'week' : 'day') + ' before.');
  }
  let booked = null;
  const ms = meetingSettings_();
  if (meetingLink_(ms, st.lp)) {
    try {
      booked = {};
      matchBookings_(readBookings_(false)).filter(b => b.lp === st.lp).forEach(b => b.studentIds.forEach(id => { if (!booked[id] || b.start < booked[id]) booked[id] = b.start; }));
      const n = st.students.filter(x => booked[x.student.id]).length;
      read.push('<b>' + n + ' of ' + st.students.length + '</b> families have booked their ' + esc_(st.lp) + ' meeting.');
    } catch (err) { booked = null; } // calendar not allowed yet
  }
  rows.push('<tr><td style="padding:0 22px">' + section('Quick read') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fc;border-left:4px solid #2442b8"><tr><td style="padding:10px 14px;' + F + 'font-size:13px;color:#1c2340;line-height:1.6">' +
    read.map(r => '• ' + r).join('<br>') + '</td></tr></table></td></tr>');

  // Every student, every class
  if (on.families && grid.length) {
    const chip = (c) => {
      const k = REPORT_COLORS[c.status];
      const part = c.need > 1 && c.have > 0 && c.have < c.need ? ' (' + c.have + '/' + c.need + ')' : '';
      return '<span title="' + esc_(c.name + ': ' + k.name) + '" style="display:inline-block;margin:2px 4px 2px 0;padding:0 7px;height:22px;line-height:22px;border-radius:5px;' + F + 'font-size:11px;font-weight:bold;white-space:nowrap;background:' + k.bg + ';color:' + k.fg + ';border:1.5px ' + (c.status === 'miss' ? 'dashed #b9c1da' : 'solid ' + k.bg) + '">' + esc_(c.short) + part + '</span>';
    };
    const tz = st.tz;
    const lines = grid.map(g => {
      let meet = '';
      if (booked) {
        const at = booked[g.x.student.id];
        meet = '<br><span style="font-size:11px;color:' + (at ? '#5f6a8a' : '#9b1c1f') + '">' + (at ? '📅 ' + Utilities.formatDate(new Date(at), tz, 'MMM d') : 'no meeting') + '</span>';
      }
      return '<tr><td style="' + F + 'font-size:12px;color:#1c2340;padding:4px 8px 4px 0;vertical-align:top;width:120px">' + esc_(g.x.student.name) + meet + '</td>' +
        '<td style="padding:2px 0;vertical-align:top">' + (g.cells.length ? g.cells.map(chip).join('') : '<span style="' + F + 'font-size:11px;color:#7a829e">no classes listed</span>') + '</td></tr>';
    });
    rows.push('<tr><td style="padding:0 22px">' + section('Every student, every class') + '<div style="padding-bottom:8px">' + legend + '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + lines.join('') + '</table></td></tr>');
  }

  // Family emails sent, button, footer
  const notes = [];
  if (on.sent) {
    const after = Date.now() - days * 864e5;
    const kinds = {};
    recentEmails_(200).filter(e => e.at > after && e.kind !== 'report' && e.kind !== 'to you').forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    notes.push('Emails sent to families: ' + (Object.keys(kinds).length ? Object.keys(kinds).map(k => kinds[k] + ' ' + esc_(k)).join(', ') : 'none') + '.');
  }
  const noEmail = st.students.filter(x => !recipients_(s, x.student).length).map(x => esc_(x.student.name));
  if (noEmail.length && s.families !== 'off') notes.push('No email on file (add one in the Student Roster): ' + noEmail.join(', ') + '.');
  if (notes.length) rows.push('<tr><td style="padding:14px 22px 0;' + F + 'font-size:12px;color:#4a5272;line-height:1.6">' + notes.join('<br>') + '</td></tr>');
  rows.push('<tr><td style="padding:20px 22px 18px;text-align:center"><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr><td style="background:#2442b8;border-radius:8px;padding:12px 26px">' +
    '<a href="' + esc_(dashLink_(s)) + '" style="' + F + 'font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">Open the dashboard</a></td></tr></table></td></tr>');
  rows.push('<tr><td style="padding:14px 22px 20px;' + F + 'font-size:11px;color:#8a92b0;text-align:center;border-top:1px solid #e3e7f2">' +
    (s.families === 'test' ? 'Family emails are in Test mode, so they come to you. ' : '') + 'Change what this report shows on the Reminders page in WiSH.</td></tr>');

  return '<div style="background:#eef1f8;padding:16px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border-collapse:separate">' +
    rows.join('') + '</table></div>';
}

/** Sends to the student and family, or to you in Test mode. keys: remembered so nothing is sent twice. */
function sendFamily_(s, student, kind, mail, keys) {
  const to = recipients_(s, student);
  const key = keys.map(k => tagged_(s, k)).join(' ');
  if (s.families === 'test') {
    MailApp.sendEmail({
      to: s.me, name: 'WiSH',
      subject: '[Test] ' + mail.subject,
      body: 'TEST MODE: this would have gone to ' + (to.length ? to.join(', ') : '(no email on file for ' + student.name + ')') +
        '. Nothing was sent to the family.\n\n----------\n\n' + mail.body,
    });
    logEmail_(s.me, student, kind, '[Test] ' + mail.subject, key);
    return;
  }
  if (!to.length) return;
  MailApp.sendEmail({ to: to.join(','), replyTo: s.me, subject: mail.subject, body: mail.body, name: 'WiSH' });
  logEmail_(to.join(', '), student, kind, mail.subject, key);
}

function emailLogSheet_() {
  const ss = getAdmin_();
  let sheet = ss.getSheetByName(EMAIL_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(EMAIL_LOG);
    sheet.getRange(1, 1, 1, 6).setValues([['Sent', 'To', 'Student', 'Kind', 'Subject', 'Key']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.hideColumns(6);
  }
  return sheet;
}

function logEmail_(to, student, kind, subject, key) {
  emailLogSheet_().appendRow([new Date(), cell_(to), cell_(student ? student.name : ''), kind, cell_(subject), key || '']);
}

// Test emails are remembered apart, so turning families On later still sends the real ones.
function tagged_(s, key) {
  return s.families === 'test' ? 'test|' + key : key;
}

/** Keys of emails already sent, so nothing goes out twice. One row can hold several keys. */
function emailSent_() {
  const values = emailLogSheet_().getDataRange().getValues();
  const out = {};
  for (let r = 1; r < values.length; r++) String(values[r][5] || '').split(' ').forEach(k => { if (k) out[k] = true; });
  return out;
}

function recentEmails_(n) {
  const sheet = emailLogSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - n + 1);
  return sheet.getRange(from, 1, last - from + 1, 5).getValues().reverse().map(v => ({
    at: v[0] instanceof Date ? v[0].getTime() : Date.parse(v[0]) || 0,
    to: String(v[1]), student: String(v[2]), kind: String(v[3]), subject: String(v[4]),
  }));
}

// ---------- LP meetings: bookings from your Google Calendar ----------
//
// You make a Google Calendar booking page (appointment schedule) and paste its link on the
// dashboard's Meetings page: one link for every LP (change its dates in Google each LP), or a
// different link for an LP. Families book there; Google puts each booking on your
// calendar with the family as a guest. WiSH reads those events (read-only) and matches the
// guest's email to the Student email and Family email columns of the roster. A booking from an
// email that isn't on the roster shows as unmatched until you link it to a student once.
//
// A calendar event counts as a booking when Google wrote "Booked by" in it (every booking page
// does), or its title has one of the words you set on the Meetings page. An event belongs to the
// LP named in its title ("LP3"), otherwise to the LP whose dates it falls in.

const MEETINGS_SECONDS = 900;   // bookings are remembered this long (the 10-minute timer refreshes them)
const MEETINGS_DEFAULTS = { links: {}, words: '' };

function meetingSettings_() {
  const saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('MEETINGS') || '{}');
  const s = Object.assign({}, MEETINGS_DEFAULTS, saved);
  s.links = Object.assign({}, saved.links || {});
  return s;
}

/** The booking link for one LP: its own, or the one for every LP (key ALL). */
function meetingLink_(s, lp) {
  return s.links[lp] || s.links.ALL || '';
}

/** Emails you linked to a student by hand ('-' = not a family, don't show it). */
function meetingMatches_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('MEETING_MATCH') || '{}');
}

function forgetMeetings_() {
  try { CacheService.getScriptCache().remove('meetings'); } catch (err) {}
}

/** The school year to look in: the LP dates, plus a little before and after. */
function meetingRange_() {
  const dates = getLpDates_();
  const starts = [], ends = [];
  LEARNING_PERIODS.forEach(lp => { if (dates[lp]) { starts.push(dates[lp].start); ends.push(dates[lp].end); } });
  const day = 24 * 3600 * 1000;
  if (!starts.length) return { from: new Date(Date.now() - 120 * day), to: new Date(Date.now() + 120 * day) };
  starts.sort(); ends.sort();
  return { from: new Date(Date.parse(starts[0] + 'T00:00:00Z') - 14 * day), to: new Date(Date.parse(ends[ends.length - 1] + 'T00:00:00Z') + 28 * day) };
}

function meetingLp_(title, ymd, dates) {
  const m = /\bLP\s?([1-8])\b/i.exec(title || '');
  if (m) return 'LP' + m[1];
  let best = null;
  LEARNING_PERIODS.forEach(lp => {
    const r = dates[lp];
    if (!r) return;
    if (ymd >= r.start && ymd <= r.end) best = lp;
    else if (!best && ymd < r.start) best = lp;  // between two LPs: counts for the one coming up
  });
  return best;
}

/**
 * Every booking in the school year: [{ key, lp, start, end, title, who: [{ name, email }] }].
 * Read from the calendar at most every 15 minutes. Throws if the calendar isn't allowed yet.
 */
function readBookings_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const remembered = cache.get('meetings');
    if (remembered) return JSON.parse(remembered);
  }
  const s = meetingSettings_();
  const cal = CalendarApp.getDefaultCalendar();
  const range = meetingRange_();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const tz = Session.getScriptTimeZone();
  const dates = getLpDates_();
  const words = String(s.words || '').split(',').map(w => w.trim()).filter(Boolean);
  const seen = {};
  const out = [];
  ['Booked by'].concat(words).forEach(word => {
    cal.getEvents(range.from, range.to, { search: word }).forEach(ev => {
      const start = ev.getStartTime();
      const key = ev.getId() + '@' + start.getTime();
      if (seen[key]) return;
      seen[key] = true;
      const title = ev.getTitle();
      const desc = ev.getDescription() || '';
      const booked = /booked by/i.test(desc);
      if (!booked && !words.some(w => title.toLowerCase().indexOf(w.toLowerCase()) !== -1)) return;
      const who = [];
      const add = (email, name) => {
        email = String(email || '').trim().toLowerCase();
        if (!email || email === me || who.some(w => w.email === email)) return;
        who.push({ email: email, name: String(name || '').trim() });
      };
      // Google writes "Booked by", then the name, then the email.
      const m = /booked by\s*(?:<[^>]*>|\s)*([^<\n]*?)\s*(?:<[^>]*>|\s)*([\w.+'-]+@[\w-]+(?:\.[\w-]+)+)/i.exec(desc);
      if (m) add(m[2], m[1]);
      ev.getGuestList().forEach(g => add(g.getEmail(), g.getName()));
      const lp = meetingLp_(title, ymd_(start, tz), dates);
      if (!lp) return;
      const meet = (/https:\/\/meet\.google\.com\/[a-z0-9-]+/i.exec(desc + ' ' + (ev.getLocation() || '')) || [])[0] || '';
      out.push({ key: key, id: ev.getId(), lp: lp, start: start.getTime(), end: ev.getEndTime().getTime(), title: clean_(title, 200), who: who, meet: meet });
    });
  });
  out.sort((a, b) => a.start - b.start);
  addMeetLinks_(out, cal.getId());
  try { cache.put('meetings', JSON.stringify(out), MEETINGS_SECONDS); } catch (err) { /* too big: read next time */ }
  return out;
}

/**
 * Booking pages put the Google Meet link in the event's conference details, which only the
 * Calendar API shows. Looked up once for each upcoming meeting and remembered (MEET_LINKS).
 */
function addMeetLinks_(bookings, calId) {
  const props = PropertiesService.getScriptProperties();
  const known = JSON.parse(props.getProperty('MEET_LINKS') || '{}');
  const now = Date.now(), soon = now + 21 * 24 * 3600 * 1000;
  let changed = false;
  const keep = {};
  bookings.forEach(b => {
    if (b.meet || b.end < now) return;
    if (known[b.key] !== undefined) { b.meet = known[b.key]; keep[b.key] = known[b.key]; return; }
    if (b.start > soon || typeof Calendar === 'undefined') return;
    try {
      const found = Calendar.Events.list(calId, { iCalUID: b.id, maxResults: 1 }).items || [];
      const ev = found[0] || {};
      const entry = ((ev.conferenceData || {}).entryPoints || []).filter(e => e.entryPointType === 'video')[0];
      b.meet = ev.hangoutLink || (entry && entry.uri) || '';
    } catch (err) {
      b.meet = '';
    }
    keep[b.key] = b.meet;
    changed = true;
  });
  if (changed || Object.keys(keep).length !== Object.keys(known).length) props.setProperty('MEET_LINKS', JSON.stringify(keep));
}

/** Adds studentIds to each booking, from the roster emails and the links you made by hand. */
function matchBookings_(bookings) {
  const byEmail = {};
  const put = (email, id) => { email = String(email || '').trim().toLowerCase(); if (email) (byEmail[email] = byEmail[email] || []).push(id); };
  getStudents_().forEach(st => { put(st.email, st.id); st.familyEmails.forEach(e => put(e, st.id)); });
  const manual = meetingMatches_();
  return bookings.map(b => {
    let ids = [], ignored = false;
    b.who.forEach(w => {
      const set = manual[w.email];
      if (set === '-') ignored = true;
      else if (set) ids.push(set);
      else ids = ids.concat(byEmail[w.email] || []);
    });
    ids = ids.filter((id, n) => ids.indexOf(id) === n);
    return Object.assign({}, b, { studentIds: ids, ignored: ignored && !ids.length });
  });
}

/** One student's bookings, or [] when the calendar can't be read. */
function studentBookings_(id) {
  try {
    return matchBookings_(readBookings_(false)).filter(b => b.studentIds.indexOf(id) !== -1)
      .map(b => ({ lp: b.lp, start: b.start, end: b.end }));
  } catch (err) {
    return [];
  }
}

/** What the student app shows: the booking link for each LP, and the student's own meetings. */
function studentMeetings_(id) {
  const s = meetingSettings_();
  if (!Object.keys(s.links).length) return null;
  const links = {};
  LEARNING_PERIODS.forEach(lp => { if (meetingLink_(s, lp)) links[lp] = meetingLink_(s, lp); });
  return { links: links, booked: studentBookings_(id) };
}

/** The Meetings page and the dashboard: links, settings and every booking with its student. */
function adminMeetings_(body) {
  const s = meetingSettings_();
  const out = { ok: true, links: s.links, words: s.words, manual: meetingMatches_(), items: [], calendar: '' };
  try {
    out.items = matchBookings_(readBookings_(!!body.fresh));
    out.calendar = CalendarApp.getDefaultCalendar().getName();
  } catch (err) {
    out.error = /permission|authoriz|scope/i.test(err.message)
      ? 'allow' : 'WiSH couldn’t read your calendar: ' + err.message;
  }
  return out;
}

function adminSaveMeetings_(body) {
  const links = {};
  const given = body.links || {};
  const keys = ['ALL'].concat(LEARNING_PERIODS);
  for (let i = 0; i < keys.length; i++) {
    const lp = keys[i];
    const link = clean_(given[lp], 300);
    if (!link) continue;
    if (!/^https:\/\/(calendar\.app\.google|calendar\.google\.com)\/[^\s"<>]+$/.test(link)) {
      return { ok: false, error: (lp === 'ALL' ? 'Every LP' : lp) + ': paste the booking page link from Google Calendar (it starts with https://calendar.app.google/).' };
    }
    links[lp] = link;
  }
  const words = clean_(body.words, 200);
  PropertiesService.getScriptProperties().setProperty('MEETINGS', JSON.stringify({ links: links, words: words }));
  forgetMeetings_();
  return adminMeetings_({ fresh: true });
}

/** Links a booker's email to a student (studentId), stops showing it ('-'), or undoes that (''). */
function adminMeetingMatch_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: 'That email doesn’t look right.' };
  const to = String(body.studentId || '').toUpperCase();
  if (to && to !== '-' && !findStudent_(to)) return { ok: false, error: 'That student isn’t on the roster.' };
  return withLock_(() => {
    const manual = meetingMatches_();
    if (to) manual[email] = to; else delete manual[email];
    PropertiesService.getScriptProperties().setProperty('MEETING_MATCH', JSON.stringify(manual));
    return adminMeetings_({});
  });
}

/**
 * Run once from the editor after this update: Google asks you to allow WiSH to see your
 * calendar (read-only). Then it lists the bookings it finds, so you can check.
 */
function allowCalendar() {
  const list = matchBookings_(readBookings_(true));
  Logger.log('WiSH can read your calendar. Bookings found this school year: ' + list.length);
  list.slice(0, 20).forEach(b => Logger.log(b.lp + '  ' + new Date(b.start) + '  ' + b.who.map(w => w.name + ' <' + w.email + '>').join(', ') +
    (b.studentIds.length ? '  -> ' + b.studentIds.join(', ') : '  (not matched)')));
}
