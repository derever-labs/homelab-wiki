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

## Infrastruktur-VMs und LXCs

| Host | IP | Benutzer | Bemerkung |
| :--- | :--- | :--- | :--- |
| lxc-dns-01 | 10.0.2.1 | root | Pi-hole DNS (Primary) -- ProxyJump via Proxmox Node |
| lxc-dns-02 | 10.0.2.2 | root | Pi-hole DNS (Secondary) -- ProxyJump via Proxmox Node |
| vm-traefik-01 | 10.0.2.21 | sam | Traefik Node 1 (VIP: 10.0.2.20) |
| vm-traefik-02 | 10.0.2.22 | sam | Traefik Node 2 (VIP: 10.0.2.20) |
| checkmk | 10.0.2.150 | sam | Monitoring |
| pbs-backup-server | 10.0.2.50 | root | Proxmox Backup Server |
| datacenter-manager | 10.0.2.60 | root | Proxmox Datacenter Manager |

::: info ProxyJump für LXCs
LXC-Container sind nicht direkt per SSH erreichbar. Zugriff via ProxyJump über den Proxmox-Host, z.B.:
`ssh -J pve01 root@10.0.2.1`
:::

## UniFi

| Gerät | IP | Benutzer | Auth | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| UDM Pro | 10.0.0.1 | root | keyboard-interactive | Passwort in 1Password (Vault: PRIVAT Agent, Item: Ubiquiti Unifi Konto Ackermann) |

## IoT-VMs

| VM | IP | Benutzer | Bemerkung |
| :--- | :--- | :--- | :--- |
| homeassistant | 10.0.0.100 | -- | Kein SSH, Web-UI und CLI via Proxmox Console |
| ~~zigbee-node~~ | ~~10.0.0.110~~ | ~~sam~~ | ~~Dekomissioniert 2026-04-17~~ |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- Vollständige IP-Tabelle
- [Proxmox](../proxmox/) -- Virtualisierungsplattform
- [Credentials](./credentials.md) -- Token-Speicherorte
