# Sicherheit

## Sicherheitslücken melden

Bitte melde vermutete Sicherheitslücken **nicht als öffentliches Issue**. Schreibe stattdessen eine Nachricht
an **[Soeren3003](https://github.com/Soeren3003)** über die Kontaktmöglichkeit im GitHub-Profil. Beschreibe darin kurz:

- was passiert und wie es sich nachstellen lässt,
- welche Version betroffen ist (siehe *Über Reiseplaner*),
- welches Betriebssystem du nutzt.

Ich melde mich so bald wie möglich. Behobene Lücken stehen im [CHANGELOG.md](CHANGELOG.md).

## Unterstützte Versionen

Sicherheitskorrekturen gibt es für die jeweils neueste Version.

## Sicherheitskonzept

Der Reiseplaner ist eine lokale Desktop-App. Daten können aber von außen hereinkommen: per Sync von einem anderen
Gerät oder Mitreisenden, mit dem der Nextcloud-Ordner geteilt ist, oder als Dokument.
Deshalb gilt:

- **Keine Geheimnisse im Repository.** Zugangsdaten gibt es nur lokal. Das Nextcloud-App-Passwort liegt im
  Schlüsselbund des Systems. Nur wenn keiner verfügbar ist, liegt es in `config.json`, und diese Datei ist dann nur
  für den eigenen Benutzer lesbar.
- **Strikte Content-Security-Policy:** Die Oberfläche lädt nur eigene Skripte und Bilder, Verbindungen laufen nur
  über die App selbst. Es werden keine Inhalte aus dem Internet geladen.
- **Kein HTML aus fremden Daten:** Namen, Notizen, Buchungsdaten und Links werden immer als Text
  dargestellt.
- **Wenig Rechte für die Oberfläche:** Sie darf nur Dateidialoge öffnen. Alles Weitere läuft über eigene Befehle,
  und die prüfen ihre Eingaben:
  - Datensatz-Kennungen dürfen nur Buchstaben, Ziffern, `-` und `_` enthalten; nur bekannte Sammlungen.
  - Dateinamen von Dokumenten dürfen keine Pfadanteile enthalten und nicht versteckt sein.
  - Programme, Skripte, Installer und Verknüpfungen im Dokumente-Ordner werden nicht direkt geöffnet
    (auch nicht mit doppelter Endung wie `rechnung.pdf.exe`).
  - Die App liest keine fremden Dateien ein (Dokumente werden nur in den Reise-Ordner kopiert). Geschrieben werden
    nur `.pdf`, `.csv` und `.ics` an den Ort, den du im Speichern-Dialog wählst.
  - Links öffnen nur, wenn sie mit `http(s)` beginnen.
- **CSV-Export:** Felder, die mit `=`, `+`, `-` oder `@` beginnen, werden entschärft, damit Tabellenprogramme sie
  nicht als Formel ausführen (CSV-Injection).
- **Sync:** Pfade vom Server, die den Datenordner verlassen würden (`..`, Laufwerksangaben, Backslashes,
  versteckte Dateien), werden ignoriert. Verbindungen laufen über HTTPS (rustls). Bei Konflikten geht nichts
  verloren: Die ältere Version wird unter `conflicts/` aufbewahrt.
- **Speichern:** Datensätze werden atomar geschrieben (erst temporäre Datei, dann umbenennen), damit bei einem
  Absturz keine halbe Datei entsteht.
- **Abhängigkeiten** werden mit `npm audit` und `cargo audit` geprüft.
