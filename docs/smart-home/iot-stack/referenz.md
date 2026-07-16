---
title: IoT Referenz
description: Mosquitto MQTT Broker als zentraler Message Broker für IoT-Geräte
tags:
  - iot
  - mqtt
  - mosquitto
  - linstor
  - referenz
---

# IoT Referenz

## Mosquitto Übersicht

- **Deployment:** Nomad Job (`services/mosquitto.nomad`)
- **Consul Services:** `mosquitto` (MQTT), `mosquitto-websocket` (WS)
- **Ports:** 1883 (MQTT), 9001 (WebSocket)
- **Config:** Nomad Template (embedded `mosquitto.conf`)
- **Data-Storage:** Linstor CSI Volume (`mosquitto-data`)
- **passwd:** Nomad Template aus Vault `kv/mosquitto` (alloc-dir, SIGHUP-Hot-Reload)

## Rolle im Stack

Mosquitto ist der zentrale MQTT Message Broker für alle IoT-Komponenten. Zigbee2MQTT publiziert Gerätedaten über Mosquitto, Home Assistant subscribt auf die Topics für die Hausautomation.

Architektur-Diagramm: [IoT Stack](./index.md).

## MQTT-Benutzer

Jeder Client hat einen eigenen Benutzer im Mosquitto `passwd`-File. Credentials sind in 1Password (Vault "PRIVAT Agent") hinterlegt.

- **z2m** -- Zigbee2MQTT (Nomad-Container auf vm-nomad-client-06). Credentials werden per Nomad Template aus Vault (`kv/zigbee2mqtt`) als `ZIGBEE2MQTT_CONFIG_MQTT_USER` / `..._PASSWORD` env-vars in den Container injiziert. Kein Klartext in der `configuration.yaml`.
- **homeassistant** -- Home Assistant (eigene VM, siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md)). Credentials in `core.config_entries` (storage-file, nicht Vault -- HA läuft nicht auf Nomad).

## Storage

- **Config:** `/mosquitto/config/mosquitto.conf` -- Nomad Template (embedded im Job)
- **Daten (Persistence):** `/mosquitto/data` -- Linstor CSI Volume (`mosquitto-data`)
- **passwd:** `/mosquitto/config/passwd` -- Nomad Template aus Vault `kv/mosquitto` (alloc-dir bind-mount, `change_signal = SIGHUP` für Hot-Reload)

Logs werden direkt auf stdout geschrieben und von Nomad eingesammelt -- kein separates Log-Volume nötig.

## Netzwerk

Mosquitto läuft im Bridge-Netzwerkmodus mit zwei statischen Ports (Protokolle und Consul-Service-Namen siehe [Ports und Dienste](../../_referenz/ports-und-dienste.md)). Aufgelöst werden sie über `mosquitto.service.consul:1883` (MQTT) bzw. `mosquitto-websocket.service.consul:9001` (WebSocket).

## Zigbee2MQTT-Konfiguration

- **Zigbee-Kanal:** Kanal 25 ist konfiguriert, um Interferenzen mit dem 2.4-GHz-WLAN zu vermeiden.
- **udev (read-only):** `/run/udev` im Container, auf Host `/run/udev` -- für USB-Adapter-Erkennung

## Verwandte Seiten

- [IoT Stack](./index.md) -- Zigbee2MQTT und IoT-Architektur
- [IoT Betrieb](./betrieb.md) -- Passthrough, Pairing, Backup, Rotation, Benutzeranlage
- [DNS](../../dns/) -- Consul DNS für `mosquitto.service.consul`
- [Linstor](../../storage/linstor/index.md) -- CSI Storage für Persistence-Daten
- [NAS Storage](../../storage/nas/) -- NFS für Zigbee2MQTT-Datenpfade
