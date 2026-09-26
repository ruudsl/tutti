# Changelog

Alle wichtigen Änderungen an dieser Anwendung werden hier dokumentiert.

## [Unveröffentlicht]

### Beim Aktualisieren beachten

- **Setzen Sie vor dem Aktualisieren ein `ENCRYPTION_SECRET`.** Gespeicherte Geheimnisse (SMTP-Passwort, Tokens von Anbindungen, MFA-Geheimnisse, Mollie-Schlüssel, das Spond-Passwort) werden jetzt mit einem eigenen Schlüssel verschlüsselt statt mit einem aus `JWT_SECRET` abgeleiteten. Erzeugen Sie einen mit `openssl rand -base64 48`; er muss sich von `JWT_SECRET` unterscheiden. Ohne ihn startet der Server in Produktion nicht, und die Migrationen brechen ab, bevor sie etwas ändern. Docker: in `.env` eintragen. Render: `render.yaml` erzeugt ihn für Dienste, die über den Blueprint laufen; ein von Hand angelegter Dienst braucht ihn im Dashboard.
- **Lassen Sie `JWT_SECRET` bei diesem ersten Update unverändert.** Die Migration braucht es einmal, um die bestehenden Werte zu lesen; danach kann es unabhängig gewechselt werden.
- **Bewahren Sie `ENCRYPTION_SECRET` zusammen mit den Sicherungen auf, aber nicht auf demselben Server.** Automatische Sicherungen und die Kopien vor einer Wiederherstellung werden jetzt ebenfalls damit verschlüsselt (`.sqlite.enc`). Entschlüsseln mit `npm run backup:ontsleutel --workspace=backend -- <Datei>`. Geht der Schlüssel verloren, lassen sich die Sicherungen nicht wiederherstellen, und Administratoren müssen ihre Anbindungen und Mitglieder ihre MFA neu einrichten.
- **Datenbankdatei und Sicherungen erhalten die Rechte 0600.** Eigene Skripte, die sie lesen, müssen unter demselben Benutzer laufen wie der Server.
- **Eigener Proxy oder CDN für das Frontend:** Die Sicherheits-Header (Content-Security-Policy, `Referrer-Policy: no-referrer` und weitere) stehen jetzt auch in `frontend/nginx.conf`, den Traefik-Labels und `vercel.json`. Wer `frontend/dist` anders ausliefert, übernimmt sie; siehe `docs/SELF_HOSTING.md`. Liegt die API unter einer anderen Adresse, gehört diese in `connect-src`.
- **Traefik:** Das Label `frameDeny` ist durch `customFrameOptionsValue=SAMEORIGIN` ersetzt. Der öffentliche Kalender lässt sich nicht mehr in einem iframe auf einer anderen Website anzeigen.
- **Das Zugriffsprotokoll von nginx** hat ein eigenes Format ohne Query-String und ohne Referer. Werkzeuge, die das Standardformat erwarten (fail2ban, GoAccess), müssen angepasst werden.
- **Mitglieder mit einem vorläufigen Passwort** aus der Aufnahme werden bei der nächsten Anmeldung zu ihrem Profil geleitet, um es zu ändern. Tutti speichert dieses vorläufige Passwort nicht mehr.
- **Ein Anmeldetoken in einer Adresse funktioniert nirgends mehr**, auch nicht bei Downloads (in 1.18.0 ging das bei GET noch). Eigene Skripte senden das Token im Header `Authorization`. Die Kalender-Feeds funktionieren unverändert.
- **Ein eigener SMTP-Server eines Vereins unter einer internen Adresse** (zum Beispiel ein Relay im Docker-Netzwerk) wird abgelehnt, beim Speichern und beim Versenden. Der SMTP-Server der Installation (`SMTP_*`) ist davon nicht betroffen.
- **Google Kalender verbinden** braucht `GOOGLE_CALENDAR_CLIENT_ID` und `GOOGLE_CALENDAR_CLIENT_SECRET` in der Umgebung der Installation sowie `<FRONTEND_URL>/api/calendar/google/callback` als Redirect-URI bei Google.
- **Das Zugriffsprotokoll von Traefik** speichert den Pfad nicht mehr.

### Hinzugefügt

- **Teilen an Tutti.** Teilen Sie auf einem Telefon oder Computer ein PDF mit Tutti (über **Teilen** in einer anderen App, mit Tutti als installierter App), liegt es auf der Upload-Seite bereit. Dort wählen Sie Orchester und Liste und laden es hoch. Wer noch nicht angemeldet ist, meldet sich zuerst an und kommt danach zurück. Die Teilen-Aktion stand bereits in der App-Beschreibung, endete aber immer mit einem Fehler.
- **Speicherlimit pro Verein.** Mit `STORAGE_QUOTA_BYTES` (und pro Abonnement `STORAGE_QUOTA_BYTES_FREE`, `_BASIC`, `_PRO`, `_ENTERPRISE`) gilt ein Limit für Noten, MP3s, MusicXML, Aufnahmen sowie Wiki- und Mailanhänge zusammen; ein Super-Admin kann pro Verein ein eigenes Limit setzen. Ein Upload, der nicht mehr passt, erhält eine klare Meldung und wird nicht gespeichert. Der Verwaltungsbereich des Dashboards zeigt die Nutzung im Verhältnis zum Limit. Ohne Einstellung gibt es kein Limit.
- **Der Download der Sicherung ist verschlüsselt**, sobald `ENCRYPTION_SECRET` gesetzt ist: eine `.zip.enc` im selben Format wie die automatischen Sicherungen. Die Wiederherstellung im Verwaltungsbildschirm akzeptiert sowohl `.zip.enc` als auch eine alte `.zip`, eine `.zip.enc` aber nur auf einer Installation mit demselben Schlüssel.

