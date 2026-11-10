# Änderungsprotokoll

Alle nennenswerten Änderungen am Reiseplaner stehen hier, die neueste Version oben.

Die Versionsnummern folgen der [semantischen Versionierung](https://semver.org/lang/de/): `MAJOR.MINOR.PATCH`

- **MAJOR** steigt bei Änderungen, nach denen alte Daten oder Abläufe nicht mehr ohne Weiteres funktionieren.
- **MINOR** steigt bei neuen Funktionen, die bestehende Daten weiter lesen können.
- **PATCH** steigt bei Fehlerbehebungen und kleinen Verbesserungen ohne neue Funktion.

Vor Version 1.0.0 kann sich das Datenformat noch ändern; ältere Datensätze werden beim Laden mit Standardwerten ergänzt.

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
