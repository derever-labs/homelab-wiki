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

- **Status:** Produktion
- **Deployment:** Nomad Job (`services/mosquitto.nomad`)
- **Consul Services:** `mosquitto` (MQTT), `mosquitto-websocket` (WS)
- **Ports:** 1883 (MQTT), 9001 (WebSocket)
- **Config:** Nomad Template (embedded `mosquitto.conf`)
- **Data-Storage:** Linstor CSI Volume (`mosquitto-data`)
- **passwd:** NFS `/nfs/docker/mosquitto/config/passwd` (read-only, PBKDF2-SHA512 Hashes)

## Rolle im Stack

Mosquitto ist der zentrale MQTT Message Broker für alle IoT-Komponenten. Zigbee2MQTT publiziert Gerätedaten über Mosquitto, Home Assistant subscribt auf die Topics für die Hausautomation.

```d2
direction: right

Z2M: Zigbee2MQTT { style.border-radius: 8; tooltip: "User: z2m" }
MQ: "Mosquitto Port 1883" { style.border-radius: 8; tooltip: "Port 1883 (MQTT), Port 9001 (WebSocket)\nConsul: mosquitto.service.consul" }
HA: "Home Assistant" { style.border-radius: 8; tooltip: "User: homeassistant\nVM 1000, 10.0.0.100" }
WS: Web-Clients { style.border-radius: 8 }

Z2M -> MQ: Publish
MQ -> HA: Subscribe
MQ -> WS: WebSocket 9001
```

## MQTT-Benutzer

Jeder Client hat einen eigenen Benutzer im Mosquitto `passwd`-File. Credentials sind in 1Password (Vault "PRIVAT Agent") hinterlegt.

- **z2m** -- Zigbee2MQTT (Nomad-Container auf vm-nomad-client-06). Credentials werden per Nomad Template aus Vault (`kv/zigbee2mqtt`) als `ZIGBEE2MQTT_CONFIG_MQTT_USER` / `..._PASSWORD` env-vars in den Container injiziert. Kein Klartext in der `configuration.yaml`.
- **homeassistant** -- Home Assistant (VM 1000 auf Proxmox, 10.0.0.100). Credentials in `core.config_entries` (storage-file, nicht Vault -- HA laeuft nicht auf Nomad).
- **sam** -- Legacy-User (inaktiv, historisch)

::: tip Vault als Single Source of Truth fuer z2m
`kv/zigbee2mqtt` enthaelt `mqtt_user` und `mqtt_password`. Password-Rotation = Vault-Update + z2m-Restart (Nomad rendert Template neu). Der Nomad-Job verwendet die `nomad-workloads`-Policy mit Workload-Identity-Scope auf die Job-ID.
:::

## Storage

- **Config:** `/mosquitto/config/mosquitto.conf` -- Nomad Template (embedded im Job)
- **Daten (Persistence):** `/mosquitto/data` -- Linstor CSI Volume (`mosquitto-data`)
- **passwd:** `/mosquitto/config/passwd` -- NFS `/nfs/docker/mosquitto/config/passwd` (read-only)

Logs werden direkt auf stdout geschrieben und von Nomad eingesammelt -- kein separates Log-Volume nötig.

::: warning passwd-Datei bearbeiten
Die passwd-Datei liegt auf NFS und ist im Container read-only gemountet. Neue Benutzer werden via `mosquitto_passwd` im laufenden Container erzeugt und per `tee -a` an die NFS-Datei angehängt (inode-safe, Bind-Mount bleibt intakt). Danach SIGHUP an den Container-Prozess senden zum Reload.
:::

## Netzwerk

Mosquitto läuft im Bridge-Netzwerkmodus mit zwei statischen Ports:

- **1883** -- Standard-MQTT-Port für Broker-Kommunikation (TCP)
- **9001** -- WebSocket-Port für browserbasierte MQTT-Clients

Beide Ports sind als Consul Services registriert und können über `mosquitto.service.consul:1883` bzw. `mosquitto-websocket.service.consul:9001` aufgelöst werden.

## Ressourcen

Ressourcen: Siehe Nomad-Job `services/mosquitto.nomad`.

## Verwandte Seiten

- [IoT Stack](./index.md) -- Zigbee2MQTT und IoT-Architektur
- [DNS](../dns/) -- Consul DNS für `mosquitto.service.consul`
- [Linstor](../linstor-storage/index.md) -- CSI Storage für Persistence-Daten
- [NAS Storage](../nas-storage/) -- NFS für passwd-Datei
