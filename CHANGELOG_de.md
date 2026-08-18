# Changelog

Alle wichtigen Änderungen an dieser Anwendung werden hier dokumentiert.

## [1.14.0] - 2026-08-18

### Hinzugefügt

- **Sechzehn weitere Module** — Umfragen, Aufgaben, Nachrichten, Mailings, Externe Kontakte, Meldungen, Üben zu Hause, Aushilfen, Inventar, Projekte und Reisen, Raumbuchung, Wiki, Aufführungshistorie, Workflow-Automatisierung, Saisonplanung und Anwesenheitsanalyse. Zusammen mit den ersten drei sind das neunzehn Schalter, die 32 Menüpunkte ausblenden.
- **Übergreifende Ansichten ziehen mit** — Dashboard-Widgets, der Infobildschirm, die Wochenmail und die Workflow-Ausführung zeigen nichts mehr aus einem abgeschalteten Modul. Widget-Einstellungen bleiben erhalten und kehren unverändert zurück.

### Behoben

- Die Übungsübersicht erschien nie in der Wochenmail: die Abfrage lieferte `total_minutes`, während der Text `totalMinutes` las.

### Hinzugefügt

#### Module

- **Bereiche ein- und ausschalten** — Ein Administrator schaltet unter Verwaltung → Module ab, was der Verein nicht nutzt. Es verschwindet aus dem Menü und lässt sich nicht mehr öffnen.
- **Ausschalten blendet aus, es löscht nicht** — Die Daten eines abgeschalteten Moduls bleiben unverändert und sind beim Einschalten genau wie zuvor wieder da.
- **Erste drei Module** — Buchhaltung, Kartenverkauf (inklusive Zahlungseinstellungen und Scanner) sowie Bühne und Aufstellung. Zusammen zehn Menüpunkte.
- **In der Einführung** — Neue Administratoren sehen die Module direkt nach der Begrüßung.

### Geändert

- **Die drei Module sind standardmäßig aus**, auch für bestehende Vereine. Wer sie nutzt, schaltet sie mit zwei Klicks unter Verwaltung → Module wieder ein; die Daten sind noch vorhanden.

### Behoben

- Zehn Module schrieben in Tabellen oder Spalten, die nie angelegt worden waren, sodass diese Funktionen scheiterten, sobald jemand sie nutzte: Buchhaltung, Anhänge an Mailings, Schadensmeldungen zu Ausrüstung, Wiki-Anhänge, der Zeichenpfad in Anmerkungen, Saisonplanung, IMSLP-Import und die Konzert-Bühnenaufstellung.
- `equipment_loans` stand zweimal im Schema mit unterschiedlichen Spalten. Da die erste gewann, bekam das Ausrüstungsmodul still die falsche Tabelle.

## [1.13.0] - 2026-05-06

### Hinzugefügt

#### Veranstaltungs- & Auftrittsplaner

- **Komplettes Veranstaltungsmanagement** — Verwalten Sie Veranstaltungen mit detaillierten Ortsinformationen, Zeitplänen und Programmen
- **Transportkoordination** — Registrieren Sie Autos/Busse mit Fahrern, Passagieren und Treffpunkten
- **Packlisten** — Erstellen Sie Packlisten mit Vorlagen, verfolgen Sie den Fortschritt pro Artikel, weisen Sie Verantwortliche zu
- **Wetter-Integration** — Wettervorhersagen für Außenauftritte mit Warnungen
- **Anwesenheitsverwaltung** — Mitglieder können Anwesenheit mit Transportbedarf und Ernährungswünschen angeben
- **Standortverwaltung** — Verwalten Sie Lieblingsorte mit Einrichtungen (Strom, Umkleideräume, Parkplätze)

#### Mehrere Vereine

- **Multi-Tenant-Unterstützung** — Eine Installation für mehrere Orchester/Vereine
- **Super-Admin-Panel** — Verwalten Sie alle Vereine, Abonnements und Limits
- **Mitgliedschaft** — Benutzer können Mitglied in mehreren Vereinen sein
- **Partnerschaften** — Vereine können Musik, Veranstaltungen und Mitglieder teilen
- **Einladungssystem** — Laden Sie neue Mitglieder mit automatischer Rollenzuweisung ein
- **Aktivitätsprotokoll** — Audit-Trail aller wichtigen Aktionen pro Verein

### Technisch

