import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "./api";
import { arrivalDate, dailyByPerson, homeAmount, rateOf, splitIds, stayNights, stayTax, transportDuration } from "./calc";
import { countryName } from "./countries";
import { toCsv } from "./csv";
import { BOOKING_STATUS, CATEGORIES, STAY_KINDS, TRANSPORT_MODES, addDays, boardLabel } from "./defaults";
import { date, dateRange, dayLabel, duration, money, num, safeFileName } from "./format";
import type { TripSummary } from "./summary";
import type { Transport, Trip } from "./types";

const enc = (s: string) => new TextEncoder().encode(s);

export const transportTitle = (t: Transport) => {
  const m = TRANSPORT_MODES[t.mode];
  const route = [t.from, t.to].filter(Boolean).join(" → ");
  return `${m.icon} ${[t.number || m.label, route].filter(Boolean).join(" ")}`;
};

// ---------- Kalender (iCalendar, RFC 5545) ----------

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Zeilen über 75 Byte falten */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

interface CalEntry {
  uid: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
}

function vevent(e: CalEntry, stamp: string) {
  const d = (iso: string) => iso.replace(/-/g, "");
  const t = (hhmm: string) => `${hhmm.replace(":", "")}00`;
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}@reiseplaner`, `DTSTAMP:${stamp}`];
  if (e.startTime) {
    // „schwebende“ Ortszeit: Abflug 10:30 bleibt 10:30, egal in welcher Zeitzone der Kalender geöffnet wird
    lines.push(`DTSTART:${d(e.startDate)}T${t(e.startTime)}`);
    if (e.endTime) lines.push(`DTEND:${d(e.endDate || e.startDate)}T${t(e.endTime)}`);
    else lines.push("DURATION:PT1H");
  } else {
    lines.push(`DTSTART;VALUE=DATE:${d(e.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${d(addDays(e.endDate || e.startDate, 1))}`);
  }
  lines.push(`SUMMARY:${icsEscape(e.title)}`);
  if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

const join = (parts: (string | false | undefined)[], sep = "\n") => parts.filter(Boolean).join(sep);

export function calendarEntries(trip: Trip, sum: Pick<TripSummary, "transports" | "stays" | "activities">): CalEntry[] {
  const out: CalEntry[] = [
    {
      uid: trip.id,
      title: `${trip.emoji} ${trip.name}`.trim(),
      startDate: trip.startDate,
      startTime: "",
      endDate: trip.endDate,
      endTime: "",
      location: trip.destination,
      description: trip.notes,
    },
  ];
  for (const t of sum.transports.filter((x) => x.status !== "cancelled" && x.departDate)) {
    out.push({
      uid: t.id,
      title: transportTitle(t),
      startDate: t.departDate,
      startTime: t.departTime,
      endDate: arrivalDate(t),
      endTime: t.arriveTime,
      location: t.from,
      description: join([
        t.carrier && `${t.carrier}${t.number ? ` ${t.number}` : ""}`,
        t.bookingRef && `Buchung: ${t.bookingRef}`,
        t.seat && `Sitz: ${t.seat}`,
        t.details,
        t.notes,
      ]),
    });
  }
  for (const s of sum.stays.filter((x) => x.status !== "cancelled" && x.checkIn)) {
    out.push({
      uid: `${s.id}-in`,
      title: `${STAY_KINDS[s.kind].icon} Check-in ${s.name}`,
      startDate: s.checkIn,
      startTime: s.checkInTime,
      endDate: s.checkIn,
      endTime: "",
      location: s.address,
      description: join([s.bookingRef && `Buchung: ${s.bookingRef}`, s.phone && `Telefon: ${s.phone}`, `${stayNights(s)} Nächte bis ${date(s.checkOut)}`, s.notes]),
    });
    if (s.checkOut)
      out.push({
        uid: `${s.id}-out`,
        title: `${STAY_KINDS[s.kind].icon} Check-out ${s.name}`,
        startDate: s.checkOut,
        startTime: s.checkOutTime,
        endDate: s.checkOut,
        endTime: "",
        location: s.address,
        description: "",
      });
  }
  for (const a of sum.activities.filter((x) => x.status !== "cancelled" && x.date)) {
    out.push({
      uid: a.id,
      title: `${CATEGORIES[a.category].icon} ${a.title}`,
      startDate: a.date,
      startTime: a.time,
      endDate: a.date,
      endTime: a.endTime,
      location: a.location,
      description: join([a.bookingRef && `Buchung: ${a.bookingRef}`, a.notes]),
    });
  }
  return out;
}

export function buildIcs(trip: Trip, sum: Pick<TripSummary, "transports" | "stays" | "activities">, stamp = new Date()): string {
  const st = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soeren3003//Reiseplaner//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(trip.name)}`];
  for (const e of calendarEntries(trip, sum)) lines.push(...vevent(e, st));
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export const exportIcs = (trip: Trip, sum: TripSummary) => saveAs(`${safeFileName(trip.name)}.ics`, enc(buildIcs(trip, sum)), "text/calendar");

// ---------- CSV ----------

export function expenseRows(trip: Trip, sum: TripSummary): (string | number)[][] {
  const head = ["Datum", "bis", "Wofür", "Kategorie", "Betrag", "Währung", "Kurs", `Betrag (${trip.currency})`, "Land", "Zahlungsmittel", "Bezahlt von", "Aufgeteilt auf", "im Tagesdurchschnitt", "Notiz"];
  return [
    head,
    ...sum.expenses
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => [
        date(e.date),
        e.endDate ? date(e.endDate) : "",
        e.title,
        CATEGORIES[e.category].label,
        e.amount,
        e.currency,
        rateOf(e, trip) ?? "fehlt",
        homeAmount(e, trip),
        e.country ? countryName(e.country) : "",
        e.method,
        sum.shared ? sum.name(e.paidBy) : "",
        sum.shared ? splitIds(e, trip).map(sum.name).join(", ") : "",
        e.excludeFromDaily ? "nein" : "ja",
        e.notes,
      ]),
  ];
}

