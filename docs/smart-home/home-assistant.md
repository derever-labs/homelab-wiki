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
| Dottikon (Nana) | homeassistant-dottikon | 192.168.3.247 | pve-01-nana |
| Luzern | homeassistant-luzern | 172.16.0.x (DHCP) | pve-lu-01 |

Die Instanzen sind unabhängig voneinander -- kein gemeinsamer State, keine Cross-Cluster-Synchronisation. Die Dottikon-Instanz integriert die Reolink-Kameras des Standorts und trägt den Anker-Capture-Pfad der [Videoüberwachung Dottikon](../storage/ueberwachung-dottikon/).

## IoT-Integration (Lenzburg)

Die Lenzburger Instanz integriert Zigbee-Geräte über den folgenden Stack:

Datenfluss: Zigbee-Geräte -> USB-Dongle (client-06) -> Zigbee2MQTT -> Mosquitto -> Home Assistant. Architektur-Diagramm und Details: [IoT Stack](./iot-stack/).

- **Zigbee2MQTT:** Nomad-Job auf `vm-nomad-client-06`, USB-Dongle per Device-Passthrough. Details: [IoT Stack](./iot-stack/)
- **Mosquitto:** Nomad-Job, MQTT-Broker für alle IoT-Clients. Details: [IoT Referenz](./iot-stack/referenz.md)
- **MQTT-Credentials:** Mosquitto-User `homeassistant` mit Credentials in `core.config_entries` (HA-Storage, nicht Vault -- HA läuft nicht auf Nomad)

::: info Netzwerk-Segment
Home Assistant kommuniziert mit Mosquitto über das Management-Netz (`10.0.0.0/22`). Der IoT-Netz-VLAN 200 (`10.0.200.0/24`) ist für Zigbee-Geräte und den WLAN-SSID `AirPort-IoT` reserviert -- die HAOS-VM selbst liegt im Management-Netz.
:::

## Automationen Lenzburg -- native Packages statt Node-RED

Die Automationslogik der Lenzburger Instanz läuft als native Home-Assistant-Automationen in YAML unter `/config/packages/` (eingebunden über `packages: !include_dir_named packages/`). Node-RED ist ausser Betrieb.

Migriert ist die Waschküchen-Steuerung: `packages/waschkuche.yaml` bündelt sechs Automationen -- die 4x-tägliche Zeitfenster-Lüftung mit Start und Ende, die Feuchte-Schwellwert-Entfeuchtung, die 20-Minuten-Poll-Schleife, die 8-Stunden-Sicherheitsabschaltung und den Taster-Toggle -- samt drei Timer-Helfern und einem Merker-`input_boolean`. Der Quellcode liegt im Gitea-Repo `sam/ha-lenzburg`, nicht im Wiki.

Die übrigen früheren Node-RED-Flows sind nicht nativ nachgebaut: die Werkstatt- und die Samuel-Steuerung wurden als nicht mehr genutzt stillgelegt, und die Pi-hole-Pause läuft über die bestehende native Webhook-Automation `pihole_disable_5min_webhook`, ausgelöst per Portal-Knopf auf intra.ackermannprivat.ch.

### Warum Node-RED abgelöst wurde

Der Node-RED-Baustein `node-red-contrib-home-assistant-websocket` hält sämtliche Entity-States der Instanz im Container-RAM (Full-Entity-Cache). Auf der 3-GB-VM trieb das den Node-RED-Prozess wiederholt über 2 GB RSS, worauf der Kernel-OOM-Killer ihn mehrfach beendete. Jeder OOM-Kill riss die laufenden `delay`- und `trigger`-Timer der Flows mit -- ein angefangener Entfeuchtungs- oder Nachlaufzyklus blieb danach hängen.

Eine RAM-Härtung hätte nur das Symptom behandelt. Die native YAML-Lösung entfernt die Ursache: es läuft kein Full-Entity-Cache-Prozess mehr, und die zustandsbehaftete Logik übersteht einen Neustart.

### Restart-Durabilität

Node-RED verlor bei jedem OOM-Kill alle laufenden Zeitgeber. Damit die native Lösung das nicht erbt, nutzt jede Nachlauf-, Poll- und Maximaldauer-Logik einen Timer-Helfer mit `restore: true`: Der Timer speichert seine absolute Endzeit und stellt sie nach einem HA-Neustart wieder her. Bewusst nicht verwendet für neustart-kritische Pfade sind `script`-`delay` und Automation-`for:` -- beide überstehen einen Neustart nicht.

