---
title: Consul - Referenz
description: Ports, Konfigurationspfade und DNS-Integration
tags:
  - consul
  - referenz
---

# Consul - Referenz

## Ports

- **8500** -- HTTP API und Web-UI
- **8600** -- DNS (UDP + TCP)
- **8300** -- Server RPC (Raft-Kommunikation zwischen Servern)
- **8301** -- Serf LAN (Gossip innerhalb des Datacenters)
- **8302** -- Serf WAN (Gossip über Datacenter-Grenzen; im Homelab nicht aktiv)
- **8502** -- gRPC (für Connect/Envoy; im Homelab nicht genutzt)

## Konfigurationspfade

- `/etc/consul.d/` -- Konfigurationsdateien (verwaltet via Ansible)
- `/opt/consul` -- Datenpfad (Raft-Log, Snapshots, KV-Store)

## Autopilot

Consul Autopilot läuft mit Standardkonfiguration. Der Parameter `cleanup_dead_servers = true` sorgt dafür, dass ausgefallene Server automatisch aus dem Raft-Cluster entfernt werden, sobald ein Ersatz-Node verfügbar ist. Manuelle Eingriffe sind in der Regel nicht nötig.

## DNS-Forwarding

Pi-hole (lxc-dns-01 und lxc-dns-02) ist so konfiguriert, dass alle DNS-Anfragen für die Domain `.consul` an die drei Consul-Server weitergeleitet werden (Port 8600). Dadurch können alle Geräte im Netzwerk Services über das Schema `<service>.service.consul` auflösen, ohne den Consul-Client lokal betreiben zu müssen.

Vollständige DNS-Dokumentation: [DNS-Architektur](../dns/)

## Consul Catalog Provider

Traefik nutzt den Consul Catalog Provider für automatisches Service-Routing. Sobald Nomad einen Container startet und in Consul registriert, erkennt Traefik den neuen Service und konfiguriert die Route -- ohne manuellen Eingriff. Die Traefik-Labels im Nomad-Job steuern Hostname, Middlewares und TLS.

Traefik-Dokumentation: [Traefik](../traefik/)

## Verwandte Seiten

- [Consul Übersicht](./index.md) -- Architektur, Service Discovery, KV Store
- [Consul Betrieb](./betrieb.md) -- Betriebskonzepte und bekannte Einschränkungen
- [DNS-Architektur](../dns/) -- Vollständige DNS-Kette
- [Traefik](../traefik/) -- Consul Catalog Integration
