---
title: Videoüberwachung Dottikon
description: Kamera-Retention-System der Aussenstelle Dottikon -- parallele Capture-Ebenen auf der DS1525+ für fünf Jahre Prozess-Dokumentation
tags:
  - ueberwachung
  - kameras
  - dottikon
  - synology
  - retention
---

# Videoüberwachung Dottikon

Die Videoüberwachung der Aussenstelle Dottikon dokumentiert langsame Prozesse über Jahre -- sie ist Prozess-Dokumentation, keine klassische Ereignis-Überwachung. Drei Reolink-Kameras auf die Silos plus eine Türkamera zeichnen auf die Surveillance Station der DS1525+ auf. Ein Ebenenmodell aus parallelen Capture-Pfaden verdichtet den Rohstrom so, dass fünf Jahre Dokumentation in die vorhandene NAS-Kapazität passen.

## Übersicht

| Attribut | Wert |
|----------|------|
| Standort | Aussenstelle Dottikon ([Standorte](../../netz/netzwerk/standorte.md)) |
| NAS | DS1525+ mit Surveillance Station -- IPs: [Hosts und IPs](../../_referenz/hosts-und-ips.md#nas) |
| Kameras | 3 Reolink-Silo-Kameras + 1 Türkamera -- [Referenz](./referenz.md#kameras) |
| Ablage | Shares `surveillance` (Surveillance Station) und `surveillance-archive` (Archiv-Ebenen) |
| Automation | Home Assistant Dottikon ([Home Assistant](../../smart-home/home-assistant.md#standorte)) |
| Deployment | Kamera-Firmware und DSM-Bordmittel, kein Nomad-Job |

## Rolle im Stack

Das System beantwortet eine Speicher-Frage: Daueraufnahme aller Kameras erzeugt rund 270 GB pro Tag und damit rund 98 TB pro Jahr -- bei rund 14 TB freier Kapazität auf der DS1525+ (Planungsstand 2026-07) wäre der Speicher ohne Rotation in unter zwei Monaten voll, und die Surveillance Station rotierte die Silo-Aufnahmen effektiv nach gut drei Wochen weg. Der Anwendungsfall braucht aber volle **zeitliche** Auflösung nur kurz und volle **örtliche** Auflösung dauerhaft. Daraus folgt das Ebenenmodell: ein kurzes Fenster in voller Bewegungsauflösung, dahinter Bild-Ebenen in voller Pixel-Auflösung mit abnehmender Dichte und wachsendem Horizont.

Das System ist bewusst standort-autonom: Es läuft vollständig auf Kameras, NAS und der lokalen Home-Assistant-Instanz -- ohne Abhängigkeit vom Lenzburg-Cluster. Der [Nomad-Edge-Client](../../plattform/nomad/aussenstandort.md) am Standort kommt nur für rechenintensive Einmal-Arbeiten dazu (Frame-Extraktion, Timelapse-Render), deren Ausfall nichts zerstört.

## Designprinzipien

- **Parallel-Capture statt Nachverdichtung:** Alle Langzeit-Ebenen entstehen ab Tag 0 parallel in Zielqualität. Altern heisst Ablaufen oder Wegräumen, nie Transformieren -- kein Reencode, kein Generationsverlust, kein CPU-Problem (die DS1525+ hat keinen Hardware-Encoder).
- **Bordmittel-first:** Kamera-Firmware und DSM-Dienste vor eigenem Code. Dauerhafte Eigenbau-Fläche ist einzig die Anker-Automation in Home Assistant. Einmalige Kommandos (Render, Migration) zählen nicht als Betriebsrisiko, weil ihr Ausfall nichts zerstört und sie wiederholbar sind.
- **Redundante Capture-Pfade für das Unersetzliche:** Die Anker-Bilder entstehen über einen anderen Mechanismus (Home Assistant zieht) als das dichte Archiv (Kamera pusht). Fällt einer aus, reisst die 5-Jahres-Linie nicht ab.

::: info Ausbaustand (Juli 2026)
Produktiv sind der Kamera-FTP-Push des dichten Archivs (Ebene B, Rollout über die drei Silo-Kameras im Gang), der Smart Time Lapse (Ebene D), die PTZ-Wächterpositionen und die Home-Assistant-Grundintegration. Die SS-Daueraufnahme (Ebene A) läuft noch mit den historischen Parametern. Entworfen, aber noch nicht produktiv sind das Ebene-A-Zielprofil, die Anker-Automation (Ebene C), die Photos-Indexierung, das Hyper Backup und der Jahres-Render (Ebene E). Die Umsetzung ist im Task-Tracking erfasst.
:::

## Das Ebenenmodell

**Leitfrage:** Auf welchen Wegen entsteht aus dem Kamerabild jede Retention-Ebene -- und welche Wege sind voneinander unabhängig?

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt-Nummer und Inhalt. Durchgezogene Kanten sind kontinuierliche Streams, gestrichelte Kanten zeitgesteuerte oder manuelle Übertragungen. Farbe kodiert den Weg: Blau ist der SS-Aufnahmeweg (Ebenen A und D), Grün der Kamera-Push (Ebene B), Violett der Anker-Weg über Home Assistant (Ebene C), Grau abgeleitete und manuelle Wege, Braun die Sicherung.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  data: { shape: cylinder; style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  ssweg: { style: { stroke: "#2563eb" } }
  pushweg: { style: { stroke: "#16a34a"; stroke-dash: 3 } }
  ankerweg: { style: { stroke: "#7c3aed"; stroke-dash: 3 } }
  ableitung: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
  backupweg: { style: { stroke: "#854d0e"; stroke-dash: 3 } }
}

kameras: "Kameras Silos + Türe" {
  class: node
  tooltip: "Drei Reolink-Silo-Kameras plus Türkamera -- Modelle und IPs in der Referenz"
}

nas: "NAS DS1525+" {
  class: container

  ss: "Surveillance Station" {
    class: node
    tooltip: "Daueraufnahme und Smart Time Lapse auf dem Share surveillance"
  }

  archiv: "surveillance-archive" {
    class: container

    stills: "stills-5min" { class: data }
    anker: "anker" { class: data }
    pinned: "pinned" { class: data }
    timelapse: "timelapse" { class: data }
  }
}

ha: "Home Assistant Dottikon" {
  class: node
  tooltip: "Reolink-Integration der Silo-Kameras, CIFS-Mount auf das Archiv"
}

lenzburg: "Hyper-Backup-Ziel Lenzburg" {
  class: node
  tooltip: "Vorgesehene Standort-Redundanz -- sichert nur das Unersetzliche"
}

kameras -> nas.ss: "1. Streams für Daueraufnahme und Smart Time Lapse (Ebenen A und D)" { class: ssweg }
kameras -> nas.archiv.stills: "2. FTPS-Push alle 5 Min in voller Auflösung (Ebene B)" { class: pushweg }
ha -> kameras: "3. zieht Anker-Snapshot zu festen Zeitpunkten (Ebene C)" { class: ankerweg }
ha -> nas.archiv.anker: "4. legt Anker-JPEG ab (CIFS)" { class: ankerweg }
nas.ss -> nas.archiv.pinned: "5. manueller Clip-Export im Ereignisfall" { class: ableitung }
nas.archiv.anker -> nas.archiv.timelapse: "6. jährlicher Render (Ebene E)" { class: ableitung }
nas.archiv -> lenzburg: "7. Hyper Backup anker + pinned + timelapse (vorgesehen)" { class: backupweg }
```

Lesehilfe:

1. Die Surveillance Station zeichnet die Kamera-Streams als rollierendes 30-Tage-Fenster auf und verdichtet sie parallel zum Smart Time Lapse ([Ebene A](#ebene-a-ruckblick-fenster), [Ebene D](#ebene-d-smart-time-lapse)).
2. Die Silo-Kameras pushen selbstständig alle 5 Minuten ein Voll-JPEG per FTPS in das dichte Archiv -- reines Bordmittel aus Kamera-Firmware und DSM-FTP-Dienst ([Ebene B](#ebene-b-dichtes-bild-archiv)).
3. Home Assistant zieht zu festen Tageszeitpunkten über die Reolink-Integration einen Snapshot in voller Auflösung -- bewusst ein anderer Pfad als der Kamera-Push ([Ebene C](#ebene-c-anker-bilder)).
4. Die Anker-JPEGs landen über den CIFS-Mount deterministisch benannt im Archiv-Share -- sie sind das 5-Jahres-Rückgrat.
5. Fällt im 30-Tage-Fenster etwas auf, wird der Clip von Hand nach `pinned/` exportiert -- der einzige Weg, Vollclips über das Fenster hinaus zu erhalten ([Betrieb](./betrieb.md#ereignisfall-pinning)).
6. Aus einem Jahrgang Anker-Bilder entsteht einmal pro Jahr ein Timelapse-Film ([Ebene E](#ebene-e-jahres-timelapse)).
7. Das Unersetzliche (`anker/`, `pinned/`, `timelapse/`) soll per Hyper Backup nach Lenzburg gesichert werden -- das dichte Archiv bewusst nicht ([Sicherung](#sicherung-des-unersetzlichen)).

### Ebene A -- Rückblick-Fenster

Daueraufnahme aller vier Kameras in der Surveillance Station als rollierendes Fenster: Für schnelle Ereignisse der letzten 30 Tage gibt es Vollclips. Der Entwurf sieht 12 fps mit H.265-VBR und harte Rotation über keepDays und keepSize vor -- bessere Einzelframe-Qualität bei kleinerem Bestand als mit den historischen Parametern, mit denen die Aufnahme heute noch läuft. Parameter: [Referenz](./referenz.md#surveillance-station).

### Ebene B -- dichtes Bild-Archiv

Pro Silo-Kamera alle 5 Minuten ein JPEG in voller Hauptstream-Auflösung, von der Kamera selbst per FTPS auf die NAS gepusht -- null eigener Code, nur Kamera-Zeitplan plus DSM-FTP-Dienst. Rolle: dichte Prozess-Doku auf Pixelebene über Wochen und Monate sowie Rohmaterial für dichte Timelapse-Renders. Retention 24 Monate, durchgesetzt als bewusste jährliche Handlöschung des ältesten Jahrgangs ([Betrieb](./betrieb.md#jahresrhythmus)). Die Türkamera ist hier bewusst nicht dabei (Sicherheits-, keine Prozesskamera). Der Altbestand der SS-Daueraufnahmen von Silo Ost wird einmalig in dasselbe 5-Minuten-Raster extrahiert, damit das Archiv bis zum Aufzeichnungsbeginn zurückreicht ([Referenz](./referenz.md#altbestand-extraktion)).

### Ebene C -- Anker-Bilder

Das Langzeit-Rückgrat und die garantierte Quelle der Jahres-Timelapses: täglich wenige Voll-JPEGs pro Silo-Kamera zu festen Zeitpunkten, gezogen von Home Assistant über die Reolink-Integration und deterministisch benannt im Archiv abgelegt. Der Bestand ist über den 5-Jahres-Horizont trivial (rund 19 GB) und braucht nie Rotation. Bewusst ein anderer Mechanismus als Ebene B: Ein Firmware-Bug im Kamera-FTP oder ein deaktivierter DSM-Dienst reisst die 5-Jahres-Linie nicht ab. Bei den PTZ-Kameras fährt die Automation vor dem Snapshot die Wächterposition an -- Standardbild-Garantie über Jahre. Zeitpunkte und Mechanik: [Referenz](./referenz.md#home-assistant-dottikon).

### Ebene D -- Smart Time Lapse

Der SS-native Smart Time Lapse läuft im Event-Modus weiter und bildet den Browsing-Index: schnelles Überfliegen langer Zeiträume und die verdichtete Spur von Bewegungsereignissen über das 30-Tage-Fenster hinaus. Zusammen mit dem Pinning ersetzt er eine automatische Event-Export-Ebene, die dem Bordmittel-Kriterium bewusst geopfert wurde.

### Ebene E -- Jahres-Timelapse

Aus den Anker-Bildern eines Jahres entsteht pro Kamera ein kurzer 4K-Film -- ein einmaliges Render-Kommando pro Jahr, kein laufender Prozess. Weil die Quelle nur einige hundert Frames umfasst, rendert das jede Maschine in Minuten. Vorgesehen ist der QSV-fähige [Nomad-Edge-Client](../../plattform/nomad/aussenstandort.md) am Standort. Optional entsteht vor dem Löschen eines Ebene-B-Jahrgangs zusätzlich ein dichter Jahresfilm aus dem 5-Minuten-Material.

### Sicherung des Unersetzlichen

Vorgesehen ist ein Hyper-Backup-Task (DSM-Bordmittel), der nur das Unersetzliche sichert: `anker/`, `pinned/` und `timelapse/`, zusammen unter 250 GB über fünf Jahre, als Standort-Redundanz nach Lenzburg. Das dichte Archiv wird bewusst nicht gesichert: Es ist rollierend, sein Verlust wäre ärgerlich, aber die 5-Jahres-Linie (Anker) und der Index (Smart Time Lapse) überleben unabhängig davon.

::: warning Ereignisse älter als 30 Tage
Vollclips existieren nur im 30-Tage-Fenster (Ebene A) oder als manuell gepinnte Exporte. Ältere schnelle Ereignisse überleben als Smart-Time-Lapse-Spur und im 5-Minuten-Raster, aber nicht als Vollclip -- ein bewusster Bordmittel-Trade-off. Ein kurzes Ereignis ohne Spur im 5-Minuten-Raster, nicht gepinnt und älter als 30 Tage, ist weg.
:::

## Viewing

Sicht-Ebene für den Langzeitverlauf ist Synology Photos (vorgesehen): Der Anker-Ordner wird als Team-Ordner indexiert, womit jede Kamera ein durchblätterbares Album mit Timeline ist -- mobil und im Web. Das dichte Archiv bleibt bewusst ausserhalb der Photos-Indexierung: Hunderttausende Bilder pro Jahr würden Indexer und Thumbnail-Erzeugung massiv belasten und die Timeline zumüllen. Zugriff auf Ebene B erfolgt gezielt pro Datumsordner über File Station oder über die gerenderten Timelapse-Filme. Nebeneffekt der Photos-Sicht: Lücken im Anker fallen beim Durchblättern sofort auf -- das billigste Lücken-Monitoring ([Betrieb](./betrieb.md#lucken-monitoring)).

## Verwandte Seiten

- [Videoüberwachung Referenz](./referenz.md) -- Kameras, Shares, FTP-Parameter, Speicher-Mathematik
- [Videoüberwachung Betrieb](./betrieb.md) -- Jahresrhythmus, Pinning, Troubleshooting
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- IPs von NAS und Kameras (SSOT)
- [Standorte](../../netz/netzwerk/standorte.md) -- die Aussenstelle Dottikon im Netzwerk-Detail
- [Home Assistant](../../smart-home/home-assistant.md) -- die Dottikon-Instanz im Standort-Verbund
- [Nomad Aussenstandort](../../plattform/nomad/aussenstandort.md) -- Edge-Client für Extraktion und Render
- [NAS-Storage Referenz](../nas/referenz.md#dsm-verwaltung-alle-synology) -- DSM-Verwaltung aller Synology
- [Synology NAS Monitoring](../../monitoring/synology-monitoring/index.md) -- Hardware-Health der Synology-Flotte
