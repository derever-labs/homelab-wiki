---
title: Netz
description: Big Picture des Homelab-Netzes -- der Paket-Pfad am Hauptstandort, die Standort-Kopplung über das Tailscale-Overlay und die DNS-Kette aus Pi-hole, Unbound und Consul-Forwarding
tags:
  - overview
  - network
---

# Netz

Das Netz des Homelabs spannt drei Standorte auf: **Lenzburg** als Hauptstandort mit fünf VLAN-Segmenten hinter einem UDM Pro, die Aussenstellen **Dottikon** und **Luzern** mit je eigenem Gateway und Uplink -- verbunden ausschliesslich über das Tailscale-Overlay. Dazu kommt die DNS-Kette aus zwei redundanten Pi-hole-LXCs, Unbound und dem Consul-Forwarding, die jedem Client sagt, wohin ein Name führt. Diese Seite ist das Big Picture: drei Szenario-Diagramme zeigen, wie ein Paket seinen Weg nimmt, wie die Standorte zusammenkommen und wie ein Name aufgelöst wird; der Abschnitt [Ausfallverhalten](#ausfallverhalten) beantwortet die Was-wenn-Fragen.

Die Mechanik der einzelnen Systeme steht auf den Systemseiten: [Netzwerk](./netzwerk/) (Topologie, Segmente, Standorte, Hardware), [DNS-Architektur](./dns/) (Kette, Komponenten, Sync) und [UniFi](./unifi/) (Controller, WAN, WLAN, Firewall).

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Standorte | Lenzburg `10.0.0.0/22` (Hauptstandort), Dottikon `192.168.2.0/23`, Luzern `172.16.0.0/24` -- [Standorte](./netzwerk/standorte.md) |
| Kopplung | Tailscale-Overlay `tag:homelab` (CGNAT `100.64.0.0/10`), Policy als GitOps -- [Tailscale](./netzwerk/tailscale.md) |
| DNS | Zwei Pi-hole-v6-LXCs mit Unbound, Consul-Forwarding -- [DNS-Architektur](./dns/) |
| Hosts/IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

### Systeme

| System | Zweck | Vertiefung |
| :--- | :--- | :--- |
| **[Netzwerk](./netzwerk/)** | Topologie und Segmente des Hauptstandorts, Standort-Übersicht, Thunderbolt, Hardware | [Standorte](./netzwerk/standorte.md), [Tailscale](./netzwerk/tailscale.md), [Performance](./netzwerk/referenz.md) |
| **[DNS-Architektur](./dns/)** | DNS-Kette Pi-hole -> Unbound bzw. Consul, Sync und Failover | -- |
| **[UniFi](./unifi/)** | UDM Pro als Gateway und Controller -- WAN, WLAN, Firewall | [Referenz](./unifi/referenz.md), [Betrieb](./unifi/betrieb.md) |

## Das Gesamtbild in drei Pfaden

Das Netz beantwortet drei Fragen, und jede hat ihr eigenes Diagramm: Der **Paket-Pfad** zeigt, wie ein Paket am Hauptstandort sein Segment verlässt -- zu einem internen Dienst, ins Internet oder von aussen herein. Die **Standort-Kopplung** zeigt, wie ein Gerät ein anderes Standort-LAN erreicht und mit welcher Quell-IP es dort ankommt. Die **Namensauflösung** zeigt, welche Antworten lokal entstehen und wofür das Internet gefragt wird.

Lese-Konvention für alle drei Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt und Inhalt. **Durchgezogene** Kanten sind synchrone Flüsse (der Initiator wartet auf die Antwort), **gestrichelte** Kanten sind asynchrone Kontrollflüsse -- oder markieren, dass keine Verbindung fliesst, sondern nur eine Antwort auf das Ziel zeigt. Farben kodieren den Weg: Grün bleibt im Standort-LAN, Blau geht übers WAN ins Internet, Violett läuft durchs Tailscale-Overlay, Ocker ist der Consul-Zweig, Grau sind Neben- und Kontrollwege.

### Paket-Pfad -- vom Segment ins Internet und zurück

**Leitfrage:** Wie nimmt ein Paket am Hauptstandort seinen Weg -- zwischen den Segmenten, ins Internet und von aussen herein?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  seg: { style: { border-radius: 8; stroke-dash: 4 } }
  lanweg: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  wanweg: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
}