- 20+ neue Datenbanktabellen für Veranstaltungen, Orte, Transport, Packlisten und Multi-Tenant
- Vollständige API mit ~50 neuen Endpunkten
- React Query Hooks für alle neuen Funktionen
- Übersetzungen in NL, EN und DE

## [1.12.0] - 2026-05-02

### Hinzugefügt

#### WP3: Barrierefreiheit (WCAG 2.1 AA)

- **Tastaturnavigation** — Vollständige Anwendung per Tastatur bedienbar mit sichtbaren Fokus-Indikatoren
- **Skip-Links** — Direkte Navigation zum Hauptinhalt für Screenreader-Benutzer
- **ARIA-Labels** — Korrekte ARIA-Attribute für alle interaktiven Elemente, Modals und Formulare
- **Fokus-Management** — Fokus wird automatisch verschoben, wenn Modals geöffnet/geschlossen werden
- **Barrierefreiheitstests** — Umfassende jest-axe Tests für alle Komponenten

#### WP4: Docker & Self-Hosting

- **Docker Compose** — Vollständiges Produktions-Setup mit Nginx Reverse Proxy, Let's Encrypt SSL und Health Checks
- **Multi-Architektur** — Docker-Images für AMD64 und ARM64 (Apple Silicon, Raspberry Pi)
- **Backup-Volumes** — Automatische Volume-Mounts für Datenbank und Uploads

#### WP5: Musik-Metadaten & Interoperabilität

- **MusicXML-Import** — Parsen von MusicXML-Dateien für automatische Metadaten-Extraktion
- **JSKOS-Vokabulare** — Standardisierte Genre-Klassifikation über JSKOS/SKOS
- **Dublin Core-Export** — Metadaten-Export gemäß Dublin Core-Standard
- **IIIF-Manifest** — Noten verfügbar über IIIF-Protokoll

#### WP6: DSGVO & Privacy-by-Design

- **Datenexport** — Benutzer können alle ihre Daten herunterladen (JSON)
- **Löschanträge** — Self-Service-Kontolöschung mit 30-tägiger Aufbewahrungsfrist
- **Aufbewahrungseinstellungen** — Konfigurierbare Aufbewahrungsfristen pro Datentyp
- **Automatische Bereinigung** — Täglicher Scheduler für abgelaufene Sitzungen, Logs und gelöschte Konten
- **Audit-Logging** — Umfassender Audit-Trail für alle CRUD-Operationen
- **Einwilligungs-Tracking** — Aufzeichnung von Benutzereinwilligungen

#### WP7: Community & Governance

- **Verhaltenskodex** — Contributor Covenant Verhaltenskodex
- **Beitragsrichtlinien** — Richtlinien für Beiträge zum Projekt
- **Sicherheitsrichtlinie** — Responsible Disclosure-Richtlinie

#### WP8: CI/CD & Testabdeckung

- **GitHub Actions** — Automatisierte CI/CD-Pipeline mit parallelem Testen
- **CodeQL** — SAST-Sicherheitsscanning für Schwachstellen
- **Dependabot** — Automatische Dependency-Updates
- **Codecov** — Testabdeckungs-Berichterstattung (>80% Ziel)
- **Multi-Tenant-Tests** — Datenisolationstests zwischen Organisationen

#### WP10: PWA & Mobile UX

- **App-Shortcuts** — Direkter Zugriff auf Meine Musik, Proben, Tickets vom Homescreen
- **Share Target** — PDF-Dateien über nativen Share-Dialog empfangen
- **Push-Benachrichtigungen** — Native Push-Meldungen mit Click-Handling und Navigation
- **Offline-Sync** — Background-Sync für Aktionen ohne Internet
- **Verbessertes Caching** — Intelligente Cache-Strategien pro Inhaltstyp

### Verbessert

- **156 fehlende englische Übersetzungen** — Vollständige Parität zwischen NL/EN/DE
- **Barrierefreiheitstests** — Tests mit echten Komponenten statt Mock-HTML
- **Service Worker** — Custom SW mit Workbox für Push und Offline-Funktionalität

### Tests

- Backend: 265+ Tests
- Frontend: 85+ Tests (einschließlich Barrierefreiheit)
- E2E-Abdeckung für kritische Benutzerflows

## [1.11.0] - 2026-04-25

### Hinzugefügt

