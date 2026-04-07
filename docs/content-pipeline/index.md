---
title: Content Pipeline
description: Automatisierte Content-Akquisition mit Batch Jobs und Telegram-Steuerung
tags:
  - service
  - media
  - nomad
  - batch
  - automation
---

# Content Pipeline

## Uebersicht

Drei Komponenten bilden die automatisierte Content-Akquisition-Pipeline: zwei periodische Batch Jobs laden Inhalte herunter und ein Telegram Bot ermoeglicht die Steuerung per Chat.

| Attribut | reddit-downloader | ph-downloader | phdler-telegram-bot |
| :--- | :--- | :--- | :--- |
| **Status** | Produktion | Produktion | Produktion |
| **Typ** | Nomad Batch (periodic) | Nomad Batch (periodic) | Nomad Service (headless) |
| **Deployment** | `batch-jobs/reddit_downloader.nomad` | `batch-jobs/ph_downloader.nomad` | `services/phdler-telegram-bot.nomad` |
| **Schedule** | Taeglich 02:00 UTC (03:00 CH) | Taeglich 02:30 UTC (03:30 CH) | Dauerhaft laufend |
| **Stash-Integration** | Ja (Scan + Generate) | Ja (Scan + Generate) | Nein (steuert ph-downloader) |
| **Telegram-Benachrichtigung** | Ja (Ergebnis-Report) | Ja (auto-delete nach 30 min) | Ja (interaktiver Bot) |
| **Prioritaet** | -- (Batch) | -- (Batch) | 30 |

## Workflow

```d2
direction: down

Trigger: Trigger {
  style.stroke-dash: 4
  CRON1: "Cron: 02:00 UTC" { style.border-radius: 8 }
  CRON2: "Cron: 02:30 UTC" { style.border-radius: 8 }
  TG: Telegram Chat { style.border-radius: 8 }
}

Bot: Telegram Bot (Service) {
  style.stroke-dash: 4
  TGBOT: "phdler-telegram-bot list, add, start, status" { style.border-radius: 8 }
}

Batch: Batch Jobs {
  style.stroke-dash: 4
  RD: "reddit-downloader (BDFR)" { style.border-radius: 8 }
  PH: "ph-downloader (phdler.py + yt-dlp)" { style.border-radius: 8 }
}

Stash: Stash (Media Organizer) {
  style.stroke-dash: 4
  API: "GraphQL API /graphql" { style.border-radius: 8 }
  SCAN: metadataScan { style.border-radius: 8 }
  GEN: metadataGenerate { style.border-radius: 8 }
}

Storage: Storage {
  style.stroke-dash: 4
  NFS: "NFS nfs-logs Volume" { shape: cylinder }
}

Notify: Benachrichtigung {
  style.stroke-dash: 4
  TGAPI: Telegram API { style.border-radius: 8 }
}

Trigger.CRON1 -> Batch.RD
Trigger.CRON2 -> Batch.PH
Trigger.TG -> Bot.TGBOT
Bot.TGBOT -> Batch.PH: Nomad API: force periodic
Bot.TGBOT -> Storage.NFS: phdler.py: add/list
Batch.RD -> Storage.NFS
Batch.PH -> Storage.NFS
Batch.RD -> Stash.API: bei neuen Downloads
Batch.PH -> Stash.API
Stash.API -> Stash.SCAN
Stash.SCAN -> Stash.GEN
Batch.RD -> Notify.TGAPI
Batch.PH -> Notify.TGAPI
```

## Komponenten

### reddit-downloader

