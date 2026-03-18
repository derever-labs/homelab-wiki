---
title: 10GbE Netzwerk Optimierung
description: Performance-Tuning fuer VirtIO und Thunderbolt
tags:
  - platform
  - networking
  - performance
---

# Netzwerk Performance & Tuning

Analyse und durchgefuehrte Optimierungen fuer die 10GbE- und Thunderbolt-Verbindungen.

## Konfiguration

### Proxmox Hosts

| Host | Interface | Link Speed | Status |
|------|-----------|------------|--------|
| pve00 | enp5s0 | 1 Gbps | Nur 1Gbps verfuegbar |
| pve01 | enp2s0 | 10 Gbps | Aktiv |
| pve02 | enp2s0 | 10 Gbps | Aktiv |

### Thunderbolt Netzwerk (pve01 <-> pve02)

| Komponente | MTU | Offloading | Status |
|------------|-----|------------|--------|
| bond-tb (active-backup) | 9000 | TSO/GSO/GRO off | Aktiv |
| vmbr-tb (Bridge) | 9000 | TSO/GSO/GRO off | Aktiv |
| thunderbolt0/1 (Slaves) | 9000 | - | Slave im Bond |

## Benchmark-Ergebnisse

### 10GbE (vmbr0, enp2s0)

| Route | Bandbreite | Retransmits | Status |
|-------|------------|-------------|--------|
| pve02 -> pve01 (Host-to-Host) | ~9.4 Gbps | ~1,500 | Optimal |
| client-06 -> client-05 (VM-to-VM) | ~9.2 Gbps | ~15,000 | Akzeptabel |

*Gemessen: 26.12.2025*

### Thunderbolt (vmbr-tb, bond-tb active-backup)

| Route | Streams | Bandbreite | Retransmits | Status |
|-------|---------|------------|-------------|--------|
| pve01 -> pve02 (Host-to-Host) | 1 | **14.9 Gbps** | 22 | Peak |
| pve01 -> pve02 (Host-to-Host) | 4 | 12.0 Gbps | 29 | Optimal |
| pve01 -> pve02 (Host-to-Host) | 8 | 12.1 Gbps | 34 | Optimal |
| client-05 -> client-06 (VM-to-VM) | 4 | 12.2 Gbps | 294 | Gut |
| client-05 -> client-06 (VM-to-VM) | 8 | 11.0 Gbps | 109 | Gut |

Der Single-Stream-Durchsatz (14.9 Gbps) ist deutlich hoeher als Multi-Stream (~12 Gbps). Das ist relevant, weil typische Workloads wie DRBD-Replikation und Live-Migration primaer Single-Stream sind — dort wird also die volle Leistung genutzt.

*Gemessen: 22.02.2026, iperf3 -t 5/10, MTU 9000*

## Thunderbolt-Treiber Limitierung

TB4 unterstuetzt 40 Gbps pro Kabel (20 Gbps je Richtung nach Encoding-Overhead). Der Linux `thunderbolt-net` Kernel-Treiber nutzt jedoch nur **eine einzige RX/TX-Queue**. Damit ist die gesamte Paketverarbeitung an einen CPU-Core gebunden.

### Warum nicht schneller?

- **Single DMA-Ring**: Der Treiber hat genau eine TX- und eine RX-Queue
- **Single NAPI**: Alle Interrupts werden von einem Core verarbeitet
- **Kein Multi-Queue-Patch**: Es existiert kein Patch oder RFC dafuer, und der bisherige Intel-Maintainer (Mika Westerberg) hat Intel 2024 verlassen
- **~15 Gbps ist der bekannte Praxiswert** fuer TB4 auf Linux (Intel NUC 13 Pro erreicht bis ~26 Gbps, MS-01 typisch ~15 Gbps)

### Getestete Tuning-Massnahmen

| Massnahme | Ergebnis |
|-----------|----------|
| IRQ-Pinning auf P-Cores | TB-IRQs liegen bereits auf P-Cores (CPU 4/5) — kein Handlungsbedarf |
| RPS (Receive Packet Steering) | Kein messbarer Unterschied — Bottleneck ist im DMA-Ring, nicht im Softirq |
| e2e Flow-Control | Bereits aktiv (Standardwert seit Kernel 6.1) |
| MTU 9000 | Bereits gesetzt, hoeher als 9000 fuehrt zu Paketverlusten unter Last |
| Offloading deaktiviert | Bereits gesetzt, noetig fuer Bridge-Performance |

### Moegliche zukuenftige Verbesserungen

| Ansatz | Erwartung | Status |
|--------|-----------|--------|
| Bond mit `balance-rr` statt `active-backup` | ~25-30 Gbps (beide Kabel aktiv), aber TCP-Reordering | Moeglich, aber riskant fuer DRBD |
| SFP+ DAC Kabel (2x 10G) | 20 Gbps aggregiert, Multi-Queue-Treiber, keine Single-Core-Limitierung | Alternative zu TB |
| RDMA ueber Thunderbolt 5 | 40+ Gbps, Sub-50us Latenz | Nur TB5, Linux-Support geschaetzt 6-12 Monate |
| Multi-Queue thunderbolt-net Patch | Theoretisch ~30 Gbps | Existiert nicht, niemand arbeitet daran |

## Durchgefuehrte Optimierungen

### 1. Multiqueue fuer net0 (Proxmox)
VirtIO Multiqueue auf beiden Nomad-Client-VMs aktiviert (queues=8).

### 2. TCP Buffer Tuning (VMs)
Konfiguration in `/etc/sysctl.d/99-network-tuning.conf` erhoeht die TCP Window Sizes und aktiviert BBR Congestion Control.

### 3. Offloading-Einstellungen
TSO/GSO/GRO deaktiviert auf Bond, Bridge und in VMs fuer bessere Bridge-Performance und weniger Retransmits.

### 4. MTU 9000 auf Thunderbolt
Alle Thunderbolt-Komponenten (Slaves, Bond, Bridge) nutzen MTU 9000 (Jumbo Frames).

### 5. Thunderbolt Bond (active-backup)
Seit 22.02.2026 werden beide TB-Interfaces in einem Bond aggregiert. Loest das Problem der nicht-deterministischen Interface-Benennung nach Reboots.

## Hinweise

- Host-to-Host Performance ist besser als VM-to-VM, was bei VirtIO normal ist.
- Fuer kritische Anwendungen (DRBD-Replikation, Live-Migration) wird der Thunderbolt-Pfad (10.99.1.x) bevorzugt — dort sind ~15 Gbps Single-Stream verfuegbar.
- Die Proxmox Migration ist auf das Thunderbolt-Netzwerk konfiguriert (10.99.1.0/24).
- Ein Wechsel auf `balance-rr` Bonding koennte die Multi-Stream-Bandbreite verdoppeln, birgt aber Risiken fuer DRBD durch TCP-Reordering.

---
*Letztes Update: 22.02.2026*
