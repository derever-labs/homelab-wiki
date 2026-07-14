---
title: VM-Firewall Referenz
description: Security-Groups, IPSets und ihre Zuordnung zu den Stack-Systemen
tags:
  - netzwerk
  - security
  - referenz
---

# VM-Firewall Referenz

Technische Referenz zum Regelwerk der [VM-Firewall](./index.md). Die Quelle der Wahrheit ist
der Terraform-Code unter `homelab-hashicorp-stack/terraform/proxmox-firewall/`; diese Seite
beschreibt das Modell dahinter. Exakte Portnummern führt [Ports und Dienste](../_referenz/ports-und-dienste.md),
die IP-Adressen [Hosts und IPs](../_referenz/hosts-und-ips.md).

## IPSets (Quell-Zonen)

IPSets definieren, **wer** zugreifen darf. Sie sind cluster-weit und aus einzelnen
IP-Bausteinen komponiert, sodass sich dieselbe Adresse in mehreren Zonen wiederverwenden lässt.
In `security-groups.tf` werden sie als `+name` referenziert.

| IPSet | Bedeutung |
|-------|-----------|
| `ip-cluster` | Nomad-Server **und** -Clients gemeinsam (breite Control-Plane-Pfade) |
| `ip-nomad-servers` | Nur die drei Nomad-Server (Server-only-Dienste) |
| `ip-nomad-clients` | Nur die drei Nomad-Clients |
| `ip-storage-nodes` | Die beiden LINSTOR/DRBD-Nodes (Controller-Failover) |
| `ip-traefik` | Traefik-VIP und -Nodes |
| `ip-pve-hosts` | Die Proxmox-Hypervisoren |
| `ip-monitoring` | CheckMK-Server und die Kuma-Watchdogs |
| `ip-dns` | Die Pi-hole-LXCs (für Consul-DNS-Forwarding) |
| `ip-admin` | Operator-Zugang: Tailnet-NoSNAT `100.64.0.0/10` **und** Management-LAN |
| `ip-tailnet` | Tailscale-CGNAT-Bereich (externer Watchdog, Gitea-SSH, Operator) |
| `ip-smtp-senders` | Erlaubte Absender an den SMTP-Relay |
| `ip-ha` | Home Assistant (InfluxDB- und MQTT-Schreiber) |
| `ip-int-vlans` | Alle internen VLANs (für DNS-Zugriff aus allen Zonen) |

::: warning Operator-Quelle ist die Tailnet-CGNAT-Adresse
`ip-admin` enthält bewusst `100.64.0.0/10`, nicht eine LAN- oder Router-IP. Wegen des
Tailscale-NoSNAT-Verhaltens (siehe [Tailscale](../netzwerk/tailscale.md)) kommt Operator-SSH mit
der CGNAT-Quelladresse an. Ohne diesen Bereich in `ip-admin` sperrt sich der Operator beim ersten
`input DROP` selbst aus. Das Management-LAN `10.0.0.0/22` ist zusätzlich als Notanker enthalten.
:::

Das Modul definiert weitere IP-Bausteine (etwa für die NAS), die als Quelle vorbereitet, aber
aktuell in keiner Regel referenziert sind.

## Security-Groups (erlaubte Dienste)

Security-Groups bündeln, **was** eine Rolle annimmt. Jede Regel ist `type=in / action=ACCEPT`;
alles Nicht-Erlaubte fällt in die `input DROP`-Policy der VM.

| Security-Group | Zweck | Angebunden an |
|----------------|-------|---------------|
| `sg-base` | SSH und ICMP von Admin, CheckMK-Agent | Alle Systeme |
| `sg-consul-member` | Consul Serf-LAN/RPC im Cluster, Serf-WAN unter Servern | Server + Clients |
| `sg-nomad-server` | Vault-, Consul-, etcd- und Nomad-Control-Plane | Nomad-Server |
| `sg-nomad-client` | Nomad-Dyn-Ports, cluster-interne Static-Ports, extern konsumierte Dienste | Nomad-Clients |
| `sg-traefik` | HTTP/HTTPS von überall, Syslog-Receiver, Tailscale, VRRP, Subnet-Router-Rückweg | Traefik-VMs |
| `sg-dns` | DNS `:53` aus allen Zonen und dem Tailnet, Pi-hole-UI von Admin | DNS-LXCs |

Der PBS-Host hat eine eigene, im Modul vorbereitete Gruppe (`sg-pbs`, PBS-API von pve-Hosts und
Admin); sie ist noch nicht scharf geschaltet.

### sg-base

An jedem System aktiv. Erlaubt SSH und ICMP-Diagnose ausschliesslich von `ip-admin` sowie den
CheckMK-Agent-Abruf von `ip-monitoring`. Damit ist der Verwaltungs- und Monitoring-Pfad überall
gleich, unabhängig von der Rolle.

### sg-consul-member

An Server und Clients. Erlaubt den Consul-Serf-Gossip und die RPC-Weiterleitung innerhalb von
`ip-cluster`. Wichtig: Auch die Consul-Client-Agents leiten über den RPC-Port an die Server
weiter -- diese Quelle muss `ip-cluster` sein, nicht nur die Server-IPs, sonst fallen die
Client-Agents beim Scharfschalten aus. Der Serf-WAN-Pool ist auf die Server beschränkt.

