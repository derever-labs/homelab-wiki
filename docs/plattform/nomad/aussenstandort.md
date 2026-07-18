---
title: Nomad Aussenstandort
description: Client-only Nomad-Knoten am Aussenstandort Dottikon über Tailscale-WAN
tags:
  - nomad
  - aussenstandort
  - edge
  - tailscale
---

# Nomad Aussenstandort

Der Homelab-Cluster erstreckt sich mit einem einzelnen Worker über den Standort Lenzburg hinaus: `nomad-edge-dottikon` ist ein reiner Nomad-Client an der Aussenstelle Dottikon, angebunden über das Tailscale-WAN, ohne eigene Control-Plane. Er trägt Batch-Workloads mit lokalem Datenbezug, während die gesamte Steuerung zentral in Lenzburg bleibt.

## Übersicht

| Attribut | Wert |
|----------|------|
| Client-Node | `nomad-edge-dottikon` (Ubuntu-LXC, CT 903 auf pve-01-nana) |
| Standort | Dottikon (Aussenstelle Nana) |
| Datacenter / Node-Pool | `dottikon` / `edge` |
| Anbindung | Client-only via Tailscale-WAN an den Lenzburg-Cluster |
| Service Discovery | Provider `nomad` (kein lokaler Consul-Agent) |
| Deployment | Terraform `terraform/proxmox-edge/` und Runbook `docs/runbooks/nomad-edge-rollout.md` (Repo `homelab-hashicorp-stack`) |
| Zweck | Batch-Workloads mit lokalem Datenbezug, primär ffmpeg-Timelapse-Render (Intel-QSV) |

## Rolle im Stack

Der Edge-Client erweitert den Lenzburg-Cluster um genau einen Worker am Aussenstandort, ohne dort Server, Consul oder Vault zu betreiben. Damit bleibt die vollständige Steuerung (Scheduling, periodic dispatch, Secrets) zentral in Lenzburg, während Workloads mit lokalem Datenbezug physisch in Dottikon laufen. Der Knoten ist bewusst als isolierter Sonderfall angelegt und nicht Teil des regulären Worker-Pools.

## Architektur

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

lenzburg: Cluster Lenzburg {
  class: container

  servers: Nomad Server Cluster {
    class: node
    tooltip: "3 Server, Raft-Konsens, periodic dispatch"
  }
  consul: Consul DNS {
    class: node
    tooltip: "Port 8600, Service Discovery per .consul"
  }
}

dottikon: Aussenstelle Dottikon {
  class: container

  edge: nomad-edge-dottikon {
    class: node
    tooltip: "Client-only, datacenter dottikon, node_pool edge"
  }
  dnsmasq: lokaler dnsmasq {
    class: node
    tooltip: "Forwardet .consul an die Consul-Server"
  }
  render: Timelapse-Render {
    class: node
    tooltip: "ffmpeg mit Intel-QSV auf /dev/dri"
  }
}

