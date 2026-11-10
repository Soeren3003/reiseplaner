import { TRANSPORT_MODES, addDays, dayRange, daysBetween } from "./defaults";
import type { Activity, Booking, BookingKind, Expense, ExpenseCategory, Payment, PaymentMethod, Settings, Stay, TaxUnit, Transport, Trip } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Reisedauer und Budget ----------

/** Reisetage einschließlich An- und Abreisetag */
export function tripDays(t: Pick<Trip, "startDate" | "endDate">) {
  if (!t.startDate) return 0;
  return Math.max(1, daysBetween(t.startDate, t.endDate || t.startDate) + 1);
}

export const tripNights = (t: Pick<Trip, "startDate" | "endDate">) => Math.max(0, tripDays(t) - 1);

/** Budget der ganzen Reise in der Heimatwährung (0 = kein Budget) */
export function budgetTotal(t: Trip) {
  if (t.budgetType === "total") return t.budget || 0;
  if (t.budgetType === "daily") return (t.budget || 0) * tripDays(t);
  return 0;
}

/** Läuft die Reise gerade, liegt sie in der Zukunft oder ist sie vorbei? */
export function tripPhase(t: Pick<Trip, "startDate" | "endDate">, day: string): "before" | "during" | "after" {
  if (day < t.startDate) return "before";
  if (day > (t.endDate || t.startDate)) return "after";
  return "during";
}

// ---------- Währungen ----------

/** Kurs einer Ausgabe: 1 Einheit ihrer Währung = x Einheiten Heimatwährung; null = Kurs fehlt */
export function rateOf(x: { currency: string; rate?: number | null }, trip: Pick<Trip, "currency" | "rates">): number | null {
  if (!x.currency || x.currency === trip.currency) return 1;
  if (x.rate !== null && x.rate !== undefined && x.rate > 0) return x.rate;
  const r = trip.rates[x.currency];
  return r && r > 0 ? r : null;
}

/** Betrag in der Heimatwährung; fehlt der Kurs, zählt der Betrag nicht (0) */
export function homeAmount(x: { amount: number; currency: string; rate?: number | null }, trip: Pick<Trip, "currency" | "rates">) {
  const r = rateOf(x, trip);
  return r === null ? 0 : round2((x.amount || 0) * r);
}

/** Preis einer Buchung in der Heimatwährung */
export const bookingHome = (b: Pick<Booking, "price" | "currency">, trip: Pick<Trip, "currency" | "rates">) => homeAmount({ amount: b.price, currency: b.currency }, trip);

/** Fremdwährungen ohne Kurs (aus Ausgaben und Buchungen) */
export function missingRates(trip: Trip, expenses: Expense[], bookings: Pick<Booking, "price" | "currency" | "status">[] = []) {
  const set = new Set<string>();
  for (const e of expenses) if (e.amount && rateOf(e, trip) === null) set.add(e.currency);
  for (const b of bookings) if (b.price && b.status !== "cancelled" && rateOf(b, trip) === null) set.add(b.currency);
  return [...set].sort();
}

/** Alle Währungen der Reise: Heimatwährung, gepflegte Kurse und tatsächlich verwendete */
export function tripCurrencies(trip: Trip, expenses: Expense[], bookings: Pick<Booking, "currency">[] = []) {
  const set = new Set<string>([trip.currency, ...Object.keys(trip.rates)]);
  for (const x of [...expenses, ...bookings]) if (x.currency) set.add(x.currency);
  return [...set];
}

// ---------- Tage ----------

/** Tage, auf die eine Ausgabe verteilt wird */
export function expenseDays(e: Pick<Expense, "date" | "endDate">) {
  return e.endDate && e.endDate > e.date ? dayRange(e.date, e.endDate) : [e.date];
}

// ---------- Aufteilung und Abrechnung ----------

/** Auf wen wird die Ausgabe verteilt? Leere Auswahl = alle Mitreisenden. */
export function splitIds(e: Pick<Expense, "splitAmong">, trip: Pick<Trip, "travelers">) {
  const among = (e.splitAmong ?? []).filter((id) => trip.travelers.includes(id));
  return among.length ? among : trip.travelers;
}

