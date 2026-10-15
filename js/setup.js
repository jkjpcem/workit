// ES dashboard extras: the step-by-step setup a new ES sees at first sign-in, the student
// link and QR code, and the ES accounts page (main account only). admin.js wires it in.

function AdminSetup(ctx) {
  const { $, esc, toast, busy, show, call, mainCall } = ctx;
  const STEPS = [
    { title: 'Choose your password' },
    { title: 'Make your own copy' },
    { title: 'Set up your copy' },
    { title: 'Turn it on for students' },
    { title: 'Add your students' },
    { title: 'Check the LP' },
    { title: 'Share with students' },
  ];
  const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+\/|macros\/)s\/[A-Za-z0-9_-]{20,}\/exec$/;
  const appBase = () => new URL('./', location.href).href;
  const adminUrl = () => new URL('admin.html', location.href).href;
  const studentLink = (user) => appBase() + (user ? `?es=${encodeURIComponent(user)}` : '');

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
      return `
      <p>Workit keeps your students and their work in <b>your own Google Drive</b>. Nobody else, including the person who made your account, can see them. First, make your own copy of the Workit sheet.</p>
      <div class="note"><b>Which Google account?</b> Use the one you want student work saved in, and use that same account in every step. Use your school Google account (the one ending in suncoastcharter.org).</div>
      <ol class="how">
        <li>Click <b>Make my copy</b> below. A Google page opens in a new tab.</li>
        <li>If Google asks you to sign in, sign in with that account. If you’re signed in to more than one Google account, click the round picture at the top right and check it’s the right one.</li>
        <li>Click the blue <b>Make a copy</b> button. If Google mentions that an Apps Script file is copied too, that’s fine: that file is Workit.</li>
        <li>Your copy opens. Keep that tab open and come back to this tab.</li>
      </ol>
      ${url ? `<p><a class="btn big" href="${esc(url)}" target="_blank" rel="noopener">Make my copy ↗</a></p>`
        : '<p class="note bad">The copy link isn’t ready yet. Ask the person who made your Workit account.</p>'}
      ${nextBtn('I made my copy')}`;
    },

    3: () => `
      <p>Now your copy sets up your folders. Google asks you to approve this once.</p>
      <ol class="how">
        <li>Go to the tab with your copy. Wait a few seconds until <b>Workit</b> shows up in the menu bar, to the right of <b>Help</b>. If it doesn’t show up, reload the page.</li>
        <li>Click <b>Workit</b>, then <b>Set up Workit</b>.</li>
        <li>A box says <i>Authorization required</i>. Click <b>OK</b> (or <b>Continue</b>).</li>
        <li>Choose your Google account.</li>
        <li>Google says <i>Google hasn’t verified this app</i>. That’s normal for your own copy. Click <b>Advanced</b> at the bottom left, then <b>Go to Workit (unsafe)</b>.</li>
        <li>If you see checkboxes, tick <b>Select all</b>. Then click <b>Allow</b> (or <b>Continue</b>).</li>
        <li>Back in your copy, a small <i>Running script</i> bar shows for about 30 seconds. If nothing happens after that, click <b>Workit</b>, then <b>Set up Workit</b> once more.</li>
        <li>A box says <b>Your folders are ready. One last step</b>. Leave it open and click <b>Next</b> here.</li>
      </ol>
      ${nextBtn('I see “One last step”')}`,

    4: () => {
      const c = ctx.creds();
      return `
      <p>The last step turns your copy on, so your students’ phones can send work to it. Google only lets you do this yourself, in its Deploy box. It’s 5 clicks.</p>
      <ol class="how">
        <li>In the box in your copy, click <b>Open the Deploy page</b>. If a box says <i>You’re signed in as…</i>, click <b>OK</b>.</li>
        <li>At the top right, click the blue <b>Deploy</b> button, then <b>New deployment</b>.</li>
        <li>Next to <i>Select type</i>, click the gear ⚙ and choose <b>Web app</b>.</li>
        <li>Who has access: choose <b>Anyone</b> (not <i>Anyone with Google account</i>: students don’t sign in to Google). Click <b>Deploy</b>. If Google asks you to <i>Authorize access</i>, allow it the same way as in step 3.</li>
        <li>Under <i>Web app</i>, click the link. A page says <b>Workit is on ✓</b>: click <b>Finish in Workit</b>. Workit connects and takes you to the next step.</li>
      </ol>
      <div class="note">If <b>Anyone</b> isn’t in the list, this Google account doesn’t allow Workit. Ask the person who made your Workit account for help.</div>
      <p class="connect-state ${c.url ? '' : 'waiting'}" id="connect-state">${c.url ? '✓ Your copy is connected.' : 'Waiting for you to click Finish in Workit…'}</p>
      ${c.url ? nextBtn() : ''}
      <details class="by-hand">
        <summary>The Workit page didn’t open? Paste the link instead</summary>
        <p class="hint">In the Deploy box, under <i>Web app</i>, click <b>Copy</b>. Paste it here and click <b>Connect</b>.</p>
        <form class="connect-row" id="connect-form">
          <input name="url" required placeholder="https://script.google.com/macros/s/…/exec" value="${esc(c.url || '')}" spellcheck="false" autocomplete="off" aria-label="Web app link">
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

    6: () => {
      const d = ctx.data();
      const lps = d ? d.lps : [];
      return `
      <p><b>Current LP</b> is where students’ uploads go unless they choose another LP. Change it on your dashboard when a new Learning Period starts.</p>
      <label class="inline-field">Current LP
        <select id="setup-lp">${lps.map(lp => `<option ${d && lp === d.currentLp ? 'selected' : ''}>${esc(lp)}</option>`).join('')}</select>
      </label>
      <p><b>LP dates</b> are the same for every ES, so they’re already filled in for you. Students can only enter a date completed that is a weekday inside the LP.</p>
      <p><button class="btn" type="button" id="go-dates">See the LP dates</button></p>
      ${nextBtn()}`;
    },

    7: () => `
      <p>This is the link your students use. Send it to students and families, show the QR code in class, or print the flyer. You can always find it again with <b>Share link &amp; QR</b> at the top of your dashboard.</p>
      ${linkBox(ctx.creds().user)}
      <p class="hint">On their phone, students can add Workit to the home screen: in Safari, tap Share, then <b>Add to Home Screen</b>; in Chrome, tap ⋮, then <b>Add to Home screen</b>.</p>
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
    2: bindNext,
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
    6: (panel) => {
      bindNext(panel);
      ensureData().then((fresh) => { if (fresh && at === 6) render(); });
      $('#go-dates', panel).addEventListener('click', () => ctx.openDates());
      const sel = $('#setup-lp', panel);
      sel.addEventListener('change', async () => {
        try {
          await call('adminSetLp', { lp: sel.value });
          ctx.data().currentLp = sel.value;
          toast(`${sel.value} is now the current LP.`);
        } catch (err) {
          toast(err.message);
        }
      });
    },
    7: (panel) => { bindNext(panel); bindLinkBox(panel); },
  };

  // Links this ES account to their copy: from the copy's "Finish in Workit" button
  // (admin.html#connect=...), or a link pasted by hand.
  async function connect(url) {
    open(4);
    const state = () => $('#connect-state');
    const fail = (msg) => {
      state().textContent = msg;
      state().className = 'connect-state bad';
    };
    if (!SCRIPT_URL_RE.test(url)) {
      return fail('That isn’t a Workit link. It starts with https://script.google.com/ and ends in /exec.');
    }
    busy('Connecting to your copy…');
    try {
      const c = ctx.creds();
      let res;
      try {
        res = await Api.call('esClaim', { esKey: c.key }, { url });
      } catch (err) {
        if (err.offline) throw new Error('Couldn’t reach your copy. In your copy, click Workit, then Set up Workit again, and click Finish in Workit.');
        throw err;
      }
      await mainCall('esSaveSetup', { esUser: c.user, esKey: c.key, scriptUrl: url, version: res.version, step: 4 });
      ctx.setCreds({ url, step: Math.max(c.step || 0, 4) });
      await ctx.loadData();
      toast('Connected. Your copy is set up and working.');
      at = 5;
      render();
    } catch (err) {
      fail(err.message);
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
    a.download = 'Workit-student-QR.png';
    a.click();
  }
  // A one-page flyer for students and families: QR code, link, and how to sign in.
  function printFlyer(link) {
    const c = ctx.creds();
    const who = c.role === 'es' && c.name ? c.name : '';
    const w = window.open('', '_blank');
    if (!w) return toast('Your browser blocked the flyer. Allow pop-ups for this page and try again.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Workit flyer</title>
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
      <p class="sub">with Workit${who ? ` · ES: ${esc(who)}` : ''}</p>
      <div class="qr">${qrSvg(link)}</div>
      <p class="link">${esc(link)}</p>
      <ol>
        <li>Scan the QR code with your phone camera, or type the link.</li>
        <li>Sign in with the <b>first 2 letters of your first name</b>, your <b>grade</b>, and the <b>first 2 letters of the city you live in</b>.</li>
        <li>Pick the class, take a photo of each page (or choose a file), add the details, and tap <b>Submit</b>.</li>
        <li>Tip: add Workit to your home screen. iPhone: tap Share, then <b>Add to Home Screen</b>. Android: tap ⋮, then <b>Add to Home screen</b>.</li>
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

  const linkDialog = $('#link-dialog');
  $('#open-link').addEventListener('click', () => {
    const c = ctx.creds();
    $('#link-box').innerHTML = `<p class="hint">Students open this link on their phone, or scan the QR code with the camera, and sign in. Print the flyer to send home to families or post in class.</p>${linkBox(c.role === 'es' ? c.user : '')}`;
    bindLinkBox($('#link-box'));
    linkDialog.showModal();
  });
  $('#link-close').addEventListener('click', () => linkDialog.close());

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
      toast(/Unknown request/i.test(err.message) ? 'Your Workit script needs updating before you can add ES accounts.' : err.message);
    } finally {
      busy(false);
    }
  }

  function setupText(a) {
    if (!a.active) return '<span class="tag off">Off</span>';
    if (a.step >= STEPS.length && a.scriptUrl) return '<span class="tag ok">Ready ✓</span>';
    if (!a.lastSignIn) return '<span class="tag">Not signed in yet</span>';
    const n = Math.min(Math.max(a.step, a.mustChange ? 0 : 1) + 1, STEPS.length);
    return `<span class="tag wait">Step ${n} of ${STEPS.length}: ${esc(STEPS[n - 1].title)}</span>`;
  }

  function renderAccounts() {
    $('#accounts-count').textContent = accounts.length;
    $('#accounts-body').innerHTML = accounts.length ? accounts.map(a => `
      <tr data-user="${esc(a.user)}" class="${a.active ? '' : 'is-off'}">
        <td><b>${esc(a.name)}</b></td>
        <td>${esc(a.user)}</td>
        <td>${setupText(a)}</td>
        <td>${esc(niceDay(a.lastSignIn)) || '<span class="meta">Never</span>'}</td>
        <td>${a.scriptUrl ? `<button class="btn small" type="button" data-act="copy-link">Copy link</button>` : '<span class="meta">After setup</span>'}</td>
        <td class="acts">
          <button class="btn small" type="button" data-act="reset">New password</button>
          <button class="btn small ${a.active ? 'danger' : ''}" type="button" data-act="toggle">${a.active ? 'Turn off' : 'Turn on'}</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="6" class="meta empty-row">No ES accounts yet. Create the first one above.</td></tr>';
  }
  function niceDay(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    return m ? new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }

  $('#add-es').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim(), user = e.target.user.value.trim().toLowerCase();
    busy('Creating the account…');
    try {
      const res = await call('superEsAdd', { name, user });
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
      if (!confirm(`Give ${a.name} a new temporary password? Their old password stops working. Their students and work aren’t affected.`)) return;
      busy('Making a new password…');
      try {
        showWelcome(await call('superEsReset', { user: a.user }), true);
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
    $('#welcome-title').textContent = reset ? `New password for ${res.name}` : `Account created for ${res.name}`;
    $('#welcome-text').value = reset
      ? `Hi ${res.name},

Your Workit password was reset.

1. On a computer, open: ${adminUrl()}
2. Username: ${res.user}
   Temporary password: ${res.tempPass}
3. Workit asks you to choose a new password. Your students and their work are just as you left them.`
      : `Hi ${res.name},

Here is your Workit ES account. Workit lets your students turn in work samples from their phones, and saves them in your own Google Drive.

1. On a computer, open: ${adminUrl()}
2. Username: ${res.user}
   Temporary password: ${res.tempPass}
3. Choose your own password. Workit then walks you through setup step by step. It takes about 10 minutes.

Have your school Google account ready (the one ending in suncoastcharter.org). Student work is saved there.`;
    welcome.showModal();
  }
  $('#welcome-close').addEventListener('click', () => welcome.close());
  $('#welcome-copy').addEventListener('click', () => copy($('#welcome-text').value, 'Message copied. Paste it into an email or text.'));

  return { open, connect, STEPS: STEPS.length };
}
