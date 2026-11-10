/**
 * CSV schreiben – mit Semikolon und BOM, damit Excel mit deutschen Einstellungen Umlaute und Spalten richtig erkennt.
 * Felder, die mit = + - @ beginnen, werden entschärft, damit Tabellenprogramme sie nicht als Formel ausführen.
 */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = typeof v === "number" ? String(v).replace(".", ",") : v;
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
