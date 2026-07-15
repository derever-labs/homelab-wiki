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

Vier Komponenten bilden die automatisierte Content-Akquisition-Pipeline: drei periodische Batch Jobs laden Inhalte herunter und ein Telegram Bot ermöglicht die Steuerung per Chat.

## Übersicht

| Attribut | Wert |
|----------|------|
| reddit-downloader | Nomad Job `batch-jobs/reddit_downloader.nomad` (Periodic Batch) |
| ph-downloader | Nomad Job `batch-jobs/ph_downloader.nomad` (Periodic Batch) |
| phdler-telegram-bot | Nomad Job `services/phdler-telegram-bot.nomad` (Service, headless) |
| reddit_gallery_dl | Nomad Job `batch-jobs/reddit_gallery_dl.nomad` (Periodic Batch) |

Der Job `reddit_gallery_dl` lädt Reddit-Galerien via gallery-dl.

## Workflow

```d2
direction: down

Trigger: Trigger {
  style.stroke-dash: 4
  CRON: "Cron\n(täglich nachts, gestaffelt)" { style.border-radius: 8 }
  TG: Telegram-Chat { style.border-radius: 8 }
}

TGBOT: "phdler-telegram-bot\n(Service: list, add, start, status)" { style.border-radius: 8 }

Batch: Batch Jobs {
  style.stroke-dash: 4
  RD: "reddit-downloader\n(BDFR)" { style.border-radius: 8 }
  PH: "ph-downloader\n(phdler.py + yt-dlp)" { style.border-radius: 8 }
  GDL: "reddit-gallery-dl\n(gallery-dl)" { style.border-radius: 8 }
}

STASH: "Stash\n(metadataScan + metadataGenerate)" { style.border-radius: 8 }
NFS: "NFS-Volume nfs-logs\n(Downloads, phdler.py, SQLite)" { shape: cylinder }
RELAY: telegram-relay { style.border-radius: 8 }

Trigger.CRON -> Batch
Trigger.TG -> TGBOT
TGBOT -> Batch.PH: "Nomad API: force periodic"
TGBOT -> NFS: "phdler.py: add / list"
Batch -> NFS: Downloads
Batch -> STASH: "Scan + Generate\nbei neuen Downloads"
Batch -> RELAY: Ergebnis-Report
```

## Komponenten

### reddit-downloader

Läuft täglich um 03:00 Uhr (CH) und nutzt [BDFR](https://github.com/aliparlakci/bulk-downloader-for-reddit) (Bulk Downloader for Reddit), um gespeicherte Posts des konfigurierten Reddit-Accounts herunterzuladen.

**Ablauf:** Gespeicherte Posts via BDFR (Reddit OAuth) herunterladen, dedupliziert -> bei neuen Downloads Stash-Scan + Generate -> Telegram-Ergebnis-Report. Details siehe Job-Datei.

Das Redgifs-Modul ist wegen 429-Rate-Limits deaktiviert. Bei Rate-Limit-Problemen bis zu 3 Versuche mit 10 Minuten Pause.

Telegram-Benachrichtigungen laufen über den `telegram-relay`-Service (eigener Bot Token in Vault), der downloader liest selbst kein Telegram-Secret. Die Vault-Secrets-Zugriffe stehen in der [Content-Pipeline Referenz](./referenz.md).

### ph-downloader

Läuft täglich um 03:30 Uhr (CH), 30 Minuten nach dem reddit-downloader, um Ressourcenkonflikte zu vermeiden. Nutzt `phdler.py` (ein Python-Script im NFS-Volume) zusammen mit `yt-dlp` für den Download.

**Ablauf:** Download via `phdler.py` (Liste aus SQLite-Datenbank) -> Stash-Scan + Generate -> Telegram-Ergebnis-Report. Details siehe Job-Datei.

Telegram-Benachrichtigungen laufen über den `telegram-relay`-Service, der downloader liest selbst kein Telegram-Secret. Die Vault-Secrets-Zugriffe stehen in der [Content-Pipeline Referenz](./referenz.md).

### phdler-telegram-bot

Ein dauerhaft laufender Service ohne Web-UI, der Telegram-Nachrichten per Long Polling empfängt und Befehle ausführt. Die vollständige Liste der Befehle steht in der [Content-Pipeline Referenz](./referenz.md).

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

- [Content-Pipeline Referenz](./referenz.md) -- Vault-Secrets-Zugriffe und Telegram-Bot-Befehle
- [Stash](../stash/index.md) -- Media Organizer, wird von den Batch Jobs über die API aktualisiert
- [Video-Download-Tools](../video-download/index.md) -- Manuelle Download-UIs
