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

| Eigenschaft | Wert |
|-------------|------|
| Status | Produktion |
| Server | 3 (vm-nomad-server-04/05/06) |
| Clients | 3 (vm-nomad-client-04/05/06) |
| URL | `http://10.0.2.104:4646` |
| Deployment | Ansible + Systemd |
| ACLs | Aktiv |
| IPs | Siehe [Proxmox Cluster](../proxmox/index.md#hashicorp-stack-vms) |

## Rolle im Stack

Nomad ist der Workload-Scheduler. Er entscheidet auf welchem Worker-Node ein Container läuft, überwacht die Ausführung und sorgt für Restarts bei Fehlern. Zusammen mit Consul (Service Discovery) und Vault (Secrets) bildet Nomad die Container-Plattform des Homelabs.

## Architektur

```d2
direction: down

Nomad: "Nomad Server (Scheduling, Job-Lifecycle)" { style.border-radius: 8 }
Consul: "Consul Server (Service Discovery, DNS, KV)" { style.border-radius: 8 }
Vault: "Vault (Secrets Management)" { style.border-radius: 8 }
Worker: "Nomad Client + Docker (Container-Ausführung)" { style.border-radius: 8 }

Nomad -> Worker: "Job placement"
Worker -> Consul: "Service Registration"
Worker -> Vault: "JWT Auth → Secrets"
Nomad -> Consul: "Service Health"
Nomad -> Vault: "Workload Identity"
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
