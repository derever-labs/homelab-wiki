---
title: Tailscale
description: Tailnet-Topologie, Tag-Schema, ACL-basierte Cluster-Trennung HSLU/Homelab und Remote-Zugriffs-Mechanik
tags:
  - tailscale
  - netzwerk
  - acl
  - segmentation
---

# Tailscale

Das Tailnet `derever@github` (GitHub-OAuth) ist der Overlay-VPN über HSLU/DCLab und Privat/Homelab. Seit dem 1. Mai 2026 ist der Overlay durch eine ACL-Policy in zwei Cluster getrennt: `tag:hslu` und `tag:homelab` sehen einander nicht. `tag:admin` (Mac, iPhone, Apple-TV) hat weiterhin Vollzugriff.

Source of truth: [`derever-labs/infra/tailscale-policy/policy.hujson`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/policy.hujson).

Lesekonvention für die Diagramme dieser Seite: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten laufen synchron, gestrichelte asynchron oder als Kontrollverkehr. Farben kodieren die Wege: Grün erlaubte Beziehungen beziehungsweise der Rückweg, Blau der Hinweg, Ocker die Control-Plane, Rot blockierte Beziehungen.

## Cluster-Trennung

**Leitfrage:** Wer darf mit wem reden -- und wo wird die Trennung durchgesetzt?

::: info Tailnet-IPs (100.x.x.x)
Diese Seite ist die kanonische Quelle für Tailscale-IPs. Die Tooltips in den Diagrammen enthalten die aktuellen 100.x.x.x-Adressen je Host.
:::

```d2
classes: {
  cluster: {
    style: { stroke-dash: 4 }
  }
  host: {
    style: { border-radius: 8 }
  }
  nets: {
    style: { border-radius: 8; stroke-dash: 2 }
  }
  allowed: {
    style: { stroke: "#42714a"; font-color: "#42714a" }
  }
  blocked: {
    style: { stroke: "#cc3333"; font-color: "#cc3333"; stroke-dash: 2 }
  }
}

ADMIN: "tag:admin" {
  class: cluster
  COPPER: copper-1 { class: host; tooltip: "macOS, 100.77.173.91" }
  BOSON: boson { class: host; tooltip: "iOS, 100.103.149.48, trägt zusätzlich tag:homelab und tag:hslu" }
  ATV: apple-tv { class: host; tooltip: "tvOS, 100.106.104.34, Subnet-Router 172.16.0.0/24" }
}

HSLU: "tag:hslu" {
  class: cluster
  OPN1: opn-01 { class: host; tooltip: "FreeBSD, 100.113.244.85, Subnet-Router" }
  OPN2: opn-02 { class: host; tooltip: "FreeBSD, 100.110.151.3, Subnet-Router" }
  MESSE: messe-pc-hslu { class: host; tooltip: "Windows, 100.116.116.63" }
  HSLUNETS: "advertisierte Subnetze:\n10.180.0.0/16, 147.88.0.0/16,\n147.88.202.0/24, 192.168.50.0/24" {
    class: nets
  }
}

HOMELAB: "tag:homelab" {
  class: cluster
  TRF1: vm-traefik-01 { class: host; tooltip: "Linux, 100.101.37.122, Subnet-Router + Exit-Node" }
  TRF2: vm-traefik-02 { class: host; tooltip: "Linux, 100.91.238.106, Subnet-Router + Exit-Node" }
  PVE: pve-01-nana { class: host; tooltip: "Linux, 100.81.116.122, Subnet-Router 192.168.2.0/23" }
  PVELU: pve-lu-01 { class: host; tooltip: "Linux, 100.112.213.18, Subnet-Router 172.16.0.0/24" }
  PVE00: pve00 { class: host; tooltip: "Linux, 100.89.174.31, advertisiert VLAN-Routen (derzeit nicht freigegeben)" }
  MORE: "weitere Hosts" { class: host; tooltip: "pdm, checkmk-homelab, pve01, pve02, homeassistant (HA-Luzern), ha-dottikon, kuma-wd-home, kuma-wd-nana, nomad-edge-dottikon" }
  HOMELABNETS: "aktive Subnet-Routen:\n10.0.0.0/22, 10.0.10.0/24,\n192.168.2.0/23, 172.16.0.0/24" {
    class: nets
  }
}

ADMIN -> HSLU: erlaubt { class: allowed }
ADMIN -> HOMELAB: erlaubt { class: allowed }
HSLU <-> HOMELAB: blockiert { class: blocked }
```

