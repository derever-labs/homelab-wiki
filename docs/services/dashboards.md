---
title: Dashboards
description: Flame als oeffentliche Startseite und Homepage als internes Dashboard
tags:
  - service
  - dashboard
  - nomad
---

# Dashboards

## Uebersicht

Zwei Dashboard-Tools fuer unterschiedliche Zielgruppen: Flame als oeffentlich zugaengliche Startseite und Homepage als internes Administrations-Dashboard.

| Attribut | Flame (Public) | Flame (Intra) | Homepage |
| :--- | :--- | :--- | :--- |
| **Zweck** | Oeffentliche Startseite | Internes Admin-Dashboard | Internes Dashboard (Ersatz-Kandidat) |
| **Status** | Produktion | Produktion | Produktion |
| **URL** | [welcome.ackermannprivat.ch](https://welcome.ackermannprivat.ch) | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/flame.nomad`) | Nomad Job (`services/flame-intra.nomad`) | Nomad Job (`services/homepage-intra.nomad`) |
| **Image** | `pawelmalak/flame` | `pawelmalak/flame` | `gethomepage/homepage` |
| **Storage** | NFS `/nfs/docker/flame/data` | NFS `/nfs/docker/flame-intra/data` | NFS `/nfs/docker/homepage-intra/config` |
| **Auth** | `public-guest-chain-v2@file` (OAuth Guest) | `admin-chain-v2@file` (OAuth Admin) | `admin-chain-v2@file` (OAuth Admin) |
| **Vault Secrets** | `kv/data/flame` | `kv/data/flame` | Keine |
| **Ressourcen** | 256 MB (max 1 GB) | 256 MB (max 1 GB) | 256 MB (max 512 MB) |

## Zweck und Unterschied

### Flame

Flame ist ein einfaches Application Dashboard mit Bookmark-Verwaltung. Es laeuft in zwei getrennten Instanzen:

- **Public (`welcome.ackermannprivat.ch`):** Oeffentlich zugaengliche Startseite mit Links zu externen Services. Geschuetzt durch `public-guest-chain-v2` (CrowdSec + OAuth2 Guest-Gruppe).
- **Intra (`intra.ackermannprivat.ch`):** Internes Dashboard mit Links zu allen Admin-Tools und Services. Geschuetzt durch `admin-chain-v2` (OAuth2 Admin-Gruppe).

Beide Instanzen verwenden das gleiche Docker-Image, aber getrennte NFS-Volumes und unterschiedliche Traefik-Middleware-Chains.

### Homepage

Homepage (`gethomepage/homepage`) ist ein moderneres Dashboard mit Service-Widget-Integration (z.B. Live-Status, CPU-Auslastung). Es ist als moeglicher Ersatz fuer Flame Intra deployed und teilt sich die Domain `intra.ackermannprivat.ch`.

::: warning Gleiche Domain
Flame Intra und Homepage verwenden beide `intra.ackermannprivat.ch`. Nur einer der beiden kann gleichzeitig aktiv geroutet werden. Im Nomad-Cluster entscheidet der aktive Job, welcher Service den Traffic erhaelt.
:::

## Vault Secrets

| Pfad | Keys | Verwendet von |
| :--- | :--- | :--- |
| `kv/data/flame` | `password` | Flame (Public + Intra) |

## Verwandte Seiten

- [Traefik Reverse Proxy](./core/traefik.md) -- Ingress und Middleware-Chains (public-guest vs. admin)
- [Traefik Middleware Chains](../platforms/traefik-middlewares.md) -- Unterschied public-guest vs. admin Chains
- [CrowdSec](../platforms/crowdsec.md) -- IP-Blocking für die öffentliche Flame-Instanz
