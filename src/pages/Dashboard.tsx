import { useMemo } from "react";
import type { Nav } from "../App";
import { Badge, Empty } from "../components/ui";
import { tripPhase } from "../lib/calc";
import { TRIP_STATUS, daysBetween, today } from "../lib/defaults";
import { transportTitle } from "../lib/export";
import { dateRange, dayLabel, money } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize, type TripSummary } from "../lib/summary";
import type { Trip } from "../lib/types";

export default function Dashboard({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const store = useStore();
  const t0 = today();
  const all = useMemo(() => store.trips.map((t) => ({ trip: t, sum: summarize(t, store) })), [store]);
  const live = all.filter((x) => x.trip.status !== "cancelled");
  const current = live.filter((x) => tripPhase(x.trip, t0) === "during");
  const upcoming = live.filter((x) => tripPhase(x.trip, t0) === "before").sort((a, b) => a.trip.startDate.localeCompare(b.trip.startDate));
  const past = live.filter((x) => tripPhase(x.trip, t0) === "after").sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate));
  const openSettlements = past.filter((x) => x.sum.shared && x.sum.settlement.transfers.length > 0);

  if (!store.trips.length)
    return (
      <div className="page">
        <div className="page-head">
          <h1>Übersicht</h1>
        </div>
        <Empty>
          <p>
            <strong>Willkommen beim Reiseplaner!</strong>
          </p>
          <p>
            1. Eine Reise anlegen: Zeitraum, Reiseziel, Heimatwährung und optional ein Budget.
            <br />
            2. Planen: Flüge und andere Verbindungen, Unterkünfte, Aktivitäten, Aufgaben und Packliste.
            <br />
            3. Unterwegs Ausgaben erfassen – auch in Fremdwährung. Gebuchtes wird automatisch übernommen.
            <br />
            4. Am Ende auswerten: Tabellen und Diagramme pro Tag, Kategorie und Land, plus Abrechnung mit{" "}
            <button className="link" onClick={() => nav({ page: "people" })}>
              Mitreisenden
            </button>
            .
            <br />
            5. Optional: Nextcloud-Sync einrichten, um auf mehreren Rechnern oder gemeinsam zu planen.
          </p>
          <button className="primary" onClick={onNew}>
            + Erste Reise anlegen
          </button>
        </Empty>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Übersicht</h1>
      </div>

      {current.map((x) => (
        <TripHero key={x.trip.id} trip={x.trip} sum={x.sum} nav={nav} label="Gerade unterwegs" />
      ))}
      {!current.length && upcoming[0] && <TripHero trip={upcoming[0].trip} sum={upcoming[0].sum} nav={nav} label="Nächste Reise" />}

      <div className="split">
        <div className="main-col">
          <section className="card">
            <h2>Geplante Reisen</h2>
            {upcoming.length === 0 ? (
              <p className="muted">Nichts geplant – Zeit für eine neue Idee?</p>
            ) : (
              <TripTable rows={upcoming} nav={nav} upcoming />
            )}
          </section>
          {past.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2>Vergangene Reisen</h2>
                <button className="link small" onClick={() => nav({ page: "statistics" })}>
                  → Statistik
                </button>
              </div>
              <TripTable rows={past.slice(0, 8)} nav={nav} />
            </section>
          )}
        </div>
        <aside className="side-col">
          <NextSteps rows={[...current, ...upcoming]} nav={nav} />
          {openSettlements.length > 0 && (
            <section className="card">
              <h2>Offene Abrechnungen</h2>
              <ul className="plain">
                {openSettlements.map(({ trip, sum }) => (
                  <li key={trip.id}>
                    <button className="link" onClick={() => nav({ page: "trip", id: trip.id, tab: "settlement" })}>
                      {trip.name}
                    </button>{" "}
                    <span className="muted small">– {sum.settlement.transfers.length} Überweisung(en)</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function TripHero({ trip, sum, nav, label }: { trip: Trip; sum: TripSummary; nav: Nav; label: string }) {
  const t0 = today();
  const m = (n: number) => money(n, trip.currency);
  const during = tripPhase(trip, t0) === "during";
  const d = daysBetween(t0, trip.startDate);
  const todaySpent = sum.stats.daily.find((x) => x.date === t0)?.total ?? 0;
  const next = sum.plan.find((p) => p.date >= t0 && (p.transports.length || p.activities.length || p.checkIns.length));
  return (
    <section className="card next-trip" onClick={() => nav({ page: "trip", id: trip.id, tab: during ? "expenses" : "overview" })}>
      <div className="row between">
        <div>
          <div className="muted small">{label}</div>
          <h2 className="next-title">
            {trip.emoji} {trip.name}
          </h2>
          <div className="muted">
            {dateRange(trip.startDate, trip.endDate)}
            {trip.destination && <> · {trip.destination}</>}
          </div>
        </div>
        <div className="countdown">{during ? `Tag ${daysBetween(trip.startDate, t0) + 1} von ${sum.stats.days}` : d === 1 ? "morgen" : `in ${d} Tagen`}</div>
      </div>
      <div className="stats">
        {during ? (
          <>
            <div className="stat">
              <div className="stat-label">Heute ausgegeben</div>
              <div className="stat-value">{m(todaySpent)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Ø pro Tag</div>
              <div className="stat-value">{m(sum.stats.perDay)}</div>
            </div>
          </>
        ) : (
          <>
            <div className="stat">
              <div className="stat-label">Offene Aufgaben</div>
              <div className="stat-value">{sum.openTodos}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Noch nicht gebucht</div>
              <div className="stat-value">{sum.openBookings}</div>
            </div>
          </>
        )}
        <div className="stat">
          <div className="stat-label">Ausgaben bisher</div>
          <div className="stat-value">{m(sum.stats.total)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Als Nächstes</div>
          <div className="stat-text">
            {next ? (
              <>
                {dayLabel(next.date)}: {next.transports[0] ? transportTitle(next.transports[0]) : next.checkIns[0] ? `Check-in ${next.checkIns[0].name}` : next.activities[0]?.title}
              </>
            ) : (
              "–"
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TripTable({ rows, nav, upcoming }: { rows: { trip: Trip; sum: TripSummary }[]; nav: Nav; upcoming?: boolean }) {
  return (
    <table className="list">
      <thead>
        <tr>
          <th>Reise</th>
          <th>Zeitraum</th>
          <th>Status</th>
          <th className="r">{upcoming ? "geplant" : "Ausgaben"}</th>
          <th className="r">{upcoming ? "offen" : "pro Tag"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ trip: t, sum }) => (
          <tr key={t.id} onClick={() => nav({ page: "trip", id: t.id })}>
            <td>
              {t.emoji} {t.name}
              {t.destination && <div className="muted small">{t.destination}</div>}
            </td>
            <td className="nowrap">{dateRange(t.startDate, t.endDate)}</td>
            <td>
              <Badge color={TRIP_STATUS[t.status].color}>{TRIP_STATUS[t.status].label}</Badge>
            </td>
            <td className="r">{money(upcoming ? sum.stats.total + sum.planned : sum.stats.total, t.currency)}</td>
            <td className="r">{upcoming ? sum.openBookings + sum.openTodos || "–" : money(sum.stats.perDay, t.currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NextSteps({ rows, nav }: { rows: { trip: Trip; sum: TripSummary }[]; nav: Nav }) {
  const store = useStore();
  const t0 = today();
  const todos = rows
    .flatMap((x) => x.sum.checklist.filter((c) => c.kind === "todo" && !c.done).map((c) => ({ c, trip: x.trip })))
    .sort((a, b) => (a.c.due || a.trip.startDate).localeCompare(b.c.due || b.trip.startDate))
    .slice(0, 8);
  const gaps = rows.filter((x) => x.sum.nightsWithoutStay.length);
  return (
    <section className="card">
      <h2>Als Nächstes erledigen</h2>
      {todos.length === 0 && gaps.length === 0 ? (
        <p className="muted">Nichts offen 👍</p>
      ) : (
        <ul className="plain task-mini">
          {gaps.map(({ trip, sum }) => (
            <li key={`gap-${trip.id}`} onClick={() => nav({ page: "trip", id: trip.id, tab: "stays" })}>
              <span>🌙</span>
              <div>
                <div>{sum.nightsWithoutStay.length} Nacht/Nächte ohne Unterkunft</div>
                <div className="muted small">{trip.name}</div>
              </div>
            </li>
          ))}
          {todos.map(({ c, trip }) => (
            <li key={c.id} onClick={() => nav({ page: "trip", id: trip.id, tab: "checklist" })}>
              <label className="check" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={c.done} onChange={() => store.save("checklist", { ...c, done: true })} />
              </label>
              <div>
                <div>{c.title || "Ohne Titel"}</div>
                <div className="muted small">
                  {trip.name}
                  {c.due && <> · bis {dayLabel(c.due)}</>}
                  {c.due && c.due < t0 && <span className="neg"> · überfällig</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
