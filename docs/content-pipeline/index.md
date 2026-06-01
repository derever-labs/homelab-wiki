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

Fünf Komponenten bilden die automatisierte Content-Akquisition-Pipeline: vier periodische Batch Jobs laden Inhalte herunter und ein Telegram Bot ermöglicht die Steuerung per Chat.

## Übersicht

| Attribut | Wert |
|----------|------|
| reddit-downloader | Nomad Job `batch-jobs/reddit_downloader.nomad` (Periodic Batch) |
| ph-downloader | Nomad Job `batch-jobs/ph_downloader.nomad` (Periodic Batch) |
| phdler-telegram-bot | Nomad Job `services/phdler-telegram-bot.nomad` (Service, headless) |
| reddit_gallery_dl | Nomad Job `batch-jobs/reddit_gallery_dl.nomad` (Periodic Batch) |
| reddit_gallery_dl_backfill | Nomad Job `batch-jobs/reddit_gallery_dl_backfill.nomad` (Periodic Batch) |

Die beiden gallery-dl-Jobs laden Reddit-Galerien via gallery-dl; `reddit_gallery_dl_backfill` ist die Backfill-Variante für historische Inhalte.

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

Läuft täglich um 03:00 Uhr (CH) und nutzt [BDFR](https://github.com/aliparlakci/bulk-downloader-for-reddit) (Bulk Downloader for Reddit), um gespeicherte Posts des konfigurierten Reddit-Accounts herunterzuladen.

**Ablauf:** Gespeicherte Posts via BDFR (Reddit OAuth) herunterladen, dedupliziert -> bei neuen Downloads Stash-Scan + Generate -> Telegram-Ergebnis-Report. Details siehe Job-Datei.

Das Redgifs-Modul ist wegen 429-Rate-Limits deaktiviert. Bei Rate-Limit-Problemen bis zu 3 Versuche mit 10 Minuten Pause.

**Vault Secrets:**

| Pfad | Keys |
| :--- | :--- |
| `kv/data/reddit` | `client_secret`, `user_token` |
| `kv/data/shared/stash` | `api_key` |

Telegram-Benachrichtigungen laufen über den `telegram-relay`-Service (eigener Bot Token in Vault), der downloader liest selbst kein Telegram-Secret.

### ph-downloader

Läuft täglich um 03:30 Uhr (CH), 30 Minuten nach dem reddit-downloader, um Ressourcenkonflikte zu vermeiden. Nutzt `phdler.py` (ein Python-Script im NFS-Volume) zusammen mit `yt-dlp` für den Download.

**Ablauf:** Download via `phdler.py` (Liste aus SQLite-Datenbank) -> Stash-Scan + Generate -> Telegram-Ergebnis-Report. Details siehe Job-Datei.

**Vault Secrets:**

| Pfad | Keys |
| :--- | :--- |
| `kv/data/shared/stash` | `api_key` |

Telegram-Benachrichtigungen laufen über den `telegram-relay`-Service, der downloader liest selbst kein Telegram-Secret.

### phdler-telegram-bot

Ein dauerhaft laufender Service ohne Web-UI, der Telegram-Nachrichten per Long Polling empfängt und Befehle ausführt.

**Befehle:**

| Befehl | Beschreibung |
| :--- | :--- |
| `list` | Alle Items in der phdler-Datenbank anzeigen |
| `add <url>` | Neue URL zur Download-Liste hinzufügen |
| `start` | ph-downloader Batch Job sofort starten (Nomad Force-Run) |
| `status` | Nomad Job-Status des ph-downloaders anzeigen |
| `help` | Hilfe anzeigen |

**Technische Details:**

- Nutzt die Nomad HTTP API (`nomad.service.consul:4646`) um den Batch Job zu triggern
- Liest direkt die SQLite-Datenbank des phdler-Scripts
- Python-Script wird als Nomad Template inline im Job definiert
- Polling-Intervall: 3 Sekunden

Der Bot Token kommt aus Vault (`kv/data/shared/telegram`). Nur Nachrichten von der konfigurierten `TELEGRAM_CHAT_ID` werden verarbeitet.

## Konfiguration

Ressourcen: Siehe die jeweiligen Nomad Jobs (`batch-jobs/` und `services/`).

### Node-Affinität

Alle drei Komponenten haben eine negative Affinität für `vm-nomad-client-04` (bevorzugen `05` oder `06`), werden aber bei Bedarf auch dort gescheduled.

### Timing

Die Batch Jobs laufen gestaffelt (reddit-downloader 03:00 CH, ph-downloader 03:30 CH), um gleichzeitigen NFS-Zugriff und CPU-Last zu minimieren. `prohibit_overlap = true` bei beiden Jobs verhindert, dass eine neue Ausführung startet, während die vorherige noch läuft.

## Verwandte Seiten

- [Stash](../stash/index.md) -- Media Organizer, wird von den Batch Jobs über die API aktualisiert
- [Video-Download-Tools](../video-download/index.md) -- Manuelle Download-UIs
