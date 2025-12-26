---
title: Home
description: Willkommen in der Homelab Dokumentation
published: true
date: 2025-12-26T18:30:00+00:00
tags: home, overview
editor: markdown
---

# Homelab Dokumentation

Willkommen in der zentralen Wissensdatenbank für das Homelab. Diese Dokumentation umfasst die Architektur, die Infrastruktur-Komponenten und alle laufenden Services.

## Schnelleinstieg

### [Architektur](./01-architecture/overview)
Gesamtübersicht des Netzwerks und des Aufbaus.

### [Infrastruktur](./02-infrastructure/proxmox-cluster)
Details zu den physikalischen Hosts (Proxmox), [Storage (NAS)](./02-infrastructure/storage-nas) und [Backup (PBS)](./04-services/core/pbs).

### [Services](./04-services/nomad-overview)
Übersicht aller laufenden Applikationen und Container.

### [Runbooks](./05-runbooks/cluster-restart)
Schritt-für-Schritt Anleitungen für Wartung und Notfälle.

## Stack Übersicht
- **Virtualisierung:** Proxmox VE
- **Orchestrierung:** HashiCorp Nomad & Consul
- **Secrets:** HashiCorp Vault
- **Netzwerk:** OPNsense, Traefik, Cloudflare
- **Storage:** Synology NFS & Local SSD

---
*Letztes Update: 26.12.2025*