### Geändert

- **Nach zu vielen Fehlversuchen folgt eine Wartezeit statt einer Sperre.** Nach fünf Versuchen warten Sie pro E-Mail-Adresse und Gerät 1, 2, 4 und höchstens 15 Minuten; eine erfolgreiche Anmeldung setzt den Zähler zurück. Konten werden nicht mehr gesperrt, sodass niemand einen anderen aussperren kann. Falsche Codes der Zwei-Faktor-Authentifizierung zählen mit.
- **Abmelden beendet die Sitzung auch auf dem Server.** Andere Geräte bleiben angemeldet.
- **Passwörter haben überall mindestens 8 Zeichen.**
- **Die E-Mail bei _Passwort vergessen_** läuft über die Warteschlange und kann einige Sekunden später ankommen.
- **Mitglieder eines deaktivierten Vereins** kommen nicht mehr hinein; der Kalender-Feed eines ausgeschiedenen Mitglieds endet.
- **Wer ein vorläufiges Passwort hat** (aus der Aufnahme oder von einem Administrator, der das Mitglied anlegt oder ein Passwort für es setzt), wählt bei der nächsten Anmeldung ein eigenes Passwort und kann bis dahin nur sein Profil nutzen.
- **Google Kalender verbinden funktioniert**, wenn die Installation es eingerichtet hat (siehe _Beim Aktualisieren beachten_). Vorher meldete die Schaltfläche immer, es sei nicht eingerichtet.

### Behoben

#### Sicherheit

Aus der eigenen Sicherheitsprüfung im September:

- **Anmeldung:** Eine unbekannte und eine bekannte Adresse erhalten dieselbe Antwort, auch in der Dauer. Eine widerrufene Sitzung bleibt widerrufen, solange das Token gültig ist. Erreicht die Sitzungsprüfung die Datenbank nicht, wird die Anfrage abgelehnt statt durchgelassen.
- **Uploads:** Ein Zip mit Noten wird nach seiner entpackten Größe begrenzt, vor und während des Entpackens. Das Zusammenfügen von PDFs hat eine Grenze für Anzahl und Umfang der Dateien.
- **Eigene Felder:** Ein Prüfmuster, das den Server lange beschäftigen würde, wird nach kurzer Zeit abgebrochen; ein ungültiges Muster wird beim Speichern abgelehnt.
- **Eingegebene Namen** werden im Druckfenster eines Tickets und im HTML von E-Mails sicher dargestellt.
- **Keine Geheimnisse im Protokoll:** Passwörter, Tokens und Schlüssel werden auch in verschachtelten Feldern maskiert, im Protokoll und in Sentry, und E-Mail-Adressen werden gekürzt. Tokens in Adressen und der Referer gelangen nicht mehr ins Anfrageprotokoll.
- **Sicherheits-Header** kommen jetzt auch mit den Seiten des Frontends, nicht nur mit der API.
- **Adressen, die der Server selbst aufruft** (Webhooks), werden strenger geprüft, auch in IPv6-Formen, und die Verbindung geht genau an die geprüfte Adresse.
- **Geheimnisse von Anbindungen** werden verschlüsselt gespeichert, und die Einstellungsseiten zeigen keine Zeichen eines Tokens mehr.
- **MP3s** werden mit einem kurzlebigen Token abgespielt, das nur für diese eine Datei gilt, statt mit dem Anmeldetoken in der Adresse.
- **Die Wartezeit nach Fehlversuchen** übersteht einen Neustart. Dafür wird keine E-Mail- oder IP-Adresse lesbar gespeichert.
- **Der SMTP-Server eines Vereins** wird genau unter der geprüften Adresse verbunden.
- **Die Webhook-Adresse der Aufstellungsbenachrichtigungen** wird verschlüsselt gespeichert und nicht mehr an den Browser gesendet.
- **Namen und Text in Benachrichtigungs-E-Mails, Umfrage-Erinnerungen, Workflows und E-Mail-Kampagnen** werden sicher ins HTML gesetzt.

#### DSGVO

- **Das Löschen eines Mitglieds** entfernt jetzt auch Profilfoto, Telefonnummern, Benachrichtigungskanäle und die Verbindung mit Google Kalender (die bei Google widerrufen wird). Im Audit-Protokoll werden Name und E-Mail-Adresse ersetzt; die Einträge selbst bleiben.
- **Das vorläufige Passwort eines neuen Mitglieds** wird nicht mehr gespeichert; es erscheint nur in der Antwort beim Anlegen. Bereits gespeicherte Passwörter werden gelöscht.

## [1.18.0] - 2026-09-24

Ein Monat mit zwei Dingen, von denen der Vorstand sofort etwas hat, und viel Arbeit unter der Haube. Daten, die heute noch in Excel stehen, lassen sich ohne Abtippen übernehmen, und Kartengeld landet auf dem Konto des Vereins selbst. Dazu kommen eine eigene Sicherheitsprüfung, eine Warteschlange für Hintergrundarbeit, die einen Neustart übersteht, und ein Zeitlimit für jeden Aufruf an einen externen Dienst. Unterwegs stellte sich heraus, dass die Seite Ausrüstung in keinem Punkt funktionierte; jetzt tut sie es.

### Beim Aktualisieren beachten

Für alle, die Tutti selbst installieren und betreiben:

