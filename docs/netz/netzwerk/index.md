---
title: Netzwerk
description: Netzwerk-Topologie, Segmente, DNS, Tailscale und Hardware im Homelab
tags:
  - netzwerk
  - vlan
  - dns
  - unifi
  - tailscale
---

# Netzwerk

Das Homelab erstreckt sich über drei Standorte -- **Lenzburg** (Hauptstandort), **Dottikon** und **Luzern** --, verbunden über ein Tailscale-Overlay. Die [Gesamtübersicht](#gesamtubersicht) zeigt sie im Zusammenhang; Details je Standort führt die [Standorte](./standorte.md)-Seite. Der übrige Teil dieser Seite dokumentiert den **Hauptstandort Lenzburg** im Detail (VLAN-Segmente, physische Topologie, Hardware), geroutet über einen UniFi Dream Machine Pro mit SFP+-WAN-Uplink via ISP-Router. Controller-Spezifika (Firewall, WLAN, Zugang) führt [UniFi](../unifi/).

Lesekonvention für die Diagramme dieser Seite: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt, was fliesst. Durchgezogene Kanten tragen den synchronen Datenpfad, gestrichelte asynchronen Kontroll- oder Hintergrundverkehr. Nur die physische Topologie verwendet ungerichtete Kanten -- dort stehen sie für Kabel. Farben kodieren die Wege: Blau der externe Request-Pfad, Grün der interne Pfad, Ocker Neben- und Pflegewege.

## Gesamtübersicht

**Leitfrage:** Wie hängen die drei Standorte zusammen -- wer baut die Verbindung auf, und was fällt aus, wenn ein Standort offline geht?

```d2
classes: {
  site: {
    style: { stroke-dash: 4; border-radius: 8 }
  }
  node: {
    style: { border-radius: 8 }
  }
  overlay: {
    style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" }
  }
}

internet: Internet {
  class: node
  top: 40
  left: 700
  tooltip: "Drei getrennte Standort-Uplinks, keine Standleitung, kein klassisches Site-to-Site-VPN"
}

tailnet: Tailscale Overlay {
  class: node
  top: 800
  left: 680
  tooltip: "Tailnet derever@github, CGNAT 100.64.0.0/10, ACL-getrennt von tag:hslu"
}

lenzburg: Standort Lenzburg {
  class: site
  top: 320
  left: 40
  tooltip: "Hauptstandort, 10.0.0.0/22 plus VLANs"
  gw: UDM Pro { class: node; tooltip: "Gateway 10.0.0.1, statische öffentliche WAN-IP" }
  router: vm-traefik-01/02 { class: node; tooltip: "Traefik-VIP 10.0.2.20, Subnet-Router + Exit-Nodes" }
  devices: "Proxmox-Cluster, NAS, DNS, Home Assistant" { class: node; tooltip: "pve00/01/02, Synology 10.0.0.200, lxc-dns-01/02, HA 10.0.0.100" }
}

dottikon: Standort Dottikon {
  class: site
  top: 320
  left: 620
  tooltip: "Aussenstelle Nana, 192.168.2.0/23"
  gw: UDM Ultra { class: node; tooltip: "Gateway 192.168.2.1" }
  pve: pve-01-nana { class: node; tooltip: "192.168.2.41, Subnet-Router + externer Watchdog" }
  devices: "NanaServer, Home Assistant" { class: node; tooltip: "Synology 192.168.3.181, HA-Instanz Dottikon" }
}

luzern: Standort Luzern {
  class: site
  top: 320
  left: 1130
  tooltip: "Aussenstelle, 172.16.0.0/24"
  gw: UniFi-Gateway { class: node; tooltip: "Gateway 172.16.0.1" }
  pve: pve-lu-01 { class: node; tooltip: "172.16.0.200, Subnet-Router, Standalone-Node" }
  atv: apple-tv { class: node; tooltip: "tag:admin, redundanter Träger der Luzern-Route" }
}

lenzburg.gw -> internet: eigener WAN-Uplink
dottikon.gw -> internet: eigener WAN-Uplink
luzern.gw -> internet: eigener WAN-Uplink

lenzburg.router -> tailnet: "advertisiert 10.0.0.0/22 + 10.0.10.0/24" { class: overlay }
dottikon.pve -> tailnet: "advertisiert 192.168.2.0/23" { class: overlay }
luzern.pve -> tailnet: "advertisiert 172.16.0.0/24" { class: overlay }
luzern.atv -> tailnet: "advertisiert 172.16.0.0/24 (redundant)" { class: overlay }
```

**Lesehilfe:**

1. Jeder Standort hat ein eigenes UniFi-Gateway und einen eigenen Internet-Uplink -- die Standorte teilen keine WAN-Infrastruktur ([Standorte](./standorte.md)).
2. Die Subnet-Router bauen ausgehende WireGuard-Tunnel ins Tailnet auf und advertisieren ihr Standort-LAN -- die Aussenstandorte brauchen dafür keine eingehenden Freigaben ([Tailscale -- Tag-Schema](./tailscale.md#tag-schema)).
3. LAN-zu-LAN-Verkehr zwischen Standorten läuft immer durch die Subnet-Router beider Seiten. Wie Hin- und Rückweg im Detail funktionieren (SNAT, Rückrouten): [Tailscale -- Remote-Zugriff](./tailscale.md#subnet-router-topologie).
4. Fällt ein Aussenstandort aus, arbeiten die anderen lokal normal weiter -- es fehlt nur die Overlay-Erreichbarkeit dieses Standorts. Dottikon hängt an genau einem Subnet-Router (pve-01-nana), Luzern ist redundant advertisiert (pve-lu-01 und apple-tv).
5. Fällt Lenzburg aus, fehlen die zentralen Dienste (Traefik, Nomad-Cluster, zentrales Monitoring); die Aussenstandorte behalten ihre lokalen Home-Assistant-Instanzen. Der externe Watchdog auf pve-01-nana überwacht Lenzburg von aussen und alarmiert unabhängig ([Monitoring](../../monitoring/index.md)).

::: info Zwei Sichten auf die Standorte
Diese Map zeigt die **Netz- und Konnektivitäts-Sicht** (Gateways, Subnetze, Tailscale, Schlüssel-Devices).
Die **Proxmox-Verwaltungs- und Backup-Sicht** derselben Standorte (PDM verwaltet, PBS sichert) führt die
[Proxmox Standort-Topologie](../../infrastruktur/proxmox/index.md#standort-topologie).
:::

## Lenzburg -- Logische Topologie

**Leitfrage:** Wo wird zwischen den Segmenten entschieden -- und welcher Verkehr läuft am UDM Pro vorbei?

```d2
classes: {
  seg: {
    style: { stroke-dash: 4; border-radius: 8 }
  }
  node: {
    style: { border-radius: 8 }
  }
  bypass: {
    style: { stroke: "#8f6418"; font-color: "#8f6418" }
  }
}

wan: ISP-Router {
  class: node
  tooltip: "PPPoE-Terminierung, statische öffentliche IP"
}

udm: "UDM Pro (Router + Firewall)" {
  class: node
  tooltip: "Gateway aller Segmente (10.0.x.1), routet und filtert jeden Segment-Übergang (zonenbasierte Firewall)"
}

mgmt: "Management (native)\n10.0.0.0/22" {
  class: seg
  tooltip: "Proxmox-Hosts, Nomad-VMs, DNS-LXCs, Traefik-VMs, NAS, PBS, PDM, CheckMK, Home Assistant"
}
dev: "Device VLAN 10\n10.0.10.0/24" {
  class: seg
  tooltip: "Endgeräte"
}
guest: "Guest VLAN 30\n10.0.30.0/24" {
  class: seg
  tooltip: "Gäste-WLAN"
}
rack: "Rack VLAN 100\n10.0.100.0/24" {
  class: seg
  tooltip: "Rack-Infrastruktur"
}
iot: "IoT VLAN 200\n10.0.200.0/24" {
  class: seg
  tooltip: "Home Assistant, Zigbee, NAS"
}

tb: "Thunderbolt P2P\n10.99.1.0/24" {
  class: seg
  tooltip: "DRBD-Replikation + VM-Migration, läuft nicht über Switch oder UDM"
}
ts: "Tailscale Overlay\n100.64.0.0/10" {
  class: seg
  tooltip: "CGNAT-Overlay über die drei Standorte"
}

wan <-> udm: "WAN (SFP+ eth9)"
udm <-> mgmt
udm <-> dev
udm <-> guest
udm <-> rack
udm <-> iot

mgmt <-> tb: "nur pve01/pve02: DRBD + Migration" {
  class: bypass
  style.stroke-dash: 3
}
ts -> mgmt: "Eintritt bei vm-traefik-01/02" {
  class: bypass
  style.stroke-dash: 3
}
mgmt -> ts: "Rückweg als statische Route über den UDM" {
  class: bypass
  style.stroke-dash: 3
}
```

**Lesehilfe:**

1. Der UDM Pro ist das Gateway jedes Segments (`10.0.x.1`): Jedes Paket, das sein Segment verlässt, wird dort geroutet und von der zonenbasierten Firewall gefiltert ([UniFi](../unifi/)). Innerhalb eines Segments vermitteln die Switches -- diesen Verkehr sieht der UDM nicht.
2. Zweck und Adressbereiche der fünf Segmente: [Netzwerk-Segmente](#netzwerk-segmente).
3. Das [Thunderbolt-Netz](#thunderbolt-netzwerk) verbindet pve01 und pve02 direkt -- DRBD-Replikation und VM-Migration laufen an Switch, UDM und Firewall vorbei und überleben deshalb auch einen UDM-Ausfall.
4. Tailscale-Verkehr tritt bei den Subnet-Routern `vm-traefik-01/02` ins Management-Netz ein und umgeht auf dem Hinweg den UDM; der Rückweg läuft als statische Route (`100.64.0.0/10`) über ihn ([Tailscale -- Remote-Zugriff](./tailscale.md#subnet-router-topologie)).
5. Ausfall UDM Pro: Inter-Segment-Routing, WAN-Uplink und WLAN stehen komplett -- er ist ohne Redundanz ([UniFi Betrieb](../unifi/betrieb.md)).

## Lenzburg -- Physische Topologie

**Leitfrage:** An welchem Kabelstrang hängt ein Gerät -- und welcher Switch-Ausfall trifft welchen Bereich?

Ungerichtete Kanten stehen für Kabel. Die Farben markieren die drei Stränge ab UDM Pro: Blau der 10G-Strang ins Rack, Grün der PoE-Strang Kämmerli (WLAN-Hauptversorgung), Ocker die Keller-Kette. Gerätenamen wie im UniFi-Controller; Modelle und PoE-Budgets: [Hardware-Inventar](../../_referenz/hardware-inventar.md#unifi-netzwerk-hardware).

```d2
classes: {
  node: {
    style: { border-radius: 8 }
  }
  rackstrang: {
    style: { stroke: "#3b6ea5" }
  }
  wlanstrang: {
    style: { stroke: "#42714a" }
  }
  kellerstrang: {
    style: { stroke: "#8f6418" }
  }
}

ISP: ISP-Router { class: node; tooltip: "WAN-Uplink" }
UDM: UDM Pro { class: node; tooltip: "Gateway + Controller" }

AGG: "10G-Switch-Rack (USL8A)" {
  class: node
  tooltip: "8x SFP+ 10G, bindet die Rack-Geräte an (Proxmox-Nodes, NAS)"
}

POEKAM: "1G-PoE-Switch-Kämmerli (US-8-150W)" { class: node }
FLEX_DANI: "1G-Switch-Mini-Dani (Flex Mini)" { class: node }
FLEX_GAESTE: "1G-Switch-Mini-Gäste (Flex Mini)" { class: node }
AP_DANI: "AP-AC-LR-Dani" { class: node }
AP_KUCHE: "AP-U6-Pro-Küche" { class: node }
AP_NINA: "AP-U6-Pro-Nina" { class: node }
AP_GASTE: "AP-AC-LR-Gäste" { class: node }

KAM24: "1G-Switch-Kämmerli (US-24)" { class: node }
RACK1G: "1G-Switch-Rack (US-24)" { class: node }
POEKELLER: "1G-PoE-Switch-Keller (US-8-60W)" { class: node }
AP_WERKSTADT: "AP-AC-LR-Werkstadt" { class: node }
AP_GARAGE: "AP-AC-LR-Garage" { class: node }
AP_KOFFER: "AP-AC-LR-Koffer" { class: node }

ISP -- UDM: "SFP+ WAN (eth9)"
UDM -- AGG: "SFP+ 10G" { class: rackstrang }
UDM -- POEKAM: 1G { class: wlanstrang }
UDM -- KAM24: 1G { class: kellerstrang }

POEKAM -- FLEX_DANI { class: wlanstrang }
POEKAM -- FLEX_GAESTE { class: wlanstrang }
POEKAM -- AP_DANI { class: wlanstrang }
POEKAM -- AP_KUCHE { class: wlanstrang }
POEKAM -- AP_NINA { class: wlanstrang }
FLEX_GAESTE -- AP_GASTE { class: wlanstrang }

KAM24 -- RACK1G { class: kellerstrang }
RACK1G -- POEKELLER { class: kellerstrang }
POEKELLER -- AP_WERKSTADT { class: kellerstrang }
POEKELLER -- AP_GARAGE { class: kellerstrang }
POEKELLER -- AP_KOFFER { class: kellerstrang }
```

**Lesehilfe:**

1. Am UDM Pro hängen drei Kabelstränge: der 10G-Strang ins Rack, der PoE-Strang Kämmerli und die Keller-Kette. Der UDM ist der gemeinsame Single Point of Failure aller Stränge.
2. 10G-Strang (blau): Der USL8A bindet die 10G-Geräte im Rack an (Proxmox-Nodes, NAS). Fällt er aus, verlieren die Rack-Geräte ihre LAN-Anbindung -- das WLAN bleibt.
3. PoE-Strang Kämmerli (grün): Der US-8-150W versorgt drei Access Points direkt (Dani, Küche, Nina) und beide Flex Minis; der AP Gäste hängt hinter dem Flex Mini Gäste. Sein Ausfall nimmt das WLAN im Wohnbereich mit.
4. Keller-Kette (ocker): Drei Glieder in Serie -- US-24 Kämmerli, 1G-Switch-Rack, PoE-Switch-Keller. Jedes Glied der Kette trifft die APs Werkstadt, Garage und Koffer.
5. Keiner der Stränge ist redundant verkabelt -- die Verfügbarkeits-Aussage pro Bereich ergibt sich direkt aus der Kette, an der er hängt ([UniFi Betrieb](../unifi/betrieb.md)).

## Netzwerk-Segmente

VLAN-Segmente am Hauptstandort Lenzburg. Die Aussenstellen Dottikon (`192.168.2.0/23`) und Luzern (`172.16.0.0/24`) sind flache Standort-LANs ohne eigene VLAN-Segmentierung -- siehe [Standorte](./standorte.md). Die Proxmox- und Service-VMs (`10.0.2.x`) liegen statisch im **nativen Management-Netz** `10.0.0.0/22`, nicht im Rack-VLAN 100.

| Segment | Subnetz | VLAN | Verwendung | Gateway |
|---------|---------|------|------------|---------|
| **Management** | 10.0.0.0/22 | native | UniFi-Geräte, VMs, Proxmox, Services | 10.0.0.1 |
| **Device Network** | 10.0.10.0/24 | 10 | Endgeräte | 10.0.10.1 |
| **Guest Network** | 10.0.30.0/24 | 30 | Gäste-WLAN | 10.0.30.1 |
| **Rack Network** | 10.0.100.0/24 | 100 | Rack-Infrastruktur | 10.0.100.1 |
| **IoT Network** | 10.0.200.0/24 | 200 | Home Assistant, Zigbee, NAS | 10.0.200.1 |
| **Docker Proxy** | 192.168.90.0/24 | - | Traefik Proxy Network (intern) | - |
| **Thunderbolt** | 10.99.1.0/24 | - | Peer-to-Peer DRBD-Replikation, VM-Migration | - |
| **Tailscale** | 100.64.0.0/10 | - | Remote Access (CGNAT Overlay) | - |

## DNS

Zwei redundante DNS-Knoten (Pi-hole + Unbound + Consul DNS) bedienen das Netz; der Reverse Proxy ist über eine Keepalived-VIP hochverfügbar. IPs und Hosts: [Hosts und IPs](../../_referenz/hosts-und-ips.md). Vollständige DNS-Architektur: [DNS](../dns/)

## Thunderbolt-Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 direkt für High-Speed Datenverkehr. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide Interfaces.

| Funktion | Details |
|----------|---------|
| Bandbreite | bis ~15 Gbps (real, single-stream -- [Benchmarks](./referenz.md#benchmark-ergebnisse)) |
| Bonding Mode | active-backup |
| Bridge | vmbr-tb |
| Zweck | DRBD-Replikation, VM-Migration |

Details zur Konfiguration und IP-Zuordnung: [Proxmox](../../infrastruktur/proxmox/)

## Tailscale

Das Tailscale-Overlay (CGNAT-Bereich `100.64.0.0/10`) verbindet die drei Standorte und dient dem Remote-Zugang. Tag-Schema, ACL-basierte Cluster-Trennung (HSLU/Homelab) und die Remote-Zugriffs-Mechanik führt [Tailscale](./tailscale.md).


## Externe Erreichbarkeit

**Leitfrage:** Wie kommt ein Request aus dem Internet auf einen internen Dienst -- und warum landet ein interner Client dafür nie am WAN-Port?

Alle externen Services laufen über `*.ackermannprivat.ch`. Blau der externe Request-Pfad (Schritte 1-5), Grün der interne Weg (a/b), Ocker die asynchrone DNS- und Zertifikats-Pflege.

```d2
classes: {
  node: {
    style: { border-radius: 8 }
  }
  data: {
    style: { border-radius: 8 }
  }
  extpfad: {
    style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" }
  }
  intpfad: {
    style: { stroke: "#42714a"; font-color: "#42714a" }
  }
  pflege: {
    style: { stroke: "#8f6418"; font-color: "#8f6418" }
  }
}

extclient: Client (Internet) { class: node }

pubdns: Cloudflare DNS { class: data; tooltip: "Zone ackermannprivat.ch, Wildcard-A-Record auf die statische WAN-IP" }

isp: ISP-Router { class: node; tooltip: "terminiert PPPoE, hält die statische öffentliche IP" }

udm: UDM Pro { class: node; tooltip: "Port-Forwards 80/443 auf die Traefik-VIP" }

traefik: "Traefik (VIP 10.0.2.20)" {
  class: node
  tooltip: "keepalived: MASTER vm-traefik-01 (.21), BACKUP vm-traefik-02 (.22), nopreempt"
}

backend: Ziel-Dienst { class: node; tooltip: "Docker- und Nomad-Services im Management-Netz" }

intclient: Client im LAN { class: node }

pihole: "Pi-hole (lxc-dns-01/02)" { class: data; tooltip: "10.0.2.1 / 10.0.2.2, lokale DNS-Rewrites auf die VIP" }

ddns: cf-ddns-Container { class: node; tooltip: "läuft auf den Traefik-VMs, hält den Wildcard-A-Record aktuell" }

extclient -> pubdns: "1. DNS-Abfrage, Antwort: WAN-IP" { class: extpfad }
extclient -> isp: "2. HTTPS an die WAN-IP" { class: extpfad }
isp -> udm: "3. Forward 80/443 (Double NAT)" { class: extpfad }
udm -> traefik: "4. Port-Forward auf die VIP" { class: extpfad }
traefik -> backend: "5. TLS terminiert, Middleware-Chain, Request + Response" { class: extpfad }

intclient -> pihole: "a. DNS-Abfrage, Antwort: 10.0.2.20" { class: intpfad }
intclient -> traefik: "b. HTTPS direkt an die VIP" { class: intpfad }

ddns -> pubdns: "pflegt den Wildcard-A-Record" { class: pflege; style.stroke-dash: 3 }
traefik -> pubdns: "ACME DNS-Challenge für das Wildcard-Zertifikat" { class: pflege; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Öffentlich zeigt `*.ackermannprivat.ch` als Wildcard-A-Record auf die statische WAN-IP; ein cf-ddns-Container auf den Traefik-VMs hält den Record als Absicherung aktuell ([Traefik -- Cloudflare-DDNS](../../edge/traefik/index.md#cloudflare-ddns)).
2. Der Request passiert zwei NAT-Stufen: Der ISP-Router leitet 80/443 auf den UDM Pro weiter, erst dieser auf die Traefik-VIP. Port-Änderungen müssen auf beiden Stufen nachgezogen werden ([UniFi Referenz -- Port-Forwards](../unifi/referenz.md#port-forwards)).
3. Die VIP trägt keepalived: Fällt der aktive Node oder sein Traefik, übernimmt der andere. Wegen `nopreempt` bleibt die VIP nach der Rückkehr des Masters auf dem Backup ([Traefik -- Hochverfügbarkeit](../../edge/traefik/index.md#hochverfugbarkeit-keepalived)).
4. Traefik terminiert TLS mit dem per Cloudflare-DNS-Challenge bezogenen Wildcard-Zertifikat -- die Ausstellung braucht keinen eingehenden Verkehr ([Traefik -- SSL-Terminierung](../../edge/traefik/index.md#ssl-terminierung)). Danach entscheiden die Middleware-Chains (CrowdSec, Authentik) über den Zugriff ([Traefik -- Middleware-Chains](../../edge/traefik/referenz.md#middleware-chains)).
5. Interne Clients lösen dieselben Namen über Pi-hole lokal auf `10.0.2.20` auf und erreichen Traefik direkt -- kein Hairpin über den WAN-Port. Ein Ausfall von ISP-Uplink oder Port-Forwards trifft die interne Nutzung darum nicht ([DNS](../dns/)).

## Hardware-Inventar

Das physische Inventar (Aggregation-Switch USL8A, PoE- und Flex-Mini-Switches, AC-LR- und U6-Pro-Access-Points) ist in der physischen Topologie oben verortet. Modelle, Portzahlen, PoE-Budgets und Standorte sind kanonisch im [Hardware-Inventar](../../_referenz/hardware-inventar.md#unifi-netzwerk-hardware) geführt; IP-Adressen aller Geräte in [Hosts und IPs](../../_referenz/hosts-und-ips.md#unifi-netzwerk).

### Router und WAN

| Attribut | Wert |
|----------|------|
| Modell | UniFi Dream Machine Pro (UDMPRO) |
| WAN | SFP+ (eth9) via ISP-Router, öffentliche IP statisch |
| RJ45-WAN (eth8) | Nicht angeschlossen |
| LAN-Ports | 8x RJ45 1G, 1x RJ45 WAN (nicht verbunden), 1x SFP+ WAN (aktiv), 1x SFP+ LAN |
| Controller | Integriert (UniFi Network), Spezifika: [UniFi](../unifi/) |

Der UDM Pro ist nicht direkt am Glasfaser-Endpunkt angeschlossen, sondern per SFP+ an einen vorgelagerten ISP-Router, der die PPPoE-Session terminiert. Die öffentliche IP ist statisch. Port-Forwards (Traefik, NAS, Jellyfin) sind in der [UniFi Referenz -- Port-Forwards](../unifi/referenz.md#port-forwards) dokumentiert. WAN-Bandbreite und ISP-Provider sind nicht im Wiki geführt -- aktuelle Messwerte liefert das [Grafana-Dashboard](../../monitoring/index.md) via `iperf3-to-influxdb` (Nomad Batch Job in `monitoring/iperf3-to-influxdb.nomad`).

### Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
|---------|----------|-------|-----------|
| pve01 -- pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -- Switch | unbekannt | unbekannt | - |

## Verwandte Seiten

- [Standorte](./standorte.md) -- standortübergreifende Netz-Architektur (Lenzburg, Dottikon, Luzern)
- [UniFi](../unifi/) -- Controller, WLAN, Firewall-Konfiguration
- [Proxmox](../../infrastruktur/proxmox/) -- Cluster-Knoten und VM-Übersicht
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../../edge/traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
