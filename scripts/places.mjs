#!/usr/bin/env node
// Erzeugt die Ortsliste für die Routenkarte aus zwei freien Quellen:
//
//   GeoNames „cities15000“ (Städte ab 15.000 Einwohnern), CC BY 4.0
//     https://download.geonames.org/export/dump/cities15000.zip  (entpackt: cities15000.txt)
//   OurAirports „airports.csv“ (Flughäfen), gemeinfrei
//     https://davidmegginson.github.io/ourairports-data/airports.csv
//
//   npm run places -- <Ordner mit cities15000.txt und airports.csv>
//
// Ergebnis: src/generated/places.json (kompakt, Koordinaten auf 3 Nachkommastellen ≈ 100 m)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Aufruf: npm run places -- <Ordner mit cities15000.txt und airports.csv>");
  process.exit(1);
}
const root = new URL("..", import.meta.url).pathname;
const round = (n) => Math.round(Number(n) * 1000) / 1000;

// ---------- Städte (GeoNames) ----------
// Spalten: geonameid, name, asciiname, alternatenames, lat, lon, feature class, feature code, country code, … population (14)
const latin = /^[\p{Script=Latin}\p{M}\s'’.\-()]+$/u;
const cities = [];
for (const line of readFileSync(join(dir, "cities15000.txt"), "utf8").split("\n")) {
  const f = line.split("\t");
  if (f.length < 15) continue;
  const [, name, ascii, alts, lat, lon, , , cc] = f;
  const pop = Number(f[14]) || 0;
  // Alternativnamen (enthält z. B. „Lissabon“, „Mailand“, „Tokio“) nur bei größeren Städten und nur in lateinischer Schrift
  const extra = new Set();
  if (pop >= 40_000)
    for (const a of alts.split(",")) {
      const t = a.trim();
      if (t.length >= 3 && t.length <= 40 && latin.test(t) && t !== name && t !== ascii) extra.add(t);
    }
  if (ascii && ascii !== name) extra.add(ascii);
  cities.push([name, [...extra].slice(0, pop >= 1_000_000 ? 200 : 80).join("|"), round(lat), round(lon), cc, pop]);
}
cities.sort((a, b) => b[5] - a[5]);

// ---------- Flughäfen (OurAirports) ----------
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
const lines = readFileSync(join(dir, "airports.csv"), "utf8").split("\n");
const head = parseCsvLine(lines[0]);
const col = (n) => head.indexOf(n);
const [iType, iName, iLat, iLon, iCc, iCity, iSched, iIata] = ["type", "name", "latitude_deg", "longitude_deg", "iso_country", "municipality", "scheduled_service", "iata_code"].map(col);
const airports = [];
for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const f = parseCsvLine(line);
  const iata = f[iIata]?.trim();
  // nur Flughäfen mit IATA-Code und Linienverkehr bzw. größere Plätze
  if (!/^[A-Z]{3}$/.test(iata ?? "")) continue;
  if (!["large_airport", "medium_airport"].includes(f[iType]) && f[iSched] !== "yes") continue;
  airports.push([iata, f[iName], f[iCity], round(f[iLat]), round(f[iLon]), f[iCc]]);
}
airports.sort((a, b) => a[0].localeCompare(b[0]));

const out = {
  note: "Städte: GeoNames (CC BY 4.0, https://www.geonames.org/); Flughäfen: OurAirports (gemeinfrei, https://ourairports.com/)",
  cities,
  airports,
};
const json = JSON.stringify(out);
writeFileSync(join(root, "src", "generated", "places.json"), json);
console.log(`${cities.length} Städte, ${airports.length} Flughäfen, ${(json.length / 1024 / 1024).toFixed(2)} MB`);