/**
 * Anteil einer Person an einer Ausgabe (Heimatwährung).
 * Allein unterwegs (keine Mitreisenden eingetragen) gehört jede Ausgabe einem selbst.
 */
export function shareOf(e: Expense, personId: string, trip: Trip) {
  const total = homeAmount(e, trip);
  if (!trip.travelers.length) return total;
  const ids = splitIds(e, trip);
  return ids.includes(personId) ? total / ids.length : 0;
}

export interface Balance {
  personId: string;
  /** ausgelegt (Heimatwährung) */
  paid: number;
  /** Zahlungen: gegeben minus erhalten */
  transferred: number;
  /** eigener Anteil an den Kosten */
  share: number;
  /** > 0: bekommt Geld, < 0: muss zahlen */
  balance: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface Settlement {
  total: number;
  rows: Balance[];
  transfers: Transfer[];
  /** Ausgaben ohne „bezahlt von“ (werden verteilt, aber niemandem gutgeschrieben) */
  withoutPayer: number;
}

export function settlement(trip: Trip, expenses: Expense[], payments: Payment[]): Settlement {
  const rows = new Map<string, Balance>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { personId: id, paid: 0, transferred: 0, share: 0, balance: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const id of trip.travelers) row(id);
  let total = 0;
  let withoutPayer = 0;
  for (const e of expenses) {
    const amount = homeAmount(e, trip);
    total += amount;
    if (e.paidBy) row(e.paidBy).paid += amount;
    else withoutPayer++;
    const ids = splitIds(e, trip);
    if (ids.length) for (const id of ids) row(id).share += amount / ids.length;
    else if (e.paidBy) row(e.paidBy).share += amount;
  }
  for (const p of payments) {
    if (!p.from || !p.to || p.from === p.to) continue;
    row(p.from).transferred += p.amount || 0;
    row(p.to).transferred -= p.amount || 0;
  }

  // Salden in ganzen Cent, so verteilt, dass sie genau null ergeben (sonst fehlt bei den Überweisungen ein Cent).
  const list = [...rows.values()];
  const raw = list.map((b) => (b.paid + b.transferred - b.share) * 100);
  const cents = raw.map(Math.round);
  let rest = -cents.reduce((a, x) => a + x, 0);
  const order = raw.map((_, i) => i).sort((x, y) => (raw[y] - cents[y]) * Math.sign(rest) - (raw[x] - cents[x]) * Math.sign(rest));
  for (const i of order) {
    if (!rest) break;
    cents[i] += Math.sign(rest);
    rest -= Math.sign(rest);
  }
  const out = list.map((b, i) => ({ ...b, paid: round2(b.paid), transferred: round2(b.transferred), share: round2(b.share), balance: cents[i] / 100 }));
  return { total: round2(total), rows: out, transfers: settle(out), withoutPayer };
}

/** Möglichst wenige Überweisungen: größter Schuldner zahlt an größten Gläubiger. */
export function settle(bal: Pick<Balance, "personId" | "balance">[]): Transfer[] {
  const debtors = bal.filter((b) => b.balance < 0).map((b) => ({ id: b.personId, v: Math.round(-b.balance * 100) }));
  const creditors = bal.filter((b) => b.balance > 0).map((b) => ({ id: b.personId, v: Math.round(b.balance * 100) }));
  const out: Transfer[] = [];
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: amount / 100 });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v <= 0) i++;
    if (creditors[j].v <= 0) j++;
  }
  return out;
}

// ---------- Auswertung ----------

export interface Amounted<K> {
  key: K;
  amount: number;
  count: number;
}

function group<K>(items: { key: K; amount: number }[]): Amounted<K>[] {
  const m = new Map<K, Amounted<K>>();
  for (const it of items) {
    const g = m.get(it.key) ?? { key: it.key, amount: 0, count: 0 };
    g.amount += it.amount;
    g.count++;
    m.set(it.key, g);
  }
  return [...m.values()].map((g) => ({ ...g, amount: round2(g.amount) })).filter((g) => g.amount !== 0).sort((a, b) => b.amount - a.amount);
}

