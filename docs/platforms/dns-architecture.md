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
| Primärer DNS | 10.0.2.1 (vm-proxy-dns-01) |
| Sekundärer DNS | 10.0.2.2 (vm-vpn-dns-01) |
| Deployment | Docker Compose (Ansible-managed) |
| Blocklists | ~709K unique Domains (29 Listen inkl. OISD Big) |

## DNS-Kette

### Primär (10.0.2.1) — Pi-hole direkt

```mermaid
flowchart TD
    Client:::entry["Client (Port 53)"] --> PiHole:::accent["Pi-hole v6<br/>(FTL/dnsmasq 2.92)"]
    PiHole -->|"*.consul"| Consul:::svc["Consul Server (8600)"]
    PiHole -->|"*.local"| Router:::svc["Router (10.0.0.1)"]
    PiHole -->|"*.ackermannprivat.ch"| Lokal1:::svc["10.0.2.1 (lokal)"]
    PiHole -->|"*.ackermann.systems"| Lokal2:::svc["10.0.2.1 (lokal)"]
    PiHole -->|"nana/autodiscover"| Public:::ext["1.1.1.1 (öffentlich)"]
    PiHole -->|"andere"| Unbound:::svc["Unbound (2253)"]
    Unbound --> Root:::ext["Root DNS"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

### Sekundär (10.0.2.2) — Legacy-Stack

```mermaid
flowchart TD
    Client2:::entry["Client (Port 53)"] --> dnsmasq:::accent
    dnsmasq -->|"*.consul"| Consul2:::svc["Consul Server (8600)"]
    dnsmasq -->|"*.local"| Router2:::svc["Router (10.0.0.1)"]
    dnsmasq -->|"*.ackermannprivat.ch"| Traefik2:::svc["Traefik (10.0.2.2)"]
    dnsmasq -->|"andere"| PiHole2:::svc["Pi-hole (1153)"]
    PiHole2 --> Unbound2:::svc["Unbound (2253)"]

    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

::: info Migration 22.02.2026
Der primäre DNS (10.0.2.1) wurde am 22.02.2026 von einem separaten dnsmasq + Pi-hole Stack auf **Pi-hole v6 direkt auf Port 53** migriert. Pi-hole v6 (FTL v6.5) enthält ein eingebettetes dnsmasq 2.92, das alle bisherigen dnsmasq-Regeln (Conditional Forwarding, lokale Records, Wildcards) übernimmt. Der sekundäre DNS (10.0.2.2) läuft noch auf dem alten Stack.
:::

## Komponenten

### Pi-hole v6 (Primär)

Pi-hole v6 mit eingebettetem dnsmasq 2.92 (FTL v6.5) übernimmt auf 10.0.2.1 die Rolle des DNS-Eingangs-Routers **und** des Ad-Blockers in einem.

| Eigenschaft | Wert |
|-------------|------|
| Port | **53** (direkt, kein vorgelagerter dnsmasq) |
| Web-UI | Port 5480 (`/admin`) |
| Upstream | Unbound (Port 2253) |
| Blocklists | 29 Listen, ~709K unique Domains |
| Grösste Liste | OISD Big |
| dnsmasq-Version | 2.92 (eingebettet in FTL v6.5) |
| Custom Config | `/etc/dnsmasq.d/05-custom.conf` (via Volume) |

**Lokale DNS-Records** (in `05-custom.conf`):

| Record | Ziel-IP |
|--------|---------|
| `*.ackermannprivat.ch` (Wildcard) | 10.0.2.1 |
| `*.ackermann.systems` (Wildcard) | 10.0.2.1 |
| `vpn.ackermannprivat.ch` | 10.0.2.2 |
| `pve00/01/02.ackermannprivat.ch` | 10.0.2.40/41/42 |
| `pbs.ackermannprivat.ch` | 10.0.2.50 |
| `coturn.ackermannprivat.ch` | 10.0.2.80 |
| `meeting.ackermannprivat.ch` | 10.0.2.81 |
| `login.ackermannprivat.ch` | 10.0.0.200 |
| `HomeServer` / `homeserver.local` | 10.0.0.200 |

