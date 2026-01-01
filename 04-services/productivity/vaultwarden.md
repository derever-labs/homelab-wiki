---
title: Vaultwarden
description: Passwort Manager (Bitwarden API kompatibel)
published: true
date: 2025-12-26T19:35:00+00:00
tags: service, security, nomad
editor: markdown
---

# Vaultwarden

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [p.ackermannprivat.ch](https://p.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/vaultwarden.nomad`) |

## Beschreibung
Vaultwarden ist ein in Rust geschriebener Passwort-Server, der mit den offiziellen Bitwarden-Clients kompatibel ist.

## Konfiguration
- **Datenbank:** SQLite (`db.sqlite3`), repliziert via Litestream auf NAS.
- **Backups:** Neben Litestream werden tägliche Snapshots des `/nfs/docker/vaultwarden` Verzeichnisses empfohlen.

## Sicherheit
Der Zugriff ist zusätzlich durch Traefik OAuth2 geschützt (je nach Konfiguration). Die Kommunikation erfolgt ausschliesslich verschlüsselt via HTTPS.

---
*Letztes Update: 26.12.2025*
