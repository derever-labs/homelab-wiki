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

Zwei Szenario-Sichten zeigen die Mechanik des Schedulers: der **Scheduling-Fluss** vom Job Submit bis zur laufenden Allocation und die **Ausfall-Sicht**, wenn ein Client-Node wegbricht. Das systemübergreifende Zusammenspiel beim Deploy -- Image aus Zot, Secrets aus Vault, Registrierung in Consul, Routing über Traefik -- zeigt der [Deploy-Fluss der Plattform-Seite](../index.md#deploy-fluss-vom-job-file-zum-erreichbaren-service); hier geht es um das, was Nomad selbst entscheidet.

Lese-Konvention: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt -- Request und Antwort teilen sich einen Pfeil. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** laufen zyklisch oder dauerhaft im Hintergrund. Farben kodieren den Weg: Blau der Scheduling-Pfad, Grün der Wiederanlauf nach einem Ausfall, Grau Cluster-interner Kontrollverkehr.

### Scheduling-Fluss -- vom Job Submit zur laufenden Allocation

**Leitfrage:** Wo entscheidet Nomad, auf welchem Client ein Job läuft -- und wer holt sich die Arbeit ab?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  steuer: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  intern: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
  intern-async: { style: { stroke: "#6b7280"; stroke-dash: 3; font-color: "#6b7280" } }
}

direction: right

deploy: Job Submit (CI oder CLI) {
  class: node
  tooltip: "GitHub-Workflow deploy-nomad-jobs.yml oder manuelles nomad job run -- beide mit ACL-Token"
}

servers: Nomad Server Cluster {
  class: container
  tooltip: "vm-nomad-server-04/05/06 -- Raft-Quorum 2 von 3"

  api: Empfangender Server {
    class: node
    tooltip: "HTTPS-API Port 4646 (TLS) -- alle drei Server sind gleichwertige Endpunkte"
  }
  leader: Leader -- Evaluation und Placement {
    class: node
    tooltip: "entscheidet nach Constraints (node_class), spread-Algorithmus und Priorität mit Preemption"
  }

  api -> leader: "2. Forward an den Leader --\nRaft repliziert Job und Entscheid" { class: intern }
}

clients: Nomad Clients {
  class: container
  tooltip: "vm-nomad-client-04 (worker), -05/-06 (storage) -- plus Edge-Node in Dottikon"

  agent: Client-Agent des Ziel-Nodes {
    class: node
    tooltip: "hält die RPC-Verbindung zu den Servern selbst -- die Server stossen keine Verbindung an"
  }
  task: Task {
    class: node
    tooltip: "Start-Hooks: Image-Pull, Vault-Secrets, Consul-Registrierung"
  }

  agent -> task: "4. startet den Task (Docker Driver)" { class: steuer }
}

