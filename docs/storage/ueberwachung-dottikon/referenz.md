---
title: Videoüberwachung Referenz
description: Kameras, PTZ-Wächterpositionen, Share-Struktur, FTP-Parameter, Home-Assistant-Anbindung und Speicher-Mathematik der Videoüberwachung Dottikon
tags:
  - ueberwachung
  - kameras
  - dottikon
  - referenz
---

# Videoüberwachung Referenz

Technische Details des [Kamera-Retention-Systems Dottikon](./index.md): Kameras, Ablage-Struktur, Transport-Parameter und die Speicher-Mathematik hinter dem Ebenenmodell.

## Kameras

| Kamera | Modell | Hauptstream | PTZ | Ebenen |
|--------|--------|-------------|-----|--------|
| Silo Ost | Reolink RLC-823S2 | 3840 x 2160 | ja | A, B, C, D |
| Silo West | Reolink RLC-823S1 | 3840 x 2160 | ja | A, B, C, D |
| Silo Süd | Reolink Duo 3V | 7680 x 2160 (Dual-Sensor, gestitcht) | nein | A, B, C, D |
| Türe hinten | Reolink (älteres Modell, keine HA-Integration möglich) | -- | nein | nur A |

IP-Adressen: [Hosts und IPs](../../_referenz/hosts-und-ips.md#kameras-dottikon). Die früheren Kameras auf Rechen und Haustüre sind bewusst physisch ausser Betrieb. Zugangsdaten (Kamera-Admin, FTP-Benutzer) liegen im 1Password-Vault `PRIVAT Agent` -- das Wiki führt nur Speicherorte ([Zugangsdaten](../../_referenz/credentials.md)).

### PTZ-Wächterpositionen

Auf Silo Ost und West ist die Reolink-Wächterposition (Guard) mit 60 Sekunden Auto-Rückkehr auf die Soll-Ausrichtung verankert: Ein manuelles oder versehentliches Verstellen heilt sich selbst, womit alle Bild-Ebenen über Jahre denselben Ausschnitt zeigen (Standardbild-Garantie). Die Anker-Automation fährt die Wächterposition zusätzlich vor jedem Snapshot an.

::: warning Presets nur über Surveillance Station oder Reolink-App
Die Reolink-HTTP-API kann die Wächterposition setzen, aber keine PTZ-Presets anlegen (Firmware-Einschränkung). Neue Presets entstehen nur über die Surveillance Station oder die Reolink-App. API-Muster und Gotchas: `skills/surveillance-station/reference/reolink-kamera-api.md` im Repo `claude-config`.
:::

## Surveillance Station

Die Surveillance Station läuft auf der DS1525+ und nimmt Daueraufnahme (Ebene A) und Smart Time Lapse (Ebene D) auf den Share `surveillance` auf. DSM-Zugang und Port-Konvention: [DSM-Verwaltung](../nas/referenz.md#dsm-verwaltung-alle-synology), IPs: [Hosts und IPs](../../_referenz/hosts-und-ips.md#nas).

- **Ebene A, Zielprofil (entworfen, noch nicht umgesetzt):** Silo-Kameras 4K, 12 fps, H.265-VBR mit Deckel 6 Mbit/s, dazu Rotation über keepDays 30 und keepSize 2000 GB pro Silo-Kamera als harter Deckel. Türkamera 1 Mbit/s, keepDays 30, keepSize 350 GB. Beides SS-nativ, null Eigenbau.
- **Ebene D, Smart Time Lapse:** SS-nativ im Event-Modus, verdichtet um Bewegungsereignisse herum -- läuft produktiv.

Die SS zeichnet das in der Kamera-Konfiguration gewählte Stream-Profil auf, nicht automatisch den Kamera-Hauptstream -- die Profilwahl bestimmt die Aufnahmequalität ([Betrieb](./betrieb.md#troubleshooting)).

## Share und Ordnerstruktur

Der Share `surveillance-archive` auf `/volume1` trägt alle Archiv-Ebenen und ist bewusst ohne Papierkorb angelegt: Rollierende Löschungen sollen Kapazität sofort freigeben statt doppelt zu liegen.

| Ordner | Ebene | Inhalt |
|--------|-------|--------|
| `stills-5min/` | B | Pro Silo-Kamera ein Unterordner, darin Datums-Hierarchie `JJJJ/MM/TT` (von der Kamera per autoDir angelegt) |
| `anker/` | C | Anker-JPEGs, deterministisch nach Kamera, Datum und Zeitpunkt benannt |
| `timelapse/` | E | Gerenderte Jahres- und Jahrgangs-Filme |
| `pinned/` | -- | Manuell gesicherte Vollclips aus dem 30-Tage-Fenster (Budget 200 GB über 5 Jahre) |

## FTP-Zugang (Ebene B)

Der DSM-FTP-Dienst ist das Transport-Ziel des Kamera-Pushs, gehärtet auf das Minimum:

- **Benutzer `cam-ftp`:** Schreibrecht ausschliesslich auf `surveillance-archive`, kein Zugriff auf andere Shares oder Dienste.
- **FTPS-only:** Port 21 mit erzwungener TLS-Verschlüsselung, Passiv-Portbereich 55536-55899, nur im Standort-LAN erreichbar.
- **Kamera-Zeitplan:** TIMING-Schedule mit `picInterval` 300 s. Der Snapshot kommt in voller Hauptstream-Auflösung (Ost/West 3840 x 2160, Süd 7680 x 2160 als gestitchtes Vollbild), die Datums-Unterordner legt die Kamera selbst an (autoDir).

Konfiguriert wird dezentral pro Kamera (Reolink-Firmware). Die API-Muster dafür dokumentiert `skills/surveillance-station/reference/reolink-kamera-api.md` im Repo `claude-config`.

## Home Assistant Dottikon

Die lokale Home-Assistant-Instanz ([Standorte-Tabelle](../../smart-home/home-assistant.md#standorte)) ist der zweite, vom Kamera-Push unabhängige Capture-Pfad:

- **Reolink-Integration** aller drei Silo-Kameras -- die `camera.*_snapshots_clear`-Entitäten liefern Snapshots in voller Auflösung.
- **CIFS-Mount** des Archiv-Shares unter `/media/surveillance_archive` -- die Anker-JPEGs werden direkt auf die NAS geschrieben.
- **Anker-Automation (Ebene C, produktiv):** Automation `retention_anker` mit Snapshots um 12:00 und 15:00 sowie 45 Minuten nach Sonnenaufgang und 45 Minuten vor Sonnenuntergang; Ablage als `anker/<kamera>/<jahr>/<kamera>_<datum>_<zeit>.jpg`, fehlende Ordner entstehen automatisch. Bei den PTZ-Kameras wird vor dem Snapshot die Wächterposition angefahren.

Warum Home Assistant statt eines DSM-Aufgabenplaner-Tasks: Die Reolink-Integration liefert Voll-Snapshots ohne Kamera-Credentials in einem Task-Kommando, Sonnenstand-Trigger sind nativ vorhanden, und der Pfad bleibt vollständig vom Kamera-FTP und vom DSM-FTP-Dienst entkoppelt (Pfad-Redundanz des Ebenenmodells).

## Speicher-Mathematik

Planwerte der Dimensionierung (Planungsstand 2026-07, rund 14 TB freie Kapazität):

| Ebene | Bestand | Planwert |
|-------|---------|----------|
| A Rückblick-Fenster | rollierend, 30 Tage | Worst Case 6.2 TB, erwartet mit VBR 3 bis 4.3 TB |
| B dichtes Archiv | rollierend, 24 Monate | rund 1.0 TB pro Jahr, rollierend rund 2.0 TB |
| C Anker | wachsend, 5 Jahre | rund 3.8 GB pro Jahr, nach 5 Jahren rund 19 GB |
| D Smart Time Lapse | wachsend, 5 Jahre | 0.5 bis 0.75 TB |
| E Timelapse + pinned | wachsend, 5 Jahre | Budget 0.25 TB |

Steady State Worst Case rund 9.2 TB, erwartet 6 bis 7 TB -- mit rund 5 TB Reserve, ohne Bay-Erweiterung und ohne Offload aus Platzgründen. Gegenüber der Hochrechnung einer 5-Jahres-Daueraufnahme (rund 490 TB) ist das Faktor 50, bei besserer Einzelbild-Qualität. Würde das dichte Archiv auf volle 5 Jahre verlängert (plus rund 3 TB), wäre eine Bay-Erweiterung die saubere Antwort. Default bleiben 24 Monate, weil der Anker die 5-Jahres-Linie ohnehin trägt.

## Altbestand-Extraktion

Der SS-Aufnahme-Altbestand von Silo Ost (08.06. bis 19.07.2026, 2.6 TB) wird einmalig auf dem [Nomad-Edge-Client](../../plattform/nomad/aussenstandort.md) in das 5-Minuten-JPEG-Raster extrahiert -- rückwirkende Befüllung des dichten Archivs bis zum Aufzeichnungsbeginn, bevor die SS-Rotation den Bestand frisst. Einmaliges Kommando, kein Betriebsrisiko: Ein Abbruch zerstört nichts, der Lauf ist wiederholbar. Lücken im extrahierten Raster entsprechen dem nächtlichen Aufnahmezeitplan und sind normal.

## Sicherung

Vorgesehen ist ein Hyper-Backup-Task (DSM-Bordmittel) für `anker/`, `pinned/` und `timelapse/` mit Ziel Lenzburg -- Standort-Redundanz für unter 250 GB Unersetzliches über 5 Jahre. Das dichte Archiv (Ebene B) ist bewusst ausgenommen. Die Begründung steht beim [Ebenenmodell](./index.md#sicherung-des-unersetzlichen).

## Verwandte Seiten

- [Videoüberwachung Dottikon](./index.md) -- Ebenenmodell, Designprinzipien, Trade-offs
- [Videoüberwachung Betrieb](./betrieb.md) -- Jahresrhythmus, Pinning, Troubleshooting
- [Hosts und IPs](../../_referenz/hosts-und-ips.md#kameras-dottikon) -- Kamera- und NAS-IPs (SSOT)
- [Zugangsdaten](../../_referenz/credentials.md) -- Speicherorte der Credentials
- [NAS-Storage Referenz](../nas/referenz.md#dsm-verwaltung-alle-synology) -- DSM-Verwaltung aller Synology
- [Home Assistant](../../smart-home/home-assistant.md) -- die Dottikon-Instanz
- [Nomad Aussenstandort](../../plattform/nomad/aussenstandort.md) -- Edge-Client für Extraktion und Render
