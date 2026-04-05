---
title: UniFi Betrieb
description: Betriebsanleitungen, Zugaenge und Empfehlungen fuer die UniFi-Infrastruktur
tags:
  - unifi
  - netzwerk
  - betrieb
---

# UniFi Betrieb

## SSH-Zugang

SSH ist auf dem UDM Pro aktiv und erfordert Passwort-Authentifizierung (keyboard-interactive). Der Zugang ist auf dem internen Netzwerk beschraenkt.

::: warning Passwort-Auth aktiv
SSH laeuft derzeit mit Passwort-Authentifizierung. Key-basierte Auth ist als offener Punkt eingetragen -- siehe [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

Zugangsdaten und Verbindungsdetails: [Zugangsdaten](./../_referenz/credentials.md) und [SSH-Zugang](./../_referenz/ssh-zugang.md).

## Web-Interface

Das UniFi Network Application laeuft direkt auf dem UDM Pro und ist im lokalen Netzwerk erreichbar.

Login-Methoden:
- **UI.com SSO** -- Ubiquiti-Konto mit Passkey und 2FA (primaeree Methode)
- **Lokaler Admin** -- Fallback, Zugangsdaten in 1Password (Vault "PRIVAT Agent")

::: info Remote Access
Remote Access via UI.com ist aktiviert. Der Traffic wird ueber Ubiquiti-Server geroutet (Direct Remote Connection ist deaktiviert). Ob das benoetigt wird, ist ein offener Punkt -- siehe [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

## Backup und Restore

::: warning Backup-Status ungeklaert
Die aktuellen Backup-Einstellungen des UDM Pro sind noch nicht geprueft worden. Dieser Abschnitt muss nach der Pruefung aktualisiert werden.
:::

Zu konfigurieren und zu pruefen:
- Automatische Backups im UniFi-Controller aktivieren (Einstellungen > System > Backups)
- Backup-Intervall und Aufbewahrungsdauer festlegen
- Backup-Ablageort pruefen -- lokal auf dem UDM Pro oder via Cloud-Backup zu UI.com
- Manuelles Backup vor jedem Firmware-Update erstellen

Restore: Backups koennen im Controller unter Einstellungen > System > Backups eingespielt werden. Bei einem Totalausfall des UDM Pro muss nach dem Factory Reset zuerst die gleiche Firmware-Version eingespielt werden, bevor das Backup importiert wird.

## Firmware-Updates

Empfohlene Reihenfolge, um Inkompatiblitaeten zu vermeiden:

1. **Manuelles Backup erstellen** -- vor jedem Update
2. **UniFi Network Application (Controller)** -- zuerst auf dem UDM Pro aktualisieren
3. **Access Points** -- danach, da APs re-adopted werden koennen wenn die Protokoll-Version wechselt
4. **Switches** -- zuletzt, da Switch-Firmware-Aenderungen seltener breaking changes haben

::: tip LTS-Firmware erwaegen
Kein Geraet laeuft aktuell auf LTS-Firmware (Long Term Support). Fuer Geraete die stabil laufen sollen, ist LTS gegenueber dem regulaeren Kanal vorzuziehen. Details: [Offene Punkte](#offene-punkte-und-empfehlungen).
:::

Aktuelle Firmware-Versionen im Ueberblick: In der UniFi-Console unter Devices einsehbar -- nicht hier duplizieren, da sie sich haeufig aendern.

## Monitoring-Integration

Syslog-Integration in Loki ist noch nicht eingerichtet. Damit waere es moeglich, Firewall-Events, DHCP-Leases und Authentifizierungsversuche in Grafana zu visualisieren und Alerting zu konfigurieren.

Status: Ausstehend -- Issue #6.

Sobald konfiguriert, Dokumentation in der [Monitoring-Seite](../monitoring/) ergaenzen.

## Offene Punkte und Empfehlungen

Findings aus der Bestandsaufnahme vom 2026-04-05, gruppiert nach Prioritaet.

### KRITISCH -- Sofort handeln

- ~~**Root-Partition 99% voll**~~: Normales Verhalten -- `/boot/firmware` enthält genau 2 Firmware-Images (aktiv + Rollback). Daten-Partition `/mnt/.rwfs` hat 6.4 GB frei. Kein Handlungsbedarf.
- ~~**Synology-Ports im Internet (40000, 40001, 6690)**~~: Bewusst so konfiguriert. Bei Gelegenheit pruefen ob Port 40000 (HTTP) zugunsten von 40001 (HTTPS) entfernt werden kann.

### HOCH -- Innerhalb 1-2 Wochen

- **Jellyfin Port 8096 unverschluesselt offen**: Port-Forward entfernen, Jellyfin ueber Traefik mit TLS bereitstellen.
- **Versteckte SSID auf Management Network**: Herkunft der SSID `element-82306b2cd940fc84` klaeren; falls nicht benoetigt sofort deaktivieren, niemals auf dem nativen Management-Netzwerk belassen.
- **IPS konfiguriert aber deaktiviert**: Entweder IPS aktivieren (mindestens Detection-Mode) oder Konfiguration entfernen.
- **PMF ueberall deaktiviert**: PMF auf "optional" setzen; verhindert Deauthentication-Angriffe.
- **Double NAT durch ISP-Router**: ISP-Router in Bridge-Mode versetzen, damit der UDM Pro eine oeffentliche IP erhaelt.
- **Management Network ohne VLAN (native)**: Langfristig dediziertes Management-VLAN einfuehren; erfordert Re-Adoption aller Geraete.
- **IoT Network nicht isoliert (corporate statt guest)**: Netzwerktyp auf "guest" umstellen oder explizite Inter-VLAN-Blocking-Regeln erstellen.
- **Keine Inter-VLAN-Blocking-Regeln**: Deny-All-Inter-VLAN als Baseline einrichten, dann gezielt Flows erlauben.
- **IoT SSID auf beiden Baendern**: AirPort-IoT SSID auf 2.4 GHz only umstellen.
- **AC-LR Access Points -- End of Life pruefen**: Ubiquiti-Status fuer UAP-AC-LR klaeren; mittelfristig durch Wi-Fi 6 Modelle ersetzen.

### MITTEL -- Naechste 1-3 Monate

- **SSH Passwort statt Key-Auth**: Key-basierte Authentifizierung einrichten, Passwort-Login deaktivieren.
- **Remote Access pruefen**: Falls nicht benoetigt, deaktivieren.
- **HyperBackup Port 6281 offen**: Auf Quell-IP einschraenken oder Port-Forward entfernen und ueber VPN loesen.
- **Management Network /22 ueberdimensioniert**: Bei Redesign auf /24 verkleinern; statische IPs im Bereich beachten.
- **Nur 2 Port-Profile**: Port-Profile fuer gaengige Anwendungsfaelle erstellen (IoT-Only, Device, Rack, Trunk).
- **Fast Roaming / BSS Transition inkonsistent**: BSS Transition auf Airport-Guest aktivieren.
- **Keine Minimum-RSSI**: Min-RSSI auf ca. -75 dBm setzen, zuerst auf U6 Pro testen.
- **Kein LTS-Firmware**: Switches und APs auf LTS-Track umstellen.
- **Redundante Firewall-Regeln**: 12x "allow device to NAS" konsolidieren.

### NIEDRIG -- Bei Gelegenheit

- **Pioneer-Geraet (10.0.20.2) auf nicht existierendem Subnetz**: Klaeren was das Geraet ist; Firewall-Regel bereinigen.
- **TX-Power unbekannt**: TX-Power pruefen, bei Bedarf auf Medium oder Low setzen.
- **Unnamed Switches**: US-24 und US-8-150W mit sprechenden Namen versehen.
- **Flex Mini Firmware 2.1.6**: In der UniFi-Console auf verfuegbare Updates pruefen.

## Verwandte Seiten

- [Netzwerk](../netzwerk/) -- VLAN-Uebersicht und Netzwerk-Architektur
- [Synology NAS](../nas-storage/) -- NAS-Zugriff und Storage-Konfiguration
- [Jellyfin](../jellyfin/) -- Streaming-Service, aktuell unverschluesselt exponiert
- [Traefik](../traefik/) -- Reverse Proxy fuer sichere externe Dienst-Exposition
- [Zugangsdaten](./../_referenz/credentials.md) -- Kanonische Quelle fuer alle Zugangsdaten
- [SSH-Zugang](./../_referenz/ssh-zugang.md) -- SSH-Zugangsdaten und -Konfiguration
