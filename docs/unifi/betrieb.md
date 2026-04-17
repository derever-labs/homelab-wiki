---
title: UniFi Betrieb
description: Betriebsanleitungen, Zugänge und Empfehlungen für die UniFi-Infrastruktur
tags:
  - unifi
  - netzwerk
  - betrieb
---

# UniFi Betrieb

## Übersicht

Der UDM Pro ist das zentrale Gateway des Homelabs und steuert Routing, Switching, WLAN und Firewall für alle VLAN-Segmente. Der integrierte UniFi Network Controller ist über `https://10.0.0.1` erreichbar.

## Abhängigkeiten

- Keine externen Service-Abhängigkeiten -- der UDM Pro ist die Basis-Infrastruktur
- Traefik (VIP 10.0.2.20) benötigt die Port-Forwards 80/443 auf dem UDM Pro
- Pi-hole DNS-LXCs (10.0.2.1 / 10.0.2.2) sind im Management-Netzwerk des UDM Pro

## Automatisierung

Keine automatisierten Deployments. Konfiguration erfolgt manuell über den integrierten Controller. Firmware-Updates werden manuell initiiert (Prozess: [Firmware-Updates](#firmware-updates)).

## Bekannte Einschränkungen

- SSH nur mit Passwort-Authentifizierung
- Double NAT durch ISP-Router
- Management Network ohne dediziertes VLAN (native)
- IPS konfiguriert aber deaktiviert
- Keine Inter-VLAN-Blocking-Regeln als Baseline

## Credentials

Zugangsdaten für Web-UI und SSH: [Zugangsdaten](../_referenz/credentials.md). SSH-Verbindungsdetails: [SSH-Zugang](../_referenz/ssh-zugang.md).

## SSH-Zugang

SSH ist auf dem UDM Pro aktiv und erfordert Passwort-Authentifizierung (keyboard-interactive). Der Zugang ist auf dem internen Netzwerk beschränkt.

::: warning Passwort-Auth aktiv
SSH läuft derzeit mit Passwort-Authentifizierung.
:::

Zugangsdaten und Verbindungsdetails: [Zugangsdaten](./../_referenz/credentials.md) und [SSH-Zugang](./../_referenz/ssh-zugang.md).

## Web-Interface

Das UniFi Network Application läuft direkt auf dem UDM Pro und ist im lokalen Netzwerk erreichbar.

Login-Methoden:
- **UI.com SSO** -- Ubiquiti-Konto mit Passkey und 2FA (primäre Methode)
- **Lokaler Admin** -- Fallback, Zugangsdaten in 1Password (Vault "PRIVAT Agent")

::: info Remote Access
Remote Access via UI.com ist aktiviert. Der Traffic wird über Ubiquiti-Server geroutet (Direct Remote Connection ist deaktiviert).
:::

## Backup und Restore

Restore: Backups können im Controller unter Einstellungen > System > Backups eingespielt werden. Bei einem Totalausfall des UDM Pro muss nach dem Factory Reset zuerst die gleiche Firmware-Version eingespielt werden, bevor das Backup importiert wird.

## Firmware-Updates

Empfohlene Reihenfolge, um Inkompatibilitäten zu vermeiden:

1. **Manuelles Backup erstellen** -- vor jedem Update
2. **UniFi Network Application (Controller)** -- zuerst auf dem UDM Pro aktualisieren
3. **Access Points** -- danach, da APs re-adopted werden können wenn die Protokoll-Version wechselt
4. **Switches** -- zuletzt, da Switch-Firmware-Änderungen seltener breaking changes haben

::: tip LTS-Firmware erwägen
Kein Gerät läuft aktuell auf LTS-Firmware (Long Term Support). Für Geräte die stabil laufen sollen, ist LTS gegenüber dem regulären Kanal vorzuziehen.
:::

Aktuelle Firmware-Versionen im Überblick: In der UniFi-Console unter Devices einsehbar -- nicht hier duplizieren, da sie sich häufig ändern.

## Monitoring-Integration

Syslog-Integration ist nicht aktiv. Sobald konfiguriert, können Firewall-Events, DHCP-Leases und Authentifizierungsversuche in Grafana visualisiert werden.

## Verwandte Seiten

- [Netzwerk](../netzwerk/) -- VLAN-Übersicht und Netzwerk-Architektur
- [Synology NAS](../nas-storage/) -- NAS-Zugriff und Storage-Konfiguration
- [Jellyfin](../jellyfin/) -- Streaming-Service, aktuell unverschlüsselt exponiert
- [Traefik](../traefik/) -- Reverse Proxy für sichere externe Dienst-Exposition
- [Zugangsdaten](./../_referenz/credentials.md) -- Kanonische Quelle für alle Zugangsdaten
- [SSH-Zugang](./../_referenz/ssh-zugang.md) -- SSH-Zugangsdaten und -Konfiguration