- **Cloud-Import (OneDrive/SharePoint & Google Drive)** — Importieren Sie Noten direkt aus OneDrive/SharePoint oder Google Drive, ohne sie erst herunterzuladen. Dateien werden serverseitig über Access Tokens abgerufen und wie reguläre Uploads geparst
- **Google Drive-Einstellungen** — Separate Konfigurationskarte in den Einstellungen für OAuth Client ID und API-Schlüssel (Picker API + Drive API)
- **Rollenbasiertes Benutzerhandbuch** — Handbuch-Abschnitte werden nach Benutzerrolle gefiltert (member, conductor, music_committee, admin) mit umfassenden HTML-Inhalten in allen drei Sprachen
- **Rollenbasierter Rundgang** — Onboarding-Tour hat separate Pfade pro Rolle: admin (6), music_committee (7), conductor (5), member (6), jeweils mit maßgeschneiderten Erklärungen und Navigationszielen
- **Lucide-Icon-System** — Zentrale `Icon`-Komponente mit 60+ Vektor-Icons (SF Symbols-Stil) ersetzt 145+ Emojis in 36 Dateien
- **iOS-Style Bottom Sheets auf Mobilgeräten** — Modals auf Smartphones gleiten von unten nach oben mit einem „Grabber"-Griff und Safe-Area-Padding, gemäß Apple HIG

### Verbessert (Apple HIG-Ausrichtung)

- **Touch-Ziele** — Mindestens 44×44pt für alle Schaltflächen (Apple HIG-Anforderung), auch für Icon-Only-Buttons
- **Border-Radius** — Buttons 10px, Karten 14px, Modals 16-20px für ein natürlicheres iOS-Gefühl
- **Animations-Easing** — Ersetzt durch iOS Easing-Kurven (`cubic-bezier(0.25, 0.1, 0.25, 1)`) plus Spring-Kurve für verspielte Animationen
- **Login-Seite** — Lila Gradient ersetzt durch neutralen Hintergrund mit radialen Akzent-Gradienten und Frosted-Glass-Karte (`backdrop-filter: blur(28px)`)
- **Große Seitentitel** — iOS-Style Large Titles (32-34px bold) mit SF Pro Letter-Spacing auf Seitenkopfzeilen
- **Spacing-Skala** — Erweitert mit `--space-16` und `--space-20` (64/80px) für bessere 8pt-Grid-Ausrichtung
- **Button-Press-Animation** — Subtiles `scale(0.97)` im Active-Zustand für taktiles Feedback
- **Modal-Animationen** — Eingangsanimation mit Fade + Lift, Blur-Backdrop auf Overlay
- **Sprachumschalter verschoben** — Von der oberen Navigationsleiste zu den Benutzereinstellungen (Profil)

### Dokumentation

- **Cloud-Import in READMEs** — Zu README.md, README.nl.md und README.de.md hinzugefügt, einschließlich Architekturdiagrammen, Konfigurationsanweisungen (OAuth-Setup) und API-Endpunkt-Referenzen
- **Changelog-Übersetzungen** — Vollständige englische und deutsche Changelogs mit allen Versionen

## [1.10.0] - 2026-04-24

### Hinzugefügt

