---
title: Smart Home und IoT
description: Big Picture der Hausautomation -- Ereignis- und Kommando-Pfad über Zigbee2MQTT und Mosquitto sowie der Standort-Verbund der drei Home-Assistant-Instanzen
tags:
  - overview
  - iot
  - home-assistant
---

# Smart Home und IoT

Dieses Kapitel bündelt die Hausautomation: Home Assistant OS läuft als VM auf Proxmox an allen drei Standorten, der IoT-Stack liefert mit Zigbee2MQTT und Mosquitto die Geräte-Anbindung über MQTT. Diese Seite ist das Big Picture: zwei Szenario-Diagramme zeigen, wie ein Sensor-Ereignis zur Automation kommt und wie die drei Standorte zusammenhängen.

Die Instanz-Details (Standort-Tabelle, SSH, Netz-Segment) stehen auf [Home Assistant](./home-assistant.md), die IoT-Architektur mit USB-Passthrough auf [IoT Stack](./iot-stack/), die Mosquitto-Details in der [IoT Referenz](./iot-stack/referenz.md).

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Deployment | HAOS-VMs auf Proxmox (drei Standorte) + Nomad-Jobs `services/zigbee2mqtt.nomad`, `services/mosquitto.nomad` |
| Storage | NFS (Zigbee2MQTT-Daten), Linstor CSI (Mosquitto-Persistence) |
| Auth | Zigbee2MQTT-Web-UI hinter `intern-auth@file` (Authentik ForwardAuth) |
| Hosts/IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

### Systeme

| System | Zweck | Details |
| :--- | :--- | :--- |
| **Home Assistant** | Hausautomation -- eine eigenständige HAOS-Instanz pro Standort | [Home Assistant](./home-assistant.md) |
| **Zigbee2MQTT** | Zigbee-Funknetz an MQTT anbinden (USB-Koordinator auf client-06) | [IoT Stack](./iot-stack/) |
| **Mosquitto** | Zentraler MQTT-Broker für alle IoT-Clients | [IoT Referenz](./iot-stack/referenz.md) |

## Das Gesamtbild in zwei Sichten

Die erste Sicht zeigt die Mechanik am Hauptstandort Lenzburg: wie ein Zigbee-Ereignis zur Automation kommt und ein Schaltbefehl zurück zum Gerät. Die zweite Sicht zeigt den Verbund: drei bewusst unabhängige Home-Assistant-Instanzen und die wenigen Kanten, die sie tatsächlich verbinden.

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** Kanten sind asynchron -- ereignisgetriebene Zustellungen über bestehende Verbindungen oder zeitgesteuerte Jobs. Farbe kodiert den Weg: Blau ist der Ereignis- bzw. Einkaufs-Weg, Grün der Kommando-Weg, Violett der Config-Weg.

### Ereignis- und Kommando-Pfad -- vom Sensor zur Automation

**Leitfrage:** Wie kommt ein Sensor-Ereignis vom Zigbee-Funk in eine Home-Assistant-Automation -- und wie kommt ein Schaltbefehl zurück zum Gerät?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  ereignis: { style: { stroke: "#2563eb" } }
  ereignis-async: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  kommando: { style: { stroke: "#16a34a" } }
  kommando-async: { style: { stroke: "#16a34a"; stroke-dash: 3 } }
}

zd: "Zigbee-Geräte" {
  class: node
  tooltip: Sensoren und Schalter im Zigbee-Funknetz
}

c06: "vm-nomad-client-06" {
  class: container
  usb: "USB-Dongle" {
    class: node
    tooltip: Sonoff Zigbee 3.0 USB Dongle Plus, Device-Passthrough in den Container
  }
  z2m: "Zigbee2MQTT (Nomad)" {
    class: node
    tooltip: services/zigbee2mqtt.nomad, Web-UI zigbee.ackermannprivat.ch
  }
}

mq: "Mosquitto (Nomad)" {
  class: node
  tooltip: services/mosquitto.nomad, MQTT 1883 und WebSocket 9001
}

ha: "Home Assistant Lenzburg" {
  class: container
  mqtt: "MQTT-Integration" {
    class: node
    tooltip: MQTT-User homeassistant, verbindet auf mosquitto.service.consul 1883
  }
  auto: "Automationen" { class: node }
}