segmente: Client-Segmente {
  class: seg
  tooltip: Device VLAN 10, Guest VLAN 30, Rack VLAN 100, IoT VLAN 200 -- Subnetze in der Segment-Tabelle
  client: Client { class: node }
}
udm: UDM Pro {
  class: node
  tooltip: Router + Controller (10.0.0.1) -- Gateway aller Segmente, Zone-Based Firewall
}
mgmt: Management-Netz (native) {
  class: seg
  tooltip: 10.0.0.0/22 -- Proxmox, VMs, DNS-LXCs, NAS und Services
  vip: Traefik-VIP {
    class: node
    tooltip: Keepalived-VIP des Traefik-HA-Paars
  }
  nas: Synology NAS { class: node }
}
isp: ISP-Router {
  class: node
  tooltip: terminiert die PPPoE-Session -- die öffentliche IP ist statisch, dahinter Double NAT
}
internet: Internet {
  class: node
  tooltip: Externe Clients und Ziele im Internet
  top: 40
  left: 80
}

segmente.client -> udm: "1. Paket ans\nSegment-Gateway" { class: lanweg }
udm -> mgmt.vip: 2. routet zwischen den Segmenten { class: lanweg }
udm -> isp: "3. Default-Route\nins WAN" { class: wanweg }
isp -> internet: "4. PPPoE -- statische\nöffentliche IP" { class: wanweg }
internet -> isp: "A. Aufruf der\nöffentlichen IP" { class: wanweg }
isp -> udm: "B. Double NAT\nzum UDM Pro" { class: wanweg }
udm -> mgmt.vip: C. Port-Forward 80/443 auf die VIP { class: wanweg }
udm -> mgmt.nas: D. Synology-Forwards direkt aufs NAS { class: wanweg }
```

Lesehilfe:

1. Jedes Paket, das sein Segment verlässt, geht an das Segment-Gateway `10.0.x.1` auf dem UDM Pro -- er ist das Gateway aller fünf Segmente ([Netzwerk-Segmente](./netzwerk/index.md#netzwerk-segmente)).
2. Der UDM Pro routet zwischen den Segmenten; die Firewall arbeitet mit Zone-Based-Policies ([Firewall](./unifi/referenz.md#firewall)). Der häufigste interne Weg endet auf der Traefik-VIP im Management-Netz, denn die Homelab-Domains lösen direkt dorthin auf ([Namensauflösung](#namensauflosung-vom-namen-zur-adresse)).
3. Richtung Internet führt die Default-Route über den SFP+-Port (eth9) zum vorgelagerten ISP-Router ([WAN-Anbindung](./unifi/index.md#wan-anbindung)).
4. Der ISP-Router terminiert die PPPoE-Session, die öffentliche IP ist statisch ([Router und WAN](./netzwerk/index.md#router-und-wan)).
5. Eingehend (A/B) passiert der Aufruf der öffentlichen IP das Double NAT des ISP-Routers ([Bekannte Einschränkungen](./unifi/betrieb.md#bekannte-einschrankungen)).
6. Dann entscheiden die Port-Forwards (C/D): 80/443 gehen auf die Traefik-VIP -- ab hier übernimmt der [Edge](../edge/) mit TLS, CrowdSec und Authentik. Dazu kommen Direkt-Forwards für Synology-Dienste und Port 8096 auf Jellyfin ([Port-Forwards](./unifi/referenz.md#port-forwards)).

### Standort-Kopplung -- drei LANs, ein Overlay

**Leitfrage:** Wie erreicht ein Gerät ein anderes Standort-LAN -- und mit welcher Quell-IP kommt es dort an?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  site: { style: { border-radius: 8; stroke-dash: 4 } }
  tsweg: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  lanweg: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
}

admin: "Admin-Gerät (tag:admin)" {
  class: node
  tooltip: copper, copper-1, boson, apple-tv -- der Grant tag:admin -> * erlaubt alles
}
hlhost: "Homelab-Host (tag:homelab)" {
  class: node
  tooltip: z.B. checkmk-homelab oder die HA-Luzern-VM -- sehen nur tag:homelab und die drei Standort-Netze
}
tailnet: Tailscale-Overlay {
  class: node
  tooltip: Tailnet derever@github, CGNAT-Bereich 100.64.0.0/10 -- tag:hslu ist per ACL vollständig getrennt
}

lenzburg: Lenzburg {
  class: site
  router: vm-traefik-01/02 {
    class: node
    tooltip: Subnet-Router für 10.0.0.0/22 und Exit-Nodes -- pve00 advertisiert zusätzlich die VLAN-Subnetze
  }
  ziel: Ziel in 10.0.0.0/22 { class: node }
}
dottikon: Dottikon {
  class: site
  router: pve-01-nana {
    class: node
    tooltip: einziger Subnet-Router des Standorts
  }
  ziel: Ziel in 192.168.2.0/23 { class: node }
}
luzern: Luzern {
  class: site
  router: pve-lu-01 {
    class: node
    tooltip: Route 172.16.0.0/24 -- redundant auch vom apple-tv advertisiert
  }
  ziel: Ziel in 172.16.0.0/24 { class: node }
}

admin -> tailnet: 1. WireGuard -- sieht alle Routen { class: tsweg }
hlhost -> tailnet: 2. WireGuard -- sieht die drei Standort-Netze { class: tsweg }
tailnet -> lenzburg.router: "3. Route\n10.0.0.0/22" { class: tsweg }
lenzburg.router -> lenzburg.ziel: "4. stellt ohne SNAT zu --\nQuelle bleibt die Tailscale-IP" { class: lanweg }
tailnet -> dottikon.router: 5. Route 192.168.2.0/23 { class: tsweg }
dottikon.router -> dottikon.ziel: 6. maskiert mit seiner lokalen IP { class: lanweg }
tailnet -> luzern.router: 7. Route 172.16.0.0/24 { class: tsweg }
luzern.router -> luzern.ziel: 8. maskiert mit seiner lokalen IP { class: lanweg }
```

