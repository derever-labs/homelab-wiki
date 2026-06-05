---
title: Tailscale
description: Tailnet-Topologie, Tag-Schema und ACL-basierte Cluster-Trennung HSLU/Homelab
tags:
  - tailscale
  - netzwerk
  - acl
  - segmentation
---

# Tailscale

Das Tailnet `derever@github` (GitHub-OAuth) ist der Overlay-VPN über HSLU/DCLab und Privat/Homelab. Seit dem 1. Mai 2026 ist der Overlay durch eine ACL-Policy in zwei Cluster getrennt: `tag:hslu` und `tag:homelab` sehen einander nicht. `tag:admin` (Mac, iPhone, Apple-TV) hat weiterhin Vollzugriff.

Source of truth: [`derever-labs/infra/tailscale-policy/policy.hujson`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/policy.hujson).

## Cluster-Trennung

::: info Tailnet-IPs (100.x.x.x)
Diese Seite ist die kanonische Quelle für Tailscale-IPs. Die Tooltips im Diagramm enthalten die aktuellen 100.x.x.x-Adressen je Host.
:::

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

classes: {
  cluster: {
    style.stroke-dash: 4
  }
  host: {
    style.border-radius: 8
  }
  blocked: {
    style.stroke: "#cc3333"
    style.stroke-dash: 2
  }
}

ADMIN: "tag:admin" {
  class: cluster
  COPPER: copper { class: host; tooltip: "macOS, 100.92.200.106" }
  COPPER1: copper-1 { class: host; tooltip: "macOS, 100.77.173.91" }
  BOSON: boson { class: host; tooltip: "iOS, 100.103.149.48" }
  ATV: apple-tv { class: host; tooltip: "tvOS, 100.106.104.34" }
}

HSLU: "tag:hslu" {
  class: cluster
  OPN1: opn-01 { class: host; tooltip: "FreeBSD, 100.113.244.85, Subnet-Router" }
  OPN2: opn-02 { class: host; tooltip: "FreeBSD, 100.110.151.3, Subnet-Router" }
  MESSE: messe-pc-hslu { class: host; tooltip: "Windows, 100.116.116.63" }
  HSLUNETS: "10.180.0.0/16, 147.88.0.0/16, 147.88.202.0/24, 192.168.50.0/24" {
    class: host
  }
}

HOMELAB: "tag:homelab" {
  class: cluster
  TRF1: vm-traefik-01 { class: host; tooltip: "Linux, 100.101.37.122, Subnet-Router + Exit-Node" }
  TRF2: vm-traefik-02 { class: host; tooltip: "Linux, 100.91.238.106, Subnet-Router + Exit-Node" }
  PVE: pve-01-nana { class: host; tooltip: "Linux, 100.81.116.122, Subnet-Router 192.168.2.0/23" }
  PVELU: pve-lu-01 { class: host; tooltip: "Linux, 100.112.213.18, Subnet-Router 172.16.0.0/24" }
  PVE00: pve00 { class: host; tooltip: "Linux, 100.89.174.31, Subnet-Router Lenzburg-VLANs" }
  MORE: "weitere Hosts" { class: host; tooltip: "pdm, checkmk-homelab, pve01, pve02 -- Tailnet-Mitglieder ohne Subnet-Routes" }
  HOMELABNETS: "10.0.0.0/22, 192.168.2.0/23, 172.16.0.0/24" {
    class: host
  }
}

