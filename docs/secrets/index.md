---
title: Secrets (Claude-Agent)
description: PRIVAT-Agent-Vault für Claude Code im Homelab
tags:
  - secrets
  - 1password
  - claude-code
---

# Secrets für Claude-Agent

Diese Seite dokumentiert den PRIVAT-Agent-Vault -- den 1Password-Service-Account, den Claude Code für Homelab-Arbeit verwendet. Für die generelle Credential-Übersicht im Homelab siehe [Zugangsdaten](../_referenz/credentials.md).

## Vaults

**PRIVAT Agent Token** -- persönlicher Vault des Operators, biometrisch geschützt. Enthält den Service Account Token für den privaten Agent-Vault und wird beim Session-Start einmalig gelesen.

**PRIVAT Agent** -- geteilter Vault für Homelab-Automatisierung. Enthält unter anderem:

- Nomad Home Token, Vault Token Privat, Consul Bootstrap Token
- SSH-Privat
- Cloudflare DNS API
- MinIO NAS, MinIO Peer, Synology NAS
- OpenAI API
- Arr-Stack (Prowlarr, Radarr, Sonarr, SABnzbd, LazyLibrarian)
- Monitoring-SMTP, Telegram-Bots, Uptime-Kuma

## Service Account

Ein 1Password Service Account mit Read-Only-Zugriff auf den Agent-Vault. Der Token wird aus dem persönlichen Vault `PRIVAT Agent Token` gelesen, in `/tmp/op-token-privat` mit chmod 600 gecacht und für nachfolgende Aufrufe wiederverwendet.

## Drei-Stufen-Konzept

Das Secret-Handling arbeitet identisch zum DCLab in drei Stufen:

- **Session-Init mit Biometrie** -- Service-Account-Token wird einmal pro Session via TouchID aus dem persönlichen Vault geladen und in `/tmp` gecacht.
- **Discovery ohne Wert-Exposure** -- Der Item-Index liegt unter `/tmp/op-index-privat.json` und erlaubt Claude, Items und Felder zu finden, ohne dass irgendein Secret-Wert in den Kontext fliesst.
- **Secret-Nutzung ohne Kontext-Leak** -- Befehle mit Secrets laufen über `op run --env-file`, damit der Wert nur im Child-Prozess lebt und 1Password stdout/stderr aktiv maskiert.

## Item-Konvention

Neue Items werden als Kategorie **LOGIN** (mit Username) oder **PASSWORD** (nur Geheimnis) angelegt -- nicht als API_CREDENTIAL, SSH_KEY oder andere spezialisierte Kategorien. Der Grund liegt im Zugriffspfad von `op read`: bei LOGIN/PASSWORD ist der Token-Wert immer unter `op://vault/item/password` erreichbar, die primäre URL unter `op://vault/item/website`. Mit anderen Kategorien entstehen kategorie-abhängige Lookup-Regeln und Bugs, besonders wenn verschiedene Items gemischt werden.

URLs gehören in die **urls-Sektion** des Items (Website-Felder), nicht in notesPlain oder ein Custom-Feld.

## Rotation

1Password Service Account Tokens laufen **nicht** automatisch ab. Rotation alle 90 Tage ist Pflicht. Der SessionStart-Hook warnt, wenn das Token-File älter als die Schwelle `OP_TOKEN_WARN_AGE` ist (Default 90 Tage).
