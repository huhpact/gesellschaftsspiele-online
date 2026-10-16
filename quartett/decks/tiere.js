/**
 * Quartett-Deck: Tiere
 * ----------------------------------------------------------------------
 * Eigene Bilder: den Pfad bei "img" einfach ersetzen, z. B. 'decks/img/tiere/mein-bild.jpg'
 * (relativ zur index.html). Ohne Bild wird automatisch ein Platzhalter gezeichnet.
 * Neue Karte: einfach einen weiteren Eintrag bei "cards" anhängen und ALLE Werte angeben.
 * Prüfen: in der App unter "Decks prüfen".
 */
window.QUARTETT_DECKS = window.QUARTETT_DECKS || [];
window.QUARTETT_DECKS.push({
  id: 'tiere',
  name: 'Tiere',
  icon: 'fa-paw',            // Font-Awesome-Symbol
  color: '#5a8f3c',          // Akzentfarbe der Karten
  note: "Gerundete Durchschnitts- bzw. Höchstwerte. Gefährlichkeit: grobe Einschätzung von 1 (harmlos) bis 10.",
  // better: 'high' = höherer Wert gewinnt, 'low' = niedrigerer Wert gewinnt
  stats: [
    { id: 'speed', label: 'Höchstgeschwindigkeit', unit: 'km/h', better: 'high', icon: 'fa-gauge-high' },
    { id: 'weight', label: 'Gewicht', unit: 'kg', better: 'high', icon: 'fa-weight-hanging' },
    { id: 'size', label: 'Größe / Länge', unit: 'cm', better: 'high', icon: 'fa-ruler-vertical' },
    { id: 'life', label: 'Lebenserwartung', unit: 'Jahre', better: 'high', icon: 'fa-hourglass-half' },
    { id: 'danger', label: 'Gefährlichkeit', unit: 'von 10', better: 'high', icon: 'fa-skull-crossbones' },
  ],
  cards: [
    { id: 'loewe', name: "Löwe", img: 'decks/img/tiere/loewe.svg', values: { speed: 80, weight: 190, size: 200, life: 14, danger: 8 } },
    { id: 'elefant', name: "Afrikanischer Elefant", img: 'decks/img/tiere/elefant.svg', values: { speed: 40, weight: 5000, size: 650, life: 65, danger: 7 } },
    { id: 'gepard', name: "Gepard", img: 'decks/img/tiere/gepard.svg', values: { speed: 110, weight: 50, size: 130, life: 12, danger: 5 } },
    { id: 'giraffe', name: "Giraffe", img: 'decks/img/tiere/giraffe.svg', values: { speed: 55, weight: 1200, size: 500, life: 25, danger: 2 } },
    { id: 'blauwal', name: "Blauwal", img: 'decks/img/tiere/blauwal.svg', values: { speed: 50, weight: 150000, size: 2700, life: 90, danger: 1 } },
    { id: 'eisbaer', name: "Eisbär", img: 'decks/img/tiere/eisbaer.svg', values: { speed: 40, weight: 450, size: 250, life: 25, danger: 9 } },
    { id: 'delfin', name: "Delfin", img: 'decks/img/tiere/delfin.svg', values: { speed: 55, weight: 200, size: 250, life: 30, danger: 1 } },
    { id: 'falke', name: "Wanderfalke", img: 'decks/img/tiere/falke.svg', values: { speed: 320, weight: 1, size: 45, life: 15, danger: 2 } },
    { id: 'krokodil', name: "Salzwasserkrokodil", img: 'decks/img/tiere/krokodil.svg', values: { speed: 35, weight: 500, size: 450, life: 70, danger: 9 } },
    { id: 'hai', name: "Weißer Hai", img: 'decks/img/tiere/hai.svg', values: { speed: 56, weight: 1100, size: 500, life: 70, danger: 10 } },
    { id: 'nilpferd', name: "Nilpferd", img: 'decks/img/tiere/nilpferd.svg', values: { speed: 30, weight: 1500, size: 350, life: 40, danger: 8 } },
    { id: 'nashorn', name: "Breitmaulnashorn", img: 'decks/img/tiere/nashorn.svg', values: { speed: 50, weight: 2300, size: 380, life: 40, danger: 6 } },
    { id: 'tiger', name: "Tiger", img: 'decks/img/tiere/tiger.svg', values: { speed: 65, weight: 220, size: 280, life: 15, danger: 9 } },
    { id: 'wolf', name: "Wolf", img: 'decks/img/tiere/wolf.svg', values: { speed: 60, weight: 45, size: 130, life: 12, danger: 4 } },
    { id: 'pinguin', name: "Kaiserpinguin", img: 'decks/img/tiere/pinguin.svg', values: { speed: 10, weight: 35, size: 115, life: 20, danger: 1 } },
    { id: 'kaenguru', name: "Rotes Riesenkänguru", img: 'decks/img/tiere/kaenguru.svg', values: { speed: 70, weight: 85, size: 160, life: 20, danger: 2 } },
    { id: 'gorilla', name: "Gorilla", img: 'decks/img/tiere/gorilla.svg', values: { speed: 40, weight: 170, size: 170, life: 40, danger: 5 } },
    { id: 'pferd', name: "Pferd", img: 'decks/img/tiere/pferd.svg', values: { speed: 88, weight: 500, size: 240, life: 30, danger: 2 } },
    { id: 'strauss', name: "Strauß", img: 'decks/img/tiere/strauss.svg', values: { speed: 70, weight: 120, size: 240, life: 40, danger: 3 } },
    { id: 'schildkroete', name: "Riesenschildkröte", img: 'decks/img/tiere/schildkroete.svg', values: { speed: 0.3, weight: 250, size: 120, life: 150, danger: 1 } },
    { id: 'python', name: "Netzpython", img: 'decks/img/tiere/python.svg', values: { speed: 10, weight: 100, size: 600, life: 25, danger: 6 } },
    { id: 'braunbaer', name: "Braunbär", img: 'decks/img/tiere/braunbaer.svg', values: { speed: 56, weight: 300, size: 250, life: 25, danger: 8 } },
    { id: 'schimpanse', name: "Schimpanse", img: 'decks/img/tiere/schimpanse.svg', values: { speed: 40, weight: 55, size: 90, life: 40, danger: 4 } },
    { id: 'faultier', name: "Faultier", img: 'decks/img/tiere/faultier.svg', values: { speed: 0.2, weight: 5, size: 60, life: 30, danger: 1 } },
  ],
});
