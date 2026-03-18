---
title: Paperless-ngx
description: Dokumenten-Management-System
tags:
  - service
  - office
  - nomad
---

# Paperless-ngx

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [paperless.ackermannprivat.ch](https://paperless.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/paperless-simple.nomad`) |

## Beschreibung
Paperless-ngx digitalisiert physische Dokumente, macht sie durchsuchbar (OCR) und organisiert sie automatisch.

## Konfiguration
- **Media:** Alle Dokumente liegen unter `/nfs/docker/paperless/media/`.
- **Datenbank:** PostgreSQL (als separater Nomad Task oder extern).
- **Consumption:** Neue Dokumente werden über das Verzeichnis `/nfs/docker/paperless/consume/` automatisch importiert.

---
