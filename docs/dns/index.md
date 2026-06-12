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
| Deployment | Bare-metal in LXC (Terraform + Ansible) |
| Sync | Nebula-Sync (Nomad Service-Job mit integriertem Cron) |
| IPs | Siehe [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Rolle im Stack

DNS ist die Basis-Dependency für alle Netzwerk-Clients und Nomad-Services. Die Kette läuft DHCP -> Pi-hole -> Unbound bzw. Consul: Clients erhalten beide Pi-hole-LXCs als Resolver, Pi-hole leitet `.consul`-Anfragen an den Consul-Cluster (Service Discovery für alle Nomad-Container) und alle übrigen Anfragen an Unbound weiter.

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
  tooltip: "Alle Geräte im Netzwerk, DNS via DHCP (10.0.2.1 / 10.0.2.2)"
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

  PH1 <-> PH2: Nebula-Sync (täglich 04:00) {
    style.stroke: "#6b7280"
    style.stroke-dash: 3
    tooltip: "Full Teleporter Sync, Nomad Service-Job mit internem Cron"
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
  tooltip: "10.0.0.1 | Löst *.local auf"
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
  tooltip: "Port 8600 | Service Discovery für Nomad-Container"
}
pihole -> Router: *.local {
  style.stroke: "#6b7280"
  tooltip: "UniFi-Geräte und DHCP-Hostnamen"
}
pihole -> Traefik: *.ackermannprivat.ch / *.ackermann.systems {
  style.stroke: "#16a34a"
  tooltip: "Wildcard-DNS zeigt auf Traefik VIP 10.0.2.20"
}
pihole -> Unbound: Alle anderen Domains {
  style.stroke: "#6b7280"
  tooltip: "Upstream für nicht-lokale Anfragen"
}
Unbound -> Root: Rekursive Auflösung {
  style.stroke: "#6b7280"
  tooltip: "Direkt gegen Root-Server, kein Forwarding"
}
```

## Komponenten

### Pi-hole v6

Pi-hole v6 mit eingebettetem dnsmasq (FTL) übernimmt DNS-Eingangs-Router und Ad-Blocker in einem.

| Attribut | Wert |
|-------------|------|
| Port | **53** (direkt) |
| Web-UI | Port 80 (`/admin`) |
| Upstream | Unbound (Port 5335, localhost) |
| Config | `/etc/pihole/pihole.toml` |
| Custom dnsmasq | `/etc/dnsmasq.d/` (aktiviert via `etc_dnsmasq_d = true`) |

**Wildcard-DNS-Records** (via Ansible-Rolle `ansible/roles/pihole/`):

| Record | Ziel |
|--------|------|
| `*.ackermannprivat.ch` (Wildcard) | Traefik VIP |
| `*.ackermann.systems` (Wildcard) | Traefik VIP |

**Spezifische Overrides:**

| Record | Ziel |
|--------|------|
| `vpn.ackermannprivat.ch` | Traefik VIP |
| `pve00/01/02.ackermannprivat.ch` | Proxmox-Hosts |
| `pbs.ackermannprivat.ch` | PBS |
| `pve-lu-01.ackermannprivat.ch` | pve-lu-01 (Tailscale-IP 100.112.213.18) |
| `pve01.nana.ackermannprivat.ch` | pve-01-nana (Tailscale-IP 100.81.116.122) |

Ziel-IPs siehe [Hosts und IPs](../_referenz/hosts-und-ips.md).

::: info Externe Nodes zeigen auf Tailscale-IPs
Die Overrides der externen Standalone-Nodes lösen bewusst auf die **Tailscale-IP** auf (nicht auf eine LAN-IP), da diese Standorte nur über Tailscale erreichbar sind. So tragen die FQDNs ein gültiges Let's-Encrypt-Zertifikat und PDM kann sie über FQDN + CA-Trust anbinden. SSOT der Overrides: `ansible/roles/pihole/defaults/main.yml` im `homelab-hashicorp-stack`. Änderungen an `/etc/dnsmasq.d/` greifen erst nach einem `pihole-FTL`-Restart (ein `reload-lists`/`restartdns` lädt die dnsmasq-Config nicht neu).
:::

**Conditional Forwarding:**

| Domain-Muster | Upstream | Port |
|---------------|----------|------|
| `*.consul` | Consul Server | 8600 |
| `*.local` | Router (UDM Pro) | 53 |

::: info DNS-Rate-Limit deaktiviert
Pi-holes Default-Rate-Limit (1000 Anfragen pro 60 s pro Client) ist auf Browser-Last dimensioniert und nicht auf Nomad-Worker mit hoher Container-Dichte. Beim Hochfahren vieler Container gleichzeitig (z. B. Init-Container wie `wait-for-postgres`, die `*.service.consul` im 2-Sekunden-Takt resolven) wird die Schwelle überschritten -- Pi-hole antwortet `REFUSED`, die Init-Container hängen im Loop und halten den Rate-Limit-Zustand aktiv (Cascade-Lock). Daher ist das Limit auf beiden DNS-LXCs deaktiviert. Verwaltet via Ansible-Variable `pihole_rate_limit_count` in `ansible/roles/pihole/defaults/main.yml`.
:::

### Unbound

Rekursiver Resolver mit DNSSEC-Validierung. Löst Anfragen direkt gegen die Root-Server auf.

| Attribut | Wert |
|-------------|------|
| Port | 5335 (localhost) |
| DNSSEC | Aktiv (Unbound validiert, Pi-hole selbst NICHT -- doppelte Validierung ist unnötig und erzeugt Warnings) |
| Modus | Rekursiv (kein Forwarding) |
| Config | `/etc/unbound/unbound.conf.d/pi-hole.conf` |

::: info Warum kein DNS-over-TLS / kein Cloud-Resolver?
Unbound läuft bewusst im vollrekursiven Modus ohne Forwarding an Cloudflare, Quad9 oder andere Cloud-Resolver. Damit sieht kein externer Anbieter alle ausgehenden Queries des Homelabs -- DNSSEC-Validierung bleibt durch direkte Rekursion gegen die Root-Server gewährleistet, ohne auf eine externe Vertrauensanker-Instanz angewiesen zu sein. Das entspricht der Self-Hosted-Linie: keine Cloud-Abhängigkeit in der DNS-Auflösung.

Aktive Hardening-Optionen: `harden-below-nxdomain`, `harden-algo-downgrade` und `aggressive-nsec`. Details und vollständige Konfiguration: `ansible/roles/pihole/` im Repo `homelab-hashicorp-stack`.
:::

### Consul DNS

Service Discovery für den HashiCorp-Cluster. Alle drei Consul Server (vm-nomad-server-04/05/06) stellen DNS auf Port 8600 bereit -- Adressen siehe [Hosts und IPs](../_referenz/hosts-und-ips.md) und [HashiCorp Stack](../nomad/index.md).

## Synchronisation (Nebula-Sync)

Ein Nomad-Job synchronisiert die Pi-hole-Konfiguration von lxc-dns-01 (Primary) auf lxc-dns-02 (Replica).

| Attribut | Wert |
|-------------|------|
| Modus | Full Sync (Teleporter) |
| Intervall | Täglich 04:00 Uhr |
| Nomad-Job | `nebula-sync` (Service-Job, Cron intern via `CRON=0 4 * * *`) |
| Credentials | Nomad Variable `nomad/jobs/nebula-sync` |

Synchronisiert werden: Blocklists, Custom DNS Records, Gruppen, Clients, Einstellungen. **Nicht** synchronisiert: `/etc/dnsmasq.d/`-Dateien (werden über Ansible identisch deployed).

::: info Warum nur täglich?
Jeder Teleporter-Import triggert einen `pihole-FTL`-Restart. Während des Restarts (~1-2 s) liefert PiHole-2 keine DNS-Antworten, was Uptime-Kuma-Monitore flappen liess. Pi-hole-Konfigurationen ändern sich selten -- ein täglicher Sync reicht vollkommen.
:::

## Docker Daemon DNS

Alle Nomad Clients haben in `/etc/docker/daemon.json` beide DNS-Server (lxc-dns-01 und lxc-dns-02) konfiguriert. IPs: [Hosts und IPs](../_referenz/hosts-und-ips.md). Die Konfiguration wird über die Ansible-Rolle `docker` verwaltet.

## Standorte und Failover

Die zentrale DNS-Infrastruktur (Pi-hole + Unbound) steht am Hauptstandort **Lenzburg**: lxc-dns-01 (Primary) und lxc-dns-02 (Secondary) laufen auf getrennten Proxmox-Hosts -- Host/IP/LXC-ID/Proxmox-Zuordnung siehe [Hosts und IPs](../_referenz/hosts-und-ips.md). Alle Lenzburg-Clients haben beide IPs als DNS-Server (via DHCP). Bei Ausfall eines LXC übernimmt der andere automatisch.

Die Aussenstellen **Dottikon** und **Luzern** ([Standorte](../netzwerk/standorte.md)) betreiben **keinen eigenen Pi-hole** -- lokale Clients nutzen den DNS ihres jeweiligen UniFi-Gateways. Die Homelab-FQDNs der externen Nodes werden über die oben genannten Split-DNS-Overrides auf ihre Tailscale-IPs aufgelöst.

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
