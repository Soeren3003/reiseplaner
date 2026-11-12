# Änderungsprotokoll

Alle nennenswerten Änderungen am Reiseplaner stehen hier, die neueste Version oben.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH`

- **MAJOR** steigt bei Änderungen, nach denen alte Daten oder Abläufe nicht mehr ohne Weiteres funktionieren.
- **MINOR** steigt bei neuen Funktionen, die bestehende Daten weiter lesen können.
- **PATCH** steigt bei Fehlerbehebungen und kleinen Verbesserungen ohne neue Funktion.

Vor Version 1.0.0 kann sich das Datenformat noch ändern; ältere Datensätze werden beim Laden mit Standardwerten ergänzt.

## [1.0.0] – 2026-11-12

Erste stabile Version.

### Neu

- README mit Screenshots aus dem Demo-Modus

### Geändert

- Abhängigkeiten aktualisiert: React 19, Vite 8, TypeScript 7, @vitejs/plugin-react 6, Rust-Crates auf den neuesten
  kompatiblen Stand; `npm audit` und `cargo audit` ohne Sicherheitslücken
- Leere Datums- und Zeitfelder zeigen nicht mehr grau das heutige Datum bzw. die aktuelle Uhrzeit an (sah aus wie ein
  gesetzter Termin)
- Hinweis bei der Kurtaxe nennt das Feld „Aufgeteilt auf“

### Sicherheit

- Nextcloud/WebDAV nur noch über HTTPS; http:// wird nur für einen Server auf dem eigenen Rechner angenommen, damit
  das App-Passwort nicht unverschlüsselt übertragen werden kann.
- Per Sync empfangene Datensätze mit fehlenden oder falschen Feldern werden beim Laden abgesichert.

## [0.2.2] – 2026-11-10

### Neu

- Kurtaxe auch pro Tag, pro Person und Tag oder als Gesamtbetrag (z. B. 90 € für 10 Tage). Tage = Nächte + 1;
  der Betrag wird gleichmäßig auf die Tage der Unterkunft verteilt.

## [0.2.1] – 2026-11-10

### Behoben

- „Bezahlt von“ ließ sich bei automatisch übernommenen Ausgaben (aus Transport, Unterkünften, Aktivitäten, Kurtaxe)
  nicht ändern – die Auswahl wurde ohne Hinweis ignoriert. Zahler, Aufteilung und Zahlungsmittel lassen sich jetzt
  auch dort ändern und gelten dann für die Buchung.

### Geändert

- „Für“ heißt jetzt „Aufgeteilt auf“, mit Erklärung; „Bezahlt von“ ist rot markiert, solange es fehlt.
- Ausgaben ohne „bezahlt von“: Hinweis mit Filter und „alle auf … setzen“; in der Liste mit „?“ gekennzeichnet.
- Die Schnellerfassung schlägt als Zahler immer eine mitreisende Person vor, auch wenn Mitreisende erst später
  eingetragen werden.

## [0.2.0] – 2026-11-10

### Neu

- Unterkünfte: Verpflegung (nur Übernachtung, Frühstück, Halbpension, Vollpension, All-Inclusive oder einzelne
  Mahlzeiten) statt nur „Frühstück“
- Unterkünfte: Kurtaxe pro Person und Nacht oder pro Nacht, als eigene Ausgabe oder „im Preis enthalten“;
  Personenzahl automatisch oder von Hand
- Zahlungsmittel frei benennbar (Einstellungen), auswählbar bei Ausgaben, in der Schnellerfassung und bei Buchungen;
  Filter in der Ausgabenliste
- Auswertung: Diagramm pro Tag nach Kategorie oder Zahlungsmittel, für die Gruppe oder pro Person; Ø pro Person und
  Tag; Tabelle nach Zahlungsmittel; Tabelle „Tag für Tag“ mit dem Anteil jeder Person und CSV-Export
- Statistik: Ø pro Person und Tag, Auswertung nach Zahlungsmittel

### Geändert

- Bisherige Zahlungsarten (Bar, Karte, Online) und das Frühstücks-Häkchen werden beim Laden übernommen.

## [0.1.0] – 2026-11-10

Erste Version.

### Neu

- Reisen mit Zeitraum, Reiseziel, Ländern, Status, Heimatwährung, Budget (gesamt oder pro Tag) und Mitreisenden
- Überblick mit Countdown, Kennzahlen, Hinweisen und Tagesplan
- Transport (Flug, Zug, Bus, Fähre, Auto, Mietwagen, Taxi, Nahverkehr, Fahrrad) mit Zeiten, Nummern, Sitzplatz,
  Buchungsnummer, Strecke und Dauer
- Unterkünfte mit Check-in/-out, Adresse, Frühstück und Preis pro Nacht; Anzeige von Nächten ohne Unterkunft
- Aktivitäten nach Tagen
- Buchungsstatus Idee, Reserviert, Gebucht, Storniert; gebuchte Einträge werden automatisch zu Ausgaben
- Aufgaben vor der Reise und Packliste mit anpassbaren Vorlagen
- Ausgaben in beliebigen Währungen mit von Hand gepflegten Kursen, Land, Zahlungsart, Verteilung über mehrere Tage
  und Ausnahme vom Tagesdurchschnitt
- Aufteilung auf Mitreisende, Salden, Ausgleichszahlungen und möglichst wenige Überweisungen
- Auswertung je Reise (pro Tag, Kategorie, Land, Zahlungsart, Währung, Person; ganze Gruppe oder eigener Anteil)
- Statistik über alle Reisen mit Diagrammen, Tabellen und CSV-Export
- Export als Kalender (.ics), CSV und PDF
- Dokumente je Reise, Abgleich über Nextcloud bzw. WebDAV
