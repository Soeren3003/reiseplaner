/** Gemeinsame Felder aller gespeicherten Datensätze. */
export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Mitreisende – einmal angelegt, für beliebig viele Reisen auswählbar. */
export interface Person extends Entity {
  name: string;
  email: string;
  phone: string;
  color: string;
  notes: string;
}

export type TripStatus = "idea" | "planning" | "booked" | "done" | "cancelled";

export type BudgetType = "none" | "total" | "daily";

export interface Trip extends Entity {
  name: string;
  /** Reiseziel als Freitext, z. B. „Japan: Tokio, Kyoto, Osaka“ */
  destination: string;
  /** Länder dieser Reise (Auswahl bei Ausgaben, Auswertung nach Land) */
  countries: string[];
  startDate: string;
  endDate: string;
  status: TripStatus;
  /** Heimatwährung der Reise: darin wird gerechnet, abgerechnet und ausgewertet */
  currency: string;
  /**
   * Wechselkurse: 1 Einheit Fremdwährung = x Einheiten Heimatwährung, z. B. { JPY: 0.0062 }.
   * Werden von Hand gepflegt; einzelne Ausgaben können einen eigenen Kurs haben.
   */
  rates: Record<string, number>;
  budgetType: BudgetType;
  /** Gesamtbudget bzw. Budget pro Tag, in der Heimatwährung */
  budget: number;
  /** Personen-IDs der Mitreisenden; leer = allein unterwegs */
  travelers: string[];
  emoji: string;
  notes: string;
}

/**
 * Stand einer Buchung:
 * - idea:      nur eine Idee, Preis zählt als „geplant“
 * - option:    reserviert bzw. vorgemerkt, noch nicht bezahlt – zählt als „geplant“
 * - booked:    gebucht – der Preis wird automatisch als Ausgabe übernommen
 * - cancelled: storniert – zählt nirgends
 */
export type BookingStatus = "idea" | "option" | "booked" | "cancelled";

/** Felder, die Transport, Unterkunft und Aktivität gemeinsam haben. */
export interface Booking extends Entity {
  tripId: string;
  status: BookingStatus;
  price: number;
  currency: string;
  /** Person-ID, die bezahlt hat bzw. bezahlen wird */
  paidBy: string;
  /** Für wen? Leer = alle Mitreisenden */
  travelers: string[];
  /** Zahlungsmittel (Name aus den Einstellungen, z. B. „Kreditkarte“) */
  method: string;
  /** Anbieter bzw. Buchungsportal */
  provider: string;
  bookingRef: string;
  link: string;
  notes: string;
  /** Automatisch erzeugte Ausgabe, solange der Status „gebucht“ ist */
  expenseId: string;
}

export type TransportMode = "flight" | "train" | "bus" | "ferry" | "car" | "rentalcar" | "taxi" | "local" | "bike" | "other";

export interface Transport extends Booking {
  mode: TransportMode;
  from: string;
  to: string;
  departDate: string;
  departTime: string;
  /** leer = gleicher Tag wie Abfahrt */
  arriveDate: string;
  arriveTime: string;
  /** Fluggesellschaft, Bahn, Busunternehmen, Vermieter … */
  carrier: string;
  /** Flug-, Zug- oder Busnummer */
  number: string;
  /** Sitzplatz, Wagen, Klasse */
  seat: string;
  /** Terminal, Gleis, Abholort … */
  details: string;
  /** Strecke in km (optional, für die Statistik) */
  distanceKm: number;
  /** Reisedauer in Minuten; null = aus Ab- und Ankunft berechnen (Ortszeit, ohne Zeitzonen) */
  durationMin: number | null;
}

export type StayKind = "hotel" | "apartment" | "hostel" | "camping" | "private" | "ship" | "other";

/** Verpflegung: Übernachtung, Frühstück, Halbpension, Vollpension, All-Inclusive oder einzelne Mahlzeiten */
export type Board = "none" | "breakfast" | "half" | "full" | "all" | "custom";

export type Meal = "breakfast" | "lunch" | "dinner";

