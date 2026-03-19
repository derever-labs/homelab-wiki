---
title: Cluster-Neustart
description: Anleitung zum sicheren Neustart des gesamten HashiCorp Stacks
tags:
  - runbook
  - maintenance
  - nomad
  - consul
  - vault
---

# Cluster Restart Runbook

In manchen Situationen (z.B. nach einem Stromausfall oder bei massiven Quorum-Problemen) ist ein kontrollierter Neustart des gesamten HashiCorp Stacks notwendig. Dieses Runbook beschreibt die korrekte Reihenfolge und die Verifikationsschritte nach jedem Schritt.

## Voraussetzungen

- SSH-Zugang zu allen Server- und Client-Nodes
- Vault Unseal-Keys (in Vaultwarden gespeichert)
- Nomad ACL Token (für Job-Management)

## Wichtige Reihenfolge

Die Dienste müssen in dieser exakten Reihenfolge gestartet werden:

1. **Consul** -- Service Discovery und Key/Value Store (Basis für alles)
2. **Vault** -- Secrets Management (muss nach Start "unsealed" werden)
3. **Nomad** -- Job Orchestration (benötigt Consul und Vault)

## Schritt-für-Schritt Anleitung

### 1. Consul Cluster starten und prüfen

Consul muss auf allen drei Server-Nodes (vm-nomad-server-04/05/06) laufen. Die Nodes bilden ein Raft-Cluster und benötigen mindestens 2 von 3 Nodes für ein Quorum.

**Verifikation:**
- `consul members` -- alle 3 Server-Nodes müssen als `alive` erscheinen
- `consul operator raft list-peers` -- ein Leader muss gewählt sein
- Consul UI prüfen (Port 8500) -- Dashboard zeigt Cluster-Gesundheit

Falls das Quorum verloren ging: den Consul-Service auf allen Nodes nacheinander stoppen und neu starten. Bei drei Nodes reicht ein Neustart aller Agents in der Regel aus, damit ein neuer Leader gewählt wird.

### 2. Vault Unsealing

Vault startet immer versiegelt (sealed). Ohne Unseal können Nomad-Jobs keine Secrets aus Vault lesen, was zum Fehlstart vieler Services führt.

1. Vault UI aufrufen (Port 8200 auf einem Server-Node)
2. Die Unseal-Keys eingeben (gespeichert in Vaultwarden)
3. Anmeldung mit Root-Token oder Admin-Token

**Verifikation:**
- `vault status` -- `Sealed: false` und `Cluster Leader` muss gesetzt sein
- Im Vault UI: unter `Secrets` prüfen ob die KV-Engine erreichbar ist

### 3. Nomad Server und Clients starten

Nomad erst starten, wenn Consul stabil ist und Vault unsealed. Die Server-Nodes bilden ebenfalls ein Raft-Cluster. Die Client-Nodes verbinden sich automatisch über Consul Service Discovery.

**Verifikation:**
- `nomad server members` -- alle 3 Server-Nodes als `alive`
- `nomad node status` -- alle 3 Client-Nodes als `ready`
- Nomad UI prüfen (Port 4646) -- Cluster-Übersicht

### 4. Jobs re-evaluieren

Die meisten Nomad-Jobs starten automatisch, sobald die Clients verfügbar sind. Einige Jobs benötigen manuelle Aufmerksamkeit:

- **System-Jobs** (Zot Registry, Alloy): Starten automatisch auf allen Clients
- **Service-Jobs** (Grafana, Loki, Jellyfin): Starten automatisch, können aber bei Vault-Problemen fehlschlagen
- **Batch-Jobs** (Postgres Backup): Laufen erst zum nächsten geplanten Zeitpunkt

**Verifikation:**
- `nomad job status` -- Überblick über alle Jobs, keine `dead` Jobs die `running` sein sollten
- Nomad UI: unter "Jobs" alle als `running` markierten Jobs prüfen
- [Gatus Status-Seite](https://status.ackermannprivat.ch) -- alle Endpoints grün

### 5. Linstor/DRBD prüfen

Falls die Nomad-Clients DRBD-Storage verwenden (client-05 und client-06), muss der Linstor-Controller und die DRBD-Ressourcen geprüft werden:

- Linstor-Controller muss auf einem der Clients laufen
- DRBD-Ressourcen müssen synchron sein (kein `Outdated` oder `StandAlone` Status)

## Notfall-Szenario: Split Brain

Falls Consul keine Leader-Wahl mehr durchführen kann (kein Quorum möglich):

1. Alle Consul-Dienste auf allen Nodes stoppen
2. Die `peers.json`-Datei manuell bereinigen (siehe HashiCorp Outage Recovery Dokumentation)
3. Einen einzelnen Node als Bootstrap-Leader starten
4. Weitere Nodes einzeln nacheinander hinzufügen
5. Warten bis das Quorum wiederhergestellt ist

## Verwandte Seiten

- [HashiCorp Stack](../nomad/index.md) -- Architektur und Konfiguration von Consul, Vault, Nomad
- [Kontrolliertes Herunterfahren](./smart-shutdown.md) -- Drain-Prozess für einzelne Nomad-Nodes
- [Linstor/DRBD](../linstor-storage/index.md) -- Storage-Cluster und DRBD-Ressourcen
- [Batch Jobs](./batch-jobs.md) -- Periodische Jobs die nach einem Restart ggf. manuell angestossen werden müssen