### sg-nomad-server

An den Nomad-Servern. Bündelt die gesamte Control-Plane: Vault-API (von Cluster, Traefik und
Admin), den Vault-Cluster-Port und etcd nur unter den Servern, Consul-HTTP/gRPC/DNS sowie die
Nomad-API und den Nomad-RPC/Serf. Die Consul-HTTP- und Nomad-API-Ports sind zusätzlich für die
Watchdogs (`ip-monitoring` und `ip-tailnet`) offen, damit die Traefik-unabhängige
Health-Überwachung direkt prüfen kann. Consul-DNS ist zusätzlich für die Pi-holes offen, die
`*.consul` an die Server weiterleiten.

### sg-nomad-client

An den Nomad-Clients, die grösste Gruppe. Sie deckt drei Kategorien ab:

- **Nomad-Workloads:** die dynamischen Job-Ports von Cluster und Traefik sowie -- pauschal für
  `ip-cluster` -- die cluster-internen statischen Job-Ports. Diese Pauschale verhindert einen
  Port-Freeze der Job-Platzierung; die eigentliche Schutzleistung ist, dass diese Ports von
  ausserhalb des Clusters dicht sind.
- **Storage:** die LINSTOR-Satellite- und Controller-Ports sowie die DRBD-Replikations-Range,
  jeweils unter den Storage- bzw. Client-Knoten. Die eigentliche DRBD-Replikation zwischen den
  Storage-Nodes läuft über das ungefilterte Thunderbolt-Interface, nicht über diese Regeln.
- **Extern konsumierte Einzeldienste:** SMTP-Relay, MQTT von Home Assistant, InfluxDB (von
  pve-Hosts, Home Assistant und dem Tailnet-Watchdog), Gitea-SSH, Loki, die Kuma-Ports,
  der Telegram-Relay und der Syslog-Empfang. Ausserdem die statischen Service-Ports, die
  Traefik direkt anspricht (Consul-Catalog-Dienste mit festem Port).

### sg-traefik

An den Traefik-VMs, der am stärksten exponierten Rolle. HTTP und HTTPS sind von überall offen
(öffentlicher Ingress), dazu der Syslog-Receiver aus den internen VLANs, der Tailscale-Direct-Port
und die Docker-Metrics für das Monitoring. Zwei Regeln sind sicherheitskritisch für den Rollout:

- **VRRP (Protokoll 112) zwischen den beiden Traefik-Nodes** -- muss vor dem Scharfschalten
  stehen, sonst beanspruchen beide Nodes die Keepalived-VIP (Split-Brain).
- **Subnet-Router-Rückweg (`dest 100.64.0.0/10`)** -- die Traefik-VMs routen das Tailnet;
  Rückweg-Pakete Richtung Tailnet treffen die Eingangskette der VM-Firewall. Details und die
  Lockout-Mechanik: [Betrieb](./betrieb.md#lockout-vermeidung).

### sg-dns

An den Pi-hole-LXCs. Erlaubt DNS über TCP und UDP auf `:53` aus allen internen VLANs und dem
Tailnet sowie die Pi-hole-Weboberfläche nur von `ip-admin`. Als LXC-Ressourcen adressiert das
Terraform diese Systeme über die Container-ID statt der VM-ID.

## Zuordnung Security-Group zu System

| Systemgruppe | Systeme | Security-Groups |
|--------------|---------|-----------------|
| Nomad-Server | server-04, server-05, server-06 | `sg-base` + `sg-consul-member` + `sg-nomad-server` |
| Nomad-Clients | client-04, client-05, client-06 | `sg-base` + `sg-consul-member` + `sg-nomad-client` |
| Traefik-VMs | traefik-01, traefik-02 | `sg-base` + `sg-traefik` |
| DNS-LXCs | lxc-dns-01, lxc-dns-02 | `sg-base` + `sg-dns` |

VM-IDs, Host-Zuordnung und IP-Adressen sind kanonisch in [Hosts und IPs](../_referenz/hosts-und-ips.md#proxmox-cluster)
geführt.

## Firewall-Options je System

Jedes System erhält dieselben Enforcement-Optionen: `input DROP`, `output ACCEPT`, aktivierter
DHCP-Client (damit ein Lease-Renewal nie an der Policy scheitert), kein IP-/MAC-Filter und
`log_level_in = info`, damit gedroppte Pakete für die Verifikation sichtbar sind. Die Options
hängen im Terraform hart an den Regeln (`depends_on`), damit die DROP-Policy nie vor den
erlaubenden Regeln aktiv wird.

## Verwandte Seiten

- [VM-Firewall](./index.md) -- Architektur und Rolle im Stack
- [Betrieb](./betrieb.md) -- Drop-Log-Triage, Ausroll-Wellen, Lockout-Vermeidung
- [Ports und Dienste](../_referenz/ports-und-dienste.md) -- Exakte Portnummern je Dienst
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- VM- und IP-Zuordnung
- [Netzwerk](../netzwerk/index.md) -- VLAN-Segmente und Topologie
