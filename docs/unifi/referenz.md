---
title: UniFi Referenz
description: Technische Konfigurationsreferenz für das UniFi-Netzwerk -- WLAN, DHCP, Port-Forwards, Firewall und API-Zugang
tags:
  - netzwerk
  - unifi
  - wlan
  - firewall
  - dhcp
---

# UniFi Referenz

Technische Konfigurationsdetails der UniFi-Infrastruktur (UDM Pro Lenzburg). Architektur und Netzwerksegmente: [UniFi](./index.md).

::: info
IPs und Hostnamen der Netzwerkgeräte sind in [Hosts und IPs](../_referenz/hosts-und-ips.md) geführt.
:::

## WLAN-Konfiguration

| SSID | Sicherheit | Bänder | Netzwerk | Fast Roaming | BSS Transition | PMF | Versteckt |
|------|------------|--------|----------|--------------|----------------|-----|-----------|
| AirPort | WPA2-CCMP | 2.4 + 5 GHz | Device Network (VLAN 10) | ja | ja | disabled | nein |
| AirPort-IoT | WPA2-CCMP | 2.4 + 5 GHz | IoT Network (VLAN 200) | nein | nein | disabled | nein |
| Airport-Guest | WPA2-CCMP | 2.4 + 5 GHz | Guest Network (VLAN 30) | ja | nein | disabled | nein |
| element-82306b2cd940fc84 | WPA2-CCMP | 2.4 + 5 GHz | Management (native) | -- | -- | disabled | ja |

`element-82306b2cd940fc84` ist das interne UniFi-Netz für Gerätekommunikation (Adopt, Heartbeat). Es sollte nicht umbenannt oder entfernt werden.

## DHCP-Konfiguration

| Netzwerk | VLAN | Subnetz | DHCP-Range | Domain |
|----------|------|---------|------------|--------|
| Management | -- (native) | 10.0.0.1/22 | 10.0.1.1 -- 10.0.1.160 | homenet.local |
| Device | 10 | 10.0.10.1/24 | 10.0.10.6 -- 10.0.10.254 | homenet.local |
| Guest | 30 | 10.0.30.1/24 | 10.0.30.6 -- 10.0.30.254 | homenet |
| Rack | 100 | 10.0.100.1/24 | 10.0.100.6 -- 10.0.100.254 | homenet.local |
| IoT | 200 | 10.0.200.1/24 | 10.0.200.6 -- 10.0.200.254 | -- |

DHCP Guard ist auf allen Netzwerksegmenten aktiv.

## Port-Forwards

| Beschreibung | Externer Port | Interner Port | Ziel | Protokoll |
|--------------|---------------|---------------|------|-----------|
| NAS Zugriff (QuickConnect) | 40000 | 40000 | NAS (10.0.0.200) | TCP+UDP |
| NAS Zugriff (QuickConnect TLS) | 40001 | 40001 | NAS (10.0.0.200) | TCP+UDP |
| Synology Drive | 6690 | 6690 | NAS (10.0.0.200) | TCP+UDP |
| Traefik HTTP | 80 | 80 | Traefik VIP (10.0.2.20) | TCP+UDP |
| Traefik HTTPS | 443 | 443 | Traefik VIP (10.0.2.20) | TCP+UDP |
| HyperBackup | 6281 | 6281 | NAS (10.0.0.200) | TCP+UDP |
| Jellyfin (direkt) | 8096 | 8096 | 10.0.2.51 | TCP+UDP |

::: warning Jellyfin Direktweiterleitung
Port 8096 leitet direkt auf 10.0.2.51 -- nicht über Traefik. Für den Normalbetrieb (HTTPS via Traefik) ist dieser Forward nicht notwendig. Vor einer Änderung prüfen, ob externe Clients (z.B. Infuse/ATV) diesen Port direkt nutzen.
:::

## Firewall

### Zonen

Die Firewall verwendet Zone-Based-Policies. Konfigurierte Zonen:

- Internal
- External
- Gateway
- VPN
- Hotspot
- DMZ

Traffic Rules und Traffic Routes sind nicht konfiguriert.

### Policies (aktive Regeln)

| Policy | Quelle | Ziel | Aktion |
|--------|--------|------|--------|
| allow Pioneer to All | 10.0.20.2 (Pioneer) | Management Network | ALLOW |
| allow DNS to external | Alle Zonen | DNS-Port-Gruppe (extern) | ALLOW |
| allow Device Network to NAS | Device Network ↔ 10.0.0.200 | bidirektional | ALLOW |

Die NAS-Policy umfasst ca. 12 Einzelregeln für alle relevanten Zonen-Kombinationen.

## Settings-Übersicht

| Einstellung | Wert |
|-------------|------|
| IPS/IDS | Konfiguriert, aber deaktiviert (`ips_mode: disabled`) |
| IPS-Kategorien | 18 Kategorien konfiguriert |
| DNS Filtering | aktiviert |
| DPI | aktiviert (inkl. Fingerprinting) |
| Country Code | 756 (Schweiz) |
| Remote Access | aktiviert |
| Direct Remote Connection | deaktiviert |
| SSH | aktiviert |
| Analytics | Minimum |

::: info IPS deaktiviert
IPS ist konfiguriert, aber bewusst deaktiviert -- vermutlich wegen Performance auf der ARM-Hardware. Bei Aktivierung Monitoring auf CPU/RAM beobachten.
:::

## API und Zugang

Der UniFi Network Controller läuft lokal auf dem UDM Pro. Kein Cloud-Konto notwendig.

**API-Endpunkt:** `https://10.0.0.1:443/proxy/network/api/s/default/`

Authentifizierung über Cookie-Session (Login via `/api/auth/login`). Zugangsdaten: [Zugangsdaten](../_referenz/credentials.md).

**SSH-Zugang:** `root@10.0.0.1`, Authentifizierung über Keyboard-Interactive.

::: info Root-Partition
Die Root-Partition (`/boot/firmware`) enthält genau 2 Firmware-Images (aktiv + Rollback) und zeigt daher ~99% Auslastung -- das ist normales Verhalten. Die Daten-Partition `/mnt/.rwfs` hat ausreichend Platz.
:::

## Verwandte Seiten

- [UniFi](./index.md) -- Architektur, Netzwerksegmente und Geräteinventar
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- IP-Adressen aller UniFi-Geräte
- [Ports und Dienste](../_referenz/ports-und-dienste.md) -- Vollständige Port-Übersicht
- [Zugangsdaten](../_referenz/credentials.md) -- Speicherorte für UniFi-Credentials
- [Traefik Referenz](../traefik/referenz.md) -- Routing und Middleware Chains hinter dem Port-Forward
