---
title: Zigbee IoT
description: Zigbee2MQTT und MQTT Broker Setup
published: true
date: 2025-12-26T20:10:00+00:00
tags: service, iot, zigbee
editor: markdown
---

# Zigbee2MQTT Setup

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **VM** | `zigbee-node` (10.0.0.110) |
| **Hardware** | Silicon Labs CP210x USB Stick |
| **Software** | Zigbee2MQTT + Mosquitto |

## Komponenten

### Mosquitto (MQTT Broker)
- **Port:** 1883 (TCP)
- **User:** `mqtt_user` (Passwort in Vault/Keepass)
- **Persistence:** Ja, speichert Nachrichten im `/mosquitto/data/` Verzeichnis.

### Zigbee2MQTT
- **Frontend:** `http://10.0.0.110:8080`
- **Channel:** 25 (zur Vermeidung von WLAN-Interferenzen)
- **USB:** `/dev/ttyUSB0` durchgereicht von Proxmox.

## Wartung

### Gerät anlernen (Pairing)
1. Im Web-Frontend `Permit Join` aktivieren.
2. Gerät in Pairing-Modus versetzen.
3. Warten bis Gerät erscheint, dann `Permit Join` deaktivieren.

### Backups
Regelmässiges Backup des `~/docker` Verzeichnisses auf der VM (enthält alle Configs und die Zigbee-Datenbank).

### Troubleshooting
Falls der Stick nicht erkannt wird:
```bash
lsusb
ls -la /dev/ttyUSB*
```
Berechtigungen prüfen (User muss in `dialout` Gruppe sein).

---
*Letztes Update: 26.12.2025*