- **Der Server startet in der Produktion nicht mehr mit einem schwachen `JWT_SECRET`.** Neben einem fehlenden oder zu kurzen Geheimnis werden jetzt auch die Beispielwerte aus der Dokumentation und eintönige Werte abgelehnt; die Beispieldateien lassen das Feld künftig leer. Erzeugen Sie ein zufälliges Geheimnis, zum Beispiel mit `openssl rand -base64 48`. Auf Render wird das Geheimnis erzeugt; dort ist nichts zu tun.
- **Die Anmeldung mit Microsoft braucht die Tenant-ID der eigenen Organisation.** Steht der Tenant auf `common`, `organizations` oder `consumers`, gilt die Microsoft-Anmeldung als nicht eingerichtet. Tragen Sie die eigene Tenant-ID ein.
- **Ein vollständiges Anmeldetoken in der URL funktioniert nur noch bei Downloads** (GET- und HEAD-Anfragen). Eigene Skripte, die für etwas anderes ein Token in der URL mitgeben, müssen es im Header `Authorization` senden.
- **Kartengeld geht auf das eigene Mollie-Konto** jedes Vereins, der in den Zahlungseinstellungen (**Zahlungen**) einen eigenen Schlüssel eingetragen und verbunden hat; siehe _Hinzugefügt_. Vereine ohne eigenen Schlüssel bleiben beim Konto der Installation. Lässt sich ein gespeicherter Schlüssel nicht mehr entschlüsseln, fällt Tutti bewusst nicht auf das Konto der Installation zurück; tragen Sie den Schlüssel dann erneut ein.
- **Docker-Installationen:** Der Backend-Port lauscht in beiden Compose-Dateien nur noch auf `127.0.0.1`; Besucher kommen über nginx oder Traefik herein. Diese leiten jetzt auch `/socket.io` an das Backend weiter. Wer eine eigene Proxy-Konfiguration verwendet, muss das ebenfalls tun, sonst werden Chat und Benachrichtigungen nicht live aktualisiert. Liegt vor diesem Proxy noch eine weitere Schicht, setzen Sie `TRUST_PROXY` auf die Anzahl der Proxys.
- **Genres und Instrumente unterscheiden sich jetzt pro Verein.** Die bestehenden Genres und Instrumente sind die Standardliste für alle Vereine; sie ändert jetzt nur noch der Superadministrator. Wer ein Standardgenre oder -instrument ändern oder entfernen möchte, blendet es aus und legt ein eigenes an; siehe _Hinzugefügt_. Was bereits damit verknüpft ist — Mitglieder, Stimmen, Titel — bleibt, wie es ist.

### Hinzugefügt

- **Aus einer Tabelle importieren.** Unter **Verwaltung → Importieren** lesen Sie Mitglieder, die Notenbibliothek, Instrumente im Besitz, Kontakte, Uniformen und Ausrüstung ein. Sie sehen zuerst, was mit jeder Zeile geschehen wird — neu, bereits vorhanden oder ein Fehler mit Begründung — und nichts ändert sich, bis Sie auf Importieren klicken.
  - Speichern Sie das Arbeitsblatt als CSV (in Excel: _Speichern unter → CSV_); eine .xlsx-Datei selbst wird nicht gelesen. Spaltennamen dürfen niederländisch, englisch oder deutsch sein, für jede Art gibt es eine Beispieldatei zum Herunterladen, und eine CSV, wie Excel unter Windows sie speichert, wird richtig gelesen. Auch der Repertoire-Export von Tutti selbst lässt sich wieder einlesen.
  - Mit dem Häkchen **Vorhandene Daten aktualisieren** erhält eine bereits vorhandene Zeile das, was in der Datei anders ist; die Vorschau zeigt pro Feld alt → neu. Eine leere Zelle löscht nichts, und ein Wert, der sich nicht lesen lässt, lässt den alten stehen. Bei Mitgliedern werden nur Name und private E-Mail-Adresse aktualisiert, nie die Rolle. Uniformen machen nicht mit: Ein Teil hat keine Nummer, an der man es erkennen könnte.
  - Importierte Mitglieder erhalten keine E-Mail und kein Passwort. Sie legen selbst eines über _Passwort vergessen?_ fest, oder der Administrator verschickt Einladungen, sobald der Verein so weit ist. Die Mitgliedergrenze des Abonnements gilt auch hier.
  - Importieren darf, wer die Daten auch auf der normalen Seite verwaltet: Mitglieder nur der Administrator; die Notenbibliothek und Kontakte auch die Musikkommission; Instrumente und Ausrüstung auch der Materialausschuss (unter _Inventar_); Uniformen auch die Uniformkommission. Ist das Modul Inventar oder Kontakte ausgeschaltet, verschwinden diese Arten auch aus dem Import.
- **Kartengeld auf das eigene Konto.** In den Zahlungseinstellungen konnte ein Verein schon einen eigenen Mollie-Schlüssel eintragen, doch der Kartenverkauf nutzte nur den der Installation. Mit mehreren Vereinen auf einer Installation landete so das gesamte Kartengeld auf einem Konto. Jetzt laufen Bezahlen, Zahlungsstatus und Rückerstattung über das Konto des Vereins selbst, im gewählten Modus (live oder Test).
- **Hintergrundaufgaben, die einen Neustart überstehen.** Die Benachrichtigungen zur Aufstellung, das erneute Weiterleiten von E-Mails, die DSGVO-Bereinigung, die Sicherung und das Aufräumen temporärer Dateien liefen jeweils in einer eigenen Schleife im Arbeitsspeicher des Servers. Jedes Update ist ein Neustart, und der warf laufende Arbeit spurlos weg; eine fehlgeschlagene Sicherung stand nur im Protokoll. Diese Arbeit steht jetzt in einer Warteschlange in der Datenbank: Sie läuft nach einem Neustart weiter, läuft nie doppelt, und was fehlschlägt, bleibt sichtbar. Arbeit, die sich gefahrlos wiederholen lässt, bekommt automatisch neue Versuche; was womöglich schon verschickt wurde, nicht.
  - Der Super-Administrator hat einen neuen Reiter **Hintergrundaufgaben**. Er öffnet mit den fehlgeschlagenen Aufgaben, zeigt zu jeder den letzten Fehler und hat eine Schaltfläche **Erneut versuchen**.