export function settlementRows(trip: Trip, sum: TripSummary): (string | number)[][] {
  const s = sum.settlement;
  return [
    ["Name", `ausgelegt (${trip.currency})`, "Zahlungen", "Kostenanteil", "Saldo"],
    ...s.rows.map((r) => [sum.name(r.personId), r.paid, r.transferred, r.share, r.balance]),
    [],
    ["Überweisungen", "", "", "", ""],
    ...s.transfers.map((t) => [`${sum.name(t.from)} → ${sum.name(t.to)}`, "", "", "", t.amount]),
  ];
}

/** Tag für Tag: Gesamt, pro Person im Schnitt und der Anteil jeder mitreisenden Person */
export function dailyRows(trip: Trip, sum: TripSummary): (string | number)[][] {
  const people = sum.shared ? dailyByPerson(trip, sum.expenses) : [];
  const persons = Math.max(1, trip.travelers.length);
  return [
    ["Tag", "Datum", `Gesamt (${trip.currency})`, "pro Person", ...people.map((p) => sum.name(p.personId))],
    ...sum.stats.daily.map((d, i) => [i + 1, date(d.date), d.total, Math.round((d.total / persons) * 100) / 100, ...people.map((p) => p.daily[i])]),
  ];
}

export const exportDailyCsv = (trip: Trip, sum: TripSummary) => saveAs(`Tage ${safeFileName(trip.name)}.csv`, enc(toCsv(dailyRows(trip, sum))), "text/csv");

export const exportExpensesCsv = (trip: Trip, sum: TripSummary) => saveAs(`Ausgaben ${safeFileName(trip.name)}.csv`, enc(toCsv(expenseRows(trip, sum))), "text/csv");
export const exportSettlementCsv = (trip: Trip, sum: TripSummary) => saveAs(`Abrechnung ${safeFileName(trip.name)}.csv`, enc(toCsv(settlementRows(trip, sum))), "text/csv");

// ---------- Abrechnung als Text (zum Verschicken) ----------

export function settlementText(trip: Trip, sum: TripSummary) {
  const m = (n: number) => money(n, trip.currency);
  const s = sum.settlement;
  const lines = [`${trip.name} – Abrechnung`, `Kosten gesamt: ${m(s.total)}`, ""];
  lines.push(...s.rows.map((r) => `${sum.name(r.personId)}: Anteil ${m(r.share)}, ausgelegt ${m(r.paid)}${r.transferred ? `, gezahlt ${m(r.transferred)}` : ""} → ${r.balance >= 0 ? "+" : ""}${m(r.balance)}`));
  lines.push("", ...(s.transfers.length ? s.transfers.map((t) => `➜ ${sum.name(t.from)} zahlt ${m(t.amount)} an ${sum.name(t.to)}`) : ["Alles ausgeglichen 👍"]));
  return lines.join("\n");
}

// ---------- PDF ----------

