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
| **Auth** | LDAP-Extension + `admin-chain-v2@file` |

## Rolle im Stack

Guacamole ist ein clientloser Remote-Desktop-Gateway. Über den Browser können RDP-, VNC- und SSH-Verbindungen zu internen Maschinen aufgebaut werden, ohne einen lokalen Client zu installieren. Besonders nützlich für den Zugriff auf Proxmox-VMs und physische Server von unterwegs.

## Architektur

Das verwendete Image (`oznu/guacamole`) ist ein All-in-One-Container, der sowohl den Guacamole-Webserver als auch den guacd-Proxy-Daemon enthält.

```mermaid
flowchart LR
    USER:::entry["Browser"]

    subgraph Traefik["Traefik (10.0.2.1)"]
        R1:::svc["Router: remote.*<br>admin-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        GUAC:::accent["Guacamole<br>(Web + guacd)"]
    end

    subgraph Targets["Interne Ziele"]
        RDP:::ext["Windows VMs<br>(RDP)"]
        VNC:::ext["Linux VMs<br>(VNC)"]
        SSH:::ext["Server<br>(SSH)"]
    end

    USER -->|HTTPS| R1
    R1 --> GUAC
    GUAC -->|RDP| RDP
    GUAC -->|VNC| VNC
    GUAC -->|SSH| SSH

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Storage

Konfiguration (Verbindungen, Benutzer) liegt auf NFS unter `/nfs/docker/guacamole/config`.

### Authentifizierung

Die LDAP-Extension (`auth-ldap`) ist aktiviert und ermöglicht die Anmeldung mit LDAP-Credentials. Zusätzlich schützt Traefik den Zugang mit der `admin-chain-v2` Middleware (OAuth2 via Keycloak).

### Ressourcen

Der Container erhält 1024 MiB Memory (max 2048 MiB), da Remote-Desktop-Sessions speicherintensiv sein können.

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und OAuth2 Middleware
- **Keycloak** -- OAuth2-Provider (über `admin-chain-v2`)
- **OpenLDAP** -- Benutzerauthentifizierung via LDAP-Extension
- **NFS** -- Konfigurationspersistenz

## Verwandte Seiten

- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- LDAP-Authentifizierung
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Proxmox Cluster](../proxmox/index.md) -- VMs die via Guacamole erreichbar sind
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Konfiguration