- **Eigene Genres und Instrumente.** Ein Verein legt Genres und Instrumente an, die nur er sieht, und blendet Standardeinträge aus, die er nicht verwendet; diese erscheinen dann nicht mehr in seinen Auswahllisten. Zwei Vereine können jeweils ein eigenes Genre mit demselben Namen haben. Dafür gibt es unter **Bibliothek** eine neue Seite **Instrumente**; die Seite **Genres** zeigt, was Standard ist und was eigen. Das Zuordnen einer Stimme oder eines Mitglieds zu einem Instrument über den Namen, beim Hochladen und beim Importieren, berücksichtigt nur, was der Verein sieht.

### Geändert

- **Eine Störung bei einem externen Dienst hält Tutti nicht mehr fest.** Tutti spricht unter anderem mit Mollie, Stripe, Microsoft 365, Google, Spond, Telegram, WhatsApp und IMSLP. Ein Teil dieser Aufrufe hatte kein Zeitlimit, auch die Zahlungen nicht: Ein hängender Zahlungsdienst hielt einen Käufer an der Kasse fest, bis er aufgab. Jetzt hat jeder Aufruf ein Limit, ein kurzer Aussetzer wird automatisch wiederholt, und ein Dienst, der wirklich ausgefallen ist, wird eine Zeit lang übersprungen, statt bei jedem Mitglied erneut die volle Wartezeit zu kosten.
  - Etwas anlegen oder verschicken — eine Zahlung, eine Rückerstattung, eine Nachricht, einen Kalendertermin, ein Microsoft-Konto — geschieht nie zweimal. Nach einer Zeitüberschreitung weiß niemand, ob der erste Versuch nicht doch angekommen ist.
  - Ist ein Dienst ausgefallen, erscheint „später erneut versuchen“ statt „Interner Serverfehler“, als wäre Tutti selbst kaputt.
  - Die ausführliche Zustandsprüfung der Installation zeigt pro externem Dienst, ob er gerade übersprungen wird — die Antwort auf „warum kommen meine Benachrichtigungen nicht an“.
- **Der Anmeldebildschirm steht schneller da.** Wo früher ein weißer Bildschirm stand, bis alles geladen war, erscheint jetzt sofort das Logo, und von den niederländischen Texten bekommt der Anmeldebildschirm nur, was er braucht; der Rest folgt danach. Das Paket, das der Browser zuerst holt, ging von 96 auf 39 KB zurück, und der Leistungswert auf der Messmaschine der Build-Pipeline stieg von 84 auf rund 90.
- **Journal und Rechnungen in der Buchhaltung seitenweise.** Beide holten alles, was ein Verein je gebucht hatte, und das wird jede Saison mehr. Jetzt kommen sie in Seiten zu 25, mit Schaltflächen zum Blättern. Die Zählungen auf der Übersicht — die Zahl der Buchungen und die offenen Rechnungen — kommen vom Server, sodass sie alles umfassen und nicht nur die Seite, die Sie gerade sehen. Wer das Geschäftsjahr wechselt, landet wieder auf Seite 1; vorher konnte man auf Seite 3 eines Jahres mit nur einer Seite stehen bleiben und auf eine leere Liste schauen. Die Liste der Kontoauszüge hat dieselbe Begrenzung bekommen.
- **Der Infobildschirm zeigt nur Nachrichten für alle.** Eine Nachricht, die für eine bestimmte Zielgruppe gedacht ist, erscheint nicht mehr auf dem öffentlichen Infobildschirm.
- **Zwei geplante Funktionen, die nie von selbst liefen, wurden entfernt.** Die wöchentliche Zusammenfassung per E-Mail war gebaut, wurde aber nirgends gestartet und kam nie bei einem Mitglied an; sie einzuschalten hätte den Mitgliedern eine ungefragte wöchentliche E-Mail geschickt. Dasselbe galt für Workflows mit dem Trigger _Nach Zeitplan_ oder _Bei Datumsfeld_: Sie lösten nie von selbst aus. Bei einem neuen Trigger werden sie nicht mehr angeboten; bestehende Trigger dieser Art bleiben sichtbar und bearbeitbar, mit dem Hinweis, dass sie nicht von selbst auslösen.
- **Wer externe Kontakte sieht, hängt von der Rolle ab.** Administrator und Vorstand sehen alles. Die Ausschüsse und der Dirigent sehen die Kontakte, aber nicht die Bankdaten, die Handelsregister- und USt-Nummer und die Notizen. Normale Mitglieder sehen die Kontakte nicht mehr; der Menüpunkt verschwindet für sie.

### Behoben

#### Sicherheit

Aus einer eigenen Sicherheitsprüfung. Zu jedem Punkt gibt es einen Test, der mit dem alten Code fehlschlug.

