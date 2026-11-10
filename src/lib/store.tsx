import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Collection } from "./api";
import { syncBookingExpenses, type AnyBooking } from "./calc";
import { defaultSettings, migrateBooking, migrateExpense, migratePerson, migrateSettings, migrateStay, migrateTrip, newExpense, now } from "./defaults";
import type { Activity, BookingKind, ChecklistItem, Expense, LocalConfig, Payment, Person, Settings, Stay, SyncReport, Transport, Trip } from "./types";

type Entity = { id: string; updatedAt: string };

interface SyncStatus {
  running: boolean;
  last: SyncReport | null;
  error: string;
}

export type ListCollection = Exclude<Collection, "settings">;

export interface Data {
  trips: Trip[];
  people: Person[];
  transports: Transport[];
  stays: Stay[];
  activities: Activity[];
  checklist: ChecklistItem[];
  expenses: Expense[];
  payments: Payment[];
}

/** Sammlung je Buchungsart */
export const BOOKING_COLLECTION = { transport: "transports", stay: "stays", activity: "activities" } as const satisfies Record<BookingKind, ListCollection>;

interface Store extends Data {
  ready: boolean;
  settings: Settings;
  config: LocalConfig | null;
  sync: SyncStatus;
  saveError: string;
  /** Wer bin ich? Nur lokal gespeichert – Vorauswahl „bezahlt von“ und „mein Anteil“. */
  me: string;
  setMe: (id: string) => void;
  clearSaveError: () => void;
  saveSettings: (s: Settings) => void;
  save: <K extends ListCollection>(collection: K, item: Data[K][number]) => void;
  remove: (collection: ListCollection, id: string) => Promise<void>;
  /** Buchung speichern und die zugehörige Ausgabe anlegen, anpassen oder entfernen */
  saveBooking: (kind: BookingKind, booking: AnyBooking, trip?: Trip) => void;
  removeBooking: (kind: BookingKind, booking: AnyBooking) => Promise<void>;
  /**
   * Ausgabe ändern. Bei automatisch übernommenen Ausgaben gehen Zahler, Aufteilung und Zahlungsmittel an die
   * Buchung (sonst würden sie beim nächsten Speichern der Buchung überschrieben).
   */
  updateExpense: (e: Expense, patch: Partial<Expense>) => void;
  deleteTrip: (id: string) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  runSync: () => Promise<void>;
  setConfig: (c: LocalConfig) => void;
  flush: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider fehlt");
  return s;
}

const SAVE_DELAY = 400;
export const LISTS: ListCollection[] = ["trips", "people", "transports", "stays", "activities", "checklist", "expenses", "payments"];
/** Sammlungen, deren Einträge zu einer Reise gehören */
const PER_TRIP = ["transports", "stays", "activities", "checklist", "expenses", "payments"] as const;
const EMPTY: Data = { trips: [], people: [], transports: [], stays: [], activities: [], checklist: [], expenses: [], payments: [] };

