---
title: Startseite
description: Willkommen in der Homelab Dokumentation
tags:
  - index
  - home
  - overview
---

# Homelab Dokumentation

Willkommen in der zentralen Wissensdatenbank für das Homelab. Diese Dokumentation umfasst die Architektur, die Infrastruktur-Komponenten und alle laufenden Services.

## Bereiche

- [Architektur](./architecture/) -- Gesamtübersicht, Netzwerk-Topologie und strategische Entscheidungen
- [Infrastruktur](./infrastructure/) -- Physische Hosts, Storage und Netzwerk-Hardware
- [Plattformen](./platforms/) -- HashiCorp Stack, Traefik, DNS, Security
- [Services](./services/) -- Alle laufenden Applikationen und Container
- [Runbooks](./runbooks/) -- Schritt-für-Schritt Anleitungen für Wartung und Notfälle
- [Wiki-Richtlinien](./wiki-richtlinien.md) -- Regeln für Inhalt, Struktur und Pflege dieser Dokumentation

## Stack Übersicht

- **Virtualisierung:** Proxmox VE
- **Orchestrierung:** HashiCorp Nomad & Consul
- **Secrets:** HashiCorp Vault
- **Netzwerk:** Pi-hole v6, Unbound, Traefik, Cloudflare
- **Security:** CrowdSec, Keycloak, OAuth2-Proxy
- **Storage:** Synology NFS & Local SSD
