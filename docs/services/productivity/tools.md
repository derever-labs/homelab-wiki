---
title: Utility Tools
description: Czkawka (Duplikat-Finder) und MeshCommander (Intel AMT Management)
tags:
  - service
  - productivity
  - nomad
  - utilities
---

# Utility Tools

Diese Seite dokumentiert kleinere Utility-Services, die keinen eigenen umfangreichen Eintrag rechtfertigen.

## Czkawka

### Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [double.ackermannprivat.ch](https://double.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/czkawka.nomad`) |
| **Storage** | NFS `/nfs/docker/czkawka/config` |
| **Auth** | `admin-chain-v2@file` |

### Rolle im Stack

Czkawka ist ein Duplikat-Finder mit Web-UI. Er scannt NFS-Verzeichnisse nach doppelten Dateien, leeren Ordnern, temporären Dateien und ähnlichen Mustern. Besonders nützlich zur Bereinigung der Jellyfin-Medienbibliothek und Log-Verzeichnisse.

### Konfiguration

Der Container hat Lesezugriff auf mehrere NFS-Verzeichnisse:

- `/nfs/logs/` -- Log-Dateien
- `/nfs/jellyfin/` -- Medienbibliothek
- `/nfs/logs/meta_logs/meta/logs/logs/data/` -- Stash-Daten

::: warning Hoher Ressourcenbedarf
Czkawka benötigt bis zu 8 GiB Memory und 2000 MHz CPU beim Scannen grosser Verzeichnisse. Scans sollten nicht während anderer ressourcenintensiver Aufgaben laufen.
:::

---

## MeshCommander

### Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [mesh.ackermannprivat.ch](https://mesh.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/meshcmd.nomad`) |
| **Storage** | Keine (stateless) |
| **Auth** | `admin-chain-v2@file` |

### Rolle im Stack

MeshCommander ist ein Web-basiertes Management-Tool für Intel AMT/vPro-fähige Hardware. Es ermöglicht Remote-KVM (Tastatur, Video, Maus), Power-Management und BIOS-Zugriff über den Browser -- unabhängig vom Betriebssystem-Zustand des Zielrechners.

### Konfiguration

MeshCommander ist vollständig stateless -- es werden keine Daten persistiert. Die Verbindungsdaten zu AMT-Geräten werden bei jeder Session neu eingegeben.

::: info Nomad Priority 100
MeshCommander hat die höchste Nomad-Priority (100), da es für Out-of-Band-Management kritischer Infrastruktur benötigt wird. Auch bei Ressourcenknappheit im Cluster bleibt der Service verfügbar.
:::

## Abhängigkeiten (beide Services)

- **Traefik** -- HTTPS-Routing und OAuth2 Middleware
- **Keycloak** -- OAuth2-Provider (über `admin-chain-v2`)

## Verwandte Seiten

- [Jellyfin](../media/jellyfin.md) -- Czkawka scannt die Medienbibliothek
- [Traefik Middlewares](../../platforms/traefik-middlewares.md) -- Auth-Chain-Konfiguration
- [Proxmox Cluster](../../infrastructure/proxmox-cluster.md) -- MeshCommander verwaltet AMT-fähige Hardware
