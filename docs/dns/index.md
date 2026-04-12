---
title: DNS-Architektur
description: DNS-Kette, Komponenten und Consul-Forwarding
tags:
  - platform
  - dns
  - networking
---

# DNS-Architektur

Zwei redundante Pi-hole v6 LXC-Container (lxc-dns-01/02) bilden die DNS-Infrastruktur. Pi-hole übernimmt Ad-Blocking, Wildcard-DNS für alle internen Domains und leitet `.consul`-Anfragen an den Consul-Cluster weiter.

## Übersicht

| Attribut | Wert |
|----------|------|
| Primärer DNS | 10.0.2.1 (lxc-dns-01) |
| Sekundärer DNS | 10.0.2.2 (lxc-dns-02) |
| Deployment | Bare-metal in LXC (Terraform + Ansible) |
| Sync | Nebula-Sync (Nomad-Job, Full Teleporter, täglich 04:00) |
| IPs | Siehe [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## DNS-Kette

Beide LXCs sind identisch konfiguriert:

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

Client: Netzwerk-Client {
  class: node
  tooltip: "Alle Geraete im Netzwerk, DNS via DHCP (10.0.2.1 / 10.0.2.2)"
}

pihole: Pi-hole v6 (DNS-Eingang) {
  class: container

  PH1: lxc-dns-01 (Primary) {
    class: node
    tooltip: "10.0.2.1 | LXC 4021 auf pve01, Port 53, FTL/dnsmasq"
  }
  PH2: lxc-dns-02 (Secondary) {
    class: node
    tooltip: "10.0.2.2 | LXC 4022 auf pve02, Port 53, FTL/dnsmasq"
  }

  PH1 <-> PH2: Nebula-Sync (taeglich 04:00) {
    style.stroke: "#6b7280"
    style.stroke-dash: 3
    tooltip: "Full Teleporter Sync, Nomad Batch-Job"
  }
}

consul: Consul DNS {
  class: container

  CS1: vm-nomad-server-04 {
    class: node
    tooltip: "10.0.2.104 | Port 8600"
  }
  CS2: vm-nomad-server-05 {
    class: node
    tooltip: "10.0.2.105 | Port 8600"
  }
  CS3: vm-nomad-server-06 {
    class: node
    tooltip: "10.0.2.106 | Port 8600"
  }
}

Router: UDM Pro {
  class: node
  tooltip: "10.0.0.1 | Loest *.local auf"
}

Traefik: Traefik VIP {
  class: node
  tooltip: "10.0.2.20 | Wildcard *.ackermannprivat.ch / *.ackermann.systems"
}

Unbound: Unbound {
  class: node
  tooltip: "Port 5335 (localhost) | Rekursiver Resolver mit DNSSEC"
}

Root: Root DNS Server {
  class: node
  tooltip: "13 Root-Server, DNSSEC-validiert durch Unbound"
}

Client -> pihole: DNS Query (Port 53) {
  style.stroke: "#2563eb"
}
pihole -> consul: *.consul (Conditional Forwarding) {
  style.stroke: "#7c3aed"
  tooltip: "Port 8600 | Service Discovery fuer Nomad-Container"
}
pihole -> Router: *.local {
  style.stroke: "#6b7280"
  tooltip: "UniFi-Geraete und DHCP-Hostnamen"
}
pihole -> Traefik: *.ackermannprivat.ch / *.ackermann.systems {
  style.stroke: "#16a34a"
  tooltip: "Wildcard-DNS zeigt auf Traefik VIP 10.0.2.20"
}
pihole -> Unbound: Alle anderen Domains {
  style.stroke: "#6b7280"
  tooltip: "Upstream fuer nicht-lokale Anfragen"
}
Unbound -> Root: Rekursive Aufloesung {
  style.stroke: "#6b7280"
  tooltip: "Direkt gegen Root-Server, kein Forwarding"
}
```

## Komponenten

### Pi-hole v6

Pi-hole v6 mit eingebettetem dnsmasq (FTL) übernimmt DNS-Eingangs-Router und Ad-Blocker in einem.

| Eigenschaft | Wert |
|-------------|------|
| Port | **53** (direkt) |
| Web-UI | Port 80 (`/admin`) |
| Upstream | Unbound (Port 5335, localhost) |
| Config | `/etc/pihole/pihole.toml` |
| Custom dnsmasq | `/etc/dnsmasq.d/` (aktiviert via `etc_dnsmasq_d = true`) |

**Wildcard-DNS-Records** (in `/etc/dnsmasq.d/05-custom-dns.conf`):

| Record | Ziel-IP |
|--------|---------|
| `*.ackermannprivat.ch` (Wildcard) | 10.0.2.20 (Traefik VIP) |
| `*.ackermann.systems` (Wildcard) | 10.0.2.20 (Traefik VIP) |

**Spezifische Overrides** (in `/etc/pihole/custom.list`):

| Record | Ziel-IP |
|--------|---------|
| `vpn.ackermannprivat.ch` | 10.0.2.20 |
| `pve00/01/02.ackermannprivat.ch` | 10.0.2.40/41/42 |
| `pbs.ackermannprivat.ch` | 10.0.2.50 |

**Conditional Forwarding** (in `/etc/dnsmasq.d/05-consul.conf`):

| Domain-Muster | Upstream | Port |
|---------------|----------|------|
| `*.consul` | Consul Server (104/105/106) | 8600 |
| `*.local` | Router (10.0.0.1) | 53 |

### Unbound

Rekursiver Resolver mit DNSSEC-Validierung. Löst Anfragen direkt gegen die Root-Server auf.

| Eigenschaft | Wert |
|-------------|------|
| Port | 5335 (localhost) |
| DNSSEC | Aktiv (Unbound validiert, Pi-hole selbst NICHT -- doppelte Validierung ist unnötig und erzeugt Warnings) |
| Modus | Rekursiv (kein Forwarding) |
| Config | `/etc/unbound/unbound.conf.d/pi-hole.conf` |

### Consul DNS

Service Discovery für den HashiCorp-Cluster. Jeder Consul Server stellt DNS auf Port 8600 bereit.

| Consul Server | IP | Port |
|---------------|-----|------|
| vm-nomad-server-04 | 10.0.2.104 | 8600 |
| vm-nomad-server-05 | 10.0.2.105 | 8600 |
| vm-nomad-server-06 | 10.0.2.106 | 8600 |

## Synchronisation (Nebula-Sync)

Ein Nomad-Job synchronisiert die Pi-hole-Konfiguration von lxc-dns-01 (Primary) auf lxc-dns-02 (Replica).

| Eigenschaft | Wert |
|-------------|------|
| Modus | Full Sync (Teleporter) |
| Intervall | Täglich 04:00 Uhr |
| Nomad-Job | `nebula-sync` |
| Image | `lovelaze/nebula-sync` |
| Credentials | Nomad Variable `nomad/jobs/nebula-sync` |

Synchronisiert werden: Blocklists, Custom DNS Records, Gruppen, Clients, Einstellungen. **Nicht** synchronisiert: `/etc/dnsmasq.d/`-Dateien (werden über Ansible identisch deployed).

::: info Warum nur täglich?
Jeder Teleporter-Import triggert einen `pihole-FTL`-Restart. Während des Restarts (~1-2 s) liefert PiHole-2 keine DNS-Antworten, was Uptime-Kuma-Monitore flappen liess. Pi-hole-Konfigurationen ändern sich selten -- ein täglicher Sync reicht vollkommen.
:::

## Docker Daemon DNS

Alle Nomad Clients haben in `/etc/docker/daemon.json` beide DNS-Server (lxc-dns-01 und lxc-dns-02) konfiguriert. IPs: [Hosts und IPs](../_referenz/hosts-und-ips.md). Die Konfiguration wird über die Ansible-Rolle `docker` verwaltet.

## Standorte und Failover

| Standort | Host | IP | LXC-ID | Proxmox |
|----------|------|-----|--------|---------|
| Primär | lxc-dns-01 | 10.0.2.1 | 4021 | pve01 |
| Sekundär | lxc-dns-02 | 10.0.2.2 | 4022 | pve02 |

Alle Netzwerk-Clients haben beide IPs als DNS-Server (via DHCP). Bei Ausfall eines LXC übernimmt der andere automatisch.

::: warning Nie beide gleichzeitig rebooten
Die DNS-LXCs dürfen nie gleichzeitig neu gestartet werden. Bei Wartung: immer einen LXC am Laufen lassen.
:::

## IaC-Verwaltung

| Komponente | Pfad |
|------------|------|
| LXC-Erstellung | `terraform/proxmox-vms/main.tf` |
| Ansible-Rolle | `ansible/roles/pihole/` |
| Deploy-Playbook | `ansible/playbooks/deploy-pihole.yml` |
| Nebula-Sync | `nomad-jobs/infrastructure/nebula-sync.nomad` |

## Historie

| Datum | Änderung |
|-------|-----------|
| ~2025 | Initialer Stack: dnsmasq -> Pi-hole -> Unbound auf Docker (vm-proxy-dns-01/vm-vpn-dns-01) |
| 22.02.2026 | 10.0.2.1: dnsmasq entfernt, Pi-hole v6 direkt auf Port 53 |
| 02.04.2026 | Kompletter Neuaufbau: 2x LXC (bare-metal Pi-hole v6 + Unbound), Nebula-Sync, IaC-verwaltet |

## DNS-Performance-Monitoring

Ein periodischer Batch Job (`batch-jobs/dns-performance.nomad`) misst alle 5 Minuten die DNS-Latenz gegen mehrere DNS-Server und schreibt die Ergebnisse nach InfluxDB. Die Metriken sind im Grafana-Dashboard einsehbar.

## Verwandte Seiten

- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Kanonische IP-Adresstabelle
- [HashiCorp Stack](../nomad/index.md) -- Consul-Cluster Details
- [Netzwerk](../netzwerk/index.md) -- VLANs, DNS, Routing
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Alle periodischen Nomad Jobs
