---
title: MeshCommander
description: MeshCommander (Intel AMT Out-of-Band-Management)
tags:
  - service
  - nomad
  - utilities
---

# MeshCommander

MeshCommander ist ein Web-basiertes Management-Tool für Intel AMT/vPro-fähige Hardware. Es ermöglicht Remote-KVM (Tastatur, Video, Maus), Power-Management und BIOS-Zugriff über den Browser -- unabhängig vom Betriebssystem-Zustand des Zielrechners.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [mesh.ackermannprivat.ch](https://mesh.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/meshcmd.nomad` |
| Storage | Keine (stateless) |
| Auth | `intern-auth@file` (Authentik ForwardAuth via Traefik) |

### Rolle im Stack

Für Out-of-Band-Management AMT-fähiger Hardware: Zugriff auf Power-State und BIOS auch dann, wenn das Betriebssystem nicht erreichbar ist.

### Konfiguration

MeshCommander ist vollständig stateless -- es werden keine Daten persistiert. Die Verbindungsdaten zu AMT-Geräten werden bei jeder Session neu eingegeben.

::: info Nomad Priority 100
MeshCommander hat die höchste Nomad-Priority (100), da es für Out-of-Band-Management kritischer Infrastruktur benötigt wird. Auch bei Ressourcenknappheit im Cluster bleibt der Service verfügbar.
:::

## Verwandte Seiten

- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Proxmox Cluster](../proxmox/index.md) -- MeshCommander verwaltet AMT-fähige Hardware
