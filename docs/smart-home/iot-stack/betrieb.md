---
title: IoT Betrieb
description: Betriebshandbuch für den IoT Stack mit Passthrough, Pairing, Backup und Passwort-Rotation
tags:
  - iot
  - zigbee
  - mqtt
  - mosquitto
  - betrieb
---

# IoT Betrieb

Betriebshandbuch für den IoT Stack (Zigbee2MQTT und Mosquitto). Architektur und Übersicht: [IoT Stack](./index.md). Referenzdaten (Konfigurationswerte, Ports, Benutzer): [IoT Referenz](./referenz.md).

## USB Device Passthrough

Der Sonoff Zigbee 3.0 USB Dongle Plus ist an `vm-nomad-client-06` angeschlossen. Der Nomad Job referenziert das Gerät über seinen stabilen Pfad unter `/dev/serial/by-id/` und mappt es im Container auf `/dev/ttyUSB0`.

::: warning Node-Bindung
Zigbee2MQTT ist fest an `vm-nomad-client-06` gebunden (Hard Constraint), weil der USB-Dongle physisch dort steckt. Ein Failover auf andere Nodes ist nicht möglich ohne den Dongle umzustecken.
:::

## Gerät anlernen (Pairing)

1. Im Web-Frontend (`zigbee.ackermannprivat.ch`) **Permit Join** aktivieren
2. Gerät in Pairing-Modus versetzen
3. Warten bis das Gerät erscheint, dann **Permit Join** deaktivieren

## Troubleshooting

Falls der USB-Stick nicht erkannt wird: prüfen ob das Device unter `/dev/serial/by-id/` auf dem Host (`vm-nomad-client-06`) erscheint. Bei Proxmox-VMs muss das USB-Gerät in der VM-Konfiguration durchgereicht sein.

## Backup

Das Verzeichnis `/nfs/docker/zigbee2mqtt/data` enthält drei kritische Dateien:

- **`coordinator_backup.json`** -- Zigbee-Netzwerkschlüssel, IEEE-Adresse, PAN-ID. Ohne dieses Backup muss das gesamte Netz neu gepaart werden.
- **`database.db`** -- Alle bekannten Devices mit friendly names, Gruppen, Scenes.
- **`configuration.yaml`** -- Netzwerk-Konfiguration inkl. MQTT-Credentials.

Backup-Kopien liegen unter `/nfs/backup/zigbee2mqtt/` (datierter Snapshot).

## Passwort-Rotation

::: tip Vault als Single Source of Truth
Der Mosquitto `passwd`-File wird als Nomad Template aus `kv/mosquitto` (Feld `passwd_content`) gerendert -- die PBKDF2-Hashes liegen nicht mehr im NFS-Klartext. Password-Rotation für z2m: (1) `kv/zigbee2mqtt` updaten, (2) neuen Hash in `kv/mosquitto.passwd_content` einfügen, (3) beide Jobs restarten. Mosquitto erhält automatisch SIGHUP zum Reload.
:::

## Benutzeranlage

::: tip Neue Benutzer hinzufügen
1. `mosquitto_passwd` im laufenden Container nutzen (`docker exec ... mosquitto_passwd -c -b /tmp/x user password`), Hash-Zeile auslesen.
2. `vault kv get kv/mosquitto` lesen, neue Zeile anhängen und `passwd_content` per `vault kv put kv/mosquitto` aktualisieren.
3. `nomad alloc restart` auf Mosquitto -- Template wird neu gerendert, SIGHUP löst Reload aus.
:::

## Verwandte Seiten

- [IoT Stack](./index.md) -- Zigbee2MQTT und IoT-Architektur
- [IoT Referenz](./referenz.md) -- Mosquitto und Zigbee2MQTT Referenzdaten