Laeuft taeglich um 03:00 Uhr (CH) und nutzt [BDFR](https://github.com/aliparlakci/bulk-downloader-for-reddit) (Bulk Downloader for Reddit), um gespeicherte Posts des konfigurierten Reddit-Accounts herunterzuladen.

**Ablauf:**

1. BDFR installieren und mit Reddit OAuth-Credentials authentifizieren
2. Gespeicherte Posts herunterladen (dedupliziert, sortiert nach `new`)
3. Redgifs-Module ist deaktiviert (429 Rate-Limit-Probleme)
4. Bei neuen Downloads: Stash Library Scan und Generate triggern
5. Ergebnis-Report ueber Telegram senden

**Retry-Logik:** Bis zu 3 Versuche mit 10 Minuten Pause zwischen den Versuchen bei Rate-Limit-Problemen.

**Vault Secrets:**

| Pfad | Keys |
| :--- | :--- |
| `kv/data/reddit` | `client_secret`, `user_token` |
| `kv/data/telegram` | `bot_token`, `chat_id` |
| `kv/data/stash` | `api_key` |

### ph-downloader

Laeuft taeglich um 03:30 Uhr (CH), 30 Minuten nach dem reddit-downloader, um Ressourcenkonflikte zu vermeiden. Nutzt `phdler.py` (ein Python-Script im NFS-Volume) zusammen mit `yt-dlp` fuer den Download.

**Ablauf:**

1. Abhaengigkeiten installieren (`yt-dlp`, `requests`, `beautifulsoup4`)
2. `phdler.py start` ausfuehren (liest Download-Liste aus SQLite-Datenbank)
3. Stash Library Scan und Generate triggern
4. Ergebnis-Report ueber Telegram senden (wird nach 30 Minuten automatisch geloescht)

**Vault Secrets:**

| Pfad | Keys |
| :--- | :--- |
| `kv/data/telegram` | `bot_token`, `chat_id` |
| `kv/data/stash` | `api_key` |

### phdler-telegram-bot

Ein dauerhaft laufender Service ohne Web-UI, der Telegram-Nachrichten per Long Polling empfaengt und Befehle ausfuehrt.

**Befehle:**

| Befehl | Beschreibung |
| :--- | :--- |
| `list` | Alle Items in der phdler-Datenbank anzeigen |
| `add <url>` | Neue URL zur Download-Liste hinzufuegen |
| `start` | ph-downloader Batch Job sofort starten (Nomad Force-Run) |
| `status` | Nomad Job-Status des ph-downloaders anzeigen |
| `help` | Hilfe anzeigen |

**Technische Details:**

- Nutzt die Nomad HTTP API (`nomad.service.consul:4646`) um den Batch Job zu triggern
- Liest direkt die SQLite-Datenbank des phdler-Scripts
- Python-Script wird als Nomad Template inline im Job definiert
- Polling-Intervall: 3 Sekunden

::: warning Sicherheit
Der Telegram Bot Token ist aktuell direkt im Nomad Job Template hinterlegt, nicht in Vault. Nur Nachrichten von der konfigurierten `TELEGRAM_CHAT_ID` werden verarbeitet.
:::

## Konfiguration

### Ressourcen

| Komponente | CPU | RAM | RAM Max |
| :--- | :--- | :--- | :--- |
| reddit-downloader | 1024 MHz | 2048 MB | 4096 MB |
| ph-downloader | 3072 MHz | 256 MB | 512 MB |
| phdler-telegram-bot | 128 MHz | 128 MB | 256 MB |

### Node-Affinitaet

Alle drei Komponenten haben eine negative Affinitaet fuer `vm-nomad-client-04` (bevorzugen `05` oder `06`), werden aber bei Bedarf auch dort gescheduled.

### Timing

Die Batch Jobs laufen gestaffelt, um gleichzeitigen NFS-Zugriff und CPU-Last zu minimieren:

1. **03:00 CH:** reddit-downloader startet
2. **03:30 CH:** ph-downloader startet (nach reddit-downloader)

`prohibit_overlap = true` bei beiden Jobs verhindert, dass eine neue Ausfuehrung startet, waehrend die vorherige noch laeuft.

## Verwandte Seiten

- [Stash](../stash/index.md) -- Media Organizer, wird von den Batch Jobs ueber die API aktualisiert
- [Video-Download-Tools](../video-download/index.md) -- Manuelle Download-UIs
