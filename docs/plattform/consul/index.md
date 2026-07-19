---
title: Consul
description: Service Discovery, DNS und KV Store für den Nomad-Cluster
tags:
  - platform
  - hashicorp
  - consul
  - service-discovery
---

# Consul

Consul ist die Service-Discovery- und DNS-Schicht des Nomad-Clusters.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | `http://10.0.2.104:8500` |
| Deployment | Ansible + Systemd |

## Rolle im Stack

Consul stellt Service Discovery und DNS für alle Nomad-Services bereit. Jeder Container registriert sich automatisch als Consul Service und ist danach über `<service>.service.consul` erreichbar. Consul verwaltet ausserdem Health Checks und stellt ein Key-Value Store für dynamische Konfiguration bereit.

::: danger Kritischer Service
Bei Consul-Ausfall verlieren alle Dienste ihre Service Discovery und DNS-Auflösung. Traefik kann kein Routing mehr durchführen und alle Web-Dienste werden unerreichbar.
:::

## Architektur

Consul läuft auf denselben VMs wie Nomad und Vault: drei Server bilden den Raft-Cluster für Konsens und KV Store, auf jedem der drei Worker-Nodes meldet ein Consul Agent lokale Services und führt Health Checks aus (VM-Liste: [Hosts und IPs](../../_referenz/hosts-und-ips.md)). Zwei Szenario-Diagramme zeigen die Mechanik: der Registration-Pfad macht aus einem gestarteten Container einen Catalog-Eintrag, der Query-Pfad löst diesen Eintrag als `.consul`-Namen auf.

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt -- Request und Antwort teilen sich einen Pfeil. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** Kanten laufen zyklisch oder dauerhaft im Hintergrund. Farben kodieren den Weg: Blau die Service-Registrierung, Violett den Catalog-Konsum durch Traefik, Grün die DNS-Auflösung, Grau Cluster-interne und Nebenwege.

### Registration-Pfad -- vom Container-Start zum Catalog-Eintrag

**Leitfrage:** Wie wird aus einem gestarteten Container ein Service, den Traefik und DNS kennen?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  reg: { style: { stroke: "#2563eb" } }
  reg-async: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  catalog: { style: { stroke: "#7c3aed" } }
  intern: { style: { stroke: "#6b7280" } }
  intern-async: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

direction: right

worker: Worker-Node (einer von drei) {
  class: container

  NC: Nomad Client {
    class: node
    tooltip: "vm-nomad-client-04/05/06 -- startet Tasks gemäss Job-Spezifikation"
  }
  APP: App-Container {
    class: node
    tooltip: "Beliebiger Nomad-Task mit service-Stanza"
  }
  CA: Consul Agent {
    class: node
    tooltip: "Lokaler Consul-Client -- registriert Services und führt Health Checks aus"
  }
}

srv: Consul Server {
  class: container

  CS1: vm-nomad-server-04 {
    class: node
    tooltip: "10.0.2.104 | Port 8500 (API) / 8600 (DNS)"
  }
  CS2: vm-nomad-server-05 {
    class: node
    tooltip: "10.0.2.105 | Port 8500 (API) / 8600 (DNS)"
  }
  CS3: vm-nomad-server-06 {
    class: node
    tooltip: "10.0.2.106 | Port 8500 (API) / 8600 (DNS)"
  }

  CS1 <-> CS2: Raft (8300) { class: intern }
  CS2 <-> CS3: Raft (8300) { class: intern }
  CS3 <-> CS1: Raft (8300) { class: intern }
}

TRF: Traefik {
  class: node
  tooltip: "VIP 10.0.2.20 | Consul Catalog Provider"
}

