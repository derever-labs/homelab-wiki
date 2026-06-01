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
| Auth | `public-auth@file` (Authentik Admin) |
| Secrets | Vault `kv/data/shared/flame` |

**Flame (Intra)**

| Attribut | Wert |
|----------|------|
| URL | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) |
| Deployment | Nomad Job `services/flame-intra.nomad` |
| Storage | Linstor CSI (`flame-intra-data`) |
| Auth | `intern-auth@file` (Authentik Admin) |
| Secrets | Vault `kv/data/shared/flame` |

**Homepage**

| Attribut | Wert |
|----------|------|
| URL | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) (gleiche Domain wie Flame Intra) |
| Deployment | Nomad Job `services/homepage-intra.nomad` |
| Storage | Nomad Templates (embedded YAML, kein Volume) |
| Auth | `intern-auth@file` (Authentik Admin) |

## Rolle im Stack

Die Dashboards sind die Einstiegspunkte ins Homelab: Flame Public liefert die öffentliche Startseite hinter CrowdSec und Authentik, Flame Intra und Homepage bieten die interne Service-Übersicht für Admins. Sie sitzen am Ingress hinter Traefik und bündeln die Links zu allen übrigen Services des Stacks. Zwei Systeme laufen parallel, weil Homepage als möglicher Ersatz für das ältere Flame Intra evaluiert wird.

## Zweck und Unterschied

Beide Flame-Instanzen (Public und Intra) verwenden das gleiche Docker-Image, aber getrennte Linstor CSI Volumes und unterschiedliche Traefik-Middleware-Chains. Homepage (`gethomepage/homepage`) ist ein moderneres Dashboard mit Service-Widget-Integration (z.B. Live-Status, CPU-Auslastung) und als möglicher Ersatz für Flame Intra deployed.

::: warning Gleiche Domain
Flame Intra und Homepage verwenden beide `intra.ackermannprivat.ch`. Nur einer der beiden kann gleichzeitig aktiv geroutet werden. Im Nomad-Cluster entscheidet der aktive Job, welcher Service den Traffic erhält.
:::

## Verwandte Seiten

- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress und Middleware-Chains (public-auth vs. intern-auth)
- [Traefik Middleware Chains](../traefik/referenz.md) -- Unterschied public-auth vs. intern-auth Chains
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking für die öffentliche Flame-Instanz
- [Linstor](../linstor-storage/index.md) -- CSI Storage für Flame-Instanzen
