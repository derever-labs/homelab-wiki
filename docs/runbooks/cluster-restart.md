---
title: Cluster-Neustart
description: Anleitung zum sicheren Neustart des gesamten HashiCorp Stacks
tags:
  - runbook
  - maintenance
  - nomad
  - consul
---

# Cluster Restart Runbook

In manchen Situationen (z.B. nach einem Stromausfall oder bei massiven Quorum-Problemen) ist ein kontrollierter Neustart des Stacks notwendig.

## Wichtige Reihenfolge
Die Dienste müssen in dieser exakten Reihenfolge gestartet werden:
1. **Consul** (Service Discovery & Key/Value Store)
2. **Vault** (Secrets Management - muss nach Start "unsealed" werden)
3. **Nomad** (Job Orchestration)

## Schritt-für-Schritt Anleitung

### 1. Consul Cluster prüfen
Sicherstellen, dass Consul auf allen Server-Nodes läuft (`consul members`). Falls das Quorum verloren ging, den Consul-Service auf allen Nodes neu starten.

### 2. Vault Unsealing
Vault startet versiegelt (sealed). Ohne Unseal können Nomad-Jobs keine Secrets lesen.
1. Vault UI aufrufen: `http://10.0.2.104:8200`
2. Die Unseal-Keys eingeben (zu finden in Vaultwarden/Keepass).
3. Status prüfen mit `vault status`.

### 3. Nomad Server & Clients
Nomad erst starten, wenn Consul stabil ist. Danach mit `nomad node status` prüfen, ob alle Nodes online sind.

### 4. Jobs re-evaluieren
Meistens starten die Jobs automatisch. Falls nicht, den Job-Status prüfen und bei Bedarf manuell starten (Job-Files unter `/nfs/nomad/jobs/`).

## Notfall-Szenario: Split Brain
Falls Consul keine Leader-Wahl mehr durchführen kann:
1. Alle Consul-Dienste stoppen.
2. Den `peers.json` File manuell bereinigen (siehe HashiCorp Dokumentation).
3. Nodes einzeln nacheinander starten.

---
*Letztes Update: 26.12.2025*