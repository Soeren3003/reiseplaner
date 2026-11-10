import { describe, expect, it } from "vitest";
import {
  arrivalDate,
  bookingExpenseFields,
  bookingHasExpense,
  budgetTotal,
  dayPlan,
  homeAmount,
  missingRates,
  nightsWithoutStay,
  plannedCosts,
  rateOf,
  settle,
  settlement,
  shareOf,
  transportDuration,
  tripDays,
  tripStats,
} from "./calc";
import { defaultSettings, newActivity, newExpense, newPayment, newStay, newTransport, newTrip, templateItems } from "./defaults";
import type { Expense, Trip } from "./types";

function trip(patch: Partial<Trip> = {}): Trip {
  return { ...newTrip(defaultSettings()), id: "t", startDate: "2026-03-01", endDate: "2026-03-05", currency: "EUR", rates: { JPY: 0.0062, USD: 0.92 }, ...patch };
}

function exp(t: Trip, amount: number, patch: Partial<Expense> = {}): Expense {
  return { ...newExpense(t, "", "2026-03-02"), amount, ...patch };
}

describe("Reisedauer und Budget", () => {
  it("zählt Tage einschließlich An- und Abreise", () => {
    expect(tripDays(trip())).toBe(5);
    expect(tripDays(trip({ endDate: "2026-03-01" }))).toBe(1);
  });

  it("rechnet Tagesbudget auf die Reise hoch", () => {
    expect(budgetTotal(trip({ budgetType: "daily", budget: 100 }))).toBe(500);
    expect(budgetTotal(trip({ budgetType: "total", budget: 1800 }))).toBe(1800);
    expect(budgetTotal(trip({ budgetType: "none", budget: 1800 }))).toBe(0);
  });
});

describe("Währungen", () => {
  const t = trip();
  it("nimmt Reisekurs, eigenen Kurs oder meldet fehlenden Kurs", () => {
    expect(rateOf({ currency: "EUR" }, t)).toBe(1);
    expect(rateOf({ currency: "JPY" }, t)).toBe(0.0062);
    expect(rateOf({ currency: "JPY", rate: 0.0065 }, t)).toBe(0.0065);
    expect(rateOf({ currency: "THB" }, t)).toBeNull();
  });

  it("rechnet in die Heimatwährung um", () => {
    expect(homeAmount({ amount: 10000, currency: "JPY", rate: null }, t)).toBe(62);
    expect(homeAmount({ amount: 50, currency: "THB", rate: null }, t)).toBe(0);
  });

  it("findet Währungen ohne Kurs", () => {
    expect(missingRates(t, [exp(t, 100, { currency: "THB" }), exp(t, 5, { currency: "JPY" })], [{ price: 20, currency: "VND", status: "idea" }])).toEqual(["THB", "VND"]);
  });
});

