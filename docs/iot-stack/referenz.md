---
title: IoT Referenz
description: Mosquitto MQTT Broker als zentraler Message Broker fuer IoT-Geraete
tags:
  - iot
  - mqtt
  - mosquitto
  - referenz
---

# IoT Referenz

## Mosquitto Uebersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Deployment** | Nomad Job (`services/mosquitto.nomad`) |
| **Image** | `eclipse-mosquitto:latest` (via lokale Registry) |
| **Nodes** | `vm-nomad-client-05/06` (Constraint) |
| **Ports** | 1883 (MQTT), 9001 (WebSocket) |
| **Consul Services** | `mosquitto` (MQTT), `mosquitto-websocket` (WS) |
| **Storage** | NFS `/nfs/docker/mosquitto/` |
| **Priority** | 100 (IoT Infrastruktur) |

## Rolle im Stack

Mosquitto ist der zentrale MQTT Message Broker fuer alle IoT-Komponenten. Zigbee2MQTT publiziert Geraetedaten ueber Mosquitto, und zukuenftige Subscriber (z.B. Home Assistant) konsumieren diese Nachrichten.

```mermaid
flowchart LR
    Z2M:::svc["Zigbee2MQTT"] -->|Publish| MQ:::accent["Mosquitto<br>Port 1883"]
    MQ -->|Subscribe| HA:::svc["Home Assistant<br>(zukuenftig)"]
    MQ -->|WebSocket 9001| WS:::entry["Web-Clients"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Storage

| Mount | Pfad im Container | Pfad auf Host |
| :--- | :--- | :--- |
| Config | `/mosquitto/config` | `/nfs/docker/mosquitto/config` |
| Daten (Persistence) | `/mosquitto/data` | `/nfs/docker/mosquitto/data` |
| Logs | `/mosquitto/log` | `/nfs/docker/mosquitto/log` |

## Netzwerk

Mosquitto laeuft im Bridge-Netzwerkmodus mit zwei statischen Ports:

- **1883** -- Standard-MQTT-Port fuer Broker-Kommunikation (TCP)
- **9001** -- WebSocket-Port fuer browserbasierte MQTT-Clients

Beide Ports sind als Consul Services registriert und koennen ueber `mosquitto.service.consul:1883` bzw. `mosquitto-websocket.service.consul:9001` aufgeloest werden.

## Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 128 MHz |
| Memory | 256 MB |

## Verwandte Seiten

- [IoT Stack](./index.md) -- Zigbee2MQTT und IoT-Architektur
- [DNS](../dns/) -- Consul DNS fuer `mosquitto.service.consul`
- [NAS Storage](../nas-storage/) -- NFS-Speicher fuer Config, Daten und Logs
