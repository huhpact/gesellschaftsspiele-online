/**
 * Quartett-Deck: Länder Europas
 * ----------------------------------------------------------------------
 * Eigene Bilder: den Pfad bei "img" einfach ersetzen, z. B. 'decks/img/laender/mein-bild.jpg'
 * (relativ zur index.html). Ohne Bild wird automatisch ein Platzhalter gezeichnet.
 * Neue Karte: einfach einen weiteren Eintrag bei "cards" anhängen und ALLE Werte angeben.
 * Prüfen: in der App unter "Decks prüfen".
 */
window.QUARTETT_DECKS = window.QUARTETT_DECKS || [];
window.QUARTETT_DECKS.push({
  id: 'laender',
  name: 'Länder Europas',
  icon: 'fa-earth-europe',            // Font-Awesome-Symbol
  color: '#2f6f8f',          // Akzentfarbe der Karten
  note: "Gerundete Werte (ca. 2023). Fläche in Tausend km², BIP pro Kopf in Tausend US-Dollar.",
  // better: 'high' = höherer Wert gewinnt, 'low' = niedrigerer Wert gewinnt
  stats: [
    { id: 'pop', label: 'Einwohner', unit: 'Mio.', better: 'high', icon: 'fa-people-group' },
    { id: 'area', label: 'Fläche', unit: 'Tsd. km²', better: 'high', icon: 'fa-map' },
    { id: 'density', label: 'Bevölkerungsdichte', unit: 'Einw./km²', better: 'high', icon: 'fa-users' },
    { id: 'peak', label: 'Höchster Berg', unit: 'm', better: 'high', icon: 'fa-mountain' },
    { id: 'gdp', label: 'BIP pro Kopf', unit: 'Tsd. $', better: 'high', icon: 'fa-coins' },
  ],
  cards: [
    { id: 'de', name: "Deutschland", img: 'decks/img/laender/de.webp', values: { pop: 84, area: 358, density: 235, peak: 2962, gdp: 52 } },
    { id: 'fr', name: "Frankreich", img: 'decks/img/laender/fr.webp', values: { pop: 68, area: 551, density: 123, peak: 4806, gdp: 44 } },
    { id: 'it', name: "Italien", img: 'decks/img/laender/it.webp', values: { pop: 59, area: 301, density: 196, peak: 4808, gdp: 36 } },
    { id: 'es', name: "Spanien", img: 'decks/img/laender/es.svg', values: { pop: 48, area: 506, density: 95, peak: 3718, gdp: 32 } },
    { id: 'pl', name: "Polen", img: 'decks/img/laender/pl.webp', values: { pop: 37, area: 313, density: 118, peak: 2499, gdp: 18 } },
    { id: 'at', name: "Österreich", img: 'decks/img/laender/at.webp', values: { pop: 9, area: 84, density: 109, peak: 3798, gdp: 52 } },
    { id: 'ch', name: "Schweiz", img: 'decks/img/laender/ch.svg', values: { pop: 8.8, area: 41, density: 213, peak: 4634, gdp: 93 } },
    { id: 'nl', name: "Niederlande", img: 'decks/img/laender/nl.webp', values: { pop: 17.8, area: 42, density: 424, peak: 322, gdp: 57 } },
    { id: 'be', name: "Belgien", img: 'decks/img/laender/be.svg', values: { pop: 11.7, area: 31, density: 383, peak: 694, gdp: 50 } },
    { id: 'se', name: "Schweden", img: 'decks/img/laender/se.webp', values: { pop: 10.5, area: 450, density: 25, peak: 2104, gdp: 56 } },
    { id: 'no', name: "Norwegen", img: 'decks/img/laender/no.webp', values: { pop: 5.5, area: 385, density: 14, peak: 2469, gdp: 87 } },
    { id: 'fi', name: "Finnland", img: 'decks/img/laender/fi.svg', values: { pop: 5.6, area: 338, density: 17, peak: 1324, gdp: 53 } },
    { id: 'dk', name: "Dänemark", img: 'decks/img/laender/dk.png', values: { pop: 5.9, area: 43, density: 137, peak: 171, gdp: 67 } },
    { id: 'gr', name: "Griechenland", img: 'decks/img/laender/gr.webp', values: { pop: 10.4, area: 132, density: 79, peak: 2917, gdp: 22 } },
    { id: 'pt', name: "Portugal", img: 'decks/img/laender/pt.webp', values: { pop: 10.3, area: 92, density: 112, peak: 2351, gdp: 25 } },
    { id: 'ie', name: "Irland", img: 'decks/img/laender/ie.webp', values: { pop: 5.1, area: 70, density: 73, peak: 1041, gdp: 100 } },
    { id: 'cz', name: "Tschechien", img: 'decks/img/laender/cz.svg', values: { pop: 10.8, area: 79, density: 137, peak: 1603, gdp: 29 } },
    { id: 'hu', name: "Ungarn", img: 'decks/img/laender/hu.webp', values: { pop: 9.7, area: 93, density: 104, peak: 1014, gdp: 20 } },
    { id: 'tr', name: "Türkei", img: 'decks/img/laender/tr.webp', values: { pop: 85, area: 784, density: 109, peak: 5137, gdp: 12 } },
    { id: 'gb', name: "Vereinigtes Königreich", img: 'decks/img/laender/gb.svg', values: { pop: 67, area: 244, density: 275, peak: 1345, gdp: 49 } },
    { id: 'hr', name: "Kroatien", img: 'decks/img/laender/hr.svg', values: { pop: 3.9, area: 57, density: 68, peak: 1831, gdp: 20 } },
    { id: 'is', name: "Island", img: 'decks/img/laender/is.jpeg', values: { pop: 0.4, area: 103, density: 4, peak: 2110, gdp: 80 } },
    { id: 'lu', name: "Luxemburg", img: 'decks/img/laender/lu.webp', values: { pop: 0.66, area: 2.6, density: 253, peak: 560, gdp: 128 } },
    { id: 'ro', name: "Rumänien", img: 'decks/img/laender/ro.webp', values: { pop: 19, area: 238, density: 80, peak: 2544, gdp: 17 } },
    { id: 'ad', name: "Andorra", img: 'decks/img/laender/ad.webp', values: { pop: 0.084, area: 0.468, density: 178, peak: 2943, gdp: 74 } },
    { id: 'rs', name: "Serbien", img: 'decks/img/laender/rs.svg', values: { pop: 6.6, area: 88, density: 74, peak: 2169, gdp: 15 } },
    { id: 'mk', name: "Nordmazedonien", img: 'decks/img/laender/mk.webp', values: { pop: 1.8, area: 25, density: 71, peak: 2764, gdp: 10.5 } },
    { id: 'ru', name: "Russland", img: 'decks/img/laender/ru.webp', values: { pop: 144, area: 1710, density: 8, peak: 5642, gdp: 17.5 } },
    { id: 'ua', name: "Ukraine", img: 'decks/img/laender/ua.webp', values: { pop: 39, area: 603, density: 65, peak: 2061, gdp: 5.9 } },
    { id: 'va', name: "Vatikanstadt", img: 'decks/img/laender/va.webp', values: { pop: 0.001, area: 0.00041, density: 1000, peak: 75, gdp: 64 } },
    { id: 'mc', name: "Monaco", img: 'decks/img/laender/mc.webp', values: { pop: 0.04, area: 0.002, density: 19000, peak: 161, gdp: 256 } },
    { id: 'mt', name: "Malta", img: 'decks/img/laender/mt.webp', values: { pop: 0.5, area: 0.32, density: 1731, peak: 253, gdp: 41.7 } }
    
  ],
});
