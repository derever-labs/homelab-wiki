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

## Credentials

Zugangsdaten: [Credentials](../_referenz/credentials.md). SSO via Authentik, Fallback `root@pam` -- Details: [Proxmox Übersicht](index.md#authentifizierung-sso).

## Verwandte Seiten

- [Proxmox Übersicht](index.md) -- Komponenten, Architektur und SSO-Setup des Clusters
- [Backup](../backup/) -- PBS-Datastore und Backup-Strategie
- [Linstor Storage](../linstor-storage/) -- DRBD-replizierter Block-Storage für VM-Disks
- [Netzwerk](../netzwerk/) -- VLANs, VIPs und Routing im Homelab
- [Hardware-Inventar](../_referenz/hardware-inventar.md) -- Node-Specs und verbaute Hardware
- [Credentials](../_referenz/credentials.md) -- Zugangsdaten für Proxmox und PBS
