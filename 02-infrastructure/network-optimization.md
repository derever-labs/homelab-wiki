---
title: 10GbE Netzwerk Optimierung
description: Performance-Tuning für VirtIO und Thunderbolt
published: true
date: 2025-12-26T20:05:00+00:00
tags: infrastructure, networking, performance
editor: markdown
---

# 10GbE Network Optimization

Analyse und durchgeführte Optimierungen für die 10Gbps Netzwerkverbindungen.

## Konfiguration

### Proxmox Hosts

| Host | Interface | Link Speed | Status |
|------|-----------|------------|--------|
| pve00 | enp5s0 | 1 Gbps | Nur 1Gbps verfügbar |
| pve01 | enp2s0 | 10 Gbps | Aktiv |
| pve02 | enp2s0 | 10 Gbps | Aktiv |

### Performance nach Optimierung

| Route | Bandbreite | Retransmits | Status |
|-------|------------|-------------|--------|
| pve02 -> pve01 (Host-to-Host) | ~9.4 Gbps | ~1,500 | Optimal |
| client-06 -> client-05 (VM-to-VM) | ~9.2 Gbps | ~15,000 | Akzeptabel |

## Durchgeführte Optimierungen

### 1. Multiqueue für net0 (Proxmox)
VirtIO Multiqueue wurde auf beiden VMs aktiviert (queues=8).

### 2. TCP Buffer Tuning (VMs)
Konfiguration in `/etc/sysctl.d/99-network-tuning.conf` erhöht die TCP Window Sizes und aktiviert BBR Congestion Control.

### 3. Offloading-Einstellungen (VMs)
TSO/GSO deaktiviert, GRO aktiviert für bessere Retransmit-Werte.

### 4. MTU-Fix auf pve02
Die Bridge `vmbr-tb` (Thunderbolt) nutzt MTU 9000 für Jumbo Frames.

## Hinweise
- Host-to-Host Performance ist besser als VM-to-VM, was bei VirtIO normal ist.
- Für kritische Anwendungen (z.B. Replikation) wird der Thunderbolt-Pfad (10.99.1.x) bevorzugt.

---
*Letztes Update: 26.12.2025*