- **Rollen.** Ein Administrator konnte über eine Einladung mehr Rechte vergeben, als er selbst hatte — das geht nicht mehr, und beim Annehmen der Einladung wird es erneut geprüft. Nach dem Entfernen aus einem Verein oder einer Rollenänderung stimmt die Rolle eines Mitglieds sofort.
- **Sitzungen.** Ändert ein Administrator die Rolle oder das Passwort eines Mitglieds, wird dieses Mitglied überall abgemeldet. Ein entferntes oder inaktives Mitglied kommt mit einer noch offenen Sitzung nicht mehr hinein. Auch die Live-Verbindung für Chat und Benachrichtigungen prüft jetzt, ob eine Sitzung noch besteht; nach dem Abmelden oder einer Passwortänderung konnte diese Verbindung weiterlaufen.
- **Die Anmeldung mit Microsoft** wird strenger gegen die eigene Organisation geprüft. Ein Konto wird nur noch automatisch mit einem Mitglied verknüpft, wenn es nachweislich zu dieser Organisation gehört, und ein inaktives Mitglied kommt nicht hinein.
- **Die Vereinsgrenze.** Workflows, geteilte Anmerkungen in Noten, das Verleihen und Ausgeben von Uniformen, Ausrüstung und Instrumenten sowie die Repertoirestatistik bleiben jetzt innerhalb des eigenen Vereins; verliehen werden kann nur an ein Mitglied des eigenen Vereins. E-Mails — auch aus Workflows — gehen nur über den Mailserver des eigenen Vereins oder den der Installation, nie über den eines anderen Vereins.
- **Zahlungen.** Eine Zahlungsbestätigung von Mollie wird nur noch der Bestellung zugeordnet, für die die Zahlung angelegt wurde, und der Betrag muss stimmen.
- **Adressen, die der Server selbst aufruft.** Eine Webhook-Adresse (bei den Benachrichtigungen zur Aufstellung und in Workflows) und der Mailserver beim SMTP-Test dürfen nicht auf das interne Netz des Servers zeigen. Der Import aus OneDrive holt Dateien nur noch bei Microsoft selbst.
- **Die IP-Freigabeliste für den Verwaltungsbildschirm** und die Prüfung auf verdächtige Kartenbestellungen bestimmen die Adresse des Besuchers jetzt auf dieselbe zuverlässige Weise wie der Rest der Anwendung.
- **Logos und Profilfotos.** Der Dateityp wird am Inhalt bestimmt, nicht am Namen, und die Dateien werden so ausgeliefert, dass ein Browser nichts anderes damit tun kann, als sie anzuzeigen.
- **Die Übersicht aller Vereine und das Anlegen eines neuen Vereins** sind dem Super-Administrator vorbehalten.
- Pfade hochgeladener Dateien und Zeilen im Protokoll werden strenger geprüft, nach Meldungen aus dem Code-Scanning.

#### Dinge, die nicht funktionierten

- **Die Seite Ausrüstung funktionierte in keinem Punkt.** Anlegen ergab eine Fehlermeldung, die Liste blieb immer leer, und Bearbeiten, Verleihen, Wartung und das Erfassen von Schäden riefen Funktionen auf, die es auf dem Server nicht gab. Seite und Server sprachen zwei verschiedene Sprachen, und die Tests merkten es nicht, weil sie den Server nachahmten. Jetzt folgt die Seite dem, was der Server kennt: Art, Status, Zustand, Kategorie, Inventarnummer, Marke und Modell, Standort und ob etwas verleihbar ist. Den Entleiher wählen Sie aus der Mitgliederliste, statt eine Nummer einzutippen, und die Warnung vor überfälliger Wartung ergibt sich aus dem Datum der nächsten Wartung. Ein neuer Test vergleicht künftig jeden Aufruf der Seite mit dem, was der Server tatsächlich anbietet.
- **Das Hochladen eines Zip-Archivs mit Noten schlug immer fehl**: Bildschirm und Server verwendeten einen anderen Namen für die Datei. Außerdem hielt das Entpacken eines großen Archivs den ganzen Server bis zu fast zwei Sekunden fest, sodass so lange niemand sonst eine Antwort bekam, und eine Datei, deren Titel nicht in die Datenbank kam, blieb unauffindbar auf der Festplatte liegen. Alle drei sind behoben.
- **Echtzeit funktionierte in den Docker-Installationen nicht.** Chat, Benachrichtigungen und die Aufstellung wurden nur live aktualisiert, wenn der Browser auf dem Server selbst lief (siehe _Beim Aktualisieren beachten_).
- **Benachrichtigungen über Telegram und WhatsApp pro Verein.** Ein Mitglied sah Telegram als verfügbar, sobald irgendein Verein auf der Installation einen Bot eingerichtet hatte, und das Verknüpfen scheiterte danach. Welche Kanäle verfügbar sind, hängt jetzt vom eigenen Verein ab.
- **Das Weiterleiten von E-Mails beim Anlegen eines neuen Mitglieds in Microsoft 365** wurde übersprungen, wenn Microsoft eine Fehlerseite statt einer normalen Antwort zurückgab. Das Anlegen und die Mitgliedersynchronisation mit Microsoft nutzen jetzt dieselben, reparierten Hilfsfunktionen.
- **Stripe:** Der Status einer Zahlung wurde stillschweigend nicht abgerufen, wenn Stripe eine lange Zahlungskennung verwendete.
- **Bei jedem Neustart verschwanden Genres, die nicht in der Standardliste standen**, samt ihrer Verknüpfung mit den Titeln. Ein Genre, das ein Administrator angelegt hatte, bestand also nur bis zum nächsten Update. Der Start ergänzt die Standardliste jetzt nur noch.