servers -> edge: "1 Scheduling und Heartbeat (RPC 4647 via Tailscale)" {
  style.stroke: "#2563eb"
  style.stroke-dash: 3
}
edge -> dnsmasq: "2 DNS-Lookup" {
  style.stroke: "#16a34a"
}
dnsmasq -> consul: "3 .consul-Forward (DNS 8600)" {
  style.stroke: "#16a34a"
}
edge -> render: "4 dispatch node_pool edge" {
  style.stroke: "#7c3aed"
}
```

Kurzablauf:

1. Der Server-Cluster in Lenzburg plant die Jobs und hält den Heartbeat zum Edge-Client -- die gesamte Steuerung läuft über die Tailscale-Anbindung (Abschnitt [Anbindung](#anbindung-uber-tailscale)).
2. Der Client hat keinen lokalen Consul-Agent; ein lokaler dnsmasq forwardet `.consul`-Anfragen an die Consul-Server auf Port 8600 (Abschnitt [Namensauflösung](#namensauflosung-ohne-lokalen-consul)).
3. So werden Cluster-Namen am Aussenstandort aufgelöst, ohne dass dort eine Control-Plane läuft.
4. Jobs mit `node_pool = "edge"` werden auf dem Client ausgeführt, primär der Timelapse-Render mit Intel-QSV (Abschnitt [Workload](#workload-und-datenbezug)).

## Anbindung über Tailscale

Die Anbindung läuft über das Tailscale-WAN. Der Standort-Router `pve-01-nana` ist Subnet-Router für das Dottikon-Netz; der Edge-Client advertised seine eigene Tailscale-IP als Nomad-Adresse (TS-IP-Konvention), damit Server und Client über das Overlay kommunizieren. Ein lokaler Consul-Agent ist bewusst nicht vorhanden -- der WAN-Gossip wäre über eine Mobilfunk-Strecke zu fragil, und ein Service-Mesh ist am Aussenstandort damit prinzipiell nicht möglich. Details zur Tailnet-Topologie und zur Subnet-Route: [Tailscale](../../netz/netzwerk/tailscale.md).

::: info Tailscale ist ein Stop-Gap
Die WAN-Anbindung über Tailscale ist eine Übergangslösung (ADR-0003 im `homelab-hashicorp-stack`). Der Endzustand ist ein UniFi-SD-WAN, sobald an beiden Standorten Public-IPs verfügbar sind. Die zugehörigen Adressen liegen ausschliesslich im Ansible-Inventory und in Terraform, nicht im Wiki. Hintergrund: [Tailscale](../../netz/netzwerk/tailscale.md) und [Standorte](../../netz/netzwerk/standorte.md).
:::

## Namensauflösung ohne lokalen Consul

Ohne lokalen Consul-Agent muss der Edge-Client Cluster-Namen dennoch auflösen können. Ein lokaler dnsmasq übernimmt das: Er forwardet `.consul`-Anfragen an die Consul-Server auf Port 8600 -- dasselbe Conditional-Forwarding-Muster, das im Homelab die Pi-hole-Resolver anwenden. Unter der Consul-ACL mit `default_policy = deny` bleibt die DNS-Auflösung nur funktionsfähig, weil Consul über einen dedizierten DNS-Token (`acl.tokens.dns`) verfügt; ohne ihn würde die Auflösung von `.consul` verweigert. Die Consul-seitige DNS-Kette beschreibt [DNS-Architektur](../../netz/dns/index.md).

## Isolation über Datacenter und Node-Pool

Der Edge-Client ist über zwei Ebenen vom regulären Cluster getrennt: das eigene Datacenter `dottikon` und den Node-Pool `edge`. Jobs laufen nur dann am Aussenstandort, wenn sie explizit `node_pool = "edge"` setzen. Cluster-weite System-Jobs -- etwa der Alloy Log-Collector -- zielen auf das Haupt-Datacenter und landen deshalb nie auf dem Edge-Client. Am Aussenstandort gibt es zudem kein CNI- bzw. Bridge-Networking und kein Alloy-Log-Shipping; Edge-Jobs nutzen den Service-Provider `nomad` statt Consul.

## Workload und Datenbezug

Der Knoten trägt Batch-Workloads, deren Daten am Standort Dottikon anfallen und deren Bulk-Transport über das WAN sich nicht lohnt. Hauptanwendung ist der ffmpeg-Timelapse-Render, der Intel-QuickSync (QSV) über einen `/dev/dri`-Passthrough der N100-iGPU nutzt. Das folgt dem gleichen Passthrough-Muster wie die iGPU-gestützten Lenzburg-Clients ([Proxmox Referenz](../../infrastruktur/proxmox/referenz.md)), nur physisch am Aussenstandort. Die Job-Definitionen liegen wie alle Jobs im Repo (SSOT): [Nomad Jobs](../../_referenz/nomad-jobs.md).

## Bewusste Einschränkungen

Die Architektur nimmt mehrere Trade-offs bewusst in Kauf, die aus der WAN-Anbindung und der zentralen Steuerung folgen:

- **WAN über Mobilfunk:** Die Verbindung nach Dottikon ist eine Mobilfunk-Strecke. Der Nomad-Kontrollverkehr (Scheduling, Heartbeat, DNS) ist unkritisch, Bulk-Datentransfer über das WAN wird dagegen bewusst vermieden -- daher der lokale Datenbezug der Edge-Jobs.
- **Laufende Allocations überstehen Verbindungsverluste:** Bereits platzierte Allocations bleiben bei kurzen WAN-Ausfällen erhalten (disconnect-Konfiguration, siehe [Nomad Referenz](./referenz.md) und [Nomad Timeouts](./timeouts.md)).

::: warning Kein Offline-Scheduling am Aussenstandort
Der periodic dispatch und jede Neuplatzierung laufen über die Server in Lenzburg. Fällt die Server-Seite oder das WAN aus, startet am Aussenstandort nichts Neues mehr -- nur bereits laufende Allocations überleben den Verbindungsverlust. Der Edge-Client ist damit kein autonomer Standort, sondern ein ferngesteuerter Worker.
:::

## Provisionierung und Betrieb

Anlage, Rollout und Betrieb des Edge-Clients sind vollständig im Repo `homelab-hashicorp-stack` beschrieben und dort SSOT: die Proxmox-Provisionierung unter `terraform/proxmox-edge/`, der Schritt-für-Schritt-Ablauf im Runbook `docs/runbooks/nomad-edge-rollout.md`. Dieses Wiki dupliziert weder die Terraform-Parameter noch die Rollout-Schritte.

## Verwandte Seiten

- [Nomad](./index.md) -- Übersicht und Architektur des Homelab-Clusters
- [Nomad Referenz](./referenz.md) -- Job-Konfigurationsmuster inkl. Restart, Reschedule und Disconnect
- [Nomad Timeouts](./timeouts.md) -- Timeout- und Disconnect-Parameter
- [Consul](../consul/index.md) -- Service Discovery und DNS im Cluster
- [Tailscale](../../netz/netzwerk/tailscale.md) -- Tailnet-Topologie, Subnet-Routen und ADR-0003
- [Standorte](../../netz/netzwerk/standorte.md) -- Die drei Homelab-Standorte im Detail
- [DNS-Architektur](../../netz/dns/index.md) -- DNS-Kette und Consul-Forwarding
- [Proxmox](../../infrastruktur/proxmox/index.md) -- Externe Standalone-Nodes inkl. pve-01-nana
- [Nomad Jobs](../../_referenz/nomad-jobs.md) -- Kanonische Übersicht aller Jobs