- **In-App PDF-Viewer** — Noten direkt in der App ansehen, ohne sie erst herunterzuladen. Unterstützt Zoom, Wisch-Navigation zwischen Seiten, Klick-und-Ziehen-Panning bei Zoom und Dunkelmodus für bessere Lesbarkeit
- **PDF-Anmerkungen** — Mitglieder können persönliche Anmerkungen pro Seite zu Noten hinzufügen, mit Farbauswahl. Anmerkungen sind privat und bleiben erhalten
- **Offline PDF-Caching** — Schaltfläche "Offline verfügbar machen" pro Musikliste speichert alle PDFs für die Offline-Nutzung. Grüne Häkchen zeigen, welche Stücke gespeichert sind
- **Alle herunterladen** — Zip-Download aller PDFs einer Musikliste auf einmal
- **Kompakte Ansicht** — Umschalter in Meine Musik, um Stimmung/Nummer/Schlüssel-Spalten inline anzuzeigen — besser für mobile Nutzung
- **Dashboard-Widgets** — Neu gestaltetes Dashboard mit Widgets für kommende Proben, Schnellaktionen, Übungsfortschritt, Favoriten und letzte Aktivitäten. Drag-and-Drop-Neuordnung und Ein-/Ausblenden
- **Benachrichtigungsglocke im Header** — Prominente Benachrichtigungsglocke mit Zähler für ungelesene und Dropdown für aktuelle Meldungen
- **Mollie Live/Test API-Schlüssel** — Sowohl einen Live- als auch einen Test-API-Schlüssel konfigurieren und zwischen den Modi umschalten. Warnungs-Badge wenn Testmodus aktiv ist
- **Telegram & WhatsApp UI-Konfiguration** — Administratoren können Telegram-Bot-Tokens und WhatsApp-Zugangsdaten (Meta oder Twilio) über die Einstellungs-Seite konfigurieren, ohne Umgebungsvariablen
- **Navigations-Neugestaltung** — Persistente Seitenleiste auf dem Desktop mit einklappbaren rollenbasierten Sektionen, mobile Tab-Leiste unten mit "Mehr"-Panel für vollständige Navigation
- **Design-Token-System** — Erweitertes CSS-Custom-Property-System (Farben, Typografie, Abstände, Schatten) mit Utility-Klassen für konsistente UI-Entwicklung
- **E-Mail-Benachrichtigungs-Trigger** — Automatische Benachrichtigungen bei neuen Musik-Uploads und Proben-Änderungen/Stornierungen
- **ESLint + Prettier** — Flat Config mit TypeScript- und React-Hooks-Regeln, Scripts für `lint` und `format`
- **Deutsche README** — Vollständige README.de.md-Übersetzung mit Architektur-Diagrammen

### Verbessert

- Globale Suchen-Schaltfläche (🔍) im Header hinzugefügt
- Leere Zustände in Dashboard-Widgets mit Symbolen und Aktions-Links
- Architektur-Diagramme in den README-Dateien aktualisiert, um alle aktuellen externen Dienste widerzuspiegeln (Mollie, Telegram, WhatsApp, Web Push, IMSLP, Spotify, Apple Music)
- 938 fehlende deutsche Übersetzungs-Schlüssel ergänzt, 46 Ticket-Strings manuell übersetzt
- Doppelte JSON-Schlüssel in `nl.json`, `en.json` und `de.json` zusammengeführt
- Tokens werden in Einstellungs-API-Antworten maskiert zurückgegeben für bessere Sicherheit

### Behoben

- PDF-Viewer "Could not load PDF"-Fehler — Blob-URLs wurden als Rohdaten anstatt als URL übergeben
- PDF-Viewer-Zoom hatte keine sichtbare Wirkung — Canvas `maxWidth: 100%`-Einschränkungen skalierten ihn wieder herunter
- PDF-Viewer-Panning/-Scrollen bei Zoom — Canvas im Flex-Container erhält jetzt `flex-shrink: 0` beim Zoomen
- Fehlende Übersetzungen auf der Übungsplan-Seite (`common.orchestra`, `common.notes`, `music.title` usw.)

### Tests

- 47 neue Tests hinzugefügt (Annotations-Route, Instruments-Route, pdfCache-Utility)
- Gesamte Testabdeckung: Backend 249 Tests (+30), Frontend 59 Tests (+17)

## [1.9.0] - 2026-03-30

### Hinzugefügt

- **Push-Benachrichtigungen** — Web-Push-Benachrichtigungen mit VAPID für neue Musikstücke, Probenänderungen und Ankündigungen. Unterstützt mehrere Kanäle: Push, E-Mail, WhatsApp und Telegram
- **Benachrichtigungseinstellungen** — Benutzer können pro Benachrichtigungstyp einstellen, über welchen Kanal sie Meldungen erhalten möchten
- **Globale Suche** — Einheitliche Suche (Cmd+K / Strg+K) über Musikstücke, Mitglieder, Orchester, Listen und Proben mit Autocomplete und letzten Suchanfragen
- **Sortierbare Konzertprogramme** — Drag-and-Drop mit @dnd-kit zum Neuordnen von Stücken in Konzertprogrammen
- **Konzertprogramm PDF-Export** — Erstellen Sie professionell formatierte PDF-Programmhefte mit Titelseite, nummerierter Stückliste und Gesamtdauer
- **PWA-Unterstützung** — Progressive Web App mit Service Worker, Offline-Seite und Installationsmöglichkeit

### Verbessert

