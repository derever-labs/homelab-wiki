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

## Übersicht

| Eigenschaft | Wert |
|-------------|------|
| Status | Produktion |
| Server | 3 (vm-nomad-server-04/05/06) |
| Clients | 3 (vm-nomad-client-04/05/06) |
| URL | `http://10.0.2.104:8500` |
| Deployment | Ansible + Systemd |
| IPs | Siehe [Proxmox Cluster](../proxmox/index.md#hashicorp-stack-vms) |

## Rolle im Stack

Consul stellt Service Discovery und DNS für alle Nomad-Services bereit. Jeder Container registriert sich automatisch als Consul Service und ist danach über `<service>.service.consul` erreichbar. Consul verwaltet ausserdem Health Checks und stellt ein Key-Value Store für dynamische Konfiguration bereit.

::: danger Kritischer Service
Bei Consul-Ausfall verlieren alle Dienste ihre Service Discovery und DNS-Auflösung. Traefik kann kein Routing mehr durchführen und alle Web-Dienste werden unerreichbar.
:::

## Architektur

```d2
direction: right

srv: "Server (104/105/106)" {
  style.stroke-dash: 4
  CS1: "104" { style.border-radius: 8 }
  CS2: "105" { style.border-radius: 8 }
  CS3: "106" { style.border-radius: 8 }
  CS1 <-> CS2
  CS2 <-> CS3
}

cli: "Clients (124/125/126)" {
  style.stroke-dash: 4
  CC1: "124" { style.border-radius: 8 }
  CC2: "125" { style.border-radius: 8 }
  CC3: "126" { style.border-radius: 8 }
}

TRF: Traefik { style.border-radius: 8 }
DNS: "Pi-hole (lxc-dns-01/02)" { style.border-radius: 8 }

cli -> srv: "Service Registration"
srv -> cli: "Health Checks"
TRF -> srv: "Consul Catalog"
DNS -> srv: ".consul :8600"
```

Consul läuft auf denselben VMs wie Nomad und Vault:

- **Server** auf den drei Server-VMs: bilden den Raft-Cluster für Konsens und KV Store
- **Clients** auf den drei Worker-VMs: melden lokale Services und führen Health Checks aus

Jeder Nomad-Client führt auch einen Consul-Client aus. Wenn Nomad einen Container startet, registriert der lokale Consul-Agent diesen Service automatisch im Cluster.

## Service Discovery

Nomad registriert jeden Service mit der `service` Stanza automatisch in Consul. Traefik nutzt den Consul Catalog Provider, um diese Services als Backends zu erkennen und Routen zu konfigurieren.

Der typische Fluss:

1. Nomad startet einen Container auf einem Worker-Node
2. Der lokale Consul-Agent registriert den Service
3. Consul führt Health Checks durch
4. Traefik liest den Consul Catalog und erstellt automatisch Routen
5. Der Service ist unter seiner Domain erreichbar

## DNS-Integration

Consul stellt einen DNS-Server auf Port 8600 bereit. Über diesen können Services nach dem Schema `<service>.service.consul` aufgelöst werden. Pi-hole (lxc-dns-01, lxc-dns-02) leitet alle DNS-Anfragen für die Domain `.consul` an die drei Consul Server weiter (IPs: [Hosts und IPs](../_referenz/hosts-und-ips.md)), sodass alle Geräte im Netzwerk Consul-Dienste über DNS erreichen können.

Vollständige DNS-Dokumentation: [DNS-Architektur](../dns/)

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

**Gossip Encryption:** Gesamter Gossip-Traffic zwischen Consul Nodes ist verschlüsselt (symmetrischer Key, auf allen Nodes identisch).

**ACLs:** Deaktiviert -- alle Consul-Operationen funktionieren ohne Token. Bei Bedarf kann ACL mit `default_policy = "allow"` aktiviert werden.

**TLS deaktiviert:** Kein Expiry-Risiko durch Zertifikate. Gossip Encryption schützt den Cluster-Traffic trotzdem.

**Connect deaktiviert:** Consul Connect (Service Mesh mit mTLS zwischen Services) ist nicht konfiguriert -- das Homelab nutzt einfaches Service-Discovery ohne Sidecar-Proxies.

## Verwandte Seiten

- [Nomad](../nomad/) -- Workload Scheduler, der Services in Consul registriert
- [Vault](../vault/) -- Secrets Management für den Cluster
- [DNS-Architektur](../dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Traefik](../traefik/) -- Consul Catalog Integration für automatisches Routing
