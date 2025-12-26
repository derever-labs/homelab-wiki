---
title: Service Name
description: Kurzbeschreibung des Services
published: true
date: 2025-12-26T18:30:00+00:00
tags: service, nomad, docker
editor: markdown
---

# Service Name

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion / Test / Offline |
| **URL** | [service.ackermannprivat.ch](https://service.ackermannprivat.ch) |
| **Deployment** | Nomad Job / VM / Docker Host |
| **IP/Node** | 10.0.2.x / vm-nomad-client-xx |
| **Monitoring** | [Uptime Kuma](https://uptime.ackermannprivat.ch) |

## Beschreibung
Eine detailliertere Beschreibung, was der Service macht und warum er existiert.

## Konfiguration
### Nomad / Docker
* **Image:** `repo.example.com/image:tag`
* **Netzwerk:** Bridge / Host (Ports: 1234)
* **Volumes:**
  * `/nfs/data:/data` (Persistent)
  * `/tmp:/cache` (Volatil)

### Environment Variables
| Variable | Zweck |
| :--- | :--- |
| `TZ` | Europe/Zurich |
| `PUID/PGID` | 1000/1000 |

## Abhängigkeiten
- [ ] Datenbank (Postgres/Redis)
- [ ] Authentifizierung (Keycloak/Authelia)
- [ ] Speicher (NFS/Local)

## Maintenance & Runbook
### Update
Wie wird der Service aktualisiert? (z.B. `nomad job run service.nomad`)

### Backup
Welche Daten müssen gesichert werden? Pfade und Frequenz.

### Troubleshooting
Häufige Probleme und deren Lösung.

---
*Dokumentation erstellt am: 26.12.2025*