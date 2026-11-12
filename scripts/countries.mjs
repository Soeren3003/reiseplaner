#!/usr/bin/env node
// Erzeugt die Länderdaten für die Weltkarte aus world-atlas (Natural Earth, gemeinfrei):
//
//   src/generated/world.json       Ländergrenzen (TopoJSON, 1:50 Mio.), jede Fläche mit ISO-3166-Code als id
//   src/generated/countries.json   Liste: Code, deutscher Name, Kontinent, eigener Staat ja/nein
//
//   npm run countries
//
// Deutsche Namen kommen aus Intl.DisplayNames (in Node bzw. im Browser eingebaut).

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const topo = structuredClone(require("world-atlas/countries-50m.json"));

// ---------- Kontinente (Staaten: UN-Mitglieder plus Vatikan, Palästina, Kosovo, Taiwan) ----------

const STATES = {
  Europa:
    "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA",
  Asien:
    "AF AM AZ BH BD BT BN KH CN GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE",
  Afrika:
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
  Nordamerika: "AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US",
  Südamerika: "AR BO BR CL CO EC GY PY PE SR UY VE",
  Ozeanien: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU",
};

// Abhängige Gebiete und Sonderfälle, die auf der Karte eigene Flächen haben
const TERRITORIES = {
  Europa: "FO AX GG JE IM GI SJ",
  Asien: "HK MO IO",
  Afrika: "EH SH RE YT",
  Nordamerika: "GL PR VI VG KY TC AW CW SX BQ MS AI BM PM MF BL GP MQ",
  Südamerika: "FK GS GF",
  Ozeanien: "NC PF GU MP AS CK NU WF PN NF TK UM",
  Antarktis: "AQ TF HM",
};

// world-atlas-Namen, die Intl.DisplayNames anders schreibt (nach ISO-Nummer bzw. Name)
const BY_NUMBER = {
  "336": "VA", "584": "MH", "580": "MP", "850": "VI", "840": "US", "239": "GS", "086": "IO", "654": "SH", "612": "PN",
  "238": "FK", "136": "KY", "092": "VG", "796": "TC", "792": "TR", "780": "TT", "728": "SS", "090": "SB", "678": "ST",
  "670": "VC", "662": "LC", "659": "KN", "184": "CK", "732": "EH", "807": "MK", "275": "PS", "666": "PM", "876": "WF",
  "663": "MF", "652": "BL", "258": "PF", "260": "TF", "248": "AX", "226": "GQ", "214": "DO", "234": "FO", "384": "CI",
  "180": "CD", "178": "CG", "446": "MO", "344": "HK", "140": "CF", "132": "CV", "104": "MM", "070": "BA", "334": "HM",
  "036": "AU", "028": "AG",
};
// Flächen ohne ISO-Nummer: werden dem Staat zugerechnet, zu dem sie völkerrechtlich gehören
const BY_NAME = { Somaliland: "SO", "N. Cyprus": "CY", "Indian Ocean Ter.": "AU", "Siachen Glacier": "IN" };

const continentOf = new Map();
const sovereign = new Set();
for (const [cont, list] of Object.entries(STATES))
  for (const c of list.split(" ")) {
    continentOf.set(c, cont);
    sovereign.add(c);
  }
for (const [cont, list] of Object.entries(TERRITORIES)) for (const c of list.split(" ")) continentOf.set(c, cont);

const en = new Intl.DisplayNames(["en"], { type: "region" });
const de = new Intl.DisplayNames(["de"], { type: "region" });
// Nur Codes aus den Tabellen oben – so kommen veraltete Codes wie DD, SU oder YU nicht in Frage.
const byEnglish = new Map([...continentOf.keys()].map((c) => [en.of(c).toLowerCase(), c]));

const problems = [];
for (const g of topo.objects.countries.geometries) {
  const name = g.properties?.name ?? "";
  const code = (g.id && BY_NUMBER[g.id]) || BY_NAME[name] || byEnglish.get(name.toLowerCase());
  if (!code) problems.push(`keine Zuordnung: ${g.id} ${name}`);
  else if (!continentOf.has(code)) problems.push(`kein Kontinent: ${code} ${name}`);
  g.id = code;
  delete g.properties;
}

const onMap = new Set(topo.objects.countries.geometries.map((g) => g.id));
for (const c of sovereign) if (!onMap.has(c)) problems.push(`Staat ohne Fläche auf der Karte (nur in der Liste): ${c} ${de.of(c)}`);

const list = [...continentOf.entries()]
  .filter(([code]) => sovereign.has(code) || onMap.has(code))
  .map(([code, continent]) => ({ code, name: de.of(code), continent, sovereign: sovereign.has(code), onMap: onMap.has(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "de"));

const out = join(root, "src", "generated");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "world.json"), JSON.stringify(topo));
writeFileSync(join(out, "countries.json"), `${JSON.stringify(list, null, 1)}\n`);

console.log(`${list.length} Länder/Gebiete, davon ${sovereign.size} Staaten; ${onMap.size} auf der Karte`);
for (const p of problems) console.log(`  Hinweis: ${p}`);
