---
title: Docker Major-Version-Upgrade
description: Was beim Wechsel auf eine neue Docker-Major-Version passiert und wie die Ansible-Rolle das mitigiert
tags:
  - docker
  - maintenance
  - ansible
  - nomad
---

# Docker Major-Version-Upgrade

Beim Wechsel auf eine neue Docker-Major-Version (z.B. 28 nach 29) ändert sich die systemd-socket-activation-Mechanik. Wenn dockerd zwischenzeitlich mit `failed to load listeners: no sockets found via socket activation` failt, blockiert systemd nach 3 Restart-Versuchen weitere Starts über `StartLimitBurst`. Der Service bleibt dann im Failure-State, obwohl das Update grundsätzlich erfolgreich war.

## Beobachtetes Symptom

- `systemctl status docker` zeigt `Active: failed (Result: exit-code)` mit Exit-Code 1
- journalctl-Eintrag: `failed to load listeners: no sockets found via socket activation: make sure the service was started by systemd`
- Folgemeldung: `docker.service: Start request repeated too quickly. Failed with result 'exit-code'`
- `/var/run/docker.sock` existiert möglicherweise als alter, ungenutzter Socket

Die laufenden Container überleben das Update dank `live-restore: true` in der `daemon.json` -- der Plugin-IPC zum Nomad-Agent reisst trotzdem kurz ab. Pre-Drain-Handler verhindert dass Allocs als failed markiert werden.

## Mitigation in der Ansible-Rolle

Implementiert in `ansible/roles/docker/tasks/main.yml` direkt nach dem `Install Docker`-Task. Die Pre-Task `Reset failed docker.service / docker.socket` ruft `systemctl reset-failed` auf -- idempotent (`changed_when: false`, `failed_when: false`), schadet nicht wenn nichts failed ist, räumt aber den systemd-StartLimit-State nach einem Major-Update auf, sodass der nächste `systemctl start` sauber läuft.

Eingebaut nach Vorfall 2026-04-29 (Docker 28.2.2 nach 29.4.1 auf allen drei Homelab-Nomad-Clients hat das Problem reproduzierbar gezeigt -- manuelles `reset-failed` war pro Node nötig).

## Wenn der reset-failed-Task nicht reicht

In seltenen Fällen (z.B. nicht-deterministische Race Conditions) kann der Service trotz reset-failed nicht starten. Ablauf zur manuellen Recovery: `systemctl reset-failed docker.service docker.socket` ausführen, dann `systemctl start docker.socket` und danach `systemctl start docker.service`. Die explizite Reihenfolge socket-vor-service ist wichtig für die Activation-Mechanik.

## Bezug zu Pre-Drain-Handler

Der Pre-Drain-Handler (`ansible/roles/docker/handlers/main.yml`) draint einen Node komplett bevor er einen Docker-Restart triggert. Bei einem Major-Version-Upgrade ist das doppelt sinnvoll: Allocs sind sicher migriert, und der reset-failed-Pre-Task räumt anschliessend den systemd-State. Die Kombination aus beiden ist die robuste Antwort auf Docker-Updates.

Die Docker-API-Version kann sich bei einem Major-Upgrade ebenfalls ändern, was kompatibilitäts-relevante Tools betreffen kann (z.B. `skopeo copy docker-daemon:` in Docker 29.x).

::: warning Untersuchung pro Major-Update
Vor jedem Major-Version-Upgrade die Release-Notes der Docker-Engine prüfen. Das `reset-failed`-Pattern adressiert systemd-Symptome, aber andere Breaking Changes (Storage-Driver, Networking, API) erfordern eigene Vorbereitung.
:::

## Verwandte Seiten

- [Querschnitts-Themen](./index.md)
