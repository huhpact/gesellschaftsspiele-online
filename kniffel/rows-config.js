/**
 * rows-config.js
 * ---------------------------------------------------------------------------
 * Single source of truth describing every row of the Kniffel score sheet.
 * Both the renderer (app.js -> buildBodyRows) and the calculation logic
 * (app.js -> calculateAllScores) read from this array, so the sheet
 * structure only ever has to be defined once.
 *
 * Row "type" values:
 *   "input"          -> an editable score cell for every player
 *   "bonus"          -> the special Yes/No + auto +35 bonus row
 *   "total"          -> a computed, read-only total row
 *   "total-with-bonus" -> a computed, read-only row showing another total
 *                       row's value with the upper-section bonus folded in
 *                       (e.g. "Summe oben" shows 63, this row then shows 98
 *                       once the +35 bonus is included) — see app.js ->
 *                       calculateAllScores, which writes both figures.
 *   "spacer"        -> the empty visual gap row between upper & lower sections
 *
 * Note on "Doppel" mode: this file describes WHICH categories exist on a
 * sheet, independent of how many sheets a player fills in. When the app is
 * switched to double mode (app.js -> STATE.mode), each player simply gets
 * two independent score sheets rendered side by side (see app.js ->
 * makeScoreCell / renderBody), each iterating over these same SCORE_ROWS.
 * Nothing here needs to change between single and double mode.
 * ---------------------------------------------------------------------------
 */

const SCORE_ROWS = [
  // ---------------- Upper Section ----------------
  // maxValue = 5 dice all showing that face (5 × face value) — the highest
  // score physically possible in that box.
  { id: 'ones',        label: 'Einser',        icon: 'die-1', type: 'input', section: 'upper', face: 1, maxValue: 5 },
  { id: 'twos',        label: 'Zweier',        icon: 'die-2', type: 'input', section: 'upper', face: 2, maxValue: 10 },
  { id: 'threes',      label: 'Dreier',        icon: 'die-3', type: 'input', section: 'upper', face: 3, maxValue: 15 },
  { id: 'fours',       label: 'Vierer',        icon: 'die-4', type: 'input', section: 'upper', face: 4, maxValue: 20 },
  { id: 'fives',       label: 'Fünfer',        icon: 'die-5', type: 'input', section: 'upper', face: 5, maxValue: 25 },
  { id: 'sixes',       label: 'Sechser',       icon: 'die-6', type: 'input', section: 'upper', face: 6, maxValue: 30 },
  { id: 'bonus',       label: 'Bonus',         icon: 'star',  type: 'bonus', section: 'upper', hint: 'Ab 63 Punkten: +35' },
  { id: 'upperTotal',  label: 'Summe oben',    icon: null,    type: 'total', section: 'upper' },
  { id: 'upperTotalWithBonus', label: 'Summe oben inkl. Bonus', icon: 'star', type: 'total-with-bonus', section: 'upper' },

  // ---------------- Spacer between sections ----------------
  { id: 'spacer-1', type: 'spacer' },

  // ---------------- Lower Section ----------------
  // threeKind/fourKind/chance: highest possible sum of five dice is five 6s = 30.
  { id: 'threeKind',   label: 'Dreierpasch',    icon: 'dice',    type: 'input', section: 'lower', maxValue: 30 },
  { id: 'fourKind',    label: 'Viererpasch',    icon: 'dice',    type: 'input', section: 'lower', maxValue: 30 },
  { id: 'fullHouse',   label: 'Full House',     icon: 'house',   type: 'input', section: 'lower', fixedValue: 25 },
  { id: 'smallStraight', label: 'Kleine Straße', icon: 'straight', type: 'input', section: 'lower', fixedValue: 30 },
  { id: 'largeStraight', label: 'Große Straße',  icon: 'straight', type: 'input', section: 'lower', fixedValue: 40 },
  // v1.2: Kniffel = 50, jeder weitere Kniffel +50, insgesamt bis 150 (stackStep).
  { id: 'yahtzee',     label: 'Kniffel',        icon: 'trophy',  type: 'input', section: 'lower', hint: 'Jeder weitere +50 (max. 150)', fixedValue: 50, maxValue: 150, stackStep: 50 },
  { id: 'chance',      label: 'Chance',         icon: 'sparkle', type: 'input', section: 'lower', maxValue: 30 },
  { id: 'lowerTotal',  label: 'Summe unten',    icon: null,      type: 'total', section: 'lower' },

  // ---------------- Grand Total ----------------
  { id: 'grandTotal',  label: 'Gesamtsumme',   icon: 'crown', type: 'total', section: 'grand' },
];

/**
 * IDs (in order) of rows that are actual player-editable score categories.
 * Derived once here so app.js doesn't need to re-filter repeatedly.
 */
const EDITABLE_ROW_IDS = SCORE_ROWS.filter(r => r.type === 'input').map(r => r.id);

/**
 * Returns the highest score a player may legally enter for a given row.
 * - Fixed-value categories (Full House, Straights, Kniffel) can only ever be
 *   their fixed value (or 0), so that fixed value doubles as the max.
 * - Variable categories use their explicit maxValue (see SCORE_ROWS above).
 * - Anything else (should not happen for 'input' rows) is left unbounded.
 */
function maxValueFor(row) {
  if (row.maxValue !== undefined) return row.maxValue;   // explicit max wins (Kniffel: 150)
  if (row.fixedValue !== undefined) return row.fixedValue;
  return null;
}

/** Maximum number of players allowed on one sheet. */
const MAX_PLAYERS = 6;

/** Upper section bonus threshold and reward, per official Kniffel rules. */
const BONUS_THRESHOLD = 63;
const BONUS_POINTS = 35;

/** Number of independent score sheets each player fills in, per game mode. */
const SHEETS_PER_MODE = { single: 1, double: 2 };

//hallo