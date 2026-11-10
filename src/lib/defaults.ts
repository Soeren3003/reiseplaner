import type {
  Activity,
  BookingStatus,
  ChecklistItem,
  ChecklistKind,
  Expense,
  ExpenseCategory,
  PaymentMethod,
  Payment,
  Person,
  Settings,
  Stay,
  StayKind,
  Transport,
  TransportMode,
  Trip,
  TripStatus,
} from "./types";

export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString("sv-SE");

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);
}

/** Alle Tage von a bis b (einschließlich) */
export function dayRange(a: string, b: string) {
  const out: string[] = [];
  if (!a || !b || b < a) return a ? [a] : out;
  for (let d = a; d <= b && out.length < 1000; d = addDays(d, 1)) out.push(d);
  return out;
}

export const TRIP_STATUS: Record<TripStatus, { label: string; color: string }> = {
  idea: { label: "Idee", color: "gray" },
  planning: { label: "In Planung", color: "blue" },
  booked: { label: "Gebucht", color: "yellow" },
  done: { label: "Gereist", color: "green" },
  cancelled: { label: "Abgesagt", color: "red" },
};

export const BOOKING_STATUS: Record<BookingStatus, { label: string; color: string; hint: string }> = {
  idea: { label: "Idee", color: "gray", hint: "Nur eine Idee – der Preis zählt als geplant." },
  option: { label: "Reserviert", color: "yellow", hint: "Vorgemerkt oder reserviert, noch nicht bezahlt – zählt als geplant." },
  booked: { label: "Gebucht", color: "green", hint: "Gebucht – der Preis wird automatisch als Ausgabe übernommen." },
  cancelled: { label: "Storniert", color: "red", hint: "Storniert – zählt nirgends. Eine Stornogebühr als eigene Ausgabe erfassen." },
};

export const CATEGORIES: Record<ExpenseCategory, { label: string; icon: string }> = {
  flight: { label: "Flüge", icon: "✈️" },
  transport: { label: "Transport", icon: "🚆" },
  car: { label: "Auto, Sprit & Maut", icon: "🚗" },
  stay: { label: "Unterkunft", icon: "🏨" },
  food: { label: "Essen & Trinken", icon: "🍽" },
  groceries: { label: "Lebensmittel", icon: "🛒" },
  activities: { label: "Aktivitäten & Eintritt", icon: "🎟" },
  shopping: { label: "Shopping & Souvenirs", icon: "🛍" },
  fees: { label: "Visum, Versicherung & Gebühren", icon: "📄" },
  communication: { label: "Internet & Telefon", icon: "📱" },
  health: { label: "Gesundheit", icon: "💊" },
  other: { label: "Sonstiges", icon: "•" },
};

export const TRANSPORT_MODES: Record<TransportMode, { label: string; icon: string; category: ExpenseCategory }> = {
  flight: { label: "Flug", icon: "✈️", category: "flight" },
  train: { label: "Zug", icon: "🚆", category: "transport" },
  bus: { label: "Fernbus", icon: "🚌", category: "transport" },
  ferry: { label: "Fähre / Schiff", icon: "⛴", category: "transport" },
  car: { label: "Eigenes Auto", icon: "🚗", category: "car" },
  rentalcar: { label: "Mietwagen", icon: "🚙", category: "car" },
  taxi: { label: "Taxi / Transfer", icon: "🚕", category: "transport" },
  local: { label: "Nahverkehr", icon: "🚇", category: "transport" },
  bike: { label: "Fahrrad", icon: "🚲", category: "transport" },
  other: { label: "Sonstiges", icon: "🧭", category: "transport" },
};

export const STAY_KINDS: Record<StayKind, { label: string; icon: string }> = {
  hotel: { label: "Hotel", icon: "🏨" },
  apartment: { label: "Ferienwohnung", icon: "🏠" },
  hostel: { label: "Hostel", icon: "🛏" },
  camping: { label: "Camping", icon: "⛺" },
  private: { label: "Bei Freunden / Familie", icon: "🏡" },
  ship: { label: "Schiff / Nachtzug", icon: "🛳" },
  other: { label: "Sonstiges", icon: "🛌" },
};

