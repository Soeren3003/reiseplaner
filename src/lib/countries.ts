import list from "../generated/countries.json";
import type { CountryNote, Trip } from "./types";

export interface CountryInfo {
  code: string;
  name: string;
  continent: string;
  /** eigener Staat (UN-Mitglied, Vatikan, Palästina, Kosovo, Taiwan); sonst abhängiges Gebiet */
  sovereign: boolean;
  onMap: boolean;
}

export const COUNTRIES = list as CountryInfo[];
export const STATES = COUNTRIES.filter((c) => c.sovereign);
export const CONTINENTS = ["Europa", "Asien", "Afrika", "Nordamerika", "Südamerika", "Ozeanien"] as const;

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryInfo = (code: string) => byCode.get(code);

/** Anzeigename: Code → deutscher Name; unbekannte (alte Freitext-)Einträge bleiben, wie sie sind */
export const countryName = (codeOrText: string) => byCode.get(codeOrText)?.name ?? codeOrText;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

// Suche über deutsche und englische Namen, Codes und ein paar gängige Kurzformen
const lookup = new Map<string, string>();
{
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  for (const c of COUNTRIES) {
    lookup.set(norm(c.code), c.code);
    lookup.set(norm(c.name), c.code);
    try {
      lookup.set(norm(en.of(c.code) ?? ""), c.code);
    } catch {
      /* Code unbekannt */
    }
  }
  const aliases: Record<string, string> = {
    USA: "US",
    Amerika: "US",
    "Vereinigte Staaten von Amerika": "US",
    England: "GB",
    Schottland: "GB",
    Wales: "GB",
    Großbritannien: "GB",
    UK: "GB",
    Holland: "NL",
    "Tschechische Republik": "CZ",
    "Russische Föderation": "RU",
    Korea: "KR",
    Elfenbeinküste: "CI",
    Kapverden: "CV",
    Swasiland: "SZ",
    Mazedonien: "MK",
    Osttimor: "TL",
    Burma: "MM",
    Palästina: "PS",
    Vatikan: "VA",
    Kongo: "CG",
    Dubai: "AE",
    VAE: "AE",
    Emirate: "AE",
    Mallorca: "ES",
    Kanaren: "ES",
    Teneriffa: "ES",
    Kreta: "GR",
    Kos: "GR",
    Rhodos: "GR",
    Bali: "ID",
    Madeira: "PT",
    Azoren: "PT",
    Sizilien: "IT",
    Sardinien: "IT",
    Korsika: "FR",
    Hawaii: "US",
  };
  for (const [k, v] of Object.entries(aliases)) lookup.set(norm(k), v);
}

/** ISO-Code zu einem Ländernamen (deutsch, englisch, Code oder gängige Kurzform); null = unbekannt */
export function findCountryCode(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return lookup.get(norm(t)) ?? null;
}

/** Ältere Freitext-Länder in Codes umwandeln; Unbekanntes bleibt als Text erhalten, Doppeltes fällt weg */
export function migrateCountryList(values: string[]): string[] {
  return [...new Set(values.map((v) => findCountryCode(v) ?? v.trim()).filter(Boolean))];
}

// ---------- Bereist, geplant, Favorit ----------

export type CountryStatus = "visited" | "planned" | "none";

export interface CountryState {
  code: string;
  status: CountryStatus;
  favorite: boolean;
  /** Reisen in dieses Land (ohne abgesagte), älteste zuerst */
  trips: Trip[];
  /** von Hand als bereist markiert (z. B. Reisen vor der App) */
  manual: boolean;
  /** frühestes bekanntes Jahr */
  firstYear: string;
}

/** Ist die Reise schon gemacht? Status „Gereist“ oder Ende vorbei (außer Ideen und Absagen). */
export function tripTravelled(t: Trip, today: string) {
  if (t.status === "cancelled" || t.status === "idea") return false;
  return t.status === "done" || (!!t.endDate && t.endDate < today) || (!!t.startDate && t.startDate <= today);
}

export function countryStates(trips: Trip[], notes: CountryNote[], today: string): Map<string, CountryState> {
  const out = new Map<string, CountryState>();
  const get = (code: string) => {
    let s = out.get(code);
    if (!s) {
      s = { code, status: "none", favorite: false, trips: [], manual: false, firstYear: "" };
      out.set(code, s);
    }
    return s;
  };
  const year = (s: CountryState, y: string) => {
    if (y && (!s.firstYear || y < s.firstYear)) s.firstYear = y;
  };
  for (const t of trips.slice().sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (t.status === "cancelled") continue;
    for (const code of t.countries) {
      if (!byCode.has(code)) continue;
      const s = get(code);
      s.trips.push(t);
      if (tripTravelled(t, today)) {
        s.status = "visited";
        year(s, t.startDate.slice(0, 4));
      } else if (s.status === "none" && t.status !== "idea") s.status = "planned";
    }
  }
  for (const n of notes) {
    if (!byCode.has(n.id)) continue;
    const s = get(n.id);
    s.favorite = n.favorite;
    if (n.visited) {
      s.manual = true;
      s.status = "visited";
      year(s, n.visitedYear);
    }
  }
  return out;
}
