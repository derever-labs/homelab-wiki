---
title: DNS-Architektur
description: DNS-Kette, Komponenten und Consul-Forwarding
tags:
  - platform
  - dns
  - networking
---

# DNS-Architektur

## Übersicht

| Eigenschaft | Wert |
|-------------|------|
| Primärer DNS | 10.0.2.1 (lxc-dns-01) |
| Sekundärer DNS | 10.0.2.2 (lxc-dns-02) |
| Deployment | Bare-metal in LXC (Terraform + Ansible) |
| Sync | Nebula-Sync (Nomad-Job, Full Teleporter, alle 30 Min) |

## DNS-Kette

Beide LXCs sind identisch konfiguriert:

```d2
direction: down

Client: "Client (Port 53)" { style.border-radius: 8 }
PiHole: "Pi-hole v6 (FTL/dnsmasq)" { style.border-radius: 8 }
Consul: "Consul Server" { tooltip: "8600"; style.border-radius: 8 }
Router: Router { tooltip: "10.0.0.1"; style.border-radius: 8 }
Traefik: "Traefik VIP" { tooltip: "10.0.2.20"; style.border-radius: 8 }
Unbound: Unbound { tooltip: "5335"; style.border-radius: 8 }
Root: Root DNS { style.border-radius: 8 }

Client -> PiHole
PiHole -> Consul: "*.consul"
PiHole -> Router: "*.local"
PiHole -> Traefik: "*.ackermannprivat.ch / *.ackermann.systems"
PiHole -> Unbound: andere
Unbound -> Root
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
| DNSSEC | Aktiv |
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
| Intervall | Alle 30 Minuten |
| Nomad-Job | `nebula-sync` |
| Image | `lovelaze/nebula-sync` |
| Credentials | Nomad Variable `nomad/jobs/nebula-sync` |

Synchronisiert werden: Blocklists, Custom DNS Records, Gruppen, Clients, Einstellungen. **Nicht** synchronisiert: `/etc/dnsmasq.d/`-Dateien (werden über Ansible identisch deployed).

## Docker Daemon DNS

Alle Nomad Clients haben in `/etc/docker/daemon.json` die DNS-Server `10.0.2.1` und `10.0.2.2` konfiguriert. Die Konfiguration wird über die Ansible-Rolle `docker` verwaltet.

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

## Verwandte Seiten

- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Kanonische IP-Adresstabelle
- [HashiCorp Stack](../nomad/index.md) -- Consul-Cluster Details
- [Netzwerk](../netzwerk/index.md) -- VLANs, DNS, Routing
