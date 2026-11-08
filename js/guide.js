// ES dashboard: the Help guide, a side panel on the right (a sheet at the bottom on phones).
// Pick a topic and the guide opens the right page, rings the next thing to click in blinking
// gold, and says in words what to do and what that part of the page is for. Steps tick off
// by themselves when the ES clicks the ringed thing; "I did it" moves on for everything else.
// The topics and their written steps live in js/help.js; the guided steps live here.

function AdminGuide(ctx) {
  const { $, $$, esc, help } = ctx;

  // ---------- Finding things on the page ----------

  const shown = (el) => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const first = (sel) => [...document.querySelectorAll(sel)].find(shown) || null;
  const inViewer = () => !$('#viewer').hidden;
  const onScreen = (name) => !$(`#screen-${name}`).hidden && !inViewer();
  // A roster column heading, by the start of its text.
  const th = (text) => () => [...document.querySelectorAll('.roster.people th')].find(t => shown(t) && t.textContent.trim().startsWith(text)) || null;
  // The first empty row in the Student Roster, or the last row.
  const emptyRow = () => {
    const rows = [...document.querySelectorAll('#roster-body tr')].filter(shown);
    return rows.find(tr => { const i = tr.querySelector('input[data-k="first"]'); return i && !i.value.trim(); }) || rows[rows.length - 1] || null;
  };

  // Opening a sample from the dashboard. Skipped when a sample is already open.
  const openSample = (which, said, missing) => ({
    skip: inViewer,
    at: which.split(',').map(w => `#student-grid img.st-${w.trim()}`).join(', '),
    click: true,
    wait: inViewer,
    do: `Click a sample on a student’s card. ${said}`,
    why: 'The small pictures on each card are the samples the student turned in. Their color matches the key under the tiles at the top.',
    missing: missing || 'There’s no sample like that in this LP right now. Pick another LP next to <b>Showing</b> at the top, or come back when one comes in.',
  });
  const openStudent = {
    skip: () => onScreen('student'),
    at: '#student-grid .scard h3',
    click: true,
    wait: () => onScreen('student'),
    do: 'Click a student’s name on the dashboard.',
    why: 'Each card is one student. Clicking the name opens that student’s own page.',
    missing: 'Add students first on the <b>Student Roster</b> page.',
  };

  // ---------- The guided steps, by Help topic id ----------
  // Each step: do (what to do), why (what it’s for), at (what to ring: a selector or a function),
  // click (move on when it’s clicked), tag (the label next to the ring), skip, missing.

  const GUIDES = {
    'first-week': [
      { at: '#open-roster', do: 'First, add your students on the <b>Student Roster</b>.', why: 'The roster is your class list. Students can’t sign in until they’re on it.', tag: 'Start here' },
      { at: '#open-link', do: 'Then send your student link with <b>Share link &amp; QR</b>.', why: 'It’s the one link your students and families use, with a QR code and a flyer you can print.', tag: 'Then this' },
      { at: '#open-reminders', do: 'Choose your reminder emails on <b>Reminders</b>.', why: 'WiSH can email families about missing work and send you a daily or weekly report.', tag: 'Then this' },
      { at: '#student-grid', do: 'As work comes in, check this dashboard each day. Click a sample to review it.', why: 'Every student has a card here, sorted so the students who still owe work are on top.', tag: 'Your dashboard' },
      { at: '#open-help', do: 'That’s it. Click <b>Help</b> on any page for help with that page.', why: 'Each guide opens the right page and rings what to click next. You can also search for any topic.', tag: 'Help' },
    ],
    share: [
      { at: '.link-input', do: 'This is your student link. It’s only yours.', why: 'Students open it on their phone or computer and sign in. A link from another ES sends them to that ES’s WiSH instead.', tag: 'Your link' },
      { at: '[data-copy]', do: 'Click <b>Copy link</b>, then paste it into an email or text to families.', click: true },
      { at: '[data-png]', do: 'Or click <b>Download QR code</b> to put the code in slides or a newsletter.', why: 'Families point their phone camera at the QR code to open the link.' },
      { at: '[data-flyer]', do: 'Or click <b>Print a flyer</b> to send home.', why: 'The flyer has the QR code and the sign-in steps on one page.' },
    ],
    roster: [
      { at: emptyRow, tag: '✏️ Type here', do: 'Type the student’s first name, last name, grade and city in an empty row.', why: 'Students sign in with the first 2 letters of their first name, their grade, and the first 2 letters of their city, so check those are right.' },
      { at: '#roster-add', do: 'Need more empty rows? Click <b>＋ Add 5 rows</b>. If not, click <b>I did it</b>.', why: 'You can also paste many rows at once from Excel or Google Sheets.' },
      { at: th('Student email'), tag: '✏️ Type here', do: 'Scroll right in the same row and add the student’s email and the parent emails.', why: 'Reminder emails go to these addresses. Put several parent emails in one box, separated by commas.' },
      { at: () => first('#classes-body .cls-add') || first('#classes-body'), tag: '✏️ Type here', do: 'Under <b>Student Classes</b>, type each class under Sem 1 and press Enter.', why: 'Classes decide which samples a student owes. Use the exact Course Catalog name. A Sem 1 class ending in A is copied to Sem 2 with a B.' },
      { at: '#roster-save', click: true, do: 'Click <b>Save students</b>.', why: 'Nothing changes until you save.' },
    ],
    classes: [
      { at: () => first('#classes-body .cls-add'), tag: '✏️ Type here', do: 'Find the student under <b>Student Classes</b>. Type a class under Sem 1 and press Enter.', why: 'Use the exact Course Catalog name. Each class needs 1 sample per LP.', missing: 'Add the student in the rows above first, then their classes show up here.' },
      { at: () => first('#classes-body td[data-k="classes2"]'), do: 'Check Sem 2. A Sem 1 class ending in A was copied here with a B. Change it if Sem 2 is different.', why: 'Sem 1 is LP1 to LP4 and Sem 2 is LP5 to LP8. WiSH switches by itself.', tag: 'Sem 2' },
      { at: () => first('#classes-body .cls-name') || first('#classes-body td[data-k="classes"]'), do: 'For an accelerated class, click the class to switch Accel on, or type <b>(Accel)</b> after its name.', why: 'Accel classes need 2 samples per LP instead of 1.', tag: 'Accel' },
      { at: '#roster-save', click: true, do: 'Click <b>Save students</b>.', why: 'Nothing changes until you save.' },
    ],
    'start-leave': [
      { at: th('Started'), do: 'For a student who starts mid-year, type the date they started under <b>Started</b> (scroll right).', why: 'LPs that ended before that date need no samples.', tag: 'Started' },
      { at: th('Status'), do: 'For a student who left, set <b>Status</b> to Inactive.', why: 'Inactive students get no reminders, but they can still sign in and see their work.', tag: 'Status' },
      { at: th('Withdrew'), do: 'Then type the date they left under <b>Withdrew</b>.', why: 'They still owe samples for every LP that started on or before that date, and none after.', tag: 'Withdrew' },
      { at: '#roster-save', click: true, do: 'Click <b>Save students</b>.', why: 'Nothing changes until you save.' },
    ],
    dashboard: [
      { at: '#view-lp', do: 'This picks which LP you’re looking at. It opens on the current LP.', why: 'Pick an earlier LP to check or finish its samples.', tag: 'Pick an LP' },
      { at: '#tiles', do: 'The tiles count the whole class for this LP.', why: 'How many students have uploaded, how many samples wait for you, and how many are annotated or filed as Extra.', tag: 'The numbers' },
      { at: '#screen-dash .legend', do: 'This key says what each color on a card means.', why: 'Light yellow is to review, red is a redo, green is approved and navy is filed in your Drive.', tag: 'Color key' },
      { at: '#student-grid', do: 'Each card is one student. Students who still owe work are at the top.', why: 'Below them are Turned in, then Reviewed and Exported. Click a sample to open it, or a name to open the student.', tag: 'Students' },
      { at: '#rp-side', do: 'The Annotation Tracker shows the 4 core subjects for this reporting period.', why: 'Each student needs 1 annotated sample in English, Math, Social Studies and Science. Navy means done.', tag: 'Tracker' },
    ],
    review: [
      openSample('new', 'Pick one in light yellow: those are waiting for you.', 'Nothing is waiting for review in this LP. New uploads show in light yellow on a student’s card.'),
      { at: '#v-pages', do: 'Look through the pages. Scroll down to see them all.', why: 'These are the pages the student turned in, as one PDF.', tag: '👀 Look here' },
      { at: '#v-info', do: 'Check the details: class, date completed, grade or score, and minutes.', why: 'WiSH already checked the date is a school day in the LP. A ⚠ means something needs a look.', tag: '👀 Check these' },
      { at: '#t-approve', click: true, do: 'If it’s good, click <b>✓ Approve</b>.', why: 'Approved samples turn green. Students can no longer delete them.' },
      { at: () => (innerWidth <= 760 ? first('#v-close') : first('#v-next')), do: 'Click <b>›</b> to go to the next sample, or <b>✕ Close</b> when you’re done.', why: 'The arrows move through the samples on the dashboard in order.' },
    ],
    redo: [
      openSample('new, approved', 'Pick the one that needs a redo.'),
      { at: '#t-redo', click: true, do: 'Click <b>↺ Redo</b>.', why: 'This opens the list of reasons. Nothing goes to the student yet.' },
      { at: '#reasons', do: 'Pick every reason that applies.', why: 'The student sees these reasons the next time they sign in.', tag: 'Pick reasons' },
      { at: '#redo-note', tag: '✏️ Type here', do: 'Type your own note if you like.', why: 'For example: “The last page is cut off. Please retake it in better light.”' },
      { at: '#t-send', click: true, do: 'Click <b>↩ Send back to student</b>.', why: 'The sample turns red. When the student turns it in again, the new one goes on top and the old one becomes a reference.' },
    ],
    annotate: [
      openSample('new, approved', 'Pick the one you want to annotate.'),
      { at: '#t-annotate', click: true, do: 'Click <b>✏️ Annotations</b>.', why: 'This opens the tools for writing on the pages.' },
      { at: '#a-add', click: true, do: 'Click <b>＋ Text box</b>.', why: 'Then click on the page where your note goes and type.' },
      { at: '#v-pages', do: 'Click on the page where the note goes and type it. Drag the ⠿ handle to move it.', why: 'You can change the font, size and color in the bar at the top.', tag: '✏️ Click on the page' },
      { at: '#a-pen', do: 'To write by hand, click <b>✏️ Pen</b>. <b>↶ Undo</b> takes back the last mark.', why: 'Works with a mouse, a finger, an Apple Pencil or an S Pen.' },
      { at: '#a-done', click: true, do: 'Click <b>Done</b> when you finish.', why: 'WiSH saves as you go.' },
    ],
    export: [
      openSample('approved, new', 'Pick an approved (green) one.'),
      { skip: () => $('#t-approve').getAttribute('aria-pressed') === 'true', at: '#t-approve', click: true, do: 'Approve it first: click <b>✓ Approve</b>.', why: 'Only approved samples can be exported.' },
      { at: '#t-finalize', do: 'Click <b>🏁 Export as Annotated</b> to save a copy with your notes to <b>Approved › LP# Annotated</b> in your Drive.', why: 'Each class needs 1 annotated sample per LP (2 for Accel). The sample turns navy.', click: true },
      { at: '#t-extra', do: 'Or, for a sample you don’t annotate, click <b>📁 Export as Extra</b>.', why: 'It saves it as is to <b>Approved › LP# Extra</b>.' },
    ],
    'undo-export': [
      openSample('finalized', 'Pick a navy (filed) one.', 'No sample is filed in this LP yet.'),
      { at: '[data-unfile]', click: true, do: 'Click <b>↶ Undo export</b>.', why: 'The exported copy goes to WiSH’s Trash, and the sample stays approved, ready to export again.' },
    ],
    'change-class': [
      openSample('new, approved, finalized', 'Pick the one with the wrong class.'),
      { at: '#v-subject', click: true, do: 'Click <b>Change class</b> next to the class name.', why: 'Pick the right class. WiSH renames the files in your Drive.' },
      { at: '#v-info', do: 'If it was already exported as Annotated, click <b>🏁 Update annotated copy</b> so the header shows the new class.', why: 'The header box on the annotated copy doesn’t change by itself.', tag: '👀 Check' },
    ],
    'set-aside': [
      openSample('redo', 'Pick a red one (sent back for a redo).', 'No sample is waiting on a redo in this LP.'),
      { at: '#t-aside', click: true, do: 'Click <b>📌 Set aside as a reference</b>.', why: 'It stays viewable (gray dashed) but doesn’t count, and leaves your To review list.' },
    ],
    'upload-for': [
      openStudent,
      { at: '#upload-for', click: true, do: 'Click <b>＋ Upload for</b> and their name.', why: 'The student app opens in a new tab, signed in as this student.' },
      { do: 'In the new tab, pick the class, add the pages, fill in the details, and submit.', why: 'It shows an “Added by your ES” badge, and the date and page checks are skipped.', tag: 'Then, in the new tab' },
    ],
    delete: [
      openSample('new, approved, redo, reference, finalized', 'Pick the one to delete.'),
      { at: '#t-trash', do: 'Click <b>🗑 Delete</b> to delete it.', why: 'Deleted samples stay in WiSH’s Trash for 60 days.', click: true },
      { skip: () => !inViewer(), at: '#v-close', click: true, do: 'To get a deleted sample back, first click <b>✕ Close</b>.' },
      { skip: () => onScreen('trash'), at: '#user-btn', click: true, do: 'To get one back, click your name at the top right.', why: 'This opens a small menu.' },
      { skip: () => onScreen('trash'), at: '#open-trash', click: true, do: 'Click <b>Trash</b>.' },
      { at: '#trash-grid', do: 'Find the sample and click <b>Restore</b>. It goes back where it was.', why: 'Students can also restore their own deletes from their own Trash.', tag: 'Your Trash' },
    ],
    tracker: [
      { at: '#rp-side', do: 'This is the Annotation Tracker for the current reporting period.', why: 'Each student needs at least 1 annotated sample in each core: English, Math, Social Studies or History, and Science. Navy means done.', tag: 'Tracker' },
      openStudent,
      { at: '#student-core', do: 'Here is this student’s tracker. To count a core by hand, click <b>Mark done</b> next to it and add a note.', why: 'If a core is missing, an annotated elective fills it by itself.', tag: 'Mark done' },
    ],
    pe: [
      openStudent,
      { at: '[data-pe]', do: 'Next to PE, click <b>Mark done</b> to mark the PE form yourself.', why: 'WiSH also marks it by itself when the Jotform email arrives in your school Gmail.', missing: 'This student has no PE class in this LP.' },
    ],
    reminders: [
      { at: '#rem-form .rem-card.fam .seg', do: 'Under <b>Families</b>, pick Off, Test or On.', why: '<b>Test</b> sends every email to you instead, so you can check them first. <b>On</b> sends them to families.', tag: 'Pick one' },
      { at: () => first('#rem-form fieldset'), do: 'Choose who gets them: parents, students, or both.', why: 'Emails go to the addresses in the Student Roster.', tag: 'Who' },
      { at: () => first('#rem-form input[name="missing"]').closest('label'), do: 'Choose what they’re about: <b>Still to do</b> and <b>All done</b>.', why: 'Still to do lists missing classes and redos. All done is one congratulations email per LP.', tag: 'What' },
      { at: '#rem-weeks', do: 'Set how often for each week of the LP.', why: 'Weeks count from the LP’s start date. Only families with something still to do get them.', tag: 'How often' },
      { at: () => first('#rem-form .rem-save button'), click: true, do: 'Click <b>Save reminders</b>.', why: 'Emails come from your own school email.' },
    ],
    wording: [
      { at: '#rem-tabs', do: 'Under <b>Email wording</b>, pick the email to change.', why: 'Each kind of reminder has its own wording.', tag: 'Pick one' },
      { at: '#tpl-subject', tag: '✏️ Type here', do: 'Change the subject and the message below it.', why: 'Words in {curly brackets} are filled in for each family.' },
      { at: '#tpl-insert', do: 'Click a fill-in like <b>{student_first_name}</b> to add it where your cursor is.', why: 'WiSH puts the real name, class or date in its place.', tag: 'Fill-ins' },
      { at: '#pv-body', do: 'Check the preview.', why: 'This is how the email looks for one family.', tag: '👀 Preview' },
      { at: () => first('#rem-form .rem-save button'), click: true, do: 'Click <b>Save reminders</b>.' },
    ],
    pause: [
      { at: () => first('#rem-form input[name="pauseFrom"]').closest('.rem-card'), do: 'Under <b>Pause all emails</b>, pick the first and last day of the pause.', why: 'Nothing goes out between these dates. Major holidays are skipped by themselves.', tag: '✏️ Pick dates' },
      { at: () => first('#rem-form .rem-save button'), click: true, do: 'Click <b>Save reminders</b>.', why: 'Emails start again on their own after the last day.' },
    ],
    'my-emails': [
      { at: '#rem-form .rem-card.me .seg', do: 'Under <b>ES Notifications</b>, click <b>On</b>.', why: 'These are emails for you about how the LP is going.', tag: 'Your emails' },
      { at: () => first('#rem-form .rem-when'), do: 'Tick <b>Daily report</b>, <b>Weekly summary</b>, or <b>As things happen</b>, and pick the time.', why: '“As things happen” sends one email for each event you tick, like a new upload.', tag: 'When' },
      { at: () => first('#rem-form .rem-two'), do: 'Tick what goes in the report, and which events you want to hear about.', tag: 'What' },
      { at: () => first('#rem-form .rem-save button'), click: true, do: 'Click <b>Save reminders</b>.' },
    ],
    meetings: [
      { at: '#meet-all', tag: '✏️ Paste here', do: 'In Google Calendar, make a booking page (<b>Create</b>, then <b>Appointment schedule</b>). Paste its link here.', why: 'Families then see a <b>Book your LP meeting</b> button in WiSH.' },
      { at: () => first('#meet-form button[type="submit"]'), click: true, do: 'Click <b>Save</b>.', why: 'One booking page works all year. At the start of each LP, change its dates in Google Calendar.' },
      { at: '#meet-body', do: 'This list shows who booked and who didn’t.', why: 'WiSH reads your calendar. It never changes it.', tag: '👀 Bookings' },
      { at: '#meet-refresh', do: 'Click <b>↻ Check calendar now</b> to refresh the list.', click: true },
    ],
    'current-lp': [
      { at: '#current-lp', do: 'Under <b>Current LP</b>, pick the LP.', why: 'Students’ uploads go to this LP unless they choose another one.', tag: 'Pick' },
    ],
    colors: [
      { at: '#theme-picks', do: 'Under <b>Colors</b>, click the color theme you like.', why: 'It changes right away. It’s saved on this computer or tablet only.', tag: 'Pick a theme' },
      { at: '#mode-picks', do: 'Under <b>Light or dark</b>, pick the one you like.', why: 'Match my device follows your computer’s or tablet’s own setting.', tag: 'Light or dark' },
    ],
    holidays: [
      { at: '#holiday-add', click: true, do: 'Under <b>School holidays</b>, click <b>＋ Add a holiday</b>.', why: 'Federal holidays are already included. Add breaks and staff days.' },
      { at: '#holiday-list', tag: '✏️ Pick dates', do: 'Pick the first day, and the last day for a break. Leave To blank for one day.', why: 'Students can’t pick a holiday as the date they finished work, and reminders skip them.' },
      { at: '#dates-save', click: true, do: 'Click <b>Save dates</b>.' },
    ],
    password: [
      { at: '#password-form', tag: '✏️ Type here', do: 'Under <b>Change password</b>, type your current password, then the new one twice.', why: 'Use at least 8 characters. Forgot it? Sign out, then click <b>Forgot password?</b> on the sign-in page.' },
      { at: () => first('#password-form button[type="submit"]'), click: true, do: 'Click the button to save it.' },
    ],
  };

  // Which page each Help topic starts on: the button that opens it, or the dashboard.
  const SCREEN_OF = { 'open-roster': 'roster', 'open-link': 'link', 'open-reminders': 'reminders', 'open-meetings': 'meetings', 'open-dates': 'settings', 'open-trash': 'trash' };
  const START = { 'first-week': 'dash', dashboard: 'dash', review: 'dash', redo: 'dash', annotate: 'dash', export: 'dash', 'undo-export': 'dash', 'change-class': 'dash', 'set-aside': 'dash', 'upload-for': 'dash', delete: 'dash', tracker: 'dash', pe: 'dash' };

  // ---------- The panel ----------

  const panel = document.createElement('aside');
  panel.id = 'guide';
  panel.setAttribute('aria-label', 'Help guide');
  panel.hidden = true;
  document.body.appendChild(panel);
  const ring = document.createElement('div');
  ring.className = 'g-ring';
  ring.hidden = true;
  const tag = document.createElement('div');
  tag.className = 'g-tag';
  tag.hidden = true;
  document.body.append(ring, tag);

  let topic = null;     // the topic being guided, or null for the topic list
  let steps = [];
  let at = 0;           // the step being shown
  let target = null;    // the element ringed now
  let scrolledTo = null;
  let query = '';
  let timer = null;

  const head = (title) => `<header class="g-head"><b>${esc(title)}</b>
    <span><button type="button" class="g-min" data-g="min" aria-label="Make smaller">–</button>
    <button type="button" class="g-x" data-g="close" aria-label="Close help">✕</button></span></header>`;

  // The page the ES is on, and the Help topics about it. The panel opens on these.
  const PAGES = {
    viewer: ['A sample', ['review', 'redo', 'annotate', 'export', 'change-class', 'set-aside', 'undo-export', 'delete']],
    dash: ['The dashboard', ['dashboard', 'review', 'tracker', 'first-week']],
    student: ['A student’s page', ['upload-for', 'tracker', 'pe', 'review']],
    roster: ['Student Roster', ['roster', 'classes', 'start-leave']],
    link: ['Share link & QR', ['share']],
    reminders: ['Reminders', ['reminders', 'wording', 'pause', 'my-emails']],
    meetings: ['LP meetings', ['meetings']],
    settings: ['Settings', ['colors', 'current-lp', 'holidays', 'password']],
    trash: ['Trash', ['delete']],
    setup: ['Setup', ['first-week', 'roster', 'reminders', 'share', 'student-signin']],
  };
  function here() {
    if (inViewer()) return ['viewer', ...PAGES.viewer];
    const on = $$('.screen').find(sc => !sc.hidden);
    const key = on ? on.id.replace('screen-', '') : 'dash';
    return [key, ...(PAGES[key] || ['WiSH', ['first-week', 'dashboard']])];
  }
  const inSetup = () => !$('#screen-setup').hidden;
  let view = 'list';
  let listedFor = '';

  const topicBtn = (t) => `<li><button type="button" data-topic="${t.id}">
    <span><b>${esc(t.title)}</b><small>${esc(t.sum)}</small></span>${GUIDES[t.id] && !inSetup() ? '<em>Show me</em>' : '<em class="read">Read</em>'}</button></li>`;

  function renderList() {
    topic = null;
    view = 'list';
    const [key, name, ids] = here();
    listedFor = key;
    const q = query.trim().toLowerCase();
    const byId = (id) => help.all.find(t => t.id === id);
    let body;
    if (q) {
      // Topics whose title matches come first.
      const inTitle = (t) => q.split(/\s+/).every(w => t.title.toLowerCase().includes(w)) ? 0 : 1;
      const found = help.all.filter(t => help.matches(t, q)).sort((a, b) => inTitle(a) - inTitle(b));
      body = found.length ? `<h3 class="g-gh">${found.length} topic${found.length > 1 ? 's' : ''} found</h3>
        <ul class="g-topics">${found.map(topicBtn).join('')}</ul>`
        : '<p class="g-intro">No topics match. Try another word, like “redo”, “email” or “class”.</p>';
    } else {
      body = `<h3 class="g-gh">Help for this page: ${esc(name)}</h3>
        <ul class="g-topics">${ids.map(byId).filter(Boolean).map(topicBtn).join('')}</ul>
        <details class="g-all"><summary>See all topics</summary>
          ${help.GROUPS.map(g => `<h3 class="g-gh">${esc(g.title)}</h3><ul class="g-topics">${g.topics.map(topicBtn).join('')}</ul>`).join('')}
        </details>`;
    }
    panel.innerHTML = `${head('Help')}
      <div class="g-body">
        <input type="search" class="g-search" placeholder="What do you want to do? For example: redo" aria-label="Search help" value="${esc(query)}">
        <p class="g-intro">${inSetup() ? 'Pick a topic to read how it works.' : 'Pick a topic. I’ll open the page and show you where to click.'}</p>
        ${body}
      </div>`;
    clearRing();
  }

  function renderTopic() {
    view = 'topic';
    const t = topic;
    const s = steps[at];
    const last = at === steps.length - 1;
    const doneAll = at >= steps.length;
    panel.innerHTML = `${head('Help · ' + t.title)}
      <div class="g-body">
        <p class="g-of">${doneAll ? 'All done' : `Step ${at + 1} of ${steps.length}`}</p>
        <h2>${esc(t.title)}</h2>
        <ol class="g-steps">${steps.map((x, i) => `<li class="${i < at ? 'g-done' : i === at ? 'g-now' : ''}" ${i < at ? `data-step="${i}" title="Show this step again"` : ''}>
          ${i === at ? '<b class="g-do">Do this now</b>' : ''}${x.do}</li>`).join('')}</ol>
        ${doneAll ? '<p class="g-what g-ok"><b>✓ All done.</b> Pick another topic any time.</p>'
        : `${s.why ? `<div class="g-what"><b>What this does:</b> ${s.why}</div>` : ''}
           <p class="g-miss" hidden>${s.missing || 'I can’t see this on the page right now. Scroll a little, or click <b>I did it</b> to go on.'}</p>`}
        ${doneAll && t.notes && t.notes.length ? t.notes.map(n => `<p class="g-note">${n}</p>`).join('') : ''}
      </div>
      <footer class="g-foot">
        <button type="button" class="btn small" data-g="back">← ${at === 0 || doneAll ? 'Topics' : 'Back'}</button>
        ${doneAll ? '<button type="button" class="btn small primary" data-g="list">Pick another topic</button>'
        : `<button type="button" class="btn small primary" data-g="next">${last ? 'Finish ✓' : 'I did it →'}</button>`}
      </footer>`;
    // Keep the current step in view inside the panel (it’s short on phones).
    const body = panel.querySelector('.g-body');
    const now = panel.querySelector('.g-now');
    if (body && now) body.scrollTop = Math.max(0, now.offsetTop - body.offsetTop - 50);
    target = null;
    scrolledTo = null;
    tick();
  }

  // Reading topics (nothing to click): the written steps, and Take me there when there is a page.
  function renderRead(t) {
    topic = null;
    view = 'read';
    panel.innerHTML = `${head('Help · ' + t.title)}
      <div class="g-body">
        <h2>${esc(t.title)}</h2>
        <ol class="g-read">${t.steps.map(x => `<li>${x}</li>`).join('')}</ol>
        ${(t.notes || []).map(n => `<p class="g-note">${n}</p>`).join('')}
      </div>
      <footer class="g-foot">
        <button type="button" class="btn small" data-g="list">← Topics</button>
        ${t.go && !inSetup() ? `<button type="button" class="btn small primary" data-go="${t.go}">Take me there →</button>` : ''}
      </footer>`;
    clearRing();
  }

  // ---------- Moving between pages and steps ----------

  function goTo(t) {
    const where = START[t.id] || SCREEN_OF[t.go];
    if (!where) return;
    if (inViewer() && where !== 'dash') $('#v-close').click();
    if (where === 'dash') {
      if (!$('#screen-dash').hidden || inViewer()) return;
      $('#brand-home').click();
    } else if (!onScreen(where)) {
      $(`#${t.go}`).click();
    }
  }

  function start(id) {
    const t = help.all.find(x => x.id === id);
    if (!t) return;
    open();
    // During setup, guides would leave setup, so every topic is read-only there.
    if (!GUIDES[id] || inSetup()) { renderRead(t); return; }
    topic = t;
    steps = GUIDES[id];
    at = 0;
    goTo(t);
    // Give the page a moment to open, then skip what’s already done (an open sample, say).
    setTimeout(() => { skipDone(); renderTopic(); }, 250);
  }

  function skipDone() {
    while (at < steps.length - 1 && steps[at].skip && steps[at].skip()) at++;
  }

  function next() {
    if (!topic) return;
    at++;
    skipDone();
    renderTopic();
  }

  function back() {
    if (!topic || at === 0 || at >= steps.length) { query = ''; renderList(); return; }
    at--;
    while (at > 0 && steps[at].skip && steps[at].skip()) at--;
    if (steps[at].skip && steps[at].skip()) { query = ''; renderList(); return; }
    renderTopic();
  }

  // ---------- The gold ring ----------

  function find(s) {
    try { return typeof s.at === 'function' ? s.at() : first(s.at); } catch (e) { return null; }
  }

  // The part of an element that can be seen: inside every scrolling box around it, inside the
  // window, under the sticky top bar and left of the guide panel.
  function visibleRect(el) {
    const b = el.getBoundingClientRect();
    let l = b.left, t = b.top, rr = b.right, bb = b.bottom;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (!/(auto|scroll|hidden|clip)/.test(cs.overflowX + cs.overflowY)) continue;
      const c = p.getBoundingClientRect();
      l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); bb = Math.min(bb, c.bottom);
    }
    const bar = document.querySelector('.topbar');
    const barBottom = bar && inViewer() === false && getComputedStyle(bar).position !== 'static' && !bar.contains(el) ? bar.getBoundingClientRect().bottom : 0;
    const right = panel.hidden || panel.classList.contains('small') || innerWidth <= 760 ? innerWidth : panel.getBoundingClientRect().left;
    const bottom = !panel.hidden && innerWidth <= 760 ? panel.getBoundingClientRect().top : innerHeight;
    l = Math.max(l, 0); t = Math.max(t, barBottom, 0); rr = Math.min(rr, right); bb = Math.min(bb, bottom);
    return rr - l > 4 && bb - t > 4 ? { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t, ceiling: Math.max(barBottom, 0) + 4 } : null;
  }

  function clearRing() {
    ring.hidden = true;
    tag.hidden = true;
    target = null;
  }

  // Runs a few times a second while a guide is open: the page can change under it (a sample
  // opens, a list redraws, the page scrolls), so the ring follows its target.
  function tick() {
    if (!panel.hidden && view === 'list' && !query && here()[0] !== listedFor && !panel.contains(document.activeElement)) renderList();
    if (panel.hidden || !topic || at >= steps.length) { clearRing(); return; }
    const s = steps[at];
    // Some steps move on as soon as the page changes, e.g. once any sample is open.
    if (s.wait && at < steps.length - 1 && s.wait()) { next(); return; }
    const miss = panel.querySelector('.g-miss');
    if (!s.at) { clearRing(); if (miss) miss.hidden = true; return; }
    const el = find(s);
    if (!shown(el)) {
      clearRing();
      if (miss) miss.hidden = false;
      return;
    }
    if (miss) miss.hidden = true;
    target = el;
    const full = el.getBoundingClientRect();
    const r = visibleRect(el);
    if (scrolledTo !== el) {
      scrolledTo = el;
      if (!r || r.height < Math.min(full.height, innerHeight / 2) - 2) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
    if (!r) { ring.hidden = true; tag.hidden = true; return; }
    const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    ring.hidden = false;
    tag.textContent = s.tag || (s.click ? '👆 Click here' : '👀 Look here');
    tag.hidden = false;
    const tw = tag.offsetWidth, tht = tag.offsetHeight;
    const below = r.bottom + pad + 10;
    const floor = innerWidth <= 760 && !panel.hidden ? panel.getBoundingClientRect().top : innerHeight;
    const above = r.top - pad - 10 - tht;
    // Below the ring, else above it, else (a big area) just inside its top edge.
    const top = below + tht < floor - 8 ? below : above >= r.ceiling ? above : r.top + 10;
    const left = Math.min(Math.max(8, r.left), (panel.hidden ? innerWidth : panel.getBoundingClientRect().left) - tw - 8);
    Object.assign(tag.style, { left: `${Math.max(8, left)}px`, top: `${top}px` });
  }

  // Clicking the ringed thing moves to the next step once the page has reacted.
  document.addEventListener('click', (e) => {
    if (!topic || !target || at >= steps.length || !steps[at].click) return;
    if (panel.contains(e.target) || !target.contains(e.target)) return;
    const was = at;
    setTimeout(() => { if (topic && at === was) next(); }, 400);
  }, true);

  // ---------- Opening and closing ----------

  function open() {
    panel.hidden = false;
    panel.classList.remove('small');
    document.body.classList.add('has-guide');
    $('#open-help').setAttribute('aria-pressed', 'true');
    if (!timer) timer = setInterval(tick, 250);
  }

  function close() {
    panel.hidden = true;
    topic = null;
    clearRing();
    document.body.classList.remove('has-guide');
    $('#open-help').setAttribute('aria-pressed', 'false');
    clearInterval(timer);
    timer = null;
  }

  function toggle() {
    if (!panel.hidden) return close();
    open();
    query = '';
    renderList();
  }

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g], [data-topic], [data-step], [data-go]');
    if (!b) return;
    if (b.dataset.topic) return start(b.dataset.topic);
    if (b.dataset.step) { at = Number(b.dataset.step); renderTopic(); return; }
    if (b.dataset.go) { $(`#${b.dataset.go}`).click(); return; }
    const g = b.dataset.g;
    if (g === 'close') close();
    else if (g === 'min') { panel.classList.toggle('small'); b.textContent = panel.classList.contains('small') ? '+' : '–'; }
    else if (g === 'next') next();
    else if (g === 'back') back();
    else if (g === 'list') { query = ''; renderList(); }
  });
  panel.addEventListener('input', (e) => {
    if (!e.target.classList.contains('g-search')) return;
    query = e.target.value;
    const pos = e.target.selectionStart;
    renderList();
    const box = panel.querySelector('.g-search');
    box.focus();
    box.setSelectionRange(pos, pos);
  });
  addEventListener('resize', () => { scrolledTo = target; tick(); });
  addEventListener('scroll', () => { if (topic) tick(); }, true);
  // Signing out closes the guide.
  document.addEventListener('wish:screen', (e) => { if (e.detail === 'login') close(); });

  return { start, toggle, close, has: (id) => !!GUIDES[id] };
}