worker.NC -> worker.APP: "1. startet Task" { class: reg }
worker.NC -> worker.CA: "2. registriert Service\n(service-Stanza, lokale Agent-API)" { class: reg }
worker.CA -> srv: "3. meldet Registrierung und\nStatuswechsel (RPC 8300)" { class: reg }
worker.CA -> worker.APP: "4. prüft zyklisch Health\n(HTTP / TCP / Script)" { class: reg-async }
worker.CA <-> srv: "Serf-Gossip (8301) --\nMembership und Failure Detection" { class: intern-async }
TRF -> srv: "5. liest Catalog (HTTP 8500) und\nbaut Routen aus Service-Tags" { class: catalog }
```

Lesehilfe:

1. Auslöser ist die `service`-Stanza im Nomad-Job: der Nomad Client startet den Task und registriert den Service über die lokale Agent-API ([Service Discovery](#service-discovery)).
2. Der Consul Agent übermittelt die Registrierung und jeden späteren Statuswechsel per RPC (Port 8300) an den Server-Cluster.
3. Health Checks laufen dezentral: der Agent prüft den lokalen Container zyklisch via HTTP, TCP oder Script ([Betrieb -- Automatisierung](./betrieb.md#automatisierung)).
4. Fällt ein Check durch, entfernt der Cluster den Service aus dem Catalog -- er ist dann weder per DNS auflösbar noch für Traefik sichtbar.
5. Raft repliziert jeden Catalog-Eintrag auf alle drei Server; Serf-Gossip (Port 8301) überwacht die Mitgliedschaft aller sechs Nodes ([Betrieb -- Abhängigkeiten](./betrieb.md#abhangigkeiten)).
6. Traefik liest den Catalog über die HTTP-API und baut aus den Service-Tags seine Router -- ein registrierter, gesunder Service ist ohne manuelle Config routbar ([Traefik -- Consul Catalog Integration](../../edge/traefik/index.md#consul-catalog-integration)).

### Query-Pfad -- wie ein .consul-Name aufgelöst wird

**Leitfrage:** Wie löst ein Client `<service>.service.consul` auf -- und warum braucht er dafür keinen lokalen Consul-Agent?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  dns: { style: { stroke: "#16a34a" } }
  neben: { style: { stroke: "#6b7280" } }
  neben-async: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

direction: right

LAN: Netzwerk-Client {
  class: node
  tooltip: "Beliebiges Gerät im LAN -- Resolver via DHCP sind beide Pi-hole"
}

CONT: Nomad-Container {
  class: node
  tooltip: "Docker-Daemon-DNS der Nomad-Clients zeigt auf beide Pi-hole"
}

EXT: Arbeitsrechner ohne .consul-DNS {
  class: node
  tooltip: "z.B. lokaler Mac ausserhalb der DNS-Kette"
}

PIHOLE: Pi-hole (lxc-dns-01/02) {
  class: node
  tooltip: "10.0.2.1 / 10.0.2.2 | Port 53 -- Conditional Forwarding für .consul"
}

CDNS: Consul DNS {
  class: node
  tooltip: "vm-nomad-server-04/05/06, Port 8600 -- alle drei Server antworten"
}

UNBOUND: Unbound {
  class: node
  tooltip: "Port 5335 (localhost) -- rekursiver Resolver für alle übrigen Domains"
}

WORKER: Worker-Node {
  class: node
  tooltip: "vm-nomad-client-04/05/06 -- Tunnel-Endpunkt innerhalb der DNS-Kette"
}

LAN -> PIHOLE: "1. DNS-Query service.consul (Port 53)" { class: dns }
CONT -> PIHOLE: "1. gleicher Einstieg via\nDocker-Daemon-DNS" { class: dns }
PIHOLE -> CDNS: "2. Conditional Forwarding\n*.consul (Port 8600)" { class: dns }
PIHOLE -> UNBOUND: "übrige Domains (kein .consul)" { class: neben }
EXT -> WORKER: "SSH-Tunnel (Port-Forward) -- der Client\nlöst den Namen stellvertretend auf" { class: neben-async }
```

Lesehilfe:

