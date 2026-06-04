---
title: Proxmox - Betrieb
description: Betriebskonzepte für den Proxmox VE Cluster
tags:
  - proxmox
  - betrieb
  - ha
---

# Proxmox - Betrieb

Betriebskonzepte für den Proxmox VE Cluster "lenzburg" (pve00, pve01, pve02): Abhängigkeiten, Automatisierung und bekannte Einschränkungen. Komponenten und Architektur sind in der [Proxmox Übersicht](index.md) beschrieben.

## Abhängigkeiten

::: warning Quorum-Pflicht
Fällt ein zweiter Node aus, verliert der Cluster das Quorum und blockiert alle Schreiboperationen -- VMs laufen weiter, können aber weder migriert noch neu gestartet werden.
:::

- **Corosync** -- Cluster-Kommunikation zwischen allen drei Nodes. Quorum erfordert mindestens 2 von 3 Nodes erreichbar.
- **Thunderbolt-Netzwerk** -- dediziertes Interface für VM-Livemigration und DRBD-Replikation zwischen den Storage-Nodes.
- **NFS (Synology NAS)** -- Shared Storage für ISO-Images und PBS-Backups (Adressen siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)). Beim Start der Nomad-Client-VMs muss der NFS-Server erreichbar sein.
- **Keepalived** -- hält die VIP für Traefik-HA. Beide Traefik-Nodes müssen laufen, damit VRRP-Failover funktioniert.

## Automatisierung

- **HA-Manager mit `migrate-on-shutdown`** -- beim geplanten Herunterfahren eines Nodes migriert der HA-Manager alle HA-Ressourcen automatisch auf verbleibende Nodes, bevor der Node abschaltet.
- **Keepalived VRRP** -- überwacht den Traefik-Healthcheck kontinuierlich. Fällt der aktive Node aus, übernimmt der Standby-Node die VIP ohne manuellen Eingriff. Traefik v3 führt bei Consul-Catalog-Änderungen interne Hot-Reloads durch, während derer der Healthcheck-Endpoint kurzzeitig nicht antwortet; ein höherer `fall`-Wert und der aktivierte Consul-Catalog-Cache verhindern dadurch ausgelöste unnötige VRRP-Zustandswechsel.
- **Let's Encrypt ACME** -- erneuert TLS-Zertifikate automatisch via Cloudflare DNS Challenge. Proxmox holt sich Zertifikate selbst; kein externer Prozess notwendig.
- **PBS Backup-Zeitplan** -- inkrementelle VM-Snapshots laufen nach konfiguriertem Zeitplan und werden im PBS-Datastore versioniert aufbewahrt.
- **DRBD Reactor** -- überwacht die DRBD-Replikation und reagiert auf Ressourcen-Ereignisse. Läuft auf beiden Storage-Nodes und hält die Linstor-Metadaten konsistent.

## Bekannte Einschränkungen

::: warning NFS-Boot-Abhängigkeit
Nomad-Client-VMs (client-05 und client-06) haben NFS-Mounts ohne `nofail`-Option konfiguriert. Ist der NFS-Server beim VM-Boot nicht erreichbar, blockiert systemd und das System fällt in den Emergency Mode.
:::

- **iGPU Full Passthrough** -- die integrierte GPU eines Nodes ist exklusiv einer einzigen VM zugewiesen. Ein zweiter paralleler GPU-Consumer ist ohne SR-IOV nicht möglich. SR-IOV ist auf der verbauten Hardware nicht verfügbar.

## Externe Standalone-Nodes

Die Nodes `pve-01-nana` (Dottikon) und `pve-lu-01` (Luzern) sind **kein** Cluster-Mitglied: kein Corosync-Quorum, kein HA-Manager, kein DRBD/Linstor. Konsequenzen für den Betrieb:

- **Lokale ZFS-Disk** -- jede Node speichert ihre VMs auf der eigenen NVMe. Keine Live-Migration zwischen den Standorten (kein Shared Storage).
- **Reboot unkritisch** -- da kein Quorum gehalten werden muss, ist ein Reboot jederzeit möglich; die VMs kommen über `onboot` automatisch zurück (z.B. homeassistant-luzern / homeassistant-dottikon).
- **Backup via PBS** -- die externen Nodes sichern ihre VMs über den gemeinsamen [Proxmox Backup Server](../backup/referenz.md) (push über Tailscale).
- **Wartung via Ansible** -- angesprochen über die Inventory-Gruppe `proxmox_external` (gemeinsame Plays via `all_proxmox_hosts`).

::: tip Cross-Cluster-Migration: keine Snapshots
Eine Remote-Migration (PDM, von lenzburg auf eine externe Node oder umgekehrt) schlägt mit `remote migration with snapshots not supported` fehl, wenn die VM-Disk Snapshots hat. Vor der Migration alle Snapshots entfernen. Bleibt nach einem fehlgeschlagenen `qm delsnapshot` ein Phantom-Snapshot mit Lock zurück: `qm unlock <vmid>` und anschliessend `qm delsnapshot <vmid> <name> --force`.
:::

::: warning PVE 8→9: deb822-Repo-Falle
Der Major-Upgrade von PVE 8 auf 9 legt ein aktives Enterprise-Repo im deb822-Format an (`/etc/apt/sources.list.d/pve-enterprise.sources`). Ohne Subscription liefert es bei jedem `apt update` einen 401. Im neuen Format muss `Enabled: false` gesetzt werden -- das alte Auskommentieren der `.list`-Zeile greift hier nicht.
:::

::: warning PDM erreicht externe Remotes nur via Tailscale
PDM nutzt bewusst **kein** `accept-routes`. Würde es die Homelab-Subnet-Route `10.0.0.0/22` übernehmen, würde PDM sein eigenes Netz über Tailscale routen und sich aussperren (und die lokalen lenzburg/pbs-Remotes brechen). Die externen Nodes erreicht PDM daher über die direkte Tailscale-Peer-IP -- die Node-FQDNs lösen entsprechend auf die Tailscale-IPs auf. Details: [Tailscale -- Self-Subnet-Lockout](../netzwerk/tailscale.md#externe-proxmox-nodes).
:::

## Credentials

Zugangsdaten: [Credentials](../_referenz/credentials.md). SSO via Authentik, Fallback `root@pam` -- Details: [Proxmox Übersicht](index.md#authentifizierung-sso).

## Verwandte Seiten

- [Proxmox Übersicht](index.md) -- Komponenten, Architektur und SSO-Setup des Clusters
- [Backup](../backup/) -- PBS-Datastore und Backup-Strategie
- [Linstor Storage](../linstor-storage/) -- DRBD-replizierter Block-Storage für VM-Disks
- [Netzwerk](../netzwerk/) -- VLANs, VIPs und Routing im Homelab
- [Hardware-Inventar](../_referenz/hardware-inventar.md) -- Node-Specs und verbaute Hardware
- [Credentials](../_referenz/credentials.md) -- Zugangsdaten für Proxmox und PBS
