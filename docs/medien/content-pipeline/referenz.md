---
title: Content-Pipeline Referenz
description: Vault-Secrets-Zugriffe der Batch Jobs und Telegram-Bot-Befehle
tags:
  - service
  - media
  - nomad
  - referenz
---

# Content-Pipeline Referenz

Diese Seite listet die Vault-Secrets-Zugriffe der Batch Jobs und die Telegram-Bot-Befehle. Rolle, Architektur, Workflow und Komponenten stehen in [Content Pipeline (Übersicht)](./index.md).

## Vault Secrets

### reddit-gallery-dl

| Pfad | Keys |
| :--- | :--- |
| `kv/data/shared/reddit` | `client_secret`, `user_token` |
| `kv/data/shared/stash` | `api_key` |

### ph-downloader

| Pfad | Keys |
| :--- | :--- |
| `kv/data/shared/stash` | `api_key` |

## Telegram-Bot-Befehle

Befehle des `phdler-telegram-bot`:

| Befehl | Beschreibung |
| :--- | :--- |
| `list` | Alle Items in der phdler-Datenbank anzeigen |
| `add <url>` | Neue URL zur Download-Liste hinzufügen |
| `start` | ph-downloader Batch Job sofort starten (Nomad Force-Run) |
| `status` | Nomad Job-Status des ph-downloaders anzeigen |
| `help` | Hilfe anzeigen |

## Verwandte Seiten

- [Content Pipeline (Übersicht)](./index.md) -- Architektur, Workflow, Komponenten