- Benachrichtigungszentrum mit Dropdown für aktuelle Benachrichtigungen und Einstellungen
- Tastaturnavigation in Suchergebnissen (Pfeiltasten, Home/End)
- Suchvorschläge mit 200ms Debounce für bessere Leistung

## [1.8.1] - 2026-03-28

### Behoben

- **Trust-Proxy-Konfiguration** - Express `trust proxy`-Einstellung für Produktionsumgebungen hinter einem Reverse-Proxy (z.B. Render, Nginx) hinzugefügt, damit express-rate-limit korrekt mit X-Forwarded-For-Headern funktioniert
- **TypeScript-Build** - Testdateien vom Produktions-Build ausgeschlossen, um fehlende devDependencies-Fehler zu vermeiden

## [1.8.0] - 2026-02-27

### Hinzugefügt

- **Orchester-Sektion** - Neue Sektion mit Stimmgruppen, Besetzung und Nachbar-Präferenzen
- **Hybride Navigation** - Kontext-Seitenleiste mit verbesserter Navigationserfahrung
- **Bidirektionale Spond-Synchronisierung** - Anwesenheit zu und von Spond synchronisieren
- **Mitgliederverzeichnis** - Mitgliederliste mit M365-Profilfotos
- **Foto-Synchronisierung** - Profilfotos synchronisieren und in der UI anzeigen
- **WhatsApp-Integration** - Direkte WhatsApp-Nachrichten über Twilio
- **Automatische Sitzplatz-Benachrichtigungen** - Scheduler für automatische Benachrichtigungen
- **Drag-and-Drop-Sitzplatzeditor** - Visueller Editor für Sitzordnungen
- **Sitzplatz-Visualisierung** - Mitgliederanzahl und Stühle pro Reihe Anzeige

### Behoben

- Spond-Sync verwendet jetzt spond_member_id aus dem Anwesenheitsdatensatz
- Benutzername-Abfrage aus Datenbank statt JWT-Token
- Anwesenheitsstatus nach Mitgliedsname als Fallback abgleichen
- 'undefined undefined'-Namen bei Spond-Synchronisierung verhindern
- Auth-Token zu Foto-URLs für Browser-Anfragen hinzugefügt
- Besseres Logging für Foto-Sync-Debugging
- Abwesende Mitglieder zu Benachrichtigungen hinzugefügt
- Doppelte Navigationsabschnitte aus Übersetzungsdateien entfernt

## [1.7.0] - 2026-02-10

### Hinzugefügt

- **Ausrüstungs- und Uniformverwaltung** - Verwaltung von Instrumenten, Uniformen und Zubehör mit Mitgliederzuordnung
- **Konzertverwaltung** - Konzerte mit Datum, Ort und Repertoire planen
- **Buma/Stemra-Export** - Konzertprogramme für Urheberrechtsmeldung exportieren
- **MusicaInfo.net-Integration** - Metadaten und Schwierigkeitsgrade von Musikstücken suchen
- **Anwesenheitsübersicht** - Neuer Tab bei Proben mit Anwesenheitsübersicht
- **Sektionsansicht** - Musikstücke nach Orchestersektion anzeigen
- **Musikkommission-Notizen** - Interne Notizen für die Musikkommission zu Stücken
- **Konzertprogramme** - Programme für Konzerte erstellen
- **Visuelle Diagramme** - Diagramme zur Statistikseite hinzugefügt
- **Neue Instrumente** - Bariton, Euphonium und E-Bass hinzugefügt
- **Zusätzliche Instrument-Aliase** - Mehr Aliase für bestehende Instrumente

### Verbessert

- Verbesserte Fehlerbehandlung im Backend
- Erweiterte API-Dokumentation
- Musiklisten-Layout und PDF-Schaltflächen-Sichtbarkeit
- Navigationsleisten-Layout auf Desktop und Mobil
- WCAG 2.1 AA Barrierefreiheit-Verbesserungen

### Behoben

- Spond-Massensynchronisierung: Löscht veraltete Event-Verknüpfungen vor dem erneuten Abgleich
- Spond-Synchronisierung für Proben am selben Tag mit doppelter Anwesenheit

## [1.6.0] - 2026-02-07

### Hinzugefügt