deploy -> servers.api: "1. Job einreichen\n(HTTPS 4646, ACL-Token)" { class: steuer }
clients.agent -> servers: "3. pullt seine Allocations\n(RPC 4647, Blocking Query)" { class: steuer }
clients.agent -> servers: "Heartbeat -- Lebenszeichen\nfür die Ausfall-Erkennung" { class: intern-async }
```

Lesehilfe:

1. Ein Deploy erreicht die HTTPS-API (Port 4646, TLS) auf einem beliebigen der drei Server -- ACLs verlangen für jede Interaktion einen Token ([Betrieb -- Credentials](./betrieb.md#credentials)).
2. Schreiboperationen leitet der empfangende Server an den Raft-Leader weiter, der das Placement evaluiert: Constraints wie die Node-Klasse, der `spread`-Algorithmus und das Prioritäts-Schema mit Preemption entscheiden, welcher Client die Allocation erhält ([Scheduler-Konfiguration](#scheduler-konfiguration), [Prioritäts-Schema](#prioritats-schema-und-resource-sizing)).
3. Die Server stossen nichts an: Jeder Client hält die RPC-Verbindung (Port 4647) selbst und pullt seine Allocations per Blocking Query -- darum braucht auch der [Edge-Node in Dottikon](./aussenstandort.md) hinter Tailscale keinen eingehenden Port.
4. Der Client-Agent startet den Task über den Docker Driver; die Start-Hooks -- Image aus der [Zot Registry](../docker-registry/), Secrets via [Workload Identity](../vault/index.md#workload-identity), Registrierung beim lokalen [Consul-Agent](../consul/index.md#service-discovery) -- zeigt der [Deploy-Fluss der Plattform-Seite](../index.md#deploy-fluss-vom-job-file-zum-erreichbaren-service). Die Pull-Timeouts begründet die [Timeout-Matrix](./timeouts.md).
5. Parallel dazu meldet jeder Client dauerhaft seinen Heartbeat -- bleibt er aus, greift die [Ausfall-Sicht](#ausfallverhalten).

### Ausfall-Sicht -- ein Client-Node fällt aus {#ausfallverhalten}

**Leitfrage:** Was passiert mit den Allocations eines ausgefallenen Client-Nodes -- und warum wartet Nomad fünf Minuten, bevor er neu platziert?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  recovery: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  intern-async: { style: { stroke: "#6b7280"; stroke-dash: 3; font-color: "#6b7280" } }
}

direction: right

down: Ausgefallener Client {
  class: node
  style.stroke-dash: 4
  tooltip: "VM oder Netz weg -- seine Allocations gelten zunächst als unknown, nicht als verloren"
}

servers: Nomad Server (Leader) {
  class: node
  tooltip: "markiert den Node nach der heartbeat_grace von 60 s als down"
}

rest: Verbleibende Clients {
  class: container
  tooltip: "Placement wieder nach Constraints und Priorität -- storage-Jobs können nur auf den verbleibenden Storage-Node"

  agent2: Client-Agent { class: node }
}

linstor: Linstor-CSI Volumes {
  shape: cylinder
  tooltip: "DRBD-repliziert -- der Datenstand liegt schon auf dem Ziel-Node"
}

down -> servers: "1. Heartbeat bleibt aus --\nnach 60 s gilt der Node als down" { class: intern-async }
down -> servers: "2a. Rückkehr innert 5 min: reconnect --\nTasks laufen unverändert weiter" { class: intern-async }
rest.agent2 -> servers: "2b. keine Rückkehr: pullt nach Ablauf\nder Karenz die Ersatz-Allocations" { class: recovery }
rest.agent2 -> linstor: "3. CSI: DRBD-Volume folgt\nder neuen Allocation" { class: recovery }
```

Lesehilfe:

1. Die Ausfall-Erkennung läuft über den ausbleibenden Heartbeat: Nach der `heartbeat_grace` von 60 Sekunden markieren die Server den Node als down -- der Wert ist bewusst grosszügig gewählt, damit WAN-Latenzspitzen des [Edge-Nodes](./aussenstandort.md) keine Fehl-Erkennung auslösen.
2. Die Allocations des Nodes gelten zuerst als `unknown`, nicht als verloren: `max_client_disconnect` (durchgängig 5 Minuten) gibt dem Node eine Karenz. Kehrt er rechtzeitig zurück, laufen die Tasks unverändert weiter -- nichts wird doppelt gestartet ([Nomad Referenz](./referenz.md#restart-reschedule-disconnect)).
3. Erst nach Ablauf der Karenz platziert der Scheduler neu -- wieder nach Constraints und Priorität: `storage`-Jobs können nur auf den verbleibenden Storage-Node. Eine Kapazitätsprüfung vorab gibt es nicht; im N-1-Fall sorgt das [Prioritäts-Schema](#prioritats-schema-und-resource-sizing) mit Preemption dafür, dass das Wichtige zuerst platziert wird ([Betrieb -- Bekannte Einschränkungen](./betrieb.md#bekannte-einschrankungen)).
4. CSI-Volumes wandern mit: [Linstor](../../storage/linstor/) hält die Daten DRBD-repliziert vor, das Volume wird am Ziel-Node nur neu angehängt -- kein Daten-Sync im Failover-Moment.
5. **Server-Ausfall** ist der einfachere Fall: Zwei verbleibende Server halten das Raft-Quorum, API und Scheduling laufen weiter, laufende Allocations sind nie betroffen. Erst ohne Quorum stehen neue Placements still ([Plattform-Ausfallverhalten](../index.md#ausfallverhalten)).

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
