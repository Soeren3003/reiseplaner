import { useState } from "react";
import { BookingFields, BookingLink, BookingModal, BookingPrice, StatusBadge } from "../../components/booking";
import { Empty, Field, NumberInput } from "../../components/ui";
import { bookingHome, homeAmount, stayNights, stayTax, taxPerPerson } from "../../lib/calc";
import { BOARDS, MEALS, STAY_KINDS, TAX_UNITS, addDays, boardLabel, newStay } from "../../lib/defaults";
import { currencySymbol, dateRange, dayLabel, money, num } from "../../lib/format";
import { useStore } from "../../lib/store";
import type { TripSummary } from "../../lib/summary";
import type { Board, Meal, Stay, StayKind, TaxUnit, Trip } from "../../lib/types";

export default function Stays({ trip, sum }: { trip: Trip; sum: TripSummary }) {
  const store = useStore();
  const [edit, setEdit] = useState("");
  const me = sum.travelers.some((p) => p.id === store.me) ? store.me : "";
  const m = (n: number) => money(n, trip.currency);
  const editing = sum.stays.find((s) => s.id === edit);

  const add = (from?: string) => {
    const live = sum.stays.filter((s) => s.status !== "cancelled");
    const start = from ?? (live.length ? live[live.length - 1].checkOut : trip.startDate);
    // bis zur nächsten belegten Nacht bzw. bis Reiseende
    let end = start;
    while (end < trip.endDate && sum.nightsWithoutStay.includes(end)) end = addDays(end, 1);
    const s = newStay(trip, me, start, end > start ? end : addDays(start, 1));
    store.saveBooking("stay", s);
    setEdit(s.id);
  };

  const live = sum.stays.filter((s) => s.status !== "cancelled");
  const nights = live.reduce((a, s) => a + stayNights(s), 0);
  const taxOf = (s: Stay) => homeAmount({ amount: stayTax(s, trip).extra, currency: s.currency }, trip);
  const booked = live.filter((s) => s.status === "booked").reduce((a, s) => a + bookingHome(s, trip) + taxOf(s), 0);
  const all = live.reduce((a, s) => a + bookingHome(s, trip) + taxOf(s), 0);
  const tax = live.reduce((a, s) => a + taxOf(s), 0);

  return (
    <div className="split">
      <div className="main-col">
        {sum.nightsWithoutStay.length > 0 && (
          <div className="alert">
            Noch ohne Unterkunft: {sum.nightsWithoutStay.map(dayLabel).join(", ")}{" "}
            <button className="link small" onClick={() => add(sum.nightsWithoutStay[0])}>
              + für die erste Lücke anlegen
            </button>
          </div>
        )}
        <section className="card">
          <div className="card-head">
            <h2>Unterkünfte</h2>
            <button className="primary small" onClick={() => add()}>
              + Unterkunft
            </button>
          </div>
          {sum.stays.length === 0 ? (
            <Empty>Hotels, Ferienwohnungen, Campingplätze – mit Zeitraum, Adresse, Buchungsnummer und Preis. Auch Ideen und Alternativen lassen sich vormerken.</Empty>
          ) : (
            <ul className="stay-list">
              {sum.stays.map((s) => {
                const n = stayNights(s);
                return (
                  <li key={s.id} className={`card-row ${s.status === "cancelled" ? "dim" : ""}`} onClick={() => setEdit(s.id)}>
                    <div className="stay-icon">{STAY_KINDS[s.kind].icon}</div>
                    <div className="grow">
                      <div className="row between">
                        <strong>{s.name || "Unterkunft"}</strong>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="muted small">
                        {dateRange(s.checkIn, s.checkOut)} · {n} {n === 1 ? "Nacht" : "Nächte"}
                        {s.address && <> · {s.address}</>}
                      </div>
                      <div className="muted small">
                        {[s.provider, s.bookingRef && `Nr. ${s.bookingRef}`, boardLabel(s),
                          s.touristTax > 0 && `Kurtaxe ${money(stayTax(s, trip).total, s.currency)}${s.touristTaxIncluded ? " (inkl.)" : ""}`, s.checkInTime && `Check-in ab ${s.checkInTime}`, s.checkOutTime && `Check-out bis ${s.checkOutTime}`].filter(Boolean).join(" · ")}{" "}
                        <BookingLink url={s.link} />
                      </div>
                    </div>
                    <div className="r nowrap">
                      <BookingPrice trip={trip} b={s} />
                      {s.price > 0 && n > 1 && <div className="muted small">{m(bookingHome(s, trip) / n)} / Nacht</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <aside className="side-col">
        <section className="card">
          <h2>Zusammenfassung</h2>
          <dl className="kv-list">
            <dt>Nächte mit Unterkunft</dt>
            <dd>
              {nights} von {Math.max(0, sum.stats.days - 1)}
            </dd>
            <dt>gebucht</dt>
            <dd>{m(booked)}</dd>
            <dt>inkl. geplant</dt>
            <dd>{m(all)}</dd>
            {tax > 0 && (
              <>
                <dt>davon Kurtaxe</dt>
                <dd>{m(tax)}</dd>
              </>
            )}
            {nights > 0 && (
              <>
                <dt className="sep">Ø pro Nacht</dt>
                <dd className="sep">{m(all / nights)}</dd>
              </>
            )}
          </dl>
          <p className="muted small">Gebuchte Unterkünfte erscheinen unter „Ausgaben“, verteilt auf die einzelnen Nächte. Eine Kurtaxe, die vor Ort dazukommt, wird als eigene Ausgabe übernommen.</p>
        </section>
      </aside>
      {editing && <StayEditor trip={trip} sum={sum} s={editing} onClose={() => setEdit("")} />}
    </div>
  );
}

function StayEditor({ trip, sum, s, onClose }: { trip: Trip; sum: TripSummary; s: Stay; onClose: () => void }) {
  const store = useStore();
  const set = (patch: Partial<Stay>) => store.saveBooking("stay", { ...s, ...patch });
  return (
    <BookingModal
      title={`${STAY_KINDS[s.kind].icon} ${s.name || "Unterkunft"}`}
      onClose={onClose}
      onDelete={async () => {
        await store.removeBooking("stay", s);
        onClose();
      }}
    >
      <Field label="Name">
        <input value={s.name} autoFocus={!s.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <Field label="Art">
        <select value={s.kind} onChange={(e) => set({ kind: e.target.value as StayKind })}>
          {Object.entries(STAY_KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.icon} {v.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Check-in">
        <div className="row nowrap">
          <input
            type="date"
            value={s.checkIn}
            onChange={(e) => {
              const v = e.target.value;
              if (v) set({ checkIn: v, checkOut: s.checkOut > v ? s.checkOut : addDays(v, 1) });
            }}
          />
          <input type="time" value={s.checkInTime} title="ab" onChange={(e) => set({ checkInTime: e.target.value })} />
        </div>
      </Field>
      <Field label="Check-out" hint={`${stayNights(s)} Nächte`}>
        <div className="row nowrap">
          <input type="date" value={s.checkOut} min={addDays(s.checkIn, 1)} onChange={(e) => e.target.value && set({ checkOut: e.target.value })} />
          <input type="time" value={s.checkOutTime} title="bis" onChange={(e) => set({ checkOutTime: e.target.value })} />
        </div>
      </Field>
      <Field label="Adresse" wide>
        <input value={s.address} onChange={(e) => set({ address: e.target.value })} />
      </Field>
      <Field label="Telefon">
        <input value={s.phone} onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <Field label="Verpflegung">
        <select value={s.board} onChange={(e) => set({ board: e.target.value as Board })}>
          {Object.entries(BOARDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
      {s.board === "custom" && (
        <Field label="Mahlzeiten inklusive">
          <div className="row">
            {(Object.keys(MEALS) as Meal[]).map((k) => (
              <label key={k} className="check">
                <input
                  type="checkbox"
                  checked={s.meals.includes(k)}
                  onChange={(e) => set({ meals: e.target.checked ? [...s.meals, k] : s.meals.filter((x) => x !== k) })}
                />
                {MEALS[k]}
              </label>
            ))}
          </div>
        </Field>
      )}
      <TouristTaxFields trip={trip} s={s} set={set} />
      <BookingFields trip={trip} sum={sum} b={s} set={set} />
    </BookingModal>
  );
}

function TouristTaxFields({ trip, s, set }: { trip: Trip; s: Stay; set: (patch: Partial<Stay>) => void }) {
  const t = stayTax(s, trip);
  const auto = stayTax({ ...s, touristTaxPersons: null }, trip).persons;
  const u = s.touristTaxUnit;
  const per = u === "person" || u === "night" ? `${t.nights} Nächte` : `${t.days} Tage`;
  const calc =
    u === "total"
      ? `${money(t.total, s.currency)} gesamt, verteilt auf ${t.spreadDays} Tage (≈ ${money(t.total / t.spreadDays, s.currency)} pro Tag)`
      : `${taxPerPerson(u) ? `${t.persons} Pers. × ` : ""}${per} × ${money(s.touristTax, s.currency)} = ${money(t.total, s.currency)}`;
  const hint = s.touristTax
    ? `${calc}${s.touristTaxIncluded ? " – im Preis enthalten" : " – wird als eigene Ausgabe übernommen"}`
    : "Tourismusabgabe, City Tax o. Ä.; 0 = keine. Tage = Nächte + 1";
  return (
    <>
      <Field label="Kurtaxe" hint={hint}>
        <div className="row nowrap">
          <NumberInput value={s.touristTax} min={0} suffix={currencySymbol(s.currency)} onChange={(v) => set({ touristTax: v ?? 0 })} />
          <select value={s.touristTaxUnit} onChange={(e) => set({ touristTaxUnit: e.target.value as TaxUnit })}>
            {Object.entries(TAX_UNITS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </Field>
      {s.touristTax > 0 && (
        <>
          {taxPerPerson(s.touristTaxUnit) && (
            <Field label="Personen für die Kurtaxe" hint={`leer = automatisch (${num(auto, 0)}, aus „Aufgeteilt auf“ bzw. den Mitreisenden)`}>
              <NumberInput value={s.touristTaxPersons} digits={0} min={1} allowEmpty placeholder={String(auto)} onChange={(v) => set({ touristTaxPersons: v || null })} />
            </Field>
          )}
          <label className="check">
            <input type="checkbox" checked={s.touristTaxIncluded} onChange={(e) => set({ touristTaxIncluded: e.target.checked })} />
            Kurtaxe ist im Preis enthalten
          </label>
        </>
      )}
    </>
  );
}
