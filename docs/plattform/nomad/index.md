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

**Leitfrage:** Was passiert von `nomad job run` bis zum laufenden, erreichbaren Container?

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt-Nummer und was fliesst. Durchgezogene Kanten sind synchrone Abrufe (der Initiator wartet auf die Antwort), gestrichelte Kanten laufen asynchron im Hintergrund. Die Farben trennen die Wege: **Blau** ist der Deploy-Pfad (Submit, Placement, Image-Pull), **Violett** der Secrets-Pfad zu Vault, **Grün** der Discovery- und Routing-Pfad über Consul und Traefik, **Grau** der Cluster-interne Kontrollverkehr.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  steuer: { style: { stroke: "#2563eb" } }
  steuerasync: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  secrets: { style: { stroke: "#7c3aed" } }
  disco: { style: { stroke: "#16a34a" } }
  intern: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

cli: nomad job run {
  class: node
  tooltip: "CLI gegen einen beliebigen Server -- Job-Definitionen liegen im Repo nomad-jobs"
}

servers: Nomad Server Cluster {
  grid-columns: 3
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

  S04 <-> S05: Raft { class: intern }
  S05 <-> S06: Raft { class: intern }
}

workers: Nomad Clients {
  grid-columns: 3
  class: container

  C04: vm-nomad-client-04 {
    class: node
    tooltip: "10.0.2.124 | Klasse: worker"
  }
  C05: vm-nomad-client-05 {
    class: node
    tooltip: "10.0.2.125 | Klasse: storage, iGPU"
  }
  C06: vm-nomad-client-06 {
    class: node
    tooltip: "10.0.2.126 | Klasse: storage, iGPU"
  }
}

registry: Docker Hub + Zot Registry {
  class: node
  tooltip: "Image-Quellen: Docker Hub extern, Zot intern"
}

Traefik: Traefik {
  class: node
  tooltip: "VIP 10.0.2.20 | Consul Catalog Provider"
}

Consul: Consul {
  class: node
  tooltip: "Port 8500 (API) / 8600 (DNS) | Service-Katalog, Health Checks"
}

Vault: Vault {
  class: node
  tooltip: "Port 8200 | Secrets via Workload Identity, KV v2"
}

