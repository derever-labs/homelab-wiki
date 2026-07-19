---
title: Homelab Wiki
description: Zentrale Dokumentation der Homelab-Infrastruktur -- Einstieg über die neun Themen-Oberkapitel, den Querschnitt und die globale Referenz
tags:
  - index
  - home
  - overview
---

# Homelab Wiki

Willkommen in der zentralen Wissensdatenbank für das Homelab. Das Wiki erklärt das Warum und das Zusammenspiel der Systeme -- Architektur, Infrastruktur-Komponenten und alle laufenden Services. Das Was (Code, Configs, Nomad-Jobs) liegt in den Repos, auf die die Seiten verweisen.

Die Inhalte sind in neun Themen-Oberkapitel gegliedert. Jede Kapitel-Startseite bündelt die Systeme ihres Themas und zeigt, wo ein Gesamtbild sinnvoll ist, das Big Picture des Zusammenspiels -- die Details stehen auf den System-Seiten dahinter.

## Schnelleinstieg

Die meistgebrauchten Nachschlageseiten aus der [globalen Referenz](./_referenz/):

- [Hosts und IPs](./_referenz/hosts-und-ips.md) -- Alle Hosts, VMs und IP-Adressen
- [Web-Interfaces](./_referenz/web-interfaces.md) -- URLs aller Web-UIs
- [SSH-Zugang](./_referenz/ssh-zugang.md) -- SSH-Benutzer und Zugangsregeln
- [Credentials](./_referenz/credentials.md) -- Wo Passwörter und Tokens gespeichert sind
- [Nomad Jobs](./_referenz/nomad-jobs.md) -- Job-Verzeichnis und Übersicht

## Kapitel

### Fundament

- [Infrastruktur](./infrastruktur/) -- Die physische und virtuelle Grundlage: der Proxmox-Cluster als Virtualisierungsplattform
- [Netz](./netz/) -- Topologie, Segmente und Standorte, die DNS-Kette aus Pi-hole, Unbound und Consul-Forwarding, dazu die UniFi-Hardware
- [Storage und Backup](./storage/) -- Die Persistenz-Schicht: Linstor/DRBD-Block-Storage, das Synology NAS mit NFS und S3, die Backup-Kette über den Proxmox Backup Server
- [Plattform](./plattform/) -- Die Cluster-Grundversorgung, auf der alle Workloads laufen: Nomad, Consul, Vault und die Zot Registry

### Zugriff und Betrieb

- [Ingress, Auth und Edge](./edge/) -- Der Zugriffspfad ins Homelab: Traefik routet, CrowdSec und Authentik entscheiden, wer durchkommt
- [Monitoring Stack](./monitoring/) -- Metriken, Logs, Verfügbarkeits-Checks und Alarmierung: von Grafana und Loki bis CheckMK, Uptime Kuma und Keep

### Anwendungen

- [Medien](./medien/) -- Vom Wunsch zum abspielbaren Titel: Seerr, arr-Suite und Jellyfin, dazu Hörbücher und die Content-Pipeline
- [Smart Home und IoT](./smart-home/) -- Die Hausautomation: Home Assistant an drei Standorten, Geräte-Anbindung über Zigbee2MQTT und Mosquitto
- [Dienste](./dienste/) -- Der Sammelbereich für eigenständige Dienste: von Paperless, Gitea und Vaultwarden bis zu den kleinen Web-Tools

## Querschnitt und Referenz

- [Querschnitt](./_querschnitt/) -- Runbooks, Architektur-Konzepte und Tooling, die mehrere Systeme gleichzeitig betreffen
- [Globale Referenz](./_referenz/) -- Zentrale SSOT-Nachschlagetabellen: Hosts, Ports, URLs, Credentials, Hardware
- [Wiki-Richtlinien](./wiki-richtlinien.md) -- Regeln und Konventionen für diese Dokumentation
