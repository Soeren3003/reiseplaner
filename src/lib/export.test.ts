// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { defaultSettings, newExpense, newPerson, newStay, newTransport, newTrip } from "./defaults";
import { buildIcs, buildTripPdf, expenseRows, settlementText } from "./export";
import { summarize } from "./summary";

function demo() {
  const settings = defaultSettings();
  const trip = { ...newTrip(settings), id: "t1", name: "Japan, Frühling", startDate: "2026-03-01", endDate: "2026-03-10", travelers: ["a", "b"], rates: { JPY: 0.0062 } };
  const people = [
    { ...newPerson(0), id: "a", name: "Anna" },
    { ...newPerson(1), id: "b", name: "Ben" },
  ];
  const transports = [{ ...newTransport(trip, "a"), id: "f1", number: "LH 714", from: "Frankfurt", to: "Tokio", departTime: "21:40", arriveTime: "16:10", arriveDate: "2026-03-02", status: "booked" as const }];
  const stays = [{ ...newStay(trip, "b", "2026-03-02", "2026-03-06"), id: "s1", name: "Hotel; Shinjuku", status: "booked" as const }];
  const expenses = [
    { ...newExpense(trip, "a", "2026-03-03"), title: "=Ramen", amount: 3000, currency: "JPY" },
    { ...newExpense(trip, "b", "2026-03-04"), title: "Tempel", amount: 20, category: "activities" as const },
  ];
  const data = { trips: [trip], people, transports, stays, activities: [], checklist: [], expenses, payments: [], countries: [], places: [], settings };
  return { trip, sum: summarize(trip, data) };
}

describe("Export", () => {
  it("baut einen gültigen Kalender mit Flug und Unterkunft", () => {
    const { trip, sum } = demo();
    const ics = buildIcs(trip, sum, new Date("2026-01-01T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260301T214000");
    expect(ics).toContain("DTEND:20260302T161000");
    expect(ics).toContain("SUMMARY:Check-in Hotel\\; Shinjuku".replace("Check-in", "🏨 Check-in"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20260301");
    expect(ics).toContain("DTEND;VALUE=DATE:20260311");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });

  it("exportiert Ausgaben mit Umrechnung und entschärft Formeln", () => {
    const { trip, sum } = demo();
    const rows = expenseRows(trip, sum);
    const ramen = rows.find((r) => String(r[2]).includes("Ramen"))!;
    expect(ramen[7]).toBe(18.6);
    const csv = toCsv(rows);
    expect(csv).toContain("'=Ramen");
  });

  it("schreibt die Abrechnung als Text", () => {
    const { trip, sum } = demo();
    const t = settlementText(trip, sum);
    expect(t).toContain("Kosten gesamt: 38,60");
    expect(t).toContain("Anna zahlt 0,70");
  });

  it("erzeugt ein PDF", () => {
    const { trip, sum } = demo();
    const pdf = buildTripPdf(trip, sum);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