zd -> c06.usb: 1. Funk-Ereignis (Zigbee) { class: ereignis }
c06.usb -> c06.z2m: 2. seriell in den Container { class: ereignis }
c06.z2m -> mq: 3. publiziert Ereignis (MQTT) { class: ereignis }
mq -> ha.mqtt: 4. stellt Ereignis zu (Subscription) { class: ereignis-async }
ha.mqtt -> ha.auto: 5. Zustandswechsel triggert { class: ereignis }
ha.auto -> mq: 6. publiziert Schaltbefehl (MQTT) { class: kommando }
mq -> c06.z2m: 7. stellt Schaltbefehl zu (Subscription) { class: kommando-async }
c06.z2m -> zd: 8. Zigbee-Funkbefehl über den Dongle { class: kommando }
```

Lesehilfe:

1. Ein Zigbee-Gerät funkt sein Ereignis an den USB-Koordinator -- der Zigbee-Kanal ist bewusst gegen das 2.4-GHz-WLAN gewählt, siehe [IoT Referenz](./iot-stack/referenz.md#zigbee2mqtt-konfiguration).
2. Der Dongle steckt physisch an `vm-nomad-client-06` und wird per [Device-Passthrough](./iot-stack/betrieb.md#usb-device-passthrough) in den Zigbee2MQTT-Container gereicht -- daher die harte Node-Bindung.
3. [Zigbee2MQTT](./iot-stack/) übersetzt das Ereignis und publiziert es beim Broker; die MQTT-Credentials kommen als Vault-Template in den Container ([MQTT-Benutzer](./iot-stack/referenz.md#mqtt-benutzer)).
4. Mosquitto stellt das Ereignis über die bestehende Subscription an die MQTT-Integration von Home Assistant zu -- ereignisgetrieben, darum gestrichelt. Die Geräte erscheinen dank aktivierter MQTT-Discovery automatisch (`homeassistant: true` in der `configuration.yaml`, Repo `infra/zigbee-homeassistant/`).
5. Der Zustandswechsel der Entität triggert die Automationen -- hier wird entschieden, der Rest des Pfads transportiert nur.
6. -- 8. Der Kommando-Weg läuft dieselbe Strecke rückwärts: die Automation publiziert den Schaltbefehl via MQTT, Mosquitto stellt ihn Zigbee2MQTT zu, und der Koordinator funkt ihn ans Gerät.

### Standort-Verbund -- drei Instanzen, ein Overlay

**Leitfrage:** Wie hängen die drei Home-Assistant-Instanzen zusammen -- und welche Kanten verbinden die Standorte wirklich?

Kurze Antwort: Die Instanzen sind [bewusst unabhängig](./home-assistant.md#standorte) -- kein gemeinsamer State, keine Synchronisation. Der IoT-Stack existiert nur in Lenzburg. Standortübergreifend gibt es genau eine System-Kante: den nächtlichen Config-Push der Luzerner Instanz nach Gitea über das Tailscale-Overlay.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  standort: { style: { border-radius: 8; stroke-dash: 4 } }
  ext: { style: { border-radius: 8; stroke-dash: 2 } }
  einkauf: { style: { stroke: "#2563eb" } }
  einkauf-async: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  konfig-async: { style: { stroke: "#7c3aed"; stroke-dash: 3 } }
  kontext: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

lenzburg: "Standort Lenzburg" {
  class: standort
  ha1: "Home Assistant" {
    class: node
    tooltip: HAOS-VM 1000 auf pve02, 10.0.0.100
  }
  iot: "IoT-Stack (Nomad)" {
    class: node
    tooltip: Zigbee2MQTT und Mosquitto, siehe Ereignis- und Kommando-Pfad
  }
  tandoor: "Tandoor (Nomad)" { class: node }
  gitea: "Gitea (Nomad)" { class: node }
}

dottikon: "Standort Dottikon" {
  class: standort
  ha2: "Home Assistant" {
    class: node
    tooltip: HAOS-VM auf pve-01-nana, eigenständig ohne standortübergreifende Integrationen
  }
}

luzern: "Standort Luzern" {
  class: standort
  ha3: "Home Assistant" {
    class: node
    tooltip: HAOS-VM 100 auf pve-lu-01, eigener Tailnet-Client
  }
}

bring: "Bring!-Cloud" { class: ext }

lenzburg.iot -> lenzburg.ha1: MQTT (Ereignis- und Kommando-Pfad) { class: kontext }
lenzburg.tandoor -> lenzburg.ha1: 1. REST todo.add_item / todo.remove_item { class: einkauf }
lenzburg.ha1 <-> bring: 2. Bring!-Integration { class: einkauf-async }
luzern.ha3 -> lenzburg.gitea: 3. nächtlicher Config-Push (Git-SSH via Tailscale) { class: konfig-async }
```

