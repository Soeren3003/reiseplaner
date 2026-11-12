import { describe, expect, it } from "vitest";
import {
  arrivalDate,
  dailyByPerson,
  stayTax,
  stayTaxExpenseFields,
  syncBookingExpenses,
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
import { boardLabel, defaultSettings, migrateExpense, migrateStay, newActivity, newExpense, newPayment, newStay, newTransport, newTrip, templateItems } from "./defaults";
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
    exp(t, 5000, { date: "2026-03-03", category: "food", currency: "JPY", paidBy: "anna", splitAmong: ["anna"], method: "Bar", country: "Japan" }),
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

describe("Pro Person und Zahlungsmittel", () => {
  const t = trip({ travelers: ["anna", "ben"] });
  const list = [
    exp(t, 100, { date: "2026-03-01", paidBy: "anna", method: "Bar" }),
    exp(t, 60, { date: "2026-03-01", paidBy: "ben", method: "Kreditkarte", splitAmong: ["ben"] }),
    exp(t, 40, { date: "2026-03-02", paidBy: "anna" }),
  ];

  it("rechnet pro Person und Tag", () => {
    const s = tripStats(t, list);
    expect(s.persons).toBe(2);
    expect(s.perDay).toBe(40);
    expect(s.perPersonDay).toBe(20);
    expect(tripStats(t, list, "anna").perPersonDay).toBe(14);
  });

  it("schlüsselt Tage nach Zahlungsmittel auf", () => {
    const d = tripStats(t, list).daily;
    expect(d[0].byMethod).toEqual({ Bar: 100, Kreditkarte: 60 });
    expect(d[1].byMethod).toEqual({ "": 40 });
    expect(tripStats(t, list).byMethod[0]).toMatchObject({ key: "Bar", amount: 100 });
  });

  it("zeigt jeden Tag den Anteil jeder Person", () => {
    const p = dailyByPerson(t, list);
    expect(p.find((x) => x.personId === "anna")?.daily).toEqual([50, 20, 0, 0, 0]);
    expect(p.find((x) => x.personId === "ben")?.daily).toEqual([110, 20, 0, 0, 0]);
  });

  it("übernimmt alte Zahlungsarten", () => {
    expect(migrateExpense({ id: "x", method: "card" }).method).toBe("Kreditkarte");
    expect(migrateExpense({ id: "x", method: "Revolut" }).method).toBe("Revolut");
  });
});

describe("Verpflegung und Kurtaxe", () => {
  const t = trip({ travelers: ["anna", "ben", "cem"] });

  it("übernimmt das frühere Frühstücks-Häkchen", () => {
    expect(migrateStay({ id: "s", breakfast: true }).board).toBe("breakfast");
    expect(migrateStay({ id: "s" }).board).toBe("none");
    expect(boardLabel({ board: "custom", meals: ["dinner", "breakfast"] })).toBe("mit Frühstück + Abendessen");
    expect(boardLabel({ board: "half", meals: [] })).toBe("Halbpension");
  });

  it("rechnet Kurtaxe pro Person und Nacht bzw. pro Nacht", () => {
    const s = { ...newStay(t, "anna", "2026-03-01", "2026-03-04"), touristTax: 2.5 };
    expect(stayTax(s, t)).toMatchObject({ persons: 3, nights: 3, total: 22.5, extra: 22.5 });
    expect(stayTax({ ...s, travelers: ["anna"] }, t).total).toBe(7.5);
    expect(stayTax({ ...s, touristTaxPersons: 2 }, t).total).toBe(15);
    expect(stayTax({ ...s, touristTaxUnit: "night" }, t).total).toBe(7.5);
    expect(stayTax({ ...s, touristTaxIncluded: true }, t).extra).toBe(0);
    // 3 Nächte = 4 Tage
    expect(stayTax({ ...s, touristTaxUnit: "day" }, t)).toMatchObject({ days: 4, total: 10, spreadDays: 4 });
    expect(stayTax({ ...s, touristTaxUnit: "personDay", touristTaxPersons: 2 }, t).total).toBe(20);
  });

  it("nimmt einen Gesamtbetrag und verteilt ihn auf die Tage", () => {
    // Beispiel: 90 € für 10 Tage (9 Nächte)
    const s = { ...newStay(t, "anna", "2026-03-01", "2026-03-10"), name: "Hotel", touristTax: 90, touristTaxUnit: "total" as const, status: "booked" as const };
    expect(stayTax(s, t)).toMatchObject({ nights: 9, days: 10, total: 90 });
    const f = stayTaxExpenseFields(s, t);
    expect(f).toMatchObject({ amount: 90, date: "2026-03-01", endDate: "2026-03-10" });
    expect(stayTax({ ...s, touristTax: 9, touristTaxUnit: "day" }, t).total).toBe(90);
  });

  it("legt für gebuchte Unterkünfte Preis und Kurtaxe als Ausgaben an und entfernt sie wieder", () => {
    let n = 0;
    const make = () => ({ ...newExpense(t, "", "2026-03-01"), id: `e${++n}` });
    const s = { ...newStay(t, "anna", "2026-03-01", "2026-03-04"), name: "Hotel", price: 300, touristTax: 2, status: "booked" as const, method: "Kreditkarte" };
    const r = syncBookingExpenses("stay", s, t, defaultSettings(), [], make);
    expect(r.upserts.map((e) => [e.title, e.amount, e.category, e.method])).toEqual([
      ["Hotel", 300, "stay", "Kreditkarte"],
      ["Kurtaxe Hotel", 18, "fees", "Kreditkarte"],
    ]);
    expect(r.booking.expenseId).toBe("e1");
    expect(r.booking.taxExpenseId).toBe("e2");
    const back = syncBookingExpenses("stay", { ...r.booking, status: "option" }, t, defaultSettings(), r.upserts, make);
    expect(back.removals).toEqual(["e1", "e2"]);
    expect(back.booking.taxExpenseId).toBe("");
  });

  it("zählt Kurtaxe nicht gebuchter Unterkünfte als geplant", () => {
    const s = { ...newStay(t, "", "2026-03-01", "2026-03-03"), price: 200, touristTax: 1, status: "idea" as const };
    expect(plannedCosts(t, [s])).toBe(206);
  });
});

describe("Daten aus dem Sync", () => {
  it("ergänzt fehlende oder beschädigte Felder, statt abzustürzen", () => {
    const e = migrateExpense({ id: "x", splitAmong: "anna" as unknown as string[], amount: "12" as unknown as number });
    expect(e.splitAmong).toEqual([]);
    expect(e.amount).toBe(0);
    const s = migrateStay({ id: "s", travelers: null as unknown as string[] });
    expect(s.travelers).toEqual([]);
    expect(s.price).toBe(0);
  });
});
