---
title: Paperless-ngx
description: Dokumenten-Management-System
published: true
date: 2025-12-26T19:40:00+00:00
tags: service, office, nomad
editor: markdown
---

# Paperless-ngx

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [paper.ackermannprivat.ch](https://paper.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/paperless-simple.nomad`) |

## Beschreibung
Paperless-ngx digitalisiert physische Dokumente, macht sie durchsuchbar (OCR) und organisiert sie automatisch.

## Konfiguration
- **Media:** Alle Dokumente liegen unter `/nfs/docker/paperless/media/`.
- **Datenbank:** PostgreSQL (als separater Nomad Task oder extern).
- **Consumption:** Neue Dokumente werden über das Verzeichnis `/nfs/docker/paperless/consume/` automatisch importiert.

---
*Letztes Update: 26.12.2025*