cli -> servers: "1 Job Submit (HTTPS 4646)" { class: steuer }
servers -> workers: "2 Placement der Allocation (RPC 4647)" { class: steuerasync }
workers -> registry: "3 Image Pull" { class: steuer }
workers -> Vault: "4 JWT vorzeigen und Secrets lesen (8200)" { class: secrets }
workers -> Consul: "5 Service-Registration und Health-Status" { class: disco }
Traefik -> Consul: "6 Catalog-Abfrage (HTTP 8500)" { class: disco }
Traefik -> workers: "7 Request an dynamischen Host-Port" { class: disco }
servers -> Consul: "Health-Status der Tasks" { class: intern }
Vault -> servers: "JWKS-Abruf (JWT-Validierung)" { class: intern }
```

Kurzablauf:

1. `nomad job run` schickt die Job-Definition aus dem Repo `nomad-jobs` an die HTTPS-API (Port 4646) -- alle drei Server sind gleichwertige Endpunkte, ACLs verlangen für jede Interaktion ein Token ([Nomad Betrieb](./betrieb.md)).
2. Die Server replizieren den Job per Raft und evaluieren das Placement: Constraints wie die Node-Klasse, der `spread`-Algorithmus und notfalls Preemption entscheiden, welcher Client die Allocation erhält ([Scheduler-Konfiguration](#scheduler-konfiguration)).
3. Der Client startet den Task: Der Docker Driver zieht das Image von Docker Hub oder der internen [Zot Registry](../docker-registry/) -- die Pull-Timeouts dafür begründet die [Timeout-Matrix](./timeouts.md).
4. Braucht der Task Secrets, tauscht er sein Workload-Identity-JWT bei Vault gegen einen kurzlebigen Token und liest seinen Pfad `kv/data/JOB_ID` -- kein statischer Token in der Job-Definition ([Vault -- Workload Identity](../vault/index.md#workload-identity)).
5. Der lokale Consul-Agent registriert den gestarteten Container als Service und führt dessen Health Checks aus ([Consul -- Service Discovery](../consul/index.md#service-discovery)).
6. Traefik entdeckt den neuen Service über den Consul Catalog Provider und baut Router und Backend automatisch -- inklusive des dynamischen Host-Ports ([Traefik](../../edge/traefik/)).
7. Ab jetzt ist der Container erreichbar: Requests laufen über Traefik an den Host-Port. Fällt ein Health Check, nimmt Traefik das Backend aus dem Routing ([Job Configuration](#job-configuration), [Nomad Referenz](./referenz.md)).

### Ausfallverhalten

- **Ein Server fällt aus:** Die verbleibenden zwei Server halten das Raft-Quorum und wählen bei Bedarf einen neuen Leader -- Scheduling und API bleiben verfügbar, `nomad job run` funktioniert gegen jeden erreichbaren Server. Bereits laufende Allocations auf den Clients sind davon nicht betroffen. Erst ohne Quorum (zwei Server weg) stehen neue Placements still ([Cluster-Topologie](#cluster-topologie)).
- **Ein Client-Node fällt aus:** Der Client verpasst seinen Heartbeat. Jobs mit `max_client_disconnect` bekommen zuerst eine Karenz (bei den CSI-Jobs 5 Minuten), danach rescheduled Nomad die Allocations auf die verbleibenden Nodes ([Nomad Referenz](./referenz.md)). Eine automatische Kapazitätsprüfung vorab gibt es nicht -- das [Prioritäts-Schema](#prioritats-schema-und-resource-sizing) sorgt dafür, dass im N-1-Fall das Wichtige zuerst platziert wird ([Nomad Betrieb](./betrieb.md#bekannte-einschrankungen)).

## Cluster-Topologie

Der Stack läuft auf 3 Server-Nodes und 3 Worker-Nodes, jeweils 1 pro Proxmox-Host. Die Server bilden einen Raft-Consensus-Cluster -- bei Ausfall eines Servers übernehmen die verbleibenden zwei.

- **Server-Nodes**: Nomad Server, Consul Server, Vault
- **Worker-Nodes**: Nomad Client, Consul Client, Docker
  - client-04: Klasse `worker` (kein DRBD)
  - client-05/06: Klasse `storage` (DRBD/Linstor, privileged containers)

Zusätzlich hängt ein einzelner Client-only-Knoten am Aussenstandort Dottikon im Cluster (eigenes Datacenter `dottikon`, Node-Pool `edge`) -- Anbindung, Isolation und Workload: [Nomad Aussenstandort](./aussenstandort.md).

Vollständige Host-/IP-/Spec-Tabellen: [Proxmox Cluster](../../infrastruktur/proxmox/index.md#cluster-knoten-und-vms)

## Scheduler-Konfiguration

| Attribut | Wert |
|-------------|------|
| Algorithmus | `spread` (gleichmässige Verteilung) |
| Service Preemption | Aktiv (seit 01.04.2026) |
| Batch Preemption | Aktiv |
| System/SysBatch Preemption | Aktiv |
| Memory Oversubscription | Aktiv |

**Preemption** erlaubt Nomad, niedrigprioritäre Jobs zu verdrängen, um Platz für höherprioritäre zu schaffen. Es gilt ein Mindest-Delta von 10 Prioritätspunkten -- ein Job mit Priorität 100 kann nur Jobs mit Priorität 90 oder tiefer verdrängen.

### Prioritäts-Schema und Resource-Sizing

Seit dem Right-Sizing vom 09.07.2026 folgen alle Jobs einem festen Schema, damit bei einem Storage-Node-Ausfall (N-1) das Wichtige zuerst platziert wird: Kern-Infrastruktur 100, Monitoring/Alerting 80, Media-Konsum 70, wichtige Apps mit Media-Automation und Backups 60, normale Apps 50, AI und Wartung 30, Downloader 20.

Sizing-Grundsatz: CPU-Claims sind p95-basiert (Soft-Gewichte, Bursting bleibt erlaubt, kein `cpu_hard_limit`), `memory` ist die ehrliche Arbeits-Reservation (Scheduling-Währung), `memory_max` der Burst-Deckel -- jeder Task hat einen. Die konkreten Werte pro Job stehen ausschliesslich im Repo `homelab-nomad-jobs` (SSOT).

Konfiguration: `nomad operator scheduler get-config` zum Prüfen, `nomad operator scheduler set-config` zum Ändern. Die Einstellung wird über Raft repliziert. Details: [Betrieb](./betrieb.md#automatisierung)

## Job Configuration

Alle Jobs folgen einheitlichen Mustern (Docker Driver, NFS Volumes, Bridge Networking, Vault Integration via Workload Identity, Consul Service Registration). CSI-Jobs setzen zusätzlich `restart`/`reschedule` und `max_client_disconnect` für automatische Recovery. PostgreSQL-abhängige Jobs warten via `wait-for-postgres` Init-Task auf die Datenbank. Details: [Nomad Referenz](./referenz.md).

## Dependencies

Externe Abhängigkeiten und ihr Ausfallverhalten: [Nomad Betrieb](./betrieb.md#abhangigkeiten). Die wichtigsten Bausteine sind NFS-Storage (`/nfs/docker/`), Docker, Consul, Vault, der PostgreSQL Shared Cluster und Linstor CSI.

## Verwandte Seiten

- [Nomad Referenz](./referenz.md) -- Verzeichnisstruktur und Job-Konfigurationsmuster
- [Nomad Betrieb](./betrieb.md) -- Deployment, Node Drain, Troubleshooting
- [Nomad Aussenstandort](./aussenstandort.md) -- Client-only Edge-Knoten in Dottikon via Tailscale
- [Nomad Timeouts](./timeouts.md) -- Timeout-Matrix für Deploys, Restarts und Pulls
- [Nomad Jobs](../../_referenz/nomad-jobs.md) -- Kanonische Übersicht aller Jobs
- [Consul](../consul/) -- Service Discovery und DNS
- [Vault](../vault/) -- Secrets Management und Workload Identity
- [DNS-Architektur](../../netz/dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../../edge/traefik/) -- Reverse Proxy mit Consul Catalog Integration
- [Linstor](../../storage/linstor/) -- CSI-Volumes für persistenten Speicher
- [Datenbank-Architektur](../../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
