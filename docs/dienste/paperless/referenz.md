---
title: Paperless Referenz
description: Volumes, Pfad-Aufteilung und die Konfigurationsentscheide des Paperless-Jobs
tags:
  - service
  - dms
  - nomad
  - referenz
---

# Paperless Referenz

Technische Details zum Nomad-Job `services/paperless-simple.nomad`. Die Werte selbst stehen im Job und in Ansible; diese Seite beschreibt Struktur und Begründung.

## Tasks

| Task | Rolle | Lifecycle |
| :--- | :--- | :--- |
| `wait-for-postgres` | wartet auf die Erreichbarkeit des PostgreSQL Shared Cluster | Prestart |
| `check-nas-mount` | prüft Marker-Datei und Schreibrecht auf dem NAS-Pfad, bricht sonst ab | Prestart |
| `redis` | Task-Queue, bewusst flüchtig im Allocation-Verzeichnis | Sidecar |
| `paperless` | Webserver, Consumer und Scheduler in einem Container | Haupt-Task |

Die Task-Queue in Redis ist reine Laufzeit-Information und wird nach einem Neustart neu aufgebaut -- sie liegt deshalb bewusst auf flüchtigem Speicher und nicht auf einem Volume.

Guard und Haupt-Task laufen mit derselben Benutzerkennung. Andernfalls prüft der Guard als `root` und wird am NFS-Export auf `guest` abgebildet -- er meldet dann fehlende Schreibrechte, obwohl der Dienst schreiben dürfte (siehe [Betrieb](./betrieb.md#start-guard-meldet-nicht-beschreibbar-obwohl-der-dienst-schreiben-darf)).

## Speicher-Aufteilung

| Ablage | Ort | Inhalt | Begründung |
| :--- | :--- | :--- | :--- |
| `host_volume` `nfs-paperless` | NAS, Home-Unterordner `90_Paperless` | Originale, Archivversionen, Consume-Ordner | gehört zum persönlichen Bestand und wird mit ihm gesichert |
| Linstor CSI `paperless-data-r2` | repliziert auf den Storage-Nodes | Suchindex, Klassifikationsmodell, Zeitplan | Index nutzt memory-mapped Files, auf Netzlaufwerken ein bekannter Fehlerfall |
| Container-Default | flüchtig im Container | Scratch-Bereich der Verarbeitung | OCR und Konvertierung laufen lokal, nur das Ergebnis geht über das Netz |

Der NAS-Pfad hängt am deklarierten Nomad-`host_volume` und nicht an einem rohen Docker-Bind. Damit greift die Nomad-ACL-Kontrolle, und der Host-Pfad lebt ausschliesslich in Ansible -- zieht die Ablage später in einen eigenen Share um, wird Ansible angefasst und das Jobfile bleibt unberührt. Der Container-Pfad ändert sich dabei nie.

## Benutzerkennung

Der Container läuft unter der Benutzerkennung des Home-Besitzers auf dem NAS. Das ist zwingend und nicht kosmetisch: Der Export bildet nur `root` auf `guest` ab, alle anderen Kennungen reicht der Server durch -- Schreibrechte hängen damit an Eigentümer und Modus der Zielverzeichnisse. Zusätzlich zieht Paperless beim Start die Rechte auf seine Verzeichnisse nach; scheitert das auf dem Netzlaufwerk, startet der Dienst nicht sauber.

Die passende Kennung wurde am Testmount ermittelt und nicht angenommen -- Synology vergibt für manuell angelegte Benutzer typischerweise Werte ab 1026, der naheliegende Standardwert 1000 wäre falsch gewesen.

## Konfigurationsentscheide

| Einstellung | Wirkung | Warum so |
| :--- | :--- | :--- |
| OCR-Modus `skip` | erkennt nur Seiten ohne Text | ein Neuerkennen über brauchbare Altlayer überlagert diese, im Messlauf bis zur Verdoppelung des Textbestands; zusätzlich wirkt die Schräglagen-Korrektur nur in diesem Modus |
| OCR-Sprachen Deutsch und Englisch | begrenzt die Erkennung | das eigene OCR ist nur Rückfallebene für manuell abgelegte Dateien |
| Archivdatei bei vorhandenem Text überspringen | umgeht die OCR-Kette ganz, sobald genug Text im PDF steht | schont die Masse des Bestands; die Qualitätsentscheidung über schwache Altlayer fällt in der Pipeline, nicht hier |
| Consumer-Polling statt inotify | prüft den Ordner in festem Takt | Netzlaufwerke liefern keine inotify-Ereignisse, sonst bliebe der Consume-Ordner still wirkungslos |
| Duplikate im Consume-Ordner löschen | entfernt die Eingangsdatei bei Prüfsummen-Treffer | für den API-Import harmlos, für den Consume-Weg eine Datenverlust-Falle (siehe [Betrieb](./betrieb.md)) |
| Erlaubte Hosts offen | akzeptiert auch den Zugriff über die Node-Adresse | der API-Import umgeht Traefik bewusst; von aussen ist die Instanz ohnehin nur hinter Traefik und `intern-auth@file` erreichbar |
| Image auf Digest gepinnt | friert die laufende Version ein | ein Tag allein hätte bei einem Upstream-Rebuild die Version gewechselt, die hier bewusst gehalten wird |

## Platzierung

Der Job darf auf beiden Storage-Nodes laufen, weil Nomad ihn verschieben können muss. Voraussetzung dafür ist, dass Mount und `host_volume` auf beiden Nodes identisch existieren -- die Ansible-Definition liegt deshalb gruppenweit und nicht in den `host_vars` eines einzelnen Nodes.

## Verwandte Seiten

- [Paperless-ngx](./index.md) -- Architektur, Hybrid-Ablage und Rolle im Stack
- [Paperless Betrieb](./betrieb.md) -- Import-Weg, Versionslinie, Troubleshooting
- [NAS-Storage: Referenz](../../storage/nas/referenz.md#home-zugang-der-dokumenten-verarbeitung) -- Export-Regel und Mounts
- [Linstor CSI](../../storage/linstor/index.md) -- replizierter Block-Storage
- [Nomad Referenz](../../plattform/nomad/referenz.md) -- Job-Konfigurationsmuster
