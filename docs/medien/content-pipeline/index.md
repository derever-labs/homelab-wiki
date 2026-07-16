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

Drei Komponenten bilden die automatisierte Content-Akquisition-Pipeline: zwei periodische Batch Jobs laden Inhalte herunter und ein Telegram Bot ermöglicht die Steuerung per Chat.

## Übersicht

| Attribut | Wert |
|----------|------|
| reddit-gallery-dl | Nomad Job `batch-jobs/reddit_gallery_dl.nomad` (Periodic Batch) |
| ph-downloader | Nomad Job `batch-jobs/ph_downloader.nomad` (Periodic Batch) |
| phdler-telegram-bot | Nomad Job `services/phdler-telegram-bot.nomad` (Service, headless) |

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
  GDL: "reddit-gallery-dl\n(gallery-dl)" { style.border-radius: 8 }
  PH: "ph-downloader\n(phdler.py + yt-dlp)" { style.border-radius: 8 }
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

### reddit-gallery-dl

Läuft täglich um 02:00 UTC und lädt mit [gallery-dl](https://github.com/mikf/gallery-dl) die gespeicherten Posts des konfigurierten Reddit-Accounts (Reddit OAuth) herunter. Löste am 16.07.2026 den früheren BDFR-Job (`reddit_downloader.nomad`) ab, der zu ihm redundant war: gallery-dl bringt natives Rate-Limiting, Dedupe über eine Archive-Datenbank statt Hash-Scan, JSON-Metadata-Sidecars pro Datei und funktionierende Redgifs-/Imgur-Extraktoren.

**Ablauf:** Gespeicherte Posts herunterladen, dedupliziert über die Archive-Datenbank -> bei neuen Downloads Stash-Scan + Generate -> Telegram-Ergebnis-Report. Details siehe Job-Datei.

Telegram-Benachrichtigungen laufen über den `telegram-relay`-Service (eigener Bot Token in Vault), der downloader liest selbst kein Telegram-Secret. Die Vault-Secrets-Zugriffe stehen in der [Content-Pipeline Referenz](./referenz.md).

### ph-downloader

Läuft täglich um 02:30 UTC, 30 Minuten nach dem reddit-gallery-dl, um Ressourcenkonflikte zu vermeiden. Nutzt `phdler.py` (ein Python-Script im NFS-Volume) zusammen mit `yt-dlp` für den Download.

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

Der ph-downloader und der phdler-telegram-bot haben eine negative Affinität für `vm-nomad-client-04` (bevorzugen `05` oder `06`), werden aber bei Bedarf auch dort gescheduled. Der reddit-gallery-dl trägt keine Node-Affinität.

### Timing

Die Batch Jobs laufen gestaffelt (reddit-gallery-dl 02:00 UTC, ph-downloader 02:30 UTC), um gleichzeitigen NFS-Zugriff und CPU-Last zu minimieren. `prohibit_overlap = true` bei beiden Jobs verhindert, dass eine neue Ausführung startet, während die vorherige noch läuft.

## Verwandte Seiten

- [Content-Pipeline Referenz](./referenz.md) -- Vault-Secrets-Zugriffe und Telegram-Bot-Befehle
- [Stash](../../stash/index.md) -- Media Organizer, wird von den Batch Jobs über die API aktualisiert
- [Video-Download-Tools](../../video-download/index.md) -- Manuelle Download-UIs
