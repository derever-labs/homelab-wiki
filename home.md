---
title: Startseite
description: Willkommen in der Homelab Dokumentation
tags:
  - home
  - overview
---

# Homelab Dokumentation

Willkommen in der zentralen Wissensdatenbank für das Homelab. Diese Dokumentation umfasst die Architektur, die Infrastruktur-Komponenten und alle laufenden Services.

## Schnelleinstieg

### [Infrastruktur](./02-infrastructure/proxmox-cluster.md)
Details zu den physikalischen Hosts (Proxmox), [Storage (NAS)](./02-infrastructure/storage-nas.md), [Netzwerk Optimierung](./02-infrastructure/network-optimization.md) und [Backup (PBS)](./04-services/core/pbs.md).

### [Architektur](./01-architecture/overview.md)
Gesamtübersicht des Netzwerks, [Sicherheit](./03-platforms/security.md) und [Datenstrategie](./01-architecture/data-strategy.md).

### [Services](./03-platforms/nomad-architecture.md)
Übersicht aller laufenden Applikationen und Container.

### [Runbooks](./05-runbooks/cluster-restart.md)
Schritt-für-Schritt Anleitungen für Wartung und Notfälle.

## Stack Übersicht
- **Virtualisierung:** Proxmox VE
- **Orchestrierung:** HashiCorp Nomad & Consul
- **Secrets:** HashiCorp Vault
- **Netzwerk:** OPNsense, Traefik, Cloudflare
- **Storage:** Synology NFS & Local SSD

---
*Letztes Update: 26.12.2025*