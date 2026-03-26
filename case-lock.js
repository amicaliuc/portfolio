/**
 * Case study password lock
 * Enable by adding  <script>window.CASE_LOCKED = true;</script>
 * before this script in any case page.
 * To remove the lock just delete that line (or set to false).
 *
 * Password: amicaliuc.com
 * Once unlocked the state is saved in localStorage — visitor won't be asked again.
 */
(function () {
  var STORAGE_KEY   = 'portfolio_unlocked';
  var CORRECT_PW    = 'amicaliuc.com';
  var LINKEDIN_URL  = 'https://www.linkedin.com/in/anatolie-micaliuc/';

  // Not locked on this page → do nothing
  if (!window.CASE_LOCKED) return;

  // Already unlocked in a previous visit → do nothing
  if (localStorage.getItem(STORAGE_KEY) === '1') return;

  /* ── inject styles ──────────────────────────────────────────── */
  var css = document.createElement('style');
  css.id  = 'case-lock-css';
  css.textContent = [
    /* overlay root */
    '#case-lock-overlay{',
      'position:fixed;inset:0;z-index:999;',
    '}',

    /* progressive blur — 3 layers with mask gradients */
    '.lock-b1,.lock-b2,.lock-b3{',
      'position:absolute;left:0;right:0;bottom:0;',
    '}',
    '.lock-b1{',
      'top:22%;',
      'backdrop-filter:blur(3px);',
      '-webkit-backdrop-filter:blur(3px);',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 55%);',
      'mask-image:linear-gradient(to bottom,transparent 0%,black 55%);',
    '}',
    '.lock-b2{',
      'top:35%;',
      'backdrop-filter:blur(7px);',
      '-webkit-backdrop-filter:blur(7px);',
      '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 50%);',
      'mask-image:linear-gradient(to bottom,transparent 0%,black 50%);',
    '}',
    '.lock-b3{',
      'top:50%;',
      'backdrop-filter:blur(11px);',
      '-webkit-backdrop-filter:blur(11px);',
    '}',

    /* white gradient fade — covers whole overlay */
    '.lock-fade{',
      'position:absolute;inset:0;pointer-events:none;',
      'background:linear-gradient(to bottom,',
        'rgba(255,255,255,0) 0%,',
        'rgba(255,255,255,0) 22%,',
        'rgba(255,255,255,0.38) 45%,',
        'rgba(255,255,255,0.95) 72%',
      ');',
    '}',

    /* password form — fixed at bottom */
    '.lock-form-wrap{',
      'position:fixed;bottom:24px;left:0;right:0;',
      'display:flex;justify-content:flex-start;',
      'padding-left:146px;padding-right:24px;',
      'box-sizing:border-box;',
      'z-index:1001;',
    '}',
    '.lock-form{',
      'display:flex;flex-direction:column;gap:12px;',
      'width:100%;max-width:700px;',
    '}',
    '.lock-input-row{',
      'display:flex;align-items:center;gap:0;',
      'height:56px;',
      'background:#fff;',
      'border:1px solid rgba(0,0,0,0.15);',
      'border-radius:10px;',
      'padding:4px 4px 4px 18px;',
      'box-sizing:border-box;',
      'max-width:480px;',
      'transition:border-color 0.2s;',
    '}',
    '.lock-input-row.lock-row--error{border-color:rgba(220,50,50,0.5);}',
    '#lock-pw{',
      'flex:1;min-width:0;border:none;outline:none;background:transparent;',
      'font-family:Stratos,sans-serif;font-size:18px;color:#000;',
      'letter-spacing:-0.02em;',
    '}',
    '#lock-pw::placeholder{color:rgba(0,0,0,0.3);}',
    '#lock-btn{',
      'flex-shrink:0;background:#000;color:#fff;border:none;',
      'border-radius:6px;padding:0 24px;height:44px;',
      'font-family:Stratos,sans-serif;font-size:18px;',
      'cursor:pointer;white-space:nowrap;transition:background 0.15s;',
    '}',
    '#lock-btn:hover{background:#333;}',
    '.lock-hint{',
      'font-family:Stratos,sans-serif;font-size:14px;',
      'color:rgba(0,0,0,0.4);margin:0;padding-left:2px;',
    '}',
    '.lock-hint a{color:inherit;text-decoration:underline;}',
    '.lock-hint a:hover{color:rgba(0,0,0,0.7);}',
    '.lock-err{',
      'font-family:Stratos,sans-serif;font-size:14px;',
      'color:rgba(200,40,40,0.85);margin:0;padding-left:2px;',
    '}',

    /* unlock fade-in transition */
    '#case-lock-overlay.lock-unlocking{',
      'opacity:0;transition:opacity 0.4s ease;pointer-events:none;',
    '}',

    /* responsive */
    '@media(max-width:1200px){',
      '.lock-form-wrap{padding-left:20px;}',
    '}',
    '@media(max-width:768px){',
      '.lock-form-wrap{padding-left:16px;padding-right:16px;}',
      '.lock-input-row{max-width:100%;}',
      '#lock-pw{font-size:16px;}',
      '#lock-btn{font-size:16px;padding:0 18px;}',
    '}',
  ].join('');
  document.head.appendChild(css);

  /* ── build overlay HTML ─────────────────────────────────────── */
  function buildOverlay() {
    var el = document.createElement('div');
    el.id = 'case-lock-overlay';
    el.innerHTML =
      '<div class="lock-b1"></div>' +
      '<div class="lock-b2"></div>' +
      '<div class="lock-b3"></div>' +
      '<div class="lock-fade"></div>' +
      '<div class="lock-form-wrap">' +
        '<div class="lock-form">' +
          '<div class="lock-input-row" id="lock-row">' +
            '<input id="lock-pw" type="text" placeholder="Enter password"' +
            ' autocomplete="off" spellcheck="false">' +
            '<button id="lock-btn">Enter</button>' +
          '</div>' +
          '<p class="lock-hint">' +
            "Don\u2019t have a password? " +
            '<a href="' + LINKEDIN_URL + '" target="_blank" rel="noopener">' +
            'Ask me on LinkedIn \u2192</a>' +
          '</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('lock-btn').addEventListener('click', tryUnlock);
    document.getElementById('lock-pw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryUnlock();
      e.stopPropagation(); // don't trigger scroll-key handler
    });
  }

  /* ── unlock logic ───────────────────────────────────────────── */
  function tryUnlock() {
    var val = (document.getElementById('lock-pw').value || '').trim();
    if (val === CORRECT_PW) {
      localStorage.setItem(STORAGE_KEY, '1');
      releaseScrollLock();
      var overlay = document.getElementById('case-lock-overlay');
      overlay.classList.add('lock-unlocking');
      overlay.addEventListener('transitionend', function () { overlay.remove(); });
    } else {
      showError();
    }
  }

  function showError() {
    var row = document.getElementById('lock-row');
    row.classList.add('lock-row--error');
    if (!document.getElementById('lock-err-msg')) {
      var p = document.createElement('p');
      p.id = 'lock-err-msg';
      p.className = 'lock-err';
      p.textContent = 'Wrong password — try again.';
      row.after(p);
    }
    setTimeout(function () { row.classList.remove('lock-row--error'); }, 700);
  }

  /* ── scroll lock ────────────────────────────────────────────── */
  var SCROLL_KEYS = ['ArrowDown','ArrowUp','PageDown','PageUp','End','Home',' '];

  function blockKey(e) {
    if (e.target && e.target.id === 'lock-pw') return;
    if (SCROLL_KEYS.indexOf(e.key) !== -1) e.preventDefault();
  }
  function blockWheel(e)  { e.preventDefault(); }
  function blockTouch(e)  {
    // allow touches inside the form
    if (e.target.closest && e.target.closest('.lock-form-wrap')) return;
    e.preventDefault();
  }

  function applyScrollLock() {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown',   blockKey,   { passive: false });
    document.addEventListener('wheel',     blockWheel, { passive: false });
    document.addEventListener('touchmove', blockTouch, { passive: false });
  }

  function releaseScrollLock() {
    document.body.style.overflow = '';
    document.removeEventListener('keydown',   blockKey);
    document.removeEventListener('wheel',     blockWheel);
    document.removeEventListener('touchmove', blockTouch);
  }

  /* ── init ───────────────────────────────────────────────────── */
  applyScrollLock();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildOverlay);
  } else {
    buildOverlay();
  }
})();
