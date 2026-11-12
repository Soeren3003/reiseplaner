import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { BarList, Legend, StackedColumns } from "../components/charts";
import { Empty } from "../components/ui";
import { round2, stayNights, transportDuration, tripStats, type TripStats } from "../lib/calc";
import { saveAs } from "../lib/api";
import { toCsv } from "../lib/csv";
import { countryName } from "../lib/countries";
import { CATEGORIES, TRANSPORT_MODES } from "../lib/defaults";
import { date, duration, money, moneyShort, num } from "../lib/format";
import { useStore } from "../lib/store";
import type { ExpenseCategory, TransportMode, Trip } from "../lib/types";
import { categorySeries } from "./trip/Analysis";

export default function Statistics({ nav }: { nav: Nav }) {
  const store = useStore();
  const cur = store.settings.defaultCurrency;
  const [year, setYear] = useState("");
  const [mine, setMine] = useState(false);
  const meKnown = store.people.some((p) => p.id === store.me);
  const m = (n: number) => money(n, cur);

  const base = store.trips.filter((t) => t.status !== "cancelled" && t.status !== "idea");
  const years = [...new Set(base.map((t) => t.startDate.slice(0, 4)).filter(Boolean))].sort().reverse();
  const inYear = base.filter((t) => !year || t.startDate.startsWith(year));
  const trips = inYear.filter((t) => t.currency === cur).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const otherCurrency = inYear.length - trips.length;

  const rows = useMemo(
    () =>
      trips
        .map((t) => {
          // mein Anteil: nur Reisen, bei denen ich dabei war (allein unterwegs zählt immer)
          const forMe = mine && t.travelers.length > 0;
          if (forMe && !t.travelers.includes(store.me)) return null;
          const ex = store.expenses.filter((e) => e.tripId === t.id);
          return { trip: t, st: tripStats(t, ex, forMe ? store.me : undefined) };
        })
        .filter((x): x is { trip: Trip; st: TripStats } => !!x),
    [trips, store.expenses, mine, store.me],
  );

  if (!base.length) return <Empty>Noch keine Reisen zum Auswerten. Ideen und abgesagte Reisen zählen hier nicht mit.</Empty>;

  const total = round2(rows.reduce((a, r) => a + r.st.total, 0));
  const days = rows.reduce((a, r) => a + r.st.days, 0);
  const dailyBase = rows.reduce((a, r) => a + r.st.dailyBase, 0);
  // pro Person: jede Reise durch ihre Personenzahl teilen, dann über alle Reisetage mitteln
  const personBase = rows.reduce((a, r) => a + r.st.dailyBase / r.st.persons, 0);
  const ids = new Set(rows.map((r) => r.trip.id));
  const countries = new Set(rows.flatMap((r) => r.trip.countries));

  // Kategorien über alle Reisen
  const catMap = new Map<ExpenseCategory, number>();
  const countryMap = new Map<string, number>();
  const methodMap = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.st.byCategory) catMap.set(c.key, (catMap.get(c.key) ?? 0) + c.amount);
    for (const c of r.st.byMethod) methodMap.set(c.key || "ohne Angabe", (methodMap.get(c.key || "ohne Angabe") ?? 0) + c.amount);
    for (const c of r.st.byCountry) {
      const k = c.key ? countryName(c.key) : "ohne Angabe";
      countryMap.set(k, (countryMap.get(k) ?? 0) + c.amount);
    }
  }
  const byCategory = [...catMap.entries()].map(([key, amount]) => ({ key, amount: round2(amount), count: 0 })).sort((a, b) => b.amount - a.amount);
  const { series, values } = categorySeries(byCategory);
  const tripCats = (st: TripStats) => Object.fromEntries(st.byCategory.map((c) => [c.key, c.amount])) as Partial<Record<ExpenseCategory, number>>;

  // Transport und Nächte (unabhängig von der Währung, nur Reisen der Auswahl)
  const transports = store.transports.filter((t) => ids.has(t.tripId) && t.status !== "cancelled");
  const byMode = (Object.keys(TRANSPORT_MODES) as TransportMode[])
    .map((k) => {
      const l = transports.filter((t) => t.mode === k);
      return { mode: k, count: l.length, km: l.reduce((a, t) => a + (t.distanceKm || 0), 0), min: l.reduce((a, t) => a + (transportDuration(t) ?? 0), 0) };
    })
    .filter((x) => x.count);
  const nights = store.stays.filter((s) => ids.has(s.tripId) && s.status !== "cancelled").reduce((a, s) => a + stayNights(s), 0);

  const byYear = years
    .map((y) => ({ y, v: rows.filter((r) => r.trip.startDate.startsWith(y)).reduce((a, r) => a + r.st.total, 0) }))
    .filter((x) => x.v > 0);

  const exportCsv = () =>
    saveAs(
      `Reisen${year ? ` ${year}` : ""}.csv`,
      new TextEncoder().encode(
        toCsv([
          ["Reise", "von", "bis", "Tage", "Personen", "Länder", `Ausgaben (${cur})`, "pro Tag", "pro Person und Tag", "Budget", ...Object.values(CATEGORIES).map((c) => c.label)],
          ...rows.map((r) => [
            r.trip.name,
            date(r.trip.startDate),
            date(r.trip.endDate),
            r.st.days,
            r.st.persons,
            r.trip.countries.map(countryName).join(", "),
            r.st.total,
            r.st.perDay,
            r.st.perPersonDay,
            r.st.budget || "",
            ...(Object.keys(CATEGORIES) as ExpenseCategory[]).map((k) => r.st.byCategory.find((c) => c.key === k)?.amount ?? 0),
          ]),
        ]),
      ),
      "text/csv",
    );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Statistik</h1>
        <div className="toolbar">
          {meKnown && (
            <div className="segmented">
              <button className={!mine ? "active" : ""} onClick={() => setMine(false)}>
                Ganze Gruppe
              </button>
              <button className={mine ? "active" : ""} onClick={() => setMine(true)}>
                Mein Anteil
              </button>
            </div>
          )}
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Alle Jahre</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <button className="ghost" onClick={exportCsv} disabled={!rows.length}>
            CSV
          </button>
        </div>
      </div>
      {otherCurrency > 0 && (
        <div className="alert">
          {otherCurrency} Reise(n) mit anderer Heimatwährung als {cur} sind hier nicht enthalten (Heimatwährung in den Einstellungen).
        </div>
      )}

      <section className="stats four">
        <div className="stat">
          <div className="stat-label">Reisen</div>
          <div className="stat-value">{rows.length}</div>
          <div className="stat-sub">
            {days} Reisetage · {nights} Nächte
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Ausgaben gesamt</div>
          <div className="stat-value">{m(total)}</div>
          <div className="stat-sub">{rows.length ? `Ø ${m(total / rows.length)} pro Reise` : ""}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ø pro Reisetag</div>
          <div className="stat-value">{m(days ? dailyBase / days : 0)}</div>
          <div className="stat-sub">
            {m(days ? personBase / days : 0)} pro Person · ohne Anreise und Vorab-Kosten
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Länder</div>
          <div className="stat-value">{countries.size}</div>
          <div className="stat-sub ellipsis">{[...countries].map(countryName).sort((a, b) => a.localeCompare(b, "de")).join(", ") || "–"}</div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card">
          <h2>Ausgaben pro Reise</h2>
          <StackedColumns
            data={rows.map((r) => ({ label: r.trip.emoji || r.trip.name.slice(0, 3), long: `${r.trip.name} · ${date(r.trip.startDate)}`, values: values(tripCats(r.st)) }))}
            series={series}
            format={m}
            formatAxis={(n) => moneyShort(n, cur)}
          />
          <Legend series={series} />
        </section>
      )}

      <div className="three-col">
        <section className="card">
          <h2>Nach Kategorie</h2>
          <BarList items={byCategory.map((c) => ({ label: `${CATEGORIES[c.key].icon} ${CATEGORIES[c.key].label}`, value: c.amount }))} format={m} />
        </section>
        {countryMap.size > 0 && (
          <section className="card">
            <h2>Nach Land</h2>
            <BarList items={[...countryMap.entries()].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value)} format={m} />
          </section>
        )}
        {methodMap.size > 0 && (
          <section className="card">
            <h2>Nach Zahlungsmittel</h2>
            <BarList items={[...methodMap.entries()].map(([label, value]) => ({ label, value: round2(value) })).sort((a, b) => b.value - a.value)} format={m} />
          </section>
        )}
        {byYear.length > 1 && (
          <section className="card">
            <h2>Nach Jahr</h2>
            <BarList items={byYear.map((x) => ({ label: x.y, value: round2(x.v), onClick: () => setYear(x.y) }))} format={m} showShare={false} />
          </section>
        )}
        {byMode.length > 0 && (
          <section className="card">
            <h2>Unterwegs</h2>
            <table className="list compact">
              <thead>
                <tr>
                  <th />
                  <th className="r">Anzahl</th>
                  <th className="r">km</th>
                  <th className="r">Stunden</th>
                </tr>
              </thead>
              <tbody>
                {byMode.map((x) => (
                  <tr key={x.mode}>
                    <td>
                      {TRANSPORT_MODES[x.mode].icon} {TRANSPORT_MODES[x.mode].label}
                    </td>
                    <td className="r">{x.count}</td>
                    <td className="r">{x.km ? num(x.km, 0) : "–"}</td>
                    <td className="r">{x.min ? duration(x.min) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <section className="card">
        <h2>Alle Reisen</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Reise</th>
              <th>Zeitraum</th>
              <th className="r">Tage</th>
              <th className="r">Ausgaben</th>
              <th className="r">pro Tag</th>
              <th className="r">pro Person/Tag</th>
              <th className="r">Budget</th>
              <th className="r">Abweichung</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice()
              .reverse()
              .map(({ trip: t, st }) => (
                <tr key={t.id} onClick={() => nav({ page: "trip", id: t.id, tab: "analysis" })}>
                  <td>
                    {t.emoji} {t.name}
                  </td>
                  <td className="nowrap">
                    {date(t.startDate)} – {date(t.endDate)}
                  </td>
                  <td className="r">{st.days}</td>
                  <td className="r">{m(st.total)}</td>
                  <td className="r">{m(st.perDay)}</td>
                  <td className="r">{m(st.perPersonDay)}</td>
                  <td className="r">{st.budget && !mine ? m(st.budget) : "–"}</td>
                  <td className={`r ${st.budget && st.total > st.budget ? "neg" : "pos"}`}>{st.budget && !mine ? m(st.budget - st.total) : ""}</td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={2}>Gesamt</td>
              <td className="r">{days}</td>
              <td className="r">{m(total)}</td>
              <td className="r">{m(days ? dailyBase / days : 0)}</td>
              <td className="r">{m(days ? personBase / days : 0)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
