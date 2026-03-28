# Changelog

Alle wichtigen Änderungen an dieser Anwendung werden hier dokumentiert.

## [1.8.1] - 2026-03-28

### Behoben
- **Trust-Proxy-Konfiguration** - Express `trust proxy`-Einstellung für Produktionsumgebungen hinter einem Reverse-Proxy (z.B. Render, Nginx) hinzugefügt, damit express-rate-limit korrekt mit X-Forwarded-For-Headern funktioniert

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
