---
title: Dashboards
description: Flame als öffentliche Startseite und Homepage als internes Dashboard
tags:
  - service
  - dashboard
  - nomad
  - linstor
---

# Dashboards

Zwei Dashboard-Instanzen für unterschiedliche Zielgruppen: Flame als öffentlich zugängliche Startseite und Homepage als internes Administrations-Dashboard.

## Übersicht

**Flame (Public)**

| Attribut | Wert |
|----------|------|
| URL | [welcome.ackermannprivat.ch](https://welcome.ackermannprivat.ch) |
| Deployment | Nomad Job `services/flame.nomad` |
| Storage | Linstor CSI (`flame-data`) |
| Auth | `public-auth@file` (Authentik Guest) |
| Secrets | Vault `kv/data/flame` |

**Flame (Intra)**

| Attribut | Wert |
|----------|------|
| URL | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) |
| Deployment | Nomad Job `services/flame-intra.nomad` |
| Storage | Linstor CSI (`flame-intra-data`) |
| Auth | `intern-auth@file` (Authentik Admin) |
| Secrets | Vault `kv/data/flame` |

**Homepage**

| Attribut | Wert |
|----------|------|
| URL | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) (gleiche Domain wie Flame Intra) |
| Deployment | Nomad Job `services/homepage-intra.nomad` |
| Storage | Nomad Templates (embedded YAML, kein Volume) |
| Auth | `intern-auth@file` (Authentik Admin) |

## Zweck und Unterschied

### Flame

Flame ist ein einfaches Application Dashboard mit Bookmark-Verwaltung. Es läuft in zwei getrennten Instanzen:

- **Public (`welcome.ackermannprivat.ch`):** Öffentlich zugängliche Startseite mit Links zu externen Services. Geschützt durch `public-auth` (CrowdSec + Authentik ForwardAuth Guest-Gruppe).
- **Intra (`intra.ackermannprivat.ch`):** Internes Dashboard mit Links zu allen Admin-Tools und Services. Geschützt durch `intern-auth` (Authentik ForwardAuth Admin-Gruppe).

Beide Instanzen verwenden das gleiche Docker-Image, aber getrennte Linstor CSI Volumes und unterschiedliche Traefik-Middleware-Chains.

### Homepage

Homepage (`gethomepage/homepage`) ist ein moderneres Dashboard mit Service-Widget-Integration (z.B. Live-Status, CPU-Auslastung). Es ist als möglicher Ersatz für Flame Intra deployed und teilt sich die Domain `intra.ackermannprivat.ch`. Die gesamte Konfiguration (Services, Bookmarks, Settings, Widgets) ist als Nomad Templates direkt im Job eingebettet -- es gibt kein separates Storage-Volume.

::: warning Gleiche Domain
Flame Intra und Homepage verwenden beide `intra.ackermannprivat.ch`. Nur einer der beiden kann gleichzeitig aktiv geroutet werden. Im Nomad-Cluster entscheidet der aktive Job, welcher Service den Traffic erhält.
:::

## Vault Secrets

| Pfad | Keys | Verwendet von |
| :--- | :--- | :--- |
| `kv/data/flame` | `password` | Flame (Public + Intra) |

## Verwandte Seiten

- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress und Middleware-Chains (public-guest vs. admin)
- [Traefik Middleware Chains](../traefik/referenz.md) -- Unterschied public-guest vs. admin Chains
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking für die öffentliche Flame-Instanz
- [Linstor](../linstor-storage/index.md) -- CSI Storage für Flame-Instanzen
