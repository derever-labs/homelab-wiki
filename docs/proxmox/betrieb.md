---
title: Proxmox - Betrieb
description: Betriebskonzepte für den Proxmox VE Cluster
tags:
  - proxmox
  - betrieb
  - ha
---

# Proxmox - Betrieb

## Übersicht

Der Cluster "lenzburg" besteht aus drei Nodes (pve00, pve01, pve02) und betreibt alle Homelab-VMs und Container als Proxmox VE. Folgende Komponenten sind im Betrieb:

- **Proxmox VE Cluster** -- gemeinsame Cluster-Konfiguration, Quorum-basiertes Abstimmungsverfahren
- **HA-Manager** -- überwacht HA-Ressourcen und migriert VMs bei geplantem Node-Shutdown
- **DRBD/Linstor** -- replizierter Block-Storage zwischen den Storage-Nodes für VM-Disks
- **PBS (Proxmox Backup Server)** -- inkrementelle VM-Backups nach Zeitplan
- **Keepalived** -- VRRP-basiertes Failover für die Traefik-VIP

## Abhängigkeiten

::: warning Quorum-Pflicht
Fällt ein zweiter Node aus, verliert der Cluster das Quorum und blockiert alle Schreiboperationen -- VMs laufen weiter, können aber weder migriert noch neu gestartet werden.
:::

- **Corosync** -- Cluster-Kommunikation zwischen allen drei Nodes. Quorum erfordert mindestens 2 von 3 Nodes erreichbar.
- **Thunderbolt-Netzwerk (10.99.1.0/24)** -- dediziertes Interface für VM-Livemigration und DRBD-Replikation zwischen den Storage-Nodes.
- **NFS (Synology, 10.0.0.200)** -- Shared Storage für ISO-Images und PBS-Backups. Beim Start der Nomad-Client-VMs muss der NFS-Server erreichbar sein.
- **Keepalived** -- hält die VIP 10.0.2.20 für Traefik-HA. Beide Traefik-Nodes müssen laufen, damit VRRP-Failover funktioniert.

## Automatisierung

- **HA-Manager mit `migrate-on-shutdown`** -- beim geplanten Herunterfahren eines Nodes migriert der HA-Manager alle HA-Ressourcen automatisch auf verbleibende Nodes, bevor der Node abschaltet.
- **Keepalived VRRP** -- überwacht den Traefik-Healthcheck kontinuierlich. Fällt der aktive Node aus, übernimmt der Standby-Node die VIP ohne manuellen Eingriff.
- **Let's Encrypt ACME** -- erneuert TLS-Zertifikate automatisch via Cloudflare DNS Challenge. Proxmox holt sich Zertifikate selbst; kein externer Prozess notwendig.
- **PBS Backup-Zeitplan** -- inkrementelle VM-Snapshots laufen nach konfiguriertem Zeitplan und werden im PBS-Datastore versioniert aufbewahrt.
- **DRBD Reactor** -- überwacht die DRBD-Replikation und reagiert auf Ressourcen-Ereignisse. Läuft auf beiden Storage-Nodes und hält die Linstor-Metadaten konsistent.

## Bekannte Einschränkungen

::: warning NFS-Boot-Abhängigkeit
Nomad-Client-VMs (client-05 und client-06) haben NFS-Mounts ohne `nofail`-Option konfiguriert. Ist der NFS-Server beim VM-Boot nicht erreichbar, blockiert systemd und das System fällt in den Emergency Mode. Solange diese Option nicht gesetzt ist, muss der NFS-Server vor dem Start dieser VMs verfügbar sein.
:::

- **Keepalived-Oszillation bei Traefik-Reload** -- Traefik v3 führt bei Consul-Catalog-Änderungen interne Hot-Reloads durch, während derer der Healthcheck-Endpoint kurzzeitig nicht antwortet. Mit einem zu niedrigen `fall`-Wert löst das unnötige VRRP-Zustandswechsel aus. Behoben wurde dies durch einen höheren `fall`-Wert und durch Aktivieren des Consul-Catalog-Cache, der die Reload-Frequenz reduziert (Stand April 2026).

- **iGPU Full Passthrough** -- die integrierte GPU eines Nodes ist exklusiv einer einzigen VM zugewiesen. Ein zweiter paralleler GPU-Consumer ist ohne SR-IOV nicht möglich. SR-IOV ist auf der verbauten Hardware nicht verfügbar.

## Credentials

Zugangsdaten für Proxmox sind in [../_referenz/credentials.md](../_referenz/credentials.md) hinterlegt.

- **Standard-Login** -- SSO via Authentik (OpenID Connect), erreichbar über die Proxmox-Weboberfläche
- **Fallback** -- lokaler PAM-Benutzer `root@pam` für den Fall, dass Authentik nicht erreichbar ist

---

**Verwandte Seiten**

- [Proxmox Übersicht](index.md)
- [Backup](../backup/)
- [Linstor Storage](../linstor-storage/)
- [Netzwerk](../netzwerk/)
- [Hardware-Inventar](../_referenz/hardware-inventar.md)
- [Credentials](../_referenz/credentials.md)
