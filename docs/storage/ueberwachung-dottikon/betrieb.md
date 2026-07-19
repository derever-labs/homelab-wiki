---
title: Videoüberwachung Betrieb
description: Jahresrhythmus, Pinning im Ereignisfall, Lücken-Monitoring und Troubleshooting der Videoüberwachung Dottikon
tags:
  - ueberwachung
  - dottikon
  - betrieb
  - troubleshooting
---

# Videoüberwachung Betrieb

Das [Kamera-Retention-System](./index.md) ist auf minimalen Betrieb ausgelegt: Im Alltag fallen keine Handgriffe an. Der Betrieb besteht aus einem Jahresrhythmus, dem Ereignisfall und dem Blick auf Lücken.

## Jahresrhythmus

Einmal pro Jahr, als Kalendereintrag statt Skript:

- **Jahres-Timelapse rendern** (Ebene E) -- aus dem abgeschlossenen Anker-Jahrgang, optional zusätzlich ein dichter Jahresfilm aus dem Ebene-B-Jahrgang, der als nächstes gelöscht wird.
- **Ältesten Ebene-B-Jahrgang löschen** -- eine Handlung in File Station. Die Retention des dichten Archivs ist bewusst manuell durchgesetzt: eine Löschung pro Jahr statt einer Lösch-Automatik, die als einziger Baustein still fehllaufen könnte.
- **Vollständigkeit prüfen** -- kurzer Blick auf den Anker-Jahrgang und die Backup-Job-Meldungen.

## Ereignisfall (Pinning)

Fällt im 30-Tage-Fenster etwas auf, wird der betroffene Clip von Hand aus der Surveillance Station nach `pinned/` im Archiv-Share exportiert -- bewusst kein Automatismus. Das ist der einzige Weg, Vollclips über das Rückblick-Fenster hinaus zu erhalten. Alles Ungepinnte existiert nach 30 Tagen nur noch als Smart-Time-Lapse-Spur und im 5-Minuten-Raster ([Trade-off](./index.md#das-ebenenmodell)).

## Lücken-Monitoring

Stille Capture-Lücken sind das operative Hauptrisiko des Systems. Das Konzept setzt auf Sichtbarkeit statt Alarmierung:

- **Primär die Photos-Timeline des Ankers** (sobald die Photos-Indexierung produktiv ist): Fehltage fallen beim Durchblättern sofort visuell auf.
- **Sekundär die DSM-Meldungen** -- Benachrichtigungen des FTP-Diensts und künftig der Hyper-Backup-Jobs.
- Die Pfad-Redundanz begrenzt den Schaden: Fällt der Kamera-Push aus, läuft der Anker über Home Assistant unabhängig weiter, und umgekehrt.

## Selbstheilung der PTZ-Ausrichtung

Die [Wächterpositionen](./referenz.md#ptz-wachterpositionen) auf Silo Ost und West stellen einen verstellten Schwenkkopf nach 60 Sekunden selbst zurück, und die Anker-Automation fährt die Position vor jedem Snapshot zusätzlich an. Eine dauerhaft neue Soll-Ausrichtung erfordert ein Neu-Verankern der Wächterposition -- Presets dafür entstehen nur über Surveillance Station oder Reolink-App (Firmware-Einschränkung, siehe Referenz).

## Troubleshooting

- **Bilder eine Stunde versetzt einsortiert** -- Ursache: Kamera-Uhr ohne Sommerzeit-Regel (bei Silo Ost aufgetreten). Konzept: DST-Einstellung in der Kamera-Firmware aktivieren, denn die Datums-Ordnung von Ebene B hängt an der Kamera-Uhr und NTP.
- **FTP-Push bleibt aus** -- Ursache: Kamera-Zeitplan deaktiviert, Kamera offline oder DSM-FTP-Dienst nach einem Update inaktiv. Konzept: Die 5-Jahres-Linie reisst nicht ab (Anker läuft über den unabhängigen HA-Pfad weiter), eine Lücke in Ebene B ist verkraftbar.
- **Aufnahmequalität niedriger als der Kamera-Hauptstream** -- Ursache: Die Surveillance Station zeichnet das gewählte Stream-Profil auf, nicht automatisch den Hauptstream. Konzept: Profilwahl in der SS-Kamera-Konfiguration prüfen ([Referenz](./referenz.md#surveillance-station)).
- **Anker-Bild zeigt falschen Ausschnitt** -- Ursache: PTZ war zum Snapshot-Zeitpunkt verstellt. Konzept: Wächterposition heilt binnen 60 Sekunden, die Automation fährt sie vor dem Snapshot an. Bleibt der Ausschnitt falsch, ist die Wächterposition selbst falsch verankert.

## Verwandte Seiten

- [Videoüberwachung Dottikon](./index.md) -- Ebenenmodell und Designprinzipien
- [Videoüberwachung Referenz](./referenz.md) -- Kameras, Shares, FTP-Parameter
- [Synology NAS Monitoring](../../monitoring/synology-monitoring/index.md) -- Hardware-Health der DS1525+