Lesehilfe:

1. Admin-Geräte (`tag:admin`) sehen alle Routen -- der Grant `tag:admin -> *` deckt auch die Lenzburg-VLAN-Subnetze ([ACL-Pattern](./netzwerk/tailscale.md#acl-pattern)).
2. Homelab-Hosts (`tag:homelab`) sehen einander und die drei Standort-Netze -- so erreicht CheckMK das NAS in Dottikon und die HA-Luzern-VM ihr Git-Remote in Lenzburg ([Tag-Schema](./netzwerk/tailscale.md#tag-schema)); `tag:hslu` bleibt per ACL vollständig getrennt ([Cluster-Trennung](./netzwerk/tailscale.md#cluster-trennung)).
3. Nach Lenzburg advertisieren vm-traefik-01 und -02 dieselbe Route redundant, pve00 bringt zusätzlich die VLAN-Subnetze ins Tailnet ([Subnet-Router-Topologie](./netzwerk/tailscale.md#subnet-router-topologie)).
4. Die Lenzburg-Router stellen ohne SNAT zu: Das Ziel sieht die echte Tailscale-IP des Absenders, die Rückroute übernehmen statische Routen auf dem UDM Pro ([Quell-IPs hinter Subnet-Routern](./netzwerk/tailscale.md#subnet-router-topologie)).
5. Dottikon hängt an genau einem Subnet-Router (pve-01-nana), der eingehende Pakete mit seiner lokalen IP maskiert (5./6.).
6. Luzern ebenso über pve-lu-01 -- dieselbe Route advertisiert redundant auch der apple-tv (7./8., [Externe Proxmox-Nodes](./netzwerk/tailscale.md#externe-proxmox-nodes)).

Die LANs erreichen einander ausschliesslich über diese Subnet-Router -- es gibt kein klassisches Site-to-Site-VPN ([Standorte](./netzwerk/standorte.md)).

### Namensauflösung -- vom Namen zur Adresse

**Leitfrage:** Wie wird ein Name aufgelöst -- und welche Antworten entstehen lokal, ohne dass das Internet gefragt wird?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  cont: { style: { border-radius: 8; stroke-dash: 4 } }
  lanweg: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  wanweg: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  consulweg: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
  neutral: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

client: Lenzburg-Client {
  class: node
  tooltip: erhält beide DNS-IPs via DHCP -- auch die Docker-Daemons der Nomad-Clients zeigen auf beide LXCs
}
pihole: Pi-hole v6 {
  class: cont
  tooltip: zwei identisch konfigurierte LXCs auf getrennten Proxmox-Hosts
  ph1: lxc-dns-01 { class: node }
  ph2: lxc-dns-02 { class: node }
  ph1 -> ph2: Nebula-Sync täglich 04.00 Uhr { class: neutral; style.stroke-dash: 3 }
}
vip: Traefik-VIP {
  class: node
  tooltip: Ziel der Wildcard-Records *.ackermannprivat.ch und *.ackermann.systems
}
consul: Consul DNS {
  class: node
  tooltip: vm-nomad-server-04/05/06, Port 8600 -- Service-Discovery für Nomad-Container
}
udm: UDM Pro {
  class: node
  tooltip: löst *.local auf -- UniFi-Geräte und DHCP-Hostnamen
}
unbound: Unbound {
  class: node
  tooltip: läuft je LXC auf localhost 5335 -- rekursiver Resolver mit DNSSEC-Validierung
}
root: Root-Server { class: node }
aussen: Client Dottikon/Luzern {
  class: node
  tooltip: die Aussenstellen betreiben keinen eigenen Pi-hole
}
gw: Standort-Gateway { class: node }

client -> pihole: 1. DNS-Query (Port 53) { class: lanweg }
pihole -> vip: "2. Homelab-Domains -- Antwort\naus lokalen Records" { class: lanweg; style.stroke-dash: 3 }
pihole -> consul: "3. *.consul -- Conditional\nForwarding (Port 8600)" { class: consulweg }
pihole -> udm: "4. *.local -- Conditional\nForwarding" { class: neutral }
pihole -> unbound: "5. alle übrigen Domains\n(localhost 5335)" { class: neutral }
unbound -> root: 6. löst rekursiv auf -- DNSSEC-validiert { class: wanweg }
aussen -> gw: A. Aussenstellen fragen ihr Gateway { class: lanweg }
```

Lesehilfe:

1. Lenzburg-Clients erhalten beide Pi-hole-LXCs als Resolver via DHCP; die Docker-Daemons der Nomad-Clients sind ebenfalls auf beide konfiguriert ([Docker Daemon DNS](./dns/index.md#docker-daemon-dns)).
2. Für die Homelab-Domains antwortet Pi-hole direkt aus den lokalen Wildcard-Records mit der Traefik-VIP -- kein Forwarding, kein Internet-Roundtrip; die externen Standalone-Nodes lösen bewusst auf ihre Tailscale-IP auf ([DNS-Kette](./dns/index.md#dns-kette), [Pi-hole v6](./dns/index.md#pi-hole-v6)).
3. `*.consul` geht per Conditional Forwarding an die drei Consul-Server -- die Service-Discovery aller Nomad-Container ([Consul DNS](./dns/index.md#consul-dns)).
4. `*.local` geht an den UDM Pro, der UniFi-Geräte und DHCP-Hostnamen kennt.
5. Alles Übrige beantwortet Unbound auf demselben LXC -- vollrekursiv mit DNSSEC, bewusst ohne Cloud-Resolver ([Unbound](./dns/index.md#unbound)).
6. Die Rekursion läuft direkt gegen die Root-Server -- kein externer Anbieter sieht alle Queries des Homelabs.
7. Der Nebula-Sync repliziert die Pi-hole-Konfiguration täglich vom Primary auf den Secondary; die dnsmasq-Dateien deployt Ansible identisch ([Synchronisation](./dns/index.md#synchronisation-nebula-sync)).
8. Die Aussenstellen betreiben keinen eigenen Pi-hole -- lokale Clients fragen den DNS ihres UniFi-Gateways (A, [Standorte und Failover](./dns/index.md#standorte-und-failover)).

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss -- je mit dem Verhalten der verbleibenden Glieder:

- **Was, wenn ein Pi-hole-LXC ausfällt?** Der andere übernimmt automatisch: Alle Clients haben beide IPs als Resolver, die LXCs laufen auf getrennten Proxmox-Hosts und sind identisch konfiguriert (Ansible plus Nebula-Sync). Deshalb gilt bei Wartung: nie beide gleichzeitig neu starten ([Standorte und Failover](./dns/index.md#standorte-und-failover)).

- **Was, wenn beide DNS-LXCs weg sind?** DNS ist die Basis-Dependency für alle Netzwerk-Clients und Nomad-Services ([Rolle im Stack](./dns/index.md#rolle-im-stack)) -- die Namensauflösung steht dann komplett, inklusive `*.service.consul` für die Container, denn auch die Docker-Daemons zeigen auf die beiden LXCs. Genau darum existiert die Wartungsregel aus der vorigen Frage.

- **Was, wenn der UDM Pro ausfällt?** Er ist die Basis-Infrastruktur ohne Redundanz ([UniFi Betrieb](./unifi/betrieb.md)): Routing zwischen den Segmenten, WAN-Uplink, Port-Forwards und die `*.local`-Auflösung stehen. Unabhängig davon läuft die DRBD-Replikation weiter -- das Thunderbolt-Netz verbindet pve01 und pve02 direkt, am Switch vorbei ([Thunderbolt-Netzwerk](./netzwerk/index.md#thunderbolt-netzwerk)). Für die Wiederherstellung gilt: erst gleiche Firmware, dann Backup-Import ([Backup und Restore](./unifi/betrieb.md#backup-und-restore)).

- **Was, wenn ein Tailscale-Subnet-Router ausfällt?** Lenzburg und Luzern sind redundant advertisiert -- vm-traefik-01/02 tragen dieselbe Route, die Luzern-Route liegt zusätzlich auf dem apple-tv. Dottikon hängt an genau einem Router: Fällt pve-01-nana aus, ist das Dottikon-LAN aus dem Tailnet nicht mehr erreichbar ([Subnet-Router-Topologie](./netzwerk/tailscale.md#subnet-router-topologie)).

- **Was, wenn der WAN-Uplink eines Standorts ausfällt?** Jeder Standort hat seinen eigenen Uplink, und die Kopplung läuft übers Internet -- der Standort ist dann vom Overlay isoliert, arbeitet lokal aber weiter. In Lenzburg bleiben die Homelab-Domains auflösbar, denn Pi-hole beantwortet sie aus lokalen Records ohne Internet-Roundtrip ([DNS-Kette](./dns/index.md#dns-kette)); nur die Rekursion für externe Domains und der externe Zugriff fallen aus.

## Verwandte Seiten

- [Netzwerk](./netzwerk/) -- Topologie, Segmente, Thunderbolt und Hardware des Hauptstandorts
- [Standorte](./netzwerk/standorte.md) -- die drei Standorte im Detail
- [Tailscale](./netzwerk/tailscale.md) -- Tailnet, Tag-Schema, ACL-Trennung und Subnet-Router
- [Netzwerk Performance](./netzwerk/referenz.md) -- Benchmarks und Tuning (10GbE, Thunderbolt)
- [DNS-Architektur](./dns/) -- Pi-hole, Unbound und Consul-Forwarding im Detail
- [UniFi](./unifi/) -- Controller-Spezifika des UDM Pro
- [UniFi Referenz](./unifi/referenz.md) -- WLAN, DHCP, Port-Forwards und Firewall
- [UniFi Betrieb](./unifi/betrieb.md) -- Zugang, Backup und Firmware-Updates
- [Ingress, Auth und Edge](../edge/) -- was hinter dem 80/443-Forward passiert
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- kanonische IP-Zuordnung
- [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware) -- Switches und Access Points
- [Proxmox](../infrastruktur/proxmox/) -- dieselben Standorte aus Verwaltungs- und Backup-Sicht
