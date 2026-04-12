---
title: Gatus
description: Öffentliche Status-Seite und Health-Check-Monitoring für alle Services
tags:
  - service
  - monitoring
  - nomad
  - status-page
---

# Gatus

Gatus ist die öffentliche Status-Seite des Homelabs. Es prüft periodisch die Erreichbarkeit aller konfigurierten Services und stellt die Ergebnisse als Dashboard dar. Die gesamte Konfiguration ist als Nomad Template eingebettet -- Gatus ist vollständig stateless.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [status.ackermannprivat.ch](https://status.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/gatus.nomad` |
| Storage | In-Memory (stateless) |
| Konfiguration | Nomad Template (eingebettet im Job) |
| Auth | `public-auth@file` (CrowdSec + Authentik ForwardAuth) |

## Architektur

```d2
direction: right

Internet: {
  style.stroke-dash: 4
  User: Besucher
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  Router: "Router: status.*\npublic-auth"
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  Gatus: "Gatus\n(Port 8080)"
  Config: "config.yaml\n(Nomad Template)"
}

Services: Überwachte Services {
  style.stroke-dash: 4
  S1: Service A
  S2: Service B
  S3: Service N
}

Internet.User -> Traefik.Router: HTTPS
Traefik.Router -> Nomad.Gatus
Nomad.Config -> Nomad.Gatus: template { style.stroke-dash: 5 }
Nomad.Gatus -> Services.S1: HTTP/TCP Checks
Nomad.Gatus -> Services.S2: HTTP/TCP Checks
Nomad.Gatus -> Services.S3: HTTP/TCP Checks
```

## Zweck

Gatus ist die öffentliche Status-Seite des Homelabs. Es prüft periodisch die Erreichbarkeit und Gesundheit aller konfigurierten Services via HTTP- und TCP-Checks und stellt die Ergebnisse als Dashboard dar.

**Abgrenzung zu anderen Monitoring-Tools:**

- **Gatus** -- Öffentliche Status-Seite, zeigt Verfügbarkeit aus Endnutzer-Sicht
- **Uptime Kuma** -- Internes Monitoring mit Push-Monitoren für Batch Jobs (siehe [Backup-Strategie](../backup/index.md))
- **CheckMK** -- Host-Level Monitoring (CPU, RAM, Disk)
- **Grafana/Loki** -- Metriken und Logs

## Konfiguration

Die gesamte Konfiguration ist als Nomad Template direkt im Job eingebettet (siehe `monitoring/gatus.nomad`). Gatus hat keine NFS-Abhängigkeit und ist vollständig stateless.

::: tip Stateless
Gatus speichert keine Daten persistent. Nach einem Neustart beginnt die Uptime-Historie von vorne. Dies ist bewusst so gewählt, da die Status-Seite den aktuellen Zustand zeigt, nicht die langfristige Historie.
:::

## Entscheidungslog

- **Gatus statt Uptime Kuma als Status-Seite gewählt**, weil Gatus als leichtgewichtige, config-basierte Lösung besser zur Infrastructure-as-Code-Philosophie passt. Uptime Kuma bleibt intern für Push-basiertes Monitoring (Batch Jobs).

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Uptime Kuma und Alloy
- [CheckMK Monitoring](../checkmk/index.md) -- Host-Level Monitoring
- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress mit public-auth
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking für die öffentliche Status-Seite