export interface DayTotal {
  date: string;
  total: number;
  byCategory: Partial<Record<ExpenseCategory, number>>;
  /** nach Zahlungsmittel; "" = ohne Angabe */
  byMethod: Record<string, number>;
}

export interface TripStats {
  total: number;
  /** ohne Ausgaben, die vom Tagesdurchschnitt ausgenommen sind */
  dailyBase: number;
  days: number;
  perDay: number;
  /** Personen, auf die gerechnet wird (Mitreisende; beim eigenen Anteil bzw. allein 1) */
  persons: number;
  /** Ø pro Person und Tag (Tagesdurchschnitt geteilt durch die Personen) */
  perPersonDay: number;
  /** Ausgaben vor bzw. nach dem Reisezeitraum (z. B. Flüge, Versicherung) */
  beforeTrip: number;
  afterTrip: number;
  byCategory: Amounted<ExpenseCategory>[];
  byCountry: Amounted<string>[];
  byMethod: Amounted<PaymentMethod>[];
  /** Summe je Originalwährung (im Original) und umgerechnet */
  byCurrency: { currency: string; original: number; home: number; count: number }[];
  /** jeder Reisetag, auch ohne Ausgaben; nur Ausgaben, die im Tagesdurchschnitt zählen */
  daily: DayTotal[];
  budget: number;
  count: number;
}

/**
 * Kennzahlen einer Reise. Mit `personId` nur der Anteil dieser Person (bei geteilten Ausgaben),
 * sonst die Kosten der ganzen Gruppe.
 */
export function tripStats(trip: Trip, expenses: Expense[], personId?: string): TripStats {
  const value = (e: Expense) => (personId ? shareOf(e, personId, trip) : homeAmount(e, trip));
  const items = expenses.map((e) => ({ e, v: value(e) })).filter((x) => x.v !== 0);
  const total = items.reduce((a, x) => a + x.v, 0);
  const days = tripDays(trip);
  const range = dayRange(trip.startDate, trip.endDate || trip.startDate);
  const dayMap = new Map<string, DayTotal>(range.map((d) => [d, { date: d, total: 0, byCategory: {}, byMethod: {} }]));
  let beforeTrip = 0;
  let afterTrip = 0;
  let dailyBase = 0;
  for (const { e, v } of items) {
    const ds = expenseDays(e);
    const part = v / ds.length;
    for (const d of ds) {
      if (d < trip.startDate) beforeTrip += part;
      else if (d > (trip.endDate || trip.startDate)) afterTrip += part;
      else if (!e.excludeFromDaily) {
        const t = dayMap.get(d)!;
        t.total += part;
        t.byCategory[e.category] = (t.byCategory[e.category] ?? 0) + part;
        t.byMethod[e.method || ""] = (t.byMethod[e.method || ""] ?? 0) + part;
        dailyBase += part;
      }
    }
  }
  const currencies = new Map<string, { currency: string; original: number; home: number; count: number }>();
  for (const { e, v } of items) {
    const c = currencies.get(e.currency) ?? { currency: e.currency, original: 0, home: 0, count: 0 };
    const own = personId ? (homeAmount(e, trip) ? v / homeAmount(e, trip) : 0) : 1;
    c.original += (e.amount || 0) * own;
    c.home += v;
    c.count++;
    currencies.set(e.currency, c);
  }
  const daily = [...dayMap.values()].map((d) => ({
    date: d.date,
    total: round2(d.total),
    byCategory: Object.fromEntries(Object.entries(d.byCategory).map(([k, v]) => [k, round2(v)])) as DayTotal["byCategory"],
    byMethod: Object.fromEntries(Object.entries(d.byMethod).map(([k, v]) => [k, round2(v)])),
  }));
  const persons = personId ? 1 : Math.max(1, trip.travelers.length);
  return {
    total: round2(total),
    dailyBase: round2(dailyBase),
    days,
    perDay: days ? round2(dailyBase / days) : 0,
    persons,
    perPersonDay: days ? round2(dailyBase / days / persons) : 0,
    beforeTrip: round2(beforeTrip),
    afterTrip: round2(afterTrip),
    byCategory: group(items.map((x) => ({ key: x.e.category, amount: x.v }))),
    byCountry: group(items.map((x) => ({ key: x.e.country || "", amount: x.v }))),
    byMethod: group(items.map((x) => ({ key: x.e.method || "", amount: x.v }))),
    byCurrency: [...currencies.values()].map((c) => ({ ...c, original: round2(c.original), home: round2(c.home) })).sort((a, b) => b.home - a.home),
    daily,
    budget: budgetTotal(trip),
    count: items.length,
  };
}

