---
title: DNS-Architektur
description: DNS-Kette, Komponenten und Consul-Forwarding
tags:
  - platform
  - dns
  - networking
---

# DNS-Architektur

## Uebersicht

| Eigenschaft | Wert |
|-------------|------|
| Primaerer DNS | 10.0.2.1 (vm-proxy-dns-01) |
| Sekundaerer DNS | 10.0.2.2 (vm-vpn-dns-01) |
| Deployment | Docker Compose (Ansible-managed) |
| Blocklists | ~709K unique Domains (29 Listen inkl. OISD Big) |

## DNS-Kette

```
Client (Port 53)
      |
  dnsmasq ---+--- *.consul ----------> Consul Server (8600)
             +--- *.local -----------> Router (10.0.0.1)
             +--- *.ackermannprivat.ch -> Traefik (10.0.2.1)
             +--- andere ------------> Pi-hole (1153) ---> Unbound (2253)
```

## Komponenten

### dnsmasq

Eingangs-Router fuer alle DNS-Anfragen auf Port 53. Leitet Anfragen je nach Domain an den passenden Upstream weiter:

| Domain-Muster | Upstream | Port |
|---------------|----------|------|
| `*.consul` | Consul Server | 8600 |
| `*.local` | Router | 53 |
| `*.ackermannprivat.ch` | Traefik | - |
| Alles andere | Pi-hole | 1153 |

Web-UI auf Port 5380.

### Pi-hole

Ad-Blocking-DNS mit Web-UI.

| Eigenschaft | Wert |
|-------------|------|
| Port | 1153 |
| Web-UI | Port 5480 (`/admin`) |
| Upstream | Unbound (Port 2253) |
| Blocklists | 29 Listen, ~709K unique Domains |
| Groesste Liste | OISD Big |

### Unbound

Rekursiver Resolver mit DNSSEC-Validierung. Loest Anfragen direkt gegen die Root-Server auf, ohne oeffentliche DNS-Forwarder (Google, Cloudflare) zu verwenden.

| Eigenschaft | Wert |
|-------------|------|
| Port | 2253 |
| DNSSEC | Aktiv |
| Modus | Rekursiv (kein Forwarding) |

### Consul DNS

Service Discovery fuer den HashiCorp-Cluster. Jeder Consul Server stellt DNS auf Port 8600 bereit.

| Eigenschaft | Wert |
|-------------|------|
| Port | 8600 |
| Record-Typen | A, SRV |
| Format | `<service>.service.consul` |

SRV-Records liefern neben der IP auch den dynamischen Port des Services, was fuer Nomad-Jobs mit dynamischer Port-Zuweisung relevant ist.

## Consul-Forwarding

dnsmasq leitet alle `.consul`-Anfragen an alle drei Consul Server weiter. Die Konfiguration liegt unter `/etc/dnsmasq.d/02-consul.conf` und enthaelt alle Server als Upstream fuer Redundanz:

| Consul Server | IP | Port |
|---------------|-----|------|
| vm-nomad-server-04 | 10.0.2.104 | 8600 |
| vm-nomad-server-05 | 10.0.2.105 | 8600 |
| vm-nomad-server-06 | 10.0.2.106 | 8600 |

DNSSEC ist fuer die `.consul`-Zone deaktiviert, da Consul dies nicht unterstuetzt.

## Standorte und Failover

Die DNS-Infrastruktur laeuft identisch auf zwei VMs:

| Standort | VM | IP | Rolle |
|----------|-----|-----|-------|
| Primaer | vm-proxy-dns-01 | 10.0.2.1 | Hauptstandort (mit Traefik, CrowdSec) |
| Sekundaer | vm-vpn-dns-01 | 10.0.2.2 | Failover (mit ZeroTier VPN) |

Beide VMs betreiben den gleichen DNS-Stack (dnsmasq, Pi-hole, Unbound) mit identischer Konfiguration. Alle Netzwerk-Clients haben beide IPs als DNS-Server konfiguriert.

## Verwandte Seiten

- [HashiCorp Stack](hashicorp-stack.md) — Consul-Cluster Details
- [Sicherheit](security.md) — CrowdSec-Integration auf vm-proxy-dns-01
- [Netzwerk-Tuning](network-tuning.md) — TCP/IP-Optimierungen

---
*Letztes Update: 21.02.2026*
