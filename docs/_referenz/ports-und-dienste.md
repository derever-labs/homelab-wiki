---
title: Ports und Dienste
description: Port-Zuordnung aller Services und Infrastruktur-Komponenten
tags:
  - referenz
  - netzwerk
  - ports
---

# Ports und Dienste

::: info Single Source of Truth
Diese Seite ist die kanonische Quelle für alle Port-Zuordnungen. Andere Seiten verlinken hierher, anstatt Ports zu duplizieren.
:::

## Infrastruktur

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 53 | TCP/UDP | DNS (Pi-hole) | lxc-dns-01 (10.0.2.1), lxc-dns-02 (10.0.2.2) |
| 2049 | TCP | NFS | Synology NAS (10.0.0.200) |
| 8006 | TCP | Proxmox Web-UI | Auf jedem Proxmox-Node |
| 8007 | TCP | PBS Web-UI | Proxmox Backup Server (10.0.2.50) |
| 8443 | TCP | PDM Web-UI | Proxmox Datacenter Manager (10.0.2.60) |

## HashiCorp Stack

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 4646 | TCP | Nomad HTTP API / UI | Auf allen Server-Nodes |
| 4647 | TCP | Nomad RPC | Interne Cluster-Kommunikation |
| 4648 | TCP/UDP | Nomad Serf | Gossip-Protokoll |
| 8200 | TCP | Vault HTTP API / UI | Auf allen Server-Nodes |
| 8201 | TCP | Vault Cluster | Interne Replikation |
| 8500 | TCP | Consul HTTP API / UI | Auf allen Nodes |
| 8600 | TCP/UDP | Consul DNS | Service Discovery DNS Interface |
| 8301 | TCP/UDP | Consul Serf LAN | Gossip innerhalb Datacenter |
| 8302 | TCP/UDP | Consul Serf WAN | Gossip zwischen Datacentern |
| 8300 | TCP | Consul Server RPC | Client-zu-Server Kommunikation |

## Datenbanken

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 5432 | TCP | PostgreSQL | Shared Cluster via `postgres.service.consul` |

## Services

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 80 | TCP | Traefik HTTP | Weiterleitung auf HTTPS |
| 443 | TCP | Traefik HTTPS | Reverse Proxy Eingang |
| 1883 | TCP | MQTT (Mosquitto) | IoT Message Broker |
| 9001 | TCP | MQTT WebSocket | Mosquitto WebSocket Interface |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- IP-Adressen aller Systeme
- [Web-Interfaces](./web-interfaces.md) -- URLs aller Web-UIs