- **PDF-Seitenvorschau** - Thumbnails aller Seiten beim Aufteilen sichtbar, mit einstellbarer Größe
- **PDF-Aufteilung mit Instrumentauswahl** - Instrument-Dropdown mit Stimmung und Notenschlüssel, automatische Nummerierung bei gleichem Instrument
- **PDF als Musikstück speichern** - Geteilte PDFs direkt als Musikstücke in der Bibliothek speichern
- **Alle herunterladen (zip)** - Alle geteilten Teile auf einmal als Zip-Datei herunterladen
- **Alle als Musikstücke speichern** - Alle geteilten Teile auf einmal in der Bibliothek speichern
- **Hamburger-Menü** - Responsives Navigationsmenü für mobile Geräte
- **Changelog-Seite** - Versionshistorie im Admin-Menü verfügbar
- **Feedback-Link** - Link zu GitHub Issues in der Fußzeile
- **Mehrsprachiges Changelog** - Changelog verfügbar in Niederländisch, Englisch und Deutsch

### Verbessert

- Backup verwendet jetzt originale Dateinamen statt UUID-Namen
- Dateinamen bei PDF-Aufteilung bewahren Leerzeichen innerhalb der Feldwerte

### Behoben

- PDF-Download-Authentifizierung funktioniert jetzt korrekt (Token als Query-Parameter)
- Lokaler PDF.js-Worker für bessere Kompatibilität
- Ergebnisse verschwinden nicht mehr nach dem Speichern als Musikstück

## [1.5.0] - 2026-02-05

### Hinzugefügt

- **Letzte Anmeldung sichtbar** - In der Mitgliederübersicht ist nun zu sehen, wann sich ein Benutzer zuletzt angemeldet hat
- **SMTP-Einstellungen über UI** - E-Mail-Einstellungen können nun über die Admin-Einstellungen konfiguriert werden, einschließlich Test-E-Mail-Funktion
- **Erweiterte Genre-Liste** - Genres durch erweiterte englische Liste mit 48 Genres ersetzt
- **Neue Instrumente** - Conductor, Altklarinette und Gesang hinzugefügt
- **Zusätzliche Instrument-Aliase** - Mehr Aliase für bestehende Instrumente (Baritonsaxophon, Horn, Schlagzeug, etc.)

### Behoben

- Löschen von Proben funktioniert jetzt zuverlässig (changes()-Timing-Fix)

## [1.4.0] - 2026-02-04

### Hinzugefügt

- **Microsoft 365 / Entra ID Anmeldung** - Benutzer können sich mit ihrem Microsoft 365-Konto anmelden
- **Spracherkennung** - Automatische Spracherkennung basierend auf Browsereinstellungen
- **Onboarding-Touren** - Geführte Touren für neue Benutzer je nach Rolle

### Behoben

- Metronom-Lautstärke-Fix (erster Klick genauso laut wie die anderen)
- Auto-Logout und Rate-Limiting-Verbesserungen

## [1.3.0] - 2026-02-03

### Hinzugefügt

- **Massenauswahl und Löschen** - Mehrere Musikstücke gleichzeitig auswählen und löschen
- **Neue Liste beim Hochladen** - Direkt eine neue Liste beim Hochladen erstellen
- **Dirigentenrolle** - Separate Rolle für Dirigenten mit Zugang zur Probenplanung

### Verbessert

- Orchestergruppierung auf der Meine-Musik-Seite
- Download .pdf_-Erweiterung behoben

## [1.2.0] - 2026-02-02

### Hinzugefügt

- **Theme-System** - Farben, Schriftart und Gestaltung pro Verein anpassbar
- **Konfigurierbares Logo und Name** - Vereinsname und Logo auf Anmeldebildschirm und Navigation
- **Probenplanung** - Proben planen mit Repertoire und Spond-Integration
- **MeineMusik-Akkordeon** - Stücke nach Titel gruppiert mit aufklappbaren Stimmen

## [1.1.0] - 2026-02-01

### Hinzugefügt

- **Backup und Wiederherstellung** - Vollständige Datenbank- und Datei-Sicherung/-Wiederherstellung
- **WCAG 2.1 AA Barrierefreiheit** - Verbesserte Barrierefreiheit für Screenreader
- **Mehrsprachigkeit** - Niederländisch, Englisch und Deutsch unterstützt

## [1.0.0] - 2026-01-15

### Erste Veröffentlichung

- Musikbibliothek-Verwaltung
- Benutzer- und Orchesterverwaltung
- PDF-Upload und -Verarbeitung
- Instrumente und Genres Verwaltung
- Ausleihverwaltung
- Statistiken
