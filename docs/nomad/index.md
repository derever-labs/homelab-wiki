---
title: Nomad
description: Workload Scheduler für Container im Homelab-Cluster
tags:
  - platform
  - hashicorp
  - nomad
  - scheduling
---

# Nomad

## Übersicht

Nomad ist der Workload-Scheduler des Homelabs. Zusammen mit Consul und Vault bildet er die Container-Plattform.

| Attribut | Wert |
|----------|------|
| URL | `http://10.0.2.104:4646` (UI intern) |
| Deployment | Ansible + Systemd |
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Rolle im Stack

Nomad ist der Workload-Scheduler. Er entscheidet auf welchem Worker-Node ein Container läuft, überwacht die Ausführung und sorgt für Restarts bei Fehlern. Zusammen mit Consul (Service Discovery) und Vault (Secrets) bildet Nomad die Container-Plattform des Homelabs.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

servers: Nomad Server Cluster {
  class: container

  S04: vm-nomad-server-04 {
    class: node
    tooltip: "10.0.2.104 | Port 4646 (API) / 4647 (RPC) / 4648 (Serf)"
  }
  S05: vm-nomad-server-05 {
    class: node
    tooltip: "10.0.2.105 | Port 4646 (API) / 4647 (RPC) / 4648 (Serf)"
  }
  S06: vm-nomad-server-06 {
    class: node
    tooltip: "10.0.2.106 | Port 4646 (API) / 4647 (RPC) / 4648 (Serf)"
  }

  S04 <-> S05: Raft {
    style.stroke: "#6b7280"
  }
  S05 <-> S06: Raft {
    style.stroke: "#6b7280"
  }
}

workers: Nomad Clients {
  class: container

  C04: vm-nomad-client-04 {
    class: node
    tooltip: "10.0.2.124 | 4 CPU, 14 GB RAM, Klasse: worker"
  }
  C05: vm-nomad-client-05 {
    class: node
    tooltip: "10.0.2.125 | 16 CPU, 74 GB RAM, Klasse: storage, iGPU"
  }
  C06: vm-nomad-client-06 {
    class: node
    tooltip: "10.0.2.126 | 16 CPU, 74 GB RAM, Klasse: storage, iGPU"
  }
}

Consul: Consul {
  class: node
  tooltip: "Port 8500 | Service Discovery, DNS, KV Store"
}

Vault: Vault {
  class: node
  tooltip: "Port 8200 | Secrets Management, KV v2"
}

servers -> workers: Job Placement (RPC :4647) {
  style.stroke: "#2563eb"
  tooltip: "Server weist Container den passenden Worker-Nodes zu"
}
workers -> Consul: Service Registration {
  style.stroke: "#2563eb"
  tooltip: "Consul Agent registriert gestartete Container als Services"
}
workers -> Vault: JWT Auth, Secrets lesen {
  style.stroke: "#7c3aed"
  tooltip: "Workload Identity JWT gegen Vault-Token tauschen, dann Secrets lesen"
}
servers -> Consul: Service Health {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
  tooltip: "Nomad nutzt Consul Health Checks fuer Task-Status"
}
servers -> Vault: Workload Identity Config {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
  tooltip: "Server stellt JWT fuer Tasks aus, Vault validiert via JWKS"
}
```

## Cluster-Topologie

Der Stack läuft auf 3 Server-Nodes und 3 Worker-Nodes, jeweils 1 pro Proxmox-Host. Die Server bilden einen Raft-Consensus-Cluster -- bei Ausfall eines Servers übernehmen die verbleibenden zwei.

- **Server-Nodes**: Nomad Server, Consul Server, Vault
- **Worker-Nodes**: Nomad Client, Consul Client, Docker
  - client-04: Klasse `worker` (kein DRBD)
  - client-05/06: Klasse `storage` (DRBD/Linstor, privileged containers)

Vollständige Host-/IP-/Spec-Tabellen: [Proxmox Cluster](../proxmox/index.md#hashicorp-stack-vms)

## Scheduler-Konfiguration

| Eigenschaft | Wert |
|-------------|------|
| Algorithmus | `spread` (gleichmässige Verteilung) |
| Service Preemption | Aktiv (seit 01.04.2026) |
| Batch Preemption | Aktiv |
| Memory Oversubscription | Aktiv |

**Preemption** erlaubt Nomad, niedrigprioritäre Jobs zu verdrängen, um Platz für höherprioritäre zu schaffen. Es gilt ein Mindest-Delta von 10 Prioritätspunkten -- ein Job mit Priorität 100 kann nur Jobs mit Priorität 90 oder tiefer verdrängen.

Konfiguration: `nomad operator scheduler get-config` zum Prüfen, `nomad operator scheduler set-config` zum Ändern. Die Einstellung wird über Raft repliziert. Details: [Betrieb](betrieb.md#preemption)

## Job Configuration

Alle Nomad Jobs folgen einheitlichen Mustern:

- **Docker** als Task Driver für alle Container
- **NFS Volumes** von `/nfs/docker/` für persistente Daten
- **Bridge Networking** mit Port Mappings
- **Health Checks** wo anwendbar
- **Resource Limits** (CPU, Memory) auf allen Tasks gesetzt
- **Vault Integration** via `vault {}` Stanza und Workload Identity für Secrets
- **Consul Service Registration** via `service {}` Stanza für automatisches Routing
- **restart/reschedule** auf allen CSI-Jobs für automatische Recovery bei Crashes und Node-Ausfällen
- **max_client_disconnect** auf CSI-Jobs um bei kurzen Netzwerk-Glitches nicht sofort zu reschedulen

PostgreSQL-abhängige Jobs haben einen `wait-for-postgres` Init-Task, der wartet bis die Datenbank erreichbar ist.

## Dependencies

| Abhängigkeit | Beschreibung |
|-------------|-------------|
| NFS Storage | Jobs erwarten NFS Mounts unter `/nfs/docker/` -- siehe [NAS-Speicher](../nas-storage/) |
| Docker | Alle Jobs nutzen den Docker Task Driver |
| Consul | Service Discovery via `*.service.consul` -- siehe [Consul](../consul/) |
| Vault | Secret Injection via `template` Stanzas -- siehe [Vault](../vault/) |
| PostgreSQL | Viele Services nutzen den Shared Cluster -- siehe [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) |
| Linstor | CSI-Volumes für replizierten Speicher -- siehe [Linstor](../linstor-storage/) |

## Wichtige Pfade

| Pfad | Verwendung |
|------|------------|
| `/nfs/nomad/jobs/` | Nomad Job-Definitionen (NFS) |
| `/opt/nomad` | Nomad Daten |

## Verwandte Seiten

- [Nomad Referenz](referenz.md) -- Verzeichnisstruktur und Job-Konfigurationsmuster
- [Nomad Betrieb](betrieb.md) -- Deployment, Node Drain, Troubleshooting
- [Consul](../consul/) -- Service Discovery und DNS
- [Vault](../vault/) -- Secrets Management und Workload Identity
- [DNS-Architektur](../dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../traefik/) -- Reverse Proxy mit Consul Catalog Integration
- [Linstor](../linstor-storage/) -- CSI-Volumes für persistenten Speicher
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
