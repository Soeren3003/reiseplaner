/**
 * Erfundene Beispieldaten für Screenshots und zum Ausprobieren.
 * Nur in der Browser-Vorschau: http://localhost:1420/?demo (überschreibt die Vorschau-Daten im localStorage).
 * Alle Personen, Buchungsnummern und Beträge sind frei erfunden.
 */
import { syncBookingExpenses, type AnyBooking } from "./calc";
import { PALETTE, addDays, defaultSettings, newActivity, newExpense, newPerson, newStay, newTransport, newTrip, templateItems, today } from "./defaults";
import type { Activity, BookingKind, ChecklistItem, Expense, ExpenseCategory, Settings, Stay, Transport, Trip } from "./types";

const settings: Settings = { ...defaultSettings(), paymentMethods: ["Bar", "Kreditkarte", "Debitkarte / Girokarte", "PayPal / online", "Suica"] };

const people = [
  { ...newPerson(0), id: "alex", name: "Alex Beispiel", color: PALETTE[0] },
  { ...newPerson(1), id: "sam", name: "Sam Muster", color: PALETTE[1] },
];

const bookings: { kind: BookingKind; b: AnyBooking }[] = [];
const expenses: Expense[] = [];
const checklist: ChecklistItem[] = [];

function book<T extends AnyBooking>(kind: BookingKind, b: T): T {
  if (!b.method && b.status === "booked") b = { ...b, method: "Kreditkarte" };
  const trip = trips.find((t) => t.id === b.tripId)!;
  const r = syncBookingExpenses(kind, b, trip, settings, expenses, () => newExpense(trip, b.paidBy, b.createdAt.slice(0, 10)));
  expenses.push(...r.upserts);
  bookings.push({ kind, b: r.booking });
  return r.booking;
}

function spend(trip: Trip, day: number, category: ExpenseCategory, amount: number, title: string, extra: Partial<Expense> = {}) {
  expenses.push({ ...newExpense(trip, extra.paidBy ?? "alex", addDays(trip.startDate, day - 1)), category, amount, title, ...extra });
}

// ---------- Japan (vergangen, zu zweit, Yen) ----------

const jStart = addDays(today(), -120);
const japan: Trip = {
  ...newTrip(settings),
  id: "demo-japan",
  name: "Japan im Frühling",
  emoji: "🏯",
  destination: "Tokio, Hakone, Kyoto, Osaka",
  countries: ["Japan"],
  startDate: jStart,
  endDate: addDays(jStart, 13),
  status: "done",
  travelers: ["alex", "sam"],
  rates: { JPY: 0.0061 },
  budgetType: "daily",
  budget: 360,
  notes: "Rail-Pass nicht gekauft – Einzeltickets waren günstiger.",
};

// ---------- Lissabon & Porto (geplant) ----------

const pStart = addDays(today(), 38);
const portugal: Trip = {
  ...newTrip(settings),
  id: "demo-portugal",
  name: "Lissabon & Porto",
  emoji: "🌴",
  destination: "Lissabon, Sintra, Porto",
  countries: ["Portugal"],
  startDate: pStart,
  endDate: addDays(pStart, 7),
  status: "booked",
  travelers: ["alex", "sam"],
  budgetType: "total",
  budget: 2200,
};

// ---------- Island (vergangen, allein, Kronen) ----------

const iStart = addDays(today(), -420);
const iceland: Trip = {
  ...newTrip(settings),
  id: "demo-island",
  name: "Island Ringstraße",
  emoji: "🏔",
  destination: "Reykjavík, Südküste, Mývatn",
  countries: ["Island"],
  startDate: iStart,
  endDate: addDays(iStart, 9),
  status: "done",
  travelers: [],
  rates: { ISK: 0.0066 },
};

const trips = [japan, portugal, iceland];

