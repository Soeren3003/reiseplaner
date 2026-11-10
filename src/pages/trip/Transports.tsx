import { useState } from "react";
import { BookingFields, BookingLink, BookingModal, BookingPrice, StatusBadge } from "../../components/booking";
import { PersonDot } from "../../components/common";
import { DurationInput, Empty, Field, NumberInput } from "../../components/ui";
import { arrivalDate, bookingHome, transportDuration } from "../../lib/calc";
import { TRANSPORT_MODES, addDays, newTransport } from "../../lib/defaults";
import { date, dayLabel, duration, money, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { Transport, TransportMode, Trip } from "../../lib/types";

const QUICK: TransportMode[] = ["flight", "train", "rentalcar", "bus", "ferry"];

export default function Transports({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const [edit, setEdit] = useState("");
  const me = sum.travelers.some((p) => p.id === store.me) ? store.me : "";
  const m = (n: number) => money(n, trip.currency);
  const editing = sum.transports.find((t) => t.id === edit);

  const add = (mode: TransportMode) => {
    const last = sum.transports[sum.transports.length - 1];
    // nächste Etappe startet, wo die letzte angekommen ist
    const t = { ...newTransport(trip, me, mode, last ? arrivalDate(last) : trip.startDate), from: last?.to ?? "" };
    store.saveBooking("transport", t);
    setEdit(t.id);
  };

  const live = sum.transports.filter((t) => t.status !== "cancelled");
  const byMode = Object.keys(TRANSPORT_MODES)
    .map((k) => {
      const l = live.filter((t) => t.mode === k);
      return { mode: k as TransportMode, count: l.length, km: l.reduce((a, t) => a + (t.distanceKm || 0), 0), min: l.reduce((a, t) => a + (transportDuration(t) ?? 0), 0) };
    })
    .filter((x) => x.count);
  const booked = live.filter((t) => t.status === "booked").reduce((a, t) => a + bookingHome(t, trip), 0);
  const planned = live.filter((t) => t.status !== "booked").reduce((a, t) => a + bookingHome(t, trip), 0);

  return (
    <div className="split">
      <div className="main-col">
        <section className="card">
          <div className="card-head">
            <h2>Transport</h2>
            <div className="row">
              {QUICK.map((k) => (
                <button key={k} className={k === "flight" ? "primary small" : "ghost small"} onClick={() => add(k)}>
                  + {TRANSPORT_MODES[k].icon} {TRANSPORT_MODES[k].label}
                </button>
              ))}
              <button className="ghost small" onClick={() => add("other")}>
                + Anderes
              </button>
            </div>
          </div>
          {sum.transports.length === 0 ? (
            <Empty>Flüge, Zugfahrten, Mietwagen, Fähren und Transfers eintragen – mit Zeiten, Buchungsnummer, Sitzplatz und Preis.</Empty>
          ) : (
            <table className="list booking-table">
              <thead>
                <tr>
                  <th className="w-when">Abfahrt</th>
                  <th>Verbindung</th>
                  <th className="w-when">Ankunft</th>
                  <th className="r">Dauer</th>
                  <th>Buchung</th>
                  <th>Status</th>
                  <th className="r">Preis</th>
                </tr>
              </thead>
              <tbody>
                {sum.transports.map((t) => {
                  const dur = transportDuration(t);
                  const arr = arrivalDate(t);
                  return (
                    <tr key={t.id} onClick={() => setEdit(t.id)} className={t.status === "cancelled" ? "dim" : ""}>
                      <td className="nowrap">
                        {dayLabel(t.departDate)}
                        <div className="muted small">{t.departTime || "–"}</div>
                      </td>
                      <td>
                        <div>
                          {TRANSPORT_MODES[t.mode].icon} <strong>{[t.from, t.to].filter(Boolean).join(" → ") || TRANSPORT_MODES[t.mode].label}</strong>
                        </div>
                        <div className="muted small">
                          {[t.carrier, t.number, t.seat && `Sitz ${t.seat}`, t.details].filter(Boolean).join(" · ") || TRANSPORT_MODES[t.mode].label}
                          {sum.shared && t.travelers.length > 0 && (
                            <span className="dots inline">
                              {t.travelers.map((id) => (
                                <PersonDot key={id} person={sum.person(id)} size={14} />
                              ))}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="nowrap">
                        {arr !== t.departDate ? dayLabel(arr) : ""}
                        <div className="muted small">{t.arriveTime || "–"}</div>
                      </td>
                      <td className="r nowrap">{dur ? `${duration(dur)} h` : "–"}</td>
                      <td>
                        {t.bookingRef && <code>{t.bookingRef}</code>} <BookingLink url={t.link} />
                      </td>
                      <td>
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="r nowrap">
                        <BookingPrice trip={trip} b={t} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <aside className="side-col">
        <section className="card">
          <h2>Zusammenfassung</h2>
          <dl className="kv-list">
            {byMode.map((x) => (
              <FactRow key={x.mode} label={`${TRANSPORT_MODES[x.mode].icon} ${TRANSPORT_MODES[x.mode].label}`} value={`${x.count}×${x.km ? ` · ${num(x.km, 0)} km` : ""}${x.min ? ` · ${duration(x.min)} h` : ""}`} />
            ))}
            <dt className="sep">gebucht</dt>
            <dd className="sep">{m(booked)}</dd>
            <dt>geplant</dt>
            <dd>{m(planned)}</dd>
          </dl>
          <p className="muted small">Gebuchte Fahrten erscheinen automatisch unter „Ausgaben“. Flüge zählen standardmäßig nicht zum Tagesdurchschnitt (Einstellungen).</p>
        </section>
      </aside>
      {editing && <TransportEditor trip={trip} sum={sum} t={editing} onClose={() => setEdit("")} />}
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function TransportEditor({ trip, sum, t, onClose }: { trip: Trip; sum: TripSummary; t: Transport; onClose: () => void }) {
  const store = useStore();
  const set = (patch: Partial<Transport>) => store.saveBooking("transport", { ...t, ...patch });
  const auto = transportDuration({ ...t, durationMin: null });
  const isFlight = t.mode === "flight";
  const isCar = t.mode === "rentalcar";
  return (
    <BookingModal
      title={`${TRANSPORT_MODES[t.mode].icon} ${TRANSPORT_MODES[t.mode].label}`}
      onClose={onClose}
      onDelete={async () => {
        await store.removeBooking("transport", t);
        onClose();
      }}
    >
      <Field label="Verkehrsmittel">
        <select value={t.mode} onChange={(e) => set({ mode: e.target.value as TransportMode })}>
          {Object.entries(TRANSPORT_MODES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={isFlight ? "Fluggesellschaft" : isCar ? "Vermieter" : "Anbieter"}>
        <input value={t.carrier} placeholder={isFlight ? "z. B. Lufthansa" : isCar ? "z. B. Sixt" : "z. B. Deutsche Bahn"} onChange={(e) => set({ carrier: e.target.value })} />
      </Field>
      <Field label={isFlight ? "Von (Flughafen)" : isCar ? "Abholung" : "Von"}>
        <input value={t.from} autoFocus={!t.from} placeholder={isFlight ? "z. B. Frankfurt (FRA)" : ""} onChange={(e) => set({ from: e.target.value })} />
      </Field>
      <Field label={isFlight ? "Nach (Flughafen)" : isCar ? "Rückgabe" : "Nach"}>
        <input value={t.to} placeholder={isFlight ? "z. B. Tokio Haneda (HND)" : ""} onChange={(e) => set({ to: e.target.value })} />
      </Field>
      <Field label={isCar ? "Abholung am" : "Abfahrt / Abflug"} hint="Ortszeit">
        <div className="row nowrap">
          <input type="date" value={t.departDate} onChange={(e) => e.target.value && set({ departDate: e.target.value })} />
          <input type="time" value={t.departTime} onChange={(e) => set({ departTime: e.target.value })} />
        </div>
      </Field>
      <Field label={isCar ? "Rückgabe am" : "Ankunft"} hint={t.arriveDate ? "Ortszeit" : "Ortszeit; ohne Datum: gleicher Tag bzw. über Nacht"}>
        <div className="row nowrap">
          <input type="date" value={t.arriveDate} min={t.departDate} onChange={(e) => set({ arriveDate: e.target.value })} />
          <input type="time" value={t.arriveTime} onChange={(e) => set({ arriveTime: e.target.value })} />
        </div>
      </Field>
      <Field label={isFlight ? "Flugnummer" : "Zug-/Busnummer"}>
        <input value={t.number} placeholder={isFlight ? "z. B. LH 714" : ""} onChange={(e) => set({ number: e.target.value })} />
      </Field>
      <Field label={isCar ? "Fahrzeug" : "Sitzplatz / Klasse"}>
        <input value={t.seat} placeholder={isCar ? "z. B. Kompaktklasse" : "z. B. 23A, Economy"} onChange={(e) => set({ seat: e.target.value })} />
      </Field>
      <Field label={isFlight ? "Terminal / Gepäck" : "Details"}>
        <input value={t.details} placeholder={isFlight ? "z. B. Terminal 1, 23 kg" : "z. B. Gleis 7, Wagen 12"} onChange={(e) => set({ details: e.target.value })} />
      </Field>
      <Field label="Dauer" hint={auto ? `aus Ortszeiten: ${duration(auto)} h – bei Zeitzonen die echte Dauer eintragen` : "z. B. 13:30"}>
        <DurationInput minutes={t.durationMin ?? 0} onChange={(v) => set({ durationMin: v || null })} />
      </Field>
      <Field label="Strecke" hint="optional, für die Statistik">
        <NumberInput value={t.distanceKm} digits={0} min={0} suffix="km" onChange={(v) => set({ distanceKm: v ?? 0 })} />
      </Field>
      {t.departDate && trip.startDate && (t.departDate < addDays(trip.startDate, -1) || t.departDate > addDays(trip.endDate, 1)) && (
        <div className="alert wide">Liegt außerhalb des Reisezeitraums ({date(trip.startDate)} – {date(trip.endDate)}).</div>
      )}
      <BookingFields trip={trip} sum={sum} b={t} set={set} />
    </BookingModal>
  );
}
