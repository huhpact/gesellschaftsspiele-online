/**
 * Quartett-Deck: Sportwagen & Co.
 * ----------------------------------------------------------------------
 * Eigene Bilder: den Pfad bei "img" einfach ersetzen, z. B. 'decks/img/autos/mein-bild.jpg'
 * (relativ zur index.html). Ohne Bild wird automatisch ein Platzhalter gezeichnet.
 * Neue Karte: einfach einen weiteren Eintrag bei "cards" anhängen und ALLE Werte angeben.
 * Prüfen: in der App unter "Decks prüfen".
 */
window.QUARTETT_DECKS = window.QUARTETT_DECKS || [];
window.QUARTETT_DECKS.push({
  id: 'autos',
  name: 'Sportwagen & Co.',
  icon: 'fa-car',            // Font-Awesome-Symbol
  color: '#c8482f',          // Akzentfarbe der Karten
  note: "Ungefähre Herstellerangaben aktueller bzw. bekannter Modelle. Bei 0–100 km/h, Gewicht und Preis gewinnt der NIEDRIGERE Wert.",
  // better: 'high' = höherer Wert gewinnt, 'low' = niedrigerer Wert gewinnt
  stats: [
    { id: 'ps', label: 'Leistung', unit: 'PS', better: 'high', icon: 'fa-bolt' },
    { id: 'vmax', label: 'Höchstgeschwindigkeit', unit: 'km/h', better: 'high', icon: 'fa-gauge-high' },
    { id: 'acc', label: '0–100 km/h', unit: 's', better: 'low', icon: 'fa-stopwatch' },
    { id: 'weight', label: 'Gewicht', unit: 'kg', better: 'low', icon: 'fa-weight-hanging' },
    { id: 'price', label: 'Preis', unit: 'Tsd. €', better: 'low', icon: 'fa-euro-sign' },
  ],
  cards: [
    { id: 'golfgti', name: "VW Golf GTI", img: 'decks/img/autos/golfgti.jpg', values: { ps: 245, vmax: 250, acc: 6.2, weight: 1450, price: 45 } },
    { id: 'p911', name: "Porsche 911 Carrera", img: 'decks/img/autos/p911.jpeg', values: { ps: 385, vmax: 293, acc: 4.2, weight: 1505, price: 125 } },
    { id: 'm3', name: "BMW M3 Competition", img: 'decks/img/autos/m3.jpg', values: { ps: 510, vmax: 250, acc: 3.9, weight: 1730, price: 105 } },
    { id: 'rs6', name: "Audi RS 6 Avant", img: 'decks/img/autos/rs6.avif', values: { ps: 600, vmax: 305, acc: 3.6, weight: 2075, price: 140 } },
    { id: 'a45', name: "Mercedes-AMG A 45 S", img: 'decks/img/autos/a45.jpg', values: { ps: 421, vmax: 270, acc: 3.9, weight: 1620, price: 75 } },
    { id: 'models', name: "Tesla Model S Plaid", img: 'decks/img/autos/models.jpg', values: { ps: 1020, vmax: 322, acc: 2.1, weight: 2162, price: 115 } },
    { id: 'f488', name: "Ferrari 488 GTB", img: 'decks/img/autos/f488.jpeg', values: { ps: 670, vmax: 330, acc: 3.0, weight: 1475, price: 230 } },
    { id: 'huracan', name: "Lamborghini Huracán EVO", img: 'decks/img/autos/huracan.jpg', values: { ps: 640, vmax: 325, acc: 2.9, weight: 1422, price: 240 } },
    { id: 'mini', name: "Mini Cooper S", img: 'decks/img/autos/mini.jpg', values: { ps: 178, vmax: 235, acc: 6.6, weight: 1260, price: 33 } },
    { id: 'abarth', name: "Fiat 500 Abarth", img: 'decks/img/autos/abarth.jpg', values: { ps: 165, vmax: 218, acc: 7.3, weight: 1050, price: 25 } },
    { id: 'gryaris', name: "Toyota GR Yaris", img: 'decks/img/autos/gryaris.webp', values: { ps: 261, vmax: 230, acc: 5.5, weight: 1280, price: 40 } },
    { id: 'mx5', name: "Mazda MX-5", img: 'decks/img/autos/mx5.jpg', values: { ps: 184, vmax: 219, acc: 6.5, weight: 1050, price: 33 } },
    { id: 'corsa', name: "Opel Corsa", img: 'decks/img/autos/corsa.webp', values: { ps: 75, vmax: 165, acc: 13.4, weight: 1030, price: 19 } },
    { id: 'sandero', name: "Dacia Sandero", img: 'decks/img/autos/sandero.jpeg', values: { ps: 91, vmax: 177, acc: 12.4, weight: 1000, price: 14 } },
    { id: 'smart', name: "Smart fortwo", img: 'decks/img/autos/smart.webp', values: { ps: 82, vmax: 155, acc: 10.5, weight: 970, price: 18 } },
    { id: 'mustang', name: "Ford Mustang GT", img: 'decks/img/autos/mustang.jpg', values: { ps: 450, vmax: 250, acc: 4.6, weight: 1750, price: 60 } },
    { id: 'corvette', name: "Chevrolet Corvette C8", img: 'decks/img/autos/corvette.jpg', values: { ps: 502, vmax: 312, acc: 2.9, weight: 1530, price: 95 } },
    { id: 'gtr', name: "Nissan GT-R", img: 'decks/img/autos/gtr.jpeg', values: { ps: 570, vmax: 315, acc: 2.9, weight: 1760, price: 125 } },
    { id: 'r8', name: "Audi R8 V10", img: 'decks/img/autos/r8.jpg', values: { ps: 570, vmax: 330, acc: 3.4, weight: 1670, price: 160 } },
    { id: 'chiron', name: "Bugatti Chiron", img: 'decks/img/autos/chiron.jpg', values: { ps: 1500, vmax: 420, acc: 2.4, weight: 1996, price: 3000 } },
    { id: 'p720', name: "McLaren 720S", img: 'decks/img/autos/p720.jpg', values: { ps: 720, vmax: 341, acc: 2.9, weight: 1419, price: 280 } },
    { id: 'ftype', name: "Jaguar F-Type R", img: 'decks/img/autos/ftype.avif', values: { ps: 575, vmax: 300, acc: 3.5, weight: 1730, price: 110 } },
    { id: 'citroen2cv', name: "Citroën 2 CV", img: 'decks/img/autos/citroen2cv.webp', values: { ps: 29, vmax: 115, acc: 40, weight: 560, price: 8 } },
    { id: 'model3', name: "Tesla Model 3 Performance", img: 'decks/img/autos/model3.jpg', values: { ps: 513, vmax: 261, acc: 3.1, weight: 1850, price: 60 } },
    { id: 'roadster2', name: "Tesla Roadster 2", img: 'decks/img/autos/roadster2.webp', values: { ps: 1341, vmax: 370, acc: 1.0, weight: 1700, price: 300 } },
    { id: 'cybertruck', name: "Tesla Cybertruck Cyberbeast", img: 'decks/img/autos/cybertruck.jpg', values: { ps: 857, vmax: 209, acc: 2.7, weight: 3104, price: 95 } },
    { id: 'gwagon', name: "Mercedes-AMG G 63", img: 'decks/img/autos/gwagon.avif', values: { ps: 585, vmax: 220, acc: 4.4, weight: 2640, price: 200 } },
    { id: 'revuelto', name: "Lamborghini Revuelto", img: 'decks/img/autos/revuelto.avif', values: { ps: 1015, vmax: 350, acc: 2.5, weight: 1847, price: 500 } },
    { id: 'elroq', name: "Škoda Elroq 85", img: 'decks/img/autos/elroq.webp', values: { ps: 286, vmax: 180, acc: 6.6, weight: 2138, price: 46.9 } },
    { id: 'cayenne', name: "Porsche Cayenne", img: 'decks/img/autos/cayenne.webp', values: { ps: 353, vmax: 248, acc: 6.0, weight: 2055, price: 101.5 } },
    { id: 'jesko', name: "Koenigsegg Jesko Absolut", img: 'decks/img/autos/jesko.jpg', values: { ps: 1600, vmax: 531, acc: 2.46, weight: 1390, price: 5000 } },
    { id: 'golf5', name: "Volkswagen Golf V GTI", img: 'decks/img/autos/golf5.jpg', values: { ps: 200, vmax: 235, acc: 7.2, weight: 1336, price: 5 } },
  ],
});
