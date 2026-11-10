import { useMemo } from "react";
import type { Nav, TripTab, View } from "../App";
import { Empty } from "../components/ui";
import { confirmDialog } from "../lib/api";
import { TRIP_EMOJIS, TRIP_STATUS } from "../lib/defaults";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";
import type { Trip, TripStatus } from "../lib/types";
import Activities from "./trip/Activities";
import Analysis from "./trip/Analysis";
import Checklist from "./trip/Checklist";
import Expenses from "./trip/Expenses";
import Files from "./trip/Files";
import Overview from "./trip/Overview";
import Settlement from "./trip/Settlement";
import Stays from "./trip/Stays";
import Transports from "./trip/Transports";

export default function TripDetail({ view, nav }: { view: Extract<View, { page: "trip" }>; nav: Nav }) {
  const store = useStore();
  const trip = store.trips.find((t) => t.id === view.id);
  const sum = useMemo(() => (trip ? summarize(trip, store) : null), [trip, store]);
  if (!trip || !sum) return <Empty>Reise nicht gefunden.</Empty>;
  const tab = view.tab ?? "overview";
  const go = (t: TripTab) => nav({ page: "trip", id: trip.id, tab: t });
  const set = (patch: Partial<Trip>) => store.save("trips", { ...trip, ...patch });

  const remove = async () => {
    if (!(await confirmDialog(`„${trip.name}“ mit Transport, Unterkünften, Aktivitäten, Listen, Ausgaben und Dokumenten löschen? Die Mitreisenden bleiben erhalten.`))) return;
    await store.deleteTrip(trip.id);
    nav({ page: "trips" });
  };

  const tabs: [TripTab, string, number?][] = [
    ["overview", "Überblick"],
    ["transport", "Transport", sum.transports.length],
    ["stays", "Unterkünfte", sum.stays.length],
    ["activities", "Aktivitäten", sum.activities.length],
    ["checklist", "Vorbereitung", sum.openTodos + sum.openPacking],
    ["expenses", "Ausgaben", sum.expenses.length],
    ...(sum.shared ? ([["settlement", "Abrechnung", sum.settlement.transfers.length]] as [TripTab, string, number][]) : []),
    ["analysis", "Auswertung"],
    ["files", "Dokumente"],
  ];

  return (
    <div className="page trip-page">
      <div className="page-head">
        <select className="emoji-select" value={trip.emoji} onChange={(e) => set({ emoji: e.target.value })} aria-label="Symbol der Reise">
          {[...new Set([trip.emoji, ...TRIP_EMOJIS])].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input className="title-input" value={trip.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name der Reise" />
        <div className="toolbar">
          <select value={trip.status} onChange={(e) => set({ status: e.target.value as TripStatus })}>
            {Object.entries(TRIP_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="ghost danger" onClick={remove}>
            Löschen
          </button>
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([id, label, count]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => go(id)}>
            {label}
            {!!count && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview trip={trip} sum={sum} go={go} />}
      {tab === "transport" && <Transports trip={trip} sum={sum} />}
      {tab === "stays" && <Stays trip={trip} sum={sum} />}
      {tab === "activities" && <Activities trip={trip} sum={sum} />}
      {tab === "checklist" && <Checklist trip={trip} sum={sum} />}
      {tab === "expenses" && <Expenses trip={trip} sum={sum} />}
      {tab === "settlement" && <Settlement trip={trip} sum={sum} go={go} />}
      {tab === "analysis" && <Analysis trip={trip} sum={sum} />}
      {tab === "files" && <Files trip={trip} />}
    </div>
  );
}
