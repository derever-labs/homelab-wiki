---
title: Guacamole
description: Remote Desktop Gateway für RDP, VNC und SSH über den Browser
tags:
  - service
  - productivity
  - nomad
  - remote-access
---

# Guacamole

Guacamole ist ein clientloser Remote-Desktop-Gateway. Über den Browser können RDP-, VNC- und SSH-Verbindungen zu internen Maschinen aufgebaut werden, ohne einen lokalen Client zu installieren.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [remote.ackermannprivat.ch](https://remote.ackermannprivat.ch) |
| Deployment | Nomad Job `services/guacamole.nomad` |
| Storage | NFS `/nfs/docker/guacamole/config` |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |

## Rolle im Stack

Besonders nützlich für den Zugriff auf Proxmox-VMs und physische Server von unterwegs.

## Architektur

Das verwendete Image (`oznu/guacamole`) ist ein All-in-One-Container, der sowohl den Guacamole-Webserver als auch den guacd-Proxy-Daemon enthält.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

USER: Browser {
  class: node
}

Traefik: Traefik (vm-traefik-01) {
  style.stroke-dash: 4
  R1: Router: remote.* (intern-auth)
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  GUAC: Guacamole (Web + guacd) {
    class: node
  }
}

Targets: Interne Ziele {
  style.stroke-dash: 4
  RDP: Windows VMs (RDP) {
    class: node
  }
  VNC: Linux VMs (VNC) {
    class: node
  }
  SSH: Server (SSH) {
    class: node
  }
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

Traefik schützt den Zugang mit der `intern-auth`-Middleware (Authentik ForwardAuth). Guacamole selbst sieht nur den bereits authentifizierten User.

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und Authentik ForwardAuth Middleware (`intern-auth`)
- **Authentik** -- ForwardAuth-Provider
- **NFS** -- Konfigurationspersistenz

::: info auth-ldap Extension ungenutzt
Der Nomad Job lädt zwar die `auth-ldap`-Extension (`EXTENSIONS=auth-ldap`), setzt aber keine `LDAP_HOSTNAME`-Konfiguration. Die effektive Authentifizierung läuft ausschliesslich über die Traefik ForwardAuth-Middleware (`intern-auth@file`) -- Guacamole selbst sieht nur den bereits authentifizierten User aus dem Authentik-Header.
:::

## Verwandte Seiten

- [Authentik](../authentik/index.md) -- Identity Provider und ForwardAuth
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Proxmox Cluster](../proxmox/index.md) -- VMs die via Guacamole erreichbar sind
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Konfiguration