#### DSGVO

- **Ein Mitglied, das sich nicht löschen ließ, blockierte das Löschen aller Mitglieder.** Die DSGVO-Bereinigung löschte Mitglieder, die lange genug entfernt sind, auf einen Schlag. Verwies noch etwas auf eines von ihnen — eine Chatnachricht oder eine Rechnung oder Buchung, die es angelegt hatte —, wurde auf der ganzen Installation niemand gelöscht, und das stand nur im Protokoll. Jetzt geht es Mitglied für Mitglied: Wer sich nicht löschen lässt, bleibt stehen und wird im Protokoll genannt, der Rest wird gelöscht. Dasselbe gilt für die Aufbewahrungsfristen pro Verein und für die manuelle Bereinigung. Was mit den Chatnachrichten und Buchungen eines solchen Mitglieds geschehen soll, ist eine Entscheidung für den Vorstand (siehe `docs/PIA.md`).

#### Weiteres

- Wer sich zweimal als Mitfahrer für dieselbe Fahrt anmeldete, stand zweimal darauf und belegte zwei Plätze.
- Drei Meldungen gab es nur auf Niederländisch: beim Herunterladen eines Plakats, beim Speichern einer Setlist und am Ende einer Übungssitzung. Sie sind jetzt übersetzt, und auf Niederländisch heißt es „1 minuut“ statt „1 minuten“.

### Technisch

- **Vitest 5** für beide Testsuiten, zusammen mit der Abdeckungsmessung; **React 19**, mit react und react-dom in einem Schritt aktualisiert. Außerdem unter anderem archiver 8 (Sicherungen und Zip-Downloads an den neuen Aufruf angepasst), multer, helmet, i18next, axios und react-dropzone aktualisiert. jsdom ist vorübergehend auf 30.0.1 festgelegt, weil 30.1.0 in der Testumgebung einen Fehler hat; TypeScript 7 wartet, bis typescript-eslint es unterstützt.
- Der Lighthouse-Schwellenwert in CI steigt von 80 auf 86.
- Zwei Tests, die vom Datum oder von der Geschwindigkeit der Maschine abhingen, sind davon gelöst.
- Absprachen und Anleitungen für alle, die an Tutti arbeiten, festgehalten (`CLAUDE.md`, `docs/VEERKRACHT.md`, `docs/ACHTERGRONDTAKEN.md`, `docs/IMPORTEREN.md`).

## [1.17.0] - 2026-08-24

### Hinzugefügt

- **Die Spond-Anbindung ist jetzt ein Modul.** Unter **Verwaltung → Module** steht sie bei _Planung_ und lässt sich mit einem Schalter ein- oder ausschalten, wie die anderen neunzehn Teile. Vereine, die kein Spond nutzen — die große Mehrheit — sehen die Anbindung auf dem Probenbildschirm nicht mehr.
  - Wer Spond heute nutzt, merkt nichts: Für diese Vereine ist das Modul eingeschaltet. Ausschalten verbirgt die Anbindung und löscht nichts — die Einstellungen, die verknüpften Mitglieder und die abgerufenen Proben bleiben erhalten und kommen beim Einschalten unverändert zurück.
  - Was _nicht_ mit dem Modul verschwindet, ist die eigene Anwesenheit. Sich für eine Probe an- oder abmelden funktioniert auch bei ausgeschaltetem Spond; nur das Weiterleiten an Spond entfällt, weil es dann keine Anbindung gibt, an die etwas weitergeleitet werden könnte.

## [1.16.0] - 2026-08-24

Eine Leistungsrunde, die unterwegs zwei seit Langem bestehende Probleme fand. Die Anwendung ist beim ersten Öffnen mehr als dreimal so leicht geworden, der Service Worker tat überhaupt nichts, und der Browser-Tab zeigte auf fast jeder Seite einen technischen Schlüssel statt eines Titels.

### Behoben

- **Die App ließ sich nie als App installieren und funktionierte nie offline.** Die Registrierung des Service Workers scheiterte jedes Mal. `offline.html` stand zweimal in der Precache-Liste, mit zwei verschiedenen Revisionen, und das lehnt Workbox ab — bereits beim Einlesen des Skripts, also bevor überhaupt etwas installiert werden konnte. Die Folge: keine Offline-Nutzung, keine Offline-Noten, keine Hintergrundbenachrichtigungen und keine Installation auf dem Startbildschirm. Der Fehler stand in der Konsole und alles andere lief weiter, deshalb fiel es niemandem auf.
- **Der Browser-Tab zeigte `pageTitle.dashboard`.** Von den 65 Seitentiteln existierten 61 in keiner einzigen Sprache, sodass der technische Schlüssel selbst im Tab landete — und damit auch in Lesezeichen und im Verlauf. Alle 61 sind jetzt vorhanden, auf Niederländisch, Englisch und Deutsch. Die Seite Instrumentenverwaltung hatte zudem für alle einen festen niederländischen Titel; auch der ist jetzt übersetzt.

### Geändert

