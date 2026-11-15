import { describe, expect, it } from "vitest";
import data from "../generated/places.json";
import { defaultSettings, newStay, newTransport, newTrip } from "./defaults";
import { buildIndex, normPlace, resolvePlace, searchTerms } from "./places";
import { airDistance, buildRoute } from "./route";
import type { Place } from "./types";

const index = buildIndex(data as never);
const find = (text: string, countries: string[] = []) => resolvePlace(text, index, { countries });

describe("Ortssuche", () => {
  it("erkennt Flughäfen am IATA-Code", () => {
    expect(find("Frankfurt (FRA)")).toMatchObject({ kind: "airport", cc: "DE" });
    expect(find("Tokio Haneda (HND)")?.label).toContain("HND");
    expect(find("KGS")).toMatchObject({ kind: "airport", cc: "GR" });
  });

  it("findet Städte auch mit deutschem Namen und Zusätzen", () => {
    expect(find("Lissabon")).toMatchObject({ label: "Lisbon", cc: "PT" });
    expect(find("München Hbf")).toMatchObject({ label: "Munich", cc: "DE" });
    expect(find("Kos City")).toMatchObject({ label: "Kos", cc: "GR" });
    expect(find("Odawara (Hakone)")).toMatchObject({ label: "Odawara", cc: "JP" });
    expect(find("Venedig")).toMatchObject({ cc: "IT" });
  });

  it("bevorzugt die Länder der Reise", () => {
    // „Ribeira“ gibt es als Stadt in Spanien – bei einer Portugal-Reise ist Porto gemeint
    expect(find("Ribeira, Porto", ["PT"])).toMatchObject({ label: "Porto", cc: "PT" });
    // „Gion“ gibt es auch als Stadt bei Hiroshima – in einer Adresse steht der Ort hinten
    expect(find("Gion, Kyoto", ["JP"])).toMatchObject({ label: "Kyoto" });
  });

  it("kennt unbekannte Orte nicht und nimmt selbst gesetzte zuerst", () => {
    expect(find("Caravia Beach Hotel")).toBeNull();
    const custom: Place[] = [{ id: "p", createdAt: "", updatedAt: "", key: normPlace("Caravia Beach Hotel"), name: "Caravia Beach Hotel", lat: 36.9, lon: 27.2 }];
    expect(resolvePlace("Caravia  Beach Hotel", index, { custom })).toMatchObject({ kind: "custom", lat: 36.9 });
  });

  it("zerlegt Ortstexte in Suchbegriffe", () => {
    expect(searchTerms("Kos City → Hafen")).toContain("kos");
    expect(searchTerms("Alfama, Lissabon")).toContain("lissabon");
  });
});

describe("Route", () => {
  it("berechnet Luftlinien und Unterkünfte", () => {
    const trip = { ...newTrip(defaultSettings()), countries: ["PT"] };
    const transports = [
      { ...newTransport(trip, ""), mode: "flight" as const, from: "Frankfurt (FRA)", to: "Lissabon (LIS)", status: "booked" as const },
      { ...newTransport(trip, ""), mode: "train" as const, from: "Lissabon", to: "Porto", status: "booked" as const },
      { ...newTransport(trip, ""), mode: "train" as const, from: "Porto", to: "Nirgendwo", status: "cancelled" as const },
    ];
    const stays = [{ ...newStay(trip, ""), name: "Hotel Sonne", address: "Ribeira, Porto" }];
    const r = buildRoute(trip, transports, stays, index, []);
    expect(r.legs).toHaveLength(2);
    // Frankfurt–Lissabon etwa 1.880 km, Lissabon–Porto etwa 275 km
    expect(r.legs[0].km).toBeGreaterThan(1800);
    expect(r.legs[0].km).toBeLessThan(1950);
    expect(r.legs[1].km).toBeGreaterThan(250);
    expect(r.legs[1].km).toBeLessThan(300);
    expect(r.kmByMode.train).toBe(r.legs[1].km);
    expect(r.stays[0].point?.label).toBe("Porto");
    expect(r.places.every((p) => p.point)).toBe(true);
  });

  it("misst Luftlinie auf der Kugel", () => {
    const a = { lat: 50.027, lon: 8.558, label: "", kind: "city" as const, cc: "" };
    const b = { lat: 35.55, lon: 139.787, label: "", kind: "city" as const, cc: "" };
    expect(airDistance(a, b)).toBeGreaterThan(9200);
    expect(airDistance(a, b)).toBeLessThan(9400);
  });
});
