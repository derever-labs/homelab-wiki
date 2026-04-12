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

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Deployment** | Nomad Job (`services/mosquitto.nomad`) |
| **Nodes** | `vm-nomad-client-05/06` (Constraint) |
| **Ports** | 1883 (MQTT), 9001 (WebSocket) |
| **Consul Services** | `mosquitto` (MQTT), `mosquitto-websocket` (WS) |
| **Config** | Nomad Template (embedded `mosquitto.conf`) |
| **Data-Storage** | Linstor CSI Volume (`mosquitto-data`) |
| **passwd** | NFS `/nfs/docker/mosquitto/config/passwd` (read-only) |

## Rolle im Stack

Mosquitto ist der zentrale MQTT Message Broker für alle IoT-Komponenten. Zigbee2MQTT publiziert Gerätedaten über Mosquitto, und zukünftige Subscriber (z.B. Home Assistant) konsumieren diese Nachrichten.

```d2
direction: right

Z2M: Zigbee2MQTT { style.border-radius: 8 }
MQ: "Mosquitto Port 1883" { style.border-radius: 8; tooltip: "Port 1883 (MQTT), Port 9001 (WebSocket)" }
HA: "Home Assistant (zukünftig)" { style.border-radius: 8 }
WS: Web-Clients { style.border-radius: 8 }

Z2M -> MQ: Publish
MQ -> HA: Subscribe
MQ -> WS: WebSocket 9001
```

## Storage

| Mount | Pfad im Container | Quelle |
| :--- | :--- | :--- |
| Config | `/mosquitto/config/mosquitto.conf` | Nomad Template (embedded im Job) |
| Daten (Persistence) | `/mosquitto/data` | Linstor CSI Volume (`mosquitto-data`) |
| passwd | `/mosquitto/config/passwd` | NFS `/nfs/docker/mosquitto/config/passwd` (read-only) |

Logs werden direkt auf stdout geschrieben und von Nomad eingesammelt -- kein separates Log-Volume nötig.

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