- **Das Öffnen der Anwendung ist mehr als dreimal so leicht.** Was der Browser bei einem ersten Besuch holen und verarbeiten muss, bevor etwas auf dem Bildschirm steht, ging von 905 KB auf 296 KB zurück. Der Lighthouse-Leistungswert stieg damit von 79 auf 84 auf der Messmaschine der Build-Pipeline (auf einer schnelleren Maschine von 79 auf 91 — die Zahl hängt davon ab, wo gemessen wird).
  - **Die englischen und deutschen Texte werden nicht mehr mitgeschickt** an alle, die die Anwendung auf Niederländisch nutzen. Das waren 610 KB, die niemand anrührte. Wer die Sprache wechselt, holt die passende Datei in diesem Moment.
  - **Das angemeldete Menü wird erst nach der Anmeldung geholt.** Suchleiste, Benachrichtigungen, Schnellaktionen, Brotkrumenpfad und der Offline-Speicher steckten alle in dem Paket, das jemand auf dem Anmeldebildschirm bekam.
  - **Die Gestaltung steht jetzt in der Seite selbst** statt in einer separaten Datei, die das Zeichnen aufhielt.

### Hinzugefügt

- **Zwei Prüfungen, die diese Fehler künftig abfangen.** Die Leistungsmessung in CI prüft jetzt auch die Precache-Liste des Service Workers, und ein neuer Test wacht darüber, dass jeder Seitentitel in allen drei Sprachen existiert.

## [1.15.0] - 2026-08-23

Eine große Wartungsrunde. Die Testabdeckung stieg serverseitig von 12,9 % auf 83,4 % und auf der Bildschirmseite von 6,9 % auf 81,6 %, und dabei kamen weit über hundert echte Fehler zum Vorschein. Fast keiner davon machte einen Test rot: Es waren Funktionen, die stillschweigend nichts taten, Daten, die über die Vereinsgrenze hinweg sichtbar wurden, und Meldungen, die das Gegenteil dessen sagten, was geschehen war.

### Hinzugefügt

- **Noten zwischen Vereinen teilen** — Verknüpfungscodes, ein gemeinsamer Katalog, Teilen pro Titel, Anfragen nach Dateien und Aufrufe. Mit eigenem Bildschirm.
- **Jeder Verein sein eigener Anmeldelink** — Die Anmeldung über Microsoft hing am zuerst angelegten Verein; jeder Verein hat jetzt seinen eigenen Weg hinein.
- **Partnerschaften tun jetzt etwas** — Anfragen ist möglich, und eine angenommene Partnerschaft hat Folgen, statt nur ein Eintrag zu sein.
- **Die Sichtbarkeitseinstellungen tun jetzt etwas** — Was ein Mitglied unter Datenschutz abschaltet, ist tatsächlich nicht mehr zu sehen.
- **Eine Probe mit einem Projekt verknüpfen** — Die Schaltfläche gab es, aber serverseitig fehlte das Gegenstück; jetzt funktioniert sie.
- **Offline scannen an der Tür** — Die beiden fehlenden Routen sind da, ein Scanner ohne Verbindung funktioniert also wirklich.
- **Sieben Routen, die der Bildschirm aufrief, die es aber nicht gab.**
- **Ein gemeinsamer Seitenaufbau** — Alle Seiten nutzen denselben Kopf, mit Gestaltung für Formulare und Reiter, die vorher schlicht fehlte.

### Geändert

- **Eine api-Schicht statt zwei** — `src/api.ts` überdeckte den Ordner `src/api/` daneben, wodurch dieser Ordner jahrelang unerreichbar war. Diese Datei mit 4.149 Zeilen ist aufgelöst; alles läuft jetzt über einen Weg, samt Behandlung einer abgelaufenen Sitzung.
- **Alle CSV-Exporte laufen über ein gemeinsames Hilfsmittel**, mit Schutz gegen Formeln und gegen verrutschende Spalten.
- **Abo-Grenzen sind echte Grenzen** — `max_members` und `max_orchestras` wurden festgehalten, aber nirgends durchgesetzt.

### Behoben

#### Daten, die nicht Ihnen gehörten

- Ein Vereinsadministrator konnte eine Sicherung der gesamten Installation herunterladen, und das Manifest konnte außerhalb des Upload-Ordners schreiben.
- Jeder Administrator sah das Protokoll _aller_ Vereine; der Sektions-Chat eines anderen Vereins blieb nach dem Wechsel stehen; und eine zwischengespeicherte Antwort konnte bei einem anderen Mitglied landen.
- Jedes Mitglied konnte eine Vorschau jeder PDF abrufen, auch von Noten ohne Zugriffsrecht.
- Ein neues Mitglied konnte im Orchester eines anderen Vereins landen, und eine Aufgabe konnte jemandem aus einem anderen Verein zugewiesen werden.
- Kategorien, Aufgabenlisten, Kommentare, Meldungen und das Zielorchester einer Umfrage ließen sich alle fünf über die Vereinsgrenze hinweg wählen.
- Das Abmelden löschte den Offline-Speicher nicht. Auf einem geteilten Tablet sah die nächste Person die Daten des vorherigen Vereins, samt der noch nicht gesendeten Synchronisationswarteschlange. Die Schaltfläche „alles löschen“ ließ denselben Speicher ebenfalls stehen und meldete trotzdem, er sei geleert.

#### Dinge, die nie funktioniert haben

- Der Versand einer E-Mail-Kampagne schlug immer fehl. Eine leere Empfängerliste bedeutete zudem _alle_, während die Vorschau null Empfänger zeigte.
- Ein Mitglied als Mitfahrer für eine Fahrt anzumelden führte immer zu einem Fehler.
- Aufgaben aus einem Workflow anzulegen funktionierte in keinem einzigen Workflow, aus zwei voneinander unabhängigen Gründen zugleich.
- Der DSGVO-Export und die Löschung nach Artikel 17 und 20 waren nicht erreichbar.
- Der öffentliche Kalender, der Infobildschirm, das Übertragen einer Karte, Rabatte im Kartenverkauf und die Anwesenheitsübersicht pro Orchester waren alle fünf defekt.
- Die Bereinigung und die Wochenzusammenfassung liefen nicht mehr.
- Die Bühnenaufstellung eines Konzerts ließ sich überhaupt nicht bedienen: Ein Mitglied auf einen Platz zu setzen war weder mit Maus noch mit Tastatur möglich.
- Alle Kanäle in den Benachrichtigungseinstellungen abzuschalten bewirkte nichts.

