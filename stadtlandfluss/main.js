/**
 * Stadt Land Fluss — Version 1.1
 * ---------------------------------------------------------------------------
 * Aufbau (alles in dieser Datei):
 *   1. Konstanten, Hilfsfunktionen, Einstellungen
 *   2. Zustand & Anzeige-Router (show)
 *   3. Netzwerk: Hub (Spielleiter-Gerät) – Spiel-Logik als Zustandsmaschine
 *   4. Netzwerk: Client (Mitspieler) + gemeinsame Nachrichten
 *   5. Oberfläche: Start, Erstellen, Beitreten, Lobby, Kategorien-Popup
 *   6. Oberfläche: Buchstaben-Würfeln, Spielrunde (Host & Mitspieler)
 *   7. Oberfläche: Auswertung, Ergebnis, Siegerehrung
 *   8. Start
 *
 * Rollen:
 *   - Hub   = das Gerät, das das Spiel erstellt. Es führt die komplette Spiellogik
 *             aus und ist mit allen Mitspielern per WebRTC (PeerJS) verbunden.
 *             "Mit Host": Hub zeigt nur Buchstabe/Zeit/Auswertung (spielt nicht mit).
 *             "Ohne Host": Hub spielt selbst mit (Spieler-ID "hub"), alle bewerten
 *             gemeinsam per Abstimmung auf dem eigenen Handy.
 *   - Client = Mitspieler, der per QR-Code / Code beitritt.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ===========================================================================
     1. KONSTANTEN, HILFSFUNKTIONEN, EINSTELLUNGEN
     =========================================================================== */
  const VERSION = '1.1';
  const KEY_SETTINGS = 'slf.settings.v1';
  const KEY_NAME = 'slf.name.v1';
  const KEY_LAST = 'slf.last.v1';         // Mitspieler: zuletzt besuchtes Spiel {code,name} (Wiederverbinden)
  const KEY_CID = 'slf.cid.v1';           // eigene Geräte-ID (bleibt dauerhaft, damit der Hub das Gerät wiedererkennt)
  const KEY_ROOM = 'slf.room.v1';         // Hub: fester Spiel-Code (QR-Code bleibt gültig)
  const KEY_GROUP = 'slf.group.v1';       // Hub: letzte Gruppe (Geräte + Namen)
  const KEY_SNAP = 'slf.snap.v1';         // Hub: Spielstand zwischen den Runden (übersteht Neuladen)
  const KEY_THEME = 'slf.theme.v1';
  const KEY_PAD = 'slf.pad.v1';           // Zeichenfläche: Größe
  const KEY_PEN = 'slf.pen.v1';           // Zeichenfläche: Stiftdicke

  const POINTS = [0, 5, 10, 20];
  const STOP_SECONDS = 5;                 // Nachlaufzeit nach "Stopp"
  const ROLL_MS = 3400;                   // Dauer der Buchstaben-Animation
  const COLLECT_TIMEOUT = 3500;           // so lange wartet der Hub auf die Antworten
  const MAX_PLAYERS = 12;
  const MAX_IMG_CHARS = 160000;           // Obergrenze pro gezeichneter Antwort
  const LETTERS_BASE = 'ABDEFGHIJKLMNOPRSTUVWZ';
  const LETTERS_HARD = 'CQXY';
  const COLORS = ['#c8482f', '#2f6f8f', '#5a8f3c', '#b8862b', '#7a4f9a', '#c0577a',
                  '#3f8f86', '#8a6a3a', '#4a5fa8', '#a0482a', '#6b8f2f', '#8f3f6f'];

  const PRESET_CATS = [
    { id: 'name',       name: 'Name',          icon: 'fa-user' },
    { id: 'stadt',      name: 'Stadt',         icon: 'fa-city' },
    { id: 'land',       name: 'Land',          icon: 'fa-flag' },
    { id: 'fluss',      name: 'Fluss',         icon: 'fa-water' },
    { id: 'tier',       name: 'Tier',          icon: 'fa-paw' },
    { id: 'beruf',      name: 'Beruf',         icon: 'fa-briefcase' },
    { id: 'pflanze',    name: 'Pflanze',       icon: 'fa-seedling' },
    { id: 'essen',      name: 'Essen',         icon: 'fa-utensils' },
    { id: 'getraenk',   name: 'Getränk',       icon: 'fa-mug-hot' },
    { id: 'marke',      name: 'Marke',         icon: 'fa-tag' },
    { id: 'film',       name: 'Film / Serie',  icon: 'fa-film' },
    { id: 'koerper',    name: 'Körperteil',    icon: 'fa-hand' },
    { id: 'sport',      name: 'Sport',         icon: 'fa-futbol' },
    { id: 'musik',      name: 'Band / Sänger', icon: 'fa-music' },
    { id: 'gegenstand', name: 'Gegenstand',    icon: 'fa-box' },
    { id: 'berg',       name: 'Berg / Gebirge', icon: 'fa-mountain' },
    { id: 'farbe',      name: 'Farbe',         icon: 'fa-palette' },
    { id: 'auto',       name: 'Automarke',     icon: 'fa-car' },
    { id: 'kleidung',   name: 'Kleidung',      icon: 'fa-shirt' },
    { id: 'spiel',      name: 'Spiel',         icon: 'fa-dice' },
  ];
  const PICKER_ICONS = ['fa-star', 'fa-heart', 'fa-gem', 'fa-lightbulb', 'fa-globe', 'fa-book', 'fa-gamepad',
    'fa-microphone', 'fa-tv', 'fa-house', 'fa-plane', 'fa-ice-cream', 'fa-wine-glass', 'fa-cake-candles',
    'fa-bug', 'fa-fish', 'fa-tree', 'fa-child'];

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
  const ico = (name, extra) => h('i', { class: 'fa-solid ' + name + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  /** Großbuchstabe ohne Akzente/Umlaute (Ä->A, ß->S) für den Anfangsbuchstaben-Check. */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim().toUpperCase();
  const startsWithLetter = (txt, letter) => norm(txt).charAt(0) === letter;
  const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16);

  let toastTimer = null;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast is-visible' + (kind ? ' is-' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-visible'), 2600);
  }

  /* ---- Einstellungen (nur auf dem Hub relevant, werden gemerkt) ------------ */
  function defaultSettings() {
    return {
      mode: 'host', rounds: 5, input: 'text', timeLimit: 0, hard: false,
      cats: PRESET_CATS.map((c, i) => ({ id: c.id, name: c.name, icon: c.icon, on: i < 6 })),
    };
  }
  function loadSettings() {
    const d = defaultSettings();
    try {
      const s = JSON.parse(localStorage.getItem(KEY_SETTINGS) || 'null');
      if (s && typeof s === 'object') {
        if (s.mode === 'host' || s.mode === 'nohost') d.mode = s.mode;
        if (Number.isFinite(s.rounds)) d.rounds = clamp(Math.round(s.rounds), 1, 15);
        if (s.input === 'text' || s.input === 'draw') d.input = s.input;
        if ([0, 60, 90, 120, 180].includes(s.timeLimit)) d.timeLimit = s.timeLimit;
        d.hard = !!s.hard;
        if (Array.isArray(s.cats) && s.cats.length) {
          const ok = s.cats.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
          if (ok.length) d.cats = ok.map((c) => ({ id: c.id, name: String(c.name).slice(0, 24), icon: String(c.icon || 'fa-star'), on: !!c.on, custom: !!c.custom }));
        }
      }
    } catch (err) { /* ignore */ }
    return d;
  }
  let settings = loadSettings();
  const saveSettings = () => { try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings)); } catch (err) { /* ignore */ } };

  const getSavedName = () => { try { return localStorage.getItem(KEY_NAME) || ''; } catch (err) { return ''; } };
  const saveName = (n) => { try { localStorage.setItem(KEY_NAME, n); } catch (err) { /* ignore */ } };

  /** Eigene Eingabeart auf diesem Gerät (Tippen / Zeichnen) – wird gemerkt. */
  function pref() {
    try { const p = localStorage.getItem('slf.input.v1'); if (p === 'draw' || p === 'text') return p; } catch (err) { /* ignore */ }
    return settings.input;
  }
  function setPref(p) { try { localStorage.setItem('slf.input.v1', p); } catch (err) { /* ignore */ } }

  /* ===========================================================================
     2. ZUSTAND & ANZEIGE-ROUTER
     =========================================================================== */
  const app = $('#app');

  const S = {
    role: null,          // 'hub' | 'client' | null (Startseite)
    hubPlays: false,     // true = "Ohne Host": das Hub-Gerät spielt selbst mit
    cid: null,           // eigene Spieler-ID ('hub' beim spielenden Hub)
    name: '',
    view: null,          // zuletzt empfangener Spielzustand (Mitspieler-Sicht)
    evalData: null,      // alle Antworten (Abstimmungsrunde ohne Host)
    text: {},            // eigene Texteingaben der laufenden Runde
    draw: {},            // eigene Zeichnungen der laufenden Runde (PNG-Data-URL)
    strokes: {},         // Striche der Zeichnungen (für Rückgängig / Größenwechsel)
    resuming: false, failCount: 0,   // automatisches Wiederbeitreten
    votesSent: false,
    net: 'idle',         // Client: 'connecting' | 'online' | 'offline'
    netMsg: '',
    joinError: '',
    peer: null, conn: null, retry: null, halted: false,
  };
  try {
    S.cid = localStorage.getItem(KEY_CID);
    if (!S.cid) { S.cid = uid(); localStorage.setItem(KEY_CID, S.cid); }
  } catch (err) { S.cid = uid(); }

  let cur = { key: null, update: null, cleanups: [] };

  /**
   * Zeigt einen Bildschirm. Gleicher Schlüssel = nur update() aufrufen (Eingaben bleiben
   * erhalten); neuer Schlüssel = alles neu aufbauen. opts.keep = Scrollposition behalten.
   */
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

  /** Spielzustand aus Sicht des aktuellen Geräts. */
  function currentView() {
    if (S.role === 'hub' && !S.hubPlays) { const v = publicState('host'); v.recvAt = Date.now(); return v; }
    return S.view;
  }

  /** Zeit seit Rundenstart in ms (läuft lokal weiter, solange die Runde läuft). */
  function elapsedOf(v) { return v.running ? v.elapsed + (Date.now() - v.recvAt) : v.elapsed; }
  function timerText(v) {
    const e = elapsedOf(v);
    if (v.timeLimit > 0) return fmtTime(Math.ceil(Math.max(0, v.timeLimit * 1000 - e) / 1000) * 1000);
    return fmtTime(e);
  }
  function timerEl(ctx, cls) {
    const el = h('span', { class: 'timer ' + (cls || '') });
    const tick = () => {
      const v = currentView();
      if (!v) return;
      el.textContent = timerText(v);
      const low = v.timeLimit > 0 && v.running && v.timeLimit * 1000 - elapsedOf(v) <= 10000;
      el.classList.toggle('is-low', !!low);
    };
    tick();
    const id = setInterval(tick, 250);
    ctx.cleanup(() => clearInterval(id));
    return el;
  }
  const stopRemaining = (v) => (v.stop ? Math.max(0, Math.ceil((v.stop.endsIn - (Date.now() - v.recvAt)) / 1000)) : 0);

  /** Rangliste mit Gleichstand (gleiche Punkte = gleicher Platz). */
  function ranking(players, field) {
    const list = players.slice().sort((a, b) => b[field] - a[field]);
    let rank = 0;
    list.forEach((p, i) => { if (i === 0 || p[field] !== list[i - 1][field]) rank = i + 1; p.rank = rank; });
    return list;
  }

  /* ---- Bildschirm wach halten (Hub und Mitspieler) ------------------------- */
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
     2b. TÖNE (Web Audio, ohne Dateien) — immer an
     Würfeln beim Buchstaben, Tick-Tack beim Stopp-Countdown, Fanfare am Ende.
     =========================================================================== */
  const Sfx = (() => {
    let ac = null, master = null, noiseBuf = null;

    function ensure() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ac = new AC();
          master = ac.createGain();
          master.gain.value = 0.9;
          const comp = ac.createDynamicsCompressor();
          master.connect(comp);
          comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') ac.resume();
        return true;
      } catch (err) { ac = null; return false; }
    }

    function tone(freq, t0, dur, o = {}) {
      const { type = 'sawtooth', vol = 0.18, lp = 2400, attack = 0.01, slideTo = null, vib = 0 } = o;
      const osc = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      f.type = 'lowpass'; f.frequency.value = lp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(f); f.connect(g); g.connect(master);
      if (vib) {
        const lfo = ac.createOscillator(), lg = ac.createGain();
        lfo.frequency.value = 5.5; lg.gain.value = vib;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }

    function noise(t0, dur, o = {}) {
      const { type = 'bandpass', freq = 2000, q = 0.8, vol = 0.2, flat = false, dest = null } = o;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t0);
      if (!flat) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(dest || master);
      src.start(t0, Math.random() * 0.9, dur);
    }

    const now = () => ac.currentTime;

    /** Würfel-Klacken (ein Schritt der Buchstaben-Animation). */
    function clack() {
      if (!ensure()) return;
      const t = now(), r = Math.random();
      noise(t, 0.05, { freq: 1500 + r * 1400, q: 1.1, vol: 0.34 });
      tone(150 + r * 70, t, 0.07, { type: 'sine', vol: 0.22, slideTo: 85, attack: 0.003 });
    }
    /** Heller Zwei-Ton-Gong, wenn der Buchstabe feststeht. */
    function ding() {
      if (!ensure()) return;
      const t = now() + 0.02;
      [880, 1318.5].forEach((f, i) => tone(f, t + i * 0.1, 1.0, { type: 'triangle', vol: 0.2, lp: 5000, attack: 0.01 }));
      noise(t, 0.4, { type: 'highpass', freq: 6000, vol: 0.05 });
    }
    /** Tick-Tack: abwechselnd hoch und tief, jede Sekunde des Stopp-Countdowns. */
    function tick(n) {
      if (!ensure()) return;
      const t = now() + 0.005;
      const hi = n % 2 === 1;
      noise(t, 0.035, { type: hi ? 'highpass' : 'bandpass', freq: hi ? 3200 : 1100, q: 1, vol: 0.34 });
      tone(hi ? 1500 : 950, t, 0.06, { type: 'sine', vol: 0.2, attack: 0.002 });
    }
    /** Summer, wenn die Zeit abgelaufen ist. */
    function buzz() {
      if (!ensure()) return;
      const t = now() + 0.005;
      tone(150, t, 0.55, { type: 'sawtooth', vol: 0.22, lp: 700, slideTo: 105 });
      tone(155, t, 0.55, { type: 'square', vol: 0.08, lp: 500, slideTo: 108 });
    }
    function cymbal(t) { noise(t, 1.6, { type: 'highpass', freq: 5500, q: 0.5, vol: 0.22 }); }
    function applause(sec, delay) {
      const t0 = now() + (delay || 0);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.7);
      g.gain.setValueAtTime(0.9, t0 + sec - 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
      g.connect(master);
      noise(t0, sec, { freq: 2800, q: 0.35, vol: 0.1, flat: true, dest: g });
      for (let i = 0, n = Math.floor(sec * 45); i < n; i++) {
        const r = Math.random();
        noise(t0 + Math.random() * (sec - 0.1), 0.03 + r * 0.04, { freq: 900 + r * 3200, q: 1.2, vol: 0.12 + r * 0.2, dest: g });
      }
    }
    /** Fanfare + Applaus für die Siegerehrung. */
    function fanfare() {
      if (!ensure()) return;
      const t = now() + 0.02;
      const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
      [[C5, 0, 0.14], [C5, 0.17, 0.14], [C5, 0.34, 0.14], [E5, 0.55, 0.32], [C5, 0.95, 0.2], [E5, 1.2, 0.2], [G5, 1.5, 0.5], [C6, 2.1, 1.4]]
        .forEach(([f, o, d]) => {
          tone(f, t + o, d + 0.15, { vol: 0.16, lp: 2600, vib: 4 });
          tone(f / 2, t + o, d + 0.15, { vol: 0.1, lp: 1400, vib: 3 });
        });
      [261.63, 329.63, 392, 523.25].forEach((f) => tone(f, t + 2.1, 1.7, { vol: 0.11, lp: 1800, vib: 3 }));
      cymbal(t); cymbal(t + 2.1);
      for (let i = 0; i < 10; i++) tone(1568 + Math.random() * 2200, t + 2.1 + i * 0.07, 0.3, { type: 'sine', vol: 0.05, lp: 9000 });
      applause(5.5, 2.0);
    }

    return { ensure, clack, ding, tick, buzz, fanfare };
  })();

  // Browser erlauben Ton erst nach einer Berührung – die erste Geste schaltet ihn frei.
  ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((evt) =>
    document.addEventListener(evt, () => Sfx.ensure(), { passive: true }));

  /** Tick-Tack nur einmal pro Sekunde und Runde auslösen. */
  let lastTick = '';
  function stopTick(v) {
    const sec = stopRemaining(v);
    const key = v.round + ':' + sec;
    if (key === lastTick) return;
    lastTick = key;
    if (sec > 0) Sfx.tick(sec);
  }

  /* ===========================================================================
     2c. DESIGNS (nur auf diesem Gerät, werden gemerkt)
     =========================================================================== */
  const THEMES = [
    { id: 'paper',    label: 'Papier',    meta: '#c8482f' },
    { id: 'notebook', label: 'Schulheft', meta: '#2b5fa8' },
    { id: 'chalk',    label: 'Tafel',     meta: '#26342d' },
    { id: 'atlas',    label: 'Atlas',     meta: '#1d5a63' },
    { id: 'show',     label: 'Spielshow', meta: '#2a1d6a' },
  ];
  const THEME_FONTS = {
    notebook: 'family=Patrick+Hand&family=Kalam:wght@400;700',
    chalk: 'family=Gloria+Hallelujah&family=Gochi+Hand',
    atlas: 'family=IM+Fell+English+SC&family=IM+Fell+English',
    show: 'family=Fredoka:wght@500;600;700',
  };
  let themeId = 'paper';
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
     3. HUB: SPIELLOGIK (läuft auf dem Gerät, das das Spiel erstellt hat)
     Phasen: lobby -> roll -> play -> stopping -> collect -> eval -> result -> (roll … | final)
     =========================================================================== */
  const net = { peer: null, code: null, conns: new Map(), status: 'idle' };
  let G = null;
  let broadcastTimer = null;

  const safeSend = (conn, obj) => { try { if (conn && conn.open) conn.send(obj); } catch (err) { /* Verbindung weg */ } };
  const cfg = () => G.cfg || settings;
  const findPlayer = (id) => G.players.find((p) => p.id === id);

  function makePlayer(id, name) {
    return {
      id, name, online: true, color: COLORS[0], input: 'text',
      total: 0, roundPts: 0, answers: {}, filled: 0, final: false, votes: null, voted: false,
    };
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

  /* ---- Gruppe, Spiel-Code & Spielstand merken (nur Hub) --------------------- */
  const loadRoom = () => { try { const c = localStorage.getItem(KEY_ROOM); if (/^[a-z0-9]{6}$/.test(c || '')) return c; } catch (err) { /* ignore */ } return null; };
  const saveRoom = (c) => { try { localStorage.setItem(KEY_ROOM, c); } catch (err) { /* ignore */ } };
  function loadGroup() {
    try {
      const g = JSON.parse(localStorage.getItem(KEY_GROUP) || 'null');
      if (g && Array.isArray(g.players) && g.players.length) return g;
    } catch (err) { /* ignore */ }
    return null;
  }
  function loadSnap() {
    try {
      const sn = JSON.parse(localStorage.getItem(KEY_SNAP) || 'null');
      if (sn && Date.now() - sn.at < 12 * 3600 * 1000 && (sn.phase === 'result' || sn.phase === 'final') && sn.round > 0 && sn.cfg) return sn;
    } catch (err) { /* ignore */ }
    return null;
  }
  const clearSnap = () => { try { localStorage.removeItem(KEY_SNAP); } catch (err) { /* ignore */ } };
  function loadLast() {
    try {
      const l = JSON.parse(localStorage.getItem(KEY_LAST) || 'null');
      if (l && typeof l.code === 'string' && Date.now() - (l.at || 0) < 24 * 3600 * 1000) return l;
    } catch (err) { /* ignore */ }
    return null;
  }

  /** Merkt Gruppe (Geräte + Namen) und – zwischen den Runden – den Spielstand. */
  function persist() {
    if (!G) return;
    try {
      const ps = G.players.filter((p) => p.id !== 'hub').map((p) => ({ cid: p.id, name: p.name, color: p.color }));
      if (ps.length) localStorage.setItem(KEY_GROUP, JSON.stringify({ mode: cfg().mode, players: ps, at: Date.now() }));
      if ((G.phase === 'result' || G.phase === 'final') && G.round > 0 && G.cfg) {
        localStorage.setItem(KEY_SNAP, JSON.stringify({
          at: Date.now(), code: net.code, phase: G.phase, round: G.round, used: G.used, letter: G.letter,
          cfg: G.cfg, roundCats: G.roundCats, breakdown: G.breakdown, mode: G.cfg.mode, hubName: S.hubPlays ? S.name : '',
          players: G.players.map((p) => ({ id: p.id, name: p.name, color: p.color, total: p.total, roundPts: p.roundPts, input: p.input })),
        }));
      }
    } catch (err) { /* Speicher voll / gesperrt */ }
  }

  function newCode() {
    const ch = 'abcdefghjkmnpqrstuvwxyz23456789';
    let c = '';
    for (let i = 0; i < 6; i++) c += ch[Math.floor(Math.random() * ch.length)];
    return c;
  }

  /** Erstellt ein neues Spiel auf diesem Gerät. */
  function createGame(mode, hostName, useGroup) {
    settings.mode = mode;
    saveSettings();
    S.role = 'hub';
    S.hubPlays = mode === 'nohost';
    try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
    clearSnap();
    net.code = loadRoom() || newCode();
    saveRoom(net.code);
    G = { phase: 'lobby', round: 0, letter: '', used: [], cfg: null, players: [], roundCats: [], stop: null,
          startedAt: 0, frozen: 0, running: false, evalIndex: 0, hostPoints: {}, breakdown: {}, timers: {} };
    if (S.hubPlays) {
      S.cid = 'hub';
      S.name = cleanName(hostName) || 'Spielleiter';
      saveName(S.name);
      const me = makePlayer('hub', S.name);
      me.color = COLORS[0];
      me.input = pref();
      G.players.push(me);
    }
    const group = useGroup ? loadGroup() : null;
    if (group) {
      // bekannte Geräte: stehen als "wartet" in der Lobby und verbinden sich von selbst wieder
      group.players.slice(0, MAX_PLAYERS - G.players.length).forEach((gp) => {
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

  /** Nach Neuladen: Spiel zwischen zwei Runden fortsetzen (Geräte verbinden sich selbst wieder). */
  function resumeGame() {
    const sn = loadSnap();
    if (!sn) return;
    S.role = 'hub';
    S.hubPlays = sn.mode === 'nohost';
    try { localStorage.removeItem(KEY_LAST); } catch (err) { /* ignore */ }
    G = { phase: sn.phase, round: sn.round, letter: sn.letter || '', used: sn.used || [], cfg: sn.cfg, players: [], roundCats: sn.roundCats || [],
          stop: null, startedAt: 0, frozen: 0, running: false, evalIndex: 0, hostPoints: {}, breakdown: sn.breakdown || {}, timers: {} };
    sn.players.forEach((sp) => {
      const p = makePlayer(sp.id, sp.name);
      p.color = sp.color; p.total = sp.total || 0; p.roundPts = sp.roundPts || 0; p.input = sp.input === 'draw' ? 'draw' : 'text';
      p.online = sp.id === 'hub';
      G.players.push(p);
    });
    if (S.hubPlays) { S.cid = 'hub'; S.name = sn.hubName || getSavedName() || 'Spielleiter'; }
    net.code = sn.code;
    saveRoom(net.code);
    startPeer();
    requestWake();
    touch();
  }

  function startPeer() {
    net.code = net.code || newCode();
    net.status = 'connecting';
    const peer = new window.Peer('slf-' + net.code, { debug: 0 });
    net.peer = peer;
    peer.on('open', () => { if (net.peer === peer) { net.status = 'ready'; net.retry = 0; renderApp(); } });
    peer.on('connection', onConn);
    peer.on('disconnected', () => {
      if (net.peer !== peer || peer.destroyed) return;
      net.status = 'connecting'; renderApp();
      setTimeout(() => { try { if (net.peer === peer) peer.reconnect(); } catch (err) { /* ignore */ } }, 2000);
    });
    peer.on('close', () => {
      if (net.peer !== peer) return;
      net.peer = null; net.status = 'error'; renderApp();
      setTimeout(startPeer, 4000);
    });
    peer.on('error', (err) => {
      if (net.peer !== peer) return;
      if (err && err.type === 'unavailable-id') {
        // Die alte Sitzung hängt noch beim Vermittlungsserver: erst warten (Code bleibt gleich), dann neuer Code.
        net.peer = null;
        try { peer.destroy(); } catch (e) { /* ignore */ }
        net.retry = (net.retry || 0) + 1;
        if (net.retry <= 3) { net.status = 'connecting'; renderApp(); setTimeout(startPeer, 3000); }
        else { net.retry = 0; net.code = newCode(); saveRoom(net.code); setTimeout(startPeer, 200); }
      } else if (err && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
        net.status = 'error'; renderApp();
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
      if (G.players.length >= MAX_PLAYERS) { safeSend(conn, { t: 'reject', reason: 'Das Spiel ist voll.' }); return null; }
      p = makePlayer(cid, uniqueName(cleanName(msg.name) || 'Spieler'));
      p.color = nextColor();
      G.players.push(p);
    }
    p.input = msg.input === 'draw' ? 'draw' : 'text';
    if (G.phase === 'lobby') { const nm = cleanName(msg.name); if (nm && nm.toLowerCase() !== p.name.toLowerCase()) p.name = uniqueName(nm, p.id); }
    const old = net.conns.get(cid);
    net.conns.set(cid, conn);
    if (old && old !== conn) { try { old.close(); } catch (err) { /* ignore */ } }
    p.online = true;
    safeSend(conn, { t: 'welcome', you: cid, name: p.name });
    if (G.phase === 'eval' && cfg().mode === 'nohost') safeSend(conn, evalDataMsg());
    if (G.phase === 'collect' && !p.final) safeSend(conn, { t: 'lock' });
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
    checkProgress();
  }

  function kick(cid) {
    const c = net.conns.get(cid);
    if (c) { safeSend(c, { t: 'kicked' }); setTimeout(() => { try { c.close(); } catch (err) { /* ignore */ } }, 200); }
    net.conns.delete(cid);
    G.players = G.players.filter((p) => p.id !== cid);
    touch();
  }

  /* ---- Zustand, der an die Geräte geschickt wird --------------------------- */
  function publicState(forCid) {
    const inGame = G.phase !== 'lobby';
    const showTotals = G.phase === 'result' || G.phase === 'final' || G.phase === 'lobby';
    return {
      t: 'state', you: forCid, code: net.code, phase: G.phase,
      round: G.round, rounds: cfg().rounds, letter: G.letter, mode: cfg().mode,
      input: cfg().input, timeLimit: cfg().timeLimit, hard: cfg().hard,
      cats: inGame ? G.roundCats : cfg().cats.filter((c) => c.on).map((c) => ({ id: c.id, name: c.name, icon: c.icon })),
      players: G.players.map((p) => ({
        id: p.id, name: p.name, online: p.online, color: p.color, total: p.total,
        round: showTotals ? p.roundPts : 0, filled: p.filled, done: p.final, voted: p.voted,
      })),
      stop: G.stop ? { by: G.stop.by, endsIn: Math.max(0, G.stop.endsAt - Date.now()) } : null,
      running: G.running,
      elapsed: G.running ? Date.now() - G.startedAt : G.frozen,
      evalIndex: G.evalIndex,
      breakdown: G.phase === 'result' || G.phase === 'final' ? G.breakdown : null,
    };
  }

  function broadcastAll() {
    if (!G) return;
    G.players.forEach((p) => {
      if (p.id === 'hub') return;                      // wird direkt in touch() bedient
      safeSend(net.conns.get(p.id), publicState(p.id));
    });
  }

  /** Nach jeder Änderung: Hub-Anzeige sofort, Mitspieler kurz gebündelt. */
  function touch() {
    if (!G) return;
    persist();
    if (S.hubPlays) applyState(publicState('hub'));
    renderApp();
    clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(broadcastAll, 40);
  }
  function renderApp() { render(); }

  /* ---- Spielablauf --------------------------------------------------------- */
  function clearTimers() {
    Object.keys(G.timers).forEach((k) => clearTimeout(G.timers[k]));
    G.timers = {};
  }

  function pickLetter() {
    const pool = (LETTERS_BASE + (cfg().hard ? LETTERS_HARD : '')).split('');
    let free = pool.filter((l) => !G.used.includes(l));
    if (!free.length) { G.used = []; free = pool; }
    const l = free[Math.floor(Math.random() * free.length)];
    G.used.push(l);
    return l;
  }

  function canStart() {
    const cats = settings.cats.filter((c) => c.on).length;
    const need = settings.mode === 'nohost' ? 2 : 1;
    return cats >= 1 && G.players.filter((p) => p.online).length >= need;
  }

  function startGame() {
    if (!G || G.phase !== 'lobby' || !canStart()) return;
    G.cfg = JSON.parse(JSON.stringify(settings));
    G.players = G.players.filter((p) => p.online);          // wer nicht da ist, spielt nicht mit
    G.players.forEach((p) => { p.total = 0; p.roundPts = 0; });
    G.round = 0;
    G.used = [];
    nextRound();
  }

  function nextRound() {
    clearTimers();
    G.round++;
    G.letter = pickLetter();
    G.phase = 'roll';
    G.stop = null;
    G.running = false;
    G.frozen = 0;
    G.roundCats = G.cfg.cats.filter((c) => c.on).map((c) => ({ id: c.id, name: c.name, icon: c.icon }));
    G.players.forEach((p) => { p.answers = {}; p.filled = 0; p.final = false; p.votes = null; p.voted = false; p.roundPts = 0; });
    G.hostPoints = {};
    G.breakdown = {};
    G.evalIndex = 0;
    touch();
    G.timers.roll = setTimeout(() => {
      G.phase = 'play';
      G.startedAt = Date.now();
      G.running = true;
      if (G.cfg.timeLimit > 0) G.timers.limit = setTimeout(() => triggerStop('Zeitlimit'), G.cfg.timeLimit * 1000);
      touch();
    }, ROLL_MS + 300);
  }

  function triggerStop(by) {
    if (!G || G.phase !== 'play') return;
    clearTimeout(G.timers.limit);
    G.phase = 'stopping';
    G.stop = { by, endsAt: Date.now() + STOP_SECONDS * 1000 };
    touch();
    G.timers.stop = setTimeout(doLock, STOP_SECONDS * 1000);
  }

  function doLock() {
    if (!G || G.phase !== 'stopping') return;
    G.phase = 'collect';
    G.running = false;
    G.frozen = Date.now() - G.startedAt;
    G.stop = null;
    if (!S.hubPlays) Sfx.buzz();
    touch();
    G.players.forEach((p) => {
      if (p.id === 'hub') onHubMessage({ t: 'lock' });
      else safeSend(net.conns.get(p.id), { t: 'lock' });
    });
    G.timers.collect = setTimeout(startEval, COLLECT_TIMEOUT);
    checkProgress();
  }

  function checkProgress() {
    if (!G) return;
    if (G.phase === 'collect') {
      if (G.players.filter((p) => p.online).every((p) => p.final)) startEval();
    } else if (G.phase === 'eval' && cfg().mode === 'nohost') {
      if (G.players.filter((p) => p.online).every((p) => p.voted)) finishRound();
    }
  }

  function evalDataMsg() {
    return { t: 'evaldata', round: G.round, players: G.players.map((p) => ({ id: p.id, name: p.name, color: p.color, answers: p.answers })) };
  }

  function startEval() {
    if (!G || G.phase !== 'collect') return;
    clearTimeout(G.timers.collect);
    G.phase = 'eval';
    G.evalIndex = 0;
    G.hostPoints = {};
    if (cfg().mode === 'host') {
      G.roundCats.forEach((c) => {
        G.hostPoints[c.id] = {};
        G.players.forEach((p) => { if (!p.answers[c.id]) G.hostPoints[c.id][p.id] = 0; });   // leer = 0 Punkte
      });
    } else {
      const msg = evalDataMsg();
      G.players.forEach((p) => { if (p.id === 'hub') onHubMessage(msg); else safeSend(net.conns.get(p.id), msg); });
    }
    touch();
    checkProgress();
  }

  function majority(votes) {
    if (!votes.length) return 0;
    const count = {};
    votes.forEach((x) => { count[x] = (count[x] || 0) + 1; });
    let best = null;
    Object.keys(count).map(Number).sort((a, b) => a - b).forEach((k) => { if (best === null || count[k] > count[best]) best = k; });
    return best;   // bei Gleichstand gewinnt der niedrigere Wert
  }

  function finishRound() {
    if (!G || G.phase !== 'eval') return;
    const bd = {};
    G.players.forEach((p) => {
      bd[p.id] = {};
      G.roundCats.forEach((c) => {
        let pts = 0;
        if (cfg().mode === 'host') {
          pts = (G.hostPoints[c.id] || {})[p.id] || 0;
        } else {
          const votes = [];
          G.players.forEach((v) => {
            if (v.id === p.id || !v.votes) return;
            const x = (v.votes[c.id] || {})[p.id];
            if (POINTS.includes(x)) votes.push(x);
          });
          pts = majority(votes);
        }
        bd[p.id][c.id] = pts;
      });
      p.roundPts = Object.keys(bd[p.id]).reduce((s, k) => s + bd[p.id][k], 0);
      p.total += p.roundPts;
    });
    G.breakdown = bd;
    G.phase = 'result';
    touch();
  }

  function hubNext() {
    if (!G || G.phase !== 'result') return;
    if (G.round < G.cfg.rounds) nextRound();
    else { G.phase = 'final'; touch(); }
  }

  function backToLobby() {
    clearTimers();
    G.players = G.players.filter((p) => p.id === 'hub' || p.online);
    G.players.forEach((p) => { p.total = 0; p.roundPts = 0; p.answers = {}; p.final = false; p.votes = null; p.voted = false; });
    G.phase = 'lobby';
    G.cfg = null;
    G.round = 0;
    G.used = [];
    G.letter = '';
    touch();
  }

  /* ---- Eingaben der Mitspieler (und des spielenden Hubs) -------------------- */
  function sanitizeAnswers(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    G.roundCats.forEach((c) => {
      const a = raw[c.id];
      if (!a || typeof a.v !== 'string') return;
      if (a.t === 'text' && a.v.trim()) out[c.id] = { t: 'text', v: a.v.trim().slice(0, 60) };
      else if (a.t === 'img' && a.v.indexOf('data:image/png;base64,') === 0 && a.v.length <= MAX_IMG_CHARS) out[c.id] = { t: 'img', v: a.v };
    });
    return out;
  }
  function sanitizeVotes(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    G.roundCats.forEach((c) => {
      const row = raw[c.id];
      if (!row || typeof row !== 'object') return;
      out[c.id] = {};
      G.players.forEach((p) => { if (POINTS.includes(row[p.id])) out[c.id][p.id] = row[p.id]; });
    });
    return out;
  }

  function onClientMsg(cid, msg) {
    if (!G || !msg || typeof msg !== 'object') return;
    const p = findPlayer(cid);
    if (!p) return;
    switch (msg.t) {
      case 'pref':
        p.input = msg.input === 'draw' ? 'draw' : 'text';
        break;
      case 'ans':
        if (G.phase === 'play' || G.phase === 'stopping') {
          const cat = G.roundCats.find((c) => c.id === msg.catId);
          if (!cat) return;
          const v = String(msg.v || '').slice(0, 60);
          if (v.trim()) p.answers[cat.id] = { t: 'text', v }; else delete p.answers[cat.id];
          p.filled = Object.keys(p.answers).length;
          clearTimeout(broadcastTimer); broadcastTimer = setTimeout(broadcastAll, 300);
          if (S.role === 'hub' && !S.hubPlays) renderApp();
        }
        break;
      case 'filled':
        if (G.phase === 'play' || G.phase === 'stopping') {
          p.filled = clamp(Number(msg.n) || 0, 0, G.roundCats.length);
          clearTimeout(broadcastTimer); broadcastTimer = setTimeout(broadcastAll, 300);
          if (S.role === 'hub' && !S.hubPlays) renderApp();
        }
        break;
      case 'stop':
        if (G.phase === 'play') triggerStop(p.name);
        break;
      case 'final':
        if (G.phase === 'collect' && !p.final) {
          p.answers = sanitizeAnswers(msg.answers);
          p.filled = Object.keys(p.answers).length;
          p.final = true;
          touch();
          checkProgress();
        }
        break;
      case 'votes':
        if (G.phase === 'eval' && cfg().mode === 'nohost' && !p.voted) {
          p.votes = sanitizeVotes(msg.votes);
          p.voted = true;
          touch();
          checkProgress();
        }
        break;
      default:
    }
  }

  /* ===========================================================================
     4. CLIENT: VERBINDUNG ZUM HUB + NACHRICHTEN AN DIE OBERFLÄCHE
     =========================================================================== */
  function resetRoundLocal() {
    S.text = {}; S.draw = {}; S.strokes = {}; S.votesSent = false; S.evalData = null;
  }

  /** Neuen Spielzustand übernehmen (Mitspieler-Sicht). */
  function applyState(msg) {
    msg.recvAt = Date.now();
    const prev = S.view;
    if (msg.phase === 'lobby' || (msg.phase === 'roll' && (!prev || prev.phase !== 'roll' || prev.round !== msg.round))) resetRoundLocal();
    if (msg.phase === 'collect' && (!prev || prev.phase !== 'collect')) Sfx.buzz();
    S.view = msg;
    render();
  }

  /** Nachricht vom Hub (bei einem spielenden Hub: lokal ausgelöst). */
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
      case 'evaldata': S.evalData = msg; render(); break;
      case 'lock': sendFinal(); break;
      default:
    }
  }

  /** Nachricht an den Hub schicken (beim spielenden Hub direkt an die Spiellogik). */
  function send(msg) {
    if (S.role === 'hub') onClientMsg('hub', msg);
    else if (S.conn && S.conn.open) { try { S.conn.send(msg); } catch (err) { /* ignore */ } }
  }

  function joinGame(code, name) {
    S.role = 'client';
    S.name = cleanName(name);
    saveName(S.name);
    net.code = String(code).toLowerCase();
    S.joinError = '';
    S.halted = false;
    S.view = null;
    S.net = 'connecting';
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
      const conn = peer.connect('slf-' + net.code, { reliable: true });
      S.conn = conn;
      conn.on('open', () => { if (S.conn === conn) conn.send({ t: 'join', cid: S.cid, name: S.name, input: pref() }); });
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

  /* ---- eigene Antworten einsammeln (bei "lock" vom Hub) -------------------- */
  function collectAnswers() {
    const out = {};
    const v = S.view;
    if (!v) return out;
    v.cats.forEach((c) => {
      const t = (S.text[c.id] || '').trim();
      const d = S.draw[c.id];
      let a = null;
      if (pref() === 'draw') a = d ? { t: 'img', v: d } : (t ? { t: 'text', v: t } : null);
      else a = t ? { t: 'text', v: t } : (d ? { t: 'img', v: d } : null);
      if (a) out[c.id] = a;
    });
    return out;
  }
  function sendFinal() { send({ t: 'final', answers: collectAnswers() }); }

  /* ===========================================================================
     5. OBERFLÄCHE: ROUTER, START, ERSTELLEN, BEITRETEN, LOBBY, KATEGORIEN
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
    if (S.role === 'hub') return renderHub();
    if (S.role === 'client') return renderClient();
    if (S.page === 'create') return show('create', buildCreate);
    if (S.page === 'join') return show('join', buildJoin);
    return show('landing', buildLanding);
  }

  function renderHub() {
    const v = currentView();
    if (!v) return;
    if (v.phase === 'lobby') return show('h-lobby', buildHubLobby);
    return S.hubPlays ? renderPlayerPhase(v) : renderHostPhase(v);
  }

  function renderClient() {
    if (S.halted && S.joinError) return show('c-error', buildJoinError);
    const v = S.view;
    if (!v) return show('c-connecting', buildConnecting);
    if (v.phase === 'lobby') return show('c-lobby', buildClientLobby);
    return renderPlayerPhase(v);
  }

  function renderHostPhase(v) {
    switch (v.phase) {
      case 'roll': return show('roll:' + v.round, (r, c) => buildRoll(r, c, v));
      case 'play': case 'stopping': case 'collect': return show('h-play:' + v.round, buildHostPlay);
      case 'eval': {
        const cat = v.cats[v.evalIndex];
        const sig = JSON.stringify(G.hostPoints[cat ? cat.id : ''] || {});
        return show('h-eval:' + v.round + ':' + v.evalIndex + ':' + sig, buildHostEval, { keep: true });
      }
      case 'result': return show('result:' + v.round, buildResult);
      case 'final': return show('final', buildFinal);
      default: return undefined;
    }
  }

  function renderPlayerPhase(v) {
    switch (v.phase) {
      case 'roll': return show('roll:' + v.round, (r, c) => buildRoll(r, c, v));
      case 'play': case 'stopping': case 'collect': return show('c-play:' + v.round, buildClientPlay);
      case 'eval':
        if (v.mode === 'host') return show('c-hostwait:' + v.round, buildHostEvalWait);
        if (S.votesSent) return show('c-votewait:' + v.round, buildVoteWait);
        if (!S.evalData || S.evalData.round !== v.round) return show('c-evalload', (r) => { r.append(brandBlock(true), h('div', { class: 'card center' }, ico('fa-spinner', 'fa-spin'), ' Auswertung wird geladen …')); });
        return show('c-eval:' + v.round, buildClientEval);
      case 'result': return show('result:' + v.round, buildResult);
      case 'final': return show('final', buildFinal);
      default: return undefined;
    }
  }

  function brandBlock(compact) {
    return h('header', { class: 'brand' + (compact ? ' is-compact' : '') },
      h('span', { class: 'brand-badge' }, ico('fa-pen-nib')),
      h('div', { class: 'brand-text' },
        h('h1', null, 'Stadt', h('span', { class: 'amp' }, '·'), 'Land', h('span', { class: 'amp' }, '·'), 'Fluss'),
        compact ? null : h('p', { class: 'tagline' }, 'Schnell schreiben – Punkte sammeln')));
  }

  function segmented(options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    const btns = options.map((o) => {
      const b = h('button', { type: 'button', role: 'radio', class: 'seg-btn', onClick: () => { onChange(o.k); sync(o.k); } },
        o.icon ? ico(o.icon) : null, o.label);
      wrap.append(b);
      return { b, k: o.k };
    });
    function sync(v) { btns.forEach(({ b, k }) => { b.classList.toggle('is-on', k === v); b.setAttribute('aria-checked', String(k === v)); }); }
    sync(value);
    wrap.sync = sync;
    return wrap;
  }

  /* ---- Startseite --------------------------------------------------------- */
  function buildLanding(root) {
    const snap = loadSnap();
    const last = loadLast();
    const cards = [];
    if (snap) {
      const names = snap.players.map((p) => p.name);
      cards.push(h('div', { class: 'card resume-card' },
        h('h2', { class: 'card-title' }, ico('fa-clock-rotate-left'), 'Spiel fortsetzen'),
        h('p', { class: 'muted' }, 'Runde ' + snap.round + ' von ' + snap.cfg.rounds + ' – ' + (snap.mode === 'host' ? 'Mit Host' : 'Ohne Host')),
        h('div', { class: 'chips' }, names.map((n) => h('span', { class: 'chip' }, n))),
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
        h('p', { class: 'lead' }, 'Der Klassiker für den Spieleabend – jeder schreibt oder zeichnet am eigenen Handy.'),
        h('button', { class: 'btn btn-primary btn-big', onClick: () => { S.page = 'create'; render(); } }, ico('fa-plus'), 'Spiel erstellen'),
        h('button', { class: 'btn btn-secondary btn-big', onClick: () => { S.page = 'join'; render(); } }, ico('fa-qrcode'), 'Beitreten')),
      h('p', { class: 'foot-note' }, 'Version ' + VERSION));
  }

  function buildCreate(root) {
    let mode = settings.mode;
    const nameInput = h('input', { class: 'input', type: 'text', maxlength: 16, placeholder: 'Dein Name', autocomplete: 'off', value: getSavedName() });
    const nameRow = h('label', { class: 'field-row' }, h('span', null, 'Dein Name (du spielst mit)'), nameInput);
    const optHost = h('button', { type: 'button', class: 'mode-card', onClick: () => pick('host') },
      h('span', { class: 'mode-ico' }, ico('fa-tablet-screen-button')),
      h('span', { class: 'mode-text' }, h('b', null, 'Mit Host'),
        h('small', null, 'Ein Gerät (z. B. Tablet) zeigt Buchstabe und Zeit, startet die Auswertung und vergibt die Punkte. Der Host spielt nicht mit.')));
    const optNo = h('button', { type: 'button', class: 'mode-card', onClick: () => pick('nohost') },
      h('span', { class: 'mode-ico' }, ico('fa-users')),
      h('span', { class: 'mode-text' }, h('b', null, 'Ohne Host'),
        h('small', null, 'Alle spielen am eigenen Handy. Bewertet wird gemeinsam per Abstimmung – die Mehrheit entscheidet.')));
    function pick(m) {
      mode = m;
      optHost.classList.toggle('is-on', m === 'host');
      optNo.classList.toggle('is-on', m === 'nohost');
      nameRow.hidden = m !== 'nohost';
    }
    pick(mode);
    const group = loadGroup();
    const groupBox = group ? h('input', { type: 'checkbox', id: 'use-group', checked: true }) : null;
    const groupRow = group ? h('label', { class: 'check-row', for: 'use-group' }, groupBox,
      h('span', null, 'Gleiche Mitspieler wie zuletzt: ', h('b', null, group.players.map((p) => p.name).join(', ')))) : null;
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, 'Wie wollt ihr spielen?'),
        h('div', { class: 'mode-cards' }, optHost, optNo),
        nameRow,
        groupRow,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn btn-secondary', onClick: () => { S.page = 'landing'; render(); } }, ico('fa-arrow-left'), 'Zurück'),
          h('button', {
            class: 'btn btn-primary',
            onClick: () => {
              if (mode === 'nohost' && !cleanName(nameInput.value)) { toast('Bitte gib deinen Namen ein.', 'error'); nameInput.focus(); return; }
              createGame(mode, nameInput.value, !!(groupBox && groupBox.checked));
            },
          }, 'Lobby öffnen', ico('fa-arrow-right')))));
  }

  function buildJoin(root) {
    const m = location.hash.match(/join=([A-Za-z0-9]+)/);
    const codeInput = h('input', { class: 'input code-input', type: 'text', maxlength: 6, placeholder: 'Code', autocomplete: 'off', autocapitalize: 'characters', value: m ? m[1].toUpperCase() : (loadLast() ? loadLast().code.toUpperCase() : '') });
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
        h('p', { class: 'muted' }, 'Scanne den QR-Code des Spielleiters oder gib den Code ein.'),
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

  /* ---- Lobby --------------------------------------------------------------- */
  function joinLink() { return location.href.split('#')[0] + '#join=' + net.code; }

  function settingsSummary(v) {
    const lim = v.timeLimit ? v.timeLimit + ' s Zeitlimit' : 'Stoppuhr';
    return h('div', { class: 'chips' },
      h('span', { class: 'chip' }, ico(v.mode === 'host' ? 'fa-tablet-screen-button' : 'fa-users'), v.mode === 'host' ? 'Mit Host' : 'Ohne Host'),
      h('span', { class: 'chip' }, ico('fa-flag-checkered'), v.rounds + (v.rounds === 1 ? ' Runde' : ' Runden')),
      h('span', { class: 'chip' }, ico('fa-stopwatch'), lim),
      h('span', { class: 'chip' }, ico(v.input === 'draw' ? 'fa-pencil' : 'fa-keyboard'), v.input === 'draw' ? 'Zeichnen' : 'Tippen'));
  }
  function catChips(cats) {
    return h('div', { class: 'chips' }, cats.map((c) => h('span', { class: 'chip chip-cat' }, ico(c.icon), c.name)));
  }
  function playerListItems(v, withKick) {
    return v.players.map((p) => h('li', { class: 'player' + (p.online ? '' : ' is-off') },
      h('i', { class: 'dot', style: 'background:' + p.color }),
      h('span', { class: 'p-name' }, p.name, p.id === v.you ? h('em', null, ' (du)') : null),
      p.online ? ico('fa-wifi', 'p-on') : (v.phase === 'lobby' ? h('span', { class: 'p-wait', title: 'wartet auf Verbindung' }, ico('fa-hourglass-half'), ' wartet') : ico('fa-circle-xmark', 'p-off')),
      withKick && p.id !== 'hub' ? h('button', { class: 'icon-btn', title: 'Entfernen', 'aria-label': p.name + ' entfernen', onClick: () => kick(p.id) }, ico('fa-xmark')) : null));
  }

  function buildHubLobby(root, ctx) {
    const qrBox = h('div', { class: 'qr-box' });
    const codeEl = h('div', { class: 'join-code' });
    const linkInput = h('input', { class: 'input small', readonly: true, 'aria-label': 'Einladungslink' });
    const statusEl = h('div', { class: 'net-status' });
    const playersEl = h('ul', { class: 'player-list' });
    const hint = h('p', { class: 'muted small-note' });
    const startBtn = h('button', { class: 'btn btn-primary btn-big', onClick: startGame }, ico('fa-play'), 'Spiel starten');
    const roundsVal = h('span', { class: 'step-val' });
    const catBtn = h('button', { class: 'btn btn-secondary btn-wide', onClick: openCategories });
    const inputSeg = segmented([{ k: 'text', label: 'Tippen', icon: 'fa-keyboard' }, { k: 'draw', label: 'Zeichnen', icon: 'fa-pencil' }], settings.input,
      (k) => { settings.input = k; saveSettings(); touch(); });
    const limitSeg = segmented([{ k: 0, label: 'Stoppuhr' }, { k: 60, label: '60 s' }, { k: 90, label: '90 s' }, { k: 120, label: '2 min' }, { k: 180, label: '3 min' }], settings.timeLimit,
      (k) => { settings.timeLimit = k; saveSettings(); touch(); });
    const hardSw = h('input', { type: 'checkbox', id: 'hard-sw', onChange: (e) => { settings.hard = e.target.checked; saveSettings(); touch(); } });
    const stepper = h('div', { class: 'stepper' },
      h('button', { class: 'icon-btn', 'aria-label': 'Weniger Runden', onClick: () => { settings.rounds = clamp(settings.rounds - 1, 1, 15); saveSettings(); touch(); } }, ico('fa-minus')),
      roundsVal,
      h('button', { class: 'icon-btn', 'aria-label': 'Mehr Runden', onClick: () => { settings.rounds = clamp(settings.rounds + 1, 1, 15); saveSettings(); touch(); } }, ico('fa-plus')));

    const copyBtn = h('button', { class: 'btn btn-secondary btn-sm', onClick: async () => {
      try { await navigator.clipboard.writeText(joinLink()); toast('Link kopiert.', 'success'); } catch (err) { linkInput.select(); toast('Link markiert – bitte manuell kopieren.'); }
    } }, ico('fa-copy'), 'Link kopieren');

    root.append(
      brandBlock(true),
      h('div', { class: 'lobby-grid' },
        h('div', { class: 'card' },
          h('h2', { class: 'card-title' }, ico('fa-qrcode'), 'Mitspieler einladen'),
          qrBox, codeEl, h('div', { class: 'link-row' }, linkInput, copyBtn), statusEl),
        h('div', { class: 'card' },
          h('h2', { class: 'card-title' }, ico('fa-users'), 'Spieler'),
          playersEl, hint)),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-gear'), 'Einstellungen ',
          h('span', { class: 'chip' }, ico(settings.mode === 'host' ? 'fa-tablet-screen-button' : 'fa-users'), settings.mode === 'host' ? 'Mit Host' : 'Ohne Host')),
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Runden'), stepper),
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Eingabe (Standard)'), inputSeg),
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Zeit'), limitSeg),
        h('label', { class: 'set-row switch-row', for: 'hard-sw' },
          h('span', { class: 'set-label' }, 'Schwere Buchstaben (C, Q, X, Y)'), hardSw, h('i', { class: 'switch-ui' })),
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Kategorien'), catBtn)),
      h('div', { class: 'btn-col' }, startBtn,
        h('button', { class: 'btn btn-link', onClick: () => { if (confirm('Spiel wirklich beenden?')) leaveGame(); } }, 'Spiel beenden')));

    let qrFor = null;
    return function update() {
      const v = currentView();
      if (!v) return;
      codeEl.textContent = net.code ? net.code.toUpperCase() : '';
      if (net.status === 'ready' && net.code) {
        const link = joinLink();
        if (qrFor !== link) {
          try { qrBox.innerHTML = qrSvg(link); qrFor = link; } catch (err) { qrBox.textContent = 'QR-Code konnte nicht erstellt werden – nutzt den Code.'; }
        }
        linkInput.value = link;
        statusEl.className = 'net-status is-ready';
        statusEl.textContent = 'Bereit – wartet auf Mitspieler';
      } else {
        qrFor = null;
        qrBox.innerHTML = '';
        qrBox.append(h('div', { class: 'qr-wait' }, ico('fa-spinner', 'fa-spin'), ' Verbinde …'));
        linkInput.value = '';
        statusEl.className = 'net-status' + (net.status === 'error' ? ' is-error' : '');
        statusEl.textContent = net.status === 'error' ? 'Keine Verbindung zum Vermittlungsserver …' : 'Verbinde …';
      }
      playersEl.innerHTML = '';
      const items = playerListItems(v, true);
      if (items.length) items.forEach((i) => playersEl.append(i));
      else playersEl.append(h('li', { class: 'player is-empty' }, 'Noch niemand da – lass die anderen den QR-Code scannen.'));
      const need = settings.mode === 'nohost' ? 2 : 1;
      const catCount = settings.cats.filter((c) => c.on).length;
      startBtn.disabled = !canStart();
      const onlineN = G.players.filter((p) => p.online).length;
      hint.textContent = catCount < 1 ? 'Wähle mindestens eine Kategorie.' : (onlineN < need ? 'Es braucht mindestens ' + need + (need === 1 ? ' Mitspieler.' : ' Spieler.') + (G.players.length > onlineN ? ' Bekannte Geräte verbinden sich von selbst wieder.' : '') : (G.players.length > onlineN ? 'Wer nicht rechtzeitig da ist, spielt nicht mit.' : ''));
      roundsVal.textContent = settings.rounds;
      hardSw.checked = settings.hard;
      inputSeg.sync(settings.input);
      limitSeg.sync(settings.timeLimit);
      catBtn.innerHTML = '';
      catBtn.append(ico('fa-list-check'), catCount + ' gewählt – bearbeiten');
    };
  }

  function buildClientLobby(root, ctx) {
    const playersEl = h('ul', { class: 'player-list' });
    const sumBox = h('div');
    const catBox = h('div');
    root.append(
      brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-circle-check'), 'Du bist dabei!'),
        h('p', { class: 'muted' }, 'Gleich geht’s los – der Spielleiter startet das Spiel.'),
        playersEl),
      h('div', { class: 'card' }, h('h2', { class: 'card-title' }, ico('fa-gear'), 'Einstellungen'), sumBox, h('h3', { class: 'sub-title' }, 'Kategorien'), catBox,
        h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, 'Meine Eingabe'),
          segmented([{ k: 'text', label: 'Tippen', icon: 'fa-keyboard' }, { k: 'draw', label: 'Zeichnen', icon: 'fa-pencil' }], pref(),
            (k) => { setPref(k); send({ t: 'pref', input: k }); }))),
      h('div', { class: 'btn-col' }, h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Spiel verlassen')));
    return function update() {
      const v = S.view;
      if (!v) return;
      playersEl.innerHTML = '';
      playerListItems(v, false).forEach((i) => playersEl.append(i));
      sumBox.innerHTML = '';
      sumBox.append(settingsSummary(v));
      catBox.innerHTML = '';
      catBox.append(catChips(v.cats));
    };
  }

  /* ---- Kategorien-Popup (nur Hub) ----------------------------------------- */
  function openCategories() {
    if ($('.modal')) return;
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kategorien' });
    const count = h('span', { class: 'chip' });
    const grid = h('div', { class: 'cat-grid' });
    let pickedIcon = PICKER_ICONS[0];
    const nameInput = h('input', { class: 'input', type: 'text', maxlength: 24, placeholder: 'Neue Kategorie, z. B. „Süßigkeit“', autocomplete: 'off' });
    const iconRow = h('div', { class: 'icon-picker' });
    PICKER_ICONS.forEach((ic) => {
      const b = h('button', { type: 'button', class: 'icon-btn pick' + (ic === pickedIcon ? ' is-on' : ''), 'aria-label': 'Symbol ' + ic, onClick: () => {
        pickedIcon = ic; iconRow.querySelectorAll('.pick').forEach((x) => x.classList.remove('is-on')); b.classList.add('is-on');
      } }, ico(ic));
      iconRow.append(b);
    });
    function paint() {
      grid.innerHTML = '';
      settings.cats.forEach((c) => {
        const tile = h('button', { type: 'button', class: 'cat-tile' + (c.on ? ' is-on' : ''), 'aria-pressed': String(c.on), onClick: () => { c.on = !c.on; saveSettings(); paint(); touch(); } },
          h('span', { class: 'cat-check' }, c.on ? ico('fa-check') : null),
          h('span', { class: 'cat-ico' }, ico(c.icon)),
          h('span', { class: 'cat-name' }, c.name));
        if (c.custom) {
          tile.append(h('span', { class: 'cat-del', role: 'button', title: 'Löschen', 'aria-label': c.name + ' löschen', onClick: (e) => {
            e.stopPropagation(); settings.cats = settings.cats.filter((x) => x !== c); saveSettings(); paint(); touch();
          } }, ico('fa-trash')));
        }
        grid.append(tile);
      });
      const n = settings.cats.filter((c) => c.on).length;
      count.textContent = n + ' gewählt';
    }
    function add() {
      const name = nameInput.value.replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!name) { nameInput.focus(); return; }
      if (settings.cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast('Die Kategorie gibt es schon.', 'error'); return; }
      settings.cats.push({ id: 'c-' + uid(), name, icon: pickedIcon, on: true, custom: true });
      nameInput.value = '';
      saveSettings(); paint(); touch();
      grid.scrollTop = grid.scrollHeight;
    }
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const close = () => { document.removeEventListener('keydown', onKey); modal.remove(); touch(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.append(h('div', { class: 'modal-card cat-card' },
      h('div', { class: 'modal-head' }, h('h2', null, ico('fa-list-check'), 'Kategorien'), count,
        h('button', { class: 'icon-btn', 'aria-label': 'Schließen', onClick: close }, ico('fa-xmark'))),
      h('p', { class: 'muted small-note' }, 'Tippe auf eine Kategorie, um sie für die Runden an- oder abzuwählen.'),
      grid,
      h('div', { class: 'cat-add' },
        h('h3', { class: 'sub-title' }, 'Neue Kategorie hinzufügen'),
        iconRow,
        h('div', { class: 'add-row' }, nameInput, h('button', { class: 'btn btn-primary', onClick: add }, ico('fa-plus'), 'Hinzufügen'))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-primary', onClick: close }, 'Fertig'))));
    document.body.append(modal);
    paint();
  }

  /** QR-Code als SVG (immer dunkel auf weiß). */
  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
    const size = n + quiet * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR-Code zum Beitreten"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#1d1a15"/></svg>';
  }

  /* ===========================================================================
     6. OBERFLÄCHE: BUCHSTABEN-WÜRFELN, SPIELRUNDE
     =========================================================================== */
  function buildRoll(root, ctx, v) {
    const slot = h('div', { class: 'roll-letter' }, '?');
    root.append(brandBlock(true), h('div', { class: 'card roll-card' },
      h('p', { class: 'roll-title' }, 'Runde ' + v.round + ' von ' + v.rounds),
      h('p', { class: 'roll-sub' }, 'Der Buchstabe ist …'), slot));
    const letters = (LETTERS_BASE + LETTERS_HARD).split('');
    const steps = 26;
    let i = 0, t = null;
    const tick = () => {
      if (i >= steps) { slot.textContent = v.letter; slot.classList.remove('is-spin'); slot.classList.add('is-final'); Sfx.ding(); return; }
      slot.textContent = letters[Math.floor(Math.random() * letters.length)];
      slot.classList.add('is-spin');
      Sfx.clack();
      i++;
      t = setTimeout(tick, 45 + i * i * 0.35);
    };
    tick();
    ctx.cleanup(() => clearTimeout(t));
  }

  /* ---- Host-Ansicht während der Runde ------------------------------------- */
  function buildHostPlay(root, ctx) {
    const roundPill = h('span', { class: 'chip' });
    const letter = h('div', { class: 'big-letter' });
    const timer = timerEl(ctx, 'timer-xl');
    const stateLine = h('p', { class: 'state-line' });
    const grid = h('div', { class: 'prog-grid' });
    const stopBtn = h('button', { class: 'btn btn-stop', onClick: () => triggerStop('Host') }, ico('fa-hand'), 'Stopp');
    const soBig = h('div', { class: 'so-big' });
    const soBy = h('div', { class: 'so-by' });
    const overlay = h('div', { class: 'stop-overlay', hidden: true }, soBig, soBy);
    root.append(brandBlock(true),
      h('div', { class: 'card play-host' },
        h('div', { class: 'ph-top' }, roundPill, timer),
        letter, stateLine),
      h('div', { class: 'card' }, h('h2', { class: 'card-title' }, ico('fa-users'), 'Fortschritt'), grid),
      h('div', { class: 'btn-col' }, stopBtn),
      overlay);

    function update() {
      const v = currentView();
      if (!v) return;
      roundPill.textContent = 'Runde ' + v.round + ' / ' + v.rounds;
      letter.textContent = v.letter;
      stopBtn.disabled = v.phase !== 'play';
      stateLine.textContent = v.phase === 'play' ? 'Es wird geschrieben …'
        : v.phase === 'stopping' ? 'Stopp! Noch kurz Zeit zum Fertigschreiben …' : 'Antworten werden eingesammelt …';
      grid.innerHTML = '';
      v.players.forEach((p) => {
        const pct = v.cats.length ? Math.round((p.filled / v.cats.length) * 100) : 0;
        grid.append(h('div', { class: 'prog' + (p.online ? '' : ' is-off') + (p.done ? ' is-done' : '') },
          h('div', { class: 'prog-name' }, h('i', { class: 'dot', style: 'background:' + p.color }), p.name,
            p.done ? ico('fa-circle-check', 'p-on') : (!p.online ? ico('fa-circle-xmark', 'p-off') : null)),
          h('div', { class: 'bar' }, h('span', { style: 'width:' + pct + '%;background:' + p.color })),
          h('div', { class: 'prog-n' }, p.filled + ' / ' + v.cats.length)));
      });
      const stopping = v.phase === 'stopping' && v.stop;
      overlay.hidden = !stopping;
      if (stopping) { soBig.textContent = stopRemaining(v); soBy.textContent = v.stop.by + ' hat Stopp gedrückt!'; stopTick(v); }
    }
    const id = setInterval(update, 250);
    ctx.cleanup(() => clearInterval(id));
    update();
    return update;
  }

  /* ---- Mitspieler-Ansicht während der Runde ------------------------------- */
  // Zeichenfläche: feste logische Breite (360), Höhe nach Wunsch. Striche werden als
  // Vektoren gemerkt – dadurch geht Rückgängig und die Größe lässt sich jederzeit ändern.
  const PAD_W = 360;
  const PAD_H = { M: 100, L: 170, XL: 250 };
  const PEN_W = { s: 2.4, m: 4, l: 7 };
  const getPadSize = () => { try { const v = localStorage.getItem(KEY_PAD); if (PAD_H[v]) return v; } catch (err) { /* ignore */ } return 'L'; };
  const setPadSize = (v) => { try { localStorage.setItem(KEY_PAD, v); } catch (err) { /* ignore */ } };
  const getPen = () => { try { const v = localStorage.getItem(KEY_PEN); if (PEN_W[v]) return v; } catch (err) { /* ignore */ } return 'm'; };
  const setPen = (v) => { try { localStorage.setItem(KEY_PEN, v); } catch (err) { /* ignore */ } };

  function localFilled(v) {
    return v.cats.filter((c) => (S.text[c.id] || '').trim() || S.draw[c.id]).length;
  }

  function styleStroke(c, w) { c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#27231d'; }
  function drawStroke(c, st) {
    if (!st.pts.length) return;
    styleStroke(c, st.w);
    c.beginPath();
    c.moveTo(st.pts[0][0], st.pts[0][1]);
    if (st.pts.length === 1) c.lineTo(st.pts[0][0] + 0.01, st.pts[0][1] + 0.01);
    for (let i = 1; i < st.pts.length; i++) c.lineTo(st.pts[i][0], st.pts[i][1]);
    c.stroke();
  }
  /** Striche -> kleines PNG (transparent), das an den Hub geschickt wird. */
  function exportStrokes(strokes, H) {
    if (!strokes.length) return null;
    const tmp = document.createElement('canvas');
    tmp.width = PAD_W; tmp.height = H;
    const c = tmp.getContext('2d');
    if (!c) return null;
    strokes.forEach((st) => drawStroke(c, st));
    return tmp.toDataURL('image/png');
  }

  function drawPad(cat, v) {
    const H = PAD_H[getPadSize()];
    const strokes = S.strokes[cat.id] || (S.strokes[cat.id] = []);
    const cv = h('canvas', { class: 'pad', style: 'aspect-ratio:' + PAD_W + '/' + H, 'aria-label': 'Zeichenfläche ' + cat.name });
    let c2 = null, down = false, cur = null;
    function redraw() {
      if (!c2) return;
      c2.clearRect(0, 0, PAD_W, H);
      strokes.forEach((st) => drawStroke(c2, st));
    }
    function setup() {
      const r = cv.getBoundingClientRect();
      const cssW = Math.max(200, Math.round(r.width) || PAD_W);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round((cssW * dpr * H) / PAD_W);
      c2 = cv.getContext('2d');
      if (!c2) return;
      const k = cv.width / PAD_W;
      c2.setTransform(k, 0, 0, k, 0, 0);
      redraw();
    }
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * (PAD_W / (r.width || PAD_W)), (e.clientY - r.top) * (H / (r.height || H))];
    };
    const commit = () => {
      const url = exportStrokes(strokes, H);
      if (url) S.draw[cat.id] = url; else delete S.draw[cat.id];
      send({ t: 'filled', n: localFilled(v) });
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!c2) setup();
      if (!c2) return;
      down = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      cur = { w: PEN_W[getPen()], pts: [pos(e)] };
      strokes.push(cur);
      drawStroke(c2, cur);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!down || !c2 || !cur) return;
      const p = pos(e);
      const prev = cur.pts[cur.pts.length - 1];
      cur.pts.push(p);
      styleStroke(c2, cur.w);
      c2.beginPath(); c2.moveTo(prev[0], prev[1]); c2.lineTo(p[0], p[1]); c2.stroke();
      e.preventDefault();
    });
    const up = () => { if (!down) return; down = false; cur = null; commit(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    const undo = h('button', { type: 'button', class: 'icon-btn pad-btn', title: 'Rückgängig', 'aria-label': cat.name + ': letzten Strich zurücknehmen', onClick: () => { strokes.pop(); redraw(); commit(); } }, ico('fa-rotate-left'));
    const clear = h('button', { type: 'button', class: 'icon-btn pad-btn', title: 'Alles löschen', 'aria-label': cat.name + ' löschen', onClick: () => { strokes.length = 0; redraw(); commit(); } }, ico('fa-eraser'));
    requestAnimationFrame(setup);
    return h('div', { class: 'pad-wrap' }, cv, h('div', { class: 'pad-btns' }, undo, clear));
  }

  function buildClientPlay(root, ctx) {
    const v0 = S.view;
    const banner = h('div', { class: 'stop-banner', hidden: true });
    const lockBox = h('div', { class: 'lock-box', hidden: true }, ico('fa-hourglass-half'), ' Zeit ist um – deine Antworten werden abgegeben …');
    const list = h('div', { class: 'field-list' });
    const timer = timerEl(ctx, 'timer-sm');
    const seg = segmented([{ k: 'text', label: 'Tippen', icon: 'fa-keyboard' }, { k: 'draw', label: 'Zeichnen', icon: 'fa-pencil' }], pref(),
      (k) => { setPref(k); send({ t: 'pref', input: k }); fill(); });
    const tools = h('div', { class: 'draw-tools' },
      h('div', { class: 'tool-row' }, h('span', { class: 'tool-label' }, ico('fa-pen'), 'Stift'),
        segmented([{ k: 's', label: 'Dünn' }, { k: 'm', label: 'Mittel' }, { k: 'l', label: 'Dick' }], getPen(), (k) => setPen(k))),
      h('div', { class: 'tool-row' }, h('span', { class: 'tool-label' }, ico('fa-expand'), 'Fläche'),
        segmented([{ k: 'M', label: 'Klein' }, { k: 'L', label: 'Groß' }, { k: 'XL', label: 'Riesig' }], getPadSize(), (k) => { setPadSize(k); fill(); })));
    const stopBtn = h('button', { class: 'btn btn-stop btn-big', onClick: () => send({ t: 'stop' }) }, ico('fa-hand'), 'STOPP');
    const timers = {};

    function textField(cat) {
      const input = h('input', { class: 'input field-input', type: 'text', maxlength: 40, autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next',
        placeholder: v0.letter + ' …', value: S.text[cat.id] || '', 'aria-label': cat.name });
      const warn = h('span', { class: 'field-warn', hidden: true, title: 'Beginnt nicht mit ' + v0.letter }, ico('fa-triangle-exclamation'));
      const check = () => { const val = input.value.trim(); warn.hidden = !val || startsWithLetter(val, v0.letter); };
      input.addEventListener('input', () => {
        S.text[cat.id] = input.value;
        check();
        clearTimeout(timers[cat.id]);
        timers[cat.id] = setTimeout(() => send({ t: 'ans', catId: cat.id, v: input.value }), 350);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const all = Array.from(list.querySelectorAll('.field-input'));
        const nxt = all[all.indexOf(input) + 1];
        if (nxt) nxt.focus(); else input.blur();
      });
      check();
      return h('div', { class: 'input-wrap' }, input, warn);
    }

    function fill() {
      tools.hidden = pref() !== 'draw';
      list.innerHTML = '';
      v0.cats.forEach((cat) => {
        list.append(h('div', { class: 'field' },
          h('div', { class: 'field-label' }, ico(cat.icon), cat.name),
          pref() === 'draw' ? drawPad(cat, v0) : textField(cat)));
      });
    }
    ctx.cleanup(() => Object.keys(timers).forEach((k) => clearTimeout(timers[k])));

    root.append(
      h('div', { class: 'play-top' },
        h('div', { class: 'letter-badge', 'aria-label': 'Gesuchter Buchstabe' }, v0.letter),
        h('div', { class: 'play-meta' }, h('span', { class: 'chip' }, 'Runde ' + v0.round + ' / ' + v0.rounds), timer),
        seg),
      banner, lockBox, tools, list,
      h('div', { class: 'stop-bar' }, stopBtn));
    fill();

    function update() {
      const v = S.view;
      if (!v) return;
      const stopping = v.phase === 'stopping' && v.stop;
      banner.hidden = !stopping;
      if (stopping) { banner.textContent = v.stop.by + ' hat STOPP gedrückt – noch ' + stopRemaining(v) + ' s!'; stopTick(v); }
      const locked = v.phase === 'collect';
      lockBox.hidden = !locked;
      list.classList.toggle('is-locked', locked);
      list.querySelectorAll('input').forEach((i) => { i.disabled = locked; });
      stopBtn.disabled = v.phase !== 'play';
    }
    const id = setInterval(update, 250);
    ctx.cleanup(() => clearInterval(id));
    update();
    return update;
  }

  /* ===========================================================================
     7. OBERFLÄCHE: AUSWERTUNG, ERGEBNIS, SIEGEREHRUNG
     =========================================================================== */
  function answerView(a, letter) {
    if (!a) return h('div', { class: 'ans ans-empty' }, '—');
    if (a.t === 'img') return h('div', { class: 'ans' }, h('img', { class: 'ans-img', src: a.v, alt: 'Gezeichnete Antwort' }));
    const bad = !startsWithLetter(a.v, letter);
    return h('div', { class: 'ans' }, h('span', { class: 'ans-text' }, a.v),
      bad ? h('span', { class: 'bad-letter', title: 'Beginnt nicht mit ' + letter }, ico('fa-triangle-exclamation'), ' ' + letter + '?') : null);
  }

  /** Gemeinsames Bewertungsbrett: Thema oben, Antworten nebeneinander, darunter 0/5/10/20. */
  function evalBoard(o) {
    return h('div', { class: 'eval' },
      h('div', { class: 'eval-head' },
        h('div', { class: 'eval-topic' }, ico(o.cat.icon), h('span', null, o.cat.name)),
        h('div', { class: 'eval-meta' }, 'Kategorie ' + (o.idx + 1) + ' / ' + o.total + ' · Buchstabe ', h('b', null, o.letter))),
      o.note ? h('p', { class: 'muted center' }, o.note) : null,
      h('div', { class: 'eval-grid' }, o.cards.map((c) => h('div', { class: 'ecard' },
        h('div', { class: 'ecard-name' }, h('i', { class: 'dot', style: 'background:' + c.color }), c.name),
        answerView(c.answer, o.letter),
        h('div', { class: 'pts', role: 'group', 'aria-label': 'Punkte für ' + c.name },
          POINTS.map((pt) => h('button', { type: 'button', class: 'pt' + (o.sel[c.id] === pt ? ' is-on' : ''), onClick: () => o.onPick(c.id, pt) }, String(pt))))))),
      h('div', { class: 'eval-nav' },
        h('button', { class: 'btn btn-secondary', disabled: o.idx === 0, onClick: o.onPrev }, ico('fa-arrow-left'), 'Zurück'),
        h('button', { class: 'btn btn-primary', disabled: !o.canNext, onClick: o.onNext }, o.nextLabel, ico(o.last ? 'fa-flag-checkered' : 'fa-arrow-right'))));
  }

  /* ---- Host: Punkte vergeben ---------------------------------------------- */
  function buildHostEval(root) {
    const idx = G.evalIndex;
    const cat = G.roundCats[idx];
    const sel = G.hostPoints[cat.id] || (G.hostPoints[cat.id] = {});
    const last = idx === G.roundCats.length - 1;
    root.append(evalBoard({
      cat, idx, total: G.roundCats.length, letter: G.letter, last,
      cards: G.players.map((p) => ({ id: p.id, name: p.name, color: p.color, answer: p.answers[cat.id] || null })),
      sel,
      canNext: G.players.every((p) => sel[p.id] !== undefined),
      nextLabel: last ? 'Auswertung beenden' : 'Weiter',
      onPick: (pid, pt) => { sel[pid] = pt; touch(); },
      onPrev: () => { G.evalIndex = Math.max(0, G.evalIndex - 1); touch(); },
      onNext: () => { if (last) finishRound(); else { G.evalIndex++; touch(); } },
    }));
  }

  /* Mitspieler im Host-Modus: warten, bis der Host fertig ist */
  function buildHostEvalWait(root) {
    const catEl = h('div', { class: 'eval-topic' });
    const ownEl = h('div');
    root.append(brandBlock(true), h('div', { class: 'card center' },
      h('h2', { class: 'card-title center' }, ico('fa-list-check'), 'Auswertung läuft'),
      h('p', { class: 'muted' }, 'Der Host vergibt gerade die Punkte. Schau auf den Bildschirm des Hosts.'),
      catEl, ownEl));
    function update() {
      const v = S.view;
      if (!v) return;
      const cat = v.cats[v.evalIndex];
      if (!cat) return;
      catEl.innerHTML = '';
      catEl.append(ico(cat.icon), h('span', null, cat.name));
      ownEl.innerHTML = '';
      const t = (S.text[cat.id] || '').trim();
      const a = S.draw[cat.id] && pref() === 'draw' ? { t: 'img', v: S.draw[cat.id] } : (t ? { t: 'text', v: t } : null);
      ownEl.append(h('p', { class: 'muted' }, 'Deine Antwort:'), answerView(a, v.letter));
    }
    update();
    return update;
  }

  /* ---- Ohne Host: jeder bewertet die Antworten der anderen ------------------ */
  function buildClientEval(root) {
    const v = S.view;
    const data = S.evalData;
    const others = data.players.filter((p) => p.id !== S.cid);
    const cats = v.cats;
    const votes = {};
    cats.forEach((c) => {
      votes[c.id] = {};
      others.forEach((p) => { if (!(p.answers && p.answers[c.id])) votes[c.id][p.id] = 0; });   // leer = 0
    });
    let idx = 0;
    function paint() {
      const cat = cats[idx];
      const last = idx === cats.length - 1;
      root.innerHTML = '';
      root.append(evalBoard({
        cat, idx, total: cats.length, letter: v.letter, last,
        note: 'Bewerte die Antworten der anderen – die Mehrheit entscheidet.',
        cards: others.map((p) => ({ id: p.id, name: p.name, color: p.color, answer: (p.answers && p.answers[cat.id]) || null })),
        sel: votes[cat.id],
        canNext: others.every((p) => votes[cat.id][p.id] !== undefined),
        nextLabel: last ? 'Abstimmung abgeben' : 'Weiter',
        onPick: (pid, pt) => { votes[cat.id][pid] = pt; const y = window.scrollY; paint(); window.scrollTo(0, y); },
        onPrev: () => { idx = Math.max(0, idx - 1); paint(); window.scrollTo(0, 0); },
        onNext: () => {
          if (!last) { idx++; paint(); window.scrollTo(0, 0); return; }
          S.votesSent = true;
          send({ t: 'votes', votes });
          render();
        },
      }));
    }
    paint();
  }

  function buildVoteWait(root) {
    const info = h('p', { class: 'muted' });
    root.append(brandBlock(true), h('div', { class: 'card center' },
      h('h2', { class: 'card-title center' }, ico('fa-circle-check'), 'Abstimmung abgegeben'),
      h('p', null, 'Warte kurz, bis alle anderen fertig sind …'), info));
    return function update() {
      const v = S.view;
      if (!v) return;
      const done = v.players.filter((p) => p.voted).length;
      info.textContent = done + ' von ' + v.players.length + ' fertig';
    }
  }

  /* ---- Ergebnis nach der Runde ---------------------------------------------- */
  function buildResult(root) {
    const v = currentView();
    const rows = ranking(v.players.map((p) => Object.assign({}, p)), 'total');
    const medal = (r) => (r === 1 ? ico('fa-crown', 'gold') : r === 2 ? ico('fa-medal', 'silver') : r === 3 ? ico('fa-medal', 'bronze') : h('span', null, r + '.'));
    const list = h('ol', { class: 'rank-list' }, rows.map((p) => h('li', { class: 'rank-row' + (p.id === v.you ? ' is-me' : '') },
      h('span', { class: 'rank-pos' }, medal(p.rank)),
      h('span', { class: 'rank-name' }, h('i', { class: 'dot', style: 'background:' + p.color }), p.name),
      h('span', { class: 'rank-plus' }, '+' + p.round),
      h('span', { class: 'rank-total' }, p.total))));
    const table = h('div', { class: 'detail', hidden: true },
      h('div', { class: 'table-scroll' }, h('table', { class: 'bd' },
        h('thead', null, h('tr', null, h('th', null, ''), v.cats.map((c) => h('th', { title: c.name }, ico(c.icon))), h('th', null, 'Σ'))),
        h('tbody', null, rows.map((p) => h('tr', null, h('th', null, p.name),
          v.cats.map((c) => h('td', null, String((v.breakdown && v.breakdown[p.id] && v.breakdown[p.id][c.id]) || 0))),
          h('td', { class: 'sum' }, '+' + p.round)))))));
    const toggle = h('button', { class: 'btn btn-secondary btn-sm', onClick: () => { table.hidden = !table.hidden; toggle.textContent = table.hidden ? 'Details anzeigen' : 'Details ausblenden'; } }, 'Details anzeigen');
    const last = v.round >= v.rounds;
    root.append(brandBlock(true),
      h('div', { class: 'card' },
        h('h2', { class: 'card-title' }, ico('fa-ranking-star'), 'Ergebnis Runde ' + v.round + ' von ' + v.rounds),
        list, h('div', { class: 'btn-row' }, toggle), table),
      S.role === 'hub'
        ? h('div', { class: 'btn-col' }, h('button', { class: 'btn btn-primary btn-big', onClick: hubNext }, ico(last ? 'fa-trophy' : 'fa-forward'), last ? 'Zur Siegerehrung' : 'Nächste Runde'))
        : h('p', { class: 'muted center' }, last ? 'Gleich kommt die Siegerehrung …' : 'Der Spielleiter startet die nächste Runde …'));
  }

  /* ---- Siegerehrung --------------------------------------------------------- */
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
        const a = (-90 + (Math.random() - 0.5) * 140) * Math.PI / 180;
        const s = 8 + Math.random() * 12;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.3, w: 6 + Math.random() * 7, hgt: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, col: colors[i % colors.length], life: 150 + Math.random() * 60 });
      }
    };
    let n = 0;
    const loop = () => {
      c.clearRect(0, 0, w, hh);
      if (n < 4 && n % 1 === 0 && Math.random() < 0.04) { burst(Math.random() * w, hh, 40); n++; }
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
    const v = currentView();
    const rows = ranking(v.players.map((p) => Object.assign({}, p)), 'total');
    const top = rows.slice(0, 3);
    const order = top.length === 1 ? [0] : top.length === 2 ? [1, 0] : [1, 0, 2];
    const medal = (r) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉');
    const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
    const podium = h('div', { class: 'podium' }, order.map((i, k) => {
      const p = top[i];
      return h('div', { class: 'pod rank-' + Math.min(p.rank, 3), style: 'animation-delay:' + (0.3 + k * 0.35) + 's' },
        h('div', { class: 'pod-person' }, h('div', { class: 'pod-medal' }, medal(p.rank)), h('div', { class: 'pod-name' }, p.name), h('div', { class: 'pod-score' }, p.total + ' Punkte')),
        h('div', { class: 'pod-block' }, String(p.rank)));
    }));
    const rest = rows.slice(3);
    root.append(canvas, brandBlock(true),
      h('div', { class: 'card final-card' },
        h('h2', { class: 'card-title center' }, ico('fa-trophy'), 'Siegerehrung'),
        podium,
        rest.length ? h('ol', { class: 'rank-list', start: 4 }, rest.map((p) => h('li', { class: 'rank-row' },
          h('span', { class: 'rank-pos' }, p.rank + '.'),
          h('span', { class: 'rank-name' }, h('i', { class: 'dot', style: 'background:' + p.color }), p.name),
          h('span', { class: 'rank-total' }, p.total)))) : null),
      S.role === 'hub'
        ? h('div', { class: 'btn-col' },
          h('button', { class: 'btn btn-primary btn-big', onClick: backToLobby }, ico('fa-rotate-right'), 'Neues Spiel mit denselben Spielern'),
          h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Beenden'))
        : h('div', { class: 'btn-col' }, h('p', { class: 'muted center' }, 'Danke fürs Mitspielen!'), h('button', { class: 'btn btn-link', onClick: leaveGame }, 'Spiel verlassen')));
    startConfetti(canvas, ctx);
    setTimeout(() => Sfx.fanfare(), 250);
  }

  /* ===========================================================================
     8. START
     =========================================================================== */
  function boot() {
    initThemeUI();
    applyTheme();
    const m = location.hash.match(/join=([A-Za-z0-9]+)/);
    const last = loadLast();
    if (m) {
      const code = m[1].toLowerCase();
      if (last && last.code === code) { S.resuming = true; joinGame(code, last.name); return; }   // bekanntes Spiel: direkt rein
      S.page = 'join';
      render();
      return;
    }
    if (last) { S.resuming = true; joinGame(last.code, last.name); return; }                      // automatisch zurück ins letzte Spiel
    S.page = 'landing';
    render();
  }

  window.__slf = { S, get G() { return G; }, net, send, joinGame, createGame, startGame, triggerStop, hubNext, finishRound };
  boot();
})();
