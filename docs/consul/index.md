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

direction: right

srv: Consul Server {
  class: container

  CS1: vm-nomad-server-04 {
    class: node
    tooltip: "10.0.2.104 | Port 8500 (API) / 8600 (DNS) / 8301 (Gossip)"
  }
  CS2: vm-nomad-server-05 {
    class: node
    tooltip: "10.0.2.105 | Port 8500 (API) / 8600 (DNS) / 8301 (Gossip)"
  }
  CS3: vm-nomad-server-06 {
    class: node
    tooltip: "10.0.2.106 | Port 8500 (API) / 8600 (DNS) / 8301 (Gossip)"
  }

  CS1 <-> CS2: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8300 | Leader Election und Log-Replikation"
  }
  CS2 <-> CS3: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8300 | Leader Election und Log-Replikation"
  }
  CS3 <-> CS1: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8300 | Leader Election und Log-Replikation"
  }
}

cli: Consul Clients {
  class: container

  CC1: vm-nomad-client-04 {
    class: node
    tooltip: "10.0.2.124 | Consul Agent, meldet lokale Services"
  }
  CC2: vm-nomad-client-05 {
    class: node
    tooltip: "10.0.2.125 | Consul Agent, meldet lokale Services"
  }
  CC3: vm-nomad-client-06 {
    class: node
    tooltip: "10.0.2.126 | Consul Agent, meldet lokale Services"
  }
}

TRF: Traefik {
  class: node
  tooltip: "VIP 10.0.2.20 | Consul Catalog Provider für automatisches Routing"
}

DNS: Pi-hole {
  class: node
  tooltip: "10.0.2.1 / 10.0.2.2 | Leitet .consul-Anfragen an Consul DNS weiter"
}

cli -> srv: Service Registration {
  style.stroke: "#2563eb"
  tooltip: "Consul Clients registrieren Container-Services im Cluster"
}
srv -> cli: Health Checks {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
  tooltip: "Server verteilen Health-Check-Ergebnisse an alle Agents"
}
TRF -> srv: Consul Catalog API {
  style.stroke: "#7c3aed"
  tooltip: "HTTP :8500 | Traefik liest Service-Katalog für Backend-Discovery"
}
DNS -> srv: DNS Query (.consul) {
  style.stroke: "#6b7280"
  tooltip: "Port 8600 | Pi-hole leitet .consul-Anfragen an alle drei Server"
}
```

Consul läuft auf denselben VMs wie Nomad und Vault: drei Server bilden den Raft-Cluster für Konsens und KV Store, drei Clients auf den Worker-Nodes melden lokale Services und führen Health Checks aus. Startet Nomad einen Container, registriert der lokale Consul-Agent diesen Service automatisch im Cluster.

## Service Discovery

Nomad registriert jeden Service mit der `service` Stanza automatisch in Consul. Traefik nutzt den Consul Catalog Provider, um diese Services als Backends zu erkennen und Routen zu konfigurieren.

Der typische Fluss:

1. Nomad startet einen Container auf einem Worker-Node
2. Der lokale Consul-Agent registriert den Service
3. Consul führt Health Checks durch
4. Traefik liest den Consul Catalog und erstellt automatisch Routen
5. Der Service ist unter seiner Domain erreichbar

## DNS-Integration

Consul DNS läuft auf Port 8600 und löst Services nach dem Schema `<service>.service.consul` auf; Pi-hole leitet `.consul`-Anfragen dorthin weiter (Details: [Consul Referenz](./referenz.md), [DNS-Architektur](../dns/)).

## KV Store

Der Consul KV Store wird für dynamische Konfiguration genutzt, die von mehreren Services gelesen werden muss. Beispiel: Traefik Cloudflare Credentials (`traefik/cloudflare/email`, `traefik/cloudflare/api_key`).

::: info Abgrenzung zu Vault
Der Consul KV Store ist kein Secrets-Store. Sensible Daten gehören in [Vault](../vault/). Consul KV ist für nicht-sicherheitskritische Konfiguration gedacht.
:::

## Security

| Massnahme | Status |
|-----------|--------|
| Gossip Encryption | Aktiv |
| ACLs | Deaktiviert |
| TLS | Deaktiviert (Homelab-Entscheidung) |
| Connect (Service Mesh) | Deaktiviert |

Gossip Encryption verschlüsselt den gesamten Cluster-Traffic mit einem symmetrischen, auf allen Nodes identischen Key. Consul Connect (Service Mesh mit mTLS und Sidecar-Proxies) ist bewusst nicht konfiguriert -- das Homelab nutzt einfaches Service-Discovery. Begründung zu deaktiviertem TLS und ACLs: [Consul Betrieb](./betrieb.md).

## Verwandte Seiten

- [Nomad](../nomad/) -- Workload Scheduler, der Services in Consul registriert
- [Vault](../vault/) -- Secrets Management für den Cluster
- [DNS-Architektur](../dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../traefik/) -- Consul Catalog Integration für automatisches Routing
