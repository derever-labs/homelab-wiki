---
title: SSH-Zugang
description: SSH-Benutzer und Zugangsregeln für alle Systeme
tags:
  - referenz
  - ssh
  - zugang
---

# SSH-Zugang

## Admin-Benutzer

Der Standard-Benutzer für alle HashiCorp-VMs ist `sam`. Authentifizierung erfolgt ausschliesslich über SSH Key -- Passwort-Login ist deaktiviert.

## Proxmox Nodes

SSH-Zugang als `root` auf den Management-IPs.

| Node | IP | Benutzer |
| :--- | :--- | :--- |
| pve00 | 10.0.2.40 | root |
| pve01 | 10.0.2.41 | root |
| pve02 | 10.0.2.42 | root |

IPs und Specs: [Hosts und IPs](./hosts-und-ips.md)

## HashiCorp Server-VMs

| VM | IP | Benutzer |
| :--- | :--- | :--- |
| vm-nomad-server-04 | 10.0.2.104 | sam |
| vm-nomad-server-05 | 10.0.2.105 | sam |
| vm-nomad-server-06 | 10.0.2.106 | sam |

## HashiCorp Client-VMs

| VM | IP | Benutzer |
| :--- | :--- | :--- |
| vm-nomad-client-04 | 10.0.2.124 | sam |
| vm-nomad-client-05 | 10.0.2.125 | sam |
| vm-nomad-client-06 | 10.0.2.126 | sam |

## Infrastruktur-VMs

| VM | IP | Benutzer | Bemerkung |
| :--- | :--- | :--- | :--- |
| vm-proxy-dns-01 | 10.0.2.1 | sam | Primary DNS, Traefik |
| vm-vpn-dns-01 | 10.0.2.2 | sam | Secondary DNS, VPN |
| checkmk | 10.0.2.150 | sam | Monitoring |
| pbs-backup-server | 10.0.2.50 | root | Proxmox Backup Server |
| datacenter-manager | 10.0.2.60 | root | Proxmox Datacenter Manager |

## IoT-VMs

| VM | IP | Benutzer | Bemerkung |
| :--- | :--- | :--- | :--- |
| homeassistant | 10.0.0.100 | -- | Kein SSH, Web-UI und CLI via Proxmox Console |
| zigbee-node | 10.0.0.110 | sam | Zigbee2MQTT, Mosquitto |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- Vollständige IP-Tabelle
- [Proxmox](../proxmox/) -- Virtualisierungsplattform
- [Credentials](./credentials.md) -- Token-Speicherorte
