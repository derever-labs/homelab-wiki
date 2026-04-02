---
title: IoT Stack
description: Zigbee2MQTT mit USB-Dongle Passthrough und MQTT-Integration
tags:
  - iot
  - zigbee
  - mqtt
  - nomad
---

# IoT Stack

## Uebersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [zigbee.ackermannprivat.ch](https://zigbee.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/zigbee2mqtt.nomad`) |
| **Image** | `koenkk/zigbee2mqtt:latest` (via lokale Registry) |
| **Node** | `vm-nomad-client-06` (Constraint -- USB Dongle angeschlossen) |
| **USB Dongle** | Sonoff Zigbee 3.0 USB Dongle Plus |
| **MQTT Broker** | Mosquitto (separater Nomad Job) |
| **Storage** | NFS `/nfs/docker/zigbee2mqtt/data` |
| **Auth** | `intern-auth@file` (Authentik ForwardAuth Admin) |
| **Priority** | 100 (IoT Infrastruktur) |

## Architektur

Zigbee2MQTT verbindet Zigbee-Geraete ueber einen USB-Koordinator mit dem MQTT-Protokoll. Der USB-Dongle ist physisch an `vm-nomad-client-06` angeschlossen und wird per Device-Passthrough in den Container durchgereicht. Mosquitto laeuft als separater Nomad Job (siehe [IoT Referenz](./referenz.md)).

```mermaid
flowchart LR
    ZD:::entry["Zigbee-Geraete<br>(Sensoren, Schalter)"]
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

Der Sonoff Zigbee 3.0 USB Dongle Plus ist an `vm-nomad-client-06` angeschlossen. Der Nomad Job referenziert das Geraet ueber seinen stabilen Pfad unter `/dev/serial/by-id/` und mappt es im Container auf `/dev/ttyUSB0`.

::: warning Node-Bindung
Zigbee2MQTT ist fest an `vm-nomad-client-06` gebunden (Hard Constraint), weil der USB-Dongle physisch dort steckt. Ein Failover auf andere Nodes ist nicht moeglich ohne den Dongle umzustecken.
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

### Geraet anlernen (Pairing)

1. Im Web-Frontend (`zigbee.ackermannprivat.ch`) **Permit Join** aktivieren
2. Geraet in Pairing-Modus versetzen
3. Warten bis das Geraet erscheint, dann **Permit Join** deaktivieren

### Troubleshooting

Falls der USB-Stick nicht erkannt wird: pruefen ob das Device unter `/dev/serial/by-id/` auf dem Host (`vm-nomad-client-06`) erscheint. Bei Proxmox-VMs muss das USB-Geraet in der VM-Konfiguration durchgereicht sein.

## Verwandte Seiten

- [IoT Referenz](./referenz.md) -- Mosquitto MQTT Broker Details
- [NAS Storage](../nas-storage/) -- NFS-Speicher fuer Konfiguration und Daten
- [Traefik](../traefik/) -- Ingress mit intern-auth fuer Web-Frontend
