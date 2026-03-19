---
title: Zigbee2MQTT
description: Zigbee-to-MQTT Bridge als Nomad Job mit USB-Dongle Passthrough
tags:
  - service
  - iot
  - zigbee
  - nomad
---

# Zigbee2MQTT

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [zigbee.ackermannprivat.ch](https://zigbee.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/zigbee2mqtt.nomad`) |
| **Image** | `koenkk/zigbee2mqtt:latest` (via lokale Registry) |
| **Node** | `vm-nomad-client-06` (Constraint -- USB Dongle angeschlossen) |
| **USB Dongle** | Sonoff Zigbee 3.0 USB Dongle Plus |
| **MQTT Broker** | [Mosquitto](./mosquitto.md) (separater Nomad Job) |
| **Storage** | NFS `/nfs/docker/zigbee2mqtt/data` |
| **Auth** | `admin-chain-v2@file` (OAuth Admin) |
| **Priority** | 100 (IoT Infrastruktur) |

## Architektur

Zigbee2MQTT verbindet Zigbee-Geräte über einen USB-Koordinator mit dem MQTT-Protokoll. Der USB-Dongle ist physisch an `vm-nomad-client-06` angeschlossen und wird per Device-Passthrough in den Container durchgereicht. Mosquitto läuft als separater Nomad Job (siehe [Mosquitto](./mosquitto.md)).

```mermaid
flowchart LR
    ZD:::entry["Zigbee-Geräte<br>(Sensoren, Schalter)"]
    ZD -->|"Zigbee (CH 25)"| USB:::svc["USB Dongle<br>Sonoff 3.0"]
    USB --> Z2M:::accent["Zigbee2MQTT<br>(client-06)"]
    Z2M -->|MQTT Publish| MQ:::svc["Mosquitto<br>(Nomad Job)"]
    MQ -->|MQTT Subscribe| HA:::svc["Home Assistant<br>(zukuenftig)"]
    Admin:::entry["Admin"] -->|HTTPS| Z2M

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## USB Device Passthrough

Der Sonoff Zigbee 3.0 USB Dongle Plus ist an `vm-nomad-client-06` angeschlossen. Der Nomad Job referenziert das Gerät über seinen stabilen Pfad unter `/dev/serial/by-id/` und mappt es im Container auf `/dev/ttyUSB0`.

::: warning Node-Bindung
Zigbee2MQTT ist fest an `vm-nomad-client-06` gebunden (Hard Constraint), weil der USB-Dongle physisch dort steckt. Ein Failover auf andere Nodes ist nicht möglich ohne den Dongle umzustecken.
:::

## Konfiguration

### Zigbee-Kanal

Kanal 25 ist konfiguriert, um Interferenzen mit dem 2.4-GHz-WLAN zu vermeiden.

### Storage

| Mount | Pfad im Container | Pfad auf Host |
| :--- | :--- | :--- |
| Daten + Config | `/app/data` | `/nfs/docker/zigbee2mqtt/data` |
| udev (read-only) | `/run/udev` | `/run/udev` |

## Wartung

### Gerät anlernen (Pairing)

1. Im Web-Frontend (`zigbee.ackermannprivat.ch`) **Permit Join** aktivieren
2. Gerät in Pairing-Modus versetzen
3. Warten bis das Gerät erscheint, dann **Permit Join** deaktivieren

### Troubleshooting

Falls der USB-Stick nicht erkannt wird: prüfen ob das Device unter `/dev/serial/by-id/` auf dem Host (`vm-nomad-client-06`) erscheint. Bei Proxmox-VMs muss das USB-Gerät in der VM-Konfiguration durchgereicht sein.

## Abhängigkeiten

- [Mosquitto](./mosquitto.md) -- MQTT Broker
- NFS (Synology) -- Config und Daten
- USB-Passthrough -- Physischer Dongle an `vm-nomad-client-06`

## Verwandte Seiten

- [Mosquitto](./mosquitto.md) -- MQTT Broker für Zigbee-Nachrichten
- [Storage NAS](../../infrastructure/storage-nas.md) -- NFS-Speicher für Konfiguration und Daten
- [Traefik Reverse Proxy](../core/traefik.md) -- Ingress mit admin-chain-v2 für Web-Frontend