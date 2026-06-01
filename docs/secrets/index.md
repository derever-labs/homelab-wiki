---
title: Secrets (Claude-Agent)
description: PRIVAT-Agent-Vault für Claude Code im Homelab
tags:
  - secrets
  - 1password
  - claude-code
---

# Secrets (Claude-Agent)

Diese Seite dokumentiert den PRIVAT-Agent-Vault -- den 1Password-Service-Account, den Claude Code für Homelab-Arbeit verwendet. Für die generelle Credential-Übersicht im Homelab siehe [Zugangsdaten](../_referenz/credentials.md).

## Übersicht

| Attribut | Wert |
| --- | --- |
| Deployment | Kein Nomad-Job, lokaler Claude-Code-SessionStart-Hook |
| Auth | 1Password Service Account, biometrischer Token-Bezug |
| Secrets | 1Password Vault `PRIVAT Agent` |

## Vaults

**PRIVAT Agent Token** -- persönlicher Vault des Operators, biometrisch geschützt. Enthält den Service Account Token für den privaten Agent-Vault und wird beim Session-Start einmalig gelesen.

**PRIVAT Agent** -- geteilter Vault für Homelab-Automatisierung. Enthält unter anderem:

- Nomad Home Token, Vault Token Privat, Consul Bootstrap Token
- SSH-Privat, Cloudflare DNS API, Synology NAS, OpenAI API
- Arr-Stack (Prowlarr, Radarr, Sonarr, SABnzbd, LazyLibrarian)
- Monitoring-SMTP, Telegram-Bots, Uptime-Kuma

## Service Account

Ein 1Password Service Account mit Read-Only-Zugriff auf den Agent-Vault. Der Token wird aus dem persönlichen Vault `PRIVAT Agent Token` gelesen, in `/tmp/op-token-privat` mit chmod 600 gecacht und für nachfolgende Aufrufe wiederverwendet.

## Drei-Stufen-Konzept

Das Secret-Handling arbeitet identisch zum DCLab in drei Stufen:

- **Session-Init mit Biometrie** -- Token einmal pro Session via TouchID nach `/tmp` gecacht.
- **Discovery ohne Wert-Exposure** -- Item-Index `/tmp/op-index-privat.json` zum Finden von Items/Feldern, ohne dass ein Secret-Wert in den Kontext fliesst.
- **Secret-Nutzung ohne Kontext-Leak** -- Befehle laufen über `op run --env-file`, der Wert lebt nur im Child-Prozess und wird in stdout/stderr maskiert.

## Item-Konvention

- Neue Items als **LOGIN** oder **PASSWORD** anlegen (nie API_CREDENTIAL, SSH_KEY etc.) -- so ist der Token-Wert immer unter `op://vault/item/password` erreichbar und kategorie-abhängige Lookup-Bugs entfallen.
- URLs in die **urls-Sektion** (Website-Felder) eintragen, nicht in notesPlain oder ein Custom-Feld.

## Rotation

1Password Service Account Tokens laufen **nicht** automatisch ab. Regelmässige Rotation ist Pflicht. Der SessionStart-Hook warnt, wenn das Token-File älter als die Schwelle `OP_TOKEN_WARN_AGE` ist (Default: 90 Tage, konfigurierbar).

## Verwandte Seiten

- [Zugangsdaten](../_referenz/credentials.md) -- kanonische Liste aller Credential-Speicherorte im Homelab
- [Secrets-Architektur](../_querschnitt/secrets-architecture.md) -- Bootstrap-Trust und 1Password-zu-Vault-Migration
- [Vault](../vault/) -- Cluster-Secret-Store für Service-Secrets zur Laufzeit
- [Claude-Task-Tracking](../_querschnitt/claude-task-tracking.md) -- ClickUp-Integration für Claude-Sessions
