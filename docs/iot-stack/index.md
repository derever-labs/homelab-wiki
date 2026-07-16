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

Zigbee2MQTT verbindet Zigbee-Geräte über einen USB-Koordinator mit dem MQTT-Protokoll.

## Übersicht

| Attribut | Wert |
|---|---|
| URL | [zigbee.ackermannprivat.ch](https://zigbee.ackermannprivat.ch) |
| Deployment | Nomad Job `services/zigbee2mqtt.nomad` |
| Node | `vm-nomad-client-06` (Hard Constraint -- USB Dongle angeschlossen) |
| USB Dongle | Sonoff Zigbee 3.0 USB Dongle Plus (ZStack3x0, CP210x) |
| MQTT Broker | Mosquitto (separater Nomad Job, siehe [IoT Referenz](./referenz.md)) |
| Storage | NFS `/nfs/docker/zigbee2mqtt/data` |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Secrets | Vault `kv/zigbee2mqtt` (MQTT-Credentials) |

## Rolle im Stack

Der USB-Dongle ist physisch an `vm-nomad-client-06` angeschlossen und wird per Device-Passthrough in den Container durchgereicht. Mosquitto läuft als separater Nomad Job (siehe [IoT Referenz](./referenz.md)). Home Assistant (VM auf Proxmox) subscribt auf die MQTT-Topics und integriert die Zigbee-Geräte in die Hausautomation.

## Architektur

```d2
direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

ZD: "Zigbee-Geräte\n(Sensoren, Schalter)" { class: node }

C06: "vm-nomad-client-06" {
  class: container
  USB: "USB-Dongle\nSonoff Zigbee 3.0" { class: node }
  Z2M: "Zigbee2MQTT\n(Nomad)" { class: node }
  USB -> Z2M: Device-Passthrough
}

MQ: "Mosquitto\n(Nomad, MQTT)" { class: node }
HA: "Home Assistant\n(VM auf Proxmox)" { class: node }
Admin: "Admin" { class: node }

ZD -> C06.USB: Zigbee
C06.Z2M -> MQ: MQTT Publish
MQ -> HA: MQTT Subscribe
Admin -> C06.Z2M: HTTPS via Traefik
```

## Betrieb

USB-Passthrough, Pairing, Troubleshooting, Backup, Passwort-Rotation und Benutzeranlage sind im [IoT Betrieb](./betrieb.md) beschrieben. Konfigurationswerte (Zigbee-Kanal, udev-Mount) stehen in der [IoT Referenz](./referenz.md).

## Verwandte Seiten

- [IoT Betrieb](./betrieb.md) -- Passthrough, Pairing, Backup, Rotation
- [IoT Referenz](./referenz.md) -- Mosquitto MQTT Broker Details
- [NAS Storage](../storage/nas/) -- NFS-Speicher für Konfiguration und Daten
- [Traefik](../edge/traefik/) -- Ingress mit intern-auth für Web-Frontend
