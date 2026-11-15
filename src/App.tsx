import { useState } from "react";
import { AboutDialog, APP_VERSION } from "./components/About";
import { inTauri } from "./lib/api";
import { newTrip, templateItems } from "./lib/defaults";
import { dateTime } from "./lib/format";
import { useStore } from "./lib/store";
import Dashboard from "./pages/Dashboard";
import People from "./pages/People";
import SettingsPage from "./pages/Settings";
import Statistics from "./pages/Statistics";
import TripDetail from "./pages/TripDetail";
import Trips from "./pages/Trips";
import World from "./pages/World";

export type TripTab = "overview" | "route" | "transport" | "stays" | "activities" | "checklist" | "expenses" | "settlement" | "analysis" | "files";

export type View =
  | { page: "dashboard" }
  | { page: "trips" }
  | { page: "trip"; id: string; tab?: TripTab }
  | { page: "statistics" }
  | { page: "world" }
  | { page: "people"; id?: string }
  | { page: "settings"; tab?: string };

export type Nav = (v: View) => void;

export const TRIP_TABS: TripTab[] = ["overview", "route", "transport", "stays", "activities", "checklist", "expenses", "settlement", "analysis", "files"];

/** Browser-Vorschau: Startansicht per URL, z. B. ?trip=demo-japan&tab=analysis (für Screenshots) */
function initialView(): View {
  if (inTauri) return { page: "dashboard" };
  const p = new URLSearchParams(location.search);
  const trip = p.get("trip");
  const tab = p.get("tab") as TripTab | null;
  if (trip) return { page: "trip", id: trip, tab: tab && TRIP_TABS.includes(tab) ? tab : undefined };
  const page = p.get("page") as View["page"] | null;
  return page && ["dashboard", "trips", "world", "statistics", "people", "settings"].includes(page) ? ({ page } as View) : { page: "dashboard" };
}

const NAV: { page: View["page"]; label: string; icon: string }[] = [
  { page: "dashboard", label: "Übersicht", icon: "◧" },
  { page: "trips", label: "Reisen", icon: "🧳" },
  { page: "world", label: "Weltkarte", icon: "🌍" },
  { page: "statistics", label: "Statistik", icon: "📊" },
  { page: "people", label: "Mitreisende", icon: "☺" },
  { page: "settings", label: "Einstellungen", icon: "⚙" },
];

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>(initialView);
  const [about, setAbout] = useState(false);

  if (!store.ready) return <div className="loading">Lade Daten …</div>;

  const createTrip = () => {
    const t = newTrip(store.settings);
    // Wer bin ich? → automatisch als Mitreisender eintragen
    if (store.me && store.people.some((p) => p.id === store.me)) t.travelers = [store.me];
    store.save("trips", t);
    for (const c of templateItems(t.id, "todo", store.settings.todoTemplate)) store.save("checklist", c);
    for (const c of templateItems(t.id, "pack", store.settings.packTemplate)) store.save("checklist", c);
    setView({ page: "trip", id: t.id });
  };

  const active = view.page === "trip" ? "trips" : view.page;
  const { sync, config } = store;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">✈️</span>
          <span>Reiseplaner</span>
        </div>
        <button className="primary new" onClick={createTrip}>
          + Neue Reise
        </button>
        <nav>
          {NAV.map((n) => (
            <button key={n.page} className={active === n.page ? "active" : ""} onClick={() => setView({ page: n.page } as View)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sync-box">
          {config?.webdav.enabled ? (
            <>
              <button className="ghost small" disabled={sync.running} onClick={() => store.runSync()}>
                {sync.running ? "Synchronisiere …" : "⟳ Jetzt synchronisieren"}
              </button>
              {sync.error ? (
                <div className="sync-state error" title={sync.error} onClick={() => setView({ page: "settings", tab: "sync" })}>
                  Sync-Fehler – Details
                </div>
              ) : sync.last ? (
                <div className="sync-state">Zuletzt: {dateTime(sync.last.finishedAt)}</div>
              ) : null}
            </>
          ) : (
            <button className="link small" onClick={() => setView({ page: "settings", tab: "sync" })}>
              Nextcloud-Sync einrichten
            </button>
          )}
          <button className="link small about-link" onClick={() => setAbout(true)}>
            ⓘ Über Reiseplaner · v{APP_VERSION}
          </button>
        </div>
      </aside>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      <main className={`content ${view.page === "trip" || view.page === "statistics" || view.page === "world" ? "wide" : ""}`}>
        {store.saveError && (
          <div className="alert error banner">
            {store.saveError}
            <button className="icon" onClick={store.clearSaveError}>
              ×
            </button>
          </div>
        )}
        {view.page === "dashboard" && <Dashboard nav={setView} onNew={createTrip} />}
        {view.page === "trips" && <Trips nav={setView} onNew={createTrip} />}
        {view.page === "trip" && <TripDetail key={view.id} view={view} nav={setView} />}
        {view.page === "world" && <World nav={setView} />}
        {view.page === "statistics" && <Statistics nav={setView} />}
        {view.page === "people" && <People selected={view.id} nav={setView} />}
        {view.page === "settings" && <SettingsPage tab={view.tab} />}
      </main>
    </div>
  );
}
