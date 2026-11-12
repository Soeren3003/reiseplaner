import type { TripTab } from "../../App";
import { CurrencySelect } from "../../components/booking";
import { CountryPicker } from "../../components/CountryPicker";
import { PersonPicker } from "../../components/common";
import { Empty, Field, NumberInput } from "../../components/ui";
import { arrivalDate, stayNights, transportDuration, tripDays, tripNights, tripPhase } from "../../lib/calc";
import { CATEGORIES, STAY_KINDS, daysBetween, today } from "../../lib/defaults";
import { exportIcs, exportPdf, transportTitle } from "../../lib/export";
import { date, dayLabel, duration, money } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { BudgetType, Trip } from "../../lib/types";

export default function Overview({ trip, sum, go }: { trip: Trip; sum: TripSummary; go: (t: TripTab) => void }) {
  const store = useStore();
  const set = (patch: Partial<Trip>) => store.save("trips", { ...trip, ...patch });
  const m = (n: number) => money(n, trip.currency);
  const t0 = today();
  const phase = tripPhase(trip, t0);
  const st = sum.stats;
  const spent = st.total;
  const budget = st.budget;
  const forecast = spent + sum.planned;

  return (
    <div className="split wide-side">
      <div className="main-col">
        <section className="stats four">
          <div className="stat">
            <div className="stat-label">{phase === "before" ? "Noch" : phase === "during" ? "Heute" : "Gereist"}</div>
            <div className="stat-value">
              {phase === "before" ? `${daysBetween(t0, trip.startDate)} Tage` : phase === "during" ? `Tag ${daysBetween(trip.startDate, t0) + 1}` : `${tripDays(trip)} Tage`}
            </div>
            <div className="stat-sub">
              {tripDays(trip)} Tage, {tripNights(trip)} Nächte
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Ausgaben</div>
            <div className="stat-value">{m(spent)}</div>
            <div className="stat-sub">{m(st.perDay)} pro Tag</div>
          </div>
          <div className="stat">
            <div className="stat-label">Geplant, noch nicht gebucht</div>
            <div className="stat-value">{m(sum.planned)}</div>
            <div className="stat-sub">{sum.openBookings} offene Buchung(en)</div>
          </div>
          <div className="stat">
            <div className="stat-label">{budget ? "Budget übrig" : "Voraussichtlich gesamt"}</div>
            <div className={`stat-value ${budget && forecast > budget ? "neg" : ""}`}>{budget ? m(budget - forecast) : m(forecast)}</div>
            <div className="stat-sub">{budget ? `von ${m(budget)} (inkl. geplant)` : "Ausgaben + geplant"}</div>
          </div>
        </section>

        <Hints trip={trip} sum={sum} go={go} />

        <section className="card">
          <div className="card-head">
            <h2>Tagesplan</h2>
            <div className="row">
              <button className="ghost small" onClick={() => exportIcs(trip, sum)} title="Reise, Transport, Unterkünfte und Aktivitäten als Kalenderdatei (.ics)">
                Kalender exportieren
              </button>
              <button className="ghost small" onClick={() => exportPdf(trip, sum)} title="Tagesplan, Buchungen, Ausgaben und Abrechnung zum Ausdrucken">
                PDF
              </button>
            </div>
          </div>
          {sum.plan.length === 0 ? (
            <Empty>Zeitraum eintragen, dann erscheint hier der Plan Tag für Tag.</Empty>
          ) : (
            <ol className="day-plan">
              {sum.plan.map((d) => {
                const empty = !d.transports.length && !d.activities.length && !d.checkIns.length && !d.checkOuts.length;
                return (
                  <li key={d.date} className={`${d.date === t0 ? "today" : ""} ${d.dayNo ? "" : "outside"}`}>
                    <div className="day-head">
                      <span className="day-no">{d.dayNo ? `Tag ${d.dayNo}` : d.date < trip.startDate ? "vorher" : "danach"}</span>
                      <span className="day-date">{dayLabel(d.date)}</span>
                      {d.spent > 0 && (
                        <button className="link small day-spent" onClick={() => go("expenses")}>
                          {m(d.spent)}
                        </button>
                      )}
                    </div>
                    <ul className="day-items">
                      {d.checkOuts.map((s) => (
                        <li key={`o${s.id}`} className="muted" onClick={() => go("stays")}>
                          <span className="time">{s.checkOutTime || ""}</span>🧳 Check-out {s.name}
                        </li>
                      ))}
                      {d.transports.map((t) => {
                        const dur = transportDuration(t);
                        return (
                          <li key={t.id} onClick={() => go("transport")}>
                            <span className="time">{t.departTime}</span>
                            <strong>{transportTitle(t)}</strong>
                            {t.arriveTime && (
                              <span className="muted">
                                {" "}
                                · an {t.arriveTime}
                                {arrivalDate(t) !== t.departDate ? ` (${date(arrivalDate(t))})` : ""}
                              </span>
                            )}
                            {dur && <span className="muted"> · {duration(dur)} h</span>}
                            {t.status !== "booked" && <span className="badge badge-gray">noch nicht gebucht</span>}
                          </li>
                        );
                      })}
                      {d.checkIns.map((s) => (
                        <li key={`i${s.id}`} onClick={() => go("stays")}>
                          <span className="time">{s.checkInTime || ""}</span>
                          {STAY_KINDS[s.kind].icon} Check-in <strong>{s.name || "Unterkunft"}</strong>
                          <span className="muted"> · {stayNights(s)} Nächte</span>
                          {s.status !== "booked" && <span className="badge badge-gray">noch nicht gebucht</span>}
                        </li>
                      ))}
                      {d.activities.map((a) => (
                        <li key={a.id} onClick={() => go("activities")}>
                          <span className="time">{a.time}</span>
                          {CATEGORIES[a.category].icon} {a.title || "Aktivität"}
                          {a.location && <span className="muted"> · {a.location}</span>}
                          {a.status === "idea" && <span className="badge badge-gray">Idee</span>}
                        </li>
                      ))}
                      {empty && <li className="muted free">frei</li>}
                    </ul>
                    {d.dayNo > 0 && d.date !== trip.endDate && (
                      <div className={`day-night ${d.night ? "" : "missing"}`} onClick={() => go("stays")}>
                        🌙 {d.night ? d.night.name || "Unterkunft" : sum.nightsWithoutStay.includes(d.date) ? "Übernachtung fehlt" : "unterwegs"}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <aside className="side-col">
        <TripFacts trip={trip} sum={sum} />
        <section className="card">
          <h2>Notizen</h2>
          <textarea rows={6} value={trip.notes} placeholder="Ideen, Links, Hinweise …" onChange={(e) => set({ notes: e.target.value })} />
        </section>
      </aside>
    </div>
  );
}

function Hints({ trip, sum, go }: { trip: Trip; sum: TripSummary; go: (t: TripTab) => void }) {
  const hints: [string, TripTab][] = [];
  if (sum.nightsWithoutStay.length)
    hints.push([`${sum.nightsWithoutStay.length} Nacht/Nächte ohne Unterkunft: ${sum.nightsWithoutStay.slice(0, 4).map(dayLabel).join(", ")}${sum.nightsWithoutStay.length > 4 ? " …" : ""}`, "stays"]);
  if (sum.missingRates.length) hints.push([`Wechselkurs fehlt für ${sum.missingRates.join(", ")} – diese Beträge zählen noch nicht mit.`, "expenses"]);
  if (sum.openTodos && tripPhase(trip, today()) === "before") hints.push([`${sum.openTodos} offene Aufgabe(n) vor der Reise`, "checklist"]);
  if (sum.shared && sum.settlement.withoutPayer) hints.push([`${sum.settlement.withoutPayer} Ausgabe(n) ohne „bezahlt von“`, "expenses"]);
  if (!hints.length) return null;
  return (
    <section className="card hints">
      {hints.map(([text, tab]) => (
        <button key={text} className="hint-row" onClick={() => go(tab)}>
          ⚠︎ {text}
        </button>
      ))}
    </section>
  );
}

function TripFacts({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const set = (patch: Partial<Trip>) => store.save("trips", { ...trip, ...patch });
  const used = new Set([...sum.expenses.map((e) => e.paidBy), ...sum.expenses.flatMap((e) => e.splitAmong), ...sum.payments.flatMap((p) => [p.from, p.to])]);
  return (
    <section className="card">
      <h2>Eckdaten</h2>
      <div className="form-grid one">
        <div className="row nowrap">
          <Field label="Von">
            <input
              type="date"
              value={trip.startDate}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                // Dauer beibehalten, wenn der Beginn verschoben wird
                const len = daysBetween(trip.startDate, trip.endDate);
                const end = trip.endDate >= trip.startDate ? new Date(`${v}T12:00:00`) : null;
                if (end) end.setDate(end.getDate() + len);
                set({ startDate: v, endDate: end ? end.toLocaleDateString("sv-SE") : v });
              }}
            />
          </Field>
          <Field label="Bis">
            <input type="date" value={trip.endDate} min={trip.startDate} onChange={(e) => e.target.value && set({ endDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Reiseziel">
          <input value={trip.destination} placeholder="z. B. Tokio, Kyoto, Osaka" onChange={(e) => set({ destination: e.target.value })} />
        </Field>
        <Field label="Länder" hint="Für die Weltkarte und die Auswertung nach Land">
          <CountryPicker value={trip.countries} onChange={(countries) => set({ countries })} />
        </Field>
        <Field label="Heimatwährung" hint="Darin wird gerechnet und abgerechnet">
          <CurrencySelect trip={trip} value={trip.currency} onChange={(currency) => set({ currency })} className="" />
        </Field>
        <Field label="Budget">
          <div className="row nowrap">
            <select value={trip.budgetType} onChange={(e) => set({ budgetType: e.target.value as BudgetType })}>
              <option value="none">kein Budget</option>
              <option value="total">für die Reise</option>
              <option value="daily">pro Tag</option>
            </select>
            {trip.budgetType !== "none" && <NumberInput value={trip.budget} min={0} suffix={trip.currency} onChange={(v) => set({ budget: v ?? 0 })} />}
          </div>
        </Field>
        <Field label="Mitreisende" hint={store.people.length ? "Ohne Auswahl: allein unterwegs, keine Aufteilung" : "Unter „Mitreisende“ anlegen"}>
          <div className="member-picker">
            {store.people.length > 0 && (
              <PersonPicker
                people={store.people}
                selected={trip.travelers}
                onChange={(ids) => {
                  // wer schon in Ausgaben vorkommt, bleibt dabei – sonst stimmt die Abrechnung nicht
                  const keep = trip.travelers.filter((id) => used.has(id) && !ids.includes(id));
                  const next = { ...trip, travelers: [...ids, ...keep] };
                  store.save("trips", next);
                  // Kurtaxe pro Person hängt von der Zahl der Mitreisenden ab
                  for (const s of sum.stays.filter((x) => x.touristTax > 0 && !x.travelers.length && !x.touristTaxPersons)) store.saveBooking("stay", s, next);
                }}
              />
            )}
          </div>
        </Field>
      </div>
    </section>
  );
}
