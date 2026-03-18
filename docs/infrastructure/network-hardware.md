---
title: Netzwerk-Hardware
description: UniFi Switches, Access Points und Verkabelung
tags:
  - infrastructure
  - network
  - hardware
  - unifi
---

# Netzwerk-Hardware

::: warning Unvollständig
Diese Seite ist ein Platzhalter. Folgende Details müssen noch ergänzt werden:
- UniFi Switch Modelle und Anzahl Ports
- UniFi Access Points (Modell, Standort, Abdeckung)
- UniFi Controller Version und Standort (Cloud Key, VM, etc.)
- Router-Modell und Firmware
- VLAN-Konfiguration am Switch (Tagged/Untagged Ports)
- Patchfeld-Belegung
- Kabelinfrastruktur (Cat6/Cat6a, Verlegung)
- PoE-Budget und Nutzung
:::

## Router

| Eigenschaft | Wert |
| :--- | :--- |
| Modell | unbekannt |
| Firmware | unbekannt |
| WAN | unbekannt |
| LAN-Ports | unbekannt |

## Switches

| Switch | Modell | Ports | PoE | Standort |
| :--- | :--- | :--- | :--- | :--- |
| unbekannt | unbekannt | unbekannt | unbekannt | unbekannt |

## Access Points

| AP | Modell | Standort | Band | PoE |
| :--- | :--- | :--- | :--- | :--- |
| unbekannt | unbekannt | unbekannt | unbekannt | unbekannt |

## UniFi Controller

| Eigenschaft | Wert |
| :--- | :--- |
| Typ | unbekannt (Cloud Key / VM / Docker) |
| Version | unbekannt |
| URL | unbekannt |

## VLAN-Konfiguration

Netzwerk-Segmente und Subnetz-Zuordnung: [Netzwerk-Topologie](../architecture/network-topology.md)

| VLAN ID | Name | Subnetz | Beschreibung | Switch-Ports |
| :--- | :--- | :--- | :--- | :--- |
| - | Management | 10.0.2.0/24 | VMs, Proxmox, Services | unbekannt |
| - | IoT | 10.0.0.0/24 | Home Assistant, Zigbee, NAS | unbekannt |

## Patchfeld

| Port | Ziel | Kabeltyp | Bemerkung |
| :--- | :--- | :--- | :--- |
| - | - | - | Daten müssen ergänzt werden |

## Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
| :--- | :--- | :--- | :--- |
| pve01 <-> pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -> Switch | unbekannt | unbekannt | - |