Nicht jede Logik braucht dafür einen HA-Timer: die Pi-hole-Pause wird extern im Pi-hole selbst gefristet (`pi_hole.disable` mit Dauer), ein HA-Neustart ist dort ohne Belang, und reine Zustand-zu-Aktion-Logik ohne Nachlauf ist ohnehin zustandslos.

## Config-Versionierung

Die Lenzburger und die Luzerner Instanz versionieren ihre `/config` je in einem privaten Gitea-Repo (`sam/ha-lenzburg` bzw. `sam/ha-luzern`). Die Luzerner Instanz pusht nächtlich automatisch einen Config-Snapshot, die Lenzburger wird bei Config-Änderungen manuell committet und gepusht. `.storage`, Secrets und Laufzeit-Dateien sind per `.gitignore` ausgeschlossen (den Vollzustand decken HA- und Proxmox-Backups ab). Der Zugriff läuft über einen Deploy-Key (read-write) je Repo.

Lenzburg erreicht den Gitea-Knoten direkt im Homelab-LAN, die Luzerner Instanz mangels privater Route über das Tailscale-Overlay. Beide Repos teilen denselben Gitea-SSH-Endpoint, der bei einem Nomad-Reschedule wandert -- Transport-Details der Luzerner Instanz und der Umgang mit der Endpoint-Wanderung: [Gitea -- Config-Anbindung HA-Luzern](../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale).

## Überwachung

Alle drei Instanzen sind in [Uptime Kuma](../monitoring/uptime-kuma/index.md) überwacht. Auslöser war ein rund einmonatiger Totalausfall der Luzerner Instanz, der mangels Monitoring unbemerkt blieb.

Die Überwachungsrichtung unterscheidet sich je Standort, weil der Kuma-Container weder die standortfremden LANs noch Tailscale-IPs direkt erreicht:

- **Lenzburg** liegt im selben Homelab-LAN wie der Kuma-Container und wird per HTTP-Probe auf Port 8123 aktiv abgefragt.
- **Luzern und Dottikon** liegen hinter dem Tailscale-Overlay und sind vom Kuma-Container aus nicht erreichbar. Sie kehren die Richtung um und senden einen Push-Heartbeat an Kuma. Da beide Instanzen `uptime.ackermannprivat.ch` öffentlich auflösen (auf eine von aussen nicht nutzbare Adresse), pinnt der Push den Hostnamen per `curl --resolve` auf einen erreichbaren internen Endpunkt: Luzern auf die Keepalived-VIP 10.0.2.20 über eine Subnet-Route, Dottikon auf die Tailscale-IPs der Traefik-Knoten (siehe [Tailscale -- HA-Add-ons an Aussenstandorten](../netz/netzwerk/tailscale.md#ha-tailscale-add-ons-an-aussenstandorten)).

Den vollständigen Coverage-Stand samt Monitor-Zuordnung führt die [Monitoring-Coverage](../monitoring/coverage/index.md).

## SSH-Zugang

SSH-Details sind kanonisch in [SSH-Zugang](../_referenz/ssh-zugang.md) geführt. Zusammenfassung:

- Port 22, User `hassio`, Key `haos_ed25519`
- `ha`-CLI-Befehle brauchen eine Login-Shell: `ssh ... 'bash -lc "ha ..."'`
- HAOS-Developer-SSH (Port 22222) wird nicht verwendet -- nicht fernkonfigurierbar

## Verwandte Seiten

- [IoT Stack](./iot-stack/) -- Zigbee2MQTT, USB-Passthrough, Pairing
- [IoT Referenz](./iot-stack/referenz.md) -- Mosquitto MQTT Broker
- [Proxmox](../infrastruktur/proxmox/) -- VM-Verwaltung und Standort-Topologie
- [Netzwerk -- Standorte](../netz/netzwerk/standorte.md) -- Netzwerk-Kontext der drei Standorte
- [SSH-Zugang](../_referenz/ssh-zugang.md) -- HAOS-SSH-Details
- [CheckMK](../monitoring/checkmk/index.md#haos-memory-check-ssh-forced-command) -- HAOS-Memory-Custom-Check, da HAOS keinen CheckMK-Agent tragen kann
- [Uptime Kuma](../monitoring/uptime-kuma/index.md) -- Verfügbarkeits-Monitoring der drei Instanzen
- [Gitea](../dienste/gitea/index.md#config-anbindung-ha-luzern-uber-tailscale) -- Config-Versionierung der HA-Instanzen
- [Tailscale](../netz/netzwerk/tailscale.md#ha-tailscale-add-ons-an-aussenstandorten) -- accept-routes-Regel der HA-Add-ons an den Aussenstandorten
- [Monitoring-Coverage](../monitoring/coverage/index.md) -- Überwachungs-Stand der HA-Instanzen