1. Netzwerk-Clients fragen Pi-hole, weil DHCP beide DNS-LXCs als Resolver verteilt ([DNS-Architektur](../../netz/dns/)).
2. Container nehmen denselben Einstieg: der Docker-Daemon jedes Nomad-Clients hat beide Pi-hole eingetragen -- ein lokaler Consul-Agent ist für die Auflösung nicht nötig ([DNS-Integration](#dns-integration)).
3. Pi-hole erkennt die Domain `.consul` und forwardet die Anfrage an die drei Consul-Server auf Port 8600; alle übrigen Domains gehen an Unbound.
4. Die Antwort spiegelt den Live-Zustand des Catalogs: nur Services mit bestandenem Health Check sind auflösbar ([Betrieb -- Automatisierung](./betrieb.md#automatisierung)).
5. Die Auflösung liefert die Adresse des Nodes; wo ein Service auf einem dynamischen Nomad-Port lauscht, kommt der Port aus dem Catalog (Beispiel Grafana-Admin-Zugang: [Monitoring Betrieb](../../monitoring/betrieb.md)).
6. Ausserhalb dieser Kette -- etwa ein lokaler Arbeitsrechner -- ist `.consul` nicht auflösbar: der Zugriff läuft via SSH-Tunnel über einen Worker-Node ([DNS-Integration](#dns-integration)).

## Ausfallverhalten

**Leitfrage:** Was passiert, wenn ein Consul-Server ausfällt -- und wann steht die Namensauflösung wirklich still?

- **Ein Server fällt aus (auch der Leader):** Das Quorum bleibt mit 2 von 3 erhalten; bei Leader-Verlust wählt Raft neu. Pi-hole leitet `.consul`-Anfragen an alle drei Server, die verbleibenden antworten weiter. Autopilot bereinigt den toten Server automatisch aus dem Raft-Verbund ([Betrieb -- Automatisierung](./betrieb.md#automatisierung)).
- **Ein Consul Agent auf einem Worker fällt aus:** Serf-Gossip markiert den Node als failed, seine Services werden aus dem Catalog entfernt und sind über DNS nicht mehr auflösbar -- die Services der übrigen Nodes bleiben es.
- **Quorum verloren (2 von 3 Server down):** Der Cluster verliert seinen Leader und ist nicht mehr schreibfähig -- Catalog und `.consul`-Auflösung fallen aus. Die Folgen für Traefik, Image-Pulls und Vault-Zugriffe: [Plattform-Ausfallverhalten](../index.md#ausfallverhalten); die Voraussetzungen des Normalbetriebs: [Betrieb -- Abhängigkeiten](./betrieb.md#abhangigkeiten).

## Service Discovery

Nomad registriert jeden Service mit der `service` Stanza automatisch in Consul. Traefik nutzt den Consul Catalog Provider, um diese Services als Backends zu erkennen und Routen zu konfigurieren. Der Ablauf -- Container-Start, Service-Registrierung durch den lokalen Agent, Health Checks, Catalog-Auswertung durch Traefik -- läuft ohne manuellen Eingriff.

## DNS-Integration

Consul DNS läuft auf Port 8600 und löst Services nach dem Schema `<service>.service.consul` auf. Pi-hole (lxc-dns-01 und lxc-dns-02) ist so konfiguriert, dass alle DNS-Anfragen für die Domain `.consul` an die drei Consul-Server weitergeleitet werden. Dadurch können alle Geräte im Netzwerk Services auflösen, ohne den Consul-Client lokal betreiben zu müssen. Vollständige DNS-Dokumentation: [DNS-Architektur](../../netz/dns/).

Geräte ausserhalb dieser DNS-Kette -- etwa ein lokaler Arbeitsrechner -- können `.consul`-Namen nicht auflösen. Der Zugriff läuft dann über einen SSH-Tunnel auf einen Worker-Node, der den Namen stellvertretend auflöst (Beispiel: [Claude-Code-Sync](../../_querschnitt/claude-code-sync.md)).

## KV Store

Der Consul KV Store wird für dynamische, nicht-sicherheitskritische Konfiguration genutzt, die von mehreren Services gelesen werden muss. Sensible Daten gehören nicht hierher (siehe Abgrenzung unten) -- die Cloudflare-API-Credentials etwa liegen als verschlüsselte Ansible-Vault-Variablen beim Traefik-Deployment, nicht im KV Store.

::: info Abgrenzung zu Vault
Der Consul KV Store ist kein Secrets-Store. Sensible Daten gehören in [Vault](../vault/). Consul KV ist für nicht-sicherheitskritische Konfiguration gedacht.
:::

## Security

Gossip Encryption verschlüsselt den gesamten Cluster-Traffic mit einem symmetrischen, auf allen Nodes identischen Key. Consul Connect (Service Mesh mit mTLS und Sidecar-Proxies) ist bewusst nicht konfiguriert -- das Homelab nutzt einfaches Service-Discovery.

Status und Begründung der übrigen Sicherheitsmassnahmen -- kein TLS sowie das aktive ACL-System mit `default_policy = deny` -- sind unter [Consul Betrieb](./betrieb.md) dokumentiert.

## Konfiguration

- `/etc/consul.d/` -- Konfigurationsdateien (verwaltet via Ansible)
- `/opt/consul` -- Datenpfad (Raft-Log, Snapshots, KV-Store)

Autopilot ist mit `cleanup_dead_servers = true` aktiv; Verhalten und manuelle Eingriffe: [Consul Betrieb](./betrieb.md).

## Verwandte Seiten

- [Nomad](../nomad/) -- Workload Scheduler, der Services in Consul registriert
- [Plattform-Übersicht](../index.md) -- Big Picture des HashiCorp-Stacks inkl. Ausfallverhalten des Gesamtstacks
- [Vault](../vault/) -- Secrets Management für den Cluster
- [DNS-Architektur](../../netz/dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../../edge/traefik/) -- Consul Catalog Integration für automatisches Routing
- [Ports und Dienste](../../_referenz/ports-und-dienste.md) -- Consul-Ports (HashiCorp Stack)
