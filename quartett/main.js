/**
 * Quartett — Version 1.0
 * ---------------------------------------------------------------------------
 * Aufbau (alles in dieser Datei):
 *   1. Konstanten, Hilfsfunktionen, Einstellungen
 *   2. Decks: laden, prüfen, Bilder (decks/*.js)
 *   3. Töne und Designs
 *   4. Zustand & Anzeige-Router
 *   5. Hub: Spiellogik (Zustandsmaschine) + Netzwerk
 *   6. Mitspieler: Netzwerk
 *   7. Oberfläche: Start, Erstellen, Beitreten, Lobby
 *   8. Oberfläche: Spielbildschirm (Karte, Werte, Arena, Ergebnis)
 *   9. Oberfläche: Siegerehrung mit Statistik, Deck-Prüfung
 *  10. Start
 *
 * Rollen: Ein Mitspieler ist gleichzeitig der "Hub": sein Gerät führt die komplette
 * Spiellogik aus und ist per WebRTC (PeerJS) mit allen anderen verbunden. Die anderen
 * Spieler bekommen immer NUR ihre eigene Karte geschickt – fremde Karten bleiben geheim,
 * bis ihr Besitzer sie per Tipp aufdeckt.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ===========================================================================
     1. KONSTANTEN, HILFSFUNKTIONEN, EINSTELLUNGEN
     =========================================================================== */
  const VERSION = '1.0';
  const KEY_SETTINGS = 'qt.settings.v1';
  const KEY_NAME = 'qt.name.v1';
  const KEY_LAST = 'qt.last.v1';       // Mitspieler: zuletzt besuchtes Spiel (Wiederverbinden)
  const KEY_CID = 'qt.cid.v1';         // eigene Geräte-ID
  const KEY_ROOM = 'qt.room.v1';       // Hub: fester Spiel-Code
  const KEY_GROUP = 'qt.group.v1';     // Hub: letzte Gruppe
  const KEY_SNAP = 'qt.snap.v1';       // Hub: Spielstand (übersteht Neuladen)
  const KEY_THEME = 'qt.theme.v1';

  const MAX_PLAYERS = 6;
  const DEAL_MS = 2200;                // Mischen/Austeilen
  const REVEAL_DELAY = 900;            // Pause, wenn alle aufgedeckt haben
  const RESULT_MS = 10000;             // Ergebnis-Anzeige, danach automatisch weiter
  const AUTO_CHOOSE_MS = 5000;         // Offline-Spieler am Zug: Kategorie wird gewürfelt
  const COLORS = ['#c8482f', '#2f6f8f', '#5a8f3c', '#b8862b', '#7a4f9a', '#c0577a'];

  const $ = (sel, root) => (root || document).querySelector(sel);

  /** Kleiner DOM-Baukasten: h('div', {class:'x', onClick:fn}, kind1, kind2 …) */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        const v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') e.innerHTML = v;
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    kids.flat(Infinity).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      e.append(c && c.nodeType ? c : document.createTextNode(String(c)));
    });
    return e;
  }
  const ico = (name, extra) => h('i', { class: 'fa-solid ' + (name || 'fa-circle') + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
  const fmtNum = (v) => nf.format(v);
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  let toastTimer = null;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast is-visible' + (kind ? ' is-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2800);
  }

  /* ---- Einstellungen (nur auf dem Hub relevant, werden gemerkt) -------------- */
  function loadSettings() {
    const d = { deck: null, rounds: 0, cardLimit: 0 };
    try {
      const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || 'null');
      if (s && typeof s === 'object') {
        if (typeof s.deck === 'string') d.deck = s.deck;
        if ([0, 10, 20, 30, 50].includes(s.rounds)) d.rounds = s.rounds;
        if ([0, 12, 16, 20, 24].includes(s.cardLimit)) d.cardLimit = s.cardLimit;
      }
    } catch (err) { /* ignore */ }
    return d;
  }
  let settings = loadSettings();
  const saveSettings = () => { try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (err) { /* ignore */ } };
  const getSavedName = () => { try { return localStorage.getItem(KEY_NAME) || ''; } catch (err) { return ''; } };
  const saveName = (n) => { try { localStorage.setItem(KEY_NAME, n); } catch (err) { /* ignore */ } };

  /* ===========================================================================
     2. DECKS: LADEN, PRÜFEN, BILDER
     Jedes Deck liegt in einer eigenen Datei unter decks/ (Liste: decks/decks.js).
     =========================================================================== */
  const DECKS = [];
  const DECK_ERRORS = [];
  const SCRIPT_BASE = (document.currentScript && document.currentScript.src)
    ? new URL('.', document.currentScript.src).href : './';

  function loadScriptFile(path) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_BASE + path + '?v=' + VERSION;
      s.onload = resolve;
      s.onerror = () => reject(new Error(path));
      document.head.appendChild(s);
    });
  }

  /** Prüft ein Deck. errors = Deck ist unbrauchbar, warnings = Hinweise. */
  function validateDeck(d) {
    const errors = [], warnings = [];
    if (!d || typeof d !== 'object') return { errors: ['Kein gültiges Deck.'], warnings };
    if (!/^[a-z0-9_-]+$/.test(d.id || '')) errors.push('„id“ fehlt oder enthält ungültige Zeichen (nur a–z, 0–9, - und _).');
    if (!d.name) errors.push('„name“ fehlt.');
    if (!Array.isArray(d.stats) || d.stats.length < 2) errors.push('Mindestens 2 Werte („stats“) nötig.');
    if (!Array.isArray(d.cards) || d.cards.length < 4) errors.push('Mindestens 4 Karten („cards“) nötig.');
    if (!Array.isArray(d.stats) || !Array.isArray(d.cards)) return { errors, warnings };
    const statIds = new Set();
    d.stats.forEach((s, i) => {
      if (!s.id || statIds.has(s.id)) errors.push('Wert #' + (i + 1) + ': „id“ fehlt oder doppelt.');
      statIds.add(s.id);
      if (!s.label) errors.push('Wert „' + s.id + '“: „label“ fehlt.');
      if (s.better !== 'high' && s.better !== 'low') errors.push('Wert „' + s.id + '“: „better“ muss \'high\' oder \'low\' sein.');
      if (!s.icon) warnings.push('Wert „' + s.id + '“: kein Symbol („icon“).');
    });
    const ids = new Set(), names = new Set();
    d.cards.forEach((c, i) => {
      const tag = 'Karte #' + (i + 1) + (c && c.name ? ' (' + c.name + ')' : '');
      if (!c || !c.id) { errors.push(tag + ': „id“ fehlt.'); return; }
      if (ids.has(c.id)) errors.push(tag + ': „id“ ' + c.id + ' kommt doppelt vor.');
      ids.add(c.id);
      if (!c.name) errors.push(tag + ': „name“ fehlt.');
      else { if (names.has(c.name)) warnings.push(tag + ': Name kommt doppelt vor.'); names.add(c.name); }
      if (!c.img) warnings.push(tag + ': kein Bild – es wird ein Platzhalter gezeigt.');
      statIds.forEach((sid) => {
        const v = c.values && c.values[sid];
        if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(tag + ': Wert „' + sid + '“ fehlt oder ist keine Zahl.');
      });
    });
    if (d.cards.length < 12) warnings.push('Nur ' + d.cards.length + ' Karten – mit mehreren Spielern wird das kurz.');
    return { errors, warnings };
  }

  function normalizeDeck(d) {
    const v = validateDeck(d);
    d.errors = v.errors; d.warnings = v.warnings; d.valid = v.errors.length === 0;
    d.map = {};
    if (Array.isArray(d.cards)) {
      d.cards.forEach((c, i) => {
        if (!c) return;
        c.code = c.code || (Math.floor(i / 4) + 1) + 'ABCD'[i % 4];
        d.map[c.id] = c;
      });
    }
    d.color = d.color || '#c8482f';
    d.icon = d.icon || 'fa-clone';
  }

  function loadDecks() {
    return loadScriptFile('decks/decks.js')
      .catch(() => { DECK_ERRORS.push('decks/decks.js konnte nicht geladen werden.'); })
      .then(() => Promise.all((window.QUARTETT_DECK_FILES || []).map((f) =>
        loadScriptFile('decks/' + f).catch(() => { DECK_ERRORS.push('decks/' + f + ' konnte nicht geladen werden.'); }))))
      .then(() => {
        (window.QUARTETT_DECKS || []).forEach((d) => {
          try { normalizeDeck(d); DECKS.push(d); } catch (err) { DECK_ERRORS.push('Ein Deck konnte nicht gelesen werden: ' + err.message); }
        });
      });
  }
  const getDeck = (id) => DECKS.find((d) => d.id === id) || null;

  /** Platzhalter-Bild, wenn "img" fehlt oder nicht lädt. */
  function placeholderSrc(card, deck) {
    const t = String(card.name || '?').replace(/[<>&]/g, '');
    const initial = t.trim().charAt(0).toUpperCase() || '?';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + deck.color + '"/><stop offset="1" stop-color="#2b2b3a"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="220" text-anchor="middle" fill="#fff" opacity=".85" font-family="Georgia,serif">' + initial + '</text><text x="300" y="370" font-size="32" text-anchor="middle" fill="#fff" opacity=".9" font-family="Georgia,serif">' + t + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function cardImg(deck, card, cls) {
    const img = h('img', { class: cls || 'qt-img', alt: card.name, draggable: 'false' });
    img.addEventListener('error', () => { if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = placeholderSrc(card, deck); } });
    img.src = card.img ? card.img : placeholderSrc(card, deck);
    return img;
  }
  const statOf = (deck, id) => deck.stats.find((s) => s.id === id);
  const valueText = (deck, stat, card) => fmtNum(card.values[stat.id]) + (stat.unit ? ' ' + stat.unit : '');

  /* ===========================================================================
     3. TÖNE UND DESIGNS (immer an)
     =========================================================================== */
  const Sfx = (() => {
    let ac = null, master = null, noiseBuf = null;
    function ensure() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ac = new AC();
          master = ac.createGain(); master.gain.value = 0.9;
          const comp = ac.createDynamicsCompressor();
          master.connect(comp); comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') ac.resume();
        return true;
      } catch (err) { ac = null; return false; }
    }
    function tone(freq, t0, dur, o = {}) {
      const { type = 'sine', vol = 0.18, lp = 4000, attack = 0.01, slideTo = null, vib = 0 } = o;
      const osc = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      osc.type = type; osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      f.type = 'lowpass'; f.frequency.value = lp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(f); f.connect(g); g.connect(master);
      if (vib) {
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 5.5; lg.gain.value = vib; lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
    function noise(t0, dur, o = {}) {
      const { type = 'bandpass', freq = 2000, sweepTo = null, q = 0.8, vol = 0.2, flat = false, dest = null } = o;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t0);
      if (!flat) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(dest || master);
      src.start(t0, Math.random() * 0.9, dur);
    }
    const now = () => ac.currentTime;

    /** Karte wird umgedreht / gelegt. */
    function flip() { if (!ensure()) return; const t = now(); noise(t, 0.14, { freq: 500, sweepTo: 3200, q: 0.9, vol: 0.28 }); tone(220, t, 0.06, { vol: 0.08, slideTo: 140 }); }
    /** Mischen und Austeilen. */
    function shuffleSfx() { if (!ensure()) return; for (let i = 0; i < 9; i++) setTimeout(flip, i * 190 + Math.random() * 40); }
    /** Kategorie gewählt. */
    function pick() { if (!ensure()) return; const t = now(); tone(660, t, 0.09, { type: 'triangle', vol: 0.2 }); tone(990, t + 0.07, 0.12, { type: 'triangle', vol: 0.16 }); }
    /** Ein Wert wird aufgedeckt. */
    function reveal() { if (!ensure()) return; const t = now(); noise(t, 0.05, { freq: 2200, q: 1.2, vol: 0.3 }); tone(523, t, 0.2, { type: 'triangle', vol: 0.2 }); tone(784, t + 0.08, 0.3, { type: 'triangle', vol: 0.18 }); }
    /** Du bist dran. */
    function turn() { if (!ensure()) return; const t = now(); tone(880, t, 0.25, { type: 'triangle', vol: 0.2 }); tone(1318.5, t + 0.12, 0.45, { type: 'triangle', vol: 0.18 }); }
    /** Runde gewonnen. */
    function win() { if (!ensure()) return; const t = now(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.1, 0.5, { type: 'triangle', vol: 0.2 })); noise(t + 0.3, 0.8, { type: 'highpass', freq: 6000, vol: 0.05 }); }
    /** Runde verloren. */
    function lose() { if (!ensure()) return; const t = now(); tone(392, t, 0.28, { type: 'triangle', vol: 0.16 }); tone(311, t + 0.22, 0.5, { type: 'triangle', vol: 0.16 }); }
    /** Gleichstand. */
    function tieSfx() { if (!ensure()) return; const t = now(); tone(130, t, 0.3, { vol: 0.3, slideTo: 80 }); tone(130, t + 0.26, 0.4, { vol: 0.3, slideTo: 70 }); noise(t, 0.2, { freq: 400, q: 0.6, vol: 0.2 }); }
    function cymbal(t) { noise(t, 1.6, { type: 'highpass', freq: 5500, q: 0.5, vol: 0.22 }); }
    function applause(sec, delay) {
      const t0 = now() + (delay || 0);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.7);
      g.gain.setValueAtTime(0.9, t0 + sec - 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
      g.connect(master);
      noise(t0, sec, { freq: 2800, q: 0.35, vol: 0.1, flat: true, dest: g });
      for (let i = 0, n = Math.floor(sec * 45); i < n; i++) { const r = Math.random(); noise(t0 + Math.random() * (sec - 0.1), 0.03 + r * 0.04, { freq: 900 + r * 3200, q: 1.2, vol: 0.12 + r * 0.2, dest: g }); }
    }
    /** Fanfare + Applaus (Siegerehrung). */
    function fanfare() {
      if (!ensure()) return;
      const t = now() + 0.02, C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
      [[C5, 0, 0.14], [C5, 0.17, 0.14], [C5, 0.34, 0.14], [E5, 0.55, 0.32], [C5, 0.95, 0.2], [E5, 1.2, 0.2], [G5, 1.5, 0.5], [C6, 2.1, 1.4]].forEach(([f, o, d]) => {
        tone(f, t + o, d + 0.15, { type: 'sawtooth', vol: 0.16, lp: 2600, vib: 4 });
        tone(f / 2, t + o, d + 0.15, { type: 'sawtooth', vol: 0.1, lp: 1400, vib: 3 });
      });
      [261.63, 329.63, 392, 523.25].forEach((f) => tone(f, t + 2.1, 1.7, { type: 'sawtooth', vol: 0.11, lp: 1800, vib: 3 }));
      cymbal(t); cymbal(t + 2.1);
      for (let i = 0; i < 10; i++) tone(1568 + Math.random() * 2200, t + 2.1 + i * 0.07, 0.3, { vol: 0.05, lp: 9000 });
      applause(5.5, 2.0);
    }
    return { ensure, flip, shuffle: shuffleSfx, pick, reveal, turn, win, lose, tie: tieSfx, fanfare };
  })();
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((evt) => document.addEventListener(evt, () => Sfx.ensure(), { passive: true }));

  /* ---- Designs (nur auf diesem Gerät, werden gemerkt) ------------------------ */
  const THEMES = [
    { id: 'classic', label: 'Klassik', meta: '#c8482f' },
    { id: 'holo',    label: 'Holo',    meta: '#0d1530' },
    { id: 'retro',   label: 'Retro',   meta: '#1a0b2e' },
    { id: 'sun',     label: 'Sonne',   meta: '#f5b81b' },
    { id: 'mono',    label: 'Mono',    meta: '#ffffff' },
  ];
  const THEME_FONTS = {
    holo: 'family=Rajdhani:wght@500;600;700',
    retro: 'family=Orbitron:wght@500;700;900',
    sun: 'family=Baloo+2:wght@500;700;800',
  };
  let themeId = 'classic';
  try { const t = localStorage.getItem(KEY_THEME); if (THEMES.some((x) => x.id === t)) themeId = t; } catch (err) { /* ignore */ }
  function loadThemeFonts(id) {
    const q = THEME_FONTS[id];
    if (!q || document.getElementById('font-' + id)) return;
    document.head.appendChild(h('link', { id: 'font-' + id, rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?' + q + '&display=swap' }));
  }
  function applyTheme() {
    loadThemeFonts(themeId);
    document.body.dataset.theme = themeId;
    const t = THEMES.find((x) => x.id === themeId);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t) meta.setAttribute('content', t.meta);
  }
  function initThemeUI() {
    const panel = h('div', { class: 'theme-panel', id: 'theme-panel', hidden: true, role: 'dialog', 'aria-label': 'Design wählen' },
      h('div', { class: 'theme-title' }, 'Design'),
      h('div', { class: 'theme-grid', role: 'radiogroup' }, THEMES.map((t) =>
        h('button', { type: 'button', class: 'theme-option', role: 'radio', 'data-theme-id': t.id, onClick: () => {
          themeId = t.id;
          try { localStorage.setItem(KEY_THEME, themeId); } catch (err) { /* ignore */ }
          applyTheme(); sync();
        } }, h('span', { class: 'theme-swatch theme-swatch-' + t.id }, h('b'), h('i'), h('u')), h('span', { class: 'theme-name' }, t.label)))));
    const fab = h('button', { type: 'button', class: 'theme-fab', 'aria-label': 'Design wählen', 'aria-expanded': 'false', title: 'Design', onClick: (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      panel.hidden = !open;
      fab.setAttribute('aria-expanded', String(open));
      if (open) Object.keys(THEME_FONTS).forEach(loadThemeFonts);
    } }, ico('fa-palette'));
    function sync() { panel.querySelectorAll('.theme-option').forEach((b) => { const on = b.dataset.themeId === themeId; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); }); }
    document.addEventListener('click', (e) => {
      if (!panel.hidden && !e.target.closest('#theme-panel') && !e.target.closest('.theme-fab')) { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); }
    });
    document.body.append(fab, panel);
    sync();
  }

  /* ===========================================================================
     4. ZUSTAND & ANZEIGE-ROUTER
     =========================================================================== */
  const app = $('#app');
  const S = {
    role: null,          // 'hub' | 'client' | null (Startseite)
    cid: null,           // eigene Geräte-ID ('hub' beim Hub)
    name: '',
    view: null,          // zuletzt empfangener Spielzustand (Sicht dieses Geräts)
    pick: null,          // Kategorie, die ich (am Zug) gerade anwähle, aber noch nicht bestätigt habe
    page: 'landing',
    net: 'idle', netMsg: '', joinError: '',
    peer: null, conn: null, retry: null, halted: false, resuming: false, failCount: 0,
  };
  try {
    S.cid = localStorage.getItem(KEY_CID);
    if (!S.cid) { S.cid = uid(); localStorage.setItem(KEY_CID, S.cid); }
  } catch (err) { S.cid = uid(); }

  let cur = { key: null, update: null, cleanups: [] };
  /** Zeigt einen Bildschirm. Gleicher Schlüssel = nur update(); neuer Schlüssel = neu aufbauen. */
  function show(key, build, opts) {
    if (cur.key === key) { if (cur.update) cur.update(); return; }
    const y = window.scrollY;
    cur.cleanups.forEach((f) => { try { f(); } catch (err) { /* ignore */ } });
    document.body.dataset.screen = String(key).split(':')[0];
    app.innerHTML = '';
    const root = h('div', { class: 'screen' });
    app.append(root);
    const mine = { key, update: null, cleanups: [] };
    cur = mine;
    mine.update = build(root, { cleanup: (fn) => mine.cleanups.push(fn) }) || null;
    if (mine.update) mine.update();
    window.scrollTo(0, opts && opts.keep ? y : 0);
  }

  /** Rangliste mit Gleichstand (gleiche Werte = gleicher Platz). */
  function ranking(list, field) {
    const out = list.slice().sort((a, b) => b[field] - a[field]);
    let rank = 0;
    out.forEach((p, i) => { if (i === 0 || p[field] !== out[i - 1][field]) rank = i + 1; p.rank = rank; });
    return out;
  }

  /* ---- Bildschirm wach halten ------------------------------------------------ */
  let wake = null;
  async function requestWake() {
    if (!('wakeLock' in navigator) || wake || document.visibilityState !== 'visible') return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (err) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    requestWake();
    if (S.role === 'client' && !S.halted && S.peer && (!S.conn || !S.conn.open)) clientConnect();
    if (S.role === 'hub' && net.peer && net.peer.disconnected && !net.peer.destroyed) { try { net.peer.reconnect(); } catch (err) { /* ignore */ } }
  });
  ['pointerdown', 'keydown'].forEach((evt) => document.addEventListener(evt, () => { if (!wake) requestWake(); }, { passive: true }));

  /* ===========================================================================
     5. HUB: SPIELLOGIK (läuft auf dem Gerät des Spielers, der das Spiel erstellt hat)
     Phasen: lobby -> deal -> choose -> reveal -> (tie -> reveal …) -> result -> choose … -> final
     =========================================================================== */
  const net = { peer: null, code: null, conns: new Map(), status: 'idle', retry: 0 };
  let G = null;
  let broadcastTimer = null;

  const safeSend = (conn, obj) => { try { if (conn && conn.open) conn.send(obj); } catch (err) { /* Verbindung weg */ } };
  const findPlayer = (id) => G.players.find((p) => p.id === id);

  function newPlayerStats() {
    return { rounds: 0, wins: 0, losses: 0, streak: 0, bestStreak: 0, cardsWon: 0, stechWins: 0, chooseRounds: 0, chooseWins: 0, catWins: {} };
  }
  function makePlayer(id, name) {
    return { id, name, online: true, color: COLORS[0], stack: [], out: false, revealed: false, cur: null, st: newPlayerStats() };
  }
  function nextColor() {
    const used = new Set(G.players.map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[G.players.length % COLORS.length];
  }
  function uniqueName(base, exceptId) {
    let name = base || 'Spieler';
    let n = 2;
    while (G.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase())) name = base + ' ' + n++;
    return name;
  }
  function newCode() {
    const ch = 'abcdefghjkmnpqrstuvwxyz23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += ch[Math.floor(Math.random() * ch.length)];
    return c;
  }
  function newGameState() {
    return { phase: 'lobby', cfg: null, deck: null, players: [], round: 0, activeId: null, cat: null, table: {}, participants: [],
             tieIds: [], stechen: 0, result: null, final: null, log: [], timers: {} };
  }

  /* ---- Gruppe, Spiel-Code & Spielstand merken -------------------------------- */
  const loadRoom = () => { try { const c = localStorage.getItem(KEY_ROOM); if (/^[a-z0-9]{6}$/.test(c || '')) return c; } catch (err) { /* ignore */ } return null; };
  const saveRoom = (c) => { try { localStorage.setItem(KEY_ROOM, c); } catch (err) { /* ignore */ } };
  function loadGroup() {
    try { const g = JSON.parse(localStorage.getItem(KEY_GROUP) || 'null'); if (g && Array.isArray(g.players) && g.players.length) return g; } catch (err) { /* ignore */ }
    return null;
  }
  function loadSnap() {
    try {
      const sn = JSON.parse(localStorage.getItem(KEY_SNAP) || 'null');
      if (sn && Date.now() - sn.at < 12 * 3600 * 1000 && sn.phase === 'choose' && sn.round > 0 && sn.deckId && getDeck(sn.deckId)) return sn;
    } catch (err) { /* ignore */ }
    return null;
  }
  const clearSnap = () => { try { localStorage.removeItem(KEY_SNAP); } catch (err) { /* ignore */ } };
  function loadLast() {
    try { const l = JSON.parse(localStorage.getItem(KEY_LAST) || 'null'); if (l && typeof l.code === 'string' && Date.now() - (l.at || 0) < 24 * 3600 * 1000) return l; } catch (err) { /* ignore */ }
    return null;
  }
  function persist() {
    if (!G) return;
    try {
      const ps = G.players.filter((p) => p.id !== 'hub').map((p) => ({ cid: p.id, name: p.name, color: p.color }));
      if (ps.length) localStorage.setItem(KEY_GROUP, JSON.stringify({ players: ps, at: Date.now() }));
      if (G.phase === 'choose' && G.round > 0 && G.cfg) {      // sicherer Wiederaufnahme-Punkt: Karten liegen alle in den Stapeln
        localStorage.setItem(KEY_SNAP, JSON.stringify({
          at: Date.now(), code: net.code, phase: 'choose', round: G.round, deckId: G.cfg.deck, cfg: G.cfg, activeId: G.activeId,
          log: G.log, hubName: S.name,
          players: G.players.map((p) => ({ id: p.id, name: p.name, color: p.color, stack: p.stack, out: p.out, st: p.st })),
        }));
      }
    } catch (err) { /* Speicher voll / gesperrt */ }
  }

  /* ---- Spiel erstellen / fortsetzen ------------------------------------------- */
  function createGame(hostName, useGroup) {
    S.role = 'hub';
    S.cid = 'hub';
    S.name = cleanName(hostName) || 'Spielleiter';
    saveName(S.name);
    try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
    clearSnap();
    net.code = loadRoom() || newCode();
    saveRoom(net.code);
    G = newGameState();
    const me = makePlayer('hub', S.name);
    G.players.push(me);
    const group = useGroup ? loadGroup() : null;
    if (group) {
      // bekannte Geräte: stehen als "wartet" in der Lobby und verbinden sich von selbst wieder
      group.players.slice(0, MAX_PLAYERS - 1).forEach((gp) => {
        if (!gp || typeof gp.cid !== 'string' || gp.cid === 'hub' || findPlayer(gp.cid)) return;
        const p = makePlayer(gp.cid, uniqueName(cleanName(gp.name) || 'Spieler'));
        p.color = COLORS.includes(gp.color) && !G.players.some((x) => x.color === gp.color) ? gp.color : nextColor();
        p.online = false;
        G.players.push(p);
      });
    }
    startPeer();
    requestWake();
    touch();
  }

  /** Nach Neuladen: Spiel ab dem Beginn der letzten Runde fortsetzen. */
  function resumeGame() {
    const sn = loadSnap();
    if (!sn) return;
    S.role = 'hub'; S.cid = 'hub'; S.name = sn.hubName || getSavedName() || 'Spielleiter';
    try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
    G = newGameState();
    G.deck = getDeck(sn.deckId);
    G.cfg = sn.cfg; G.round = sn.round - 1; G.activeId = sn.activeId; G.log = sn.log || [];
    sn.players.forEach((sp) => {
      const p = makePlayer(sp.id, sp.name);
      p.color = sp.color; p.stack = sp.stack || []; p.out = !!sp.out; p.st = Object.assign(newPlayerStats(), sp.st || {});
      p.online = sp.id === 'hub';
      G.players.push(p);
    });
    net.code = sn.code;
    saveRoom(net.code);
    startPeer();
    requestWake();
    beginRound();            // gleiche Runde noch einmal beginnen
  }

  function startPeer() {
    net.code = net.code || newCode();
    net.status = 'connecting';
    const peer = new window.Peer('qt-' + net.code, { debug: 0 });
    net.peer = peer;
    peer.on('open', () => { if (net.peer === peer) { net.status = 'ready'; net.retry = 0; render(); } });
    peer.on('connection', onConn);
    peer.on('disconnected', () => {
      if (net.peer !== peer || peer.destroyed) return;
      net.status = 'connecting'; render();
      setTimeout(() => { try { if (net.peer === peer) peer.reconnect(); } catch (err) { /* ignore */ } }, 2000);
    });
    peer.on('close', () => {
      if (net.peer !== peer) return;
      net.peer = null; net.status = 'error'; render();
      setTimeout(startPeer, 4000);
    });
    peer.on('error', (err) => {
      if (net.peer !== peer) return;
      if (err && err.type === 'unavailable-id') {
        // Alte Sitzung hängt noch beim Vermittlungsserver: erst warten (Code bleibt gleich), dann neuer Code.
        net.peer = null;
        try { peer.destroy(); } catch (e) { /* ignore */ }
        net.retry = (net.retry || 0) + 1;
        if (net.retry <= 3) { net.status = 'connecting'; render(); setTimeout(startPeer, 3000); }
        else { net.retry = 0; net.code = newCode(); saveRoom(net.code); setTimeout(startPeer, 200); }
      } else if (err && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        net.status = 'error'; render();
      }
    });
  }

  function onConn(conn) {
    let cid = null;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'join') { cid = handleJoin(conn, msg); return; }
      if (cid) onClientMsg(cid, msg);
    });
    const gone = () => { if (cid) playerGone(cid, conn); };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  function handleJoin(conn, msg) {
    if (!G) return null;
    const cid = String(msg.cid || '').slice(0, 40);
    if (!cid || cid === 'hub') { safeSend(conn, { t: 'reject', reason: 'Ungültige Anmeldung.' }); return null; }
    let p = findPlayer(cid);
    if (!p) {
      if (G.phase !== 'lobby') { safeSend(conn, { t: 'reject', reason: 'Das Spiel läuft schon. Fragt nach einem neuen Spiel.' }); return null; }
      if (G.players.length >= MAX_PLAYERS) { safeSend(conn, { t: 'reject', reason: 'Das Spiel ist voll (max. ' + MAX_PLAYERS + ' Spieler).' }); return null; }
      p = makePlayer(cid, uniqueName(cleanName(msg.name) || 'Spieler'));
      p.color = nextColor();
      G.players.push(p);
    }
    if (G.phase === 'lobby') { const nm = cleanName(msg.name); if (nm && nm.toLowerCase() !== p.name.toLowerCase()) p.name = uniqueName(nm, p.id); }
    const old = net.conns.get(cid);
    net.conns.set(cid, conn);
    if (old && old !== conn) { try { old.close(); } catch (err) { /* ignore */ } }
    p.online = true;
    safeSend(conn, { t: 'welcome', you: cid, name: p.name });
    touch();
    return cid;
  }

  function playerGone(cid, conn) {
    if (net.conns.get(cid) !== conn) return;
    net.conns.delete(cid);
    const p = findPlayer(cid);
    if (!p) return;
    if (G.phase === 'lobby') G.players = G.players.filter((x) => x.id !== cid);
    else p.online = false;
    touch();
    autoplay();
  }

  function kick(cid) {
    const c = net.conns.get(cid);
    if (c) { safeSend(c, { t: 'kicked' }); setTimeout(() => { try { c.close(); } catch (err) { /* ignore */ } }, 200); }
    net.conns.delete(cid);
    G.players = G.players.filter((p) => p.id !== cid);
    touch();
  }

  /* ---- Zustand, der an die Geräte geschickt wird -------------------------------- */
  const valueOf = (cardId, statId) => { const c = G.deck && G.deck.map[cardId]; return c ? c.values[statId] : null; };
  const tableCount = () => Object.keys(G.table).reduce((n, k) => n + G.table[k].length, 0);
  const ownedCount = (p) => p.stack.length + (G.table[p.id] ? G.table[p.id].length : 0);

  /** Die Karte, die dieser Spieler gerade sieht (nur seine eigene!). */
  function visibleCardId(p) {
    if (!p) return null;
    if (G.phase === 'choose') return p.stack[0] || null;
    if (G.phase === 'reveal' || G.phase === 'tie' || G.phase === 'result') return p.cur || null;
    return null;
  }

  function publicState(forCid) {
    const inGame = G.phase !== 'lobby';
    const me = findPlayer(forCid);
    return {
      t: 'state', you: forCid, code: net.code, phase: G.phase,
      deckId: inGame && G.cfg ? G.cfg.deck : settings.deck,
      rounds: inGame && G.cfg ? G.cfg.rounds : settings.rounds,
      cardLimit: inGame && G.cfg ? G.cfg.cardLimit : settings.cardLimit,
      round: G.round, activeId: G.activeId, cat: G.cat,
      myCard: visibleCardId(me),
      players: G.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, online: p.online, out: p.out, count: ownedCount(p),
        onTable: !!G.table[p.id], inContest: G.participants.includes(p.id), revealed: p.revealed,
        rev: p.revealed && p.cur && G.cat ? { cardId: p.cur, value: valueOf(p.cur, G.cat) } : null,
      })),
      tieIds: G.tieIds, stechen: G.stechen, tableCount: tableCount(),
      result: G.result, final: G.final,
    };
  }

  function broadcastAll() {
    if (!G) return;
    G.players.forEach((p) => { if (p.id !== 'hub') safeSend(net.conns.get(p.id), publicState(p.id)); });
  }
  /** Nach jeder Änderung: eigenes Gerät sofort, die anderen kurz gebündelt. */
  function touch() {
    if (!G) return;
    persist();
    applyState(publicState('hub'));
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcastAll, 40);
  }
  function clearTimers() { Object.keys(G.timers).forEach((k) => clearTimeout(G.timers[k])); G.timers = {}; }

  /* ---- Spielablauf ------------------------------------------------------------------ */
  function startGame() {
    if (!G || G.phase !== 'lobby') return;
    const deck = getDeck(settings.deck);
    if (!deck || !deck.valid) { toast('Bitte wähle ein gültiges Deck.', 'error'); return; }
    const online = G.players.filter((p) => p.online);
    if (online.length < 2) { toast('Es braucht mindestens 2 Spieler.', 'error'); return; }
    clearTimers();
    G.deck = deck;
    G.cfg = { deck: deck.id, rounds: settings.rounds, cardLimit: settings.cardLimit };
    G.players = online;
    G.players.forEach((p) => { p.st = newPlayerStats(); p.out = false; p.cur = null; p.revealed = false; });
    let ids = shuffle(deck.cards.map((c) => c.id));
    if (settings.cardLimit > 0 && settings.cardLimit < ids.length && settings.cardLimit >= G.players.length * 2) ids = ids.slice(0, settings.cardLimit);
    G.players.forEach((p) => { p.stack = []; });
    ids.forEach((id, i) => G.players[i % G.players.length].stack.push(id));       // reihum austeilen
    G.log = []; G.round = 0; G.final = null; G.result = null; G.table = {}; G.participants = []; G.cat = null;
    G.activeId = G.players[Math.floor(Math.random() * G.players.length)].id;
    G.phase = 'deal';
    touch();
    G.timers.deal = setTimeout(beginRound, DEAL_MS);
  }

  function beginRound() {
    if (!G) return;
    clearTimeout(G.timers.next); clearTimeout(G.timers.resolve);
    G.round++;
    G.cat = null; G.table = {}; G.participants = []; G.tieIds = []; G.stechen = 0; G.result = null;
    G.players.forEach((p) => { p.revealed = false; p.cur = null; });
    G.phase = 'choose';
    touch();
    autoplay();
  }

  function chooseCat(pid, catId) {
    if (!G || G.phase !== 'choose' || pid !== G.activeId) return;
    if (!G.deck.stats.some((s) => s.id === catId)) return;
    G.cat = catId;
    startReveal(G.players.filter((p) => !p.out && p.stack.length > 0).map((p) => p.id));
  }

  /** Jeder Beteiligte legt seine oberste Karte auf den Tisch. */
  function startReveal(ids) {
    ids.forEach((id) => {
      const p = findPlayer(id);
      const card = p.stack.shift();
      (G.table[id] = G.table[id] || []).push(card);
      p.cur = card;
      p.revealed = false;
    });
    G.participants = ids.slice();
    G.tieIds = [];
    G.phase = 'reveal';
    touch();
    autoplay();
  }

  function doReveal(pid) {
    if (!G || G.phase !== 'reveal' || !G.participants.includes(pid)) return;
    const p = findPlayer(pid);
    if (!p || p.revealed) return;
    p.revealed = true;
    touch();
    if (G.participants.every((id) => findPlayer(id).revealed)) {
      clearTimeout(G.timers.resolve);
      G.timers.resolve = setTimeout(resolveRound, REVEAL_DELAY);
    }
  }

  function resolveRound() {
    if (!G || G.phase !== 'reveal') return;
    const stat = statOf(G.deck, G.cat);
    const vals = G.participants.map((id) => ({ id, v: valueOf(findPlayer(id).cur, G.cat) }));
    const best = stat.better === 'low' ? Math.min(...vals.map((x) => x.v)) : Math.max(...vals.map((x) => x.v));
    const winners = vals.filter((x) => x.v === best).map((x) => x.id);
    if (winners.length === 1) { finishRound(winners[0]); return; }
    G.tieIds = winners;
    G.phase = 'tie';
    touch();
    autoplay();
  }

  /** Stechen: nur die Gleichstehenden legen ihre nächste Karte – gleiche Kategorie, Karten bleiben im Topf. */
  function doStechen(pid) {
    if (!G || G.phase !== 'tie' || !G.tieIds.includes(pid)) return;
    const contest = G.tieIds.filter((id) => findPlayer(id).stack.length > 0);
    if (contest.length === 0) { finishRound(G.table[G.activeId] ? G.activeId : G.tieIds[0]); return; }
    if (contest.length === 1) { finishRound(contest[0]); return; }      // die anderen haben keine Karte mehr
    G.stechen++;
    startReveal(contest);
  }

  function finishRound(winnerId) {
    if (!G) return;
    const win = findPlayer(winnerId);
    const pids = Object.keys(G.table);
    const all = [];
    pids.forEach((pid) => all.push(...G.table[pid]));
    const entries = pids.map((pid) => { const p = findPlayer(pid); p.revealed = true; return { id: pid, cardId: p.cur, value: valueOf(p.cur, G.cat) }; });
    const chooser = findPlayer(G.activeId);

    pids.forEach((pid) => {
      const p = findPlayer(pid);
      p.st.rounds++;
      if (pid === winnerId) {
        p.st.wins++; p.st.streak++; p.st.bestStreak = Math.max(p.st.bestStreak, p.st.streak);
        p.st.cardsWon += all.length - G.table[pid].length;
        if (G.stechen > 0) p.st.stechWins++;
        p.st.catWins[G.cat] = (p.st.catWins[G.cat] || 0) + 1;
      } else { p.st.losses++; p.st.streak = 0; }
    });
    if (chooser) { chooser.st.chooseRounds++; if (G.activeId === winnerId) chooser.st.chooseWins++; }
    G.log.push({ round: G.round, active: G.activeId, cat: G.cat, winner: winnerId, card: win.cur, stechen: G.stechen, won: all.length });

    win.stack.push(...shuffle(all));
    G.table = {};
    G.result = { winnerId, cat: G.cat, entries, won: all.length, stechen: G.stechen, cardId: win.cur };
    G.phase = 'result';
    touch();
    G.timers.next = setTimeout(afterResult, RESULT_MS);
  }

  function afterResult() {
    if (!G || G.phase !== 'result') return;
    clearTimeout(G.timers.next);
    G.players.forEach((p) => { p.out = p.stack.length === 0; });
    const alive = G.players.filter((p) => !p.out);
    const limitHit = G.cfg.rounds > 0 && G.round >= G.cfg.rounds;
    if (alive.length <= 1 || limitHit) { endGame(alive.length <= 1 ? 'all' : 'limit'); return; }
    G.activeId = G.result.winnerId;
    beginRound();
  }

  /* ---- Ende: Rangliste, Statistik, Auszeichnungen ----------------------------------- */
  function computeAwards() {
    const ps = G.players, out = [];
    const best = (fn, min) => { let b = null; ps.forEach((p) => { const v = fn(p); if (v >= min && (!b || v > b.v)) b = { p, v }; }); return b; };
    let a = best((p) => p.st.bestStreak, 2);
    if (a) out.push({ icon: 'fa-fire', title: 'Serienkönig', who: a.p.name, color: a.p.color, text: a.v + ' Siege in Folge' });
    a = best((p) => p.st.stechWins, 1);
    if (a) out.push({ icon: 'fa-bolt', title: 'Stechmeister', who: a.p.name, color: a.p.color, text: a.v + (a.v === 1 ? ' Stechen gewonnen' : ' Stechen gewonnen') });
    a = best((p) => p.st.cardsWon, 1);
    if (a) out.push({ icon: 'fa-user-ninja', title: 'Kartenräuber', who: a.p.name, color: a.p.color, text: a.v + ' fremde Karten erobert' });
    a = best((p) => p.st.chooseWins, 1);
    if (a) out.push({ icon: 'fa-chess-knight', title: 'Stratege', who: a.p.name, color: a.p.color, text: a.v + ' von ' + a.p.st.chooseRounds + ' Kategorie-Wahlen gewonnen' });
    a = best((p) => p.st.losses, 1);
    if (a) out.push({ icon: 'fa-cloud-rain', title: 'Pechvogel', who: a.p.name, color: a.p.color, text: a.v + ' Runden verloren' });
    // stärkste Karte
    const cw = {};
    G.log.forEach((e) => { const k = e.card; cw[k] = cw[k] || { n: 0, owner: e.winner }; cw[k].n++; });
    const topCard = Object.keys(cw).sort((x, y) => cw[y].n - cw[x].n)[0];
    if (topCard && cw[topCard].n >= 2) {
      const c = G.deck.map[topCard];
      out.push({ icon: 'fa-crown', title: 'Stärkste Karte', who: c ? c.name : topCard, color: G.deck.color, text: 'gewann ' + cw[topCard].n + ' Runden' });
    }
    // beliebteste Kategorie
    const cc = {};
    G.log.forEach((e) => { cc[e.cat] = (cc[e.cat] || 0) + 1; });
    const topCat = Object.keys(cc).sort((x, y) => cc[y] - cc[x])[0];
    if (topCat) { const st = statOf(G.deck, topCat); out.push({ icon: st ? st.icon : 'fa-star', title: 'Lieblingskategorie', who: st ? st.label : topCat, color: G.deck.color, text: cc[topCat] + '× gespielt' }); }
    return out;
  }

  function endGame(reason) {
    clearTimers();
    const rows = ranking(G.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, count: ownedCount(p),
      wins: p.st.wins, losses: p.st.losses, rounds: p.st.rounds, stechWins: p.st.stechWins, bestStreak: p.st.bestStreak, cardsWon: p.st.cardsWon,
      fav: (() => { const k = Object.keys(p.st.catWins).sort((a, b) => p.st.catWins[b] - p.st.catWins[a])[0]; const s = k && statOf(G.deck, k); return s ? s.label : '–'; })(),
    })), 'count');
    G.final = { reason, rounds: G.round, ranking: rows, awards: computeAwards(), deckName: G.deck.name };
    G.phase = 'final';
    clearSnap();
    touch();
  }

  function backToLobby() {
    clearTimers();
    G.players = G.players.filter((p) => p.id === 'hub' || p.online);
    G.players.forEach((p) => { p.stack = []; p.out = false; p.cur = null; p.revealed = false; p.st = newPlayerStats(); });
    G.phase = 'lobby'; G.cfg = null; G.deck = null; G.round = 0; G.activeId = null; G.cat = null; G.table = {}; G.participants = [];
    G.tieIds = []; G.result = null; G.final = null; G.log = [];
    clearSnap();
    touch();
  }

  /** Offline-Spieler dürfen das Spiel nicht blockieren. */
  function autoplay() {
    if (!G) return;
    clearTimeout(G.timers.auto);
    const off = (id) => { const p = findPlayer(id); return !!p && p.id !== 'hub' && !p.online; };
    if (G.phase === 'choose' && off(G.activeId)) {
      G.timers.auto = setTimeout(() => {
        if (G.phase === 'choose' && off(G.activeId)) chooseCat(G.activeId, G.deck.stats[Math.floor(Math.random() * G.deck.stats.length)].id);
      }, AUTO_CHOOSE_MS);
    } else if (G.phase === 'reveal') {
      G.participants.slice().forEach((id) => { if (off(id)) doReveal(id); });
    } else if (G.phase === 'tie' && !G.tieIds.some((id) => !off(id))) {
      G.timers.auto = setTimeout(() => { if (G.phase === 'tie') doStechen(G.tieIds[0]); }, 3000);
    }
  }

  /* ---- Eingaben der Spieler (auch des Hubs selbst) ----------------------------------- */
  function onClientMsg(cid, msg) {
    if (!G || !msg || typeof msg !== 'object') return;
    if (!findPlayer(cid)) return;
    switch (msg.t) {
      case 'cat': chooseCat(cid, String(msg.catId || '')); break;
      case 'reveal': doReveal(cid); break;
      case 'stechen': doStechen(cid); break;
      case 'next': if (G.phase === 'result' && G.result && G.result.winnerId === cid) afterResult(); break;
      default:
    }
  }

  /* ===========================================================================
     6. MITSPIELER: VERBINDUNG ZUM HUB
     =========================================================================== */
  /** Töne bei Phasenwechseln (nur auf Basis des Vorgängerzustands). */
  function transitionSounds(prev, msg) {
    if (!prev) return;
    if (prev.phase !== 'deal' && msg.phase === 'deal') Sfx.shuffle();
    if (msg.phase === 'choose' && (prev.phase !== 'choose' || prev.round !== msg.round)) { if (msg.activeId === msg.you) Sfx.turn(); else Sfx.flip(); }
    if ((msg.phase === 'reveal' || msg.phase === 'tie') && prev.phase === msg.phase && prev.stechen === msg.stechen
        && msg.players.filter((p) => p.revealed).length > prev.players.filter((p) => p.revealed).length) Sfx.reveal();
    if (msg.phase === 'tie' && prev.phase !== 'tie') Sfx.tie();
    if (msg.phase === 'reveal' && prev.phase === 'tie') Sfx.flip();
    if (msg.phase === 'result' && prev.phase !== 'result') { if (msg.result && msg.result.winnerId === msg.you) Sfx.win(); else Sfx.lose(); }
  }

  /** Neuen Spielzustand übernehmen (Sicht dieses Geräts). */
  function applyState(msg) {
    msg.recvAt = Date.now();
    const prev = S.view;
    try { transitionSounds(prev, msg); } catch (err) { /* Ton ist nie wichtig */ }
    if (!prev || prev.phase !== msg.phase || prev.round !== msg.round) S.pick = null;
    S.view = msg;
    render();
  }

  function onHubMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'state': applyState(msg); break;
      case 'welcome':
        S.net = 'online'; S.netMsg = ''; S.name = msg.name || S.name; S.resuming = false; S.failCount = 0;
        try { localStorage.setItem(KEY_LAST, JSON.stringify({ code: net.code, name: S.name, at: Date.now() })); } catch (err) { /* ignore */ }
        render();
        break;
      case 'reject':
      case 'kicked':
        S.joinError = msg.t === 'kicked' ? 'Du wurdest aus dem Spiel entfernt.' : (msg.reason || 'Beitritt nicht möglich.');
        S.halted = true; S.resuming = false;
        try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
        render();
        break;
      default:
    }
  }

  /** Nachricht an den Hub (beim Hub selbst direkt an die Spiellogik). */
  function send(msg) {
    if (S.role === 'hub') onClientMsg('hub', msg);
    else if (S.conn && S.conn.open) { try { S.conn.send(msg); } catch (err) { /* ignore */ } }
  }

  function joinGame(code, name) {
    S.role = 'client';
    S.name = cleanName(name);
    saveName(S.name);
    net.code = String(code).toLowerCase();
    S.joinError = ''; S.halted = false; S.view = null; S.net = 'connecting';
    clientConnect();
    requestWake();
    render();
  }

  function clientConnect() {
    clearTimeout(S.retry);
    if (S.peer) { const old = S.peer; S.peer = null; S.conn = null; try { old.destroy(); } catch (err) { /* ignore */ } }
    if (S.halted) return;
    const peer = new window.Peer({ debug: 0 });
    S.peer = peer;
    const retry = () => { clearTimeout(S.retry); if (!S.halted) S.retry = setTimeout(clientConnect, 3500); };
    peer.on('open', () => {
      if (S.peer !== peer) return;
      const conn = peer.connect('qt-' + net.code, { reliable: true });
      S.conn = conn;
      conn.on('open', () => { if (S.conn === conn) conn.send({ t: 'join', cid: S.cid, name: S.name }); });
      conn.on('data', (m) => { if (S.conn === conn) onHubMessage(m); });
      conn.on('close', () => {
        if (S.conn !== conn) return;
        S.net = 'offline'; S.netMsg = 'Verbindung getrennt – versuche erneut …';
        render(); retry();
      });
      conn.on('error', () => { /* close folgt */ });
    });
    peer.on('error', (err) => {
      if (S.peer !== peer) return;
      if (S.resuming && err && err.type === 'peer-unavailable' && ++S.failCount >= 4) { abortConnect('Das letzte Spiel wurde nicht gefunden.'); return; }
      S.net = 'offline';
      S.netMsg = err && err.type === 'peer-unavailable' ? 'Spiel nicht gefunden – läuft es noch?' : 'Verbindung getrennt – versuche erneut …';
      render(); retry();
    });
  }

  function leaveGame() {
    try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
    if (S.role === 'hub') clearSnap();
    location.hash = '';
    location.reload();
  }
  /** Verbindungsversuch beenden und zur Startseite (das letzte Spiel bleibt gemerkt). */
  function abortConnect(msg) {
    S.halted = true; S.resuming = false; S.failCount = 0;
    clearTimeout(S.retry);
    if (S.peer) { const old = S.peer; S.peer = null; S.conn = null; try { old.destroy(); } catch (err) { /* ignore */ } }
    S.role = null; S.view = null; S.page = 'landing';
    if (msg) toast(msg, 'error');
    render();
  }

  /* ===========================================================================
     7. OBERFLÄCHE: ROUTER, START, ERSTELLEN, BEITRETEN, LOBBY
     =========================================================================== */
  function renderBanner() {
    const b = $('#net-banner');
    let msg = '';
    if (S.role === 'client' && S.net === 'offline' && !S.halted) msg = S.netMsg || 'Verbindung getrennt – versuche erneut …';
    else if (S.role === 'hub' && net.status === 'error') msg = 'Keine Verbindung zum Vermittlungsserver – neuer Versuch …';
    b.hidden = !msg;
    b.textContent = msg;
  }

  function render() {
    renderBanner();
    if (S.role === 'hub' || S.role === 'client') return renderGame();
    if (S.page === 'create') return show('create', buildCreate);
    if (S.page === 'join') return show('join', buildJoin);
    if (S.page === 'check') return show('check', buildCheck);
    return show('landing', buildLanding);
  }

  function renderGame() {
    if (S.showCheck) return show('check', buildCheck);
    if (S.role === 'client' && S.halted && S.joinError) return show('c-error', buildJoinError);
    const v = S.view;
    if (!v) return show('c-connecting', buildConnecting);
    if (v.phase === 'lobby') return S.role === 'hub' ? show('h-lobby', buildHubLobby) : show('c-lobby', buildClientLobby);
    if (v.phase === 'deal') return show('deal', buildDeal);
    if (v.phase === 'final') return show('final', buildFinal);
    return show('game', buildGame);
  }

  function brandBlock(compact) {
    return h('header', { class: 'brand' + (compact ? ' is-compact' : '') },
      h('span', { class: 'brand-badge' }, ico('fa-clone')),
      h('div', { class: 'brand-text' },
        h('h1', null, 'Quartett'),
        compact ? null : h('p', { class: 'tagline' }, 'Karten ziehen – Werte vergleichen – gewinnen')));
  }

  function segmented(options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'seg-btn', onClick: () => { onChange(o.k); sync(o.k); } }, o.icon ? ico(o.icon) : null, o.label);
      wrap.append(b);
      return { b, k: o.k };
    });
    function sync(v) { btns.forEach(({ b, k }) => { b.classList.toggle('is-on', k === v); b.setAttribute('aria-checked', String(k === v)); }); }
    sync(value);
    wrap.sync = sync;
    return wrap;
  }

  /** QR-Code als SVG (immer dunkel auf weiß). */
  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), quiet = 4;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    const size = n + quiet * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR-Code zum Beitreten"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#1d1a15"/></svg>';
  }
  const joinLink = () => location.href.split('#')[0] + '#join=' + net.code;

  /* ---- Startseite --------------------------------------------------------------- */
  function buildLanding(root) {
    const snap = loadSnap();
    const last = loadLast();
    const cards = [];
    if (DECK_ERRORS.length) {
      cards.push(h('div', { class: 'card warn-card' }, h('h2', { class: 'card-title' }, ico('fa-triangle-exclamation'), 'Decks nicht vollständig geladen'),
        h('ul', { class: 'plain-list' }, DECK_ERRORS.map((e) => h('li', null, e)))));
    }
    if (snap) {
      const deck = getDeck(snap.deckId);
      cards.push(h('div', { class: 'card resume-card' },
        h('h2', { class: 'card-title' }, ico('fa-clock-rotate-left'), 'Spiel fortsetzen'),
        h('p', { class: 'muted' }, (deck ? deck.name : 'Quartett') + ' – Runde ' + snap.round + (snap.cfg && snap.cfg.rounds ? ' von ' + snap.cfg.rounds : '')),
        h('div', { class: 'chips' }, snap.players.map((p) => h('span', { class: 'chip' }, p.name + ' · ' + p.stack.length))),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-link', onClick: () => { clearSnap(); cur.key = null; render(); } }, 'Verwerfen'),
          h('button', { class: 'btn btn-primary', onClick: resumeGame }, ico('fa-play'), 'Fortsetzen'))));
    }
    if (last) {
      cards.push(h('div', { class: 'card resume-card' },
        h('h2', { class: 'card-title' }, ico('fa-rotate-right'), 'Wieder beitreten'),
        h('p', { class: 'muted' }, 'Zuletzt dabei als ', h('b', null, last.name), ' (Code ' + last.code.toUpperCase() + ')'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-link', onClick: () => { try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ } cur.key = null; render(); } }, 'Vergessen'),
          h('button', { class: 'btn btn-primary', onClick: () => { S.resuming = true; S.failCount = 0; joinGame(last.code, last.name); } }, 'Beitreten'))));
    }
    root.append(
      brandBlock(),
      ...cards,
      h('div', { class: 'card start-card' },
        h('p', { class: 'lead' }, 'Das Kartenspiel für den Spieleabend – jeder mit eigenem Gerät, Beitritt per QR-Code.'),
        h('button', { class: 'btn btn-primary btn-big', onClick: () => { S.page = 'create'; render(); } }, ico('fa-plus'), 'Spiel erstellen'),
        h('button', { class: 'btn btn-secondary btn-big', onClick: () => { S.page = 'join'; render(); } }, ico('fa-qrcode'), 'Beitreten'),
        h('button', { class: 'btn btn-link', onClick: () => { S.page = 'check'; render(); } }, ico('fa-list-check'), ' Decks prüfen')),
      h('p', { class: 'foot-note' }, 'Version ' + VERSION + ' · ' + DECKS.length + (DECKS.length === 1 ? ' Deck' : ' Decks')));
  }

  function buildCreate(root) {
    const nameInput = h('input', { class: 'input', type: 'text', maxlength: 16, placeholder: 'Dein Name', autocomplete: 'off', value: getSavedName() });
    const group = loadGroup();
    const groupBox = group ? h('input', { type: 'checkbox', id: 'use-group', checked: true }) : null;
    const groupRow = group ? h('label', { class: 'check-row', for: 'use-group' }, groupBox,
      h('span', null, 'Gleiche Mitspieler wie zuletzt: ', h('b', null, group.players.map((p) => p.name).join(', ')))) : null;
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Spiel erstellen'),
        h('p', { class: 'muted' }, 'Du bist der Gastgeber: Dein Gerät führt das Spiel, spielt aber ganz normal mit. Die anderen treten per QR-Code bei.'),
        h('label', { class: 'field-row' }, h('span', null, 'Dein Name'), nameInput),
        groupRow,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => { S.page = 'landing'; render(); } }, ico('fa-arrow-left'), 'Zurück'),
          h('button', { class: 'btn btn-primary', onClick: () => {
            if (!cleanName(nameInput.value)) { toast('Bitte gib deinen Namen ein.', 'error'); nameInput.focus(); return; }
            createGame(nameInput.value, !!(groupBox && groupBox.checked));
          } }, 'Lobby öffnen', ico('fa-arrow-right')))));
  }

  function buildJoin(root) {
    const m = location.hash.match(/join=([A-Za-z0-9]+)/);
    const lastCode = loadLast() ? loadLast().code.toUpperCase() : '';
    const codeInput = h('input', { class: 'input code-input', type: 'text', maxlength: 6, placeholder: 'Code', autocomplete: 'off', autocapitalize: 'characters', value: m ? m[1].toUpperCase() : lastCode });
    const nameInput = h('input', { class: 'input', type: 'text', maxlength: 16, placeholder: 'Dein Name', autocomplete: 'off', value: getSavedName() });
    const err = h('p', { class: 'form-error', hidden: !S.joinError }, S.joinError);
    const go = () => {
      const code = codeInput.value.trim().toLowerCase();
      const name = cleanName(nameInput.value);
      if (code.length < 4) { toast('Bitte gib den Code ein.', 'error'); codeInput.focus(); return; }
      if (!name) { toast('Bitte gib deinen Namen ein.', 'error'); nameInput.focus(); return; }
      joinGame(code, name);
    };
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Beitreten'),
        h('p', { class: 'muted' }, 'Scanne den QR-Code des Gastgebers oder gib den Code ein.'),
        h('label', { class: 'field-row' }, h('span', null, 'Spiel-Code'), codeInput),
        h('label', { class: 'field-row' }, h('span', null, 'Dein Name'), nameInput),
        err,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => { S.page = 'landing'; S.joinError = ''; render(); } }, ico('fa-arrow-left'), 'Zurück'),
          h('button', { class: 'btn btn-primary', onClick: go }, 'Beitreten', ico('fa-arrow-right')))));
    if (m && !nameInput.value) setTimeout(() => nameInput.focus(), 50);
  }

  function buildConnecting(root) {
    root.append(brandBlock(true), h('div', { class: 'card center' },
      h('p', null, ico('fa-spinner', 'fa-spin'), S.resuming ? ' Verbinde mit deinem letzten Spiel …' : ' Verbinde mit dem Spiel …'),
      h('button', { class: 'btn btn-secondary', onClick: () => abortConnect() }, 'Zur Startseite')));
  }
  function buildJoinError(root) {
    root.append(brandBlock(true), h('div', { class: 'card center' },
      h('p', { class: 'form-error' }, ico('fa-circle-exclamation'), ' ', S.joinError),
      h('button', { class: 'btn btn-primary', onClick: () => { S.role = null; S.view = null; S.halted = false; S.page = 'landing'; S.joinError = ''; render(); } }, 'Zur Startseite')));
  }

  /* ---- Lobby --------------------------------------------------------------------- */
  function playerListItems(v, withKick) {
    return v.players.map((p) => h('li', { class: 'player' + (p.online ? '' : ' is-off') },
      h('i', { class: 'dot', style: 'background:' + p.color }),
      h('span', { class: 'p-name' }, p.name, p.id === v.you ? h('em', null, ' (du)') : null, p.id === 'hub' ? h('small', { class: 'host-tag' }, ' Gastgeber') : null),
      p.online ? ico('fa-wifi', 'p-on') : h('span', { class: 'p-wait', title: 'wartet auf Verbindung' }, ico('fa-hourglass-half'), ' wartet'),
      withKick && p.id !== 'hub' ? h('button', { class: 'icon-btn', title: 'Entfernen', 'aria-label': p.name + ' entfernen', onClick: () => kick(p.id) }, ico('fa-xmark')) : null));
  }
  const limitText = (n) => (n > 0 ? n + ' Runden' : 'bis einer alle Karten hat');
  const cardsText = (n, deck) => (n > 0 && deck ? Math.min(n, deck.cards.length) + ' Karten' : 'alle Karten');

  function buildHubLobby(root) {
    const qrBox = h('div', { class: 'qr-box' });
    const codeEl = h('div', { class: 'join-code' });
    const linkInput = h('input', { class: 'input small', readonly: true, 'aria-label': 'Einladungslink' });
    const statusEl = h('div', { class: 'net-status' });
    const playersEl = h('ul', { class: 'player-list' });
    const hint = h('p', { class: 'muted small-note' });
    const deckGrid = h('div', { class: 'deck-grid' });
    const info = h('p', { class: 'muted small-note' });
    const startBtn = h('button', { class: 'btn btn-primary btn-big', onClick: startGame }, ico('fa-play'), 'Spiel starten');
    const limitSeg = segmented([{ k: 0, label: 'Aus' }, { k: 10, label: '10' }, { k: 20, label: '20' }, { k: 30, label: '30' }, { k: 50, label: '50' }], settings.rounds,
      (k) => { settings.rounds = k; saveSettings(); touch(); });
    const cardSeg = segmented([{ k: 0, label: 'Alle' }, { k: 12, label: '12' }, { k: 16, label: '16' }, { k: 20, label: '20' }, { k: 24, label: '24' }], settings.cardLimit,
      (k) => { settings.cardLimit = k; saveSettings(); touch(); });
    const copyBtn = h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => {
      try { await navigator.clipboard.writeText(joinLink()); toast('Link kopiert.', 'success'); } catch (err) { linkInput.select(); toast('Link markiert – bitte manuell kopieren.'); }
    } }, ico('fa-copy'), 'Link kopieren');

    root.append(
      brandBlock(true),
      h('div', { class: 'lobby-grid' },
        h('div', { class: 'card' },
          h('h2', { class: 'card-title' }, ico('fa-qrcode'), 'Mitspieler einladen'),
          qrBox, codeEl, h('div', { class: 'link-row' }, linkInput, copyBtn), statusEl),
        h('div', { class: 'card' }, h('h2', { class: 'card-title' }, ico('fa-users'), 'Spieler'), playersEl, hint)),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-gear'), 'Einstellungen'),
        h('h3', { class: 'sub-title' }, 'Deck'),
        deckGrid,
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Rundenlimit'), limitSeg),
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Kartenanzahl'), cardSeg),
        info,
        h('button', { class: 'btn btn-link', onClick: () => { S.showCheck = true; render(); } }, ico('fa-list-check'), ' Decks prüfen')),
      h('div', { class: 'btn-col' }, startBtn,
        h('button', { class: 'btn btn-link', onClick: () => { if (confirm('Spiel wirklich beenden?')) leaveGame(); } }, 'Spiel beenden')));

    let qrFor = null;
    return function update() {
      const v = S.view;
      if (!v) return;
      codeEl.textContent = net.code ? net.code.toUpperCase() : '';
      if (net.status === 'ready' && net.code) {
        const link = joinLink();
        if (qrFor !== link) { try { qrBox.innerHTML = qrSvg(link); qrFor = link; } catch (err) { qrBox.textContent = 'QR-Code konnte nicht erstellt werden – nutzt den Code.'; } }
        linkInput.value = link;
        statusEl.className = 'net-status is-ready';
        statusEl.textContent = 'Bereit – wartet auf Mitspieler';
      } else {
        qrFor = null; qrBox.innerHTML = ''; qrBox.append(h('div', { class: 'qr-wait' }, ico('fa-spinner', 'fa-spin'), ' Verbinde …'));
        linkInput.value = '';
        statusEl.className = 'net-status' + (net.status === 'error' ? ' is-error' : '');
        statusEl.textContent = net.status === 'error' ? 'Keine Verbindung zum Vermittlungsserver …' : 'Verbinde …';
      }
      playersEl.innerHTML = '';
      playerListItems(v, true).forEach((i) => playersEl.append(i));

      // Deck-Auswahl
      if (!getDeck(settings.deck) || !getDeck(settings.deck).valid) { const first = DECKS.find((d) => d.valid); settings.deck = first ? first.id : null; saveSettings(); }
      deckGrid.innerHTML = '';
      DECKS.forEach((d) => {
        deckGrid.append(h('button', { type: 'button', class: 'deck-tile' + (settings.deck === d.id ? ' is-on' : '') + (d.valid ? '' : ' is-bad'), style: '--deck:' + d.color, disabled: !d.valid,
          onClick: () => { settings.deck = d.id; saveSettings(); touch(); }, 'aria-pressed': String(settings.deck === d.id) },
          h('span', { class: 'deck-ico' }, ico(d.icon)),
          h('span', { class: 'deck-name' }, d.name),
          h('span', { class: 'deck-meta' }, d.valid ? d.cards.length + ' Karten · ' + d.stats.length + ' Werte' : 'Fehler – siehe „Decks prüfen“')));
      });
      if (!DECKS.length) deckGrid.append(h('p', { class: 'form-error' }, 'Keine Decks gefunden. Siehe decks/decks.js.'));

      const deck = getDeck(settings.deck);
      const online = v.players.filter((p) => p.online).length;
      const total = deck ? (settings.cardLimit > 0 && settings.cardLimit >= Math.max(2, online) * 2 ? Math.min(settings.cardLimit, deck.cards.length) : deck.cards.length) : 0;
      info.textContent = deck ? (total + ' Karten' + (online >= 2 ? ' – bei ' + online + ' Spielern ' + Math.floor(total / online) + (total % online ? '–' + Math.ceil(total / online) : '') + ' pro Person.' : '.')) : '';
      limitSeg.sync(settings.rounds); cardSeg.sync(settings.cardLimit);
      startBtn.disabled = !(deck && deck.valid && online >= 2);
      hint.textContent = online < 2 ? 'Es braucht mindestens 2 Spieler.' + (v.players.length > online ? ' Bekannte Geräte verbinden sich von selbst wieder.' : '') : (v.players.length > online ? 'Wer nicht rechtzeitig da ist, spielt nicht mit.' : '');
    };
  }
  function buildClientLobby(root) {
    const playersEl = h('ul', { class: 'player-list' });
    const sumBox = h('div', { class: 'chips' });
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-circle-check'), 'Du bist dabei!'),
        h('p', { class: 'muted' }, 'Gleich geht’s los – der Gastgeber startet das Spiel.'),
        playersEl),
      h('div', { class: 'card' }, h('h2', { class: 'card-title' }, ico('fa-gear'), 'Einstellungen'), sumBox),
      h('div', { class: 'btn-col' }, h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Spiel verlassen')));
    return function update() {
      const v = S.view;
      if (!v) return;
      playersEl.innerHTML = '';
      playerListItems(v, false).forEach((i) => playersEl.append(i));
      const deck = getDeck(v.deckId);
      sumBox.innerHTML = '';
      sumBox.append(
        h('span', { class: 'chip' }, ico(deck ? deck.icon : 'fa-clone'), deck ? deck.name : 'Deck?'),
        h('span', { class: 'chip' }, ico('fa-flag-checkered'), limitText(v.rounds)),
        h('span', { class: 'chip' }, ico('fa-layer-group'), cardsText(v.cardLimit, deck)));
    };
  }

  function buildDeal(root, ctx) {
    root.append(brandBlock(true), h('div', { class: 'card deal-card center' },
      h('div', { class: 'deal-stack' }, [0, 1, 2, 3, 4].map((i) => h('span', { class: 'deal-card-sheet', style: '--i:' + i }))),
      h('h2', { class: 'card-title center' }, 'Karten werden gemischt …'),
      h('p', { class: 'muted' }, 'Jeder bekommt gleich seinen Stapel.')));
  }

  /* ===========================================================================
     8. OBERFLÄCHE: SPIELBILDSCHIRM
     Links das Bild, rechts die Werte (auf dem Handy untereinander). Unten links der
     Stapel mit der Kartenanzahl. Wer dran ist, wählt eine Kategorie; danach deckt jeder
     per Tipp auf die Kategorie seinen Wert auf.
     =========================================================================== */
  function buildGame(root) {
    const roundEl = h('span', { class: 'chip qt-round' });
    const playersEl = h('div', { class: 'qt-players' });
    const artCol = h('div', { class: 'qt-art-col' });
    const arena = h('div', { class: 'qt-arena' });
    const stats = h('div', { class: 'qt-stats' });
    const stackChip = h('div', { class: 'qt-stack', title: 'Dein Stapel' });
    const center = h('div', { class: 'qt-center' });
    const potChip = h('div', { class: 'qt-pot' });
    const overlayHost = h('div', { class: 'qt-overlay-host' });
    root.append(
      h('div', { class: 'qt-head' }, roundEl, playersEl),
      h('div', { class: 'qt-main' }, artCol, h('div', { class: 'qt-side' }, arena, stats)),
      h('div', { class: 'qt-bar' }, stackChip, center, potChip),
      overlayHost);
    const sigs = {};
    const setIf = (key, sig, fn) => { if (sigs[key] !== sig) { sigs[key] = sig; fn(); } };

    return function update() {
      const v = S.view;
      const deck = v && getDeck(v.deckId);
      if (!v || !deck) return;
      const me = v.players.find((p) => p.id === v.you) || { count: 0, out: true, inContest: false, revealed: false };
      const card = v.myCard ? deck.map[v.myCard] : null;
      const amActive = v.activeId === v.you;
      const active = v.players.find((p) => p.id === v.activeId);
      const stat = v.cat ? statOf(deck, v.cat) : null;
      const canPick = v.phase === 'choose' && amActive && !!card && !me.out;
      const canReveal = v.phase === 'reveal' && me.inContest && !me.revealed && !!card;
      const canStech = v.phase === 'tie' && v.tieIds.includes(v.you);
      document.body.style.setProperty('--deck', deck.color);

      roundEl.textContent = 'Runde ' + v.round + (v.rounds ? ' / ' + v.rounds : '');

      setIf('players', JSON.stringify(v.players.map((p) => [p.id, p.name, p.count, p.out, p.online, p.id === v.activeId])), () => {
        playersEl.innerHTML = '';
        v.players.forEach((p) => playersEl.append(h('div', { class: 'qt-pchip' + (p.id === v.activeId ? ' is-active' : '') + (p.out ? ' is-out' : '') + (p.online ? '' : ' is-off') },
          h('i', { class: 'dot', style: 'background:' + p.color }),
          h('span', { class: 'qt-pname' }, p.name, p.id === v.you ? h('em', null, ' (du)') : null),
          h('span', { class: 'qt-pcount' }, ico('fa-layer-group'), String(p.count)),
          p.id === v.activeId && !p.out ? ico('fa-hand-pointer', 'qt-turn') : null)));
      });

      setIf('art', String(v.myCard) + (me.out ? 'out' : ''), () => {
        artCol.innerHTML = '';
        if (!card) {
          artCol.append(h('div', { class: 'qt-art qt-art-empty' }, ico(me.out ? 'fa-face-sad-tear' : 'fa-clone'), h('p', null, me.out ? 'Du hast keine Karten mehr – du schaust zu.' : 'Keine Karte')));
          return;
        }
        artCol.append(h('div', { class: 'qt-art qt-flip', style: '--deck:' + deck.color },
          cardImg(deck, card, 'qt-img'),
          h('div', { class: 'qt-art-top' }, h('span', { class: 'qt-code' }, card.code), h('span', { class: 'qt-deckname' }, ico(deck.icon), deck.name)),
          h('div', { class: 'qt-art-name' }, card.name)));
      });

      // --- Werte-Liste
      setIf('stats', [v.myCard, v.phase, v.cat, S.pick, canPick, canReveal, canStech, me.revealed, me.out, v.stechen].join('|'), () => {
        stats.innerHTML = '';
        if (!card) { stats.append(h('p', { class: 'muted center qt-nocard' }, me.out ? 'Du bist raus.' : 'Warte auf die nächste Runde …')); return; }
        deck.stats.forEach((st) => {
          const sel = v.cat === st.id;
          const picked = S.pick === st.id;
          const interactive = (canPick) || (canReveal && sel);
          const cls = 'qt-row' + (sel ? ' is-sel' : '') + (picked ? ' is-pick' : '') + (v.cat && !sel ? ' is-dim' : '') + (interactive ? ' is-live' : '')
            + (sel && v.phase === 'tie' ? ' is-tie' : '');
          const extras = [];
          if (sel && v.phase === 'reveal') extras.push(canReveal ? h('span', { class: 'qt-tag qt-tag-go' }, ico('fa-hand-pointer'), 'Tippen zum Aufdecken') : (me.revealed ? h('span', { class: 'qt-tag' }, ico('fa-check'), 'aufgedeckt') : null));
          if (sel && v.phase === 'tie') extras.push(canStech
            ? h('button', { type: 'button', class: 'qt-stech', onClick: (e) => { e.stopPropagation(); send({ t: 'stechen' }); } }, ico('fa-bolt'), 'Stechen')
            : h('span', { class: 'qt-tag' }, ico('fa-bolt'), 'Stechen läuft'));
          const inner = [
            h('span', { class: 'qt-row-ico' }, ico(st.icon)),
            h('span', { class: 'qt-row-label' }, st.label, h('small', null, ico(st.better === 'low' ? 'fa-arrow-down-long' : 'fa-arrow-up-long'), st.better === 'low' ? ' niedriger gewinnt' : ' höher gewinnt')),
            h('span', { class: 'qt-row-val' }, fmtNum(card.values[st.id]), st.unit ? h('small', null, ' ' + st.unit) : null),
            ...extras,
          ];
          if (interactive) {
            stats.append(h('button', { type: 'button', class: cls, onClick: () => {
              if (canPick) { S.pick = st.id; Sfx.pick(); update(); } else { send({ t: 'reveal' }); }
            } }, inner));
          } else stats.append(h('div', { class: cls }, inner));
        });
      });

      // --- Arena: wer hat was aufgedeckt
      const parts = v.players.filter((p) => p.onTable);
      setIf('arena', JSON.stringify([v.phase, v.cat, v.stechen, v.tieIds, v.result && v.result.winnerId, parts.map((p) => [p.id, p.revealed, p.rev, p.inContest])]), () => {
        arena.innerHTML = '';
        arena.hidden = !(stat && parts.length);
        if (!stat || !parts.length) return;
        arena.append(h('div', { class: 'qt-arena-title' }, ico(stat.icon), h('b', null, stat.label), h('small', null, st2(stat)),
          v.stechen ? h('span', { class: 'qt-tag qt-tag-tie' }, ico('fa-bolt'), v.stechen + '. Stechen') : null,
          v.phase === 'tie' ? h('span', { class: 'qt-tag qt-tag-tie' }, 'Gleichstand!') : null));
        const list = h('div', { class: 'qt-chips' });
        parts.forEach((p) => {
          const rc = p.rev ? deck.map[p.rev.cardId] : null;
          const winner = v.phase === 'result' && v.result && v.result.winnerId === p.id;
          const tied = v.phase === 'tie' && v.tieIds.includes(p.id);
          list.append(h('div', { class: 'qt-chip' + (p.rev ? ' is-rev' : '') + (winner ? ' is-win' : '') + (tied ? ' is-tie' : '') + (!p.inContest && v.phase !== 'result' ? ' is-out' : '') },
            h('div', { class: 'qt-chip-name' }, h('i', { class: 'dot', style: 'background:' + p.color }), p.name),
            rc ? h('div', { class: 'qt-chip-card' }, cardImg(deck, rc, 'qt-mini'), h('div', null, h('div', { class: 'qt-chip-cardname' }, rc.name), h('div', { class: 'qt-chip-val' }, fmtNum(p.rev.value), stat.unit ? h('small', null, ' ' + stat.unit) : null)))
              : h('div', { class: 'qt-chip-wait' }, p.inContest || v.phase === 'reveal' ? ico('fa-hourglass-half') : null, p.inContest ? ' überlegt …' : ' raus aus dem Stechen')));
        });
        arena.append(list);
      });

      // --- untere Leiste
      stackChip.innerHTML = '';
      stackChip.append(ico('fa-layer-group'), h('b', null, String(me.count)), h('small', null, me.count === 1 ? 'Karte' : 'Karten'));
      potChip.innerHTML = '';
      potChip.hidden = !(v.tableCount > 0 && v.phase !== 'result');
      if (v.tableCount > 0) potChip.append(ico('fa-clone'), 'Im Spiel: ', h('b', null, String(v.tableCount)));
      center.innerHTML = '';
      const revealedN = v.players.filter((p) => p.inContest && p.revealed).length;
      const partN = v.players.filter((p) => p.inContest).length;
      if (me.out && v.phase !== 'result') center.append(h('span', { class: 'qt-msg' }, 'Du bist raus – du schaust zu.'));
      else if (v.phase === 'choose') {
        if (canPick) {
          const pst = S.pick ? statOf(deck, S.pick) : null;
          if (pst) center.append(h('button', { class: 'btn btn-primary qt-go', onClick: () => { const c = S.pick; send({ t: 'cat', catId: c }); } }, ico('fa-hand-pointer'), '„' + pst.label + '“ spielen'));
          else center.append(h('span', { class: 'qt-msg is-me' }, ico('fa-hand-pointer'), 'Du bist dran – wähle eine Kategorie'));
        } else center.append(h('span', { class: 'qt-msg' }, (active ? active.name : 'Jemand') + ' wählt eine Kategorie …'));
      } else if (v.phase === 'reveal') {
        if (canReveal) center.append(h('span', { class: 'qt-msg is-me' }, ico('fa-hand-pointer'), 'Tippe auf die markierte Kategorie'));
        else if (me.inContest) center.append(h('span', { class: 'qt-msg' }, 'Aufgedeckt – ' + revealedN + ' / ' + partN));
        else center.append(h('span', { class: 'qt-msg' }, 'Stechen läuft – du schaust zu'));
      } else if (v.phase === 'tie') {
        center.append(h('span', { class: 'qt-msg' + (canStech ? ' is-me' : '') }, canStech ? 'Gleichstand! Tippe auf „Stechen“' : 'Gleichstand – die anderen stechen'));
      } else if (v.phase === 'result' && v.result) {
        const w = v.players.find((p) => p.id === v.result.winnerId);
        center.append(h('span', { class: 'qt-msg' }, (w ? w.name : '?') + ' gewinnt die Runde'));
      }

      // --- Ergebnis-Fenster
      setIf('overlay', v.phase === 'result' && v.result ? 'r' + v.round + ':' + v.result.winnerId : '', () => {
        overlayHost.innerHTML = '';
        if (v.phase !== 'result' || !v.result) return;
        const r = v.result;
        const winner = v.players.find((p) => p.id === r.winnerId);
        const rst = statOf(deck, r.cat);
        const iWon = r.winnerId === v.you;
        overlayHost.append(h('div', { class: 'qt-overlay' },
          h('div', { class: 'qt-result' + (iWon ? ' is-me' : '') },
            h('h2', null, iWon ? 'Du gewinnst die Runde!' : (winner ? winner.name : '?') + ' gewinnt die Runde!'),
            h('p', { class: 'muted' }, ico(rst.icon), ' ' + rst.label + ' · ' + r.won + ' Karten für ' + (winner ? winner.name : '?') + (r.stechen ? ' · nach ' + r.stechen + '× Stechen' : '')),
            h('div', { class: 'qt-result-cards' }, r.entries.map((e) => {
              const c = deck.map[e.cardId];
              const pl = v.players.find((p) => p.id === e.id);
              return h('div', { class: 'qt-rc' + (e.id === r.winnerId ? ' is-win' : '') },
                h('div', { class: 'qt-rc-name' }, h('i', { class: 'dot', style: 'background:' + (pl ? pl.color : '#888') }), pl ? pl.name : '?', e.id === r.winnerId ? ico('fa-crown', 'qt-crown') : null),
                c ? cardImg(deck, c, 'qt-rc-img') : null,
                h('div', { class: 'qt-rc-card' }, c ? c.name : ''),
                h('div', { class: 'qt-rc-val' }, fmtNum(e.value), rst.unit ? h('small', null, ' ' + rst.unit) : null));
            })),
            iWon ? h('button', { class: 'btn btn-primary btn-big', onClick: () => send({ t: 'next' }) }, 'Weiter', ico('fa-arrow-right'))
              : h('p', { class: 'muted' }, 'Gleich geht’s weiter …'),
            h('div', { class: 'qt-countdown' }, h('span', { style: 'animation-duration:' + RESULT_MS + 'ms' })))));
      });
    };
  }
  const st2 = (stat) => (stat.better === 'low' ? 'niedriger gewinnt' : 'höher gewinnt');

  /* ===========================================================================
     9. OBERFLÄCHE: SIEGEREHRUNG MIT STATISTIK, DECK-PRÜFUNG
     =========================================================================== */
  function startConfetti(canvas, ctx) {
    const c = canvas.getContext('2d');
    if (!c) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, hh = 0, raf = null, parts = [];
    const colors = COLORS.concat(['#e0a82a', '#f3d887']);
    const resize = () => { w = canvas.width = window.innerWidth; hh = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const burst = (x, y, n) => {
      for (let i = 0; i < (reduced ? n / 4 : n); i++) {
        const a = (-90 + (Math.random() - 0.5) * 140) * Math.PI / 180, s = 8 + Math.random() * 12;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.3, w: 6 + Math.random() * 7, hgt: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: colors[i % colors.length], life: 150 + Math.random() * 60 });
      }
    };
    let n = 0;
    const loop = () => {
      c.clearRect(0, 0, w, hh);
      if (n < 4 && Math.random() < 0.04) { burst(Math.random() * w, hh, 40); n++; }
      parts = parts.filter((p) => p.life-- > 0 && p.y < hh + 40);
      parts.forEach((p) => {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.globalAlpha = Math.min(1, p.life / 30);
        c.fillStyle = p.col; c.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt); c.restore();
      });
      raf = requestAnimationFrame(loop);
    };
    burst(w * 0.2, hh, 70); burst(w * 0.8, hh, 70); burst(w * 0.5, hh, 90);
    loop();
    ctx.cleanup(() => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); });
  }

  function buildFinal(root, ctx) {
    const v = S.view;
    const f = v.final;
    if (!f) { root.append(brandBlock(true), h('div', { class: 'card center' }, ico('fa-spinner', 'fa-spin'), ' Auswertung …')); return; }
    const rows = f.ranking;
    const top = rows.slice(0, 3);
    const order = top.length === 1 ? [0] : top.length === 2 ? [1, 0] : [1, 0, 2];
    const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    const podium = h('div', { class: 'podium' }, order.map((i, k) => {
      const p = top[i];
      return h('div', { class: 'pod rank-' + Math.min(p.rank, 3), style: 'animation-delay:' + (0.3 + k * 0.35) + 's' },
        h('div', { class: 'pod-person' }, h('div', { class: 'pod-medal' }, medal(p.rank)), h('div', { class: 'pod-name' }, p.name), h('div', { class: 'pod-score' }, p.count + (p.count === 1 ? ' Karte' : ' Karten'))),
        h('div', { class: 'pod-block' }, String(p.rank)));
    }));
    const rest = rows.slice(3);
    const winners = rows.filter((r) => r.rank === 1).map((r) => r.name).join(' & ');
    const reason = f.reason === 'all' ? 'Alle Karten gehören ' + winners + '!' : 'Rundenlimit erreicht (' + f.rounds + ' Runden) – ' + winners + ' hat die meisten Karten.';
    root.append(canvas, brandBlock(true),
      h('div', { class: 'card final-card' },
        h('h2', { class: 'card-title center' }, ico('fa-trophy'), 'Siegerehrung'),
        h('p', { class: 'muted center' }, reason),
        podium,
        rest.length ? h('ol', { class: 'rank-list', start: 4 }, rest.map((p) => h('li', { class: 'rank-row' },
          h('span', { class: 'rank-pos' }, p.rank + '.'),
          h('span', { class: 'rank-name' }, h('i', { class: 'dot', style: 'background:' + p.color }), p.name),
          h('span', { class: 'rank-total' }, p.count)))) : null),
      f.awards.length ? h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-award'), 'Auszeichnungen'),
        h('div', { class: 'award-grid' }, f.awards.map((a) => h('div', { class: 'award', style: '--c:' + a.color },
          h('span', { class: 'award-ico' }, ico(a.icon)),
          h('div', { class: 'award-txt' }, h('b', null, a.title), h('span', { class: 'award-who' }, a.who), h('small', null, a.text)))))) : null,
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-chart-simple'), 'Statistik'),
        h('div', { class: 'table-scroll' }, h('table', { class: 'bd' },
          h('thead', null, h('tr', null, ['Spieler', 'Karten', 'Siege', 'Niederl.', 'Stechen', 'Serie', 'Lieblingswert'].map((t, i) => h('th', { class: i === 0 ? 'left' : '' }, t)))),
          h('tbody', null, rows.map((p) => h('tr', null,
            h('th', { class: 'left' }, h('i', { class: 'dot', style: 'background:' + p.color }), ' ' + p.name),
            h('td', { class: 'sum' }, String(p.count)), h('td', null, String(p.wins)), h('td', null, String(p.losses)),
            h('td', null, String(p.stechWins)), h('td', null, String(p.bestStreak)), h('td', null, p.fav))))))),
      S.role === 'hub'
        ? h('div', { class: 'btn-col' },
          h('button', { class: 'btn btn-primary btn-big', onClick: backToLobby }, ico('fa-rotate-right'), 'Neues Spiel mit denselben Spielern'),
          h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Beenden'))
        : h('div', { class: 'btn-col' }, h('p', { class: 'muted center' }, 'Danke fürs Mitspielen!'), h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Spiel verlassen')));
    startConfetti(canvas, ctx);
    setTimeout(() => Sfx.fanfare(), 250);
  }

  /* ---- Deck-Prüfung --------------------------------------------------------------- */
  function previewCard(deck, card) {
    if ($('.modal')) return;
    const close = () => { document.removeEventListener('keydown', onKey); modal.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onClick: (e) => { if (e.target === modal) close(); } },
      h('div', { class: 'modal-card preview-card', style: '--deck:' + deck.color },
        h('div', { class: 'qt-art' }, cardImg(deck, card, 'qt-img'),
          h('div', { class: 'qt-art-top' }, h('span', { class: 'qt-code' }, card.code), h('span', { class: 'qt-deckname' }, ico(deck.icon), deck.name)),
          h('div', { class: 'qt-art-name' }, card.name)),
        h('div', { class: 'qt-stats' }, deck.stats.map((st) => h('div', { class: 'qt-row' },
          h('span', { class: 'qt-row-ico' }, ico(st.icon)), h('span', { class: 'qt-row-label' }, st.label, h('small', null, st2(st))),
          h('span', { class: 'qt-row-val' }, typeof card.values[st.id] === 'number' ? fmtNum(card.values[st.id]) : '–', st.unit ? h('small', null, ' ' + st.unit) : null)))),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', onClick: close }, 'Schließen'))));
    document.addEventListener('keydown', onKey);
    document.body.append(modal);
  }

  function buildCheck(root) {
    const back = () => { S.showCheck = false; S.page = 'landing'; cur.key = null; render(); };
    const decksEl = h('div', { class: 'check-decks' });
    DECKS.forEach((d) => {
      const imgStat = h('span', { class: 'chip' }, ico('fa-image'), 'Bilder: prüfe …');
      const grid = h('div', { class: 'check-grid' });
      let ok = 0, bad = 0, total = 0;
      (d.cards || []).forEach((c) => {
        const status = h('span', { class: 'check-st' }, ico('fa-circle-notch', 'fa-spin'));
        const cell = h('button', { type: 'button', class: 'check-cell', title: c.name, onClick: () => previewCard(d, c) },
          h('span', { class: 'check-thumb' }, cardImg(d, c, 'qt-mini-lg'), status), h('span', { class: 'check-name' }, c.name || '(ohne Namen)'));
        grid.append(cell);
        if (!c.img) { status.innerHTML = ''; status.append(ico('fa-image', 'is-warn')); status.title = 'kein Bild – Platzhalter'; return; }
        total++;
        const im = new Image();
        im.onload = () => { ok++; status.innerHTML = ''; status.append(ico('fa-check', 'is-ok')); imgStat.lastChild.textContent = ''; imgStat.lastChild.textContent = 'Bilder: ' + ok + ' / ' + total + ' ok' + (bad ? ', ' + bad + ' fehlen' : ''); };
        im.onerror = () => { bad++; cell.classList.add('is-bad'); status.innerHTML = ''; status.append(ico('fa-xmark', 'is-bad')); status.title = 'Bild nicht gefunden: ' + c.img; imgStat.lastChild.textContent = 'Bilder: ' + ok + ' / ' + total + ' ok, ' + bad + ' fehlen'; };
        im.src = c.img;
      });
      decksEl.append(h('div', { class: 'card check-deck', style: '--deck:' + d.color },
        h('h2', { class: 'card-title' }, ico(d.icon), d.name, h('span', { class: 'chip ' + (d.valid ? (d.warnings.length ? 'chip-warn' : 'chip-ok') : 'chip-bad') },
          d.valid ? (d.warnings.length ? d.warnings.length + ' Hinweise' : 'in Ordnung') : d.errors.length + ' Fehler')),
        d.note ? h('p', { class: 'muted small-note' }, d.note) : null,
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, ico('fa-clone'), (d.cards ? d.cards.length : 0) + ' Karten'), h('span', { class: 'chip' }, ico('fa-sliders'), (d.stats ? d.stats.length : 0) + ' Werte'), imgStat),
        d.stats ? h('div', { class: 'table-scroll' }, h('table', { class: 'bd' }, h('thead', null, h('tr', null, ['Wert', 'Einheit', 'Gewinnt'].map((t, i) => h('th', { class: i === 0 ? 'left' : '' }, t)))),
          h('tbody', null, d.stats.map((s) => h('tr', null, h('th', { class: 'left' }, ico(s.icon || 'fa-circle'), ' ' + (s.label || s.id)), h('td', null, s.unit || '–'), h('td', null, s.better === 'low' ? 'niedriger' : s.better === 'high' ? 'höher' : '?')))))) : null,
        d.errors.length ? h('div', { class: 'check-msgs is-err' }, h('b', null, 'Fehler'), h('ul', { class: 'plain-list' }, d.errors.map((e) => h('li', null, ico('fa-circle-xmark'), ' ' + e)))) : null,
        d.warnings.length ? h('div', { class: 'check-msgs is-warn' }, h('b', null, 'Hinweise'), h('ul', { class: 'plain-list' }, d.warnings.map((e) => h('li', null, ico('fa-triangle-exclamation'), ' ' + e)))) : null,
        h('h3', { class: 'sub-title' }, 'Karten (antippen für Vorschau)'), grid));
    });
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-list-check'), 'Decks prüfen'),
        h('p', { class: 'muted' }, 'Hier siehst du, ob alle Karten vollständig sind: Pflichtwerte, Bilder und Doppelungen werden kontrolliert.'),
       
        DECK_ERRORS.length ? h('div', { class: 'check-msgs is-err' }, h('ul', { class: 'plain-list' }, DECK_ERRORS.map((e) => h('li', null, ico('fa-circle-xmark'), ' ' + e)))) : null,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-secondary', onClick: back }, ico('fa-arrow-left'), 'Zurück'))),
      decksEl,
      DECKS.length ? null : h('div', { class: 'card center' }, h('p', { class: 'form-error' }, 'Es wurden keine Decks geladen.')));
  }

  /* ===========================================================================
     10. START
     =========================================================================== */
  function boot() {
    initThemeUI();
    applyTheme();
    show('loading', (r) => { r.append(brandBlock(), h('div', { class: 'card center' }, ico('fa-spinner', 'fa-spin'), ' Decks werden geladen …')); });
    loadDecks().then(() => {
      if (!getDeck(settings.deck) || !getDeck(settings.deck).valid) { const first = DECKS.find((d) => d.valid); settings.deck = first ? first.id : null; }
      const m = location.hash.match(/join=([A-Za-z0-9]+)/);
      const last = loadLast();
      cur.key = null;
      if (m) {
        const code = m[1].toLowerCase();
        if (last && last.code === code) { S.resuming = true; joinGame(code, last.name); return; }
        S.page = 'join'; render(); return;
      }
      if (last) { S.resuming = true; joinGame(last.code, last.name); return; }
      S.page = 'landing';
      render();
    });
  }

  window.__qt = { S, get G() { return G; }, net, DECKS, send, boot, validateDeck };
  boot();
})();
