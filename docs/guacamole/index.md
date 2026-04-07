---
title: Guacamole
description: Remote Desktop Gateway fuer RDP, VNC und SSH ueber den Browser
tags:
  - service
  - productivity
  - nomad
  - remote-access
---

# Guacamole

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [remote.ackermannprivat.ch](https://remote.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/guacamole.nomad`) |
| **Storage** | NFS `/nfs/docker/guacamole/config` |
| **Datenbank** | Keine (Embedded) |
| **Auth** | Authentik ForwardAuth + `intern-auth@file` |

## Rolle im Stack

Guacamole ist ein clientloser Remote-Desktop-Gateway. Über den Browser können RDP-, VNC- und SSH-Verbindungen zu internen Maschinen aufgebaut werden, ohne einen lokalen Client zu installieren. Besonders nützlich für den Zugriff auf Proxmox-VMs und physische Server von unterwegs.

## Architektur

Das verwendete Image (`oznu/guacamole`) ist ein All-in-One-Container, der sowohl den Guacamole-Webserver als auch den guacd-Proxy-Daemon enthält.

```d2
direction: right

USER: Browser

Traefik: Traefik (10.0.2.20) {
  style.stroke-dash: 4
  R1: Router: remote.* (intern-auth)
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  GUAC: Guacamole (Web + guacd)
}

Targets: Interne Ziele {
  style.stroke-dash: 4
  RDP: Windows VMs (RDP)
  VNC: Linux VMs (VNC)
  SSH: Server (SSH)
}

USER -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.GUAC
Nomad.GUAC -> Targets.RDP: RDP
Nomad.GUAC -> Targets.VNC: VNC
Nomad.GUAC -> Targets.SSH: SSH
```

## Konfiguration

### Storage

Konfiguration (Verbindungen, Benutzer) liegt auf NFS unter `/nfs/docker/guacamole/config`.

### Authentifizierung

Die Authentik-Extension ist aktiviert und ermöglicht die Anmeldung via Authentik ForwardAuth. Zusätzlich schützt Traefik den Zugang mit der `intern-auth` Middleware (Authentik ForwardAuth).

### Ressourcen

Der Container erhält 1024 MiB Memory (max 2048 MiB), da Remote-Desktop-Sessions speicherintensiv sein können.

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und Authentik ForwardAuth Middleware
- **Authentik** -- ForwardAuth-Provider (über `intern-auth`)
- **OpenLDAP** -- Benutzerauthentifizierung via LDAP-Extension
- **NFS** -- Konfigurationspersistenz

## Verwandte Seiten

- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- LDAP-Authentifizierung
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Proxmox Cluster](../proxmox/index.md) -- VMs die via Guacamole erreichbar sind
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Konfiguration