/** Tag für Tag der Anteil jeder mitreisenden Person (Heimatwährung, nur Ausgaben im Tagesdurchschnitt) */
export function dailyByPerson(trip: Trip, expenses: Expense[]) {
  return trip.travelers.map((personId) => {
    const st = tripStats(trip, expenses, personId);
    return { personId, daily: st.daily.map((d) => d.total), total: st.total, perDay: st.perDay };
  });
}

/** Geplante, noch nicht gebuchte Kosten (Ideen und Reservierungen, inkl. Kurtaxe) in der Heimatwährung */
export function plannedCosts(trip: Trip, bookings: Booking[]) {
  return round2(
    bookings
      .filter((b) => b.status === "idea" || b.status === "option")
      .reduce((a, b) => a + bookingHome(b, trip) + ("touristTax" in b ? homeAmount({ amount: stayTax(b as Stay, trip).extra, currency: b.currency }, trip) : 0), 0),
  );
}

// ---------- Kurtaxe ----------

/** Kurtaxe pro Person? */
export const taxPerPerson = (u: TaxUnit) => u === "person" || u === "personDay";

/**
 * Kurtaxe einer Unterkunft: Personen, Nächte, Tage, Summe und davon zusätzlich zum Preis zu zahlen.
 * `spreadDays` = Tage, auf die die Ausgabe verteilt wird (Nächte bei Nacht-Sätzen, sonst An- bis Abreisetag).
 */
export function stayTax(s: Pick<Stay, "touristTax" | "touristTaxUnit" | "touristTaxPersons" | "touristTaxIncluded" | "travelers" | "checkIn" | "checkOut">, trip: Pick<Trip, "travelers">) {
  const persons = s.touristTaxPersons && s.touristTaxPersons > 0 ? s.touristTaxPersons : s.travelers.length || trip.travelers.length || 1;
  const nights = stayNights(s);
  const days = nights ? nights + 1 : 1;
  const u = s.touristTaxUnit;
  const units = u === "total" ? 1 : (u === "person" || u === "night" ? nights : days) * (taxPerPerson(u) ? persons : 1);
  const total = round2((s.touristTax || 0) * units);
  const spreadDays = u === "person" || u === "night" ? Math.max(1, nights) : days;
  return { persons, nights, days, spreadDays, total, extra: s.touristTaxIncluded ? 0 : total };
}

/** Eigene Ausgabe für die Kurtaxe, wenn gebucht und nicht im Preis enthalten */
export const stayHasTaxExpense = (s: Stay, trip: Pick<Trip, "travelers">) => s.status === "booked" && stayTax(s, trip).extra > 0;

export function stayTaxExpenseFields(s: Stay, trip: Pick<Trip, "travelers">): Partial<Expense> {
  const t = stayTax(s, trip);
  return {
    title: `Kurtaxe ${s.name || "Unterkunft"}`,
    category: "fees",
    amount: t.extra,
    currency: s.currency,
    paidBy: s.paidBy,
    splitAmong: s.travelers,
    method: s.method,
    date: s.checkIn,
    endDate: t.spreadDays > 1 ? addDays(s.checkIn, t.spreadDays - 1) : "",
    excludeFromDaily: false,
    source: "stay",
    sourceId: s.id,
  };
}

// ---------- Transport ----------

const minutesOf = (date: string, hhmm: string) => {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!date || !m) return null;
  return new Date(`${date}T12:00:00`).getTime() / 60_000 - 12 * 60 + Number(m[1]) * 60 + Number(m[2]);
};