function readMe() {
  try {
    return localStorage.getItem("reiseplaner:me") ?? "";
  } catch {
    return "";
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [data, setData] = useState<Data>(EMPTY);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ running: false, last: null, error: "" });
  const [saveError, setSaveError] = useState("");
  const [me, setMeState] = useState(readMe);

  // Verzögertes Speichern: Tippen erzeugt nicht für jeden Buchstaben einen Schreibvorgang.
  const pending = useRef(new Map<string, { collection: Collection; value: Entity; timer: number }>());

  const persist = useCallback(async (collection: Collection, value: Entity) => {
    try {
      await api.dbPut(collection, value.id, value);
    } catch (e) {
      console.error(e);
      setSaveError(`Speichern fehlgeschlagen: ${e}`);
    }
  }, []);

  const schedule = useCallback(
    (collection: Collection, value: Entity) => {
      const k = `${collection}/${value.id}`;
      const prev = pending.current.get(k);
      if (prev) clearTimeout(prev.timer);
      const timer = window.setTimeout(() => {
        pending.current.delete(k);
        persist(collection, value);
      }, SAVE_DELAY);
      pending.current.set(k, { collection, value, timer });
    },
    [persist],
  );

  const cancel = (k: string) => {
    const it = pending.current.get(k);
    if (it) clearTimeout(it.timer);
    pending.current.delete(k);
  };

  const flush = useCallback(async () => {
    const items = [...pending.current.values()];
    pending.current.clear();
    for (const it of items) {
      clearTimeout(it.timer);
      await persist(it.collection, it.value);
    }
  }, [persist]);

  const reload = useCallback(async () => {
    const [s, ...lists] = await Promise.all([api.dbList<Settings>("settings"), ...LISTS.map((c) => api.dbList<Entity>(c))]);
    const stored = s.find((x) => x.id === "settings");
    const cur = stored ? migrateSettings(stored) : defaultSettings();
    setSettings(cur);
    if (!stored) await api.dbPut("settings", cur.id, cur);
    const next = { ...EMPTY } as Record<ListCollection, Entity[]>;
    LISTS.forEach((c, i) => (next[c] = lists[i]));
    const d = next as unknown as Data;
    d.people = d.people.map(migratePerson).sort((a, b) => a.name.localeCompare(b.name, "de"));
    d.trips = d.trips.map((t) => migrateTrip(t, cur)).sort((a, b) => b.startDate.localeCompare(a.startDate));
    d.expenses = d.expenses.map(migrateExpense);
    d.stays = d.stays.map(migrateStay);
    d.transports = d.transports.map(migrateBooking);
    d.activities = d.activities.map(migrateBooking);
    setData(d);
  }, []);

  const runSync = useCallback(async () => {
    setSync((s) => ({ ...s, running: true, error: "" }));
    try {
      await flush();
      const report = await api.syncNow();
      setSync({ running: false, last: report, error: report.errors.length ? report.errors.join("\n") : "" });
      if (report.downloaded || report.deletedLocal || report.conflicts.length) await reload();
    } catch (e) {
      setSync((s) => ({ ...s, running: false, error: String(e) }));
    }
  }, [flush, reload]);

  useEffect(() => {
    (async () => {
      const cfg = await api.getConfig();
      setConfig(cfg);
      await reload();
      setReady(true);
      if (cfg.webdav.enabled) runSync();
    })();
    const onClose = () => void flush();
    window.addEventListener("beforeunload", onClose);
    return () => window.removeEventListener("beforeunload", onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatischer Abgleich im eingestellten Intervall.
  useEffect(() => {
    const min = config?.webdav.enabled ? config.webdav.autoSyncMinutes : 0;
    if (!min) return;
    const t = window.setInterval(() => runSync(), min * 60_000);
    return () => clearInterval(t);
  }, [config, runSync]);

  const remove = useCallback(async (collection: ListCollection, id: string) => {
    cancel(`${collection}/${id}`);
    await api.dbDelete(collection, id);
    setData((d) => ({ ...d, [collection]: (d[collection] as Entity[]).filter((x) => x.id !== id) }));
  }, []);

  const save = useCallback(
    <K extends ListCollection>(collection: K, item: Data[K][number]) => {
      const v = { ...item, updatedAt: now() };
      setData((d) => {
        const list = d[collection] as Entity[];
        const i = list.findIndex((x) => x.id === v.id);
        const copy = list.slice();
        if (i < 0) copy.push(v);
        else copy[i] = v;
        return { ...d, [collection]: copy };
      });
      schedule(collection, v);
    },
    [schedule],
  );

  const value: Store = useMemo(
    () => ({
      ready,
      settings,
      ...data,
      config,
      sync,
      saveError,
      me,
      setMe: (id) => {
        setMeState(id);
        try {
          localStorage.setItem("reiseplaner:me", id);
        } catch {
          /* nur Komfort */
        }
      },
      clearSaveError: () => setSaveError(""),
      reload,
      runSync,
      flush,
      setConfig,
      saveSettings: (s) => {
        const v = { ...s, updatedAt: now() };
        setSettings(v);
        schedule("settings", v);
      },
      save,
      saveBooking: (kind, booking, tripOverride) => {
        const trip = tripOverride ?? data.trips.find((t) => t.id === booking.tripId);
        if (!trip) return save(BOOKING_COLLECTION[kind], booking as never);
        const r = syncBookingExpenses(kind, booking, trip, settings, data.expenses, () => newExpense(trip, booking.paidBy, booking.createdAt.slice(0, 10)));
        for (const e of r.upserts) save("expenses", e);
        for (const id of r.removals) void remove("expenses", id);
        save(BOOKING_COLLECTION[kind], r.booking as never);
      },
      updateExpense: (e, patch) => {
        const booking = e.source ? (data[BOOKING_COLLECTION[e.source]] as AnyBooking[]).find((b) => b.id === e.sourceId) : undefined;
        const toBooking: Partial<AnyBooking> = {};
        if (patch.paidBy !== undefined) toBooking.paidBy = patch.paidBy;
        if (patch.splitAmong !== undefined) toBooking.travelers = patch.splitAmong;
        if (patch.method !== undefined) toBooking.method = patch.method;
        if (booking && e.source && Object.keys(toBooking).length) {
          const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !["paidBy", "splitAmong", "method"].includes(k)));
          // übrige Felder (z. B. Land, Notiz) bleiben an der Ausgabe; die Buchung gleicht danach Preis und Zahler ab
          const ex = Object.keys(rest).length ? { ...e, ...rest } : e;
          const others = data.expenses.map((x) => (x.id === ex.id ? ex : x));
          const trip = data.trips.find((t) => t.id === booking.tripId);
          if (!trip) return;
          const r = syncBookingExpenses(e.source, { ...booking, ...toBooking } as AnyBooking, trip, settings, others, () => newExpense(trip, booking.paidBy, booking.createdAt.slice(0, 10)));
          for (const x of r.upserts) save("expenses", x);
          for (const id of r.removals) void remove("expenses", id);
          save(BOOKING_COLLECTION[e.source], r.booking as never);
          return;
        }
        save("expenses", { ...e, ...patch });
      },
      removeBooking: async (kind, b) => {
        if (b.expenseId) await remove("expenses", b.expenseId);
        if ("taxExpenseId" in b && b.taxExpenseId) await remove("expenses", b.taxExpenseId);
        await remove(BOOKING_COLLECTION[kind], b.id);
      },
      remove,
      deleteTrip: async (id) => {
        for (const c of PER_TRIP) {
          for (const x of (data[c] as { id: string; tripId: string }[]).filter((x) => x.tripId === id)) await remove(c, x.id);
        }
        await api.filesDeleteAll(id);
        await remove("trips", id);
      },
      deletePerson: async (id) => {
        // Nur möglich, wenn die Person bei keiner Reise mitfährt (sonst stimmen Abrechnungen nicht mehr) – siehe People.
        await remove("people", id);
      },
    }),
    [ready, settings, data, config, sync, saveError, me, reload, runSync, flush, schedule, remove, save],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