describe("Aufteilung und Abrechnung", () => {
  const t = trip({ travelers: ["anna", "ben", "cem"] });

  it("teilt gleichmäßig auf alle oder ausgewählte Mitreisende", () => {
    const e = exp(t, 90, { paidBy: "anna" });
    expect(shareOf(e, "ben", t)).toBe(30);
    const only = exp(t, 90, { paidBy: "anna", splitAmong: ["anna", "ben"] });
    expect(shareOf(only, "cem", t)).toBe(0);
    expect(shareOf(only, "ben", t)).toBe(45);
  });

  it("gehört allein unterwegs ganz einem selbst", () => {
    const solo = trip();
    expect(shareOf(exp(solo, 40), "irgendwer", solo)).toBe(40);
  });

  it("verrechnet Ausgaben, Fremdwährung und Zahlungen", () => {
    const s = settlement(
      t,
      [exp(t, 90, { paidBy: "anna" }), exp(t, 30000, { paidBy: "ben", currency: "JPY" })],
      [{ ...newPayment("t", "cem", "anna", "2026-03-05"), amount: 20 }],
    );
    // 90 € + 186 € = 276 €, je 92 €
    expect(s.total).toBe(276);
    const b = (id: string) => s.rows.find((r) => r.personId === id)!.balance;
    expect(b("anna")).toBe(-22);
    expect(b("ben")).toBe(94);
    expect(b("cem")).toBe(-72);
    expect(s.transfers).toEqual([
      { from: "cem", to: "ben", amount: 72 },
      { from: "anna", to: "ben", amount: 22 },
    ]);
  });

  it("verliert beim Dritteln keinen Cent", () => {
    const s = settlement(t, [exp(t, 100, { paidBy: "anna" })], []);
    expect(Math.round(s.rows.reduce((a, r) => a + r.balance, 0) * 100)).toBe(0);
    expect(s.transfers.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(66.67, 1);
  });

  it("braucht möglichst wenige Überweisungen", () => {
    expect(settle([{ personId: "a", balance: 10 }, { personId: "b", balance: -10 }])).toEqual([{ from: "b", to: "a", amount: 10 }]);
  });
});

describe("Auswertung", () => {
  const t = trip({ travelers: ["anna", "ben"] });
  const list = [
    exp(t, 100, { date: "2026-03-01", category: "food", paidBy: "anna" }),
    // Unterkunft über 4 Nächte verteilt
    exp(t, 400, { date: "2026-03-01", endDate: "2026-03-04", category: "stay", paidBy: "ben" }),
    // Flug vor der Reise gebucht, nicht im Tagesdurchschnitt
    exp(t, 600, { date: "2026-01-10", category: "flight", excludeFromDaily: true, paidBy: "anna" }),
    exp(t, 5000, { date: "2026-03-03", category: "food", currency: "JPY", paidBy: "anna", splitAmong: ["anna"], method: "cash", country: "Japan" }),
  ];

  it("summiert, verteilt auf Tage und rechnet den Tagesdurchschnitt", () => {
    const s = tripStats(t, list);
    expect(s.total).toBe(1131);
    expect(s.beforeTrip).toBe(600);
    expect(s.dailyBase).toBe(531);
    expect(s.perDay).toBe(106.2);
    expect(s.daily.map((d) => d.total)).toEqual([200, 100, 131, 100, 0]);
    expect(s.byCategory[0]).toMatchObject({ key: "flight", amount: 600 });
    expect(s.byCountry.find((c) => c.key === "Japan")?.amount).toBe(31);
    expect(s.byCurrency.find((c) => c.currency === "JPY")).toMatchObject({ original: 5000, home: 31 });
  });

  it("zeigt auf Wunsch nur den eigenen Anteil", () => {
    const s = tripStats(t, list, "ben");
    expect(s.total).toBe(550);
    expect(s.byCurrency.find((c) => c.currency === "JPY")).toBeUndefined();
  });
});

describe("Transport", () => {
  const t = trip();
  it("berechnet die Dauer, auch über Nacht", () => {
    const f = { ...newTransport(t, ""), departDate: "2026-03-01", departTime: "21:40", arriveTime: "06:10" };
    expect(transportDuration(f)).toBe(510);
    expect(arrivalDate(f)).toBe("2026-03-02");
    expect(transportDuration({ ...f, arriveDate: "2026-03-02", arriveTime: "16:10" })).toBe(18 * 60 + 30);
    expect(transportDuration({ ...f, durationMin: 720 })).toBe(720);
    expect(transportDuration({ ...f, arriveTime: "" })).toBeNull();
  });
});

describe("Buchungen → Ausgaben", () => {
  const t = trip({ travelers: ["anna", "ben"] });
  const s = defaultSettings();

  it("erzeugt nur für gebuchte Einträge mit Preis eine Ausgabe", () => {
    expect(bookingHasExpense({ status: "booked", price: 10 })).toBe(true);
    expect(bookingHasExpense({ status: "option", price: 10 })).toBe(false);
    expect(bookingHasExpense({ status: "booked", price: 0 })).toBe(false);
  });

  it("übernimmt Flug als Anreise außerhalb des Tagesdurchschnitts", () => {
    const f = { ...newTransport(t, "anna"), number: "LH 714", from: "FRA", to: "HND", price: 1200, travelers: ["anna"] };
    expect(bookingExpenseFields("transport", f, s)).toMatchObject({ title: "Flug LH 714 FRA → HND", category: "flight", amount: 1200, splitAmong: ["anna"], excludeFromDaily: true, date: "2026-03-01" });
  });

  it("verteilt eine Unterkunft auf ihre Nächte", () => {
    const st = { ...newStay(t, "ben", "2026-03-01", "2026-03-04"), name: "Ryokan", price: 300 };
    expect(bookingExpenseFields("stay", st, s)).toMatchObject({ category: "stay", date: "2026-03-01", endDate: "2026-03-03", title: "Ryokan" });
  });

  it("zählt Ideen und Reservierungen als geplant", () => {
    const a = { ...newActivity(t, ""), price: 50, status: "idea" as const };
    const b = { ...newActivity(t, ""), price: 10000, currency: "JPY", status: "option" as const };
    const c = { ...newActivity(t, ""), price: 99, status: "booked" as const };
    expect(plannedCosts(t, [a, b, c])).toBe(112);
  });
});

describe("Tagesplan", () => {
  const t = trip();
  it("ordnet Transport, Unterkünfte und Aktivitäten den Tagen zu", () => {
    const stays = [{ ...newStay(t, "", "2026-03-01", "2026-03-03"), name: "A", status: "booked" as const }];
    const transports = [{ ...newTransport(t, ""), departDate: "2026-03-03", departTime: "22:00", arriveTime: "07:00", status: "booked" as const }];
    const acts = [{ ...newActivity(t, "", "2026-03-02"), title: "Museum" }];
    const plan = dayPlan(t, transports, stays, acts, []);
    expect(plan).toHaveLength(5);
    expect(plan[0].checkIns[0].name).toBe("A");
    expect(plan[1].night?.name).toBe("A");
    expect(plan[1].activities[0].title).toBe("Museum");
    expect(plan[2].night).toBeUndefined();
    // Nacht 3→4 im Nachtzug, Nacht 4→5 offen
    expect(nightsWithoutStay(t, stays, transports)).toEqual(["2026-03-04"]);
  });
});

describe("Vorlagen", () => {
  it("liest Abschnitte aus der Packliste", () => {
    const items = templateItems("t", "pack", ["Dokumente:", "Pass", "", "Kleidung:", "Socken"]);
    expect(items.map((i) => [i.group, i.title])).toEqual([
      ["Dokumente", "Pass"],
      ["Kleidung", "Socken"],
    ]);
  });
});
