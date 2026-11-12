import { describe, expect, it } from "vitest";
import { COUNTRIES, STATES, countryName, countryStates, findCountryCode, migrateCountryList } from "./countries";
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
    expect(s.get("IS")?.status).toBe("none");
    expect(s.get("CA")).toBeUndefined();
    expect(s.get("FR")).toMatchObject({ status: "visited", manual: true, firstYear: "2019" });
    expect(s.get("NZ")).toMatchObject({ status: "none", favorite: true });
  });
});
