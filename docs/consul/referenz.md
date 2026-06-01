---
title: Consul - Referenz
description: Ports, Konfigurationspfade und DNS-Integration
tags:
  - consul
  - referenz
---

# Consul - Referenz

## Konfigurationspfade

- `/etc/consul.d/` -- Konfigurationsdateien (verwaltet via Ansible)
- `/opt/consul` -- Datenpfad (Raft-Log, Snapshots, KV-Store)

## Autopilot

`cleanup_dead_servers = true` ist aktiv; Verhalten und manuelle Eingriffe: [Consul Betrieb](./betrieb.md).

## DNS-Forwarding

Pi-hole (lxc-dns-01 und lxc-dns-02) ist so konfiguriert, dass alle DNS-Anfragen für die Domain `.consul` an die drei Consul-Server weitergeleitet werden (Port 8600). Dadurch können alle Geräte im Netzwerk Services über das Schema `<service>.service.consul` auflösen, ohne den Consul-Client lokal betreiben zu müssen.

Vollständige DNS-Dokumentation: [DNS-Architektur](../dns/)

## Consul Catalog Provider

Traefik nutzt den Consul Catalog Provider für automatisches Service-Routing; Tags-Schema und Routing-Details: [Traefik](../traefik/).

## Verwandte Seiten

- [Consul Übersicht](./index.md) -- Architektur, Service Discovery, KV Store
- [Consul Betrieb](./betrieb.md) -- Betriebskonzepte und bekannte Einschränkungen
- [Ports und Dienste](../_referenz/ports-und-dienste.md) -- Vollständige Port-Übersicht (HashiCorp Stack)
- [DNS-Architektur](../dns/) -- Vollständige DNS-Kette
- [Traefik](../traefik/) -- Consul Catalog Integration