ADMIN -> HSLU: erlaubt
ADMIN -> HOMELAB: erlaubt
HSLU -> HOMELAB: blockiert { class: blocked }
HOMELAB -> HSLU: blockiert { class: blocked }
```

## Tag-Schema

`tag:hslu` (3 Hosts):

- `opn-01` -- HSLU OPNsense Primary, Subnet-Router für 10.180.0.0/16, 147.88.0.0/16, 147.88.202.0/24
- `opn-02` -- HSLU OPNsense Secondary, gleiche Subnet-Routes wie opn-01
- `messe-pc-hslu` (DESKTOP-0PK5JUR) -- Subnet-Router für 192.168.50.0/24

`tag:homelab` (9 Hosts). Subnet-Router (advertisieren ein lokales Netz ins Tailnet):

- `vm-traefik-01` -- Subnet-Router für 10.0.0.0/22, ausserdem Exit-Node für `tag:admin`
- `vm-traefik-02` -- gleiche Routes wie vm-traefik-01
- `pve-01-nana` -- externer Watchdog ausserhalb des Heimnetzes, Subnet-Router für 192.168.2.0/23
- `pve-lu-01` -- Standalone-Proxmox am Standort Luzern, Subnet-Router für 172.16.0.0/24
- `pve00` -- bringt die Lenzburg-VLAN-Subnetze (`10.0.10.0/23`, `10.0.100.0/23`, `10.0.200.0/23`) sowie `10.0.0.0/21` ins Tailnet. Diese Routes sind manuell approved (nicht über `autoApprovers`) und werden über den `tag:admin`-Vollzugriff genutzt -- der `tag:homelab`-Grant selbst deckt nur `10.0.0.0/22`.

Weitere Mitglieder (im Tailnet, ohne eigene Subnet-Routes):

- `pdm` -- Proxmox Datacenter Manager
- `checkmk-homelab` -- Monitoring-Server
- `pve01`, `pve02` -- Cluster-Nodes

`tag:admin` (4 Hosts):

- `copper` -- Hauptlaptop (macOS)
- `copper-1` -- Zweitlaptop (macOS)
- `boson` -- iPhone (iOS)
- `apple-tv` -- Wohnzimmer Apple-TV, Subnet-Router für 172.16.0.0/24

## ACL-Pattern

Die Policy benutzt das moderne `grants`-Schema (nicht das deprecated `acls`). Drei Regeln decken den Vollzustand ab:

- `tag:admin -> *` -- Admin-Geräte sehen alles, inkl. aller Subnet-Routes
- `tag:hslu -> tag:hslu, 10.180.0.0/16, 147.88.0.0/16, 147.88.202.0/24, 192.168.50.0/24` -- HSLU-Hosts sehen nur sich selbst und HSLU-Subnets
- `tag:homelab -> tag:homelab, 10.0.0.0/22, 192.168.2.0/23, 172.16.0.0/24` -- Homelab-Hosts sehen nur sich selbst und Homelab-Subnets (inkl. Luzern 172.16.0.0/24, damit PDM `pve-lu-01` über die lokale IP erreichen kann)

`autoApprovers.routes` hält zentral fest, welcher Tag welche Subnets ohne manuelles Approval advertisieren darf. So bleiben Subnet-Routes bei einem Re-Auth oder Tag-Wechsel automatisch enabled.

## Externe Proxmox-Nodes

Die beiden Standalone-Proxmox-Nodes ([Proxmox -- Externe Nodes](../proxmox/index.md#externe-standalone-nodes)) sind Subnet-Router für ihr jeweiliges Standort-Netz: `pve-01-nana` für `192.168.2.0/23`, `pve-lu-01` für `172.16.0.0/24`. Die Route nach Luzern wird redundant auch vom `apple-tv` advertisiert.

::: warning Self-Subnet-Lockout
Eine Node mit `accept-routes`, deren eigenes LAN von einem **anderen** Knoten advertisiert wird, muss **selbst** approved Subnet-Router für dieses LAN sein -- sonst routet sie ihr eigenes Subnet über Tailscale und sperrt sich lokal aus.

Konkret bei `pve-lu-01`: Die Route `172.16.0.0/24` wird vom `apple-tv` advertisiert. Sobald die ACL `tag:homelab -> 172.16.0.0/24` erlaubte, übernahm `pve-lu-01` (selbst `tag:homelab`, mit `accept-routes`) diese Tailscale-Route für **sein eigenes** LAN -- lokaler SSH/Ping war tot (nur die Tailscale-IP blieb erreichbar). Lösung: `pve-lu-01` zuerst selbst als approved Subnet-Router für `172.16.0.0/24` setzen, **dann** die ACL erweitern. Die Reihenfolge ist kritisch.

`pve-01-nana` ist davon nicht betroffen, weil es sein Netz `192.168.2.0/23` von Anfang an selbst advertisiert.
:::

## Test-Validierung

`policy.hujson.tests` deckt die Hauptpfade ab und wird beim Apply von der Tailscale-API gegengeprüft. Schlägt ein Test fehl, lehnt der API-POST ab.

::: warning tailscale ping ignoriert ACLs
`tailscale ping` testet das WireGuard-Steuerprotokoll, nicht die ACL-Filter. Verifikation der Cluster-Trennung muss über TCP-Tests laufen (`nc -zv <peer> 22`). Cross-Cluster TCP muss timeouten, intra-Cluster muss durchgehen.
:::

## Apply-Workflow

Heute manuell -- es gibt keinen GitOps-Sync, deshalb ist `policy.hujson` die Wahrheit im Git, die Tailscale Admin Console die ausgeführte Wahrheit.

Bei kleineren Änderungen ohne neue Tags reicht ein direkter API-Apply der Policy. Bei Schema-Änderungen mit neuen Tags muss zuerst eine Stage-1-Policy mit den `tagOwners`-Einträgen apply'd werden, bevor Devices den Tag akzeptieren -- Details und Sequenz: [`tailscale-policy/README`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/README.md).

Der API-Key liegt im 1Password-Item `Tailscale` im `PRIVAT Agent`-Vault.

## Verwandte Seiten

- [Netzwerk-Übersicht](./) -- Topologie, VLANs, Hardware
- [Standorte](./standorte.md) -- standortübergreifende Netz-Architektur über das Tailscale-Overlay
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- vollständige IP-Zuordnung
- [Traefik](../traefik/) -- Reverse Proxy mit Tailscale-CGNAT-Whitelist
