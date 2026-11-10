import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { Badge, Empty } from "../components/ui";
import { TRIP_STATUS } from "../lib/defaults";
import { dateRange, money } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";
import type { TripStatus } from "../lib/types";

export default function Trips({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | TripStatus>("");
  const [year, setYear] = useState("");
  const all = useMemo(() => store.trips.map((t) => ({ trip: t, sum: summarize(t, store) })), [store]);
  const years = [...new Set(store.trips.map((t) => t.startDate.slice(0, 4)).filter(Boolean))].sort().reverse();
  const list = all
    .filter(({ trip: t }) => (!status || t.status === status) && (!year || t.startDate.startsWith(year)))
    .filter(({ trip: t }) => !q || `${t.name} ${t.destination} ${t.countries.join(" ")}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.trip.startDate.localeCompare(a.trip.startDate));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reisen</h1>
        <div className="toolbar">
          <input className="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Alle Jahre</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as TripStatus | "")}>
            <option value="">Alle Status</option>
            {Object.entries(TRIP_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={onNew}>
            + Neue Reise
          </button>
        </div>
      </div>
      {store.trips.length === 0 ? (
        <Empty>Noch keine Reise angelegt.</Empty>
      ) : list.length === 0 ? (
        <Empty>Keine Reise für diesen Filter.</Empty>
      ) : (
        <div className="trip-grid">
          {list.map(({ trip: t, sum }) => (
            <button key={t.id} className="trip-card" onClick={() => nav({ page: "trip", id: t.id })}>
              <div className="row between">
                <span className="trip-emoji">{t.emoji}</span>
                <Badge color={TRIP_STATUS[t.status].color}>{TRIP_STATUS[t.status].label}</Badge>
              </div>
              <strong className="trip-name">{t.name}</strong>
              <div className="muted small">
                {dateRange(t.startDate, t.endDate)} · {sum.stats.days} Tage
                {t.destination && <> · {t.destination}</>}
              </div>
              <div className="trip-card-stats">
                <span>
                  <b>{money(sum.stats.total, t.currency)}</b> ausgegeben
                </span>
                {sum.stats.total > 0 && (
                  <span>
                    <b>{money(sum.stats.perDay, t.currency)}</b> / Tag
                  </span>
                )}
                {sum.planned > 0 && (
                  <span>
                    <b>{money(sum.planned, t.currency)}</b> geplant
                  </span>
                )}
                {sum.travelers.length > 1 && <span>{sum.travelers.length} Personen</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
