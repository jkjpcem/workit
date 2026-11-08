// ES dashboard: the Help topics. The Help button opens them in the guide side panel
// (js/guide.js); this file also draws the whole Help page, with every topic, a list of all
// topics at the top, a search box, and "Show me" or "Take me there" buttons. admin.js wires it in.

function AdminHelp(ctx) {
  const { $, esc, show } = ctx;

  // Each topic: id, title, a one-line summary, numbered steps, optional notes, and the
  // dashboard button that opens the page it's about (go).
  const GROUPS = [
    { title: 'Getting started', topics: [
      { id: 'first-week', title: 'Your first week with WiSH',
        sum: 'What to do once setup is finished.',
        steps: [
          'Add your students on the <b>Student Roster</b> page, with their classes for Sem 1 and Sem 2.',
          'Send your student link to students and families (<b>Share link &amp; QR</b>), or print the flyer.',
          'Choose your reminder emails on the <b>Reminders</b> page.',
          'As work comes in, open the dashboard each day, review new samples, and approve or send them back.',
          'Annotate one sample per class per LP and click <b>Export as Annotated</b>. WiSH files it in your Google Drive.',
        ] },
      { id: 'share', title: 'Share your student link and QR code', go: 'open-link',
        sum: 'The one link your students use.',
        steps: [
          'Click <b>Share link &amp; QR</b> at the top.',
          'Click <b>Copy link</b> to paste it into an email or text, <b>Download QR code</b> for slides, or <b>Print a flyer</b> to send home.',
          'Students open the link on their phone and sign in. On a phone they can add WiSH to the home screen.',
        ],
        notes: ['Use only your own link. A link or flyer from another ES sends students to that ES’s WiSH, where they won’t find their account.'] },
      { id: 'phone', title: 'Use WiSH on a phone or iPad',
        sum: 'The dashboard works on phones and tablets too.',
        steps: [
          'Open the dashboard link on your phone or tablet and sign in.',
          'To write on a sample with an Apple Pencil or S Pen, open the sample, click <b>✏️ Annotations</b>, then <b>✏️ Pen</b>.',
        ],
        notes: ['First-time setup needs a computer, because Google’s setup pages don’t work on phones.'] },
    ] },
    { title: 'Students and classes', topics: [
      { id: 'roster', title: 'Add or change students', go: 'open-roster',
        sum: 'Names, grade, city, emails and classes.',
        steps: [
          'Click <b>Student Roster</b> at the top.',
          'Type in the empty rows, or click <b>＋ Add 5 rows</b> for more. You can also paste rows from Excel or Google Sheets in this order: first name, last name, grade, city, Sem 1 classes, Sem 2 classes, student email, parent emails.',
          'Check the grade and city: students sign in with the first 2 letters of their first name, their grade, and the first 2 letters of their city.',
          'Put several parent emails in one box, separated by commas.',
          'Click <b>Save students</b>. Nothing changes until you do.',
        ],
        notes: ['To remove a student completely, clear their row and click Save students. To keep their work, set Status to Inactive instead.'] },
      { id: 'classes', title: 'Add classes, Accel classes and Sem 2', go: 'open-roster',
        sum: 'What each student needs to turn in.',
        steps: [
          'On the <b>Student Roster</b> page, scroll down to <b>Student Classes</b>.',
          'Type a class under Sem 1 and press Enter. Use the exact Course Catalog name.',
          'WiSH copies a Sem 1 class that ends in A to Sem 2 with a B. Change it there if Sem 2 is different.',
          'For an accelerated class, type <b>(Accel)</b> after the name, or click the class to switch Accel on or off. Accel classes need 2 samples per LP.',
          'Click <b>Save students</b>.',
        ],
        notes: ['Sem 1 is LP1 to LP4 and Sem 2 is LP5 to LP8. WiSH switches by itself.', 'A student with no classes shows a red “No classes yet” note on the dashboard.'] },
      { id: 'start-leave', title: 'A student who starts mid-year or leaves', go: 'open-roster',
        sum: 'Started and Withdrew dates.',
        steps: [
          'Open the <b>Student Roster</b>.',
          'For a new student, type the date they started under <b>Started</b>. LPs that ended before that date need no samples.',
          'For a student who left, set <b>Status</b> to Inactive and type the date under <b>Withdrew</b>. They still owe samples for every LP that started on or before that date, and none after.',
          'Click <b>Save students</b>.',
        ],
        notes: ['Inactive students get no reminders, but they can still sign in and see their work.'] },
    ] },
    { title: 'Reviewing work', topics: [
      { id: 'dashboard', title: 'Read the dashboard',
        sum: 'Tiles, colors and the student cards.',
        steps: [
          'Pick the LP at the top next to <b>Showing</b>. It opens on the current LP.',
          'The tiles show how many students have uploaded, how many samples are annotated, and how many were filed as Extra.',
          'Students who still owe work are at the top. Below them are <b>Turned in</b> and <b>Reviewed and Exported</b>.',
          'Each class on a card has a color. The color key under the tiles says what each one means: to review, redo, replaced or set aside, approved, and filed.',
          'Click a student’s name to open their page, or a class to open that sample.',
        ] },
      { id: 'review', title: 'Review a sample',
        sum: 'Open it, check it, approve it.',
        steps: [
          'On the dashboard, click a class that is light yellow (to review).',
          'Look through the pages. Use the ‹ and › arrows to move to the next sample.',
          'Check the details on the right: class, date completed, grade or score, and minutes.',
          'If it’s good, click <b>✓ Approve</b>.',
          'Then annotate it and export it, or click <b>✕ Close</b> and come back later.',
        ] },
      { id: 'redo', title: 'Send a sample back for a redo',
        sum: 'The student gets the reasons and turns it in again.',
        steps: [
          'Open the sample and click <b>↺ Redo</b>.',
          'Pick every reason that applies, and type your own note if you like.',
          'Click <b>↩ Send back to student</b>. Nothing goes to the student until you do.',
          'The student sees the reasons the next time they sign in, and taps <b>↺ Resubmit</b> to turn it in again.',
          'The new upload sits on top of the old one. The old one becomes a reference that no longer counts.',
        ],
        notes: ['To take a redo back, open the sample and click Redo again.'] },
      { id: 'annotate', title: 'Annotate a sample',
        sum: 'Text boxes and pen on the pages.',
        steps: [
          'Open the sample and click <b>✏️ Annotations</b>.',
          'Click <b>＋ Text box</b>, then click on the page where it goes. Type your note. Drag it to move it, and change the font, size and color.',
          'Or click <b>✏️ Pen</b> to write by hand. <b>↶ Undo</b> takes back the last mark.',
          'WiSH saves as you go.',
        ],
        notes: ['If a family annotated the sample, you’ll see an orange “Family” tag on their notes.'] },
      { id: 'export', title: 'Export as Annotated or as Extra',
        sum: 'Save the final copy to your Google Drive.',
        steps: [
          'Approve the sample first (<b>✓ Approve</b>).',
          'Click <b>🏁 Export as Annotated</b> to save a copy with your annotations to <b>Approved › LP# Annotated</b>.',
          'Or click <b>📁 Export as Extra</b> to save it as is to <b>Approved › LP# Extra</b>.',
          'The class turns navy (filed) on the dashboard.',
        ],
        notes: ['Each class needs 1 annotated sample per LP (2 for Accel classes). The card says, for example, “1 of 2 annotated”.'] },
      { id: 'undo-export', title: 'Undo an export',
        sum: 'Take back a copy you exported by mistake.',
        steps: [
          'Open the sample.',
          'Click <b>↶ Undo export</b>.',
          'The exported copy goes to WiSH’s Trash, and the sample stays approved, ready to export again.',
        ] },
      { id: 'change-class', title: 'Fix the class on a sample',
        sum: 'When a student picked the wrong class.',
        steps: [
          'Open the sample and click <b>Change class</b> next to the class name.',
          'Pick the right class. WiSH renames the files in your Drive.',
          'If it was already exported as Annotated, click <b>🏁 Update annotated copy</b> so the header shows the new class.',
        ] },
      { id: 'set-aside', title: 'Set a sample aside as a reference',
        sum: 'Keep it, but don’t count it.',
        steps: [
          'Open a sample that was sent back for a redo.',
          'Click <b>📌 Set aside as a reference</b>.',
          'It stays viewable (gray dashed) but doesn’t count and leaves your To review list.',
        ] },
      { id: 'upload-for', title: 'Upload a sample for a student',
        sum: 'When you have the work and the student doesn’t.',
        steps: [
          'Click the student’s name to open their page.',
          'Click <b>＋ Upload for</b> and their first name.',
          'Pick the class, add the pages, fill in the details, and submit.',
        ],
        notes: ['It shows an “Added by your ES” badge, and the date and page checks are skipped.'] },
      { id: 'delete', title: 'Delete a sample, or get one back', go: 'open-trash',
        sum: 'Deleted samples stay in Trash for 60 days.',
        steps: [
          'To delete, open the sample and click <b>🗑 Delete</b>.',
          'To get one back, click your name at the top right, then <b>Trash</b>.',
          'Find the sample and click <b>Restore</b>. It goes back where it was.',
        ],
        notes: ['Students can delete their own uploads until you approve them, and restore them from their own Trash.'] },
    ] },
    { title: 'Requirements', topics: [
      { id: 'how-many', title: 'How many samples each student needs',
        sum: 'Per class, per LP.',
        steps: [
          'Each class needs 1 sample per LP.',
          'An accelerated class (marked Accel) needs 2 samples per LP.',
          'A PE or Physical Education class needs no sample. The family fills in the school’s PE form instead.',
          'Econ and US Government are one-semester classes.',
        ] },
      { id: 'tracker', title: 'The Annotation Tracker (4 core subjects)',
        sum: 'One annotated sample in each core per reporting period.',
        steps: [
          'Each student needs at least 1 annotated sample in each core: English, Math, Social Studies or History (Government and Econ count), and Science.',
          'This counts per reporting period: RP1 is LP1 to LP3, RP2 is LP4 to LP6, and RP3 is LP7 and LP8.',
          'The tracker on the right of the dashboard and on each student page shows the 4 boxes. Navy means done.',
          'If a core is missing, an annotated elective fills it.',
          'To count a core by hand, open the student’s page and click <b>Mark done</b> next to it, with a note.',
        ] },
      { id: 'pe', title: 'PE forms',
        sum: 'Marked done from the Jotform emails.',
        steps: [
          'Families fill in the school’s PE log (a Jotform). WiSH shows them the link.',
          'When the Jotform email arrives in your school Gmail, WiSH marks PE done for that student by itself.',
          'To mark it yourself, open the student’s page and click <b>Mark done</b> next to PE.',
        ],
        notes: ['WiSH checks your email once a day, and every 30 minutes in the last 7 days of an LP.'] },
    ] },
    { title: 'Families and reminders', topics: [
      { id: 'reminders', title: 'Set up reminder emails', go: 'open-reminders',
        sum: 'Who gets emailed, and how often.',
        steps: [
          'Click <b>Reminders</b> at the top.',
          'Under <b>Families</b>, pick <b>Off</b>, <b>Test</b> (every email comes to you instead, so you can check them), or <b>On</b>.',
          'Choose who gets them (parents, students) and what about (<b>Still to do</b>, <b>All done</b>).',
          'Set the <b>Still-to-do schedule</b> for each part of the LP, plus the day and time.',
          'Click <b>Save reminders</b>.',
        ],
        notes: ['Emails come from your own school email. Only families with something still to do get a reminder, and never on weekends or holidays unless you allow it.'] },
      { id: 'wording', title: 'Change the wording of an email', go: 'open-reminders',
        sum: 'Your own words, with fill-ins.',
        steps: [
          'On the <b>Reminders</b> page, go to <b>Email wording</b>.',
          'Pick the email to change.',
          'Edit the subject and message. Click a fill-in like <b>{student_first_name}</b> to add it where your cursor is.',
          'Check the <b>Preview</b>, then click <b>Save reminders</b>.',
        ] },
      { id: 'pause', title: 'Pause all emails', go: 'open-reminders',
        sum: 'For a break or a holiday week.',
        steps: [
          'On the <b>Reminders</b> page, go to <b>Pause all emails</b>.',
          'Pick the first and last day of the pause.',
          'Click <b>Save reminders</b>. Emails start again on their own after the last day.',
        ] },
      { id: 'my-emails', title: 'Emails for you (reports)', go: 'open-reminders',
        sum: 'A daily report, a weekly summary, or alerts.',
        steps: [
          'On the <b>Reminders</b> page, go to <b>ES Notifications</b>.',
          'Turn on the <b>Daily report</b> or <b>Weekly summary</b>, and pick the time.',
          'For <b>As things happen</b>, tick the events you want an email for, such as a new upload or a resubmitted redo.',
          'Click <b>Save reminders</b>.',
        ] },
      { id: 'meetings', title: 'LP meetings and your booking page', go: 'open-meetings',
        sum: 'Families book from WiSH.',
        steps: [
          'In Google Calendar, make a booking page: <b>Create</b>, then <b>Appointment schedule</b>.',
          'In WiSH, click <b>Meetings</b>, paste the booking page link under <b>Booking pages</b>, and click <b>Save</b>.',
          'Families now see a <b>Book your LP meeting</b> button in WiSH.',
          'The Meetings page lists who booked and who didn’t. Click <b>↻ Check calendar now</b> to refresh.',
        ],
        notes: ['One booking page works all year. At the start of each LP, change its available dates in Google Calendar.'] },
    ] },
    { title: 'Settings and your Drive', topics: [
      { id: 'current-lp', title: 'Change the current LP', go: 'open-dates',
        sum: 'Where new uploads go.',
        steps: [
          'Click your name at the top right, then <b>Settings</b>.',
          'Under <b>Current LP</b>, pick the LP.',
        ],
        notes: ['LP dates are the school’s, the same for every ES, and fill in by themselves. Students can only pick a completion date that is a school day inside the LP.'] },
      { id: 'holidays', title: 'Add a school holiday', go: 'open-dates',
        sum: 'Days off that aren’t federal holidays.',
        steps: [
          'Click your name at the top right, then <b>Settings</b>.',
          'Under <b>School holidays</b>, click <b>＋ Add a holiday</b>.',
          'Pick the first day, and the last day for a break (leave To blank for one day).',
          'Click <b>Save dates</b>.',
        ] },
      { id: 'drive', title: 'Where everything is saved in your Google Drive',
        sum: 'Your WiSH Homework folder.',
        steps: [
          'Open Google Drive in your school account and find the <b>WiSH Homework</b> folder.',
          '<b>Uploads › LP#</b> holds what students turned in.',
          '<b>Approved › LP# Annotated</b> and <b>LP# Extra</b> hold what you exported.',
          'Files are named Lastname_Firstname_LP#_Class.',
          'Your student list and the list of samples are in the <b>WiSH Admin</b> sheet.',
        ],
        notes: ['Don’t rename or move these folders, or WiSH can’t find them.'] },
      { id: 'password', title: 'Change your password, or reset a forgotten one', go: 'open-dates',
        sum: 'For signing in to this dashboard.',
        steps: [
          'To change it: click your name at the top right, then <b>Settings</b>, and use <b>Change password</b>.',
          'Forgot it? On the sign-in page, click <b>Forgot password?</b>. WiSH emails you a temporary password that works for 24 hours.',
          'Sign in with it, and choose a new password.',
        ] },
    ] },
    { title: 'For students and families', topics: [
      { id: 'student-signin', title: 'How students sign in',
        sum: 'No password to remember.',
        steps: [
          'Students open your student link on their phone or computer.',
          'They type the first 2 letters of their first name, pick their grade, and type the first 2 letters of their city.',
          'Capital letters don’t matter.',
        ],
        notes: ['If a student can’t sign in, check their first name, grade and city on the Student Roster.'] },
      { id: 'student-upload', title: 'How students turn in work',
        sum: 'Pick the class, add pages, add details.',
        steps: [
          'Tap <b>Turn in</b> and pick the class.',
          'Add the pages: take photos, choose photos or a file, or paste a Google Docs or Slides link. Up to 20 pages make one PDF.',
          'Type the minutes spent, the date completed (a school day in the LP), and the grade or score. Comments are optional.',
          'Tick the 3 check boxes and tap <b>Submit</b>.',
          'Everything they turned in is under <b>My uploads</b>, with a Missing samples box on top.',
        ] },
      { id: 'family-annotate', title: 'Family notes on a sample',
        sum: 'Families can add their own annotations.',
        steps: [
          'In My uploads, a student or family member taps a sample, then <b>✏️ Annotate</b>.',
          'They add notes the same way you do. They can change them until you approve the sample.',
          'You see their notes with an orange “Family” tag.',
        ] },
    ] },
  ];

  const all = GROUPS.flatMap(g => g.topics.map(t => ({ ...t, group: g.title })));
  const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const matches = (t, q) => !q || q.split(/\s+/).every(w => words(t).includes(w));
  const words = (t) => plain([t.title, t.sum, ...t.steps, ...(t.notes || [])].join(' ')).toLowerCase();

  function topicHtml(t) {
    return `<details class="card help-topic" id="help-${t.id}" data-id="${t.id}">
      <summary><span class="help-t">${esc(t.title)}</span><span class="help-sum">${esc(t.sum)}</span></summary>
      <ol class="how">${t.steps.map(s => `<li>${s}</li>`).join('')}</ol>
      ${(t.notes || []).map(n => `<p class="note">${n}</p>`).join('')}
      ${ctx.canGuide(t.id) ? `<p><button class="btn primary" type="button" data-guide="${t.id}">Show me where to click →</button></p>`
        : t.go ? `<p><button class="btn" type="button" data-go="${t.go}">Take me there →</button></p>` : ''}
    </details>`;
  }

  function render(query) {
    const q = String(query || '').trim().toLowerCase();
    const groups = GROUPS.map(g => ({ ...g, topics: g.topics.filter(t => matches(t, q)) })).filter(g => g.topics.length);
    $('#help-index').innerHTML = groups.length ? groups.map(g => `<div class="help-group">
        <h3>${esc(g.title)}</h3>
        <ul>${g.topics.map(t => `<li><a href="#help-${t.id}" data-open="${t.id}">${esc(t.title)}</a></li>`).join('')}</ul>
      </div>`).join('') : '<p class="hint">No topics match. Try another word, or clear the search.</p>';
    $('#help-topics').innerHTML = groups.map(g => `<h2 class="help-gh">${esc(g.title)}</h2>${g.topics.map(topicHtml).join('')}`).join('');
    if (q && groups.length === 1 && groups[0].topics.length === 1) $(`#help-${groups[0].topics[0].id}`).open = true;
  }

  function open(id) {
    const el = $(`#help-${id}`);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#help-index').addEventListener('click', (e) => {
    const a = e.target.closest('[data-open]');
    if (!a) return;
    e.preventDefault();
    open(a.dataset.open);
  });
  $('#help-topics').addEventListener('click', (e) => {
    const g = e.target.closest('[data-guide]');
    if (g) { show(from); ctx.guide(g.dataset.guide); return; }
    const b = e.target.closest('[data-go]');
    if (b) $(`#${b.dataset.go}`).click();
  });
  $('#help-search').addEventListener('input', (e) => render(e.target.value));
  // The whole Help page, with every topic. Its back button returns to the page it opened from.
  let from = 'dash';
  function openPage() {
    const on = [...document.querySelectorAll('.screen')].find(sc => !sc.hidden);
    from = on && on.id !== 'screen-help' ? on.id.replace('screen-', '') : 'dash';
    $('#help-search').value = '';
    render('');
    show('help');
    window.scrollTo(0, 0);
  }
  $('#help-back').addEventListener('click', () => show(from));

  return { GROUPS, all, matches, open, openPage, count: all.length };
}
