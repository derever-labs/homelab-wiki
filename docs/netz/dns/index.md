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
| IPs | Siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md) |

## Rolle im Stack

DNS ist die Basis-Dependency für alle Netzwerk-Clients und Nomad-Services. Die Kette läuft DHCP -> Pi-hole -> Unbound bzw. Consul: Clients erhalten beide Pi-hole-LXCs als Resolver, Pi-hole leitet `.consul`-Anfragen an den Consul-Cluster (Service Discovery für alle Nomad-Container) und alle übrigen Anfragen an Unbound weiter.

## DNS-Kette

**Leitfrage:** Welchen Weg nimmt die DNS-Anfrage eines Lenzburg-Clients -- und welcher Zweig antwortet für welchen Namensraum?

Beide LXCs sind identisch konfiguriert, die Kette gilt darum für jeden der beiden Eingänge. Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt; gestrichelte Kanten stehen für Hintergrundverkehr -- oder dafür, dass keine Verbindung fliesst, sondern nur die Antwort auf das Ziel zeigt. Die Farben folgen dem Netz-Big-Picture ([Das Gesamtbild in drei Pfaden](../index.md#das-gesamtbild-in-drei-pfaden)): Grün bleibt im LAN, Ocker ist der Consul-Zweig, Blau geht ins Internet, Grau sind Neben- und Kontrollwege.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  lanweg: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  wanweg: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  consulweg: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
  neben: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

Client: Netzwerk-Client {
  class: node
  tooltip: Alle Geräte im Netzwerk -- DHCP verteilt beide DNS-IPs, die Docker-Daemons der Nomad-Clients zeigen auf dieselben beiden LXCs
}

pihole: Pi-hole v6 (DNS-Eingang) {
  class: container

  PH2: lxc-dns-02 (Secondary) {
    class: node
    tooltip: 10.0.2.2, LXC auf pve02, Port 53, FTL/dnsmasq
  }
  PH1: lxc-dns-01 (Primary) {
    class: node
    tooltip: 10.0.2.1, LXC auf pve01, Port 53, FTL/dnsmasq
  }

  PH1 <-> PH2: Nebula-Sync täglich 04.00 Uhr {
    class: neben
    style.stroke-dash: 3
  }
}

Traefik: Traefik VIP {
  class: node
  tooltip: 10.0.2.20 -- Ziel der Wildcard-Records *.ackermannprivat.ch / *.ackermann.systems
}

consul: Consul DNS {
  class: node
  tooltip: vm-nomad-server-04/05/06, Port 8600 -- Service Discovery für Nomad-Container
}

Router: UDM Pro {
  class: node
  tooltip: 10.0.0.1 -- löst *.local auf (UniFi-Geräte und DHCP-Hostnamen)
}

Unbound: Unbound {
  class: node
  tooltip: läuft je LXC auf localhost 5335 -- rekursiver Resolver mit DNSSEC-Validierung
}

Root: Root DNS Server {
  class: node
  tooltip: 13 Root-Server -- direkte Rekursion, kein Forwarder dazwischen
}

Client -> pihole: 1. DNS-Query (Port 53) { class: lanweg }
pihole -> Traefik: "2. Homelab-Domains -- Antwort\naus lokalen Wildcard-Records" {
  class: lanweg
  style.stroke-dash: 3
}
pihole -> consul: "3. *.consul -- Conditional\nForwarding (Port 8600)" { class: consulweg }
pihole -> Router: "4. *.local -- Conditional\nForwarding (Port 53)" { class: neben }
pihole -> Unbound: "5. alle übrigen Domains\n(localhost 5335)" { class: neben }
Unbound -> Root: "6. rekursive Auflösung --\nDNSSEC-validiert" { class: wanweg }
```

Lesehilfe:

1. Jede Anfrage geht an einen der beiden Pi-hole-LXCs: DHCP verteilt beide IPs an die Lenzburg-Clients, die Docker-Daemons der Nomad-Clients sind auf dieselben beiden konfiguriert ([Docker Daemon DNS](#docker-daemon-dns)).
2. Die Weiche stellt FTL/dnsmasq anhand des Namensraums, Ad-Blocking passiert am selben Punkt. Homelab-Domains beantwortet Pi-hole direkt aus den lokalen Wildcard-Records mit der Traefik-VIP -- kein Forwarding, kein Internet-Roundtrip; spezifische Overrides zeigen auf Proxmox-Hosts bzw. Tailscale-IPs ([Pi-hole v6](#pi-hole-v6)).
3. `*.consul` geht per Conditional Forwarding an die drei Consul-Server auf Port 8600; die Antwort spiegelt den Live-Catalog, nur gesunde Services sind auflösbar ([Consul DNS](#consul-dns), Mechanik: [Consul Query-Pfad](../../plattform/consul/index.md#query-pfad-wie-ein-consul-name-aufgelost-wird)).
4. `*.local` geht an den UDM Pro, der UniFi-Geräte und DHCP-Hostnamen kennt ([Pi-hole v6](#pi-hole-v6)).
5. Alle übrigen Domains gehen an Unbound auf demselben LXC (localhost 5335) -- bewusst ohne Cloud-Resolver ([Unbound](#unbound)).
6. Unbound löst vollrekursiv direkt gegen die Root-Server auf, DNSSEC-validiert -- kein externer Anbieter sieht alle Queries des Homelabs.
7. Der graue Sync-Pfeil ist Hintergrundverkehr: Nebula-Sync repliziert die Konfiguration täglich vom Primary auf den Secondary ([Synchronisation](#synchronisation-nebula-sync)); fällt ein LXC aus, übernimmt der andere ([Standorte und Failover](#standorte-und-failover)).

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

Ziel-IPs siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md).

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

Service Discovery für den HashiCorp-Cluster. Alle drei Consul Server (vm-nomad-server-04/05/06) stellen DNS auf Port 8600 bereit -- Adressen siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md) und [HashiCorp Stack](../../plattform/nomad/index.md).

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

Alle Nomad Clients haben in `/etc/docker/daemon.json` beide DNS-Server (lxc-dns-01 und lxc-dns-02) konfiguriert. IPs: [Hosts und IPs](../../_referenz/hosts-und-ips.md). Die Konfiguration wird über die Ansible-Rolle `docker` verwaltet.

## Standorte und Failover

Die zentrale DNS-Infrastruktur (Pi-hole + Unbound) steht am Hauptstandort **Lenzburg**: lxc-dns-01 (Primary) und lxc-dns-02 (Secondary) laufen auf getrennten Proxmox-Hosts -- Host/IP/LXC-ID/Proxmox-Zuordnung siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md). Alle Lenzburg-Clients haben beide IPs als DNS-Server (via DHCP).

Ausfallverhalten der Kette (Zweig-Nummern aus der [DNS-Kette](#dns-kette)):

- **Ein DNS-LXC fällt aus:** Der andere übernimmt automatisch -- beide sind identisch konfiguriert (Ansible plus [Nebula-Sync](#synchronisation-nebula-sync)), alle Clients kennen beide IPs.
- **Beide DNS-LXCs fallen aus:** Die Namensauflösung in Lenzburg steht komplett -- alle Zweige, auch `*.service.consul` für die Nomad-Container, denn die Docker-Daemons zeigen auf dieselben beiden LXCs ([Docker Daemon DNS](#docker-daemon-dns)).
- **Consul-Cluster ohne Quorum:** Nur der `.consul`-Zweig (3) fällt aus, die übrigen Zweige antworten weiter ([Consul -- Ausfallverhalten](../../plattform/consul/index.md#ausfallverhalten)).
- **WAN-Uplink weg:** Die Homelab-Domains bleiben auflösbar, denn Zweig 2 antwortet aus lokalen Records ohne Internet -- nur die Rekursion für externe Domains (5/6) fällt aus ([Ausfallverhalten im Netz-Big-Picture](../index.md#ausfallverhalten)).

::: warning Kein Fallback bei Doppelausfall
Die Lenzburg-Clients haben ausser den beiden DNS-LXCs keinen weiteren Resolver -- bei Ausfall beider LXCs gibt es keinen Fallback. Das ist ein bewusst akzeptiertes Restrisiko der Architektur. Daraus folgt die Wartungsregel: die DNS-LXCs nie gleichzeitig neu starten, immer einen am Laufen lassen.
:::

Die Aussenstellen **Dottikon** und **Luzern** ([Standorte](../netzwerk/standorte.md)) betreiben **keinen eigenen Pi-hole** -- lokale Clients nutzen den DNS ihres jeweiligen UniFi-Gateways. Die Homelab-FQDNs der externen Nodes werden über die oben genannten Split-DNS-Overrides auf ihre Tailscale-IPs aufgelöst.

## IaC-Verwaltung

| Komponente | Pfad |
|------------|------|
| LXC-Erstellung | `terraform/proxmox-vms/main.tf` |
| Ansible-Rolle | `ansible/roles/pihole/` |
| Deploy-Playbook | `ansible/playbooks/deploy-pihole.yml` |
| Nebula-Sync | `nomad-jobs/infrastructure/nebula-sync.nomad` |

## Historie

Die Migrations-Chronologie der DNS-Infrastruktur (dnsmasq -> Pi-hole -> Bare-Metal-LXC) ist in der Git-History nachvollziehbar.

## DNS-Performance-Monitoring

Ein periodischer Batch Job (`batch-jobs/dns-performance.nomad`) misst alle 5 Minuten die DNS-Latenz gegen mehrere DNS-Server und schreibt die Ergebnisse nach InfluxDB. Die Metriken sind im Grafana-Dashboard einsehbar.

## Verwandte Seiten

- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- Kanonische IP-Adresstabelle
- [HashiCorp Stack](../../plattform/nomad/index.md) -- Consul-Cluster Details
- [Netzwerk](../netzwerk/index.md) -- VLANs, DNS, Routing
- [Batch Jobs](../../_querschnitt/batch-jobs.md) -- Alle periodischen Nomad Jobs