function demoJapan() {
  const t = japan;
  const d = (n: number) => addDays(t.startDate, n - 1);
  book("transport", {
    ...newTransport(t, "alex", "flight", d(1)),
    from: "Frankfurt (FRA)",
    to: "Tokio Haneda (HND)",
    carrier: "Beispiel Airlines",
    number: "BA 123",
    departTime: "20:55",
    arriveDate: d(2),
    arriveTime: "16:40",
    durationMin: 13 * 60 + 45,
    distanceKm: 9350,
    seat: "34A, 34C",
    bookingRef: "XK7Q2M",
    price: 1780,
    status: "booked",
  } as Transport);
  book("transport", { ...newTransport(t, "sam", "train", d(6)), from: "Tokio", to: "Odawara (Hakone)", carrier: "JR", number: "Kodama 707", departTime: "09:03", arriveTime: "09:41", distanceKm: 84, currency: "JPY", price: 7000, status: "booked" } as Transport);
  book("transport", { ...newTransport(t, "alex", "train", d(8)), from: "Odawara", to: "Kyoto", carrier: "JR", number: "Hikari 633", departTime: "10:12", arriveTime: "12:16", distanceKm: 430, currency: "JPY", price: 26000, status: "booked" } as Transport);
  book("transport", { ...newTransport(t, "sam", "train", d(12)), from: "Kyoto", to: "Osaka", carrier: "JR", departTime: "11:00", arriveTime: "11:30", distanceKm: 43, currency: "JPY", price: 1160, status: "booked" } as Transport);
  book("transport", {
    ...newTransport(t, "alex", "flight", d(14)),
    from: "Osaka Kansai (KIX)",
    to: "Frankfurt (FRA)",
    carrier: "Beispiel Airlines",
    number: "BA 124",
    departTime: "10:30",
    arriveTime: "17:15",
    durationMin: 13 * 60 + 45,
    distanceKm: 9400,
    status: "booked",
  } as Transport);
  book("stay", { ...newStay(t, "sam", d(2), d(6)), name: "Hotel Sakura Shinjuku", address: "Shinjuku, Tokio", currency: "JPY", price: 92000, status: "booked", bookingRef: "HS-55102", provider: "Direkt" } as Stay);
  book("stay", { ...newStay(t, "alex", d(6), d(8)), kind: "hotel", name: "Ryokan am See", address: "Hakone", currency: "JPY", price: 64000, board: "half", touristTax: 150, touristTaxUnit: "person", status: "booked" } as Stay);
  book("stay", { ...newStay(t, "sam", d(8), d(12)), kind: "apartment", name: "Machiya Gion", address: "Gion, Kyoto", currency: "JPY", price: 88000, status: "booked" } as Stay);
  book("stay", { ...newStay(t, "alex", d(12), d(14)), name: "Hotel Namba", address: "Namba, Osaka", currency: "JPY", price: 30000, status: "booked" } as Stay);
  book("activity", { ...newActivity(t, "alex", d(4)), title: "teamLab Planets", time: "10:00", location: "Toyosu", currency: "JPY", price: 7600, status: "booked" } as Activity);
  book("activity", { ...newActivity(t, "sam", d(9)), title: "Teezeremonie", time: "15:00", location: "Gion", currency: "JPY", price: 9000, status: "booked" } as Activity);
  book("activity", { ...newActivity(t, "", d(10)), title: "Fushimi Inari früh morgens", time: "06:30", location: "Fushimi" } as Activity);

  const daily: [ExpenseCategory, number, string, string][] = [
    ["food", 3400, "Ramen", "Bar"],
    ["food", 5200, "Izakaya", "Kreditkarte"],
    ["groceries", 1450, "Konbini", "Bar"],
    ["transport", 1200, "U-Bahn", "Suica"],
    ["activities", 1000, "Tempel", "Bar"],
  ];
  for (let day = 2; day <= 13; day++) {
    daily.forEach(([c, amount, title, method], i) => {
      if ((day + i) % 3 === 0 && c !== "food") return;
      spend(t, day, c, Math.round(amount * (0.8 + ((day * 7 + i * 13) % 9) / 20)), title, { currency: "JPY", paidBy: (day + i) % 2 ? "alex" : "sam", method, country: "Japan" });
    });
  }
  spend(t, 3, "shopping", 18000, "Kamera-Objektiv", { currency: "JPY", splitAmong: ["sam"], paidBy: "sam", country: "Japan" });
  spend(t, 9, "shopping", 6500, "Keramik", { currency: "JPY", splitAmong: ["alex"], country: "Japan" });
  spend(t, 2, "communication", 3000, "eSIM 15 GB", { currency: "JPY", country: "Japan", method: "PayPal / online" });
  spend(t, -40, "fees", 64, "Auslandskrankenversicherung", { excludeFromDaily: true, method: "PayPal / online" });
}