Lesehilfe:

1. [Tandoor](../dienste/tandoor/index.md#einkaufsliste-sync-mit-bring) ruft beim Anlegen oder Löschen eines Einkaufslisten-Eintrags die REST-API der Lenzburger Instanz auf (`todo.add_item` / `todo.remove_item` auf der Todo-Entität).
2. Home Assistant spiegelt die Todo-Liste über die Bring!-Integration in die Bring!-Cloud -- der einzige cloud-abhängige Teil des Smart-Home-Verbunds.
3. Die Luzerner Instanz versioniert ihre `/config` im privaten Gitea-Repo: eine HA-Automation pusht nächtlich über das Tailscale-Overlay direkt auf den Gitea-Node, an Traefik und Authentik vorbei. Details und Warum: [Gitea -- Config-Anbindung HA-Luzern](../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale).

Die Instanz in Dottikon hat keine standortübergreifenden System-Kanten -- sie läuft vollständig autonom. Der Fernzugriff auf alle drei Instanzen läuft über das [Tailscale-Overlay](../netz/netzwerk/tailscale.md): Lenzburg und Dottikon sind über die Subnet-Router ihrer Standorte erreichbar, die Luzerner VM ist zusätzlich selbst Tailnet-Client.

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss:

- **Was, wenn Mosquitto down ist?** Der Ereignis- und Kommando-Pfad ist unterbrochen: Sensor-Ereignisse und Schaltbefehle laufen ins Leere, bis der Broker wieder da ist. Nomad startet den Job neu, die Persistence liegt auf einem Linstor-CSI-Volume ([IoT Referenz](./iot-stack/referenz.md#storage)). Alles ausserhalb von MQTT -- Automationen ohne Zigbee-Trigger, der Tandoor-Bring-Weg -- läuft weiter.

- **Was, wenn Home Assistant (Lenzburg) down ist?** Zigbee2MQTT und Mosquitto laufen weiter, aber niemand wertet aus: Automationen stehen still, und Tandoor-Einträge erreichen Bring! nicht mehr. Sichtbar wird der Ausfall über die Uptime-Kuma-Probe auf Port 8123; die Memory-Innensicht der agentenlosen HAOS-VM liefert ein [CheckMK-Custom-Check über pve02](../monitoring/checkmk/index.md#haos-memory-check-ssh-forced-command). Den Coverage-Stand aller Smart-Home-Komponenten -- auch der noch unüberwachten Aussenstellen-Instanzen -- führt die [Monitoring-Coverage](../monitoring/coverage/).

- **Was, wenn `vm-nomad-client-06` down ist?** Zigbee ist komplett tot: Zigbee2MQTT ist per Hard Constraint an diesen Node gebunden, weil der USB-Dongle physisch dort steckt -- [kein Failover ohne Umstecken](./iot-stack/betrieb.md#usb-device-passthrough).

- **Was, wenn Tailscale down ist?** Alle drei Instanzen arbeiten lokal autonom weiter -- sie teilen keinen State. Es brechen nur der Fernzugriff und der nächtliche Config-Push der Luzerner Instanz; dessen Fehler meldet die HA-Automation selbst per Push aufs Handy ([Gitea -- Config-Anbindung](../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale)).

## Verwandte Seiten

- [Home Assistant](./home-assistant.md) -- Instanzen, Standort-Tabelle, SSH und Netz-Segment
- [IoT Stack](./iot-stack/) -- Zigbee2MQTT-Architektur mit USB-Passthrough
- [IoT Referenz](./iot-stack/referenz.md) -- Mosquitto, MQTT-Benutzer, Zigbee-Konfiguration
- [IoT Betrieb](./iot-stack/betrieb.md) -- Passthrough, Pairing, Backup, Passwort-Rotation
- [Netzwerk -- Standorte](../netz/netzwerk/standorte.md) -- die drei Standorte im Netzwerk-Detail
- [Tailscale](../netz/netzwerk/tailscale.md) -- Overlay, Subnet-Router und der HA-Luzern-Tailnet-Client
- [Gitea](../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale) -- Config-Anbindung der Luzerner Instanz
- [Tandoor](../dienste/tandoor/index.md#einkaufsliste-sync-mit-bring) -- Einkaufslisten-Sync über die HA-REST-API nach Bring!
- [Monitoring-Coverage](../monitoring/coverage/) -- Überwachungs-Stand der Smart-Home-Komponenten
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- IP-Zuordnung aller Standorte