export const PAYMENT_METHODS: Record<Exclude<PaymentMethod, "">, string> = {
  cash: "Bar",
  card: "Karte",
  online: "Online / Überweisung",
  other: "Sonstiges",
};

/** Farben für Personen – gut unterscheidbar */
export const PALETTE = ["#2a78d6", "#eb6834", "#1f9d6b", "#9b51e0", "#d6336c", "#c99a06", "#0f8fa8", "#6b7280"];

export const TRIP_EMOJIS = ["✈️", "🏝", "🏔", "🏙", "🚆", "🚗", "⛵", "🏕", "🗺", "🎒", "🌴", "❄️"];

/** Gängige Reisewährungen; andere ISO-Codes lassen sich eintippen. */
export const CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "DKK", "SEK", "NOK", "ISK", "PLN", "CZK", "HUF", "RON", "BGN", "TRY",
  "JPY", "CNY", "KRW", "THB", "VND", "IDR", "MYR", "SGD", "HKD", "PHP", "INR", "LKR",
  "AUD", "NZD", "CAD", "MXN", "BRL", "ARS", "CLP", "PEN", "COP", "CRC",
  "ZAR", "MAD", "EGP", "TZS", "KES", "AED", "ILS", "JOD", "QAR",
];

export const DEFAULT_TODOS = [
  "Reisepass / Personalausweis prüfen (gültig?)",
  "Einreisebestimmungen und Visum prüfen",
  "Auslandskrankenversicherung prüfen",
  "Impfungen prüfen",
  "Flüge bzw. Anreise buchen",
  "Unterkünfte buchen",
  "Mietwagen buchen",
  "Online einchecken",
  "Geld abheben / Kreditkarte freischalten",
  "Roaming / eSIM besorgen",
  "Haustier, Pflanzen und Post versorgen",
  "Offline-Karten herunterladen",
];

export const DEFAULT_PACKING = [
  "Dokumente:",
  "Reisepass / Ausweis",
  "Führerschein",
  "Krankenversicherungskarte",
  "Tickets und Buchungsbestätigungen",
  "Kreditkarte und Bargeld",
  "Kleidung:",
  "T-Shirts",
  "Hosen",
  "Unterwäsche und Socken",
  "Pullover / Jacke",
  "Schlafsachen",
  "Bequeme Schuhe",
  "Badesachen",
  "Hygiene:",
  "Zahnbürste und Zahnpasta",
  "Duschgel und Shampoo",
  "Sonnencreme",
  "Reiseapotheke",
  "Technik:",
  "Handy und Ladekabel",
  "Powerbank",
  "Reiseadapter",
  "Kopfhörer",
  "Sonstiges:",
  "Sonnenbrille",
  "Trinkflasche",
  "Buch / E-Reader",
];

export function defaultSettings(): Settings {
  return {
    id: "settings",
    updatedAt: now(),
    defaultCurrency: "EUR",
    excludeFlightsFromDaily: true,
    todoTemplate: DEFAULT_TODOS,
    packTemplate: DEFAULT_PACKING,
  };
}

/** Ältere oder unvollständige Datensätze (z. B. per Sync von einer älteren Version) mit Standardwerten ergänzen */
export function migrateSettings(s: Partial<Settings>): Settings {
  return { ...defaultSettings(), ...s, id: "settings" };
}

const base = () => ({ id: uid(), createdAt: now(), updatedAt: now() });

export function newTrip(s: Settings): Trip {
  const start = addDays(today(), 60);
  return {
    ...base(),
    name: "Neue Reise",
    destination: "",
    countries: [],
    startDate: start,
    endDate: addDays(start, 7),
    status: "planning",
    currency: s.defaultCurrency,
    rates: {},
    budgetType: "none",
    budget: 0,
    travelers: [],
    emoji: "✈️",
    notes: "",
  };
}

