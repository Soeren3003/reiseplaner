import list from "../generated/countries.json";
import type { CountryNote, Trip } from "./types";

export interface CountryInfo {
  code: string;
  name: string;
  continent: string;
  /** eigener Staat (UN-Mitglied, Vatikan, Palästina, Kosovo, Taiwan); sonst abhängiges Gebiet */
  sovereign: boolean;
  onMap: boolean;
  /** Fläche laut Kartendaten in km² */
  area: number;
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

/**
 * Wessen Länder? Keine Person = alle zusammen. Bei mehreren Personen:
 * - together: auf einer gemeinsamen Reise dort gewesen
 * - each:     jede der Personen war dort (auch getrennt oder ohne Reise in der App)
 * - any:      mindestens eine der Personen war dort
 */
export type GroupMode = "together" | "each" | "any";

export interface Selection {
  persons: string[];
  mode: GroupMode;
  /** „Das bin ich“: Reisen ohne eingetragene Mitreisende zählen für diese Person */
  me: string;
}

export const ALL: Selection = { persons: [], mode: "any", me: "" };

export interface CountryState {
  code: string;
  status: CountryStatus;
  favorite: boolean;
  /** Reisen in dieses Land, die zur Auswahl passen (ohne abgesagte), älteste zuerst */
  trips: Trip[];
  /** von Hand als bereist markiert (für die Auswahl) */
  manual: boolean;
  /** frühestes bekanntes Jahr */
  firstYear: string;
  /** Personen, die dort waren (bei einer Auswahl nur die ausgewählten) */
  who: string[];
}

/** Ist die Reise schon gemacht? Status „Gereist“, begonnen oder vorbei (außer Ideen und Absagen). */
export function tripTravelled(t: Trip, today: string) {
  if (t.status === "cancelled" || t.status === "idea") return false;
  return t.status === "done" || (!!t.endDate && t.endDate < today) || (!!t.startDate && t.startDate <= today);
}

/** Wer war auf der Reise? Ohne eingetragene Mitreisende: „ich“ (falls festgelegt) */
export const tripPeople = (t: Trip, me: string) => (t.travelers.length ? t.travelers : me ? [me] : []);

interface Raw {
  visits: { trip: Trip; people: string[]; travelled: boolean }[];
  manualBy: Set<string>;
  manualUnassigned: boolean;
  manualYear: string;
  favorite: boolean;
}

export function countryStates(trips: Trip[], notes: CountryNote[], today: string, sel: Selection = ALL): Map<string, CountryState> {
  const raw = new Map<string, Raw>();
  const get = (code: string) => {
    let r = raw.get(code);
    if (!r) {
      r = { visits: [], manualBy: new Set(), manualUnassigned: false, manualYear: "", favorite: false };
      raw.set(code, r);
    }
    return r;
  };
  for (const t of trips.slice().sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (t.status === "cancelled") continue;
    for (const code of new Set(t.countries)) {
      if (!byCode.has(code)) continue;
      get(code).visits.push({ trip: t, people: tripPeople(t, sel.me), travelled: tripTravelled(t, today) });
    }
  }
  for (const n of notes) {
    if (!byCode.has(n.id)) continue;
    const r = get(n.id);
    r.favorite = n.favorite;
    for (const p of n.visitedBy) r.manualBy.add(p);
    r.manualUnassigned = n.visited;
    r.manualYear = n.visitedYear;
  }

  const persons = sel.persons;
  const out = new Map<string, CountryState>();
  for (const [code, r] of raw) {
    // Reisen, die zur Auswahl passen
    const fits = (people: string[]) =>
      !persons.length || (sel.mode === "together" || persons.length === 1 ? persons.every((p) => people.includes(p)) : persons.some((p) => people.includes(p)));
    const visits = r.visits.filter((v) => fits(v.people) && v.trip.status !== "idea");
    const travelled = (p: string) => r.visits.some((v) => v.travelled && v.people.includes(p)) || r.manualBy.has(p);
    const plannedFor = (p: string) => r.visits.some((v) => !v.travelled && v.trip.status !== "idea" && v.people.includes(p));
    const allPeople = new Set([...r.visits.filter((v) => v.travelled).flatMap((v) => v.people), ...r.manualBy]);

    let visited: boolean;
    let planned: boolean;
    let manual: boolean;
    if (!persons.length) {
      visited = r.visits.some((v) => v.travelled) || r.manualBy.size > 0 || r.manualUnassigned;
      planned = r.visits.some((v) => !v.travelled && v.trip.status !== "idea");
      manual = r.manualBy.size > 0 || r.manualUnassigned;
    } else if (sel.mode === "together" && persons.length > 1) {
      visited = visits.some((v) => v.travelled);
      planned = visits.some((v) => !v.travelled);
      manual = false;
    } else if (sel.mode === "each" || persons.length === 1) {
      visited = persons.every(travelled);
      planned = persons.every((p) => travelled(p) || plannedFor(p));
      manual = persons.some((p) => r.manualBy.has(p));
    } else {
      visited = persons.some(travelled);
      planned = persons.some(plannedFor);
      manual = persons.some((p) => r.manualBy.has(p));
    }

    const years = visits.filter((v) => v.travelled).map((v) => v.trip.startDate.slice(0, 4));
    if (manual && r.manualYear) years.push(r.manualYear);
    const state: CountryState = {
      code,
      status: visited ? "visited" : planned ? "planned" : "none",
      favorite: r.favorite,
      trips: visits.map((v) => v.trip),
      manual,
      firstYear: years.filter(Boolean).sort()[0] ?? "",
      who: [...allPeople].filter((p) => !persons.length || persons.includes(p)),
    };
    if (state.status !== "none" || state.favorite || state.trips.length) out.set(code, state);
  }
  return out;
}

// ---------- Anteil an der Welt ----------

/** Landfläche der Erde laut Kartendaten, ohne Antarktis (km²) */
export const WORLD_LAND = COUNTRIES.filter((c) => c.code !== "AQ").reduce((a, c) => a + c.area, 0);

/** Anteil der bereisten Landfläche (ohne Antarktis), 0–1 */
export function landShare(codes: string[]) {
  return codes.filter((c) => c !== "AQ").reduce((a, c) => a + (byCode.get(c)?.area ?? 0), 0) / WORLD_LAND;
}