/** Reisedauer in Minuten: eingetragen oder aus Ab- und Ankunft (Ortszeiten) berechnet; null = unbekannt */
export function transportDuration(t: Pick<Transport, "departDate" | "departTime" | "arriveDate" | "arriveTime" | "durationMin">) {
  if (t.durationMin !== null && t.durationMin !== undefined && t.durationMin > 0) return t.durationMin;
  const a = minutesOf(t.departDate, t.departTime);
  let b = minutesOf(t.arriveDate || t.departDate, t.arriveTime);
  if (a === null || b === null) return null;
  // Ankunft ohne Datum vor Abfahrt: über Nacht
  if (!t.arriveDate && b <= a) b += 24 * 60;
  return b > a ? b - a : null;
}

/** Ankunftstag (leer = Abfahrtstag; über Nacht, wenn die Ankunftszeit früher ist) */
export function arrivalDate(t: Pick<Transport, "departDate" | "departTime" | "arriveDate" | "arriveTime">) {
  if (t.arriveDate) return t.arriveDate;
  if (t.departTime && t.arriveTime && t.arriveTime < t.departTime) return addDays(t.departDate, 1);
  return t.departDate;
}

// ---------- Buchungen → Ausgaben ----------

export type AnyBooking = Transport | Stay | Activity;

/** Welche Werte die automatisch erzeugte Ausgabe einer Buchung bekommt */
export function bookingExpenseFields(kind: BookingKind, b: AnyBooking, settings: Pick<Settings, "excludeFlightsFromDaily">): Partial<Expense> {
  const common = {
    amount: b.price,
    currency: b.currency,
    paidBy: b.paidBy,
    splitAmong: b.travelers,
    method: b.method,
    source: kind,
    sourceId: b.id,
  };
  if (kind === "transport") {
    const t = b as Transport;
    const m = TRANSPORT_MODES[t.mode];
    const route = [t.from, t.to].filter(Boolean).join(" → ");
    const rental = t.mode === "rentalcar" && t.arriveDate && t.arriveDate > t.departDate;
    return {
      ...common,
      title: [m.label, t.number, route].filter(Boolean).join(" "),
      category: m.category,
      date: t.departDate,
      endDate: rental ? t.arriveDate : "",
      excludeFromDaily: t.mode === "flight" && settings.excludeFlightsFromDaily,
    };
  }
  if (kind === "stay") {
    const s = b as Stay;
    const nights = s.checkOut > s.checkIn ? daysBetween(s.checkIn, s.checkOut) : 1;
    return {
      ...common,
      title: s.name || "Unterkunft",
      category: "stay",
      date: s.checkIn,
      // auf die Nächte verteilen: letzter Tag ist der Tag vor dem Auschecken
      endDate: nights > 1 ? addDays(s.checkIn, nights - 1) : "",
      excludeFromDaily: false,
    };
  }
  const a = b as Activity;
  return { ...common, title: a.title || "Aktivität", category: a.category, date: a.date, endDate: "", excludeFromDaily: false };
}

/** Soll zu dieser Buchung eine Ausgabe existieren? */
export const bookingHasExpense = (b: Pick<Booking, "status" | "price">) => b.status === "booked" && (b.price || 0) !== 0;

/**
 * Automatische Ausgaben einer Buchung abgleichen: Preis (und bei Unterkünften die Kurtaxe) anlegen, anpassen
 * oder entfernen. `make` erzeugt eine neue, leere Ausgabe. Liefert die Buchung mit den Kennungen der Ausgaben.
 */
export function syncBookingExpenses<B extends AnyBooking>(
  kind: BookingKind,
  booking: B,
  trip: Trip,
  settings: Pick<Settings, "excludeFlightsFromDaily">,
  existing: Expense[],
  make: () => Expense,
): { booking: B; upserts: Expense[]; removals: string[] } {
  let b = booking;
  const upserts: Expense[] = [];
  const removals: string[] = [];
  const link = (key: "expenseId" | "taxExpenseId", wanted: boolean, fields: () => Partial<Expense>) => {
    const id = (b as unknown as Record<string, string>)[key] ?? "";
    const linked = id ? existing.find((e) => e.id === id) : undefined;
    if (wanted) {
      const exp = { ...(linked ?? make()), ...fields() } as Expense;
      if (exp.id !== id) b = { ...b, [key]: exp.id };
      upserts.push(exp);
    } else if (id) {
      if (linked) removals.push(linked.id);
      b = { ...b, [key]: "" };
    }
  };
  link("expenseId", bookingHasExpense(b), () => bookingExpenseFields(kind, b, settings));
  if (kind === "stay") link("taxExpenseId", stayHasTaxExpense(b as Stay, trip), () => stayTaxExpenseFields(b as Stay, trip));
  return { booking: b, upserts, removals };
}