#### Falsche Beträge und Zahlen

- Ein SEPA-Lastschriftauftrag wurde als Überweisung angelegt und zahlte aus, statt einzuziehen.
- Der Rechnungsbetrag lag neun Prozent über dem tatsächlich gezahlten.
- Die Auswertungen ignorierten das gewählte Geschäftsjahr: Wer 2025 wählte, sah die Bilanz von 2026, während die exportierte Datei sehr wohl 2025 enthielt.
- Die Verkaufszeit von Karten verschob sich mit der Zeitzone.
- Zwölf Funktionen in der Buchhaltung waren defekt, und acht Abfragen verwiesen auf Spalten, die es nicht gibt.

#### Meldungen, die nicht stimmten

- Eine Nachrichtenübersicht ließ für gewöhnliche Mitglieder jeden heute veröffentlichten Beitrag weg, bis Mitternacht. Über einen direkten Link war er lesbar, daher fiel es nicht auf.
- Auf sieben Seiten sah eine fehlgeschlagene Abfrage genauso aus wie eine leere Liste — samt der Einladung, den ersten Eintrag anzulegen.
- Eine Spond-Synchronisation während einer Störung löschte alle Verknüpfungen und meldete Erfolg. Danach sagte die Anwendung weiterhin „du bist angemeldet“, während in Spond nichts geschah.
- Der Anmeldebildschirm bot eine Reparaturschaltfläche für die E-Mail-Weiterleitung an, die gar nicht gelingen konnte.
- Bei einer Störung ließ der Kartenscanner das grüne Häkchen des _vorherigen_ Gastes stehen.
- Ein Microsoft-Konto ohne Anzeigenamen setzte die gesamte Mitgliedersynchronisation zurück und zerstörte bildschirmseitig die Suche.

#### Barrierefreiheit

- 274 Formularbeschriftungen waren nicht mit ihrem Feld verknüpft. Für einen Screenreader waren das namenlose Felder; ein Klick auf die Beschriftung bewirkte nichts. Drei stehen noch offen, jede mit Begründung.
- Ein abgelehntes Feld ist jetzt auch für einen Screenreader abgelehnt, und die Ablagefläche für Dateien lässt sich per Tastatur bedienen.
- Fest eingetragene weiße Flächen, die im dunklen Thema unlesbar waren, sind verschwunden.
- Die Kontaktauswahl war per Tastatur nicht erreichbar.
- Über 250 fehlende Übersetzungsschlüssel ergänzt, mit einem Wächtertest, der den nächsten findet.

#### Außerdem

- Dateinamen mit Akzent oder Umlaut überstehen jetzt die Kopfzeile; vorher gab das einen Fehler.
- Ein Brotkrümel verwies auf eine Seite, die es nicht gibt, und landete damit auf „nicht gefunden“.
- Ein Fehler auf einer Seite blieb auf jeder danach geöffneten Seite stehen.
- Jeder Tastenanschlag in einem Suchfeld löste auf drei Seiten eine eigene Abfrage aus; und das Suchfeld der Gästeliste verschwand unter dem Cursor.
- Ein Streaming-Link wurde ohne Prüfung gespeichert und als anklickbarer Verweis dargestellt.
- Das Stimmgerät ließ das Mikrofon nach einer Fehlermeldung eingeschaltet.
- Eine PDF ohne Seiten zeigte „0 / 0“ und einen leeren Bildschirm; die Anmerkungsebene saß bei Vergrößerung falsch; und das Verlassen eines Instruments hinterließ eine Lücke in der Stimmen-Nummerierung.
- Die Ratenbegrenzung legte während der Entwicklung den ganzen Bildschirm lahm.
- Jedes Dialogfenster stand durch eine Seitenanimation schief.

### Technisch

- **Testabdeckung**: Backend 12,9 % → 83,4 %, Frontend 6,9 % → 81,6 % (Statements). 6.251 bzw. 6.189 Tests über 180 bzw. 276 Dateien. Die CI-Schwellen liegen knapp darunter, damit ein Rückfall auffällt.
- **Die früheren Zahlen stimmten nicht**: Ohne `include` in den Messeinstellungen zählten nur Dateien, die ein Test zufällig lud. Dateien, die kein Test berührte, fielen aus dem Nenner heraus, statt als null zu zählen.
- **Die großen Seiten wurden aufgeteilt**, jede zuvor mit einem Charakterisierungstest als Sicherheitsnetz.
- **Docker-Images** werden bei jedem Merge nach `main` veröffentlicht, und eine Staging-Bereitstellung steht bereit, die nach erfolgreicher CI von selbst läuft und einen Rauchtest durchführt.
- **Zwei Wächtertests** fangen eine ganze Fehlerklasse ab statt eines Einzelfalls: ein wörtlicher Pfad unterhalb eines Parameterpfads (das kam fünfmal vor) und Standardwerte in Änderungsschemata.
- Die Backend-Suite läuft parallel: von 19m35s auf 7m52s.
- Meldungen aus Code Scanning und Secret Scanning abgearbeitet; SQL-Injection über einen Sprachparameter und ein Bot-Token in den Logzeilen behoben.

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
