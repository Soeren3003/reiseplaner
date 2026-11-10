import {
  dayPlan,
  missingRates,
  nightsWithoutStay,
  plannedCosts,
  settlement,
  sortActivities,
  sortStays,
  sortTransports,
  tripStats,
  type PlanDay,
  type Settlement,
  type TripStats,
} from "./calc";
import type { Data } from "./store";
import type { Activity, Booking, ChecklistItem, Expense, Payment, Person, Settings, Stay, Transport, Trip } from "./types";

/** Alles, was zu einer Reise gehört, einmal zusammengesucht. */
export interface TripSummary {
  travelers: Person[];
  /** Mitreisende vorhanden → Aufteilung und Abrechnung anzeigen */
  shared: boolean;
  transports: Transport[];
  stays: Stay[];
  activities: Activity[];
  bookings: Booking[];
  checklist: ChecklistItem[];
  expenses: Expense[];
  payments: Payment[];
  stats: TripStats;
  settlement: Settlement;
  /** Preise von Ideen und Reservierungen */
  planned: number;
  /** Buchungen, die noch nicht gebucht sind */
  openBookings: number;
  missingRates: string[];
  nightsWithoutStay: string[];
  plan: PlanDay[];
  openTodos: number;
  openPacking: number;
  person: (id: string) => Person | undefined;
  name: (id: string) => string;
}

export function summarize(trip: Trip, store: Data & { settings: Settings }): TripSummary {
  const person = (id: string) => store.people.find((p) => p.id === id);
  const of = <T extends { tripId: string }>(l: T[]) => l.filter((x) => x.tripId === trip.id);
  const transports = sortTransports(of(store.transports));
  const stays = sortStays(of(store.stays));
  const activities = sortActivities(of(store.activities));
  const bookings: Booking[] = [...transports, ...stays, ...activities];
  const expenses = of(store.expenses).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const payments = of(store.payments).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const checklist = of(store.checklist);
  const travelers = trip.travelers.map(person).filter((p): p is Person => !!p);
  return {
    travelers,
    shared: trip.travelers.length > 1,
    transports,
    stays,
    activities,
    bookings,
    checklist,
    expenses,
    payments,
    stats: tripStats(trip, expenses),
    settlement: settlement(trip, expenses, payments),
    planned: plannedCosts(trip, bookings),
    openBookings: bookings.filter((b) => b.status === "idea" || b.status === "option").length,
    missingRates: missingRates(trip, expenses, bookings),
    nightsWithoutStay: nightsWithoutStay(trip, stays, transports),
    plan: dayPlan(trip, transports, stays, activities, expenses),
    openTodos: checklist.filter((c) => c.kind === "todo" && !c.done).length,
    openPacking: checklist.filter((c) => c.kind === "pack" && !c.done).length,
    person,
    name: (id: string) => person(id)?.name || (id ? "Unbekannt" : "–"),
  };
}
