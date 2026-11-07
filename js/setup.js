// ES dashboard extras: the step-by-step setup a new ES sees at first sign-in, the student
// link and QR code, and the ES accounts page (main account only). admin.js wires it in.

function AdminSetup(ctx) {
  const { $, $$, esc, toast, busy, show, call, mainCall } = ctx;
  const STEPS = [
    { title: 'Choose your password' },
    { title: 'Make your own copy' },
    { title: 'Set up your copy' },
    { title: 'Turn it on for students' },
    { title: 'Add your students' },
    { title: 'Choose your reminders' },
    { title: 'Share with students' },
  ];
  const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const adminUrl = () => new URL('admin.html', location.href).href;
  const studentLink = (user) => Api.studentLink(user);

  let at = 1;  // step on screen

  // Steps finished so far. The password step counts as done once it's changed.
  const done = () => {
    const c = ctx.creds();
    return Math.max(c.step || 0, c.mustChange ? 0 : 1);
  };

  function open(step) {
    const c = ctx.creds();
    at = c.mustChange ? 1 : Math.min(step || done() + 1, STEPS.length);
    render();
    show('setup');
  }

  async function saveStep(n) {
    const c = ctx.creds();
    if ((c.step || 0) >= n) return;
    await mainCall('esSaveSetup', { esUser: c.user, esKey: c.key, step: n });
    ctx.setCreds({ step: n });
  }

  async function next() {
    busy('Saving…');
    try {
      await saveStep(at);
      if (at >= STEPS.length) return finish();
      at++;
      render();
      window.scrollTo(0, 0);
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  }

  async function finish() {
    try {
      await ctx.openDash();
      toast('You’re all set. This is your dashboard.');
    } catch (err) {
      toast(err.message);
    }
  }

  function render() {
    const c = ctx.creds();
    const d = done();
    $('#setup-title').textContent = c.mustChange && d >= STEPS.length ? 'Choose a new password' : `Welcome${c.name ? ', ' + c.name : ''}`;
    $('#setup-later').hidden = !(c.url && d >= STEPS.length && !c.mustChange);
    $('#setup-steps').innerHTML = STEPS.map((s, i) => {
      const n = i + 1;
      const state = n === at ? 'is-current' : n <= d ? 'is-done' : 'is-todo';
      const canGo = !c.mustChange && n <= d + 1;
      return `<li class="${state}"><button type="button" data-step="${n}" ${canGo ? '' : 'disabled'}>
        <span class="num">${n <= d && n !== at ? '✓' : n}</span><span>${esc(s.title)}</span></button></li>`;
    }).join('');
    const panel = $('#setup-panel');
    panel.innerHTML = `<p class="step-of">Step ${at} of ${STEPS.length}</p><h2>${esc(STEPS[at - 1].title)}</h2>` + PANELS[at]();
    (BIND[at] || (() => {}))(panel);
    $$('[data-copy-page]', panel).forEach(b => b.addEventListener('click', () => copy(adminUrl(), 'Link copied. Paste it into the address bar of the private window.')));
  }
  $('#setup-steps').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-step]');
    if (!b || b.disabled) return;
    at = Number(b.dataset.step);
    render();
  });
  $('#setup-signout').addEventListener('click', ctx.signOut);
  $('#setup-later').addEventListener('click', finish);
  $('#open-setup').addEventListener('click', () => open(1));

  const nextBtn = (label = 'Next') => `<div class="step-actions"><button class="btn primary big" type="button" data-next>${esc(label)} →</button></div>`;
  const bindNext = (panel) => { const b = panel.querySelector('[data-next]'); if (b) b.addEventListener('click', next); };

  // ---------- Helpers for the Google steps ----------

  // Google's Apps Script pages don't work on phones and tablets (iPads report as a Mac).
  const onPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const READY_KEY = 'wish.setupReady';
  const readyAnswer = () => { try { return localStorage.getItem(READY_KEY) || ''; } catch { return ''; } };
  function browser() {
    const u = navigator.userAgent;
    if (/Edg\//.test(u)) return 'edge';
    if (/Firefox\//.test(u)) return 'firefox';
    if (/Chrome\//.test(u)) return 'chrome';
    if (/Safari\//.test(u)) return 'safari';
    return 'other';
  }
  // Being signed in to several Google accounts is the most common way setup goes wrong.
  // A private window has none, so the ES signs in to the school account only.
  function privateHelp() {
    const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
    const keys = (k) => `<kbd>${mod}</kbd> + <kbd>Shift</kbd> + <kbd>${k}</kbd>`;
    const how = {
      chrome: `click <b>⋮</b> at the top right, then <b>New Incognito window</b>, or press ${keys('N')}`,
      edge: `click <b>…</b> at the top right, then <b>New InPrivate window</b>, or press ${keys('N')}`,
      safari: `click <b>File</b>, then <b>New Private Window</b>, or press ${keys('N')}`,
      firefox: `click <b>☰</b> at the top right, then <b>New private window</b>, or press ${keys('P')}`,
      other: 'open a private (incognito) window from your browser’s menu',
    }[browser()];
    return `<div class="private-help">
      <p><b>Do setup in a private window, so only your school account is signed in.</b></p>
      <ol class="how">
        <li>To open one, ${how}.</li>
        <li>In the private window, go to <b>${esc(adminUrl())}</b> <button class="btn" type="button" data-copy-page>Copy</button> and sign in to WiSH again. You come right back to this step.</li>
        <li>When Google asks you to sign in, use only your school account, and do every step in that window.</li>
      </ol></div>`;
  }

  // What each Google permission is for, in the order Google tends to list them.
  const SCOPES = [
    ['Google Drive', 'to save your students’ work samples in your WiSH Homework folder'],
    ['Google Sheets', 'to keep your student list and the list of samples in your WiSH Admin sheet'],
    ['Send email as you', 'for reminders to families and your own summary emails'],
    ['Read your email (read only)', 'only to find PE log emails from Jotform, so WiSH can mark PE done'],
    ['See your calendar (read only)', 'only to see which families booked their LP meeting'],
    ['Run when you’re not there', 'so reminders go out on schedule'],
    ['Show boxes in your sheet, connect to outside services, see your email address', 'for the WiSH menu, the website, and knowing which account is yours'],
  ];

  // Small drawings of Google's screens with the thing to click outlined. They look like
  // Google's pages, not exactly the same, so each says so.
  function gmock(kind) {
    const hit = (t) => `<span class="g-hit">${t}</span>`;
    const no = (t) => `<span class="g-no">${t}</span>`;
    const body = {
      copy: `<div class="g-title">Copy document</div><p>Would you like to make a copy of <b>WiSH template</b>?</p>
        <p class="g-small">The attached Apps Script file will also be copied.</p><div class="g-btns">${hit('<span class="g-btn blue">Make a copy</span>')}</div>`,
      auth: `<div class="g-title">Authorization required</div><p>A script attached to this document needs your permission to run.</p>
        <div class="g-btns"><span class="g-btn">Cancel</span>${hit('<span class="g-btn blue">OK</span>')}</div>`,
      unverified: `<div class="g-title">Google hasn’t verified this app</div><p class="g-small">The app is requesting access to sensitive info in your Google Account…</p>
        <div class="g-split"><div>${hit('<span class="g-link">Advanced</span>')}<p class="g-small">…then at the bottom:</p>${hit('<span class="g-link">Go to WiSH (unsafe)</span>')}</div>
        <div>${no('<span class="g-btn blue">BACK TO SAFETY</span>')}</div></div>`,
      allow: `<div class="g-title">WiSH wants access to your Google Account</div>
        <p>${hit('<span class="g-check">☑ Select all</span>')}</p><p class="g-small">☑ See, edit, create, and delete your Google Drive files<br>☑ See, edit, create, and delete your spreadsheets<br>☑ …</p>
        <div class="g-btns"><span class="g-btn">Cancel</span>${hit('<span class="g-btn blue">Continue</span>')}</div>`,
      deploy: `<div class="g-bar"><span>Apps Script</span>${hit('<span class="g-btn blue">Deploy ▾</span>')}</div>
        <div class="g-menu">${hit('<span>New deployment</span>')}<span>Manage deployments</span>${no('<span>Test deployments</span>')}</div>`,
      webapp: `<div class="g-title">New deployment</div>
        <div class="g-row"><span>Select type</span>${hit('<span>⚙ Web app</span>')}</div>
        <div class="g-row"><span>Execute as</span><span class="g-field">Me (you@suncoastcharter.org)</span></div>
        <div class="g-row"><span>Who has access</span>${hit('<span class="g-field">Anyone</span>')}</div>
        <div class="g-btns"><span class="g-btn">Cancel</span>${hit('<span class="g-btn blue">Deploy</span>')}</div>`,
      done: `<div class="g-title">New deployment</div><p class="g-small">Deployment successfully updated.</p>
        <div class="g-row"><span>Web app</span>${hit('<span class="g-link">https://script.google.com/macros/s/…/exec</span>')}</div>`,
    }[kind];
    return `<figure class="gmock"><div class="g-win">${body}</div>
      <figcaption>Google’s screen looks something like this. Click what’s outlined${/g-no/.test(body) ? ', not what’s crossed out' : ''}.</figcaption></figure>`;
  }

  // The last thing that went wrong, for the Stuck button's message.
  let lastError = '';
  let lastUrl = '';

  const PANELS = {
    1: () => `
      <p>Your account was made with a temporary password. Choose your own now. Use at least 8 characters.</p>
      <form class="stack narrow-form" id="pw-form">
        <label>New password <input type="password" name="p1" required minlength="8" autocomplete="new-password"></label>
        <label>Type it again <input type="password" name="p2" required minlength="8" autocomplete="new-password"></label>
        <button class="btn primary big" type="submit">Save my password</button>
      </form>`,

    2: () => {
      const url = (window.WORKIT_CONFIG || {}).TEMPLATE_COPY_URL;
      if (onPhone()) {
        return `
      <div class="note bad"><b>Please switch to a computer for the next steps.</b> Google’s setup pages don’t work on phones or tablets. It takes about 10 minutes.</div>
      <ol class="how">
        <li>On a computer, open this page: <b>${esc(adminUrl())}</b></li>
        <li>Sign in with the same username and your new password. WiSH brings you right back to this step.</li>
      </ol>
      <p><button class="btn" type="button" data-copy-page>Copy the link</button></p>`;
      }
      const ready = readyAnswer();
      return `
      <p>WiSH keeps your students and their work in <b>your own Google Drive</b>. Nobody else, including the person who made your account, can see them. First, make your own copy of the WiSH sheet.</p>
      <div class="ask-box">
        <p class="ask-q">Before you start: in this browser, are you signed in to more than one Google account?</p>
        <p class="hint">For example, a personal Gmail and your school account. Google often mixes them up during setup.</p>
        <div class="choice-row">
          <button type="button" class="choice ${ready === 'one' ? 'is-picked' : ''}" data-ready="one">Just one: my school account</button>
          <button type="button" class="choice ${ready === 'more' ? 'is-picked' : ''}" data-ready="more">More than one, or not sure</button>
        </div>
        ${ready === 'more' ? privateHelp() : ''}
      </div>
      ${ready ? `
      <ol class="how">
        <li>Click <b>Make my copy</b> below. A Google page opens in a new tab.</li>
        <li>If Google asks you to sign in, use your <b>school Google account</b> (the one ending in suncoastcharter.org).</li>
        <li>Click the blue <b>Make a copy</b> button. Google may say an Apps Script file is copied too: that file is WiSH.
          ${gmock('copy')}</li>
        <li>Your copy opens. Keep that tab open and come back to this tab.</li>
      </ol>
      ${url ? `<p><a class="btn big" href="${esc(url)}" target="_blank" rel="noopener">Make my copy ↗</a></p>`
        : '<p class="note bad">The copy link isn’t ready yet. Click <b>Stuck? Get help</b> at the top.</p>'}
      ${nextBtn('I made my copy')}` : ''}`;
    },

    3: () => `
      <p>Now your copy sets up your folders. Google asks you to approve this once. The screens look a little scary, but this is normal for a copy you own.</p>
      <ol class="how">
        <li>Go to the tab with your copy. Wait until <b>WiSH</b> shows up in the menu bar, to the right of <b>Help</b>. It can take up to 20 seconds. If it doesn’t show up, reload the page.</li>
        <li>Click <b>WiSH</b>, then <b>Set up WiSH</b>.</li>
        <li>A box says <i>Authorization required</i>. Click <b>OK</b>.
          ${gmock('auth')}</li>
        <li>Choose your <b>school</b> Google account.</li>
        <li>Google says <i>Google hasn’t verified this app</i>. Click <b>Advanced</b> at the bottom left, then <b>Go to WiSH (unsafe)</b>. Don’t click <i>Back to safety</i>.
          ${gmock('unverified')}</li>
        <li>Google lists what WiSH may do. Tick <b>Select all</b>, then click <b>Continue</b>. If you skip one, part of WiSH won’t work.
          ${gmock('allow')}
          <details class="why"><summary>Why WiSH needs each one</summary><ul>${SCOPES.map(s => `<li><b>${esc(s[0])}</b>: ${esc(s[1])}</li>`).join('')}</ul>
          <p class="hint">Everything stays in your own Google account. WiSH never deletes your email or changes your calendar.</p></details></li>
        <li>A small <i>Running script</i> bar shows for about 30 seconds. If nothing happens after a minute, click <b>WiSH</b>, then <b>Set up WiSH</b> once more. That’s safe.</li>
        <li>A box says <b>Your folders are ready. One last step</b>. Leave it open and click the button below.</li>
      </ol>
      <details class="by-hand">
        <summary>Google says “Sorry, unable to open the file” or shows the wrong account</summary>
        <p>This happens when the browser is signed in to more than one Google account.</p>
        ${privateHelp()}
      </details>
      ${nextBtn('I see “One last step”')}`,

    4: () => {
      const c = ctx.creds();
      return `
      <p>The last Google step turns your copy on, so your students’ phones can send work to it. Google only lets you do this yourself. It’s 5 clicks.</p>
      <ol class="how">
        <li>In the box in your copy, click <b>Open the Deploy page</b>. If a box says <i>You’re signed in as…</i>, click <b>OK</b>.</li>
        <li>At the top right, click the blue <b>Deploy</b> button, then <b>New deployment</b>. Not <i>Test deployments</i>.
          ${gmock('deploy')}</li>
        <li>Next to <i>Select type</i>, click the gear ⚙ and choose <b>Web app</b>.</li>
        <li>Leave <i>Execute as</i> on <b>Me</b>. Change <i>Who has access</i> to <b>Anyone</b>. It must be just <b>Anyone</b>, because students don’t sign in to Google. Click <b>Deploy</b>.
          ${gmock('webapp')}
          If Google asks you to <i>Authorize access</i>, allow it the same way as before.</li>
        <li>Under <i>Web app</i>, click the link that ends in <b>/exec</b>. A page says <b>WiSH is on ✓</b>. Click <b>Finish in WiSH</b>, and WiSH checks everything and moves you to the next step.
          ${gmock('done')}</li>
      </ol>
      <div class="note">If <b>Anyone</b> isn’t in the list, Google doesn’t let this account turn WiSH on. Click <b>Stuck? Get help</b> at the top.</div>
      <div id="connect-box">${c.url ? '<p class="connect-state">✓ Your copy is connected and students can reach it.</p>' : '<p class="connect-state waiting">Waiting for you to click Finish in WiSH…</p>'}</div>
      ${c.url ? nextBtn() : ''}
      <details class="by-hand">
        <summary>The WiSH page didn’t open? Paste the link instead</summary>
        <p class="hint">In the Deploy box, under <i>Web app</i>, click <b>Copy</b>. Paste it here and click <b>Connect</b>.</p>
        <form class="connect-row" id="connect-form">
          <input name="url" required placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || lastUrl || '')}" spellcheck="false" autocomplete="off" aria-label="Web app link">
          <button class="btn primary" type="submit">Connect</button>
        </form>
      </details>`;
    },

    5: () => {
      const d = ctx.data();
      const n = d ? d.students.length : 0;
      return `
      <p>Add the students who will turn in work samples to you. You can paste them straight from Excel or Google Sheets: first name, last name, grade, city, Sem 1 classes, Sem 2 classes.</p>
      <p>Students sign in with the first 2 letters of their first name, their grade, and the first 2 letters of their city, so check those are right.</p>
      <p><button class="btn big" type="button" id="go-roster">Open the Students page</button></p>
      <p class="hint">${n ? `You have <b>${n}</b> student${n === 1 ? '' : 's'} so far. ` : ''}On the Students page, click <b>Save students</b>, then <b>← Back to setup</b>. You can add or change students any time later.</p>
      ${nextBtn(n ? 'Next' : 'Skip for now')}`;
    },

    6: () => `<div id="rem-flow">${remScreen()}</div>`,

    7: () => `
      <p>This is the link your students use. Send it to students and families, show the QR code in class, or print the flyer. You can always find it again with <b>Share link &amp; QR</b> at the top of your dashboard.</p>
      <div class="note"><b>Use only this link or QR code.</b> A link or flyer from another ES takes students to that ES’s WiSH, where they won’t find their account.</div>
      ${linkBox(ctx.creds().user)}
      <p class="hint">On their phone, students can add WiSH to the home screen: in Safari, tap Share, then <b>Add to Home Screen</b>; in Chrome, tap ⋮, then <b>Add to Home screen</b>.</p>
      ${nextBtn('Finish and open my dashboard')}`,
  };

  const BIND = {
    1: (panel) => {
      $('#pw-form', panel).addEventListener('submit', async (e) => {
        e.preventDefault();
        const p1 = e.target.p1.value, p2 = e.target.p2.value;
        if (p1 !== p2) return toast('The two passwords don’t match.');
        busy('Saving your password…');
        try {
          const c = ctx.creds();
          await mainCall('esChangePassword', { esUser: c.user, esKey: c.key, newPass: p1 });
          ctx.setCreds({ mustChange: false });
          await saveStep(1);
          toast('Password saved.');
          if (done() >= STEPS.length && c.url) return finish();
          at = done() + 1;
          render();
        } catch (err) {
          toast(err.message);
        } finally {
          busy(false);
        }
      });
    },
    2: (panel) => {
      bindNext(panel);
      $$('[data-ready]', panel).forEach(b => b.addEventListener('click', () => {
        try { localStorage.setItem(READY_KEY, b.dataset.ready); } catch { /* ignore */ }
        render();
      }));
    },
    3: bindNext,
    4: (panel) => {
      bindNext(panel);
      $('#connect-form', panel).addEventListener('submit', (e) => {
        e.preventDefault();
        connect(e.target.url.value.trim());
      });
    },
    5: (panel) => {
      bindNext(panel);
      ensureData().then((fresh) => { if (fresh && at === 5) render(); });
      $('#go-roster', panel).addEventListener('click', () => ctx.openRoster());
    },
    6: () => {
      ensureData();
      loadRem();
    },
    7: (panel) => { bindNext(panel); bindLinkBox(panel); },
  };

  // ---------- Step 6: reminders, one question at a time ----------
  // Every answer fills a setting on the Reminders page, so the ES can change it there later.

  const WEEKS = {  // weeks 1–2, 3, 4, 5+ of an LP
    light: ['none', 'none', 'once', 'every5'],
    normal: ['none', 'once', 'once', 'every3'],
    more: ['none', 'once', 'every3', 'every2'],
  };
  const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const hourName = (h) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
  const options = (from, to, pick, name) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map(v => `<option value="${v}" ${v === pick ? 'selected' : ''}>${esc(name(v))}</option>`).join('');
  let rem = null, remErr = '', remQ = 0, ans = null;

  async function loadRem() {
    if (rem) return drawRem();
    remErr = '';
    try {
      rem = await call('adminEmailSettings');
      ans = answersFrom(rem.settings);
      remQ = 0;
    } catch (err) {
      remErr = /unknown request/i.test(err.message) ? 'later' : err.message;
      lastError = remErr;
    }
    drawRem();
  }
  function answersFrom(s) {
    return {
      families: s.families,
      who: s.parents && !s.students ? 'parents' : s.students && !s.parents ? 'students' : 'both',
      often: Object.keys(WEEKS).find(k => WEEKS[k].join() === (s.weeks || []).join()) || 'normal',
      onceDay: s.onceDay, famHour: s.famHour, skipDays: s.noWeekends !== false && s.noHolidays !== false,
      book: s.book || s.meet ? 'yes' : 'no',
      report: !s.report ? 'none' : s.daily ? 'daily' : s.weekly ? 'weekly' : 'none',
      reportHour: s.reportHour, weeklyDay: s.weeklyDay,
      events: { upload: false, resubmit: false, lpEnd: false, ...(s.esEvents || {}) },
    };
  }

  const famOff = () => ans.families === 'off';
  const QS = [
    { key: 'families', ask: 'Should WiSH email families when work samples are still missing?',
      hint: 'They come from your own school email, so families see your name. Only families who still have something to do get one.',
      choices: [['test', 'Yes, but send them to me first', 'You get each email instead of the family, so you can see what they look like. Switch to families any time on the Reminders page.'],
        ['on', 'Yes, email families', ''],
        ['off', 'Not now', 'You can turn them on later on the Reminders page.']] },
    { key: 'who', skip: famOff, ask: 'Who should get them?',
      choices: [['both', 'Parents and students', ''], ['parents', 'Parents only', ''], ['students', 'Students only', '']] },
    { key: 'often', skip: famOff, ask: 'How often, as the LP goes on?', hint: 'Nothing goes out in the first two weeks of an LP.',
      choices: [['light', 'Now and then', 'Once in week 4, then every 5 days until the LP ends'],
        ['normal', 'A steady nudge', 'Once in week 3, once in week 4, then every 3 days'],
        ['more', 'More often', 'Once in week 3, every 3 days in week 4, then every 2 days']] },
    { key: 'when', skip: famOff, ask: 'What day and time should they go out?', form: () => `
      <div class="ask-fields">
        <label class="inline-field">Day <select data-a="onceDay">${options(1, 5, ans.onceDay, d => DAYS[d])}</select></label>
        <label class="inline-field">Time <select data-a="famHour">${options(5, 19, ans.famHour, hourName)}</select></label>
      </div>
      <label class="chk"><input type="checkbox" data-a="skipDays" ${ans.skipDays ? 'checked' : ''}> <span>Don’t send on weekends or school holidays</span></label>` },
    { key: 'book', skip: () => famOff() || !rem.defaults.book || !ctx.bookingLink(), ask: 'Remind families to book their LP meeting?',
      hint: 'Families who haven’t booked get your booking link, and everyone gets a reminder before their meeting.',
      choices: [['yes', 'Yes', ''], ['no', 'No', '']] },
    { key: 'report', ask: 'Do you want an email for yourself about how the LP is going?',
      hint: 'A short summary: who turned in work, who still owes samples, and what is waiting for your review.',
      choices: [['daily', 'Yes, every morning', ''], ['weekly', 'Yes, once a week', ''], ['none', 'No thanks', '']] },
    { key: 'reportWhen', skip: () => ans.report === 'none', ask: 'When should your summary arrive?', form: () => `
      <div class="ask-fields">
        ${ans.report === 'weekly' ? `<label class="inline-field">Day <select data-a="weeklyDay">${options(1, 5, ans.weeklyDay, d => DAYS[d])}</select></label>` : ''}
        <label class="inline-field">Time <select data-a="reportHour">${options(5, 10, ans.reportHour, hourName)}</select></label>
      </div>` },
    { key: 'events', ask: 'Should WiSH also email you right away when…', hint: 'Tick any you want, or none.', form: () => `
      <div class="stack">
        ${[['upload', 'a student turns in a sample'], ['resubmit', 'a student turns in a redo'], ['lpEnd', 'an LP ends in 3 days and samples are still missing']]
          .map(([k, t]) => `<label class="chk"><input type="checkbox" data-ev="${k}" ${ans.events[k] ? 'checked' : ''}> <span>${t}</span></label>`).join('')}
      </div>` },
    { key: 'summary' },
  ];
  const shown = () => QS.filter(q => !q.skip || !q.skip());

  function remScreen() {
    if (!rem && !remErr) return '<p class="connect-state waiting">Loading your reminder choices…</p>';
    if (remErr === 'later') {
      return `<p>Reminder emails start working after the next WiSH update. You can choose them later on the <b>Reminders</b> page.</p>${nextBtn()}`;
    }
    if (remErr) {
      return `<p class="note bad">${esc(remErr)}</p><p><button class="btn" type="button" data-rem-retry>Try again</button></p>${nextBtn('Skip for now')}`;
    }
    const list = shown();
    const q = QS[remQ];
    const n = list.indexOf(q) + 1;
    const back = n > 1 ? '<button class="btn ghost" type="button" data-rem-back>← Back</button>' : '<span></span>';
    if (q.key === 'summary') return summaryScreen(back);
    return `
      <p class="step-of">Question ${n} of ${list.length - 1}</p>
      <p class="ask-q">${esc(q.ask)}</p>
      ${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}
      ${q.choices ? `<div class="choice-list">${q.choices.map(([v, label, more]) => `
        <button type="button" class="choice ${ans[q.key] === v ? 'is-picked' : ''}" data-pick="${v}">
          <b>${esc(label)}</b>${more ? `<span>${esc(more)}</span>` : ''}</button>`).join('')}</div>` : q.form()}
      <div class="step-actions split">${back}${q.form ? '<button class="btn primary big" type="button" data-rem-next>Next →</button>' : ''}</div>`;
  }

  function summary() {
    const out = [];
    const often = { light: 'now and then', normal: 'a steady nudge', more: 'more often' }[ans.often];
    const who = { both: 'parents and students', parents: 'parents', students: 'students' }[ans.who];
    if (ans.families === 'off') out.push('No emails to families for now.');
    else {
      out.push(ans.families === 'test' ? `Family reminders are sent <b>to you first</b>, so you can see them. Later they go to ${who}.`
        : `Family reminders go to <b>${who}</b>.`);
      out.push(`How often: <b>${often}</b>, on <b>${DAYS[ans.onceDay]}</b> at <b>${hourName(ans.famHour)}</b>${ans.skipDays ? ', never on weekends or school holidays' : ''}.`);
      if (!QS.find(q => q.key === 'book').skip()) out.push(ans.book === 'yes' ? 'Families are reminded to book their LP meeting.' : 'No meeting reminders.');
    }
    out.push(ans.report === 'none' ? 'No summary email for you.'
      : ans.report === 'daily' ? `Your summary arrives <b>every morning at ${hourName(ans.reportHour)}</b>.`
        : `Your summary arrives <b>every ${DAYS[ans.weeklyDay]} at ${hourName(ans.reportHour)}</b>.`);
    const ev = [['upload', 'a sample comes in'], ['resubmit', 'a redo comes in'], ['lpEnd', 'an LP ends in 3 days']].filter(([k]) => ans.events[k]).map(([, t]) => t);
    if (ev.length) out.push(`You also get an email when ${ev.join(', or when ')}.`);
    return out;
  }
  function summaryScreen(back) {
    const d = ctx.data();
    const lps = d ? d.lps : [];
    return `
      <p class="ask-q">Here’s what you chose</p>
      <ul class="summary-list">${summary().map(s => `<li>${s}</li>`).join('')}</ul>
      <p class="hint">You can change any of this, and the wording of each email, on the <b>Reminders</b> page.</p>
      ${lps.length ? `<label class="inline-field">Uploads go to
        <select id="setup-lp">${lps.map(lp => `<option ${lp === d.currentLp ? 'selected' : ''}>${esc(lp)}</option>`).join('')}</select>
        <span class="hint">WiSH set this to the current LP for you.</span></label>` : ''}
      <div class="step-actions split">${back}<button class="btn primary big" type="button" data-rem-save>Save and continue →</button></div>`;
  }

  // The full settings, with this step's answers on top of what's already saved.
  function remSettings() {
    const s = rem.settings;
    return {
      ...s,
      families: ans.families,
      parents: ans.who !== 'students', students: ans.who !== 'parents',
      weeks: WEEKS[ans.often],
      onceDay: Number(ans.onceDay), famHour: Number(ans.famHour),
      noWeekends: ans.skipDays, noHolidays: ans.skipDays,
      book: ans.book === 'yes', meet: ans.book === 'yes',
      report: ans.report !== 'none', daily: ans.report === 'daily', weekly: ans.report === 'weekly',
      reportHour: Number(ans.reportHour), weeklyDay: Number(ans.weeklyDay),
      esEvents: { ...s.esEvents, ...ans.events },
      redo: false, each: false, received: false, famHow: 'daily',
      link: Api.studentLink(ctx.creds().user),
    };
  }

  function drawRem() {
    const box = $('#rem-flow');
    if (!box || at !== 6) return;
    box.innerHTML = remScreen();
    bindNext(box);
    const keep = () => {
      $$('[data-a]', box).forEach(el => { ans[el.dataset.a] = el.type === 'checkbox' ? el.checked : Number(el.value); });
      $$('[data-ev]', box).forEach(el => { ans.events[el.dataset.ev] = el.checked; });
    };
    const go = (dir) => {
      keep();
      const list = shown();
      const i = list.indexOf(QS[remQ]) + dir;
      remQ = QS.indexOf(list[Math.max(0, Math.min(i, list.length - 1))]);
      drawRem();
    };
    $$('[data-pick]', box).forEach(b => b.addEventListener('click', () => { ans[QS[remQ].key] = b.dataset.pick; go(1); }));
    const on = (sel, fn) => { const el = $(sel, box); if (el) el.addEventListener('click', fn); };
    on('[data-rem-next]', () => go(1));
    on('[data-rem-back]', () => go(-1));
    on('[data-rem-retry]', () => { remErr = ''; drawRem(); loadRem(); });
    on('[data-rem-save]', saveRem);
    const sel = $('#setup-lp', box);
    if (sel) {
      sel.addEventListener('change', async () => {
        try {
          await call('adminSetLp', { lp: sel.value });
          ctx.data().currentLp = sel.value;
          toast(`Uploads now go to ${sel.value}.`);
        } catch (err) {
          lastError = err.message;
          toast(err.message);
        }
      });
    }
  }

  async function saveRem() {
    busy('Saving your reminders…');
    try {
      rem = await call('adminSaveEmailSettings', { settings: remSettings() });
      ans = answersFrom(rem.settings);
      busy(false);
      if (rem.needsAllow) toast('Saved. Google still needs to allow WiSH to email on a schedule: click Stuck? Get help.');
      await next();
    } catch (err) {
      lastError = err.message;
      toast(err.message);
    } finally {
      busy(false);
    }
  }

  // ---------- Stuck? Get help ----------
  // A ready-to-send message with what the person who made their account needs to help.
  function helpText() {
    const c = ctx.creds() || {};
    const step = STEPS[at - 1];
    const ua = navigator.userAgent;
    return `Hi,

I’m stuck setting up WiSH.

Name: ${c.name || ''}
Username: ${c.user || ''}
Step: ${at} of ${STEPS.length}, ${step ? step.title : ''}
What went wrong: ${lastError || '(describe what you see)'}
Browser: ${browser()} on ${onPhone() ? 'a phone or tablet' : /Mac/.test(navigator.platform) ? 'a Mac' : /Win/.test(navigator.platform) ? 'Windows' : 'a computer'}
(${ua})
Time: ${new Date().toLocaleString()}`;
  }
  const helpDialog = $('#help-dialog');
  $('#setup-help').addEventListener('click', () => {
    $('#help-text').value = helpText();
    const to = (window.WORKIT_CONFIG || {}).HELP_EMAIL || '';
    $('#help-email').href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent('Help with WiSH setup')}&body=${encodeURIComponent($('#help-text').value)}`;
    helpDialog.showModal();
  });
  $('#help-close').addEventListener('click', () => helpDialog.close());
  $('#help-copy').addEventListener('click', () => copy($('#help-text').value, 'Message copied. Paste it into an email or text.'));

  // Links this ES account to their copy: from the copy's "Finish in WiSH" button
  // (admin.html#connect=...), or a link pasted by hand.
  async function connect(url) {
    lastUrl = url;
    open(4);
    const fail = (html) => {
      const box = $('#connect-box');
      lastError = html.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!box) return toast(lastError);
      box.innerHTML = html;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const again = box.querySelector('[data-retry]');
      if (again) again.addEventListener('click', () => connect(lastUrl));
      const restart = box.querySelector('[data-restart]');
      if (restart) restart.addEventListener('click', () => { at = 2; render(); });
    };
    const bad = (text) => `<p class="connect-state bad">${text}</p>`;
    if (!SCRIPT_URL_RE.test(url)) {
      return fail(/\/dev$/.test(url)
        ? bad('That’s Google’s test link (it ends in <b>/dev</b>), which students can’t use. In the Deploy page, click <b>Deploy</b>, then <b>New deployment</b>, and use the link that ends in <b>/exec</b>.')
        : bad('That isn’t a WiSH link. It starts with https://script.google.com/ and ends in /exec.'));
    }
    busy('Checking your copy…');
    try {
      const c = ctx.creds();
      let res;
      try {
        res = await Api.call('esClaim', { esKey: c.key }, { url });
      } catch (err) {
        // The copy is on (its page opened), but a browser without a Google sign-in can't reach
        // it: almost always "Who has access" isn't Anyone, or "Execute as" isn't Me.
        if (err.offline && navigator.onLine) {
          return fail(`<div class="note bad">
            <p><b>Almost there. Students can’t reach your copy yet.</b> This almost always means <i>Who has access</i> isn’t set to <b>Anyone</b>. Here’s the fix. Your link stays the same.</p>
            <ol class="how">
              <li>Go to the Apps Script tab. Click <b>Deploy</b>, then <b>Manage deployments</b>.</li>
              <li>Click the pencil ✎ at the top right.</li>
              <li>Set <i>Execute as</i> to <b>Me</b> and <i>Who has access</i> to <b>Anyone</b>.</li>
              <li>Click <b>Deploy</b>, then come back here.</li>
            </ol>
            <button class="btn primary" type="button" data-retry>Check again</button></div>`);
        }
        throw err;
      }
      // Copies with the update loader say whose Google account they're in and whether every
      // permission was allowed. Older copies don't know esStatus; they skip this check.
      ctx.setCreds({ url });
      let status = null;
      try { status = await call('esStatus'); } catch (err) { if (!/unknown request/i.test(err.message)) throw err; }
      if (status && status.owner && !/@suncoastcharter\.org$/i.test(status.owner)) {
        ctx.setCreds({ url: c.url || '' });
        return fail(`<div class="note bad"><p><b>Your copy is in ${esc(status.owner)}, not your school account.</b> Student work would be saved there.</p>
          <p>Start again from step 2 in a private window, signed in only to your school account (the one ending in suncoastcharter.org).</p>
          <button class="btn" type="button" data-restart>Go back to step 2</button></div>`);
      }
      if (status && status.allowed === false) {
        ctx.setCreds({ url: c.url || '' });
        return fail(`<div class="note bad"><p><b>Google didn’t get every permission WiSH needs.</b> One box was probably left unticked.</p>
          <ol class="how"><li>In your copy (the sheet), click <b>WiSH</b>, then <b>Set up WiSH</b>.</li>
          <li>When Google asks, tick <b>Select all</b>, then click <b>Continue</b>.</li>
          <li>Come back here.</li></ol>
          <button class="btn primary" type="button" data-retry>Check again</button></div>`);
      }
      await mainCall('esSaveSetup', { esUser: c.user, esKey: c.key, scriptUrl: url, version: res.version, step: 4 });
      ctx.setCreds({ url, step: Math.max(c.step || 0, 4) });
      await ctx.loadData();
      lastError = '';
      toast('Connected. Your copy is set up and students can reach it.');
      at = 5;
      render();
    } catch (err) {
      fail(bad(esc(err.message)));
    } finally {
      busy(false);
    }
  }

  // Steps 5 and 6 need the student list and LPs from the ES's copy.
  async function ensureData() {
    if (ctx.data()) return false;
    try { await ctx.loadData(); return true; } catch (err) { toast(err.message); return false; }
  }

  // ---------- Student link and QR code ----------

  function linkBox(user) {
    const link = studentLink(user);
    return `
      <div class="link-box">
        <div class="qr" data-qr="${esc(link)}"></div>
        <div class="link-side">
          <input class="link-input" readonly value="${esc(link)}" aria-label="Student link">
          <div class="link-actions">
            <button class="btn" type="button" data-copy="${esc(link)}">Copy link</button>
            <button class="btn" type="button" data-png="${esc(link)}">Download QR code</button>
            <button class="btn primary" type="button" data-flyer="${esc(link)}">Print a flyer</button>
          </div>
        </div>
      </div>`;
  }
  function bindLinkBox(root) {
    root.querySelectorAll('[data-qr]').forEach(el => { el.innerHTML = qrSvg(el.dataset.qr); });
    root.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copy(b.dataset.copy, 'Link copied.')));
    root.querySelectorAll('[data-png]').forEach(b => b.addEventListener('click', () => downloadQr(b.dataset.png)));
    root.querySelectorAll('[data-flyer]').forEach(b => b.addEventListener('click', () => printFlyer(b.dataset.flyer)));
  }
  function qrMatrix(text) {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    return { n, dark: (r, c) => q.isDark(r, c) };
  }
  function qrSvg(text) {
    const { n, dark } = qrMatrix(text);
    let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 8} ${n + 8}" role="img" aria-label="QR code for the student link" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }
  function downloadQr(text) {
    const { n, dark } = qrMatrix(text);
    const scale = 16, size = (n + 8) * scale;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) g.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = 'WiSH-student-QR.png';
    a.click();
  }
  // A one-page flyer for students and families: QR code, link, and how to sign in.
  function printFlyer(link) {
    const c = ctx.creds();
    const who = c.role === 'es' && c.name ? c.name : '';
    const w = window.open('', '_blank');
    if (!w) return toast('Your browser blocked the flyer. Allow pop-ups for this page and try again.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>WiSH flyer</title>
      <style>
        @page { size: letter; margin: 0.6in; }
        body { font-family: Inter, Arial, sans-serif; color: #121a2e; text-align: center; margin: 0; }
        h1 { font-size: 34px; margin: 10px 0 4px; color: #13204a; }
        .sub { font-size: 18px; color: #3456d6; font-weight: 700; margin: 0 0 22px; }
        .qr { width: 3.4in; height: 3.4in; margin: 0 auto 12px; }
        .qr svg { width: 100%; height: 100%; }
        .link { font-family: Menlo, monospace; font-size: 15px; margin: 0 0 26px; word-break: break-all; }
        ol { text-align: left; max-width: 5.6in; margin: 0 auto; font-size: 17px; line-height: 1.5; padding-left: 1.3em; }
        li { margin-bottom: 10px; }
        .foot { margin-top: 26px; font-size: 13px; color: #5b6579; }
      </style></head><body>
      <h1>Turn in your work samples</h1>
      <p class="sub">with WiSH${who ? ` · ES: ${esc(who)}` : ''}</p>
      <div class="qr">${qrSvg(link)}</div>
      <p class="link">${esc(link)}</p>
      <ol>
        <li>Scan the QR code with your phone camera, or type the link.</li>
        <li>Sign in with the <b>first 2 letters of your first name</b>, your <b>grade</b>, and the <b>first 2 letters of the city you live in</b>.</li>
        <li>Pick the class, take a photo of each page (or choose a file), add the details, and tap <b>Submit</b>.</li>
        <li>Tip: add WiSH to your home screen. iPhone: tap Share, then <b>Add to Home Screen</b>. Android: tap ⋮, then <b>Add to Home screen</b>.</li>
      </ol>
      <p class="foot">Questions? Ask your ES.</p>
      <script>window.onload = () => setTimeout(() => window.print(), 300);<\/script>
      </body></html>`);
    w.document.close();
  }

  async function copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Couldn’t copy. Select the text and copy it yourself.');
    }
  }

  $('#open-link').addEventListener('click', () => {
    const c = ctx.creds();
    $('#link-box').innerHTML = `<p class="hint">Students open this link on their phone, or scan the QR code with the camera, and sign in. Print the flyer to send home to families or post in class.</p>${linkBox(c.role === 'es' ? c.user : '')}`;
    bindLinkBox($('#link-box'));
    show('link');
  });
  $('#link-back').addEventListener('click', () => show('dash'));

  // ---------- ES accounts (main account only) ----------

  let accounts = [];
  $('#open-accounts').addEventListener('click', loadAccounts);
  $('#accounts-back').addEventListener('click', () => show('dash'));

  async function loadAccounts() {
    busy('Loading ES accounts…');
    try {
      const res = await call('superEsList');
      accounts = res.accounts;
      renderAccounts();
      show('accounts');
    } catch (err) {
      toast(/Unknown request/i.test(err.message) ? 'Your WiSH script needs updating before you can add ES accounts.' : err.message);
    } finally {
      busy(false);
    }
  }

  function setupText(a) {
    if (!a.active) return '<span class="tag off">Off</span>';
    if (a.step >= STEPS.length && a.scriptUrl) return '<span class="tag ok">Ready ✓</span>';
    if (!a.lastSignIn) return '<span class="tag">Not signed in yet</span>';
    const n = Math.min(Math.max(a.step, a.mustChange ? 0 : 1) + 1, STEPS.length);
    // Not finished and not seen for 2 days or more: they may be stuck, so it stands out.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.lastSignIn);
    const idle = m ? (Date.now() - new Date(+m[1], m[2] - 1, +m[3])) / 86400000 : 0;
    if (idle >= 3) return `<span class="tag off">May be stuck: step ${n} of ${STEPS.length}, ${esc(STEPS[n - 1].title)}</span>`;
    return `<span class="tag wait">Step ${n} of ${STEPS.length}: ${esc(STEPS[n - 1].title)}</span>`;
  }

  function renderAccounts() {
    $('#accounts-count').textContent = accounts.length;
    $('#accounts-body').innerHTML = accounts.length ? accounts.map(a => `
      <tr data-user="${esc(a.user)}" class="${a.active ? '' : 'is-off'}">
        <td><b>${esc(a.name)}</b>${a.email ? `<small class="meta block">${esc(a.email)}</small>` : ''}</td>
        <td>${esc(a.user)}</td>
        <td>${setupText(a)}</td>
        <td>${esc(niceDay(a.lastSignIn)) || '<span class="meta">Never</span>'}</td>
        <td>${a.scriptUrl ? `<button class="btn small" type="button" data-act="copy-link">Copy link</button>` : '<span class="meta">After setup</span>'}</td>
        <td class="acts">
          <button class="btn small" type="button" data-act="reset">${a.lastSignIn ? 'New password' : 'Resend invite'}</button>
          <button class="btn small ${a.active ? 'danger' : ''}" type="button" data-act="toggle">${a.active ? 'Turn off' : 'Turn on'}</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="6" class="meta empty-row">No ES accounts yet. Create the first one above.</td></tr>';
  }
  function niceDay(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  $('#add-es').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const handle = f.email.value.trim();
    // Everyone is at suncoastcharter.org, so only the part before the @ is typed.
    const email = handle.includes('@') ? handle : `${handle}@suncoastcharter.org`;
    const first = f.first.value.trim(), last = f.last.value.trim();
    busy('Creating the account and emailing them…');
    try {
      const res = await call('superEsAdd', { first, last, email, link: adminUrl() });
      e.target.reset();
      showWelcome(res, false);
      const list = await call('superEsList');
      accounts = list.accounts;
      renderAccounts();
    } catch (err) {
      toast(err.message);
    } finally {
      busy(false);
    }
  });

  $('#accounts-body').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const a = accounts.find(x => x.user === b.closest('tr').dataset.user);
    if (!a) return;
    if (b.dataset.act === 'copy-link') return copy(studentLink(a.user), `${a.name}’s student link copied.`);
    if (b.dataset.act === 'reset') {
      const invite = !a.lastSignIn;
      if (!confirm(invite
        ? `Send ${a.name} their welcome email again${a.email ? ` at ${a.email}` : ''}? It has a new temporary password, so the old one stops working.`
        : `Give ${a.name} a new temporary password${a.email ? ` and email it to ${a.email}` : ''}? Their old password stops working. Their students and work aren’t affected.`)) return;
      busy(invite ? 'Sending the invite…' : 'Making a new password…');
      try {
        showWelcome(await call('superEsReset', { user: a.user, link: adminUrl(), invite }), !invite);
        const list = await call('superEsList');
        accounts = list.accounts;
        renderAccounts();
      } catch (err) { toast(err.message); } finally { busy(false); }
      return;
    }
    if (b.dataset.act === 'toggle') {
      const on = !a.active;
      if (!on && !confirm(`Turn off ${a.name}’s account? They can’t sign in, and their student link stops working. Nothing is deleted, and you can turn it back on.`)) return;
      busy(on ? 'Turning on…' : 'Turning off…');
      try {
        await call('superEsSetActive', { user: a.user, active: on });
        a.active = on;
        renderAccounts();
        toast(`${a.name}’s account is ${on ? 'on' : 'off'}.`);
      } catch (err) { toast(err.message); } finally { busy(false); }
    }
  });

  const welcome = $('#welcome-dialog');
  function showWelcome(res, reset) {
    const first = String(res.name || '').split(' ')[0];
    $('#welcome-title').textContent = reset ? `New password for ${res.name}` : `Account ready for ${res.name}`;
    const hint = $('#welcome-hint');
    hint.className = `hint${res.emailed ? ' sent' : ''}${res.emailError ? ' bad' : ''}`;
    hint.textContent = res.emailed ? `✓ Emailed to ${res.email}. Here is the same message, in case you want to send it another way.`
      : res.emailError || 'Send this to them by email or text. The temporary password is shown only now; if it gets lost, click New password.';
    $('#welcome-text').value = reset
      ? `Hi ${first},

Your WiSH password was reset.

1. On a computer, open: ${adminUrl()}
2. Username: ${res.user}
   Temporary password: ${res.tempPass}
3. WiSH asks you to choose a new password. Your students and their work are just as you left them.`
      : `Hi ${first},

Here is your WiSH ES account. WiSH lets your students turn in work samples from their phones, and saves them in your own Google Drive.

1. On a computer, open: ${adminUrl()}
2. Username: ${res.user}
   Temporary password: ${res.tempPass}
3. Choose your own password. WiSH then walks you through setup step by step. It takes about 10 minutes.

Have your school Google account ready (the one ending in suncoastcharter.org). Student work is saved there.`;
    welcome.showModal();
  }
  $('#welcome-close').addEventListener('click', () => welcome.close());
  $('#welcome-copy').addEventListener('click', () => copy($('#welcome-text').value, 'Message copied. Paste it into an email or text.'));

  return { open, connect, STEPS: STEPS.length };
}
