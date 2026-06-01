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

Der UDM Pro ist das zentrale Gateway des Homelabs und steuert Routing, Switching, WLAN und Firewall für alle VLAN-Segmente. Architektur und Konfigurationsreferenz: [UniFi](./index.md).

## Abhängigkeiten

- Keine externen Service-Abhängigkeiten -- der UDM Pro ist die Basis-Infrastruktur
- Traefik VIP -- die Port-Forwards 80/443 auf dem UDM Pro zeigen hierauf, siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)
- Pi-hole DNS-LXCs liegen im Management-Netzwerk des UDM Pro

## Automatisierung

Keine automatisierten Deployments. Konfiguration erfolgt manuell über den integrierten Controller. Firmware-Updates werden manuell initiiert (Prozess: [Firmware-Updates](#firmware-updates)).

## Bekannte Einschränkungen

- SSH nur mit Passwort-Authentifizierung
- Double NAT durch ISP-Router
- Management Network ohne dediziertes VLAN (native)
- IPS konfiguriert aber deaktiviert
- Keine Inter-VLAN-Blocking-Regeln als Baseline

## Zugang und SSH

SSH ist auf dem UDM Pro aktiv und erfordert Passwort-Authentifizierung (keyboard-interactive). Der Zugang ist auf das interne Netzwerk beschränkt. Zugangsdaten und Verbindungsdetails: [Zugangsdaten](../_referenz/credentials.md) und [SSH-Zugang](../_referenz/ssh-zugang.md).

::: warning Passwort-Auth aktiv
SSH läuft derzeit mit Passwort-Authentifizierung.
:::

## Web-Interface

Das UniFi Network Application läuft direkt auf dem UDM Pro und ist im lokalen Netzwerk erreichbar.

Login-Methoden:
- **UI.com SSO** -- Ubiquiti-Konto mit Passkey und 2FA (primäre Methode)
- **Lokaler Admin** -- Fallback, Zugangsdaten in 1Password (Vault "PRIVAT Agent")

Remote Access via UI.com ist aktiviert; der Traffic wird über Ubiquiti-Server geroutet. Die zugehörigen Einstellungen: [UniFi Referenz](./referenz.md).

## Backup und Restore

Restore: Backups können im Controller unter Einstellungen > System > Backups eingespielt werden. Bei einem Totalausfall des UDM Pro muss nach dem Factory Reset zuerst die gleiche Firmware-Version eingespielt werden, bevor das Backup importiert wird.

## Firmware-Updates

Empfohlene Reihenfolge, um Inkompatibilitäten zu vermeiden:

1. **Manuelles Backup erstellen** -- vor jedem Update
2. **UniFi Network Application (Controller)** -- zuerst auf dem UDM Pro aktualisieren
3. **Access Points** -- danach, da APs re-adopted werden können wenn die Protokoll-Version wechselt
4. **Switches** -- zuletzt, da Switch-Firmware-Änderungen seltener breaking changes haben

Aktuelle Firmware-Versionen sind in der UniFi-Console unter Devices einsehbar -- nicht hier duplizieren, da sie sich häufig ändern.

## Monitoring-Integration

Syslog ist nicht konfiguriert.

## Verwandte Seiten

- [Netzwerk](../netzwerk/) -- VLAN-Übersicht und Netzwerk-Architektur
- [Synology NAS](../nas-storage/) -- NAS-Zugriff und Storage-Konfiguration
- [Jellyfin](../jellyfin/) -- Media-Streaming-Service
- [Traefik](../traefik/) -- Reverse Proxy für sichere externe Dienst-Exposition
- [Zugangsdaten](../_referenz/credentials.md) -- Kanonische Quelle für alle Zugangsdaten
- [SSH-Zugang](../_referenz/ssh-zugang.md) -- SSH-Zugangsdaten und -Konfiguration
