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

## SSH-Ports

Im Homelab sind drei SSH-Ports mit klar getrennter Funktion im Einsatz:

| Port | Funktion | Hosts |
| :--- | :--- | :--- |
| 22 | Standard-SSH | Proxmox-Nodes, HashiCorp-VMs, Infrastruktur-VMs, Home-Assistant-VMs |
| 2222 | Gitea-SSH (Git über SSH) | Nomad-Clients (Consul-Service `gitea-ssh`) |
| 22222 | HAOS Developer-SSH | -- (bewusst nicht verwendet) |

Port 2222 ist ausschliesslich der Gitea-Daemon (siehe [Gitea](../gitea/)) und läuft auf den Nomad-Clients, nicht auf einer HA-VM -- gleicher Port, anderer Host. Der HAOS-eigene Developer-SSH (22222) wird **nicht** genutzt: Er lässt sich nur über ein `CONFIG`-beschriftetes Medium aktivieren und ist damit nicht fernkonfigurierbar.

### Home-Assistant-VMs (HAOS)

Alle Home-Assistant-Instanzen nutzen denselben SSH-Standard über das Add-on **«Advanced SSH & Web Terminal»** (slug `a0d7b954_ssh`):

- **Port 22**, ausschliesslich Key-Authentifizierung, Benutzer `hassio`
- Dedizierter Schlüssel `haos_ed25519` (1Password: PRIVAT Agent / Item «HAOS SSH Key»)
- **Protection-Mode deaktiviert**, damit die `ha`-CLI die Supervisor-API erreicht
- `ha`-Kommandos brauchen eine Login-Shell: `ssh -i ~/.ssh/haos_ed25519 -p 22 hassio@<ip> 'bash -lc "ha ..."'`

Diese Konvention gilt standortübergreifend. Lenzburg ist im Homelab dokumentiert; Luzern und Dottikon sind eigene Standorte (separate Standort-Doku):

| Standort | HA-VM | Proxmox-Host |
| :--- | :--- | :--- |
| Lenzburg (Homelab) | 10.0.0.100 | pve02 |
| Luzern | 172.16.0.163 | pve-lu-01 |
| Dottikon | 192.168.3.247 | pve-01-nana |

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
| homeassistant | 10.0.0.100 | hassio | SSH via Add-on «Advanced SSH & Web Terminal», Port 22, Key-only -- siehe [SSH-Ports](#ssh-ports) |
| ~~zigbee-node~~ | ~~10.0.0.110~~ | ~~sam~~ | ~~Dekomissioniert 2026-04-17~~ |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- Vollständige IP-Tabelle
- [Proxmox](../proxmox/) -- Virtualisierungsplattform
- [Credentials](./credentials.md) -- Token-Speicherorte