export function migrateTrip(t: Partial<Trip> & { id: string }, s: Settings): Trip {
  const d = newTrip(s);
  return { ...d, ...t, rates: { ...(t.rates ?? {}) }, countries: t.countries ?? [], travelers: t.travelers ?? [] } as Trip;
}

export function newPerson(n: number): Person {
  return { ...base(), name: "", email: "", phone: "", color: PALETTE[n % PALETTE.length], notes: "" };
}

export function migratePerson(p: Partial<Person> & { id: string }): Person {
  return { ...newPerson(0), color: PALETTE[0], ...p } as Person;
}

const booking = (trip: Trip, paidBy: string) => ({
  ...base(),
  tripId: trip.id,
  status: "idea" as BookingStatus,
  price: 0,
  currency: trip.currency,
  paidBy,
  travelers: [] as string[],
  provider: "",
  bookingRef: "",
  link: "",
  notes: "",
  expenseId: "",
});

export function newTransport(trip: Trip, paidBy: string, mode: TransportMode = "flight", date = trip.startDate): Transport {
  return {
    ...booking(trip, paidBy),
    mode,
    from: "",
    to: "",
    departDate: date,
    departTime: "",
    arriveDate: "",
    arriveTime: "",
    carrier: "",
    number: "",
    seat: "",
    details: "",
    distanceKm: 0,
    durationMin: null,
  };
}

export function newStay(trip: Trip, paidBy: string, checkIn = trip.startDate, checkOut = trip.endDate): Stay {
  return {
    ...booking(trip, paidBy),
    kind: "hotel",
    name: "",
    address: "",
    phone: "",
    checkIn,
    checkInTime: "",
    checkOut: checkOut > checkIn ? checkOut : addDays(checkIn, 1),
    checkOutTime: "",
    breakfast: false,
  };
}

export function newActivity(trip: Trip, paidBy: string, date = trip.startDate): Activity {
  return { ...booking(trip, paidBy), title: "", category: "activities", date, time: "", endTime: "", location: "" };
}

export function newChecklistItem(tripId: string, kind: ChecklistKind, title = "", group = ""): ChecklistItem {
  return { ...base(), tripId, kind, group, title, assignee: "", due: "", done: false };
}

/** Vorlage in Einträge umwandeln: Zeilen mit „:“ am Ende sind Abschnitte. */
export function templateItems(tripId: string, kind: ChecklistKind, lines: string[]): ChecklistItem[] {
  let group = "";
  const out: ChecklistItem[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (l.endsWith(":")) group = l.slice(0, -1).trim();
    else out.push(newChecklistItem(tripId, kind, l, group));
  }
  return out;
}

export function newExpense(trip: Trip, paidBy: string, date: string, currency = trip.currency): Expense {
  return {
    ...base(),
    tripId: trip.id,
    date,
    endDate: "",
    title: "",
    category: "food",
    amount: 0,
    currency,
    rate: null,
    paidBy,
    splitAmong: [],
    country: trip.countries.length === 1 ? trip.countries[0] : "",
    method: "",
    excludeFromDaily: false,
    source: "",
    sourceId: "",
    notes: "",
  };
}

export function migrateExpense(e: Partial<Expense> & { id: string }): Expense {
  return {
    tripId: "",
    date: "",
    endDate: "",
    title: "",
    category: "other",
    amount: 0,
    currency: "EUR",
    rate: null,
    paidBy: "",
    splitAmong: [],
    country: "",
    method: "",
    excludeFromDaily: false,
    source: "",
    sourceId: "",
    notes: "",
    createdAt: now(),
    updatedAt: now(),
    ...e,
  } as Expense;
}

export function newPayment(tripId: string, from: string, to: string, date: string): Payment {
  return { ...base(), tripId, date, from, to, amount: 0, notes: "" };
}
