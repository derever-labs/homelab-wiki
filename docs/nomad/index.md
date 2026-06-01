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

Nomad ist der Workload-Scheduler des Homelabs. Er entscheidet auf welchem Worker-Node ein Container läuft, überwacht die Ausführung und sorgt für Restarts bei Fehlern. Zusammen mit Consul (Service Discovery) und Vault (Secrets) bildet Nomad die Container-Plattform des Homelabs.

| Attribut | Wert |
|----------|------|
| URL | `https://10.0.2.104:4646` (UI intern, TLS) |
| Deployment | Ansible + Systemd |

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

Vollständige Host-/IP-/Spec-Tabellen: [Proxmox Cluster](../proxmox/index.md#cluster-knoten-und-vms)

## Scheduler-Konfiguration

| Eigenschaft | Wert |
|-------------|------|
| Algorithmus | `spread` (gleichmässige Verteilung) |
| Service Preemption | Aktiv (seit 01.04.2026) |
| Batch Preemption | Aktiv |
| Memory Oversubscription | Aktiv |

**Preemption** erlaubt Nomad, niedrigprioritäre Jobs zu verdrängen, um Platz für höherprioritäre zu schaffen. Es gilt ein Mindest-Delta von 10 Prioritätspunkten -- ein Job mit Priorität 100 kann nur Jobs mit Priorität 90 oder tiefer verdrängen.

Konfiguration: `nomad operator scheduler get-config` zum Prüfen, `nomad operator scheduler set-config` zum Ändern. Die Einstellung wird über Raft repliziert. Details: [Betrieb](betrieb.md#automatisierung)

## Job Configuration

Alle Jobs folgen einheitlichen Mustern (Docker Driver, NFS Volumes, Bridge Networking, Vault Integration via Workload Identity, Consul Service Registration). CSI-Jobs setzen zusätzlich `restart`/`reschedule` und `max_client_disconnect` für automatische Recovery. PostgreSQL-abhängige Jobs warten via `wait-for-postgres` Init-Task auf die Datenbank. Details: [Nomad Referenz](referenz.md).

## Dependencies

Externe Abhängigkeiten und ihr Ausfallverhalten: [Nomad Betrieb](betrieb.md#abhängigkeiten). Die wichtigsten Bausteine sind NFS-Storage (`/nfs/docker/`), Docker, Consul, Vault, der PostgreSQL Shared Cluster und Linstor CSI.

## Verwandte Seiten

- [Nomad Referenz](referenz.md) -- Verzeichnisstruktur und Job-Konfigurationsmuster
- [Nomad Betrieb](betrieb.md) -- Deployment, Node Drain, Troubleshooting
- [Consul](../consul/) -- Service Discovery und DNS
- [Vault](../vault/) -- Secrets Management und Workload Identity
- [DNS-Architektur](../dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../traefik/) -- Reverse Proxy mit Consul Catalog Integration
- [Linstor](../linstor-storage/) -- CSI-Volumes für persistenten Speicher
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