/** Kurtaxe: pro Person und Nacht oder pro Nacht (Zimmer/Wohnung) */
export type TaxUnit = "person" | "night";

export interface Stay extends Booking {
  kind: StayKind;
  name: string;
  address: string;
  phone: string;
  checkIn: string;
  checkInTime: string;
  checkOut: string;
  checkOutTime: string;
  board: Board;
  /** nur bei board = "custom" */
  meals: Meal[];
  /** Kurtaxe bzw. Tourismusabgabe je Einheit, in der Währung der Unterkunft (0 = keine) */
  touristTax: number;
  touristTaxUnit: TaxUnit;
  /** Personen für die Kurtaxe; null = automatisch (Mitreisende der Unterkunft) */
  touristTaxPersons: number | null;
  /** schon im Preis enthalten → keine eigene Ausgabe */
  touristTaxIncluded: boolean;
  /** Automatisch erzeugte Ausgabe für die Kurtaxe */
  taxExpenseId: string;
}

export interface Activity extends Booking {
  title: string;
  /** Kategorie der daraus entstehenden Ausgabe */
  category: ExpenseCategory;
  date: string;
  time: string;
  endTime: string;
  location: string;
}

export type ChecklistKind = "todo" | "pack";

/** Aufgaben vor der Reise und Packliste */
export interface ChecklistItem extends Entity {
  tripId: string;
  kind: ChecklistKind;
  /** Abschnitt, z. B. „Dokumente“, „Kleidung“ */
  group: string;
  title: string;
  /** Person-ID; leer = alle bzw. niemand bestimmtes */
  assignee: string;
  due: string;
  done: boolean;
}

export type ExpenseCategory =
  | "flight"
  | "transport"
  | "car"
  | "stay"
  | "food"
  | "groceries"
  | "activities"
  | "shopping"
  | "fees"
  | "communication"
  | "health"
  | "other";

/** Zahlungsmittel: frei benennbar (Einstellungen), leer = ohne Angabe */
export type PaymentMethod = string;

export type BookingKind = "transport" | "stay" | "activity";

export interface Expense extends Entity {
  tripId: string;
  date: string;
  /** Ausgabe über mehrere Tage verteilen (z. B. Unterkunft, Mietwagen, Rail-Pass); leer = nur am Datum */
  endDate: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  /** Eigener Kurs (1 Fremdwährung = x Heimatwährung); null = Kurs der Reise */
  rate: number | null;
  /** Person-ID, die bezahlt hat */
  paidBy: string;
  /** Aufteilung auf diese Personen; leer = alle Mitreisenden */
  splitAmong: string[];
  country: string;
  method: PaymentMethod;
  /** zählt nicht zum Tagesdurchschnitt (z. B. Anreise, Versicherung vorab) */
  excludeFromDaily: boolean;
  /** Herkunft, wenn automatisch aus einer Buchung erzeugt */
  source: "" | BookingKind;
  sourceId: string;
  notes: string;
}

/** Geld, das zwischen Mitreisenden schon geflossen ist (in der Heimatwährung der Reise). */
export interface Payment extends Entity {
  tripId: string;
  date: string;
  from: string;
  to: string;
  amount: number;
  notes: string;
}

export interface Settings {
  id: "settings";
  updatedAt: string;
  defaultCurrency: string;
  /** Anreise und Rückreise (Flüge) standardmäßig nicht im Tagesdurchschnitt */
  excludeFlightsFromDaily: boolean;
  /** Zahlungsmittel zur Auswahl, z. B. „Bar“, „Kreditkarte“, „Revolut“ */
  paymentMethods: string[];
  todoTemplate: string[];
  /** Zeilen mit „:“ am Ende beginnen einen Abschnitt */
  packTemplate: string[];
}

export interface FileMeta {
  name: string;
  size: number;
  modified: number;
}

export interface WebdavConfig {
  enabled: boolean;
  url: string;
  username: string;
  remoteFolder: string;
  autoSyncMinutes: number;
}

export interface LocalConfig {
  dataDir: string;
  webdav: WebdavConfig;
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: string[];
  errors: string[];
  finishedAt: string;
}