**Lesehilfe:**

1. Die Policy kennt genau drei Grants ([ACL-Pattern](#acl-pattern)): `tag:admin` sieht alles, `tag:hslu` und `tag:homelab` sehen jeweils nur den eigenen Cluster samt der eigenen Subnetze.
2. Durchgesetzt wird die Trennung nicht an einem zentralen Punkt: Die Control-Plane verteilt die Filterregeln an alle Nodes, jeder Host filtert eingehende Verbindungen selbst nach dem Quell-Tag. Es gibt keinen Chokepoint, dessen Ausfall die Trennung aufheben würde.
3. Das Luzern-Netz `172.16.0.0/24` fehlt im homelab-Grant bewusst: Homelab-Hosts erreichen `pve-lu-01` über dessen Tailscale-IP, das LAN dahinter nutzt nur `tag:admin` ([Tag-Schema](#tag-schema)).
4. `boson` trägt alle drei Tags -- wirksam ist der weiteste Grant (`tag:admin -> *`), als Ziel ist das iPhone aus beiden Clustern erreichbar.
5. Verifikation der Trennung nur über TCP-Tests, `tailscale ping` ignoriert ACLs ([Test-Validierung](#test-validierung)).

## Remote-Zugriff über die Subnet-Router {#subnet-router-topologie}

Jeder Standort hat mindestens einen Subnet-Router, der das lokale Netz ins Tailnet advertisiert ([Tag-Schema](#tag-schema)). Das Szenario zeigt den Lenzburg-Fall -- den mechanisch anspruchsvollsten Pfad, weil dort SNAT deaktiviert ist und der Rückweg über eine statische Route läuft.

**Leitfrage:** Wie erreicht ein Admin-Gerät von unterwegs einen Host im Lenzburg-LAN -- und warum findet die Antwort zurück?

```d2
direction: right

classes: {
  node: {
    style: { border-radius: 8 }
  }
  container: {
    style: { border-radius: 8; stroke-dash: 4 }
  }
  hinweg: {
    style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" }
  }
  rueckweg: {
    style: { stroke: "#42714a"; font-color: "#42714a" }
  }
  control: {
    style: { stroke: "#8f6418"; font-color: "#8f6418" }
  }
}

copper: copper-1 (unterwegs) {
  class: node
  top: 40
  left: 60
  tooltip: "tag:admin, 100.77.173.91"
}

cp: Tailscale Control-Plane {
  class: node
  top: 40
  left: 700
  tooltip: "verteilt Netmap, Routen und ACL-Filter -- DERP-Relays als Tunnel-Fallback"
}

lenzburg: "Standort Lenzburg (10.0.0.0/22)" {
  class: container
  top: 340
  left: 240

  trf1: vm-traefik-01 {
    class: node
    tooltip: "Subnet-Router 10.0.2.21, SNAT deaktiviert (ADR-0003)"
  }
  trf2: vm-traefik-02 {
    class: node
    tooltip: "10.0.2.22, advertisiert dieselben Routen -- automatischer Primary-Failover"
  }
  ziel: Ziel-Host im LAN {
    class: node
    tooltip: "Host ohne eigenes tailscaled, z.B. vm-nomad-server-04 (10.0.2.104)"
  }
  udm: UDM Pro {
    class: node
    tooltip: "statische Rückrouten 100.64.0.0/10: primär via 10.0.2.21, sekundär via 10.0.2.22"
  }
}

copper -> cp: "1. Netmap: Route 10.0.0.0/22 via Primary-Router" { class: control; style.stroke-dash: 3 }
copper -> lenzburg.trf1: "2. WireGuard-Tunnel, ausgehend aufgebaut (direkt, sonst DERP)" { class: hinweg }
lenzburg.trf1 -> lenzburg.ziel: "3. forwardet ohne SNAT -- Quelle bleibt 100.77.173.91" { class: hinweg }
lenzburg.ziel -> lenzburg.udm: "4. Antwort an 100.x geht ans Default-Gateway" { class: rueckweg }
lenzburg.udm -> lenzburg.trf1: "5. statische Route 100.64.0.0/10 via .21" { class: rueckweg }
lenzburg.trf1 -> copper: "6. Antwort durch den Tunnel" { class: rueckweg }
```

**Lesehilfe:**

1. Beide Lenzburg-Router advertisieren `10.0.0.0/22` und `10.0.10.0/24`; die Control-Plane bestimmt den Primary und verteilt die Route an die Clients ([Tag-Schema](#tag-schema)).
2. Der Tunnel entsteht ausgehend vom Client (NAT-Traversal, DERP als Fallback) -- kein Standort braucht dafür eingehende Freigaben.
3. Weil SNAT auf beiden Routern deaktiviert ist, sieht das Ziel die echte Tailnet-Quell-IP. Nur so können Traefik-Allowlists und die Proxmox-VM-Firewall Tailscale-Verkehr von LAN-Verkehr unterscheiden (ADR-0003 im homelab-hashicorp-stack).
4. Die Antwort findet nicht von allein zurück: Sie geht ans Default-Gateway, und der UDM trägt statische Rückrouten für `100.64.0.0/10` (primär via `.21`, sekundär via `.22`).
5. Ziel-Hosts mit eigenem tailscaled verwerfen so geroutete Pakete (Anti-Spoofing) -- sie sind aus dem Tailnet nur über ihre Tailscale-IP erreichbar (Hinweis unten).
6. Dottikon und Luzern maskieren weiterhin (SNAT aktiv): Dort erscheinen Tailnet-Clients mit der lokalen Router-IP, eine Rückroute braucht es nicht (Hinweis unten).

::: warning Entkoppelte Failover-Domänen beim Router-Ausfall
Fällt `vm-traefik-01` aus, schwenkt Tailscale die Subnet-Route automatisch auf `vm-traefik-02` -- die UDM-Rückroute schwenkt nicht mit: Der UDM prüft die Next-Hop-Erreichbarkeit nicht, das Distance-Failover auf die Sekundärroute via `.22` greift bei totem `.21` nicht automatisch. Der Rückweg bleibt tot, bis die Primärroute am UDM manuell pausiert wird. Auch der keepalived-VIP-Schwenk (Traefik) und der Tailscale-Primary-Wechsel sind voneinander entkoppelte Failover-Domänen. Quelle: ADR-0003 im homelab-hashicorp-stack.
:::

::: warning Quell-IPs hinter Subnet-Routern
Die Homelab-Router `vm-traefik-01`/`-02` laufen mit deaktiviertem SNAT (`--snat-subnet-routes=false`, ADR-0003 im homelab-hashicorp-stack): Tailnet-Clients erscheinen im Homelab-LAN mit ihrer echten Tailscale-IP (`100.64.0.0/10`), die Rückroute übernimmt die UDM (statische Routen via .21/.22). Die Router der anderen Standorte (`pve-01-nana`, `pve-lu-01`) maskieren weiterhin mit ihrer lokalen IP.
:::

::: danger Tailnet-Nodes nie über ihre LAN-IP ansprechen
tailscaled verwirft auf jedem Host Pakete mit Tailnet-Quelle (`100.64.0.0/10`), die nicht über das eigene `tailscale0`-Interface eintreffen (Anti-Spoofing-Regel in `ts-input`). Hosts mit eigenem tailscaled (`pve00/01/02`, `vm-traefik-02`, `checkmk`) sind aus dem Tailnet deshalb nur über ihre native Tailscale-IP erreichbar, nicht über die LAN-IP. Die Tailscale-IPs stehen in [SSH-Zugang](../../_referenz/ssh-zugang.md).
:::

## Tag-Schema

`tag:hslu` (3 Hosts):

- `opn-01` -- HSLU OPNsense Primary, Subnet-Router für 10.180.0.0/16, 147.88.0.0/16, 147.88.202.0/24
- `opn-02` -- HSLU OPNsense Secondary, gleiche Subnet-Routes wie opn-01
- `messe-pc-hslu` (DESKTOP-0PK5JUR) -- Subnet-Router für 192.168.50.0/24

`tag:homelab` (14 Hosts). Subnet-Router (advertisieren ein lokales Netz ins Tailnet):

- `vm-traefik-01` -- Subnet-Router für 10.0.0.0/22 und 10.0.10.0/24, ausserdem Exit-Node für `tag:admin`
- `vm-traefik-02` -- gleiche Routes wie vm-traefik-01, beide aktiv (automatischer Primary-Failover)
- `pve-01-nana` -- externer Watchdog ausserhalb des Heimnetzes, Subnet-Router für 192.168.2.0/23
- `pve-lu-01` -- Standalone-Proxmox am Standort Luzern, Subnet-Router für 172.16.0.0/24
- `pve00` -- advertisiert die Lenzburg-VLAN-Routen (`10.0.0.0/21`, `10.0.10.0/23`, `10.0.100.0/23`, `10.0.200.0/23`), die Routen sind derzeit aber nicht freigegeben und im Tailnet inaktiv. Die VLAN-Subnetze liegen ausserhalb des `tag:homelab`-Grants und wären ohnehin nur über den `tag:admin`-Vollzugriff nutzbar.

Weitere Mitglieder (im Tailnet, ohne eigene Subnet-Routes):

- `pdm` -- Proxmox Datacenter Manager, erreicht `pve-lu-01` über dessen Tailscale-IP
- `checkmk-homelab` -- Monitoring-Server, `tag:homelab`, `accept-routes` aktiv (Details: [Routing-Sonderregel](#checkmk-routing-sonderregel))
- `pve01`, `pve02` -- Cluster-Nodes
- `homeassistant` -- HA-Luzern-VM (LAN 172.16.0.163), Client-Node für den Config-Git-Push nach Gitea (`accept-routes`, `tag:homelab`). Details: [Gitea -- Config-Anbindung HA-Luzern](../../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale)
- `ha-dottikon` -- Tailscale-Add-on der HA-Instanz Dottikon (LAN 192.168.3.247), `tag:homelab`, `accept-routes` **aus**, Key-Expiry deaktiviert. Trägt den Monitoring-Push-Heartbeat der Instanz. Warum accept-routes hier aus muss: [HA-Tailscale-Add-ons an Aussenstandorten](#ha-tailscale-add-ons-an-aussenstandorten)
- `kuma-wd-home`, `kuma-wd-nana` -- Uptime-Kuma-Watchdogs, prüfen interne Services per direkter IP über das Tailnet ([Monitoring](../../monitoring/index.md))
- `nomad-edge-dottikon` -- Nomad-Edge-Worker Dottikon (LXC auf pve-01-nana), `accept-routes` aktiv für den Weg zu den Nomad-Servern ([Nomad Aussenstandort](../../plattform/nomad/aussenstandort.md))

`tag:admin` (3 Geräte):

- `copper-1` -- Laptop (macOS)
- `boson` -- iPhone (iOS), trägt zusätzlich `tag:homelab` und `tag:hslu`
- `apple-tv` -- Wohnzimmer Apple-TV, Subnet-Router für 172.16.0.0/24

## CheckMK Routing-Sonderregel

::: warning Routing-Sonderregel checkmk-homelab (10.0.2.150)
`checkmk-homelab` hat `accept-routes` aktiviert und liegt selbst in `10.0.2.0/24` -- einem Subnetz innerhalb von `10.0.0.0/22`. Ohne Gegenmassnahme würde Tailscale den Reply-Traffic zu LAN-Nachbarn in `10.0.0.x` (HA 10.0.0.100, Synology-NAS 10.0.0.200/.210, UDM 10.0.0.1) über `tailscale0` umleiten, statt direkt über `eth0`. Das ergibt asymmetrisches Routing -- SNMP- und Agent-Checks brechen.

Lösung: Eine höherprioritäre ip-Regel erzwingt für alle Ziele in `10.0.0.0/22` die `main`-Tabelle (eth0), unabhängig von Tailscales table 52.

Konfiguration: `ip rule prio 100 to 10.0.0.0/22 lookup main`, persistiert via `/etc/network/if-up.d/tailscale-route-override`. Die Routen für andere Standorte (`192.168.2.0/23`, `172.16.0.0/24`) in table 52 bleiben unberührt -- `nana-nas` und `pve-lu-01` sind weiterhin erreichbar.
:::

## ACL-Pattern

Die Policy benutzt das moderne `grants`-Schema (nicht das deprecated `acls`). Drei Regeln decken den Vollzustand ab:

- `tag:admin -> *` -- Admin-Geräte sehen alles, inkl. aller Subnet-Routes
- `tag:hslu -> tag:hslu, 10.180.0.0/16, 147.88.0.0/16, 147.88.202.0/24, 192.168.50.0/24` -- HSLU-Hosts sehen nur sich selbst und HSLU-Subnets
- `tag:homelab -> tag:homelab, 10.0.0.0/22, 192.168.2.0/23` -- Homelab-Hosts sehen nur sich selbst, das Lenzburg-Management-Netz und das Dottikon-LAN. Das Luzern-LAN `172.16.0.0/24` ist nicht im Grant: Homelab-Hosts (z.B. PDM) erreichen `pve-lu-01` über dessen Tailscale-IP, das LAN dahinter nutzt nur `tag:admin`.

`autoApprovers.routes` legt fest, welcher Tag welche Subnetze ohne manuelles Approval advertisieren darf. So bleiben Subnet-Routes bei einem Re-Auth oder Tag-Wechsel automatisch enabled. Der aktuelle Stand umfasst:

- `10.0.0.0/22`, `10.0.0.0/21`, `10.0.10.0/23`, `10.0.100.0/23`, `10.0.200.0/23` -- `tag:homelab` (Lenzburg-LAN + VLANs via vm-traefik-01/02 und pve00)
- `192.168.2.0/23` -- `tag:homelab` (Dottikon via pve-01-nana)
- `172.16.0.0/24` -- `tag:homelab` und `tag:admin` (Luzern via pve-lu-01 und apple-tv)

Die vollständigen Einträge sind kanonisch in [`derever-labs/infra/tailscale-policy/policy.hujson`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/policy.hujson) -- keine Duplikation hier.

## Externe Proxmox-Nodes

Die beiden Standalone-Proxmox-Nodes ([Proxmox -- Externe Nodes](../../infrastruktur/proxmox/index.md#externe-standalone-nodes)) sind Subnet-Router für ihr jeweiliges Standort-Netz: `pve-01-nana` für `192.168.2.0/23`, `pve-lu-01` für `172.16.0.0/24`. Die Route nach Luzern wird redundant auch vom `apple-tv` advertisiert.

::: warning Self-Subnet-Lockout
Eine Node mit `accept-routes`, deren eigenes LAN von einem **anderen** Knoten advertisiert wird, muss **selbst** approved Subnet-Router für dieses LAN sein -- sonst routet sie ihr eigenes Subnet über Tailscale und sperrt sich lokal aus.

Konkret bei `pve-lu-01`: Die Route `172.16.0.0/24` wird vom `apple-tv` advertisiert. Als die ACL `tag:homelab -> 172.16.0.0/24` freigab, übernahm `pve-lu-01` (selbst `tag:homelab`, mit `accept-routes`) diese Tailscale-Route für **sein eigenes** LAN -- lokaler SSH/Ping war tot (nur die Tailscale-IP blieb erreichbar). Lösung: `pve-lu-01` zuerst selbst als approved Subnet-Router für `172.16.0.0/24` setzen, **dann** die ACL erweitern. Heute enthält der homelab-Grant das Luzern-Netz nicht mehr ([ACL-Pattern](#acl-pattern)); die Reihenfolge-Regel gilt für jede künftige Erweiterung.

`pve-01-nana` ist davon nicht betroffen, weil es sein Netz `192.168.2.0/23` von Anfang an selbst advertisiert.
:::

### HA-Tailscale-Add-ons an Aussenstandorten

Die Home-Assistant-Instanzen in Luzern und Dottikon sind über das Tailscale-Add-on eigene Tailnet-Clients (`tag:homelab`). Sie tragen den Config-Git-Push (Luzern) und den Monitoring-Push-Heartbeat (beide) über das Overlay -- vom Cluster aus sind die Aussenstandort-Instanzen sonst nicht erreichbar.

::: warning accept-routes an Aussenstandorten
Ein HA-Add-on, dessen eigenes Standort-LAN in einem `tag:homelab`-Grant liegt, riskiert mit `accept-routes` einen Self-Subnet-Lockout: Es übernähme die Tailscale-Route für sein eigenes Subnet und wäre lokal nicht mehr erreichbar (dieselbe Mechanik wie bei `pve-lu-01` oben).

Deshalb läuft **Dottikon** (LAN 192.168.3.x, gedeckt vom Grant `192.168.2.0/23`) mit `accept-routes` **aus** und erreicht das Monitoring direkt über die Tailscale-IPs der Traefik-Knoten -- Tailscale-IPs brauchen keine akzeptierten Routen. `accept-routes` bleibt nur dort aktiv, wo ein Ziel ausschliesslich über eine Subnet-Route erreichbar ist: **Luzern** braucht es für den Monitoring-Push auf die Keepalived-VIP `10.0.2.20`, die keine eigene Tailscale-IP hat.
:::

## Test-Validierung

`policy.hujson.tests` deckt die Hauptpfade ab und wird beim Apply von der Tailscale-API gegengeprüft. Schlägt ein Test fehl, lehnt der API-POST ab.

::: warning tailscale ping ignoriert ACLs
`tailscale ping` testet das WireGuard-Steuerprotokoll, nicht die ACL-Filter. Verifikation der Cluster-Trennung muss über TCP-Tests laufen (`nc -zv <peer> 22`). Cross-Cluster TCP muss timeouten, intra-Cluster muss durchgehen.
:::

## Apply-Workflow

Die Policy wird als GitOps gepflegt: [`derever-labs/infra/tailscale-policy/policy.hujson`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/policy.hujson) ist die einzige Source of Truth. Änderungen erfolgen via PR gegen dieses Repo.

Es gibt keinen automatischen GitOps-Sync -- nach einem Merge muss die Policy manuell in der Tailscale Admin-Console applied werden. Bei kleineren Änderungen ohne neue Tags reicht ein direkter API-Apply. Bei Schema-Änderungen mit neuen Tags muss zuerst eine Stage-1-Policy mit den `tagOwners`-Einträgen apply'd werden, bevor Devices den Tag akzeptieren -- Details und Sequenz: [`tailscale-policy/README`](https://github.com/derever-labs/infra/blob/main/tailscale-policy/README.md).

Der API-Key liegt im 1Password-Item `Tailscale` im `PRIVAT Agent`-Vault.

## Verwandte Seiten

- [Netzwerk-Übersicht](././) -- Topologie, VLANs, Hardware
- [Standorte](./standorte.md) -- standortübergreifende Netz-Architektur über das Tailscale-Overlay
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- vollständige IP-Zuordnung
- [Traefik](../../edge/traefik/) -- Reverse Proxy mit Tailscale-CGNAT-Whitelist
