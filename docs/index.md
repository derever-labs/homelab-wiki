---
title: Startseite
description: Willkommen in der Homelab Dokumentation
tags:
  - home
  - overview
---

# Homelab Dokumentation

Willkommen in der zentralen Wissensdatenbank fuer das Homelab. Diese Dokumentation umfasst die Architektur, die Infrastruktur-Komponenten und alle laufenden Services.

## Schnelleinstieg

### [Infrastruktur](./infrastructure/proxmox-cluster.md)
Details zu den physikalischen Hosts (Proxmox), [Storage (NAS)](./infrastructure/storage-nas.md), [Netzwerk-Tuning](./platforms/network-tuning.md) und [Backup (PBS)](./services/core/pbs.md).

### [Architektur](./architecture/overview.md)
Gesamtuebersicht des Netzwerks, [Sicherheit](./platforms/security.md) und [Datenstrategie](./architecture/data-strategy.md).

### [Services](./platforms/nomad-architecture.md)
Uebersicht aller laufenden Applikationen und Container.

### [Runbooks](./runbooks/cluster-restart.md)
Schritt-fuer-Schritt Anleitungen fuer Wartung und Notfaelle.

### [Wiki-Richtlinien](./wiki-richtlinien.md)
Regeln fuer Inhalt, Struktur und Pflege dieser Dokumentation.

## Stack Uebersicht
- **Virtualisierung:** Proxmox VE
- **Orchestrierung:** HashiCorp Nomad & Consul
- **Secrets:** HashiCorp Vault
- **Netzwerk:** Pi-hole v6, Unbound, Traefik, Cloudflare
- **Security:** CrowdSec, Keycloak, OAuth2-Proxy
- **Storage:** Synology NFS & Local SSD
