import { useState } from "react";
import { BookingFields, BookingLink, BookingModal, BookingPrice, StatusBadge } from "../../components/booking";
import { Empty, Field } from "../../components/ui";
import { bookingHome } from "../../lib/calc";
import { CATEGORIES, newActivity, today } from "../../lib/defaults";
import { dayLabel, money } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { Activity, ExpenseCategory, Trip } from "../../lib/types";

export default function Activities({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const [edit, setEdit] = useState("");
  const me = sum.travelers.some((p) => p.id === store.me) ? store.me : "";
  const m = (n: number) => money(n, trip.currency);
  const editing = sum.activities.find((a) => a.id === edit);
  const t0 = today();

  const add = () => {
    const d = t0 >= trip.startDate && t0 <= trip.endDate ? t0 : trip.startDate;
    const a = newActivity(trip, me, d);
    store.saveBooking("activity", a);
    setEdit(a.id);
  };

  const live = sum.activities.filter((a) => a.status !== "cancelled");
  const ideas = live.filter((a) => a.status === "idea").length;

  // nach Tagen gruppieren
  const days = [...new Set(sum.activities.map((a) => a.date))];

  return (
    <div className="split">
      <div className="main-col">
        <section className="card">
          <div className="card-head">
            <h2>Aktivitäten & Programm</h2>
            <button className="primary small" onClick={add}>
              + Aktivität
            </button>
          </div>
          {sum.activities.length === 0 ? (
            <Empty>Ausflüge, Führungen, Museen, Restaurants mit Reservierung, Konzerte – oder einfach Ideen, was man vor Ort machen könnte.</Empty>
          ) : (
            days.map((d) => (
              <div key={d} className="day-group">
                <h3>{d ? dayLabel(d) : "Ohne Datum"}</h3>
                <table className="list booking-table">
                  <tbody>
                    {sum.activities
                      .filter((a) => a.date === d)
                      .map((a) => (
                        <tr key={a.id} onClick={() => setEdit(a.id)} className={a.status === "cancelled" ? "dim" : ""}>
                          <td className="w-time nowrap">{[a.time, a.endTime].filter(Boolean).join("–") || "–"}</td>
                          <td>
                            {CATEGORIES[a.category].icon} <strong>{a.title || "Aktivität"}</strong>
                            <div className="muted small">
                              {[a.location, a.provider, a.bookingRef && `Nr. ${a.bookingRef}`].filter(Boolean).join(" · ")} <BookingLink url={a.link} />
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td className="r nowrap">
                            <BookingPrice trip={trip} b={a} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>
      </div>
      <aside className="side-col">
        <section className="card">
          <h2>Zusammenfassung</h2>
          <dl className="kv-list">
            <dt>Aktivitäten</dt>
            <dd>{live.length}</dd>
            <dt>davon Ideen</dt>
            <dd>{ideas}</dd>
            <dt>gebucht</dt>
            <dd>{m(live.filter((a) => a.status === "booked").reduce((x, a) => x + bookingHome(a, trip), 0))}</dd>
            <dt>geplant</dt>
            <dd>{m(live.filter((a) => a.status !== "booked").reduce((x, a) => x + bookingHome(a, trip), 0))}</dd>
          </dl>
          <p className="muted small">Für spontane Ausgaben vor Ort (Eintritt, Essen) einfach eine Ausgabe erfassen – hier geht es ums Planen.</p>
        </section>
      </aside>
      {editing && <ActivityEditor trip={trip} sum={sum} a={editing} onClose={() => setEdit("")} />}
    </div>
  );
}

function ActivityEditor({ trip, sum, a, onClose }: { trip: Trip; sum: TripSummary; a: Activity; onClose: () => void }) {
  const store = useStore();
  const set = (patch: Partial<Activity>) => store.saveBooking("activity", { ...a, ...patch });
  return (
    <BookingModal
      title={`${CATEGORIES[a.category].icon} ${a.title || "Aktivität"}`}
      onClose={onClose}
      onDelete={async () => {
        await store.removeBooking("activity", a);
        onClose();
      }}
    >
      <Field label="Was" wide>
        <input value={a.title} autoFocus={!a.title} placeholder="z. B. Führung Fushimi Inari" onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Datum">
        <input type="date" value={a.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <Field label="Uhrzeit">
        <div className="row nowrap">
          <input type="time" value={a.time} onChange={(e) => set({ time: e.target.value })} />
          <input type="time" value={a.endTime} title="bis" onChange={(e) => set({ endTime: e.target.value })} />
        </div>
      </Field>
      <Field label="Ort / Treffpunkt">
        <input value={a.location} onChange={(e) => set({ location: e.target.value })} />
      </Field>
      <Field label="Kategorie der Ausgabe">
        <select value={a.category} onChange={(e) => set({ category: e.target.value as ExpenseCategory })}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </Field>
      <BookingFields trip={trip} sum={sum} b={a} set={set} />
    </BookingModal>
  );
}
