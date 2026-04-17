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

Zigbee2MQTT verbindet Zigbee-Geräte über einen USB-Koordinator mit dem MQTT-Protokoll. Der USB-Dongle ist physisch an `vm-nomad-client-06` angeschlossen und per Device-Passthrough in den Container durchgereicht.

## Übersicht

- **URL:** [zigbee.ackermannprivat.ch](https://zigbee.ackermannprivat.ch)
- **Deployment:** Nomad Job `services/zigbee2mqtt.nomad`
- **Node:** `vm-nomad-client-06` (Hard Constraint -- USB Dongle angeschlossen)
- **USB Dongle:** Sonoff Zigbee 3.0 USB Dongle Plus (ZStack3x0, CP210x)
- **MQTT Broker:** Mosquitto (separater Nomad Job, siehe [IoT Referenz](./referenz.md))
- **Storage:** NFS `/nfs/docker/zigbee2mqtt/data`
- **Auth:** `intern-auth@file` (Authentik ForwardAuth)

## Architektur

Zigbee2MQTT verbindet Zigbee-Geräte über einen USB-Koordinator mit dem MQTT-Protokoll. Der USB-Dongle ist physisch an `vm-nomad-client-06` angeschlossen und wird per Device-Passthrough in den Container durchgereicht. Mosquitto läuft als separater Nomad Job (siehe [IoT Referenz](./referenz.md)). Home Assistant (VM auf Proxmox) subscribt auf die MQTT-Topics und integriert die Zigbee-Geräte in die Hausautomation.

```d2
direction: right

ZD: "Zigbee-Geräte (Sensoren, Schalter)" { style.border-radius: 8 }
USB: "USB Dongle Sonoff 3.0" { style.border-radius: 8 }
Z2M: "Zigbee2MQTT (client-06)" { style.border-radius: 8 }
MQ: "Mosquitto (Nomad Job)" { style.border-radius: 8 }
HA: "Home Assistant" { style.border-radius: 8 }
Admin: Admin { style.border-radius: 8 }

ZD -> USB: "Zigbee (CH 25)"
USB -> Z2M
Z2M -> MQ: MQTT Publish
MQ -> HA: MQTT Subscribe
Admin -> Z2M: HTTPS
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

- **Daten + Config:** `/app/data` im Container, auf Host `/nfs/docker/zigbee2mqtt/data` (NFS)
- **udev (read-only):** `/run/udev` im Container, auf Host `/run/udev` -- für USB-Adapter-Erkennung

## Wartung

### Gerät anlernen (Pairing)

1. Im Web-Frontend (`zigbee.ackermannprivat.ch`) **Permit Join** aktivieren
2. Gerät in Pairing-Modus versetzen
3. Warten bis das Gerät erscheint, dann **Permit Join** deaktivieren

### Troubleshooting

Falls der USB-Stick nicht erkannt wird: prüfen ob das Device unter `/dev/serial/by-id/` auf dem Host (`vm-nomad-client-06`) erscheint. Bei Proxmox-VMs muss das USB-Gerät in der VM-Konfiguration durchgereicht sein.

## Backup

Das Verzeichnis `/nfs/docker/zigbee2mqtt/data` enthält drei kritische Dateien:

- **`coordinator_backup.json`** -- Zigbee-Netzwerkschlüssel, IEEE-Adresse, PAN-ID. Ohne dieses Backup muss das gesamte Netz neu gepaart werden.
- **`database.db`** -- Alle bekannten Devices mit friendly names, Gruppen, Scenes.
- **`configuration.yaml`** -- Netzwerk-Konfiguration inkl. MQTT-Credentials.

Backup-Kopien liegen unter `/nfs/backup/zigbee2mqtt/` (datierter Snapshot).

## Verwandte Seiten

- [IoT Referenz](./referenz.md) -- Mosquitto MQTT Broker Details
- [NAS Storage](../nas-storage/) -- NFS-Speicher für Konfiguration und Daten
- [Traefik](../traefik/) -- Ingress mit intern-auth für Web-Frontend
