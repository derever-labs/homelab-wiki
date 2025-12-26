---
title: Zigbee
description:
published: true
date: 2025-12-26T17:52:12+00:00
tags:
editor: markdown
dateCreated: 2025-12-26T17:52:12+00:00
---

## Übersicht

- **Zigbee2MQTT Server**: 10.0.0.110 (VM zigbee-node)
- **Home Assistant**: 10.0.0.100 (VM homeassistant)

## Architektur

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Zigbee Devices │    │   Zigbee2MQTT    │    │ Home Assistant  │
│                 │◄──►│  10.0.0.110      │◄──►│  10.0.0.100     │
│  40+ Devices    │    │  + Mosquitto     │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Services

### Zigbee2MQTT (10.0.0.110)

| Service | URL/Port |
|---------|----------|
| Web Interface | http://10.0.0.110:8080 |
| MQTT Broker | mosquitto:1883 (intern) |
| USB Adapter | Silicon Labs CP210x (/dev/ttyUSB0) |

### Portainer (10.0.0.110)

| Service | URL |
|---------|-----|
| Web Interface | http://10.0.0.110:9000 |
| Funktion | Docker Container Management |

### Home Assistant (10.0.0.100)

| Service | URL |
|---------|-----|
| Web Interface | http://10.0.0.100:8123 |
| MQTT Integration | Verbindung zu 10.0.0.110:1883 |
| SSH | Port 2222 (SSH Add-on) |

## Quick Start

```bash
# Services starten
ssh sam@10.0.0.110
cd docker
docker-compose up -d

# Status prüfen
docker ps
docker logs zigbee2mqtt
docker logs mosquitto
```

## Verzeichnisstruktur

```
zigbee-homeassistant/
├── README.md                        # Übersicht
├── SETUP.md                         # Vollständige Installation
├── TROUBLESHOOTING.md               # Problembehandlung
├── configurations/                  # Docker Setup
│   ├── docker-compose.yml           # Docker Compose Stack
│   ├── mosquitto.conf               # MQTT Broker Config
│   ├── configuration.yaml           # Zigbee2MQTT Config
│   └── start.sh                     # Start-Script
└── old-backup-device-database/      # Archiv: 40+ migrierte Geräte
```

## SSH Zugang

```bash
# Zigbee VM
ssh sam@10.0.0.110

# Home Assistant (Port 2222)
ssh root@10.0.0.100 -p 2222
```

## Troubleshooting

```bash
# Logs prüfen
docker logs zigbee2mqtt
docker logs mosquitto

# USB Adapter prüfen
ls -la /dev/ttyUSB*
dmesg | grep -i usb
```
