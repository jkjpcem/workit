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
const WORKIT_VERSION = 15;
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
  'Sem 2 classes (leave blank to use Sem 1 with A changed to B)'];
const LEARNING_PERIODS = ['LP1', 'LP2', 'LP3', 'LP4', 'LP5', 'LP6', 'LP7', 'LP8'];
const GRADES = ['8', '9', '10', '11', '12'];
const REDO_REASONS = ['Missing name', 'Missing date', 'Missing subject', 'Missing score/grade/feedback'];
const MAX_BYTES = 30 * 1024 * 1024;

// Columns in the Submissions sheet (1-based).
const SUB = {
  RECEIVED: 1, STUDENT_ID: 2, NAME: 3, LP: 4, SUBJECT: 5, DATE_DONE: 6, SCORE: 7,
  FEEDBACK: 8, COMMENTS: 9, PAGES: 10, FILE: 11, FAVORITE: 12, UPLOAD_ID: 13, FILE_ID: 14, THUMB: 15,
  APPROVED: 16, REDO: 17, REASONS: 18, NOTIFIED: 19, REPLACED_BY: 20, RESUBMIT_OF: 21,
  ANNOTATIONS: 22, FINALIZED: 23, FINAL_FILE: 24, FINAL_ID: 25, MINUTES: 26, SOURCE: 27, FILED_AS: 28, REDO_NOTE: 29, FAMILY_NOTES: 30, TRASHED: 31, TRASHED_BY: 32,
};
const SUB_HEADERS = ['Received', 'Student ID', 'Student name', 'LP', 'Subject', 'Date completed',
  'Grade / score', 'Feedback', 'Comments', 'Pages', 'File', 'Favorite', 'Upload ID', 'File ID', 'Thumbnail',
  'Approved', 'Redo', 'Redo reasons', 'Student saw redo', 'Resubmitted as', 'Resubmission of',
  'Annotations', 'Finalized', 'Final file', 'Final file ID', 'Minutes spent', 'Uploaded as', 'Filed as', 'Redo note', 'Family notes', 'Trashed', 'Trashed by'];
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
      login: login_, upload: upload_, list: list_, favorite: favorite_, file: file_, remove: remove_, restore: restore_, familyNotes: familyNotes_, ackAlerts: ackAlerts_, checkLink: checkLink_,
    };
    const admin = {
      adminOverview: adminOverview_, adminStudent: adminStudent_, adminFile: adminFile_,
      adminReview: adminReview_, adminSetLp: adminSetLp_, adminAnnotate: adminAnnotate_, adminFinalize: adminFinalize_,
      adminRoster: adminRoster_, adminSaveRoster: adminSaveRoster_, adminSetLpDates: adminSetLpDates_,
      adminCore: adminCore_, adminCoreMark: adminCoreMark_, adminCoreSort: adminCoreSort_,
      adminTrash: adminTrash_, adminTrashList: adminTrashList_, adminRestore: adminRestore_, adminDeleteNow: adminDeleteNow_,
    };
    const es = {
      esLogin: esLogin_, esForgot: esForgot_, esLookup: esLookup_, esChangePassword: esChangePassword_, esSaveSetup: esSaveSetup_, esClaim: esClaim_, schoolDates: schoolDates_,
    };
    const superAdmin = {
      superEsList: superEsList_, superEsAdd: superEsAdd_, superEsReset: superEsReset_, superEsSetActive: superEsSetActive_, superChangePassword: adminChangePassword_,
    };
    // Requests that only read use the remembered copy of the sheet; anything else reads the
    // sheet itself and makes the next request read it fresh too.
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
  // Redo requests the student hasn't seen yet are shown once, right after sign-in.
  const all = readSubs_().items.filter(i => i.studentId === student.id);
  const mine = all.filter(i => !i.trashedAt);
  const alerts = mine.filter(i => i.redo && !i.notified && !i.replacedBy)
    .map(i => ({ id: i.id, lp: i.lp, subject: i.subject, dateCompleted: i.dateCompleted, reasons: i.reasons, redoNote: i.redoNote }));
  // The student's uploads come along, so the app doesn't have to ask a second time.
  return { ok: true, student: student, currentLp: getCurrentLp_(), lps: LEARNING_PERIODS, lpDates: getLpDates_(), alerts: alerts,
    items: mine.map(publicItem_), trash: studentTrash_(all) };
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
  if (LEARNING_PERIODS.indexOf(body.lp) === -1) return { ok: false, error: 'Unknown Learning Period.' };
  if (!clean_(body.subject, 60)) return { ok: false, error: 'Pick a subject.' };
  const source = SOURCES.indexOf(body.source) !== -1 ? body.source : 'scan';
  if (source === 'gdoc' ? !body.link : !body.data) return { ok: false, error: 'No file was attached.' };
  const dateProblem = checkDate_(body.lp, clean_(body.dateCompleted, 20));
  if (dateProblem) return { ok: false, error: dateProblem };
  const uploadId = clean_(body.uploadId, 60);
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
    row[SUB.THUMB - 1] = String(body.thumb || '').indexOf('data:image/jpeg;base64,') === 0
      ? String(body.thumb).slice(0, 45000) : '';
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
  const json = JSON.stringify((Array.isArray(body.notes) ? body.notes : []).slice(0, 60));
  if (json.length > 45000) return { ok: false, error: 'Too many notes on one upload.' };
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
  if (!isMain_() || String(body.adminUser || '').trim().toLowerCase() !== ADMIN_USERNAME.toLowerCase() ||
      !superPassOk_(body.adminKey)) {
    return { ok: false, error: 'Wrong username or password.' };
  }
  return null;
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
  if (user === ADMIN_USERNAME.toLowerCase() && superPassOk_(pass)) return { ok: true, role: 'super', version: WORKIT_VERSION };
  const found = findEs_(user);
  const es = found.es;
  if (!es || !es.hash || (hash_(es.salt, pass) !== es.hash && !useResetPass_(found, pass))) {
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
  const link = String(body.link || '');
  const text = [
    'Hi ' + es.name.split(' ')[0] + ',',
    '',
    'Someone (hopefully you) asked for a new WiSH password. If it wasn’t you, ignore this email: your current password still works.',
    '',
    '1. On a computer, open: ' + (/^https:\/\/[^\s]+$/.test(link) ? link : 'the WiSH ES dashboard'),
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
      for (let n = 2; findEs_(user).es || user === ADMIN_USERNAME.toLowerCase(); n++) user = base + n;
    }
    if (!/^[a-z0-9._-]{3,30}$/.test(user)) return { ok: false, error: 'Usernames are 3 to 30 letters or numbers, with no spaces.' };
    if (user === ADMIN_USERNAME.toLowerCase()) return { ok: false, error: 'That username is taken.' };
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
  return { ok: true, lpDates: getLpDates_(), currentLp: getCurrentLp_() };
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
    if (redo && item.finalizedAt) return { ok: false, error: 'This is already finalized, so it can’t be sent back for a redo.' };
    const approved = !redo && body.approved === true;
    if (!approved && item.finalizedAt) return { ok: false, error: 'This is already finalized.' };
    const reasons = redo ? (body.reasons || []).map(r => clean_(r, 60)).filter(Boolean).join('; ') : '';
    // The ES's own typed reason. Older dashboards don't send one, so keep what's there.
    const note = !redo ? '' : body.note === undefined ? item.redoNote : clean_(body.note, 500);
    // A new or changed redo request is shown to the student again.
    const same = item.redo && reasons === item.reasons.join('; ') && note === item.redoNote;
    const notified = redo ? (same ? item.notified : false) : '';
    subs.sheet.getRange(item.row, SUB.APPROVED, 1, 4).setValues([[approved, redo, reasons, notified]]);
    subs.sheet.getRange(item.row, SUB.REDO_NOTE).setValue(cell_(note));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Saves the text boxes so you can come back to them before finalizing. */
function adminAnnotate_(body) {
  const subs = readSubs_();
  const item = findItem_(subs, String(body.studentId || '').toUpperCase(), clean_(body.id, 60));
  if (!item) return { ok: false, error: 'Upload not found.' };
  const json = JSON.stringify(Array.isArray(body.annotations) ? body.annotations : []);
  if (json.length > 45000) return { ok: false, error: 'Too many annotations on one upload.' };
  subs.sheet.getRange(item.row, SUB.ANNOTATIONS).setValue(json);
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
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const row = {
      first: text_(v[0]).trim(), last: text_(v[1]).trim(), grade: String(v[2]).trim(), city: text_(v[3]).trim(),
      classes: text_(v[5]).trim(), classes2: text_(v[6]).trim(),
    };
    if (row.first || row.last || row.grade || row.city || row.classes || row.classes2) rows.push(row);
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
    };
    if (!row.first && !row.last && !row.grade && !row.city && !row.classes && !row.classes2) return;
    const id = makeId_(row.first, row.grade, row.city);
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
      sheet.getRange(2, 6, last - 1, 2).clearContent();
    }
    studentHeaders_();
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows.map(r => [cell_(r.first), cell_(r.last), r.grade, cell_(r.city)]));
      sheet.getRange(2, 6, rows.length, 2).setValues(rows.map(r => [cell_(r.classes), cell_(r.classes2)]));
    }
    return { ok: true, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/** Saves each LP's start and end dates (yyyy-mm-dd; blank means no limit). */
function adminSetLpDates_(body) {
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
  return { ok: true, lpDates: getLpDates_() };
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
      filedAs: FILED_AS.indexOf(String(v[SUB.FILED_AS - 1])) !== -1 ? String(v[SUB.FILED_AS - 1]) : (v[SUB.FINALIZED - 1] ? 'Annotated' : ''),
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
    const accel = /\(\s*accel(erated)?\s*\)/i.test(s);
    const name = s.replace(/\(\s*accel(erated)?\s*\)/ig, '').replace(/\s+/g, ' ').trim();
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
  sheet.getRange(1, 6, 1, 2).setValues([STUDENT_HEADERS.slice(5)]).setFontWeight('bold');
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
function checkDate_(lp, ymd) {
  if (!isYmd_(ymd)) return 'Enter the date you completed it.';
  const day = new Date(ymd + 'T12:00:00Z').getUTCDay();
  if (day === 0 || day === 6) return 'The date completed must be a weekday (Monday to Friday).';
  const range = getLpDates_()[lp];
  if (range && (ymd < range.start || ymd > range.end)) {
    return 'The date completed must be during ' + lp + ' (' + range.start + ' to ' + range.end + ').';
  }
  return '';
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
  return info;
}

function googleFilePdf_(info) {
  const res = driveGet_('/export?mimeType=application%2Fpdf', info);
  if (res.getResponseCode() === 403 && /exportSizeLimitExceeded/.test(res.getContentText())) {
    throw new Error('That file is too big for Google to turn into a PDF. Download it as a PDF and use Choose a file instead.');
  }
  if (res.getResponseCode() !== 200) throw new Error(NO_ACCESS);
  return res.getContent();
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
const READ_ONLY_ACTIONS = ['login', 'list', 'file', 'checkLink', 'adminOverview', 'adminStudent', 'adminFile', 'adminTrashList',
  'adminRoster', 'adminCore', 'schoolDates', 'esLookup', 'esLogin', 'superEsList', 'ping'];
let FRESH_ = true;  // outside web requests (the editor, menus) always read the sheet

function memoGen_(cache) {
  let gen = cache.get('memo-gen');
  if (!gen) {
    gen = String(Date.now());
    cache.put('memo-gen', gen, 21600);
  }
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
