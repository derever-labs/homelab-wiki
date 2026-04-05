---
title: USV (APC)
description: Unterbrechungsfreie Stromversorgung mit APC USV, NUT Server auf Proxmox und Grafana Monitoring
tags:
  - ups
  - monitoring
  - infrastructure
  - nut
  - grafana
  - proxmox
---

# USV (APC)

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | In Aufbau |
| **Dashboard** | [graf.ackermannprivat.ch](https://graf.ackermannprivat.ch) (UID: `ups-apc-dashboard`) |
| **Deployment** | NUT Server (systemd auf PVE-Host), Telegraf `inputs.upsd` (Nomad) |
| **Alerting** | Grafana Unified Alerting + direkte Telegram-Benachrichtigung via NUT |
| **Protokoll** | SNMP (NMC-Karte) |

## Rolle im Stack

Die APC USV versorgt das gesamte Homelab (Proxmox-Hosts, Netzwerk, NAS) bei Stromausfall mit Batteriestrom. NUT (Network UPS Tools) kommuniziert per SNMP mit der NMC-Karte der USV und koordiniert den geordneten Shutdown aller Hosts bei kritischem Batteriestand. Parallel sammelt Telegraf die USV-Metriken via NUT-Protokoll für das Grafana-Dashboard.

## Architektur

```mermaid
graph LR
    USV["APC USV"]
    NMC["Network Management Card"]
    NUT["NUT Server<br/>(systemd auf PVE Master)"]
    SLAVE1["PVE Slave 1<br/>(upsmon)"]
    SLAVE2["PVE Slave 2<br/>(upsmon)"]
    TEL["Telegraf<br/>(Nomad Job)"]
    INFLUX["InfluxDB"]
    GRAF["Grafana"]
    TG["Telegram"]

    USV -->|"Strom"| NMC
    NMC -->|"SNMP<br/>UDP 161"| NUT
    NUT -->|"NUT Protocol<br/>TCP 3493"| SLAVE1
    NUT -->|"NUT Protocol<br/>TCP 3493"| SLAVE2
    NUT -->|"NUT Protocol<br/>TCP 3493"| TEL
    NUT -->|"NOTIFYCMD"| TG
    TEL --> INFLUX
    INFLUX --> GRAF
    GRAF -->|"Alert Rules"| TG
```

::: warning NUT muss auf dem PVE-Host laufen
NUT darf nicht als Nomad-Container betrieben werden. Bei einem Shutdown fährt Proxmox die Nomad-VMs herunter -- ein NUT-Container würde dabei sterben, bevor er die anderen Hosts benachrichtigen kann.
:::

## Shutdown-Ablauf

```mermaid
sequenceDiagram
    participant USV as APC USV
    participant NUT as NUT Master<br/>(PVE-Host)
    participant S1 as PVE Slave 1
    participant S2 as PVE Slave 2
    participant TG as Telegram

    USV->>NUT: ONBATT (Stromausfall)
    NUT->>TG: Benachrichtigung
    Note over USV: Batterie entlädt sich...
    USV->>NUT: LOWBATT (kritisch)
    NUT->>TG: Benachrichtigung
    NUT->>S1: SHUTDOWN
    NUT->>S2: SHUTDOWN
    S1->>S1: VMs/CTs stoppen
    S2->>S2: VMs/CTs stoppen
    S1->>S1: Host herunterfahren
    S2->>S2: Host herunterfahren
    Note over NUT: FINALDELAY abwarten
    NUT->>NUT: VMs/CTs stoppen
    NUT->>NUT: Host herunterfahren
```

**Reihenfolge:** Slaves fahren zuerst herunter, der Master wartet (`FINALDELAY`) und fährt als Letzter herunter. Proxmox stoppt bei `shutdown -h` automatisch alle VMs und Container graceful.

## NUT-Konfiguration

NUT ist direkt auf den Proxmox-Hosts installiert (kein Container):

- **Master-Host:** `nut` + `nut-snmp` Pakete, Treiber `snmp-ups`, Mode `netserver`
- **Slave-Hosts:** `nut-client` Paket, Mode `netclient`
- **Konfigurationsdateien:** `/etc/nut/` auf den jeweiligen Hosts

Der NUT-Server kommuniziert per SNMP mit der APC NMC-Karte und stellt die USV-Daten auf Port 3493 (NUT-Protokoll) bereit.

::: info NMC-Treiber
Je nach NMC-Modell wird `snmp-ups` (ältere NMC) oder `netxml-ups` (neuere NMC AP9631/AP9641, HTTP/XML) verwendet.
:::

## Monitoring

### Telegraf

Der bestehende Telegraf Nomad Job sammelt USV-Metriken via `inputs.upsd`-Plugin direkt vom NUT-Server. Keine OID-Konfiguration nötig -- NUT normalisiert die SNMP-Werte.

**Measurements:**

- `upsd` -- Batterie-Ladung, Laufzeit, Last, Ein-/Ausgangsspannung, Temperatur, Status

### Grafana Dashboard

Das Dashboard `ups-apc-dashboard` zeigt:

**Status-Bar:** USV-Status, Batterie-Ladung (Gauge), Verbleibende Laufzeit, USV-Last (Gauge), Batterie-Zustand, Temperatur

**Verlauf:** Eingangsspannung, Ausgangsspannung, USV-Last, Batterie-Temperatur, Batterie-Ladung

## Alerting

Zweistufiges Alerting -- direkt via NUT (unabhängig von Nomad-Stack) und via Grafana:

### NUT-Alerts (direkt, via NOTIFYCMD)

Auf jedem Host sendet `/usr/local/bin/ups-notify.sh` Telegram-Nachrichten bei USV-Events. Funktioniert auch wenn der Nomad-Stack bereits heruntergefahren ist.

### Grafana Alert Rules

| Rule | Bedingung | For | Schwere |
| :--- | :--- | :--- | :--- |
| USV auf Batterie | Status enthält "OB" | sofort | Warning |
| Laufzeit < 10 min | battery_runtime < 600s | 1 min | Warning |
| Laufzeit < 5 min | battery_runtime < 300s | sofort | Critical |
| Batterie ersetzen | replace_indicator > 1 | 5 min | Warning |
| USV nicht erreichbar | keine Daten | 2 min | Critical |

::: tip Alerts auf Laufzeit, nicht Prozent
Alerts basieren auf der verbleibenden Laufzeit in Sekunden statt auf Batterie-Prozent. 20% einer degradierten Batterie können nur 30 Sekunden bedeuten.
:::

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Telegraf, InfluxDB, Alerting-Architektur
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Ähnliches Setup (SNMP via Telegraf)
- [Proxmox](../proxmox/index.md) -- Virtualisierungsplattform (Hosts, VMs)
