import { describe, expect, it } from "vitest";
import { COUNTRIES, STATES, countryName, countryStates, findCountryCode, landShare, migrateCountryList } from "./countries";
import { defaultSettings, newCountryNote, newTrip } from "./defaults";
import type { Trip } from "./types";

const trip = (patch: Partial<Trip>): Trip => ({ ...newTrip(defaultSettings()), ...patch });

describe("Länderliste", () => {
  it("enthält 197 Staaten mit deutschen Namen und Kontinent", () => {
    expect(STATES).toHaveLength(197);
    expect(countryName("DE")).toBe("Deutschland");
    expect(countryName("GR")).toBe("Griechenland");
    expect(COUNTRIES.find((c) => c.code === "JP")?.continent).toBe("Asien");
    expect(COUNTRIES.every((c) => c.name && c.continent)).toBe(true);
  });

  it("erkennt deutsche und englische Namen, Codes und Kurzformen", () => {
    expect(findCountryCode("Griechenland")).toBe("GR");
    expect(findCountryCode("greece")).toBe("GR");
    expect(findCountryCode("gr")).toBe("GR");
    expect(findCountryCode("USA")).toBe("US");
    expect(findCountryCode("Kos")).toBe("GR");
    expect(findCountryCode("Elfenbeinküste")).toBe("CI");
    expect(findCountryCode("Côte d’Ivoire")).toBe("CI");
    expect(findCountryCode("Atlantis")).toBeNull();
  });

  it("wandelt frühere Freitext-Länder in Codes um und behält Unbekanntes", () => {
    expect(migrateCountryList(["Griechenland", "GR", " Japan ", "Atlantis"])).toEqual(["GR", "JP", "Atlantis"]);
    expect(countryName("Atlantis")).toBe("Atlantis");
  });
});

describe("Bereiste Länder", () => {
  const today = "2026-06-01";

  it("unterscheidet bereist, geplant und Favoriten", () => {
    const trips = [
      trip({ id: "a", countries: ["PT", "ES"], startDate: "2025-05-01", endDate: "2025-05-10", status: "done" }),
      trip({ id: "b", countries: ["JP"], startDate: "2026-09-01", endDate: "2026-09-14", status: "booked" }),
      trip({ id: "c", countries: ["IS"], startDate: "2026-07-01", endDate: "2026-07-05", status: "idea" }),
      trip({ id: "d", countries: ["CA"], startDate: "2024-07-01", endDate: "2024-07-05", status: "cancelled" }),
      // vergangen, aber Status nicht umgestellt: zählt trotzdem als bereist
      trip({ id: "e", countries: ["ES"], startDate: "2023-03-01", endDate: "2023-03-04", status: "booked" }),
    ];
    const notes = [
      { ...newCountryNote("FR"), visited: true, visitedYear: "2019" },
      { ...newCountryNote("NZ"), favorite: true },
    ];
    const s = countryStates(trips, notes, today);
    expect(s.get("PT")?.status).toBe("visited");
    expect(s.get("ES")).toMatchObject({ status: "visited", firstYear: "2023" });
    expect(s.get("ES")?.trips.map((t) => t.id)).toEqual(["e", "a"]);
    expect(s.get("JP")?.status).toBe("planned");
    // nur eine Idee: zählt weder als bereist noch als geplant
    expect(s.get("IS")).toBeUndefined();
    expect(s.get("CA")).toBeUndefined();
    expect(s.get("FR")).toMatchObject({ status: "visited", manual: true, firstYear: "2019" });
    expect(s.get("NZ")).toMatchObject({ status: "none", favorite: true });
  });
});

describe("Pro Person und Gruppe", () => {
  const today = "2026-06-01";
  const trips = [
    trip({ id: "pt", countries: ["PT"], startDate: "2025-05-01", endDate: "2025-05-10", status: "done", travelers: ["anna", "ben"] }),
    trip({ id: "jp", countries: ["JP"], startDate: "2024-03-01", endDate: "2024-03-10", status: "done", travelers: ["anna"] }),
    trip({ id: "it", countries: ["IT"], startDate: "2023-08-01", endDate: "2023-08-10", status: "done", travelers: ["ben"] }),
    // allein unterwegs, ohne eingetragene Mitreisende: zählt für „mich“
    trip({ id: "is", countries: ["IS"], startDate: "2022-07-01", endDate: "2022-07-10", status: "done", travelers: [] }),
    trip({ id: "no", countries: ["NO"], startDate: "2026-08-01", endDate: "2026-08-10", status: "booked", travelers: ["anna", "ben"] }),
  ];
  const notes = [{ ...newCountryNote("IT"), visitedBy: ["anna"], visitedYear: "2010" }];
  const visited = (sel: Partial<Parameters<typeof countryStates>[3]>) =>
    [...countryStates(trips, notes, today, { persons: [], mode: "together", me: "anna", ...sel }).values()]
      .filter((s) => s.status === "visited")
      .map((s) => s.code)
      .sort();

  it("zeigt die Länder einer Person, auch von Hand abgehakte", () => {
    expect(visited({ persons: ["anna"] })).toEqual(["IS", "IT", "JP", "PT"]);
    expect(visited({ persons: ["ben"] })).toEqual(["IT", "PT"]);
  });

  it("unterscheidet zusammen gereist, jeder war dort und mindestens einer", () => {
    expect(visited({ persons: ["anna", "ben"], mode: "together" })).toEqual(["PT"]);
    expect(visited({ persons: ["anna", "ben"], mode: "each" })).toEqual(["IT", "PT"]);
    expect(visited({ persons: ["anna", "ben"], mode: "any" })).toEqual(["IS", "IT", "JP", "PT"]);
  });

  it("kennt geplante gemeinsame Reisen und wer wo war", () => {
    const s = countryStates(trips, notes, today, { persons: ["anna", "ben"], mode: "together", me: "anna" });
    expect(s.get("NO")?.status).toBe("planned");
    const all = countryStates(trips, notes, today, { persons: [], mode: "any", me: "anna" });
    expect(all.get("IT")?.who.sort()).toEqual(["anna", "ben"]);
    expect(countryStates(trips, notes, today, { persons: ["anna"], mode: "any", me: "anna" }).get("IT")).toMatchObject({ manual: true, firstYear: "2010" });
  });

  it("rechnet den Anteil an der Landfläche ohne Antarktis", () => {
    expect(landShare(["RU"])).toBeGreaterThan(0.12);
    expect(landShare(["RU"])).toBeLessThan(0.13);
    expect(landShare(["AQ"])).toBe(0);
    expect(landShare(COUNTRIES.map((c) => c.code))).toBeCloseTo(1, 5);
  });
});
