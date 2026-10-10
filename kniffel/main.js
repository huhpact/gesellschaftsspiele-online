/**
 * app.js
 * ---------------------------------------------------------------------------
 * Kniffelblock — application logic.  Version 1.7
 *
 * Structure of this file:
 *   1. State
 *   2. DOM references
 *   3. Icon helper
 *   4. Rendering: table body rows, player columns
 *   5. Player management: add / rename / remove
 *   6. Score calculation
 *   7. Persistence (localStorage)
 *   8. Toast notifications
 *   9. Event wiring
 *   10. PWA: service worker + install prompt
 *   11. Siegerehrung (Podium, Sound, Konfetti)  [v1.2]
 *   12. Einstellungen: Zettel-Design, Wach halten, Wer ist dran, Gruppe merken  [v1.3]
 *   13. Multiplayer: Zuschauen per QR-Code (Host + Zuschauer)  [v1.7]
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  /* ===========================================================================
     1. STATE
     =========================================================================== */

  /**
   * players: Array of player objects.
   * Each player: { id, name, nameConfirmed, colorHue, sheets: [scores, ...],
   * struck: [struckMap, ...] } where each entry in `sheets` is a
   * { [rowId]: number|null } map and each entry in `struck` is a parallel
   * { [rowId]: boolean } map (same indexing as `sheets`) marking categories
   * deliberately crossed out — see emptyStruckMap(). In "single" mode every
   * player has exactly one sheet (and one struck map); in "double" mode
   * every player has exactly two of each (see STATE.mode below), rendered
   * as two sub-columns under that player.
   */
  let players = [];
  let nextPlayerId = 1;

  /**
   * mode: 'single' -> one score sheet per player (classic).
   *       'double' -> two independent score sheets per player, entered side
   *                   by side; each has its own totals/bonus, and the
   *                   player's grand total adds both sheets together.
   */
  let mode = 'single';

  /**
   * seniorMode: "Rentner-Modus" — an independent, orthogonal accessibility
   * toggle (can be combined with either single or double mode). When on:
   * much stronger player/section background tints, larger & bolder type,
   * a header row that stays pinned to the top of the viewport while
   * scrolling, hard column-divider rules, and a per-cell "erledigt/
   * durchgestrichen" (done/crossed-out) toggle to help mark categories
   * that can't be used. Applied as a single class on <body> (see
   * applySeniorModeUI) so all the CSS lives in one attribute-scoped block.
   */
  let seniorMode = false;

  /**
   * v1.2: Das Endergebnis (Gesamtsumme) bleibt auf dem Blatt zensiert, bis die
   * Auswertung gelaufen ist. `revealed` wird nach der Siegerehrung true und
   * springt wieder auf false, sobald jemand danach einen Wert ändert.
   * CENSOR_LOWER_TOTAL: auf true setzen, um auch "Summe unten" zu verdecken.
   */
  let revealed = false;

  /** v1.7: Link mit #watch=<Raum> öffnet die App im Zuschauer-Modus (nur lesen). */
  const viewerRoomMatch = location.hash.match(/watch=([A-Za-z0-9_-]+)/);
  const viewerRoom = viewerRoomMatch ? viewerRoomMatch[1] : null;
  const viewerMode = !!viewerRoom;

  /** v1.3: Spieler, der zuletzt etwas eingetragen hat (Basis für "Wer ist dran?"). */
  let lastEntryPlayerId = null;

  /** v1.5: per Auslosung bestimmter Startspieler; gilt bis zum nächsten Eintrag. */
  let turnOverrideId = null;
  const CENSOR_LOWER_TOTAL = false;

  /* Distinct, paper-friendly "pen color" hues assigned round-robin to players
     so each player's column header gets a small identifying flag. */
  const PLAYER_HUES = ['#a8342a', '#2f5f8a', '#4a7a4a', '#8a5a2f', '#6a4a8a', '#8a2f5f'];

  /* ===========================================================================
     2. DOM REFERENCES
     =========================================================================== */

  const els = {
    headerRow: document.querySelector('.row-players'),
    body: document.getElementById('scorepad-body'),
    btnAddPlayer: document.getElementById('btn-add-player'),
    btnCalculate: document.getElementById('btn-calculate'),
    btnNewGame: document.getElementById('btn-new-game'),
    emptyHint: document.getElementById('empty-state-hint'),
    toast: document.getElementById('toast'),
    table: document.getElementById('scorepad-table'),
    btnModeSingle: document.getElementById('btn-mode-single'),
    btnModeDouble: document.getElementById('btn-mode-double'),
    sheetsHeaderRow: document.getElementById('row-sheets'),
    btnSettings: document.getElementById('btn-settings'),
    btnDraw: document.getElementById('btn-draw-start'),
    settingsPanel: document.getElementById('settings-panel'),
    groupRestore: document.getElementById('group-restore'),
  };

  /* ===========================================================================
     3. ICON HELPER
     ---------------------------------------------------------------------------
     Small inline-SVG icon set so we need zero external icon library.
     =========================================================================== */

  const ICONS = {
    'die-1': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
    'die-2': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/></svg>',
    'die-3': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/></svg>',
    'die-4': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="16" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="16" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/></svg>',
    'die-5': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>',
    'die-6': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="7.5" r="1.2" fill="currentColor"/><circle cx="8" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16.5" r="1.2" fill="currentColor"/><circle cx="16" cy="16.5" r="1.2" fill="currentColor"/></svg>',
    'star': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.9l-6.1 3.4 1.5-6.9-5.2-4.8 6.9-.7z"/></svg>',
    'dice': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="9" width="10" height="10" rx="2.5"/><circle cx="7" cy="14" r="1" fill="currentColor"/><rect x="11" y="4" width="10" height="10" rx="2.5"/><circle cx="14" cy="7" r="1" fill="currentColor"/><circle cx="18" cy="11" r="1" fill="currentColor"/></svg>',
    'house': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M9.5 19.5v-6h5v6"/></svg>',
    'straight': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17 21 5"/><circle cx="5" cy="16.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="10" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="19.5" cy="6.9" r="1.1" fill="currentColor" stroke="none"/></svg>',
    'trophy': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4v1a4 4 0 0 0 4 4"/><path d="M17 5h3v1a4 4 0 0 1-4 4"/></svg>',
    'sparkle': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8.5 13.4 12 12 15.5 10.6 12z" fill="currentColor" stroke="none"/></svg>',
    'crown': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2-9 5 4 2-6 2 6 5-4 2 9z"/><path d="M3 20h18"/></svg>',
    'pencil': '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  };

  function icon(name) {
    return ICONS[name] || '';
  }

  /* ===========================================================================
     4. RENDERING
     =========================================================================== */

  /**
   * Build the entire <tbody> from SCORE_ROWS. Called once on load and whenever
   * the player list changes (add/remove), since column counts shift.
   */
  function renderBody() {
    els.body.innerHTML = '';

    if (players.length === 0) {
      const tr = document.createElement('tr');
      tr.className = 'empty-state-row';
      const td = document.createElement('td');
      td.colSpan = 1;
      td.textContent = 'Noch keine Spieler auf dem Blatt.';
      tr.appendChild(td);
      els.body.appendChild(tr);
      return;
    }

    SCORE_ROWS.forEach((row) => {
      const tr = document.createElement('tr');

      if (row.type === 'spacer') {
        tr.className = 'row-spacer';
        tr.appendChild(makeLabelCell(null));
        players.forEach((player) => {
          sheetsFor(player).forEach(() => tr.appendChild(document.createElement('td')));
        });
        els.body.appendChild(tr);
        return;
      }

      tr.className = rowClassFor(row);
      tr.appendChild(makeLabelCell(row));

      players.forEach((player) => {
        // The grand total is one combined figure per player (sum of both
        // sheets in double mode), so it gets a single merged cell spanning
        // both sub-columns instead of one cell per sheet.
        if (row.id === 'grandTotal' && mode === 'double') {
          tr.appendChild(makeScoreCell(row, player, 0, { colSpan: 2 }));
          return;
        }
        sheetsFor(player).forEach((sheetScores, sheetIndex) => {
          tr.appendChild(makeScoreCell(row, player, sheetIndex));
        });
      });

      els.body.appendChild(tr);
    });

    updateAllScores();
  }

  /**
   * Returns the array of score-sheet objects for a player, e.g. [scoresA] in
   * single mode or [scoresA, scoresB] in double mode. Centralizing this means
   * every render/calculate loop below automatically adapts to the mode.
   */
  function sheetsFor(player) {
    return player.sheets;
  }

  function rowClassFor(row) {
    const classes = [];
    if (row.section === 'upper') classes.push('row-upper');
    if (row.section === 'lower') classes.push('row-lower');
    if (row.id === 'bonus') classes.push('row-bonus');
    if (row.id === 'upperTotal') classes.push('row-upper-total');
    if (row.id === 'upperTotalWithBonus') classes.push('row-upper-total-with-bonus');
    if (row.id === 'lowerTotal') classes.push('row-lower-total');
    if (row.id === 'grandTotal') classes.push('row-grand-total');
    if (row.fixedValue) classes.push('fixed-value-row');
    return classes.join(' ');
  }

  /** Builds the sticky left-hand label cell for a given row config. */
  function makeLabelCell(row) {
    const td = document.createElement('td');
    td.className = 'col-label';

    if (!row) return td; // spacer row: empty label cell

    if (row.type === 'total' || row.type === 'total-with-bonus') {
      td.innerHTML = `
        <span class="total-label">
          ${row.icon ? icon(row.icon) : ''}
          <span>${row.label}${row.id === 'grandTotal' && row.hint ? `<span class="category-hint">${row.hint}</span>` : ''}</span>
        </span>`;
    } else {
      td.innerHTML = `
        <span class="category-label">
          <span class="category-icon">${icon(row.icon)}</span>
          <span>
            ${row.label}
            ${row.hint ? `<span class="category-hint">${row.hint}</span>` : ''}
          </span>
        </span>`;
    }
    return td;
  }

  /**
   * Builds a unique DOM id fragment for a given row/player/sheet combination.
   * In single mode sheetIndex is always 0, so ids stay identical to the
   * pre-double-mode format for that case (keeps old saved games compatible).
   */
  function cellKey(playerId, sheetIndex) {
    return sheetIndex === 0 ? `${playerId}` : `${playerId}-s${sheetIndex}`;
  }

  /** Builds one player's cell for a given row + sheet (input, bonus, or total). */
  function makeScoreCell(row, player, sheetIndex, opts) {
    const td = document.createElement('td');
    td.className = 'cell-score player-tinted-col';
    if (mode === 'double') td.classList.add(sheetIndex === 0 ? 'cell-sheet-a' : 'cell-sheet-b');
    if (opts && opts.colSpan) {
      td.colSpan = opts.colSpan;
      td.classList.add('cell-merged');
    }
    td.dataset.rowId = row.id;
    td.dataset.playerId = player.id;
    td.dataset.sheetIndex = sheetIndex;
    // Carries this player's pen color down through every cell in their
    // column (not just the header flag) as a CSS var, so a very light tint
    // of "who's who" stays visible even once the header scrolls out of view.
    td.style.setProperty('--player-tint', player.colorHue);

    const key = cellKey(player.id, sheetIndex);
    const sheetScores = player.sheets[sheetIndex];
    const sheetStruck = player.struck && player.struck[sheetIndex];

    if (row.type === 'total' || row.type === 'total-with-bonus') {
      td.innerHTML = `<span class="total-value" id="total-${row.id}-${key}">0</span>`;
      return td;
    }

    if (row.type === 'bonus') {
      td.innerHTML = `<div class="bonus-cell" id="bonus-${key}">
        <span class="bonus-badge is-pending">${icon('star')} &nbsp;+0</span>
      </div>`;
      return td;
    }

    // Standard editable input cell
    const inputId = `score-${row.id}-${key}`;
    const existingValue = sheetScores[row.id];
    const maxAllowed = maxValueFor(row); // e.g. 25 for Full House, 30 for Sixes/Chance, null if unbounded

    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '0';
    if (maxAllowed !== null) input.max = String(maxAllowed);
    input.className = 'score-input';
    input.id = inputId;
    input.placeholder = '–';
    const sheetSuffix = mode === 'double' ? ` (Zettel ${sheetIndex + 1})` : '';
    const maxHint = maxAllowed !== null ? ` (max. ${maxAllowed})` : '';
    input.setAttribute('aria-label', `${row.label} – ${player.name}${sheetSuffix}${maxHint}`);
    if (maxAllowed !== null) input.title = `Maximal ${maxAllowed} Punkte in dieser Kategorie`;
    if (existingValue !== null && existingValue !== undefined) {
      input.value = existingValue;
    }

    input.addEventListener('input', () => {
      const raw = input.value;

      if (raw === '') {
        sheetScores[row.id] = null;
        onScoreChanged();
        return;
      }

      let numeric = Number(raw);

      // Clamp to what's physically possible in this category (e.g. Full
      // House can never exceed 25, Sixes can never exceed 30) rather than
      // rejecting the keystroke outright — typing "99" in the Sixes box
      // just settles at 30, the real ceiling for that box.
      if (maxAllowed !== null && numeric > maxAllowed) {
        numeric = maxAllowed;
        input.value = String(numeric);
      } else if (numeric < 0) {
        numeric = 0;
        input.value = '0';
      }

      sheetScores[row.id] = numeric;
      onScoreChanged(player.id);
    });

    // Kniffel (stackStep): nur volle 50er-Schritte zulassen (0/50/100/150).
    if (row.stackStep) {
      input.addEventListener('change', () => {
        if (input.value === '') return;
        let snapped = Math.round(Number(input.value) / row.stackStep) * row.stackStep;
        snapped = Math.max(0, Math.min(maxAllowed, snapped));
        input.value = String(snapped);
        sheetScores[row.id] = snapped;
        onScoreChanged(player.id);
      });
    }

    // Enter key on a score input moves focus to the next row's cell (same
    // player + same sheet) for fast, calculator-like data entry.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        focusNextInput(row.id, player.id, sheetIndex);
      }
    });

    td.appendChild(input);

    // v1.2: winziger Bonus-Hinweis im oberen Block ("noch 3×"), wird live
    // von updateNeedHints() befüllt.
    if (row.section === 'upper') {
      const need = document.createElement('span');
      need.className = 'need-hint';
      need.id = `need-${row.id}-${key}`;
      td.appendChild(need);
    }

    if (row.fixedValue) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'quick-fill-btn';
      if (row.stackStep) {
        // Kniffel: jeder Klick addiert +50 (50 -> 100 -> 150).
        chip.textContent = `+${row.stackStep}`;
        chip.title = `Kniffel eintragen: je Klick +${row.stackStep} (max. ${maxAllowed})`;
        chip.addEventListener('click', () => {
          const current = typeof sheetScores[row.id] === 'number' ? sheetScores[row.id] : 0;
          if (current >= maxAllowed) {
            showToast(`Maximal ${maxAllowed} Punkte im Kniffel-Feld.`, 'error');
            return;
          }
          const next = Math.min(maxAllowed, current + row.stackStep);
          input.value = next;
          sheetScores[row.id] = next;
          onScoreChanged(player.id);
        });
      } else {
        chip.textContent = row.fixedValue;
        chip.title = `${row.fixedValue} Punkte eintragen`;
        chip.addEventListener('click', () => {
          input.value = row.fixedValue;
          sheetScores[row.id] = row.fixedValue;
          onScoreChanged(player.id);
          input.focus();
        });
      }
      td.appendChild(chip);
    }

    // "Durchgestrichen" (struck-out) toggle — v1.2: jetzt in JEDEM Modus verfügbar (vorher nur Rentner-Modus)
    // marking a category as deliberately unusable this round, the way many
    // players cross out a box on a real paper sheet. Always built (so no
    // extra render pass is needed when senior mode is switched on), but
    // only shown via CSS while .senior-mode is active on <body>. Struck
    // cells lock their input so a crossed-out box can't also hold a value.
    const isStruck = !!(sheetStruck && sheetStruck[row.id]);
    td.classList.toggle('is-struck', isStruck);
    input.disabled = isStruck;

    const strikeBtn = document.createElement('button');
    strikeBtn.type = 'button';
    strikeBtn.className = 'strike-toggle-btn';
    strikeBtn.title = isStruck ? 'Streichung aufheben' : `${row.label} durchstreichen`;
    strikeBtn.setAttribute('aria-label', isStruck ? `Streichung bei ${row.label} aufheben` : `${row.label} durchstreichen`);
    strikeBtn.setAttribute('aria-pressed', String(isStruck));
    strikeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4 12h16"/></svg>';
    strikeBtn.addEventListener('click', () => {
      if (!player.struck) player.struck = [];
      if (!player.struck[sheetIndex]) player.struck[sheetIndex] = emptyStruckMap();
      const nowStruck = !player.struck[sheetIndex][row.id];
      player.struck[sheetIndex][row.id] = nowStruck;

      td.classList.toggle('is-struck', nowStruck);
      input.disabled = nowStruck;
      strikeBtn.setAttribute('aria-pressed', String(nowStruck));
      strikeBtn.title = nowStruck ? 'Streichung aufheben' : `${row.label} durchstreichen`;
      strikeBtn.setAttribute('aria-label', nowStruck ? `Streichung bei ${row.label} aufheben` : `${row.label} durchstreichen`);
      if (nowStruck) {
        // Crossing out a box clears any stray value in it, matching what
        // crossing it out on paper means: this box is no longer in play.
        sheetScores[row.id] = null;
        input.value = '';
      } else {
        input.focus();
      }
      onScoreChanged(player.id);
    });
    td.appendChild(strikeBtn);

    return td;
  }

  /** Moves keyboard focus to the next editable input below the current one (same sheet). */
  function focusNextInput(currentRowId, playerId, sheetIndex) {
    const editableRows = EDITABLE_ROW_IDS;
    const idx = editableRows.indexOf(currentRowId);
    const key = cellKey(playerId, sheetIndex);
    for (let i = idx + 1; i < editableRows.length; i++) {
      const next = document.getElementById(`score-${editableRows[i]}-${key}`);
      if (next) {
        next.focus();
        next.select();
        return;
      }
    }
    // Wrapped around / reached the end — just blur.
    document.activeElement && document.activeElement.blur();
  }

  /** Renders the player header row (name inputs/display + remove button). */
  function renderPlayerHeaders() {
    // Remove existing player <th> elements (keep the fixed label <th>).
    els.headerRow.querySelectorAll('.col-player-head').forEach((el) => el.remove());

    players.forEach((player) => {
      const th = document.createElement('th');
      th.className = 'col-player-head player-header-cell player-tinted-col';
      th.scope = 'col';
      if (mode === 'double') th.colSpan = 2;
      th.style.setProperty('--player-tint', player.colorHue);
      th.dataset.playerId = String(player.id);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-remove-player';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = `${player.name} entfernen`;
      removeBtn.setAttribute('aria-label', `${player.name} entfernen`);
      removeBtn.addEventListener('click', () => removePlayer(player.id));
      th.appendChild(removeBtn);

      const flag = document.createElement('span');
      flag.className = 'player-color-flag';
      flag.style.background = player.colorHue;
      th.appendChild(flag);

      th.appendChild(buildNameElement(player));

      // v1.3: kleine farbige Spaltenmarkierung "als Nächstes dran"
      const turn = document.createElement('span');
      turn.className = 'turn-marker';
      turn.title = `${player.name} ist als Nächstes dran`;
      turn.setAttribute('aria-hidden', 'true');
      th.appendChild(turn);

      els.headerRow.appendChild(th);
    });

    renderSheetSubHeaders();
    updateAddPlayerButtonState();
    updateTurnMarker();
    refreshNameSuggestions();
  }

  /**
   * Renders (or hides) the "Zettel 1 / Zettel 2" sub-header row shown right
   * below the player names. Only relevant in double mode — in single mode
   * the row is hidden entirely since there's nothing to disambiguate.
   */
  function renderSheetSubHeaders() {
    els.sheetsHeaderRow.querySelectorAll('.col-sheet-head').forEach((el) => el.remove());

    if (mode !== 'double' || players.length === 0) {
      els.sheetsHeaderRow.classList.add('hidden');
      return;
    }

    els.sheetsHeaderRow.classList.remove('hidden');

    players.forEach((player) => {
      [0, 1].forEach((sheetIndex) => {
        const th = document.createElement('th');
        th.className = `col-sheet-head player-tinted-col ${sheetIndex === 0 ? 'is-sheet-a' : 'is-sheet-b'}`;
        th.scope = 'col';
        th.textContent = `Zettel ${sheetIndex + 1}`;
        th.style.setProperty('--player-tint', player.colorHue);
        th.dataset.playerId = String(player.id);
        els.sheetsHeaderRow.appendChild(th);
      });
    });
  }

  /** Builds either the name <input> (unconfirmed) or the name display (confirmed). */
  function buildNameElement(player) {
    if (!player.nameConfirmed) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'player-name-input';
      input.placeholder = 'Name eingeben…';
      input.value = player.name === defaultNameFor(player) ? '' : player.name;
      input.maxLength = 18;
      input.setAttribute('list', 'name-suggestions');
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Spielername eingeben, dann Enter drücken');

      const confirm = () => {
        const trimmed = input.value.trim();
        player.name = trimmed || defaultNameFor(player);
        player.nameConfirmed = true;
        savePlayers();
        renderPlayerHeaders();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirm();
        }
      });
      input.addEventListener('blur', confirm);

      // Autofocus the newest player's name field.
      requestAnimationFrame(() => input.focus());

      return input;
    }

    const wrap = document.createElement('div');
    wrap.className = 'player-name-display';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', `Name „${player.name}" bearbeiten`);
    wrap.innerHTML = `<span>${escapeHtml(player.name)}</span><span class="rename-icon">${icon('pencil')}</span>`;

    const startRename = () => {
      player.nameConfirmed = false;
      renderPlayerHeaders();
    };
    wrap.addEventListener('click', startRename);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startRename();
      }
    });

    return wrap;
  }

  function defaultNameFor(player) {
    return `Spieler ${players.indexOf(player) + 1}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ===========================================================================
     5. PLAYER MANAGEMENT
     =========================================================================== */

  /** Builds one empty { [rowId]: null } score map for a single sheet. */
  function emptyScoreMap() {
    const scores = {};
    EDITABLE_ROW_IDS.forEach((id) => { scores[id] = null; });
    return scores;
  }

  /**
   * Builds one empty { [rowId]: false } "durchgestrichen" (struck-out) map
   * for a single sheet — Rentner-Modus-only affordance for marking a
   * category as deliberately skipped/not usable, kept fully separate from
   * the numeric score map above so it can never collide with a row id or
   * interfere with sumRows()/calculateAllScores(). One entry per player
   * sheet, same indexing as player.sheets (player.struck[sheetIndex]).
   */
  function emptyStruckMap() {
    const struck = {};
    EDITABLE_ROW_IDS.forEach((id) => { struck[id] = false; });
    return struck;
  }

  /** Builds the sheets array for a fresh player, sized to the current mode. */
  function emptySheets() {
    const count = SHEETS_PER_MODE[mode] || 1;
    return Array.from({ length: count }, () => emptyScoreMap());
  }

  /** Builds the struck-rows array for a fresh player, mirroring emptySheets(). */
  function emptyStruckSheets() {
    const count = SHEETS_PER_MODE[mode] || 1;
    return Array.from({ length: count }, () => emptyStruckMap());
  }

  function addPlayer(presetName, silent) {
    if (players.length >= MAX_PLAYERS) {
      showToast(`Maximal ${MAX_PLAYERS} Spieler pro Blatt.`, 'error');
      return;
    }

    const preset = typeof presetName === 'string' && presetName.trim() ? presetName.trim() : null;
    const player = {
      id: nextPlayerId++,
      name: preset || `Spieler ${players.length + 1}`,
      nameConfirmed: !!preset,
      colorHue: PLAYER_HUES[players.length % PLAYER_HUES.length],
      sheets: emptySheets(),
      struck: emptyStruckSheets(),
    };

    players.push(player);
    if (silent) return player;
    renderBody();
    renderPlayerHeaders();
    savePlayers();
    updateEmptyHint();
    return player;
  }

  function removePlayer(id) {
    const player = players.find((p) => p.id === id);
    if (!player) return;

    players = players.filter((p) => p.id !== id);
    renderBody();
    renderPlayerHeaders();
    savePlayers();
    updateEmptyHint();
    showToast(`${player.name} wurde entfernt.`);
  }

  function updateAddPlayerButtonState() {
    const atMax = players.length >= MAX_PLAYERS;
    els.btnAddPlayer.disabled = atMax;
    els.btnAddPlayer.title = atMax
      ? `Maximal ${MAX_PLAYERS} Spieler erreicht`
      : 'Spieler hinzufügen';
  }

  function updateEmptyHint() {
    if (players.length === 0) {
      els.emptyHint.style.display = '';
    } else {
      els.emptyHint.style.display = 'none';
    }
    updateGroupRestoreUI();
  }

  /* ===========================================================================
     6. SCORE CALCULATION
     =========================================================================== */

  const UPPER_ROW_IDS = SCORE_ROWS.filter((r) => r.section === 'upper' && r.type === 'input').map((r) => r.id);
  const LOWER_ROW_IDS = SCORE_ROWS.filter((r) => r.section === 'lower' && r.type === 'input').map((r) => r.id);

  /** Zentrale Änderungs-Routine: speichern, Endergebnis wieder verdecken, live neu rechnen. */
  function onScoreChanged(playerId) {
    revealed = false;
    if (playerId !== undefined) { lastEntryPlayerId = playerId; turnOverrideId = null; } // Wer-ist-dran
    savePlayers();
    updateAllScores();
  }

  /** Aufschlüsselung eines Zettels: oben, Bonus, unten, Summe. */
  function sheetBreakdown(sheetScores) {
    const upperSum = sumRows(sheetScores, UPPER_ROW_IDS);
    const bonusEarned = upperSum >= BONUS_THRESHOLD;
    const bonusPoints = bonusEarned ? BONUS_POINTS : 0;
    const upperTotal = upperSum + bonusPoints;
    const lowerTotal = sumRows(sheetScores, LOWER_ROW_IDS);
    return { upperSum, bonusEarned, bonusPoints, upperTotal, lowerTotal, total: upperTotal + lowerTotal };
  }

  /** Gesamtpunkte eines Spielers (im Doppel-Modus beide Zettel addiert). */
  function playerGrandTotal(player) {
    return player.sheets.reduce((sum, sheet) => sum + sheetBreakdown(sheet).total, 0);
  }

  /**
   * v1.2: LIVE-Berechnung. Läuft nach jeder Eingabe (und nach jedem Neuaufbau
   * der Tabelle) und aktualisiert Summen, Bonus und Bonus-Hinweise. Die
   * Gesamtsumme wird dabei zensiert angezeigt, solange `revealed` false ist.
   */
  function updateAllScores() {
    players.forEach((player) => {
      let grandTotal = 0;

      player.sheets.forEach((sheetScores, sheetIndex) => {
        const key = cellKey(player.id, sheetIndex);
        const b = sheetBreakdown(sheetScores);
        grandTotal += b.total;

        updateTotalDisplay('upperTotal', key, b.upperSum);
        updateBonusDisplay(key, b.upperSum, b.bonusEarned, b.bonusPoints);
        updateTotalDisplay('upperTotalWithBonus', key, b.upperTotal);
        updateTotalDisplay('lowerTotal', key, b.lowerTotal);
        updateNeedHints(player, sheetIndex, key);
      });

      // Gesamtsumme: eine Zelle pro Spieler (Doppel-Modus: beide Zettel zusammen).
      updateTotalDisplay('grandTotal', cellKey(player.id, 0), grandTotal);
    });

    updateTurnMarker();
  }

  /* ---- Wer ist dran? (v1.3) ------------------------------------------------
     Nächster Spieler = der Spieler NACH dem, der zuletzt etwas eingetragen hat
     (in Spalten-Reihenfolge, am Ende wieder von vorn). Vor dem ersten Eintrag
     ist der erste Spieler dran. Angezeigt wird nur eine kleine farbige
     Markierung am Spaltenkopf. Aus bei nur einem Spieler, wenn das Blatt voll
     ist oder wenn die Option in den Einstellungen abgeschaltet wurde.        */
  function nextPlayerToPlay() {
    if (viewerMode) return settings.turnMarker && vw.turn && players[0] ? players[0].id : null; // Zuschauer: Info vom Host
    if (!settings.turnMarker || players.length < 2) return null;
    if (countOpenFields() === 0) return null;
    if (turnOverrideId !== null && players.some((p) => p.id === turnOverrideId)) return turnOverrideId; // Auslosung
    const idx = players.findIndex((p) => p.id === lastEntryPlayerId);
    return players[(idx + 1) % players.length].id; // idx = -1 -> erster Spieler
  }

  /** Markiert die ganze Spalte (Kopf + alle Zellen) des Spielers, der dran ist. */
  function highlightColumn(playerId) {
    document.querySelectorAll('#scorepad-table [data-player-id]').forEach((n) => {
      n.classList.toggle('is-turn', playerId !== null && n.dataset.playerId === String(playerId));
    });
    document.body.classList.toggle('turn-active', playerId !== null);
  }

  function updateTurnMarker() {
    if (drawing) return; // während der Auslosung steuert die Animation die Markierung
    highlightColumn(nextPlayerToPlay());
  }

  /* ---- Startspieler auslosen (v1.5) ---------------------------------------
     Kleine Roulette über die Spalten: läuft immer langsamer und bleibt bei
     einem zufälligen Spieler stehen, der dann als Nächstes dran ist.          */
  let drawing = false;

  async function drawStartPlayer() {
    if (drawing) return;
    if (players.length < 2) {
      showToast('Für die Auslosung brauchst du mindestens zwei Spieler.', 'error');
      return;
    }
    drawing = true;
    els.btnDraw.disabled = true;
    Sfx.ensure();

    const n = players.length;
    const winner = Math.floor(Math.random() * n);
    const total = (n < 4 ? 3 : 2) * n + winner + 1;
    for (let i = 0; i < total; i++) {
      highlightColumn(players[i % n].id);
      Sfx.pop();
      const p = i / (total - 1);
      await new Promise((r) => setTimeout(r, 70 + 330 * p * p));
    }

    drawing = false;
    els.btnDraw.disabled = false;
    turnOverrideId = players[winner].id;
    savePlayers();
    updateTurnMarker();
    const head = document.querySelector('#scorepad-table .col-player-head[data-player-id="' + players[winner].id + '"]');
    if (head) { head.classList.remove('is-drawn'); void head.offsetWidth; head.classList.add('is-drawn'); }
    Sfx.reveal(3);
    showToast(players[winner].name + ' fängt an! 🎲', 'success');
  }

  /* ---- Bonus-Hinweise im oberen Block ------------------------------------- */

  const UPPER_ROWS = SCORE_ROWS.filter((r) => r.section === 'upper' && r.type === 'input');

  /**
   * Rechnet aus, wie viele Würfel jeder noch offenen Augenzahl für den Bonus
   * (63) nötig sind. Ausgangslage: 3 von jeder Zahl (3×(1+…+6) = 63).
   * Wurde eine Zahl schon eingetragen, verschiebt sich der Bedarf:
   *  - Defizit  -> mehr Würfel bei den offenen Feldern (hohe Zahlen zuerst, max. 5)
   *  - Überschuss -> weniger Würfel (niedrige Zahlen zuerst)
   * Durchgestrichene Felder zählen als 0 Punkte.
   */
  function computeBonusNeeds(sheetScores, struckMap) {
    let missing = BONUS_THRESHOLD;
    const open = [];
    UPPER_ROWS.forEach((r) => {
      const v = sheetScores[r.id];
      if (struckMap[r.id]) return;
      if (typeof v === 'number' && !Number.isNaN(v)) missing -= v;
      else open.push(r);
    });

    const counts = {};
    open.forEach((r) => { counts[r.id] = 3; });
    let delta = missing - open.reduce((sum, r) => sum + 3 * r.face, 0);

    if (delta > 0) {
      [...open].sort((a, b) => b.face - a.face).forEach((r) => {
        while (delta > 0 && counts[r.id] < 5) { counts[r.id]++; delta -= r.face; }
      });
    } else if (delta < 0) {
      [...open].sort((a, b) => a.face - b.face).forEach((r) => {
        while (counts[r.id] > 0 && -delta >= r.face) { counts[r.id]--; delta += r.face; }
      });
    }

    return { counts, reached: missing <= 0, impossible: missing > 0 && delta > 0 };
  }

  function updateNeedHints(player, sheetIndex, key) {
    const struckMap = (player.struck && player.struck[sheetIndex]) || {};
    const sheetScores = player.sheets[sheetIndex];
    const info = computeBonusNeeds(sheetScores, struckMap);

    UPPER_ROWS.forEach((r) => {
      const node = document.getElementById(`need-${r.id}-${key}`);
      if (!node) return;
      const done = typeof sheetScores[r.id] === 'number' || struckMap[r.id];
      if (done) {
        node.textContent = '';
        node.className = 'need-hint';
        node.removeAttribute('title');
        return;
      }
      if (info.reached) {
        node.textContent = '✓';
        node.className = 'need-hint is-ok';
        node.title = 'Bonus ist schon sicher';
      } else if (info.impossible) {
        node.textContent = '✗';
        node.className = 'need-hint is-bad';
        node.title = 'Bonus ist nicht mehr erreichbar';
      } else {
        const n = info.counts[r.id];
        node.textContent = `${n}×`;
        node.className = 'need-hint ' + (n > 3 ? 'is-more' : n < 3 ? 'is-less' : 'is-same');
        node.title = `Für den Bonus brauchst du noch etwa ${n}× ${r.label}`;
      }
    });
  }

  /** Sums the numeric scores of the given row ids for one sheet (nulls -> 0). */
  function sumRows(sheetScores, rowIds) {
    return rowIds.reduce((sum, id) => {
      const val = sheetScores[id];
      return sum + (typeof val === 'number' && !Number.isNaN(val) ? val : 0);
    }, 0);
  }

  function isCensored(rowId) {
    return !revealed && (rowId === 'grandTotal' || (CENSOR_LOWER_TOTAL && rowId === 'lowerTotal'));
  }

  function updateTotalDisplay(rowId, key, value) {
    const node = document.getElementById(`total-${rowId}-${key}`);
    if (!node) return;

    const censored = isCensored(rowId);
    const stamp = censored ? 'censored' : String(value);
    const previous = node.dataset.shown;
    if (previous === stamp) return; // nichts geändert -> keine unnötige Animation
    node.dataset.shown = stamp;
    node.classList.remove('just-updated', 'just-revealed');

    if (censored) {
      node.classList.add('is-censored');
      node.innerHTML = '<span class="censor" role="img" aria-label="Ergebnis verdeckt"><span class="censor-digits">888</span>' +
        '<svg class="censor-lock" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>';
      return;
    }

    const wasCensored = previous === 'censored';
    node.classList.remove('is-censored');
    node.textContent = value;
    if (previous === undefined && !wasCensored) return; // erster Aufbau: ohne Puls
    void node.offsetWidth; // Reflow, damit die Animation neu startet
    node.classList.add(wasCensored ? 'just-revealed' : 'just-updated');
  }

  function updateBonusDisplay(key, upperSum, earned, bonusPoints) {
    const container = document.getElementById(`bonus-${key}`);
    if (!container) return;

    let badgeClass = 'is-pending';
    let text = `Noch ${Math.max(0, BONUS_THRESHOLD - upperSum)} bis Bonus`;

    if (upperSum === 0) {
      badgeClass = 'is-pending';
      text = `Ziel: ${BONUS_THRESHOLD}+`;
    } else if (earned) {
      badgeClass = 'is-earned';
      text = `+${bonusPoints} erreicht!`;
    } else {
      badgeClass = 'is-missed';
      text = `Fehlt: ${BONUS_THRESHOLD - upperSum}`;
    }

    container.innerHTML = `<span class="bonus-badge ${badgeClass}">${icon('star')}&nbsp;${text}</span>`;
  }

  /* ===========================================================================
     7. PERSISTENCE (localStorage)
     ---------------------------------------------------------------------------
     Keeps the current sheet across reloads/offline use. Nothing leaves the
     device — this is why the footer says "deine Daten bleiben auf diesem
     Gerät" (your data stays on this device).
     =========================================================================== */

  const STORAGE_KEY = 'kniffelblock.state.v2';
  const LEGACY_STORAGE_KEY = 'kniffelblock.state.v1'; // pre-"Doppel" format (single `scores` map)

  function savePlayers() {
    if (viewerMode) return;      // Zuschauer speichern nie – sonst würde ein eigenes Blatt überschrieben
    try {
      const payload = {
        mode,
        seniorMode,
        players: players.map((p) => ({
          id: p.id,
          name: p.name,
          nameConfirmed: p.nameConfirmed,
          colorHue: p.colorHue,
          sheets: p.sheets,
          struck: p.struck,
        })),
        nextPlayerId,
        lastEntryPlayerId,
        turnOverrideId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      rememberGroup();
      mpBroadcast();
    } catch (err) {
      // localStorage may be unavailable (private browsing / quota) — fail silently,
      // the app still works, it just won't persist across reloads.
      console.warn('Konnte Spielstand nicht speichern:', err);
    }
  }

  function loadPlayers() {
    if (viewerMode) return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.players)) return false;

        players = payload.players;
        mode = payload.mode === 'double' ? 'double' : 'single';
        seniorMode = payload.seniorMode === true;
        nextPlayerId = payload.nextPlayerId || players.length + 1;
        lastEntryPlayerId = payload.lastEntryPlayerId ?? null;
        turnOverrideId = payload.turnOverrideId ?? null;
        // Backfill: saves written before the "durchgestrichen" feature
        // existed won't have a `struck` array at all — give every such
        // player a fresh, correctly-sized, all-false one rather than
        // leaving it undefined (which the renderer isn't expecting).
        players.forEach((p) => {
          if (!Array.isArray(p.struck) || p.struck.length !== p.sheets.length) {
            p.struck = p.sheets.map(() => emptyStruckMap());
          }
        });
        return true;
      }

      // No v2 save yet — try migrating an old v1 save (single-sheet format)
      // so upgrading the app doesn't wipe anyone's in-progress game.
      return migrateLegacySave();
    } catch (err) {
      console.warn('Konnte Spielstand nicht laden:', err);
      return false;
    }
  }

  /** Migrates a pre-"Doppel" save ({ scores }) into the current ({ sheets }) format. */
  function migrateLegacySave() {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.players)) return false;

    players = payload.players.map((p) => ({
      id: p.id,
      name: p.name,
      nameConfirmed: p.nameConfirmed,
      colorHue: p.colorHue,
      sheets: [p.scores || emptyScoreMap()],
      struck: [emptyStruckMap()],
    }));
    mode = 'single';
    seniorMode = false;
    nextPlayerId = payload.nextPlayerId || players.length + 1;

    savePlayers();
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (err) { /* ignore */ }
    return true;
  }

  function clearSavedGame() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
  }

  function startNewGame() {
    const proceed = players.length === 0 || window.confirm(
      'Ein neues Blatt beginnen? Der aktuelle Punktestand geht dabei verloren.'
    );
    if (!proceed) return;

    rememberGroup();            // Gruppe bleibt für "Letzte Gruppe laden" erhalten
    players = [];
    revealed = false;
    lastEntryPlayerId = null;
    turnOverrideId = null;
    clearSavedGame();
    renderBody();
    renderPlayerHeaders();
    updateEmptyHint();
    mpBroadcast();
    showToast('Neues Blatt bereit — viel Glück! 🎲');
  }

  /**
   * Switches between "single" and "double" mode.
   *  - single -> double: lossless. Every player simply gains a second, empty
   *    sheet; sheet 1's existing scores are untouched.
   *  - double -> single: lossy for anyone who has entered anything on their
   *    second sheet, so it asks for confirmation first and then just drops
   *    each player's second sheet.
   */
  function setMode(newMode) {
    if (newMode === mode) return;

    if (newMode === 'single' && mode === 'double') {
      const anySecondSheetData = players.some((p) => {
        const hasScores = p.sheets[1] && Object.values(p.sheets[1]).some((v) => v !== null && v !== undefined);
        const hasStrikes = p.struck && p.struck[1] && Object.values(p.struck[1]).some(Boolean);
        return hasScores || hasStrikes;
      });
      if (anySecondSheetData) {
        const proceed = window.confirm(
          'Zurück zu Einfach wechseln? Die Punkte auf dem zweiten Zettel jedes Spielers gehen dabei verloren.'
        );
        if (!proceed) return;
      }
      players.forEach((p) => {
        p.sheets = [p.sheets[0] || emptyScoreMap()];
        p.struck = [(p.struck && p.struck[0]) || emptyStruckMap()];
      });
    } else if (newMode === 'double' && mode === 'single') {
      players.forEach((p) => {
        p.sheets = [p.sheets[0] || emptyScoreMap(), emptyScoreMap()];
        p.struck = [(p.struck && p.struck[0]) || emptyStruckMap(), emptyStruckMap()];
      });
    }

    mode = newMode;
    updateModeToggleUI();
    renderBody();
    renderPlayerHeaders();
    savePlayers();
    showToast(
      newMode === 'double'
        ? 'Doppel-Modus aktiv — zwei Zettel pro Spieler! 🎲🎲'
        : 'Einfach-Modus aktiv — ein Zettel pro Spieler.'
    );
  }

  /** Syncs the toggle buttons' visual/active state with the current mode. */
  function updateModeToggleUI() {
    const isDouble = mode === 'double';
    els.btnModeSingle.classList.toggle('is-active', !isDouble);
    els.btnModeSingle.setAttribute('aria-checked', String(!isDouble));
    els.btnModeDouble.classList.toggle('is-active', isDouble);
    els.btnModeDouble.setAttribute('aria-checked', String(isDouble));
  }

  /**
   * Toggles "Rentner-Modus" — independent of single/double, so it can be
   * combined with either. Unlike setMode(), this never touches player data,
   * only presentation, so there's nothing to confirm before switching.
   */
  function setSeniorMode(on) {
    seniorMode = !!on;
    applySeniorModeUI();
    savePlayers();
    showToast(
      seniorMode
        ? 'Rentner-Modus aktiv — große Schrift & starke Farben. 🔍'
        : 'Rentner-Modus ausgeschaltet.'
    );
  }

  /** Syncs the <body> class + button state with the current seniorMode flag. */
  function applySeniorModeUI() {
    document.body.classList.toggle('senior-mode', seniorMode);
    const sw = document.getElementById('set-senior');   // Schalter im Einstellungen-Menü
    if (sw) sw.checked = seniorMode;
  }

  /* ===========================================================================
     8. TOAST NOTIFICATIONS
     =========================================================================== */

  let toastTimer = null;

  function showToast(message, kind) {
    els.toast.textContent = message;
    els.toast.className = 'toast is-visible' + (kind === 'success' ? ' is-success' : kind === 'error' ? ' is-error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 2600);
  }

  /* ===========================================================================
     9. EVENT WIRING
     =========================================================================== */

  els.btnAddPlayer.addEventListener('click', () => addPlayer());
  els.btnCalculate.addEventListener('click', startEvaluation);
  els.btnNewGame.addEventListener('click', startNewGame);
  els.btnModeSingle.addEventListener('click', () => setMode('single'));
  els.btnModeDouble.addEventListener('click', () => setMode('double'));

  /* ===========================================================================
     10. PWA: SERVICE WORKER + INSTALL PROMPT
     =========================================================================== */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('Service Worker Registrierung fehlgeschlagen:', err);
      });
    });
  }

  let deferredInstallPrompt = null;
  const btnInstall = document.getElementById('btn-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    btnInstall.classList.remove('hidden');
  });

  btnInstall.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('App wird installiert…', 'success');
    }
    deferredInstallPrompt = null;
    btnInstall.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    btnInstall.classList.add('hidden');
    showToast('Kniffelblock wurde installiert! 🎉', 'success');
  });

  /* ===========================================================================
     11. SIEGEREHRUNG (v1.2)
     ---------------------------------------------------------------------------
     Vollbild-Präsentation: Intro -> Plätze 4+ (von hinten) -> Treppchen
     3 / 2 / 1 mit Trommelwirbel, Fanfare, Applaus, Konfetti & Feuerwerk.
     Alles ohne externe Bibliotheken: Sound per WebAudio (synthetisch),
     Konfetti per <canvas>, Animationen per CSS.
       11a. Sfx       – Soundeffekte
       11b. Confetti  – Konfetti / Feuerwerk
       11c. Ceremony  – Ablauf & DOM
     =========================================================================== */

  /* ---- 11a. SOUND ---------------------------------------------------------- */
  const Sfx = (() => {
    let ac = null, master = null, noiseBuf = null, drumBus = null, muted = false;

    function ensure() {
      try {
        if (!ac) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return false;
          ac = new AC();
          master = ac.createGain();
          master.gain.value = muted ? 0 : 0.9;
          const comp = ac.createDynamicsCompressor();
          master.connect(comp);
          comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === 'suspended') ac.resume();
        return true;
      } catch (e) {
        ac = null;
        return false;
      }
    }

    const now = () => ac.currentTime;

    function tone(freq, t0, dur, o = {}) {
      const { type = 'sawtooth', vol = 0.18, lp = 2400, attack = 0.02, vib = 0, dest = master, slideTo = null } = o;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const f = ac.createBiquadFilter();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      f.type = 'lowpass';
      f.frequency.value = lp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(f); f.connect(g); g.connect(dest);
      if (vib) {
        const lfo = ac.createOscillator();
        const lg = ac.createGain();
        lfo.frequency.value = 5.5;
        lg.gain.value = vib;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function noise(t0, dur, o = {}) {
      const { type = 'bandpass', freq = 2000, q = 0.7, vol = 0.2, dest = master, flat = false } = o;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t0);
      if (!flat) g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(t0, Math.random() * 0.9, dur);
    }

    function cymbal(t) {
      noise(t, 1.6, { type: 'highpass', freq: 5500, q: 0.5, vol: 0.22 });
    }

    function intro() {
      if (!ensure()) return;
      const t = now();
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone(f, t + i * 0.1, 0.55, { type: 'triangle', vol: 0.16, lp: 5000 }));
      tone(130.81, t, 1.4, { vol: 0.1, lp: 500, attack: 0.4 });
      noise(t + 0.5, 1.0, { type: 'highpass', freq: 6000, vol: 0.06 });
    }

    function pop() {
      if (!ensure()) return;
      const t = now();
      tone(420, t, 0.14, { type: 'sine', vol: 0.22, slideTo: 880, attack: 0.005 });
      noise(t, 0.05, { freq: 3000, vol: 0.06 });
    }

    function stopDrum() {
      if (drumBus && ac) {
        drumBus.gain.cancelScheduledValues(now());
        drumBus.gain.setTargetAtTime(0, now(), 0.015);
      }
      drumBus = null;
    }

    function drumroll(sec) {
      if (!ensure()) return;
      stopDrum();
      drumBus = ac.createGain();
      drumBus.gain.value = 1;
      drumBus.connect(master);
      const start = now() + 0.02;
      let t = start, i = 0;
      while (t < start + sec) {
        const p = (t - start) / sec;
        const vol = 0.07 + 0.26 * p;
        noise(t, 0.08, { freq: 1900, q: 0.7, vol, dest: drumBus });
        if (i % 2 === 0) tone(120, t, 0.12, { type: 'sine', vol: vol * 1.1, lp: 500, attack: 0.004, slideTo: 70, dest: drumBus });
        t += 0.12 - 0.075 * p; // accelerating roll
        i++;
      }
    }

    function reveal(rank) {
      if (!ensure()) return;
      stopDrum();
      const t = now() + 0.02;
      cymbal(t);
      const chord = rank >= 3 ? [261.63, 329.63, 392.0]
        : rank === 2 ? [293.66, 369.99, 440.0, 587.33]
        : [329.63, 415.3, 493.88, 659.25];
      tone(chord[0] / 2, t, 0.6, { vol: 0.2, lp: 700 });
      chord.forEach((f) => {
        tone(f, t, 0.18, { vol: 0.1, lp: 2200, vib: 3 });
        tone(f, t + 0.2, 1.0, { vol: 0.12, lp: 2400, vib: 4 });
      });
      tone(chord[chord.length - 1] * 2, t + 0.25, 0.6, { type: 'triangle', vol: 0.12, lp: 6000 });
    }

    function applause(sec, delay) {
      const t0 = now() + (delay || 0);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.7);
      g.gain.setValueAtTime(0.9, t0 + sec - 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + sec);
      g.connect(master);
      noise(t0, sec, { freq: 2800, q: 0.35, vol: 0.1, dest: g, flat: true });
      const claps = Math.floor(sec * 45);
      for (let i = 0; i < claps; i++) {
        const r = Math.random();
        noise(t0 + Math.random() * (sec - 0.1), 0.03 + r * 0.04, { freq: 900 + r * 3200, q: 1.2, vol: 0.12 + r * 0.2, dest: g });
      }
    }

    function fanfare() {
      if (!ensure()) return;
      stopDrum();
      const t = now() + 0.02;
      const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
      const seq = [[C5, 0, 0.14], [C5, 0.17, 0.14], [C5, 0.34, 0.14], [E5, 0.55, 0.32],
                   [C5, 0.95, 0.2], [E5, 1.2, 0.2], [G5, 1.5, 0.5], [C6, 2.1, 1.4]];
      seq.forEach(([f, o, d]) => {
        tone(f, t + o, d + 0.15, { vol: 0.16, lp: 2600, vib: 4 });
        tone(f / 2, t + o, d + 0.15, { vol: 0.1, lp: 1400, vib: 3 });
      });
      [261.63, 329.63, 392, 523.25].forEach((f) => tone(f, t + 2.1, 1.7, { vol: 0.11, lp: 1800, vib: 3 }));
      cymbal(t);
      cymbal(t + 2.1);
      for (let i = 0; i < 10; i++) {
        tone(1568 + Math.random() * 2200, t + 2.1 + i * 0.07, 0.3, { type: 'sine', vol: 0.05, lp: 9000 });
      }
      applause(5.5, 2.0);
    }

    function setMuted(m) {
      muted = m;
      if (master && ac) master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.03);
    }

    function shutdown() {
      try { if (ac) ac.close(); } catch (e) { /* ignore */ }
      ac = null; master = null; drumBus = null;
    }

    return { ensure, intro, pop, drumroll, stopDrum, reveal, fanfare, setMuted, shutdown, isMuted: () => muted };
  })();

  /* ---- 11b. KONFETTI & FEUERWERK ------------------------------------------- */
  const Confetti = (() => {
    const COLORS = ['#a8342a', '#c9573f', '#b8935a', '#d8b478', '#2f5f8a', '#4a7a4a', '#6a4a8a', '#e0a82a'];
    const EMOJIS = ['🎉', '🎊', '⭐', '✨', '🎲', '🏆', '💫', '🥳'];
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let canvas = null, c = null, w = 0, h = 0, parts = [], raf = null, rainUntil = 0;

    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function attach(cv) {
      canvas = cv;
      c = cv.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
    }

    function detach() {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      raf = null; parts = []; rainUntil = 0; canvas = null; c = null;
    }

    function piece(x, y, vx, vy, g, drag, life, emojiRatio) {
      const emoji = Math.random() < emojiRatio ? pick(EMOJIS) : null;
      return {
        x, y, vx, vy, g, drag, life, emoji,
        size: rnd(16, 30), w: rnd(6, 13), h: rnd(4, 9),
        rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), tilt: rnd(0, 6.28), color: pick(COLORS),
      };
    }

    /** Konfetti-Kanone. fx/fy = Position in Bildschirmbruchteilen (0..1). */
    function burst(fx, fy, n, o = {}) {
      if (!c) return;
      const { angle = -90, spread = 360, speed = 14, gravity = 0.32, drag = 0.985, life = 140, emoji = 0 } = o;
      const count = reduced ? Math.ceil(n * 0.3) : n;
      for (let i = 0; i < count; i++) {
        const a = (angle + (Math.random() - 0.5) * spread) * Math.PI / 180;
        const s = speed * (0.35 + Math.random() * 0.85);
        parts.push(piece(fx * w, fy * h, Math.cos(a) * s, Math.sin(a) * s, gravity, drag, life * rnd(0.8, 1.2), emoji));
      }
      kick();
    }

    /** Feuerwerk: strahlenförmige Funken. */
    function firework(fx, fy) {
      if (!c) return;
      const color = pick(COLORS);
      const count = reduced ? 14 : 55;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rnd(2, 8);
        parts.push({
          spark: true, x: fx * w, y: fy * h, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          g: 0.07, drag: 0.962, life: rnd(55, 85), r: rnd(1.8, 3.4), color: Math.random() < 0.25 ? '#e0a82a' : color,
        });
      }
      kick();
    }

    function rain(ms) {
      rainUntil = performance.now() + ms;
      kick();
    }

    function frame() {
      if (!c) return;
      c.clearRect(0, 0, w, h);
      const t = performance.now();
      if (t < rainUntil && !reduced) {
        for (let i = 0; i < 2; i++) {
          parts.push(piece(rnd(0, w), -14, rnd(-1.2, 1.2), rnd(1.5, 3.5), 0.03, 0.995, 420, 0));
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0 || p.y > h + 60) { parts.splice(i, 1); continue; }
        c.globalAlpha = Math.min(1, p.life / 30);
        if (p.spark) {
          c.fillStyle = p.color;
          c.beginPath();
          c.arc(p.x, p.y, p.r, 0, 6.283);
          c.fill();
        } else if (p.emoji) {
          p.rot += p.vr;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot * 0.3);
          c.font = p.size + 'px serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(p.emoji, 0, 0);
          c.restore();
        } else {
          p.rot += p.vr;
          p.tilt += 0.12;
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, Math.cos(p.tilt));
          c.fillStyle = p.color;
          c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          c.restore();
        }
      }
      c.globalAlpha = 1;
      raf = (parts.length || performance.now() < rainUntil) ? requestAnimationFrame(frame) : null;
    }

    function kick() {
      if (!raf && c) raf = requestAnimationFrame(frame);
    }

    function clear() {
      parts = []; rainUntil = 0;
      if (c) c.clearRect(0, 0, w, h);
    }

    return { attach, detach, burst, firework, rain, clear };
  })();

  /* ---- 11c. ABLAUF (manuell: Pfeile vor / zurück) -------------------------- */
  const Ceremony = (() => {
    let root = null, token = 0, sleepers = [], entries = [], lastFocus = null, onKey = null;
    let ui = null, steps = [], cur = 0, busy = false;

    const el = (tag, cls, html) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html !== undefined) e.innerHTML = html;
      return e;
    };

    /** Abbrechbares Warten (z. B. Trommelwirbel) – "Weiter" überspringt es. */
    const sleep = (ms) => new Promise((res) => {
      const s = { res };
      s.t = setTimeout(() => { sleepers = sleepers.filter((x) => x !== s); res(); }, ms);
      sleepers.push(s);
    });
    function skipWait() {
      const list = sleepers;
      sleepers = [];
      list.forEach((s) => { clearTimeout(s.t); s.res(); });
    }

    function buildEntries() {
      const list = players
        .map((p) => ({ name: p.name, color: p.colorHue, total: playerGrandTotal(p) }))
        .sort((a, b) => b.total - a.total);
      let rank = 0;
      list.forEach((e, i) => {
        if (i === 0 || e.total !== list[i - 1].total) rank = i + 1; // Gleichstand = gleicher Platz
        e.rank = rank;
      });
      return list;
    }

    const medalFor = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉');

    function countUp(node, to, ms) {
      const t0 = performance.now();
      const step = (t) => {
        if (!node.isConnected) return;
        const p = Math.min(1, (t - t0) / ms);
        node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    const ARROW_L = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    const ARROW_R = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

    function open() {
      if (root) return;
      lastFocus = document.activeElement;
      root = el('div', 'ceremony');
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', 'Siegerehrung');
      root.tabIndex = -1;
      root.innerHTML =
        '<canvas class="cer-confetti" aria-hidden="true"></canvas>' +
        '<div class="cer-flash" aria-hidden="true"></div>' +
        '<button type="button" class="cer-close" aria-label="Siegerehrung schließen">&times;</button>' +
        '<div class="cer-stage"></div>' +
        '<button type="button" class="cer-nav cer-prev" aria-label="Zurück" title="Zurück (←)">' + ARROW_L + '</button>' +
        '<button type="button" class="cer-nav cer-next" aria-label="Weiter" title="Weiter (→)">' + ARROW_R + '</button>';
      document.body.appendChild(root);
      document.body.classList.add('ceremony-open');

      Confetti.attach(root.querySelector('.cer-confetti'));

      root.querySelector('.cer-close').addEventListener('click', close);
      root.querySelector('.cer-prev').addEventListener('click', back);
      root.querySelector('.cer-next').addEventListener('click', next);

      onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); back(); }
      };
      document.addEventListener('keydown', onKey);

      Sfx.ensure(); // wird durch den Klick auf "Auswertung starten" freigeschaltet
      root.focus();
      restart();
    }

    /** Von vorn beginnen (beim Öffnen und bei "Nochmal ansehen"). */
    function restart() {
      token++;
      skipWait();
      Sfx.stopDrum();
      Confetti.clear();
      entries = buildEntries();
      rebuild();
      cur = 0;
      run(0);
    }

    /** Baut Bühne + Schritte neu auf (ohne etwas anzuzeigen). */
    function rebuild() {
      ui = buildStage();
      steps = makeSteps();
    }

    function buildStage() {
      const stage = root.querySelector('.cer-stage');
      stage.innerHTML = '';
      stage.classList.remove('cer-shake');

      const title = el('div', 'cer-title', 'Siegerehrung');
      const sub = el('div', 'cer-subtitle', '&nbsp;');
      const podium = el('div', 'cer-podium');
      const rest = el('ol', 'cer-rest');
      const actions = el('div', 'cer-actions');

      const top = entries.slice(0, 3);
      const order = top.length === 1 ? [0] : top.length === 2 ? [1, 0] : [1, 0, 2];
      const slots = [];
      order.forEach((idx) => {
        const e = top[idx];
        const slot = el('div', 'cer-slot rank-' + Math.min(e.rank, 3));
        slot.style.setProperty('--pc', e.color);
        slot.innerHTML =
          '<div class="cer-person">' +
            '<div class="cer-medal">' + medalFor(e.rank) + '</div>' +
            '<div class="cer-name">' + escapeHtml(e.name) + '</div>' +
            '<div class="cer-score"><span class="cer-score-num">0</span> <small>Punkte</small></div>' +
          '</div>' +
          '<div class="cer-block">?</div>';
        podium.appendChild(slot);
        slots[idx] = slot;
      });

      entries.slice(3).forEach((e) => {
        rest.appendChild(el('li', 'cer-rest-item',
          '<span class="cer-rest-rank">' + e.rank + '.</span>' +
          '<span class="cer-rest-name"><i style="background:' + e.color + '"></i>' + escapeHtml(e.name) + '</span>' +
          '<span class="cer-rest-score">' + e.total + ' <small>Punkte</small></span>'));
      });

      const replay = el('button', 'cer-action', '↻ Nochmal ansehen');
      replay.type = 'button';
      replay.addEventListener('click', restart);
      const done = el('button', 'cer-action cer-action-primary', 'Fertig');
      done.type = 'button';
      done.addEventListener('click', close);
      actions.append(replay, done);

      stage.append(title, sub, podium, rest, actions);
      return { stage, title, sub, rest, actions, slots };
    }

    /* ---- Schritte -----------------------------------------------------------
       Jeder Schritt hat zwei Varianten:
         play()    – animiert, mit Sound & Konfetti (beim Weiterklicken)
         instant() – setzt nur den Endzustand (beim Zurückgehen)             */
    function makeSteps() {
      const list = [];
      const setSub = (html, animate) => {
        ui.sub.innerHTML = html;
        ui.sub.classList.remove('swap');
        if (animate) { void ui.sub.offsetWidth; ui.sub.classList.add('swap'); }
      };
      const flash = () => {
        const f = root && root.querySelector('.cer-flash');
        if (!f) return;
        f.classList.remove('go');
        void f.offsetWidth;
        f.classList.add('go');
      };
      const wait = async (ms, alive) => { await sleep(ms); return alive(); };

      // 0) Intro
      list.push({
        instant() {
          ui.title.classList.add('is-in', 'instant');
          setSub('Und die Plätze lauten …', false);
        },
        async play() {
          ui.title.classList.add('is-in');
          setSub('Und die Plätze lauten …', true);
          Sfx.intro();
          Confetti.burst(0.5, 0.3, 50, { speed: 12 });
        },
      });

      // 1..n) Plätze ab 4, von hinten nach vorn
      const items = Array.from(ui.rest.children);
      for (let i = items.length - 1; i >= 0; i--) {
        const e = entries[3 + i];
        const text = 'Platz ' + e.rank + ': <b>' + escapeHtml(e.name) + '</b>';
        list.push({
          instant() { items[i].classList.add('is-in', 'instant'); setSub(text, false); },
          async play() {
            items[i].classList.add('is-in', i % 2 ? 'from-right' : 'from-left');
            Sfx.pop();
            Confetti.burst(i % 2 ? 0.8 : 0.2, 0.7, 14, { speed: 9, spread: 120 });
            setSub(text, true);
          },
        });
      }

      // Treppchen: Platz 3 -> 2 -> 1
      for (let idx = Math.min(entries.length, 3) - 1; idx >= 0; idx--) {
        const e = entries[idx];
        const slot = ui.slots[idx];
        const isFinale = idx === 0;
        const winners = entries.filter((x) => x.rank === 1);
        const names = winners.map((x) => escapeHtml(x.name)).join(' &amp; ');
        const afterText = isFinale
          ? (winners.length > 1 ? 'Gleichstand! <b>' + names + '</b>' : 'Herzlichen Glückwunsch, <b>' + names + '</b>!')
          : medalFor(e.rank) + ' <b>' + escapeHtml(e.name) + '</b> – Platz ' + e.rank + '!';

        list.push({
          instant() {
            slot.classList.add('is-revealed', 'instant');
            slot.querySelector('.cer-block').textContent = e.rank;
            slot.querySelector('.cer-score-num').textContent = e.total;
            setSub(afterText, false);
            if (isFinale) ui.actions.classList.add('is-in');
          },
          async play(alive) {
            slot.classList.add('is-spot');
            setSub(isFinale ? 'Und der Sieg geht an …' : 'Auf Platz ' + e.rank + ' …', true);
            const dur = isFinale ? 3.2 : 1.8;
            Sfx.drumroll(dur);
            if (!(await wait(dur * 1000, alive))) return;

            slot.classList.remove('is-spot');
            slot.classList.add('is-revealed');
            slot.querySelector('.cer-block').textContent = e.rank;
            countUp(slot.querySelector('.cer-score-num'), e.total, 1400);
            flash();
            setSub(afterText, true);

            if (!isFinale) {
              Sfx.reveal(e.rank);
              const r = slot.getBoundingClientRect();
              Confetti.burst((r.left + r.width / 2) / window.innerWidth, Math.max(0.25, r.top / window.innerHeight), 70,
                { speed: 13, spread: 140 });
              return;
            }

            // ---- Finale ----
            Sfx.fanfare();
            ui.stage.classList.add('cer-shake');
            Confetti.burst(0.5, 0.45, 140, { speed: 18, gravity: 0.28, life: 170 });
            Confetti.burst(0.03, 1, 100, { angle: -62, spread: 34, speed: 27, gravity: 0.4, life: 170 });
            Confetti.burst(0.97, 1, 100, { angle: -118, spread: 34, speed: 27, gravity: 0.4, life: 170 });
            Confetti.rain(10000);
            ui.actions.classList.add('is-in');
            fireworks(alive); // läuft im Hintergrund, blockiert "Zurück" nicht
          },
        });
      }
      return list;
    }

    async function fireworks(alive) {
      for (let i = 0; i < 9; i++) {
        await sleep(900);
        if (!alive()) return;
        Confetti.firework(0.12 + Math.random() * 0.76, 0.12 + Math.random() * 0.4);
        if (i % 3 === 2) {
          Confetti.burst(0.03, 1, 50, { angle: -62, spread: 34, speed: 25, gravity: 0.4 });
          Confetti.burst(0.97, 1, 50, { angle: -118, spread: 34, speed: 25, gravity: 0.4 });
        }
      }
    }

    /** Führt den animierten Schritt i aus. */
    async function run(i) {
      token++;
      const my = token;
      busy = true;
      syncNav();
      await steps[i].play(() => my === token);
      if (my === token) { busy = false; syncNav(); }
    }

    function next() {
      if (!root) return;
      if (busy) { skipWait(); return; }          // Trommelwirbel überspringen
      if (cur >= steps.length - 1) return;
      cur++;
      run(cur);
    }

    function back() {
      if (!root || cur <= 0) return;
      token++;                                    // laufende Animation abbrechen
      skipWait();
      Sfx.stopDrum();
      Confetti.clear();
      busy = false;
      cur--;
      rebuild();
      for (let j = 0; j <= cur; j++) steps[j].instant();
      syncNav();
    }

    function syncNav() {
      if (!root) return;
      const prev = root.querySelector('.cer-prev');
      const nxt = root.querySelector('.cer-next');
      prev.disabled = cur <= 0;
      nxt.disabled = !busy && cur >= steps.length - 1;
      nxt.classList.toggle('is-ready', !busy && cur < steps.length - 1);
    }

    function close() {
      if (!root) return;
      token++;
      skipWait();
      Sfx.shutdown();
      Confetti.detach();
      document.removeEventListener('keydown', onKey);
      const r = root;
      root = null;
      r.classList.add('is-closing');
      document.body.classList.remove('ceremony-open');
      setTimeout(() => r.remove(), 350);
      // Nach der Zeremonie darf das Endergebnis auf dem Blatt gelüftet werden.
      revealed = true;
      updateAllScores();
      mpBroadcast();
      showToast('Endergebnis aufgedeckt.', 'success');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    return { open, close };
  })();

  /** Zählt Felder, die weder ausgefüllt noch durchgestrichen sind. */
  function countOpenFields() {
    let n = 0;
    players.forEach((p) => p.sheets.forEach((sheet, i) => {
      const st = (p.struck && p.struck[i]) || {};
      EDITABLE_ROW_IDS.forEach((id) => {
        if ((sheet[id] === null || sheet[id] === undefined) && !st[id]) n++;
      });
    }));
    return n;
  }

  function startEvaluation() {
    if (players.length === 0) {
      showToast('Füge zuerst mindestens einen Spieler hinzu.', 'error');
      return;
    }
    const open = countOpenFields();
    if (open > 0 && !window.confirm('Es sind noch ' + open + ' Felder offen. Trotzdem auswerten?')) return;
    Ceremony.open();
  }

  /* ===========================================================================
     12. EINSTELLUNGEN & KOMFORT (v1.3)
     ---------------------------------------------------------------------------
       12a. Einstellungen (Zettel-Design, Wach halten, Wer ist dran)
       12b. Wake Lock (Bildschirm bleibt an)
       12c. Namen & letzte Gruppe merken
     Einstellungen und Gruppe liegen in eigenen localStorage-Schlüsseln, damit
     "Neues Blatt" sie nicht löscht.
     =========================================================================== */

  /* ---- 12a. EINSTELLUNGEN -------------------------------------------------- */
  const SETTINGS_KEY = 'kniffelblock.settings.v1';

  const THEMES = [
    { id: 'paper',  label: 'Papier',      color: '#f3ead9', accent: '#a8342a', meta: '#c8482f' },
    { id: 'grid',   label: 'Kariert',     color: '#fdfdfb', accent: '#2f5f8a', meta: '#2f5f8a' },
    { id: 'coaster',label: 'Bierdeckel',  color: '#d8b98a', accent: '#8a2a1c', meta: '#3b2415' },
    { id: 'chalk',  label: 'Tafel',       color: '#2f3b36', accent: '#e8c46a', meta: '#2f3b36' },
  ];

  let settings = { theme: 'paper', wakeLock: true, turnMarker: true, strikeButton: true, multiplayer: false };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && THEMES.some((t) => t.id === s.theme)) settings.theme = s.theme;
      if (typeof s.wakeLock === 'boolean') settings.wakeLock = s.wakeLock;
      if (typeof s.turnMarker === 'boolean') settings.turnMarker = s.turnMarker;
      if (typeof s.strikeButton === 'boolean') settings.strikeButton = s.strikeButton;
      if (typeof s.multiplayer === 'boolean') settings.multiplayer = s.multiplayer;
    } catch (err) { /* ignore */ }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) { /* ignore */ }
  }

  /** Design-Schriften werden erst geladen, wenn das Design gewählt wird. */
  const THEME_FONTS = {
    grid:    'family=Patrick+Hand&family=Kalam:wght@400;700',
    coaster: 'family=Alfa+Slab+One&family=Permanent+Marker',
    chalk:   'family=Gloria+Hallelujah&family=Gochi+Hand',
  };

  function loadThemeFonts(id) {
    const q = THEME_FONTS[id];
    if (!q || document.getElementById('font-' + id)) return;
    const link = document.createElement('link');
    link.id = 'font-' + id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + q + '&display=swap';
    document.head.appendChild(link);
  }

  function applyTheme() {
    loadThemeFonts(settings.theme);
    document.body.dataset.theme = settings.theme;
    document.body.classList.toggle('hide-strike', !settings.strikeButton);
    const t = THEMES.find((x) => x.id === settings.theme) || THEMES[0];
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.meta);
  }

  const WAKE_SUPPORTED = 'wakeLock' in navigator;

  function buildSettingsPanel() {
    const p = els.settingsPanel;
    const row = (id, label, hint, extra) =>
      '<label class="switch-row"><span class="switch-text">' + label +
        (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
        '<input type="checkbox" id="' + id + '"' + (extra || '') + '><i class="switch-ui"></i></label>';

    p.innerHTML =
      '<div class="settings-head"><span>Einstellungen</span>' +
        '<button type="button" class="settings-close" aria-label="Einstellungen schließen">&times;</button></div>' +
      '<div class="settings-section">' +
        '<div class="settings-title">Zettel-Design</div>' +
        '<div class="theme-grid" role="radiogroup" aria-label="Zettel-Design">' +
          THEMES.map((t) =>
            '<button type="button" class="theme-option" role="radio" data-theme-id="' + t.id + '" aria-checked="false">' +
              '<span class="theme-swatch theme-swatch-' + t.id + '"><b></b><i></i><u></u></span>' +
              '<span class="theme-name">' + t.label + '</span>' +
            '</button>').join('') +
        '</div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="settings-title">Anzeige</div>' +
        row('set-senior', 'Rentner-Modus', 'Große Schrift & starke Farben') +
        row('set-strike', 'Streichen-Knopf (−)') +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="settings-title">Spiel</div>' +
        row('set-turn', 'Wer ist dran hervorheben') +
        row('set-wake', 'Bildschirm wach halten', WAKE_SUPPORTED ? '' : 'Von diesem Browser nicht unterstützt', WAKE_SUPPORTED ? '' : ' disabled') +
      '</div>' +
      '<div class="settings-section settings-mp">' +
        '<div class="settings-title">Multiplayer</div>' +
        row('set-mp', 'Zuschauen per QR-Code', 'Mitspieler sehen ihre Spalte am eigenen Handy') +
        '<div class="mp-actions" id="mp-actions" hidden>' +
          '<button type="button" class="mp-qr-btn" id="mp-qr-btn">QR-Code anzeigen</button>' +
          '<span class="mp-status" id="mp-status"></span>' +
        '</div>' +
      '</div>';

    p.querySelector('.settings-close').addEventListener('click', () => toggleSettingsPanel(false));

    p.querySelectorAll('.theme-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        settings.theme = btn.dataset.themeId;
        saveSettings();
        applyTheme();
        syncSettingsPanel();
      });
    });
    p.querySelector('#set-wake').addEventListener('change', (e) => {
      settings.wakeLock = e.target.checked;
      saveSettings();
      if (settings.wakeLock) requestWakeLock(); else releaseWakeLock();
    });
    p.querySelector('#set-strike').addEventListener('change', (e) => {
      settings.strikeButton = e.target.checked;
      saveSettings();
      applyTheme();
    });
    p.querySelector('#set-senior').addEventListener('change', (e) => setSeniorMode(e.target.checked));
    p.querySelector('#set-mp').addEventListener('change', (e) => {
      settings.multiplayer = e.target.checked;
      saveSettings();
      applyMultiplayer();
      updateMpUI();
    });
    p.querySelector('#mp-qr-btn').addEventListener('click', () => { toggleSettingsPanel(false); openQrModal(); });
    p.querySelector('#set-turn').addEventListener('change', (e) => {
      settings.turnMarker = e.target.checked;
      saveSettings();
      updateTurnMarker();
      mpBroadcast();
    });
    syncSettingsPanel();
    if (viewerMode) {            // Zuschauer haben weder Multiplayer-Host noch Streichen-Knopf
      p.querySelector('.settings-mp').remove();
      p.querySelector('#set-strike').closest('label').remove();
    }
  }

  function syncSettingsPanel() {
    const p = els.settingsPanel;
    p.querySelectorAll('.theme-option').forEach((btn) => {
      const on = btn.dataset.themeId === settings.theme;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-checked', String(on));
    });
    const setChecked = (sel, val) => { const n = p.querySelector(sel); if (n) n.checked = val; };
    setChecked('#set-wake', settings.wakeLock && WAKE_SUPPORTED);
    setChecked('#set-turn', settings.turnMarker);
    setChecked('#set-strike', settings.strikeButton);
    setChecked('#set-senior', seniorMode);
    setChecked('#set-mp', settings.multiplayer);
    updateMpUI();
  }

  function toggleSettingsPanel(force) {
    const open = typeof force === 'boolean' ? force : els.settingsPanel.hidden;
    els.settingsPanel.hidden = !open;
    if (open) Object.keys(THEME_FONTS).forEach(loadThemeFonts);
    els.btnSettings.setAttribute('aria-expanded', String(open));
    els.btnSettings.classList.toggle('is-active', open);
  }

  els.btnSettings.addEventListener('click', (e) => { e.stopPropagation(); toggleSettingsPanel(); });
  els.btnDraw.addEventListener('click', drawStartPlayer);
  document.addEventListener('click', (e) => {
    if (!els.settingsPanel.hidden && !e.target.closest('#settings-panel') && !e.target.closest('#btn-settings')) toggleSettingsPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.settingsPanel.hidden) toggleSettingsPanel(false);
  });

  /* ---- 12b. WAKE LOCK ------------------------------------------------------ */
  let wakeSentinel = null;

  async function requestWakeLock() {
    if (!WAKE_SUPPORTED || !settings.wakeLock || wakeSentinel || document.visibilityState !== 'visible') return;
    try {
      wakeSentinel = await navigator.wakeLock.request('screen');
      wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
    } catch (err) {
      wakeSentinel = null; // z. B. Energiesparmodus – später erneut versuchen
    }
  }

  function releaseWakeLock() {
    if (wakeSentinel) { wakeSentinel.release().catch(() => {}); wakeSentinel = null; }
  }

  // Beim Zurückkehren in den Tab neu anfordern; Safari verlangt teils eine Nutzer-Geste.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  ['pointerdown', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, () => { if (!wakeSentinel) requestWakeLock(); }, { passive: true }));

  /* ---- 12c. NAMEN & LETZTE GRUPPE ------------------------------------------ */
  const GROUP_KEY = 'kniffelblock.group.v1';
  const RECENT_NAMES_MAX = 16;

  /** { names: [...], mode, recent: [...] } */
  function loadGroupStore() {
    try {
      const g = JSON.parse(localStorage.getItem(GROUP_KEY) || 'null');
      if (g && Array.isArray(g.names)) return { names: g.names, mode: g.mode === 'double' ? 'double' : 'single', recent: Array.isArray(g.recent) ? g.recent : [] };
    } catch (err) { /* ignore */ }
    return { names: [], mode: 'single', recent: [] };
  }

  /** Merkt sich die aktuelle Gruppe (nur eigene Namen, keine "Spieler 1"-Platzhalter). */
  function rememberGroup() {
    if (players.length === 0) return;
    const store = loadGroupStore();
    const names = players
      .filter((p) => p.nameConfirmed && p.name !== defaultNameFor(p))
      .map((p) => p.name);
    if (names.length === 0) return;
    const lower = new Set();
    let recent = [...names, ...store.recent].filter((n) => {
      const k = n.toLowerCase();
      if (lower.has(k)) return false;
      lower.add(k);
      return true;
    }).slice(0, RECENT_NAMES_MAX);
    try {
      localStorage.setItem(GROUP_KEY, JSON.stringify({ names, mode, recent }));
    } catch (err) { /* ignore */ }
  }

  /** <datalist> mit zuletzt benutzten Namen (ohne die, die schon am Tisch sitzen). */
  function refreshNameSuggestions() {
    let dl = document.getElementById('name-suggestions');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'name-suggestions';
      document.body.appendChild(dl);
    }
    const taken = new Set(players.filter((p) => p.nameConfirmed).map((p) => p.name.toLowerCase()));
    dl.innerHTML = '';
    loadGroupStore().recent.filter((n) => !taken.has(n.toLowerCase())).forEach((n) => {
      const o = document.createElement('option');
      o.value = n;
      dl.appendChild(o);
    });
  }

  function updateGroupRestoreUI() {
    const box = els.groupRestore;
    if (!box) return;
    const g = loadGroupStore();
    if (players.length > 0 || g.names.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.querySelector('.group-names').textContent = g.names.join(', ') + (g.mode === 'double' ? ' · Doppel' : '');
  }

  function restoreGroup() {
    const g = loadGroupStore();
    if (g.names.length === 0 || players.length > 0) return;
    lastEntryPlayerId = null;
    turnOverrideId = null;
    if (g.mode !== mode) { mode = g.mode; updateModeToggleUI(); }
    g.names.slice(0, MAX_PLAYERS).forEach((n) => addPlayer(n, true));
    renderBody();
    renderPlayerHeaders();
    savePlayers();
    updateEmptyHint();
    showToast('Letzte Gruppe geladen — viel Spaß!', 'success');
  }

  els.groupRestore.querySelector('button').addEventListener('click', restoreGroup);

  /* ===========================================================================
     13. MULTIPLAYER: ZUSCHAUEN PER QR-CODE (v1.7)
     ---------------------------------------------------------------------------
     Der Block auf dem Handy des Spielleiters ("Host") bleibt die einzige
     Wahrheit. Zuschauer verbinden sich per WebRTC (PeerJS) direkt mit dem Host:
       - Host: Einstellungen -> Multiplayer an -> "QR-Code anzeigen".
       - Zuschauer: QR scannen (Link mit #watch=<Raum>) -> Namen wählen.
     Der Host schickt jedem Zuschauer NUR die Daten der eigenen Spalte
     (keine anderen Spieler, kein Endergebnis, solange es verdeckt ist).
     Zuschauer können nichts eintragen, streichen oder auswerten – der Host
     ignoriert alles außer "hello", "watch" und "unwatch".
     Die Bibliotheken (peerjs.min.js, qrcode.js) werden erst bei Bedarf geladen.
     =========================================================================== */

  const APP_VERSION = '1.7';
  const SCRIPT_BASE = (document.currentScript && document.currentScript.src)
    ? new URL('.', document.currentScript.src).href : './';
  const scriptPromises = {};

  function loadScript(file, globalName) {
    if (globalName && window[globalName]) return Promise.resolve();
    if (!scriptPromises[file]) {
      scriptPromises[file] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = SCRIPT_BASE + file + '?v=' + APP_VERSION;
        s.onload = resolve;
        s.onerror = () => { delete scriptPromises[file]; reject(new Error(file)); };
        document.head.appendChild(s);
      });
    }
    return scriptPromises[file];
  }

  /** QR-Code als SVG (immer dunkel auf weiß, damit er in jedem Design scannt). */
  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
      }
    }
    const size = n + quiet * 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR-Code zum Zuschauen">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#1d1a15"/></svg>';
  }

  const safeSend = (conn, obj) => {
    try { if (conn && conn.open) conn.send(obj); } catch (err) { /* Verbindung weg */ }
  };

  /* ---- 13a. HOST ----------------------------------------------------------- */
  const MP_KEY = 'kniffelblock.mp.v1';
  const MP_MAX_VIEWERS = 12;
  const mp = { peer: null, room: null, status: 'off', msg: '', viewers: new Map(), retry: 0, bt: null };

  function newRoomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'kniffel-';
    const buf = new Uint32Array(8);
    (window.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 4294967296)) }).getRandomValues(buf);
    buf.forEach((v) => { id += chars[v % chars.length]; });
    return id;
  }

  function loadRoomId() {
    try {
      const r = JSON.parse(localStorage.getItem(MP_KEY) || 'null');
      if (r && typeof r.room === 'string' && /^kniffel-[a-z0-9]{8}$/.test(r.room)) return r.room;
    } catch (err) { /* ignore */ }
    return saveRoomId(newRoomId());
  }
  function saveRoomId(room) {
    try { localStorage.setItem(MP_KEY, JSON.stringify({ room })); } catch (err) { /* ignore */ }
    return room;
  }

  const watchLink = () => location.href.split('#')[0] + '#watch=' + mp.room;

  function setMpStatus(state, msg) {
    mp.status = state;
    mp.msg = msg || '';
    updateMpUI();
  }

  async function hostStart() {
    if (mp.peer || viewerMode || !settings.multiplayer) return;
    setMpStatus('connecting');
    try {
      await loadScript('peerjs.min.js', 'Peer');
    } catch (err) {
      setMpStatus('error', 'Verbindungsbibliothek konnte nicht geladen werden.');
      return;
    }
    if (mp.peer || !settings.multiplayer) return;

    mp.room = mp.room || loadRoomId();
    const peer = new window.Peer(mp.room, { debug: 0 });
    mp.peer = peer;

    peer.on('open', () => { if (mp.peer === peer) { mp.retry = 0; setMpStatus('ready'); } });
    peer.on('connection', onViewerConnection);
    peer.on('disconnected', () => {
      if (mp.peer !== peer || peer.destroyed) return;
      setMpStatus('connecting');
      setTimeout(() => { try { if (mp.peer === peer) peer.reconnect(); } catch (err) { /* ignore */ } }, 2000);
    });
    peer.on('close', () => {
      if (mp.peer !== peer) return;
      mp.peer = null;
      setMpStatus('error', 'Verbindung verloren – neuer Versuch …');
      setTimeout(hostStart, 4000);
    });
    peer.on('error', (err) => {
      if (mp.peer !== peer) return;
      if (err && err.type === 'unavailable-id') {
        // Die alte Sitzung hängt noch beim Vermittlungsserver: kurz warten, sonst neuer Raum.
        mp.peer = null;
        try { peer.destroy(); } catch (e) { /* ignore */ }
        if (mp.retry++ < 3) {
          setMpStatus('connecting');
          setTimeout(hostStart, 3000);
        } else {
          mp.retry = 0;
          mp.room = saveRoomId(newRoomId());
          setTimeout(hostStart, 100);
        }
        return;
      }
      if (err && (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed')) {
        setMpStatus('error', 'Keine Verbindung zum Vermittlungsserver …');
      }
    });
  }

  function hostStop() {
    const peer = mp.peer;
    mp.peer = null;
    mp.viewers.forEach((v) => { try { v.conn.close(); } catch (err) { /* ignore */ } });
    mp.viewers.clear();
    if (peer) { try { peer.destroy(); } catch (err) { /* ignore */ } }
    setMpStatus('off');
    closeQrModal();
  }

  function applyMultiplayer() {
    if (viewerMode) return;
    if (settings.multiplayer) hostStart(); else hostStop();
  }

  function onViewerConnection(conn) {
    if (mp.viewers.size >= MP_MAX_VIEWERS) {
      conn.on('open', () => { safeSend(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 400); });
      return;
    }
    const viewer = { conn, playerId: null };
    const id = conn.connectionId || String(Math.random());
    mp.viewers.set(id, viewer);
    const drop = () => { mp.viewers.delete(id); updateMpUI(); };
    conn.on('open', () => { updateMpUI(); sendRoster(viewer); });
    conn.on('data', (msg) => onViewerMessage(viewer, msg));
    conn.on('close', drop);
    conn.on('error', drop);
  }

  function sendRoster(viewer, gone) {
    safeSend(viewer.conn, {
      t: 'roster',
      gone: !!gone,
      players: players.map((p) => ({ id: p.id, name: p.name, color: p.colorHue })),
    });
  }

  /** Daten für genau EINE Spalte – nichts von anderen Spielern, kein verdecktes Endergebnis. */
  function sendState(viewer) {
    const p = players.find((x) => x.id === viewer.playerId);
    if (!p) { viewer.playerId = null; sendRoster(viewer, true); return; }
    safeSend(viewer.conn, {
      t: 'state',
      id: p.id,
      name: p.name,
      color: p.colorHue,
      mode,
      sheets: p.sheets,
      struck: p.struck,
      turn: nextPlayerToPlay() === p.id,
      revealed,
    });
  }

  function onViewerMessage(viewer, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello' || msg.t === 'unwatch') {
      if (msg.t === 'unwatch') viewer.playerId = null;
      sendRoster(viewer);
    } else if (msg.t === 'watch') {
      const id = Number(msg.playerId);
      if (players.some((p) => p.id === id)) { viewer.playerId = id; sendState(viewer); }
      else sendRoster(viewer, true);
    }
    updateMpUI();
    // alles andere (Eintragen, Streichen, Auswerten …) wird bewusst ignoriert
  }

  /** Schickt allen Zuschauern den aktuellen Stand (leicht gebündelt). */
  function mpBroadcast() {
    if (viewerMode || mp.viewers.size === 0) return;
    clearTimeout(mp.bt);
    mp.bt = setTimeout(() => {
      mp.viewers.forEach((v) => { if (v.playerId !== null) sendState(v); else sendRoster(v); });
      updateMpUI();
    }, 60);
  }

  /* ---- Host-Oberfläche: Status + QR-Fenster -------------------------------- */
  let qrModal = null;

  function mpStatusText() {
    switch (mp.status) {
      case 'connecting': return 'Verbinde …';
      case 'ready': {
        const n = mp.viewers.size;
        return n === 0 ? 'Bereit – wartet auf Scan' : n + (n === 1 ? ' Gerät verbunden' : ' Geräte verbunden');
      }
      case 'error': return mp.msg || 'Verbindungsproblem';
      default: return '';
    }
  }

  function updateMpUI() {
    const st = document.getElementById('mp-status');
    if (st) { st.textContent = mpStatusText(); st.dataset.state = mp.status; }
    const act = document.getElementById('mp-actions');
    if (act) act.hidden = !settings.multiplayer;
    if (qrModal) renderQrModal();
  }

  function openQrModal() {
    if (qrModal || viewerMode) return;
    qrModal = document.createElement('div');
    qrModal.className = 'mp-modal';
    qrModal.setAttribute('role', 'dialog');
    qrModal.setAttribute('aria-modal', 'true');
    qrModal.setAttribute('aria-label', 'QR-Code zum Zuschauen');
    qrModal.innerHTML =
      '<div class="mp-card">' +
        '<button type="button" class="mp-x" aria-label="Schließen">&times;</button>' +
        '<h2>Zuschauen per QR-Code</h2>' +
        '<div class="mp-qr" id="mp-qr"></div>' +
        '<div class="mp-link-row"><input type="text" readonly id="mp-link" aria-label="Link zum Zuschauen"><button type="button" id="mp-copy">Kopieren</button></div>' +
        '<div class="mp-state" id="mp-modal-status"></div>' +
        '<ul class="mp-viewers" id="mp-viewers"></ul>' +
      '</div>';
    document.body.appendChild(qrModal);
    qrModal.addEventListener('click', (e) => { if (e.target === qrModal) closeQrModal(); });
    qrModal.querySelector('.mp-x').addEventListener('click', closeQrModal);
    qrModal.querySelector('#mp-copy').addEventListener('click', async () => {
      const link = watchLink();
      try { await navigator.clipboard.writeText(link); showToast('Link kopiert.', 'success'); }
      catch (err) { const i = qrModal && qrModal.querySelector('#mp-link'); if (i) { i.select(); } showToast('Link markiert – bitte manuell kopieren.'); }
    });
    renderQrModal();
    if (!mp.peer) hostStart();
  }

  function closeQrModal() {
    if (!qrModal) return;
    qrModal.remove();
    qrModal = null;
  }

  async function renderQrModal() {
    if (!qrModal) return;
    const box = qrModal.querySelector('#mp-qr');
    const ready = mp.status === 'ready' && mp.room;
    if (ready) {
      const link = watchLink();
      if (box.dataset.link !== link) {
        try {
          await loadScript('qrcode.js', 'qrcode');
          if (!qrModal) return;
          box.innerHTML = qrSvg(link);
          box.dataset.link = link;
        } catch (err) {
          box.innerHTML = '<div class="mp-qr-wait">QR-Bibliothek konnte nicht geladen werden – Link unten nutzen.</div>';
        }
      }
      qrModal.querySelector('#mp-link').value = link;
    } else {
      delete box.dataset.link;
      box.innerHTML = '<div class="mp-qr-wait">' + (mp.status === 'error' ? mpStatusText() : 'Verbinde …') + '</div>';
      qrModal.querySelector('#mp-link').value = '';
    }
    qrModal.querySelector('#mp-modal-status').textContent = mpStatusText();
    const list = qrModal.querySelector('#mp-viewers');
    list.innerHTML = '';
    mp.viewers.forEach((v) => {
      const p = players.find((x) => x.id === v.playerId);
      const li = document.createElement('li');
      if (p) li.style.setProperty('--pc', p.colorHue);
      li.textContent = p ? p.name : 'wählt gerade …';
      list.appendChild(li);
    });
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && qrModal) closeQrModal(); });

  /* ---- 13b. ZUSCHAUER ------------------------------------------------------ */
  const vw = { peer: null, conn: null, retry: null, roster: [], watchId: null, watchName: null, choosing: false, picker: null, turn: false };
  if (viewerMode) {
    try { vw.watchName = sessionStorage.getItem('kniffelblock.watch.' + viewerRoom); } catch (err) { /* ignore */ }
  }

  function setViewerStatus(state, msg) {
    const bar = document.getElementById('viewer-bar');
    const text = document.getElementById('vb-text');
    if (!bar || !text) return;
    bar.hidden = false;
    bar.classList.toggle('is-live', state === 'live');
    bar.classList.toggle('is-off', state === 'offline' || state === 'error');
    bar.classList.toggle('is-turn', state === 'live' && vw.turn);
    const p = players[0];
    if (p) bar.style.setProperty('--pc', p.colorHue);
    if (state === 'live' && p) text.textContent = p.name + (vw.turn ? ' · Du bist dran!' : '');
    else if (state === 'connecting') text.textContent = 'Verbinde …';
    else if (state === 'offline') text.textContent = msg || 'Verbindung getrennt – versuche erneut …';
    else if (state === 'choosing') text.textContent = 'Wer bist du?';
    else text.textContent = msg || 'Verbindungsproblem';
    document.getElementById('vb-switch').hidden = state === 'connecting';
  }

  async function viewerStart() {
    document.body.classList.add('viewer-mode');
    document.getElementById('vb-switch').addEventListener('click', () => {
      vw.choosing = true;
      safeSend(vw.conn, { t: 'unwatch' });
      showPicker(true);
    });
    setViewerStatus('connecting');
    try {
      await loadScript('peerjs.min.js', 'Peer');
    } catch (err) {
      setViewerStatus('error', 'Verbindungsbibliothek konnte nicht geladen werden.');
      return;
    }
    viewerConnect();
  }

  function scheduleViewerRetry() {
    clearTimeout(vw.retry);
    vw.retry = setTimeout(viewerConnect, 3500);
  }

  function viewerConnect() {
    clearTimeout(vw.retry);
    if (vw.peer) {
      const old = vw.peer;
      vw.peer = null; vw.conn = null;
      try { old.destroy(); } catch (err) { /* ignore */ }
    }
    const peer = new window.Peer({ debug: 0 });
    vw.peer = peer;
    peer.on('open', () => {
      if (vw.peer !== peer) return;
      const conn = peer.connect(viewerRoom, { serialization: 'json', reliable: true });
      vw.conn = conn;
      conn.on('open', () => { if (vw.conn === conn) safeSend(conn, { t: 'hello' }); });
      conn.on('data', (msg) => { if (vw.conn === conn) onHostMessage(msg); });
      conn.on('close', () => {
        if (vw.conn !== conn) return;
        setViewerStatus('offline');
        scheduleViewerRetry();
      });
      conn.on('error', () => { /* close folgt */ });
    });
    peer.on('error', (err) => {
      if (vw.peer !== peer) return;
      setViewerStatus('offline', err && err.type === 'peer-unavailable'
        ? 'Spiel nicht gefunden – läuft der Block noch?' : 'Verbindung getrennt – versuche erneut …');
      scheduleViewerRetry();
    });
  }

  function onHostMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'roster' && Array.isArray(msg.players)) {
      vw.roster = msg.players.filter((p) => p && typeof p.name === 'string');
      const remembered = vw.watchName && vw.roster.find((p) => p.name.toLowerCase() === vw.watchName.toLowerCase());
      if (remembered && !vw.choosing) {
        pickPlayer(remembered);       // z. B. nach Verbindungsabbruch automatisch wieder zuordnen
      } else {
        vw.choosing = true;
        showPicker(vw.watchId !== null);
      }
    } else if (msg.t === 'state') {
      applyViewerState(msg);
    } else if (msg.t === 'full') {
      setViewerStatus('error', 'Es sind schon zu viele Geräte verbunden.');
    }
  }

  function pickPlayer(p) {
    vw.watchName = p.name;
    vw.choosing = false;
    try { sessionStorage.setItem('kniffelblock.watch.' + viewerRoom, p.name); } catch (err) { /* ignore */ }
    hidePicker();
    safeSend(vw.conn, { t: 'watch', playerId: p.id });
  }

  function showPicker(cancelable) {
    if (!vw.picker) {
      vw.picker = document.createElement('div');
      vw.picker.className = 'mp-modal vw-picker';
      vw.picker.setAttribute('role', 'dialog');
      vw.picker.setAttribute('aria-modal', 'true');
      vw.picker.setAttribute('aria-label', 'Namen wählen');
      document.body.appendChild(vw.picker);
    }
    const card = document.createElement('div');
    card.className = 'mp-card';
    const h = document.createElement('h2');
    h.textContent = 'Wer bist du?';
    card.appendChild(h);
    if (cancelable) {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'mp-x'; x.setAttribute('aria-label', 'Abbrechen'); x.innerHTML = '&times;';
      x.addEventListener('click', () => {
        vw.choosing = false;
        hidePicker();
        const again = vw.roster.find((p) => p.id === vw.watchId);
        if (again) safeSend(vw.conn, { t: 'watch', playerId: again.id });
      });
      card.appendChild(x);
    }
    const hint = document.createElement('p');
    hint.className = 'mp-hint';
    hint.textContent = vw.roster.length ? 'Wähle den Spieler, dem du zuschauen möchtest.' : 'Noch keine Spieler am Block – einen Moment …';
    card.appendChild(hint);
    const list = document.createElement('div');
    list.className = 'vw-list';
    vw.roster.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vw-name';
      b.style.setProperty('--pc', p.color || '#888');
      const dot = document.createElement('i');
      const label = document.createElement('span');
      label.textContent = p.name;
      b.append(dot, label);
      b.addEventListener('click', () => pickPlayer(p));
      list.appendChild(b);
    });
    card.appendChild(list);
    vw.picker.innerHTML = '';
    vw.picker.appendChild(card);
    setViewerStatus('choosing');
  }

  function hidePicker() {
    if (vw.picker) { vw.picker.remove(); vw.picker = null; }
  }

  /** Zeigt die Spalte des beobachteten Spielers (nur lesen). */
  function applyViewerState(msg) {
    if (!Array.isArray(msg.sheets)) return;
    vw.watchId = msg.id;
    vw.turn = !!msg.turn;
    hidePicker();
    mode = msg.mode === 'double' ? 'double' : 'single';
    updateModeToggleUI();
    players = [{
      id: msg.id,
      name: String(msg.name || ''),
      nameConfirmed: true,
      colorHue: msg.color,
      sheets: msg.sheets,
      struck: msg.struck || emptyStruckSheets(),
    }];
    revealed = !!msg.revealed;

    const region = document.querySelector('.scorepad-scroll-region');
    const sl = region ? region.scrollLeft : 0;
    const st = region ? region.scrollTop : 0;
    const wy = window.scrollY;
    renderBody();
    renderPlayerHeaders();
    document.querySelectorAll('#scorepad-table input').forEach((i) => {
      i.readOnly = true;
      i.tabIndex = -1;
      i.setAttribute('aria-readonly', 'true');
    });
    if (region) { region.scrollLeft = sl; region.scrollTop = st; }
    window.scrollTo(window.scrollX, wy);
    setViewerStatus('live');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (viewerMode) {
      if (vw.peer && (!vw.conn || !vw.conn.open)) viewerConnect();
    } else if (settings.multiplayer) {
      if (!mp.peer) hostStart();
      else if (mp.peer.disconnected && !mp.peer.destroyed) { try { mp.peer.reconnect(); } catch (err) { /* ignore */ } }
    }
  });

  /* ===========================================================================
     INITIALIZATION x
     =========================================================================== */

  function init() {
    loadSettings();
    applyTheme();
    buildSettingsPanel();
    requestWakeLock();
    const hadSavedGame = loadPlayers();
    updateModeToggleUI();
    applySeniorModeUI();
    renderBody();
    renderPlayerHeaders();
    updateEmptyHint();
    if (hadSavedGame && players.length > 0) {
      showToast('Dein letztes Blatt wurde geladen.');
    }
    if (viewerMode) viewerStart();
    else if (settings.multiplayer) hostStart();
  }

  init();
})();