/** Text für PDF: jsPDF-Standardschriften kennen keine Emojis. */
const plain = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/→/g, "->")
    .replace(/–/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export interface PdfParts {
  plan: boolean;
  bookings: boolean;
  expenses: boolean;
  settlement: boolean;
}

/** Reiseunterlagen zum Ausdrucken: Tagesplan, Buchungen, Ausgaben nach Kategorie, Abrechnung. */
export function buildTripPdf(trip: Trip, sum: TripSummary, parts: PdfParts = { plan: true, bookings: true, expenses: true, settlement: true }): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const m = (n: number) => plain(money(n, trip.currency));
  let y = 18;
  doc.setFontSize(18);
  doc.text(plain(trip.name), 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(110);
  const info = [dateRange(trip.startDate, trip.endDate), trip.destination, sum.travelers.length ? sum.travelers.map((p) => p.name).join(", ") : ""].filter(Boolean).join(" · ");
  doc.text(doc.splitTextToSize(plain(info), 182), 14, y);
  doc.setTextColor(0);
  y += 6;

  const table = (title: string, head: string[], body: (string | number)[][]) => {
    if (!body.length) return;
    if (y > 260) {
      doc.addPage();
      y = 12;
    }
    doc.setFontSize(12);
    doc.text(plain(title), 14, y + 6);
    autoTable(doc, {
      startY: y + 9,
      head: [head],
      body: body.map((r) => r.map((c) => (typeof c === "string" ? plain(c) : c))),
      styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [10, 127, 208] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  if (parts.plan)
    table(
      "Tagesplan",
      ["Tag", "Datum", "Unterwegs & Programm", "Übernachtung"],
      sum.plan.map((d) => [
        d.dayNo ? String(d.dayNo) : "",
        dayLabel(d.date),
        [
          ...d.transports.map((t) => `${t.departTime ? `${t.departTime} ` : ""}${transportTitle(t)}${t.arriveTime ? ` (an ${t.arriveTime})` : ""}`),
          ...d.checkIns.map((s) => `Check-in ${s.name}`),
          ...d.activities.map((a) => `${a.time ? `${a.time} ` : ""}${a.title}`),
        ].join("\n"),
        d.night?.name ?? "",
      ]),
    );

  if (parts.bookings) {
    table(
      "Transport",
      ["Ab", "Was", "Strecke", "An", "Buchung", "Status"],
      sum.transports.map((t) => {
        const dur = transportDuration(t);
        return [
          `${date(t.departDate)} ${t.departTime}`,
          `${TRANSPORT_MODES[t.mode].label}${t.carrier ? `, ${t.carrier}` : ""}${t.number ? ` ${t.number}` : ""}`,
          [t.from, t.to].filter(Boolean).join(" -> "),
          `${arrivalDate(t) !== t.departDate ? `${date(arrivalDate(t))} ` : ""}${t.arriveTime}${dur ? ` (${duration(dur)} h)` : ""}`,
          [t.bookingRef, t.seat && `Sitz ${t.seat}`].filter(Boolean).join(", "),
          BOOKING_STATUS[t.status].label,
        ];
      }),
    );
    table(
      "Unterkünfte",
      ["Zeitraum", "Nächte", "Unterkunft", "Adresse", "Buchung", "Preis", "Kurtaxe"],
      sum.stays.map((s) => {
        const tax = stayTax(s, trip);
        return [
          dateRange(s.checkIn, s.checkOut),
          String(stayNights(s)),
          `${s.name} (${[STAY_KINDS[s.kind].label, boardLabel(s)].filter(Boolean).join(", ")})`,
          s.address,
          s.bookingRef,
          s.price ? plain(money(s.price, s.currency)) : "",
          tax.total ? `${plain(money(tax.total, s.currency))}${s.touristTaxIncluded ? " (inkl.)" : ""}` : "",
        ];
      }),
    );
    table(
      "Aktivitäten",
      ["Datum", "Zeit", "Was", "Ort", "Buchung", "Preis"],
      sum.activities.map((a) => [date(a.date), [a.time, a.endTime].filter(Boolean).join("-"), a.title, a.location, a.bookingRef, a.price ? plain(money(a.price, a.currency)) : ""]),
    );
  }

  if (parts.expenses && sum.expenses.length) {
    const st = sum.stats;
    table(
      `Ausgaben: ${m(st.total)} gesamt, ${m(st.perDay)} pro Tag${st.persons > 1 ? `, ${m(st.perPersonDay)} pro Person und Tag` : ""} (${st.days} Tage)`,
      ["Kategorie", "Betrag", "Anteil", "Anzahl"],
      st.byCategory.map((c) => [CATEGORIES[c.key].label, m(c.amount), `${num(st.total ? (c.amount / st.total) * 100 : 0, 0)} %`, String(c.count)]),
    );
  }

  if (parts.settlement && sum.shared && sum.expenses.length) {
    const s = sum.settlement;
    table(
      "Abrechnung",
      ["Name", "ausgelegt", "Zahlungen", "Kostenanteil", "Saldo"],
      s.rows.map((r) => [sum.name(r.personId), m(r.paid), m(r.transferred), m(r.share), m(r.balance)]),
    );
    table(
      "Wer zahlt wem?",
      ["Wer", "zahlt an", "Betrag"],
      s.transfers.length ? s.transfers.map((t) => [sum.name(t.from), sum.name(t.to), m(t.amount)]) : [["-", "Alles ausgeglichen", ""]],
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export const exportPdf = (trip: Trip, sum: TripSummary, parts?: PdfParts) => saveAs(`${safeFileName(trip.name)}.pdf`, buildTripPdf(trip, sum, parts), "application/pdf");

