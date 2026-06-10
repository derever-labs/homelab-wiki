---
title: Home Assistant
description: Home Assistant OS auf Proxmox -- Deployment, Standorte und IoT-Integration via Zigbee2MQTT
tags:
  - home-assistant
  - iot
  - zigbee
  - proxmox
  - haos
---

# Home Assistant

Home Assistant OS (HAOS) läuft als VM auf Proxmox an allen drei Homelab-Standorten. Die primäre Instanz am Hauptstandort Lenzburg integriert Zigbee-Geräte über Zigbee2MQTT und Mosquitto.

## Übersicht

| Attribut | Wert |
|----------|------|
| IP | 10.0.0.100 (Lenzburg) -- weitere Standorte: [Hosts und IPs](../_referenz/hosts-und-ips.md) |
| Deployment | Proxmox VM 1000 (HAOS-Image, bare-metal) |
| Proxmox-Host | pve02 (Lenzburg) |
| SSH | Port 22, User `hassio`, Key `haos_ed25519` (1Password: PRIVAT Agent) |
| MQTT-Integration | Mosquitto via Consul DNS (`mosquitto.service.consul:1883`) |

::: info HAOS -- kein Nomad
HAOS läuft direkt als Proxmox-VM und ist kein Nomad-Job. Updates erfolgen über das HA-eigene Supervisor-System, nicht über Renovate.
:::

## Standorte

Jeder Standort hat eine eigene, unabhängige HAOS-Instanz.

| Standort | VM-Name | IP | Proxmox-Host |
|----------|---------|----|-------------|
| Lenzburg (Hauptstandort) | homeassistant | 10.0.0.100 | pve02 |
| Dottikon (Nana) | homeassistant-dottikon | 192.168.2.x (DHCP) | pve-01-nana |
| Luzern | homeassistant-luzern | 172.16.0.x (DHCP) | pve-lu-01 |

Die Instanzen sind unabhängig voneinander -- kein gemeinsamer State, keine Cross-Cluster-Synchronisation.

## IoT-Integration (Lenzburg)

Die Lenzburger Instanz integriert Zigbee-Geräte über den folgenden Stack:

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

ZD: "Zigbee-Geräte" { style.border-radius: 8 }
USB: "USB Dongle\n(Sonoff 3.0, client-06)" { style.border-radius: 8 }
Z2M: "Zigbee2MQTT\n(Nomad, client-06)" { style.border-radius: 8 }
MQ: "Mosquitto\n(Nomad, MQTT 1883)" { style.border-radius: 8 }
HA: "Home Assistant\n(VM, pve02)" { style.border-radius: 8 }

ZD -> USB: "Zigbee CH 25"
USB -> Z2M
Z2M -> MQ: "MQTT Publish\n(User: z2m)"
MQ -> HA: "MQTT Subscribe\n(User: homeassistant)"
```

- **Zigbee2MQTT:** Nomad-Job auf `vm-nomad-client-06`, USB-Dongle per Device-Passthrough. Details: [IoT Stack](../iot-stack/)
- **Mosquitto:** Nomad-Job, MQTT-Broker für alle IoT-Clients. Details: [IoT Referenz](../iot-stack/referenz.md)
- **MQTT-Credentials:** Mosquitto-User `homeassistant` mit Credentials in `core.config_entries` (HA-Storage, nicht Vault -- HA läuft nicht auf Nomad)

::: info Netzwerk-Segment
Home Assistant kommuniziert mit Mosquitto über das Management-Netz (`10.0.0.0/22`). Der IoT-Netz-VLAN 200 (`10.0.200.0/24`) ist für Zigbee-Geräte und den WLAN-SSID `AirPort-IoT` reserviert -- die HAOS-VM selbst liegt im Management-Netz.
:::

## SSH-Zugang

SSH-Details sind kanonisch in [SSH-Zugang](../_referenz/ssh-zugang.md) geführt. Zusammenfassung:

- Port 22, User `hassio`, Key `haos_ed25519`
- `ha`-CLI-Befehle brauchen eine Login-Shell: `ssh ... 'bash -lc "ha ..."'`
- HAOS-Developer-SSH (Port 22222) wird nicht verwendet -- nicht fernkonfigurierbar

## Verwandte Seiten

- [IoT Stack](../iot-stack/) -- Zigbee2MQTT, USB-Passthrough, Pairing
- [IoT Referenz](../iot-stack/referenz.md) -- Mosquitto MQTT Broker
- [Proxmox](../proxmox/) -- VM-Verwaltung und Standort-Topologie
- [Netzwerk -- Standorte](../netzwerk/standorte.md) -- Netzwerk-Kontext der drei Standorte
- [SSH-Zugang](../_referenz/ssh-zugang.md) -- HAOS-SSH-Details