function demoPortugal() {
  const t = portugal;
  const d = (n: number) => addDays(t.startDate, n - 1);
  book("transport", { ...newTransport(t, "alex", "flight", d(1)), from: "Frankfurt (FRA)", to: "Lissabon (LIS)", carrier: "Beispiel Air", number: "BX 410", departTime: "07:10", arriveTime: "09:05", durationMin: 175, distanceKm: 1890, price: 312, status: "booked", bookingRef: "PT4KLM" } as Transport);
  book("transport", { ...newTransport(t, "", "train", d(5)), from: "Lissabon", to: "Porto", carrier: "CP", number: "Alfa Pendular", departTime: "09:39", arriveTime: "12:28", distanceKm: 337, price: 64, status: "option" } as Transport);
  book("transport", { ...newTransport(t, "alex", "flight", d(8)), from: "Porto (OPO)", to: "Frankfurt (FRA)", carrier: "Beispiel Air", number: "BX 417", departTime: "18:20", arriveTime: "22:15", durationMin: 175, distanceKm: 1720, price: 298, status: "booked" } as Transport);
  book("stay", { ...newStay(t, "sam", d(1), d(5)), kind: "apartment", name: "Apartment Alfama", address: "Alfama, Lissabon", price: 520, status: "booked", provider: "Ferienportal", touristTax: 4, method: "Kreditkarte" } as Stay);
  book("stay", { ...newStay(t, "", d(5), d(8)), name: "Hotel Ribeira", address: "Ribeira, Porto", price: 390, status: "idea", board: "breakfast", touristTax: 3 } as Stay);
  book("activity", { ...newActivity(t, "", d(3)), title: "Tagesausflug Sintra", time: "09:00", price: 70, status: "idea" } as Activity);
  book("activity", { ...newActivity(t, "", d(6)), title: "Portweinkellerei mit Verkostung", time: "16:00", location: "Vila Nova de Gaia", price: 50, status: "option" } as Activity);
  const todos = templateItems(t.id, "todo", settings.todoTemplate);
  todos.forEach((c, i) => (c.done = i < 5));
  todos[6].due = addDays(today(), 10);
  todos[6].assignee = "sam";
  checklist.push(...todos, ...templateItems(t.id, "pack", settings.packTemplate));
}

function demoIceland() {
  const t = iceland;
  const d = (n: number) => addDays(t.startDate, n - 1);
  book("transport", { ...newTransport(t, "", "flight", d(1)), from: "München (MUC)", to: "Keflavík (KEF)", number: "IS 533", departTime: "13:40", arriveTime: "16:00", durationMin: 260, distanceKm: 2560, price: 420, status: "booked" } as Transport);
  book("transport", { ...newTransport(t, "", "rentalcar", d(1)), from: "Keflavík", to: "Keflavík", carrier: "Beispiel Car Rental", arriveDate: d(10), distanceKm: 1520, currency: "ISK", price: 98000, status: "booked" } as Transport);
  book("transport", { ...newTransport(t, "", "flight", d(10)), from: "Keflavík (KEF)", to: "München (MUC)", number: "IS 532", departTime: "07:40", arriveTime: "13:35", durationMin: 235, distanceKm: 2560, status: "booked" } as Transport);
  const stays: [number, number, string, number][] = [
    [1, 3, "Guesthouse Reykjavík", 38000],
    [3, 5, "Farmhaus bei Vík", 42000],
    [5, 7, "Hütte am Gletschersee", 46000],
    [7, 10, "Gästehaus Mývatn", 61000],
  ];
  for (const [a, b, name, price] of stays) book("stay", { ...newStay(t, "", d(a), d(b)), kind: "apartment", name, currency: "ISK", price, status: "booked" } as Stay);
  for (let day = 1; day <= 10; day++) {
    spend(t, day, "food", 4200 + (day % 3) * 900, "Essen", { currency: "ISK", country: "Island", method: "Kreditkarte", paidBy: "" });
    if (day % 2) spend(t, day, "car", 11000, "Tanken", { currency: "ISK", country: "Island", method: "Kreditkarte", paidBy: "" });
    if (day % 3 === 0) spend(t, day, "groceries", 6500, "Supermarkt", { currency: "ISK", country: "Island", paidBy: "" });
  }
  spend(t, 4, "activities", 14000, "Gletscherwanderung", { currency: "ISK", country: "Island", paidBy: "" });
  spend(t, 8, "activities", 7500, "Naturbad", { currency: "ISK", country: "Island", paidBy: "" });
}

export function loadDemo() {
  bookings.length = 0;
  expenses.length = 0;
  checklist.length = 0;
  demoJapan();
  demoPortugal();
  demoIceland();
  const put = (c: string, list: { id: string }[]) => localStorage.setItem(`reiseplaner:${c}`, JSON.stringify(Object.fromEntries(list.map((x) => [x.id, x]))));
  put("trips", trips);
  put("people", people);
  put("transports", bookings.filter((x) => x.kind === "transport").map((x) => x.b));
  put("stays", bookings.filter((x) => x.kind === "stay").map((x) => x.b));
  put("activities", bookings.filter((x) => x.kind === "activity").map((x) => x.b));
  put("checklist", checklist);
  put("expenses", expenses);
  put("payments", []);
  put("settings", [settings]);
  localStorage.setItem("reiseplaner:me", "alex");
}
