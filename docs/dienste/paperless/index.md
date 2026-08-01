---
title: Paperless-ngx
description: Dokumenten-Management für Records mit Hybrid-Ablage aus NAS-Dokumenten und lokalem Suchindex
tags:
  - service
  - productivity
  - nomad
  - dms
---

# Paperless-ngx

Paperless-ngx ist die Ablage- und Suchschicht für Records: gescannte und empfangene Verwaltungsdokumente wie Rechnungen, Belege, Verträge sowie Behörden- und Versicherungspost. Selbst erzeugte Projekt-Dokumente gehören bewusst nicht hierher, sie bleiben in der Ordnerstruktur.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [paperless.ackermannprivat.ch](https://paperless.ackermannprivat.ch) \| Siehe [Web-Interfaces](../../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/paperless-simple.nomad` |
| Storage | Hybrid: Dokumente auf dem NAS (`host_volume` `nfs-paperless`), Index und Betriebsdaten auf Linstor CSI `paperless-data-r2` |
| Auth | `intern-auth@file` |
| Secrets | Vault `kv/data/paperless` |

## Rolle im Stack

Paperless ist die Zielablage der [Dokumenten-Pipeline](../dokumenten-pipeline/index.md) und nicht mehr deren Ersatz. Klassifikation, Metadaten und die Routing-Entscheidung zwischen Paperless und Projektablage entstehen in der Pipeline; Paperless nimmt die fertigen Dokumente samt Metadaten über die REST-API entgegen und leistet, was es am besten kann: Archivversion mit Textlayer, Volltextsuche, Vorschau und Aussortieren mit Blick auf das Dokument.

Diese Arbeitsteilung ist der Grund, warum die früheren AI-Sidecars (`paperless-ai`, `paperless-gpt`) entfernt wurden. Ihre Aufgabe -- automatisches Tagging und Klassifikation -- übernimmt die Pipeline mit besserem Kontext und deutlich strengerer Nachvollziehbarkeit, und zwei Wege zur selben Metadatenentscheidung hätten sich gegenseitig überschrieben.

## Architektur

**Leitfrage:** Wo landet ein Dokument physisch, und wer entscheidet über seine Metadaten?

Der Job läuft als eine Nomad-Group mit einem Haupt-Container; ein vorgeschalteter Guard-Task prüft den NAS-Mount, bevor Paperless startet. Die Datenbank kommt aus dem PostgreSQL Shared Cluster.

```d2
classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  data: {
    shape: cylinder
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
  importweg: { style: { stroke: "#7c3aed" } }
  ablageweg: { style: { stroke: "#0f766e" } }
}

direction: right

Quellen: Zulauf {
  class: container
  PIPE: "Dokumenten-Pipeline\n(Nomad-Batch)" { class: node }
  SCAN: "Direkt-Scan\n(Fallback in consume)" { class: node }
}

Traefik: Traefik {
  class: container
  R1: "Router paperless.*\nintern-auth" { class: node }
}

Nomad: "Nomad-Group paperless" {
  class: container
  GUARD: "check-nas-mount\n(prestart, Marker-Datei)" { class: node }
  PL: "Paperless-ngx\n(Web, Consumer, Scheduler)" { class: node }
}

NAS: "NAS homes\n90_Paperless" { class: data }
CSI: "Linstor CSI\npaperless-data-r2" { class: data }
PG: "PostgreSQL\npostgres.service.consul" { class: data }
USER: Browser { class: node }

Quellen.PIPE -> Nomad.PL: "1. Dokument + Metadaten (REST-API)" { class: importweg }
Quellen.SCAN -> NAS: "2. Datei in consume" { class: importweg }
USER -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.PL: "3. Web-UI und API"
Nomad.GUARD -> NAS: "4. prüft Marker vor dem Start" { class: ablageweg }
Nomad.PL -> NAS: "5. Dokumente und Consume-Ordner (NFS)" { class: ablageweg }
Nomad.PL -> CSI: "6. Suchindex, Modell, Zeitplan" { class: ablageweg }
Nomad.PL -> PG: "7. Metadaten und Volltext-Referenzen"
```

Lesehilfe:

1. Die Pipeline liefert Dokumente samt fertigen Metadaten über die REST-API an -- das ist der Regelweg ([Rolle im Stack](#rolle-im-stack)).
2. Manuell abgelegte Dateien im Consume-Ordner bleiben als Fallback möglich; sie werden gepollt, nicht per inotify erkannt ([Consume-Ordner](#consume-ordner-und-eigenes-ocr)).
3. Zugriff auf Web-UI und API läuft über Traefik hinter `intern-auth@file`; der Import umgeht Traefik bewusst über die Node-Adresse.
4. Der Guard-Task bricht den Start ab, wenn der NAS-Mount fehlt oder nicht beschreibbar ist ([Start-Guard](#start-guard-am-nas-mount)).
5. Originale, Archivversionen und der Consume-Ordner liegen auf dem NAS.
6. Suchindex, Klassifikationsmodell und Zeitplan bleiben auf dem replizierten CSI-Volume ([Hybrid-Ablage](#hybrid-ablage)).
7. Dokument-Metadaten liegen wie bei den anderen Diensten im PostgreSQL Shared Cluster.

**Belegt gegen** `services/paperless-simple.nomad` und die `host_vars` der Storage-Nodes, Stand 01.08.2026.

## Hybrid-Ablage

Die PDFs liegen auf dem NAS, der Suchindex bleibt lokal auf dem replizierten CSI-Volume. Diese Trennung ist keine Optimierung, sondern die einzige tragfähige Variante: Der Whoosh-Index arbeitet mit memory-mapped Files, und die Paperless-Dokumentation nennt Netzlaufwerke für das Datenverzeichnis ausdrücklich als bekannten Fehlerfall. Klassifikationsmodell und Zeitplan liegen aus demselben Grund dort -- klein, schreibintensiv, jederzeit regenerierbar.

Umgekehrt gehören die Dokumente ans NAS, weil sie Teil des persönlichen Bestands sind und dort mitgesichert werden. Der Alltagsbetrieb merkt von der Aufteilung nichts: Die Suche liest weiterhin lokal, nur das Ablegen und Ausliefern der PDFs geht über das Netz.

::: info Verarbeitung bleibt lokal
Der Scratch-Bereich für die Verarbeitung steht bewusst auf dem Container-Default und nicht auf dem NAS. Damit läuft die gesamte Verarbeitung inklusive OCR lokal, und erst die fertige Datei geht über das Netz. Der Preis der Hybrid-Lösung ist eine Sperrdatei, die zwangsläufig auf dem Netzlaufwerk liegt -- ihr Pfad ist im Quellcode fest an das Medienverzeichnis gebunden und nicht konfigurierbar. Bei einer einzelnen Instanz serialisiert der Kernel die Sperre zwischen den lokalen Worker-Prozessen; das Restrisiko ist klein, aber nicht null.
:::

## Start-Guard am NAS-Mount

Ein prestart-Task prüft vor jedem Start, ob die Marker-Datei im NAS-Verzeichnis vorhanden und der Pfad beschreibbar ist. Fehlt beides, bricht der Job ab, statt zu starten.

Der Grund ist eine teuer bezahlte Lehre: Fehlt ein Host-Pfad, legt Docker still ein leeres Verzeichnis an. Genau so schrieb die Instanz von Dezember 2025 bis Ende Juli 2026 unbemerkt in ein flüchtiges Allocation-Verzeichnis statt auf ihr Volume -- die Dokumente lagen auf dem Volume, der Container schaute daran vorbei. Ein harter Abbruch beim Start ist einem stillen Falschlauf klar vorzuziehen.

Weil der Job auf beiden Storage-Nodes laufen darf, muss der Mount auf beiden identisch existieren. Liegt er nur auf einem, startet der Job auf dem anderen schlicht nicht -- der Guard macht diesen Fall sichtbar, statt ihn zu verschleiern.

## Consume-Ordner und eigenes OCR

Der Consume-Ordner liegt auf dem NAS und wird deshalb in einem festen Takt gepollt statt per inotify überwacht: Netzlaufwerke liefern keine Dateisystem-Benachrichtigungen, mit der Standardkonfiguration würde Paperless neue Dateien schlicht nicht aufnehmen.

Das eigene OCR ist auf die Rolle der Rückfallebene zugeschnitten: Dokumente aus der Pipeline bringen ihren Textlayer bereits mit, erkannt werden muss nur noch, was jemand von Hand im Consume-Ordner ablegt. Deshalb sind dort bewusst nur Deutsch und Englisch aktiv, und der OCR-Modus überspringt Seiten mit vorhandenem Text, statt sie neu zu erkennen. Ein Neuerkennen über einen brauchbaren Altlayer verbessert das Ergebnis nicht, sondern legt im Gegenteil einen zweiten Textlayer darüber; im eigenen Messlauf führte das bis zur Verdoppelung des Textbestands.

::: warning Consume-Ordner löscht Duplikate physisch
Paperless prüft eingehende Dateien gegen die Prüfsummen aller Dokumente einschliesslich der gelöschten. Bei einem Treffer wird die Eingangsdatei physisch entfernt und der Vorgang schlägt fehl. Für den Import über die API ist das harmlos, dort trifft es nur die temporäre Kopie. Wer den Consume-Ordner mit den einzigen vorhandenen Kopien beschickt, verliert sie. Zusätzlich blockiert ein Dokument im Papierkorb den erneuten Import derselben Datei.
:::

## Backup

- **Dokumente:** auf dem NAS, abgedeckt durch die Sicherung des Home-Bestands (lokal und offsite über Hyper Backup)
- **Index und Betriebsdaten:** Linstor-CSI-Volume `paperless-data-r2`, abgedeckt durch die allgemeine [Backup-Strategie](../../storage/backup/index.md) -- inhaltlich jederzeit neu aufbaubar
- **Datenbank:** PostgreSQL Shared Cluster, siehe [Datenbank-Architektur](../../_querschnitt/datenbank-architektur.md)

## Verwandte Seiten

- [Paperless Referenz](./referenz.md) -- Volumes, Pfade, Konfigurationswerte und deren Begründung
- [Paperless Betrieb](./betrieb.md) -- Import-Profil, Troubleshooting, Versionsstand
- [Dokumenten-Pipeline](../dokumenten-pipeline/index.md) -- vorgelagerte Klassifikation und Metadaten-Extraktion
- [NAS-Storage: Referenz](../../storage/nas/referenz.md) -- Export-Regel und Mounts des Home-Zugangs
- [Datenbank-Architektur](../../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Backup-Strategie](../../storage/backup/index.md) -- übergeordnetes Backup-Konzept
- [Traefik Middlewares](../../edge/traefik/referenz.md) -- Auth-Chain-Konfiguration