**Conditional Forwarding:**

| Domain-Muster | Upstream | Port |
|---------------|----------|------|
| `*.consul` | Consul Server (104/105/106) | 8600 |
| `*.local` | Router (10.0.0.1) | 53 |
| `nana.ackermannprivat.ch` | 1.1.1.1 | 53 |
| `autodiscover.ackermannprivat.ch` | 1.1.1.1 | 53 |
| `autodiscovery.ackermannprivat.ch` | 1.1.1.1 | 53 |

**Konfiguration:** Die Pi-hole TOML-Config (`/etc/pihole/pihole.toml`) muss `etc_dnsmasq_d = true` enthalten, damit die Custom-Config in `/etc/dnsmasq.d/` geladen wird.

### dnsmasq (nur noch Sekundär)

Auf 10.0.2.2 läuft noch der alte dnsmasq (jpillora/dnsmasq mit webproc UI) als Eingangs-Router auf Port 53.

::: warning Veraltete Software
jpillora/dnsmasq ist seit 2018 nicht mehr gepflegt und liefert dnsmasq v2.80. Dieses Setup soll mittelfristig ebenfalls auf Pi-hole direkt migriert werden.
:::

### Unbound

Rekursiver Resolver mit DNSSEC-Validierung. Löst Anfragen direkt gegen die Root-Server auf, ohne öffentliche DNS-Forwarder (Google, Cloudflare) zu verwenden.

| Eigenschaft | Wert |
|-------------|------|
| Port | 2253 |
| DNSSEC | Aktiv |
| Modus | Rekursiv (kein Forwarding) |

### Consul DNS

Service Discovery für den HashiCorp-Cluster. Jeder Consul Server stellt DNS auf Port 8600 bereit.

| Eigenschaft | Wert |
|-------------|------|
| Port | 8600 |
| Record-Typen | A, SRV |
| Format | `<service>.service.consul` |

SRV-Records liefern neben der IP auch den dynamischen Port des Services, was für Nomad-Jobs mit dynamischer Port-Zuweisung relevant ist.

## Consul-Forwarding

Pi-hole (10.0.2.1) bzw. dnsmasq (10.0.2.2) leiten alle `.consul`-Anfragen an alle drei Consul Server weiter. Die Konfiguration liegt in `/etc/dnsmasq.d/05-custom.conf` (Pi-hole) bzw. `/opt/dnsmasq.conf` (dnsmasq):

| Consul Server | IP | Port |
|---------------|-----|------|
| vm-nomad-server-04 | 10.0.2.104 | 8600 |
| vm-nomad-server-05 | 10.0.2.105 | 8600 |
| vm-nomad-server-06 | 10.0.2.106 | 8600 |

DNSSEC ist für die `.consul`-Zone deaktiviert, da Consul dies nicht unterstützt.

## Standorte und Failover

Die DNS-Infrastruktur läuft auf zwei VMs:

| Standort | VM | IP | Stack | Rolle |
|----------|-----|-----|-------|-------|
| Primär | vm-proxy-dns-01 | 10.0.2.1 | Pi-hole v6 direkt (:53) + Unbound | Hauptstandort (mit Traefik, CrowdSec) |
| Sekundär | vm-vpn-dns-01 | 10.0.2.2 | dnsmasq + Pi-hole + Unbound | Failover (mit ZeroTier VPN) |

Alle Netzwerk-Clients haben beide IPs als DNS-Server konfiguriert.

## Historie

| Datum | Änderung |
|-------|-----------|
| ~2025 | Initialer Stack: dnsmasq → Pi-hole → Unbound auf beiden VMs |
| 22.02.2026 | 10.0.2.1: dnsmasq (jpillora, v2.80) entfernt — deadlocked regelmässig. Pi-hole v6 direkt auf Port 53 mit Custom dnsmasq.d Config |

## Verwandte Seiten

- [HashiCorp Stack](hashicorp-stack.md) — Consul-Cluster Details
- [Sicherheit](security.md) — CrowdSec-Integration auf vm-proxy-dns-01
- [Netzwerk-Tuning](network-tuning.md) — TCP/IP-Optimierungen

