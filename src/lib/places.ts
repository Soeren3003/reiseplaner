import type { Place } from "./types";

/** Ein Ort mit Koordinaten (Grad) */
export interface GeoPoint {
  lat: number;
  lon: number;
  /** Anzeigename, z. B. „Lisbon“ oder „FRA – Frankfurt Main Airport“ */
  label: string;
  kind: "city" | "airport" | "custom";
  /** ISO-Ländercode, falls bekannt */
  cc: string;
}

type CityRow = [name: string, alts: string, lat: number, lon: number, cc: string, pop: number];
type AirportRow = [iata: string, name: string, city: string, lat: number, lon: number, cc: string];

export interface PlaceIndex {
  cities: Map<string, CityRow[]>;
  airports: Map<string, AirportRow>;
}

/** Text vergleichbar machen: klein, ohne Akzente und Satzzeichen */
export const normPlace = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function buildIndex(data: { cities: CityRow[]; airports: AirportRow[] }): PlaceIndex {
  const cities = new Map<string, CityRow[]>();
  const add = (k: string, c: CityRow) => {
    if (!k) return;
    const l = cities.get(k);
    if (!l) cities.set(k, [c]);
    else if (!l.includes(c)) l.push(c);
  };
  for (const c of data.cities) {
    add(normPlace(c[0]), c);
    for (const a of c[1] ? c[1].split("|") : []) add(normPlace(a), c);
  }
  return { cities, airports: new Map(data.airports.map((a) => [a[0], a])) };
}

/** Ortsliste (GeoNames + OurAirports) erst laden, wenn die Routenkarte gebraucht wird */
let cache: Promise<PlaceIndex> | null = null;
export function loadPlaces() {
  cache ??= import("../generated/places.json").then((m) => buildIndex(m.default as unknown as { cities: CityRow[]; airports: AirportRow[] }));
  return cache;
}

/** Wörter, die bei der Suche nach dem Ortsnamen stören („Kos City“, „Porto Hbf“, „Flughafen Wien“) */
const NOISE = new Set(
  "city stadt hbf hauptbahnhof bahnhof bf station airport flughafen intl international hafen port harbour harbor terminal centre center zentrum island insel downtown altstadt old town am main an der".split(
    " ",
  ),
);

/** Kandidaten für die Suche, vom genauesten zum ungenauesten */
export function searchTerms(text: string): string[] {
  const noBrackets = text.replace(/\([^)]*\)/g, " ");
  const inBrackets = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const parts = noBrackets.split(/[,;/|]| - | – /).map((p) => p.trim());
  // In Adressen steht der Ort meist hinten („Gion, Kyoto“, „Ribeira, Porto“) – also hinten anfangen
  const back = [...parts].reverse();
  const terms: string[] = [noBrackets, ...back, ...inBrackets];
  for (const p of back) {
    const words = normPlace(p).split(" ");
    const clean = words.filter((w) => !NOISE.has(w) && !/^\d+$/.test(w));
    terms.push(clean.join(" "));
    // „Tokio Haneda“ → „Tokio“, „Cala Ratjada Hafen“ → „Cala Ratjada“
    for (let n = clean.length - 1; n >= 1; n--) terms.push(clean.slice(0, n).join(" "));
  }
  return [...new Set(terms.map(normPlace).filter((t) => t.length >= 2))];
}

/**
 * Koordinaten zu einem Ortstext: zuerst eigene (per Klick gesetzte) Orte, dann ein IATA-Code wie „(FRA)“,
 * dann Städte. Bei mehreren gleichnamigen Städten gewinnen die Länder der Reise, sonst die größere Stadt.
 */
export function resolvePlace(text: string, index: PlaceIndex | null, opts: { countries?: string[]; custom?: Place[] } = {}): GeoPoint | null {
  const t = text.trim();
  if (!t) return null;
  const key = normPlace(t);
  const own = opts.custom?.find((p) => p.key === key);
  if (own) return { lat: own.lat, lon: own.lon, label: own.name, kind: "custom", cc: "" };
  if (!index) return null;

  const iata = t.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Z]{3}$/.test(t) ? t : null);
  const ap = iata ? index.airports.get(iata) : undefined;
  if (ap) return { lat: ap[3], lon: ap[4], label: `${ap[0]} – ${ap[1]}`, kind: "airport", cc: ap[5] };

  const countries = opts.countries ?? [];
  const terms = searchTerms(t);
  const city = (c: CityRow): GeoPoint => ({ lat: c[2], lon: c[3], label: c[0], kind: "city", cc: c[4] });
  // Hauptname vor Alternativname („Kos“ ist die griechische Stadt, nicht ein Beiname einer größeren Stadt), dann die größere
  const best = (term: string, list: CityRow[]) =>
    list.slice().sort((a, b) => Number(normPlace(b[0]) === term) - Number(normPlace(a[0]) === term) || b[5] - a[5])[0];
  // erst ein Treffer in den Ländern der Reise („Ribeira, Porto“ → Porto statt Ribeira in Spanien) …
  if (countries.length)
    for (const term of terms) {
      const hits = index.cities.get(term)?.filter((c) => countries.includes(c[4]));
      if (hits?.length) return city(best(term, hits));
    }
  // … sonst weltweit
  for (const term of terms) {
    const hits = index.cities.get(term);
    if (hits?.length) return city(best(term, hits));
  }
  return null;
}
