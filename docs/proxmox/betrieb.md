---
title: Proxmox Betrieb
description: HA-Prüfungen, Wartung, bekannte Probleme und Betriebsnotizen für den Proxmox-Cluster
tags:
  - proxmox
  - ha
  - betrieb
---

# Proxmox Betrieb

## HA-Prüfungen

### Letzte Prüfung: 2026-04-05

Alle fünf HA-Schichten wurden systematisch geprüft.

#### 1. Corosync Cluster -- OK

- Cluster "Proxmox-Rack-01", Config Version 27
- Alle 3 Nodes online (pve00, pve01, pve02)
- Quorum: 2/3, Quorate: Yes
- Ring ID stabil (1.213d), KNET Transport, MTU 1397
- Corosync-Dienst auf allen Nodes active seit 2026-04-03

#### 2. HA-Manager -- OK

- `shutdown_policy: migrate` korrekt gesetzt
- Migration-Netzwerk: 10.99.1.0/24 (Thunderbolt)
- Fencing: Armed, CRM Watchdog aktiv auf allen Nodes
- 6 HA-Ressourcen aktiv: vm:1000, vm:2000, vm:99999, ct:100, (vm:4001 und vm:4002 intentional gestoppt -- stillgelegte alte VMs)
- Keine HA-Gruppen konfiguriert (nicht benötigt bei 3-Node-Setup)

#### 3. DRBD/Linstor Storage -- OK (nach Fix)

- **vm-nomad-client-06 war gestoppt** und bootete zunächst in Emergency Mode (NFS-Mounts blockierten den Boot)
- Nach manuellem Fix über noVNC-Konsole: client-06 wieder ONLINE
- Alle 34 Volumes vollständig synchronisiert (UpToDate auf client-05 und client-06)
- client-04 (TieBreaker): Online, Diskless, funktional
- DRBD Reactor aktiv auf beiden Storage-Nodes
- Speicherplatz: client-05 116 GiB frei (58%), client-06 100 GiB frei (50%)

#### 4. Traefik/Keepalived -- OK (nach Fix)

- VIP 10.0.2.20 korrekt auf vm-traefik-01 (MASTER, Priorität 150)
- Keepalived active auf beiden Nodes
- Traefik v3.4 läuft auf beiden Nodes als Docker-Container
- Health-Check (`/ping`) antwortet auf beiden Nodes

::: tip Behoben am 2026-04-05
Keepalived Health-Check oszillierte wegen Traefik-internen Hot-Reloads (Consul-Catalog-Updates). Fix: `fall` von 3 auf 5 erhöht, `--max-time 2` für curl, Consul-Catalog `cache: true` gesetzt. Oszillation ist nach Deploy nicht mehr aufgetreten.
:::

#### 5. Nomad/Consul/Vault -- OK (nach Fix)

**Consul:**
- 3 Server alive, Leader: vm-nomad-server-04
- Autopilot Healthy, Failure Tolerance: 1
- Alle 6 Nodes alive (inkl. client-06 nach Fix)
- Commit Index synchron (28775806)

**Vault:**
- Unsealed, HA active seit 2026-04-03
- Version 1.18.3, Raft Storage
- Committed/Applied Index synchron (169181)

**Nomad:**
- 3 Server alive, Leader gewählt
- Alle 3 Clients funktional (client-06 nimmt wieder Jobs an)
- ACL aktiv (erwartetes Verhalten)

## Bekannte Probleme

### NFS-Boot-Abhängigkeit auf Nomad-Clients

Die Nomad-Client-VMs haben NFS-Mounts in `/etc/fstab` die ohne `nofail` konfiguriert sind. Wenn der NFS-Server (Synology NAS, 10.0.0.200) beim VM-Boot nicht erreichbar ist, blockiert der Boot und das System fällt in den Emergency Mode.

**Betroffene VMs:** vm-nomad-client-05, vm-nomad-client-06

**Lösung:** NFS-Mounts in `/etc/fstab` mit `nofail,x-systemd.automount` konfigurieren.

### Keepalived Oszillation (behoben 2026-04-05)

Traefik v3 führt bei Consul-Catalog-Änderungen interne Hot-Reloads durch. Dabei schliesst der `/ping`-Endpoint kurzzeitig (~2-10s), was den Keepalived Health-Check mit Exit 56 (Connection Reset) fehlschlagen liess.

**Root Cause:** `cache: false` in der Consul-Catalog-Config verursachte unnötige Reloads. Der Health-Check `fall 3` war zu empfindlich für die Reload-Dauer.

**Fix:**
- `keepalived.conf`: `fall 3` → `fall 5`, `--max-time 2` für curl
- `traefik.yml`: `consulCatalog.cache: false` → `true`
- Ansible-Templates und Live-Config gleichzeitig aktualisiert
