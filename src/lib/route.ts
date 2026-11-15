import { geoDistance } from "d3-geo";
import { normPlace, resolvePlace, type GeoPoint, type PlaceIndex } from "./places";
import type { Place, Stay, Transport, TransportMode, Trip } from "./types";

const EARTH_RADIUS_KM = 6371.0088;

/** Luftlinie in km */
export const airDistance = (a: GeoPoint, b: GeoPoint) => geoDistance([a.lon, a.lat], [b.lon, b.lat]) * EARTH_RADIUS_KM;

export interface RouteLeg {
  transport: Transport;
  from: GeoPoint | null;
  to: GeoPoint | null;
  /** Luftlinie in km, falls beide Orte bekannt */
  km: number | null;
}

export interface RouteStay {
  stay: Stay;
  point: GeoPoint | null;
  /** Text, nach dem gesucht wurde (Adresse, sonst Name) */
  text: string;
}

/** Ein Ortstext der Reise mit Ergebnis der Suche */
export interface RoutePlace {
  key: string;
  text: string;
  point: GeoPoint | null;
  /** wo der Ort vorkommt, z. B. „Flug FRA → HND“ */
  usedBy: string[];
}

export interface Route {
  legs: RouteLeg[];
  stays: RouteStay[];
  places: RoutePlace[];
  /** Luftlinie je Verkehrsmittel */
  kmByMode: Partial<Record<TransportMode, number>>;
}

/** Route einer Reise: Verbindungen (ohne stornierte) in zeitlicher Reihenfolge und Unterkünfte */
export function buildRoute(trip: Trip, transports: Transport[], stays: Stay[], index: PlaceIndex | null, custom: Place[]): Route {
  const opts = { countries: trip.countries, custom };
  const places = new Map<string, RoutePlace>();
  const resolve = (text: string, use: string) => {
    const t = text.trim();
    if (!t) return null;
    const key = normPlace(t);
    let p = places.get(key);
    if (!p) {
      p = { key, text: t, point: resolvePlace(t, index, opts), usedBy: [] };
      places.set(key, p);
    }
    if (!p.usedBy.includes(use)) p.usedBy.push(use);
    return p.point;
  };

  const legs = transports
    .filter((t) => t.status !== "cancelled")
    .map((t) => {
      const name = [t.number, [t.from, t.to].filter(Boolean).join(" → ")].filter(Boolean).join(" ");
      const from = resolve(t.from, name);
      const to = resolve(t.to, name);
      return { transport: t, from, to, km: from && to ? Math.round(airDistance(from, to)) : null };
    });

  const routeStays = stays
    .filter((s) => s.status !== "cancelled")
    .map((s) => {
      // Adresse ist meist genauer („Alfama, Lissabon“); ohne Treffer der Name („Hotel Porto Ribeira“)
      const use = s.name || "Unterkunft";
      const byAddress = s.address ? resolve(s.address, use) : null;
      if (byAddress) return { stay: s, point: byAddress, text: s.address };
      const byName = s.name ? resolve(s.name, use) : null;
      if (byName && s.address) {
        // über den Namen gefunden: die nicht gefundene Adresse nicht als offenen Ort anzeigen
        const addr = places.get(normPlace(s.address));
        if (addr) addr.usedBy = addr.usedBy.filter((u) => u !== use);
      }
      if (!byName && s.address && s.name) {
        // gar nicht gefunden: nur die Adresse als offenen Ort zeigen (dort wird der Punkt gesetzt)
        const nm = places.get(normPlace(s.name));
        if (nm) nm.usedBy = nm.usedBy.filter((u) => u !== use);
      }
      return { stay: s, point: byName, text: byName || !s.address ? s.name : s.address };
    });

  const list = [...places.values()].filter((p) => p.usedBy.length > 0);

  const kmByMode: Route["kmByMode"] = {};
  for (const l of legs) if (l.km) kmByMode[l.transport.mode] = (kmByMode[l.transport.mode] ?? 0) + l.km;

  return { legs, stays: routeStays, places: list, kmByMode };
}
