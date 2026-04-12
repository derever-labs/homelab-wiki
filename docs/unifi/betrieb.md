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

- SSH nur mit Passwort-Authentifizierung (key-basierte Auth ausstehend)
- Double NAT durch ISP-Router (Bridge-Mode ausstehend)
- Management Network ohne dediziertes VLAN (native)
- IPS konfiguriert aber deaktiviert
- Keine Inter-VLAN-Blocking-Regeln als Baseline

## Credentials

Zugangsdaten für Web-UI und SSH: [Zugangsdaten](../_referenz/credentials.md). SSH-Verbindungsdetails: [SSH-Zugang](../_referenz/ssh-zugang.md).

## SSH-Zugang

SSH ist auf dem UDM Pro aktiv und erfordert Passwort-Authentifizierung (keyboard-interactive). Der Zugang ist auf dem internen Netzwerk beschränkt.

::: warning Passwort-Auth aktiv
SSH läuft derzeit mit Passwort-Authentifizierung. Key-basierte Auth ist als offener Punkt eingetragen -- siehe [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

Zugangsdaten und Verbindungsdetails: [Zugangsdaten](./../_referenz/credentials.md) und [SSH-Zugang](./../_referenz/ssh-zugang.md).

## Web-Interface

Das UniFi Network Application läuft direkt auf dem UDM Pro und ist im lokalen Netzwerk erreichbar.

Login-Methoden:
- **UI.com SSO** -- Ubiquiti-Konto mit Passkey und 2FA (primäre Methode)
- **Lokaler Admin** -- Fallback, Zugangsdaten in 1Password (Vault "PRIVAT Agent")

::: info Remote Access
Remote Access via UI.com ist aktiviert. Der Traffic wird über Ubiquiti-Server geroutet (Direct Remote Connection ist deaktiviert). Ob das benötigt wird, ist ein offener Punkt -- siehe [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

## Backup und Restore

::: warning Backup-Status ungeklärt
Die aktuellen Backup-Einstellungen des UDM Pro sind noch nicht geprüft worden. Dieser Abschnitt muss nach der Prüfung aktualisiert werden.
:::

Zu konfigurieren und zu prüfen:
- Automatische Backups im UniFi-Controller aktivieren (Einstellungen > System > Backups)
- Backup-Intervall und Aufbewahrungsdauer festlegen
- Backup-Ablageort prüfen -- lokal auf dem UDM Pro oder via Cloud-Backup zu UI.com
- Manuelles Backup vor jedem Firmware-Update erstellen

Restore: Backups können im Controller unter Einstellungen > System > Backups eingespielt werden. Bei einem Totalausfall des UDM Pro muss nach dem Factory Reset zuerst die gleiche Firmware-Version eingespielt werden, bevor das Backup importiert wird.

## Firmware-Updates

Empfohlene Reihenfolge, um Inkompatibilitäten zu vermeiden:

1. **Manuelles Backup erstellen** -- vor jedem Update
2. **UniFi Network Application (Controller)** -- zuerst auf dem UDM Pro aktualisieren
3. **Access Points** -- danach, da APs re-adopted werden können wenn die Protokoll-Version wechselt
4. **Switches** -- zuletzt, da Switch-Firmware-Änderungen seltener breaking changes haben

::: tip LTS-Firmware erwägen
Kein Gerät läuft aktuell auf LTS-Firmware (Long Term Support). Für Geräte die stabil laufen sollen, ist LTS gegenüber dem regulären Kanal vorzuziehen. Details: [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

Aktuelle Firmware-Versionen im Überblick: In der UniFi-Console unter Devices einsehbar -- nicht hier duplizieren, da sie sich häufig ändern.

## Monitoring-Integration

Syslog-Integration in Loki ist noch nicht eingerichtet. Damit wäre es möglich, Firewall-Events, DHCP-Leases und Authentifizierungsversuche in Grafana zu visualisieren und Alerting zu konfigurieren.

Status: Ausstehend -- Issue #6.

Sobald konfiguriert, Dokumentation in der [Monitoring-Seite](../monitoring/) ergänzen.

## Offene Punkte und Empfehlungen

Findings aus der Bestandsaufnahme vom 2026-04-05, gruppiert nach Priorität.

### KRITISCH -- Sofort handeln

- ~~**Root-Partition 99% voll**~~: Normales Verhalten -- `/boot/firmware` enthält genau 2 Firmware-Images (aktiv + Rollback). Daten-Partition `/mnt/.rwfs` hat 6.4 GB frei. Kein Handlungsbedarf.
- ~~**Synology-Ports im Internet (40000, 40001, 6690)**~~: Bewusst so konfiguriert. Bei Gelegenheit prüfen ob Port 40000 (HTTP) zugunsten von 40001 (HTTPS) entfernt werden kann.

### HOCH -- Innerhalb 1-2 Wochen

- **Jellyfin Port 8096 unverschlüsselt offen**: Port-Forward entfernen, Jellyfin über Traefik mit TLS bereitstellen.
- **Versteckte SSID auf Management Network**: Herkunft der SSID `element-82306b2cd940fc84` klären; falls nicht benötigt sofort deaktivieren, niemals auf dem nativen Management-Netzwerk belassen.
- **IPS konfiguriert aber deaktiviert**: Entweder IPS aktivieren (mindestens Detection-Mode) oder Konfiguration entfernen.
- **PMF überall deaktiviert**: PMF auf "optional" setzen; verhindert Deauthentication-Angriffe.
- **Double NAT durch ISP-Router**: ISP-Router in Bridge-Mode versetzen, damit der UDM Pro eine öffentliche IP erhält.
- **Management Network ohne VLAN (native)**: Langfristig dediziertes Management-VLAN einführen; erfordert Re-Adoption aller Geräte.
- **IoT Network nicht isoliert (corporate statt guest)**: Netzwerktyp auf "guest" umstellen oder explizite Inter-VLAN-Blocking-Regeln erstellen.
- **Keine Inter-VLAN-Blocking-Regeln**: Deny-All-Inter-VLAN als Baseline einrichten, dann gezielt Flows erlauben.
- **IoT SSID auf beiden Bändern**: AirPort-IoT SSID auf 2.4 GHz only umstellen.
- **AC-LR Access Points -- End of Life prüfen**: Ubiquiti-Status für UAP-AC-LR klären; mittelfristig durch Wi-Fi 6 Modelle ersetzen.

### MITTEL -- Nächste 1-3 Monate

- **SSH Passwort statt Key-Auth**: Key-basierte Authentifizierung einrichten, Passwort-Login deaktivieren.
- **Remote Access prüfen**: Falls nicht benötigt, deaktivieren.
- **HyperBackup Port 6281 offen**: Auf Quell-IP einschränken oder Port-Forward entfernen und über VPN lösen.
- **Management Network /22 überdimensioniert**: Bei Redesign auf /24 verkleinern; statische IPs im Bereich beachten.
- **Nur 2 Port-Profile**: Port-Profile für gängige Anwendungsfälle erstellen (IoT-Only, Device, Rack, Trunk).
- **Fast Roaming / BSS Transition inkonsistent**: BSS Transition auf Airport-Guest aktivieren.
- **Keine Minimum-RSSI**: Min-RSSI auf ca. -75 dBm setzen, zuerst auf U6 Pro testen.
- **Kein LTS-Firmware**: Switches und APs auf LTS-Track umstellen.
- **Redundante Firewall-Regeln**: 12x "allow device to NAS" konsolidieren.

### NIEDRIG -- Bei Gelegenheit

- **Pioneer-Gerät (10.0.20.2) auf nicht existierendem Subnetz**: Klären was das Gerät ist; Firewall-Regel bereinigen.
- **TX-Power unbekannt**: TX-Power prüfen, bei Bedarf auf Medium oder Low setzen.
- **Unnamed Switches**: US-24 und US-8-150W mit sprechenden Namen versehen.
- **Flex Mini Firmware 2.1.6**: In der UniFi-Console auf verfügbare Updates prüfen.

## Verwandte Seiten

- [Netzwerk](../netzwerk/) -- VLAN-Übersicht und Netzwerk-Architektur
- [Synology NAS](../nas-storage/) -- NAS-Zugriff und Storage-Konfiguration
- [Jellyfin](../jellyfin/) -- Streaming-Service, aktuell unverschlüsselt exponiert
- [Traefik](../traefik/) -- Reverse Proxy für sichere externe Dienst-Exposition
- [Zugangsdaten](./../_referenz/credentials.md) -- Kanonische Quelle für alle Zugangsdaten
- [SSH-Zugang](./../_referenz/ssh-zugang.md) -- SSH-Zugangsdaten und -Konfiguration
