import { useState, type ReactNode } from "react";
import { bookingHome, rateOf } from "../lib/calc";
import { BOOKING_STATUS, CURRENCIES } from "../lib/defaults";
import { money } from "../lib/format";
import { useStore } from "../lib/store";
import type { TripSummary } from "../lib/summary";
import type { Booking, BookingStatus, Trip } from "../lib/types";
import { PersonPicker, PersonSelect } from "./common";
import { Badge, Field, Modal, NumberInput } from "./ui";

/** Währungen zur Auswahl: die der Reise zuerst, dann die gängigen */
export function currencyOptions(trip: Trip, extra: string[] = []) {
  const first = [trip.currency, ...Object.keys(trip.rates), ...extra].filter(Boolean);
  return [...new Set([...first, ...CURRENCIES])];
}

/** Währungscode: Auswahlliste mit den Währungen der Reise, jeder ISO-Code lässt sich eintippen */
export function CurrencySelect({ trip, value, onChange, className = "cur" }: { trip: Trip; value: string; onChange: (c: string) => void; className?: string }) {
  const [text, setText] = useState(value);
  const [focus, setFocus] = useState(false);
  const shown = focus ? text : value;
  const id = `cur-${trip.id}`;
  return (
    <>
      <input
        className={`${className} ${/^[A-Z]{3}$/.test(shown) ? "" : "invalid"}`}
        value={shown}
        list={id}
        maxLength={3}
        title="Währung (ISO-Code, z. B. EUR, USD, JPY)"
        onFocus={(e) => {
          setText(value);
          setFocus(true);
          e.target.select();
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          const c = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
          setText(c);
          if (/^[A-Z]{3}$/.test(c)) onChange(c);
        }}
      />
      <datalist id={id}>
        {currencyOptions(trip).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

/** Betrag mit Währung, darunter die Umrechnung bzw. ein Hinweis auf den fehlenden Kurs */
export function MoneyField({
  trip,
  amount,
  currency,
  rate,
  onAmount,
  onCurrency,
  label = "Betrag",
}: {
  trip: Trip;
  amount: number;
  currency: string;
  rate?: number | null;
  onAmount: (n: number) => void;
  onCurrency: (c: string) => void;
  label?: string;
}) {
  const r = rateOf({ currency, rate }, trip);
  const hint = currency === trip.currency ? undefined : r === null ? `Kurs für ${currency} fehlt – unter „Ausgaben“ eintragen` : `≈ ${money((amount || 0) * r, trip.currency)}`;
  return (
    <Field label={label} hint={hint}>
      <div className="amount-cell">
        <NumberInput value={amount} onChange={(v) => onAmount(v ?? 0)} />
        <CurrencySelect trip={trip} value={currency} onChange={onCurrency} />
      </div>
    </Field>
  );
}

/** Zahlungsmittel aus den Einstellungen; ein früher verwendeter, inzwischen gelöschter Name bleibt wählbar */
export function MethodSelect({ value, onChange, emptyLabel = "–" }: { value: string; onChange: (m: string) => void; emptyLabel?: string }) {
  const store = useStore();
  const opts = [...new Set([...store.settings.paymentMethods, ...(value ? [value] : [])])];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} title="Zahlungsmittel (Liste in den Einstellungen)">
      <option value="">{emptyLabel}</option>
      {opts.map((m) => (
        <option key={m}>{m}</option>
      ))}
    </select>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge color={BOOKING_STATUS[status].color}>{BOOKING_STATUS[status].label}</Badge>;
}

export function StatusSelect({ value, onChange }: { value: BookingStatus; onChange: (s: BookingStatus) => void }) {
  return (
    <div className="segmented full">
      {(Object.keys(BOOKING_STATUS) as BookingStatus[]).map((k) => (
        <button key={k} type="button" className={value === k ? "active" : ""} onClick={() => onChange(k)} title={BOOKING_STATUS[k].hint}>
          {BOOKING_STATUS[k].label}
        </button>
      ))}
    </div>
  );
}

/** Gemeinsamer Teil aller Buchungs-Formulare: Status, Preis, Zahler, Aufteilung, Buchungsdaten */
export function BookingFields<T extends Booking>({ trip, sum, b, set }: { trip: Trip; sum: TripSummary; b: T; set: (patch: Partial<T>) => void }) {
  return (
    <>
      <Field label="Status" wide hint={BOOKING_STATUS[b.status].hint}>
        <StatusSelect value={b.status} onChange={(status) => set({ status } as Partial<T>)} />
      </Field>
      <MoneyField
        trip={trip}
        label="Preis gesamt"
        amount={b.price}
        currency={b.currency}
        onAmount={(price) => set({ price } as Partial<T>)}
        onCurrency={(currency) => set({ currency } as Partial<T>)}
      />
      {sum.shared && (
        <>
          <Field label="Bezahlt von" hint="Wer hat das Geld ausgelegt?">
            <PersonSelect people={sum.travelers} value={b.paidBy} onChange={(paidBy) => set({ paidBy } as Partial<T>)} emptyLabel="Noch offen" />
          </Field>
          <Field label="Aufgeteilt auf" wide hint="Wer trägt die Kosten? „Alle“ = gleichmäßig auf alle Mitreisenden.">
            <PersonPicker people={sum.travelers} selected={b.travelers} onChange={(travelers) => set({ travelers } as Partial<T>)} allLabel="Alle" />
          </Field>
        </>
      )}
      <Field label="Bezahlt mit">
        <MethodSelect value={b.method} onChange={(method) => set({ method } as Partial<T>)} />
      </Field>
      <Field label="Anbieter / Portal">
        <input value={b.provider} placeholder="z. B. Booking.com, Direkt" onChange={(e) => set({ provider: e.target.value } as Partial<T>)} />
      </Field>
      <Field label="Buchungsnummer">
        <input value={b.bookingRef} onChange={(e) => set({ bookingRef: e.target.value } as Partial<T>)} />
      </Field>
      <Field label="Link" wide>
        <input value={b.link} placeholder="https://…" onChange={(e) => set({ link: e.target.value } as Partial<T>)} />
      </Field>
      <Field label="Notizen" wide>
        <textarea rows={3} value={b.notes} onChange={(e) => set({ notes: e.target.value } as Partial<T>)} />
      </Field>
    </>
  );
}

/** Preis einer Buchung für Listen: Original und ggf. umgerechnet */
export function BookingPrice({ trip, b }: { trip: Trip; b: Booking }) {
  if (!b.price) return <span className="muted">–</span>;
  const home = bookingHome(b, trip);
  return (
    <span className={b.status === "cancelled" ? "strike muted" : ""} title={b.status === "booked" ? "als Ausgabe übernommen" : "geplant"}>
      {money(b.price, b.currency)}
      {b.currency !== trip.currency && <span className="muted small"> ≈ {home ? money(home, trip.currency) : "Kurs fehlt"}</span>}
    </span>
  );
}

export function BookingLink({ url }: { url: string }) {
  if (!/^https?:\/\//.test(url)) return null;
  return (
    <a href={url} className="small" onClick={(e) => e.stopPropagation()} title={url}>
      ↗ Link
    </a>
  );
}

/** Modal zum Bearbeiten einer Buchung mit Löschen-Knopf; Änderungen werden sofort gespeichert. */
export function BookingModal({ title, onClose, onDelete, children }: { title: string; onClose: () => void; onDelete: () => void; children: ReactNode }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {confirm ? (
            <button className="danger" onClick={onDelete}>
              Wirklich löschen
            </button>
          ) : (
            <button className="ghost danger" onClick={() => setConfirm(true)}>
              Löschen
            </button>
          )}
          <span className="grow" />
          <button className="primary" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      <div className="form-grid">{children}</div>
    </Modal>
  );
}
