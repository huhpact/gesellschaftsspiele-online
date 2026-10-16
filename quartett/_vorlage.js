/**
 * VORLAGE für ein neues Quartett-Deck (wird nicht automatisch geladen).
 * 1) Datei kopieren, z. B. als decks/dinos.js
 * 2) Werte anpassen
 * 3) Dateinamen in decks/decks.js eintragen
 * 4) In der App unter "Decks prüfen" kontrollieren
 */
window.QUARTETT_DECKS = window.QUARTETT_DECKS || [];
window.QUARTETT_DECKS.push({
  id: 'dinos',                 // eindeutig, nur Kleinbuchstaben/Ziffern
  name: 'Dinosaurier',
  icon: 'fa-dragon',           // Font-Awesome-Symbol (solid)
  color: '#8a6a3a',            // Akzentfarbe
  note: 'Optionaler Hinweis zum Deck (erscheint in der Prüfung).',
  stats: [
    // better: 'high' = höher gewinnt | 'low' = niedriger gewinnt
    { id: 'length', label: 'Länge',   unit: 'm',  better: 'high', icon: 'fa-ruler-horizontal' },
    { id: 'weight', label: 'Gewicht', unit: 't',  better: 'high', icon: 'fa-weight-hanging' },
    { id: 'speed',  label: 'Tempo',   unit: 'km/h', better: 'high', icon: 'fa-gauge-high' },
  ],
  cards: [
    // img: Pfad relativ zur index.html (jpg/png/webp/svg). Leer lassen = Platzhalter.
    { id: 'trex', name: 'Tyrannosaurus Rex', img: 'decks/img/dinos/trex.jpg', values: { length: 12, weight: 8, speed: 25 } },
    { id: 'raptor', name: 'Velociraptor', img: '', values: { length: 2, weight: 0.02, speed: 40 } },
    // … mindestens 8 Karten, am besten eine durch 2, 3 oder 4 teilbare Anzahl
  ],
});