// ---------- Tagesplan ----------

export interface PlanDay {
  date: string;
  /** 1-basiert; 0 = vor bzw. nach der Reise */
  dayNo: number;
  transports: Transport[];
  activities: Activity[];
  checkIns: Stay[];
  checkOuts: Stay[];
  /** Unterkunft für die Nacht nach diesem Tag */
  night: Stay | undefined;
  spent: number;
}

export function sortTransports(list: Transport[]) {
  return list.slice().sort((a, b) => `${a.departDate}|${a.departTime || "99:99"}`.localeCompare(`${b.departDate}|${b.departTime || "99:99"}`) || a.createdAt.localeCompare(b.createdAt));
}

export function sortActivities(list: Activity[]) {
  return list.slice().sort((a, b) => `${a.date}|${a.time || "99:99"}`.localeCompare(`${b.date}|${b.time || "99:99"}`) || a.createdAt.localeCompare(b.createdAt));
}

export function sortStays(list: Stay[]) {
  return list.slice().sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.createdAt.localeCompare(b.createdAt));
}

/** Tag für Tag: Anreise, Unterkunft, Aktivitäten, Ausgaben. Buchungen außerhalb des Zeitraums verlängern den Plan. */
export function dayPlan(trip: Trip, transports: Transport[], stays: Stay[], activities: Activity[], expenses: Expense[]): PlanDay[] {
  const live = <T extends Booking>(l: T[]) => l.filter((x) => x.status !== "cancelled");
  const ts = sortTransports(live(transports));
  const ss = sortStays(live(stays));
  const as = sortActivities(live(activities));
  const dates = [trip.startDate, trip.endDate || trip.startDate, ...ts.map((t) => t.departDate), ...as.map((a) => a.date), ...ss.flatMap((s) => [s.checkIn, s.checkOut])].filter(Boolean).sort();
  if (!dates.length) return [];
  const daily = tripStats(trip, expenses).daily;
  return dayRange(dates[0], dates[dates.length - 1]).map((d) => ({
    date: d,
    dayNo: d >= trip.startDate && d <= (trip.endDate || trip.startDate) ? daysBetween(trip.startDate, d) + 1 : 0,
    transports: ts.filter((t) => t.departDate === d),
    activities: as.filter((a) => a.date === d),
    checkIns: ss.filter((s) => s.checkIn === d),
    checkOuts: ss.filter((s) => s.checkOut === d),
    night: ss.find((s) => s.checkIn <= d && d < s.checkOut),
    spent: daily.find((x) => x.date === d)?.total ?? 0,
  }));
}

/** Nächte im Reisezeitraum ohne Unterkunft (Übernachtung im Flugzeug bzw. Nachtzug zählt als belegt) */
export function nightsWithoutStay(trip: Trip, stays: Stay[], transports: Transport[] = []) {
  const live = stays.filter((s) => s.status !== "cancelled");
  const overnight = transports.filter((t) => t.status !== "cancelled" && arrivalDate(t) > t.departDate);
  if (!trip.startDate || !trip.endDate || trip.endDate <= trip.startDate) return [];
  return dayRange(trip.startDate, addDays(trip.endDate, -1)).filter(
    (d) => !live.some((s) => s.checkIn <= d && d < s.checkOut) && !overnight.some((t) => t.departDate <= d && d < arrivalDate(t)),
  );
}

/** Nächte einer Unterkunft */
export const stayNights = (s: Pick<Stay, "checkIn" | "checkOut">) => (s.checkIn && s.checkOut > s.checkIn ? daysBetween(s.checkIn, s.checkOut) : 0);
