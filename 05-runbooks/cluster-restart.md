---
title: Cluster Restart Runbook
description: Anleitung zum sicheren Neustart des gesamten HashiCorp Stacks
published: true
date: 2025-12-26T18:30:00+00:00
tags: runbook, maintenance, nomad, consul
editor: markdown
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
Stellen Sie sicher, dass Consul auf allen Server-Nodes läuft:
```bash
ssh sam@10.0.2.104 "consul members"
```
Falls das Quorum verloren ging, Consul auf allen Nodes neu starten:
```bash
sudo systemctl restart consul
```

### 2. Vault Unsealing
Vault startet versiegelt (sealed). Ohne Unseal können Nomad-Jobs keine Secrets lesen.
1. Vault UI aufrufen: `http://10.0.2.104:8200`
2. Die Unseal-Keys eingeben (zu finden in Vault-Warden/Keepass).
3. Status prüfen: `vault status`

### 3. Nomad Server & Clients
Nomad erst starten, wenn Consul stabil ist.
```bash
sudo systemctl start nomad
```
Prüfen, ob die Nodes wieder online kommen:
```bash
nomad node status
```

### 4. Jobs re-evaluieren
Meistens starten die Jobs automatisch. Falls nicht:
```bash
nomad job status
# Falls nötig:
nomad job run /nfs/nomad/jobs/critical-service.nomad
```

## Notfall-Szenario: Split Brain
Falls Consul keine Leader-Wahl mehr durchführen kann:
1. Alle Consul-Dienste stoppen.
2. Den `peers.json` File manuell bereinigen (siehe HashiCorp Dokumentation).
3. Nodes einzeln nacheinander starten.

---
*Letztes Update: 26.12.2025*