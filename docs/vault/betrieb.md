---
title: Vault - Betrieb
description: Betriebskonzepte für den Vault Raft Cluster
tags:
  - vault
  - betrieb
---

# Vault - Betrieb

## Übersicht

Der Vault-Cluster besteht aus drei Nodes und bildet das zentrale Secret-Management des Homelabs.

- Drei-Node Raft Cluster auf vm-nomad-server-04, vm-nomad-server-05 und vm-nomad-server-06
- KV v2 Secret Engine für versionierte Secrets
- Workload Identity (JWT) für Nomad-Jobs -- ermöglicht tokenlose Secret-Injection
- Audit Logging aktiv -- alle Zugriffe werden protokolliert

## Abhängigkeiten

Vault ist von folgenden Komponenten abhängig, um korrekt zu funktionieren:

- **Raft-Quorum:** Mindestens 2 von 3 Nodes müssen erreichbar sein -- sowohl für Lese- als auch Schreiboperationen
- **Nomad JWKS-Endpunkt:** Für die Workload Identity Validierung ruft Vault den JWKS-Endpunkt von Nomad ab; ist Nomad nicht erreichbar, schlägt die JWT-Authentifizierung fehl
- **Consul:** Service Discovery via `vault.service.consul`; Vault selbst läuft ohne Consul als Storage-Backend (Raft), nutzt Consul aber für die Erreichbarkeit im Netz

## Automatisierung

### Auto-Unseal

Vault startet nach einem Neustart versiegelt. Der Systemd Service `vault-unseal.service` läuft auf jedem Node und liest Unseal Keys aus `/root/vault-keys.json`. Er entsiegelt Vault automatisch innerhalb weniger Sekunden nach dem Systemstart -- ohne manuellen Eingriff.

### Audit Log Rotation

Die Audit Logs werden via logrotate verwaltet: tägliche Rotation, 30 Tage Aufbewahrung, komprimiert. Ältere Logs werden automatisch gelöscht.

### Raft Snapshots

Das Raft-Protokoll erstellt automatisch interne Snapshots zur Zustandssicherung. Kein zusätzlicher Prozess erforderlich.

## Bekannte Einschränkungen

::: warning Sealed State nach Neustart
Vault startet immer im versiegelten Zustand. Der Auto-Unseal Service `vault-unseal.service` löst das normalerweise innerhalb weniger Sekunden nach dem Systemstart. Bleibt Vault versiegelt, ist der Service fehlgeschlagen.
:::

::: warning Quorum-Verlust
Sind 2 von 3 Nodes offline, verliert Vault sein Raft-Quorum und ist vollständig nicht verfügbar -- weder lesend noch schreibend. Der Cluster erholt sich automatisch, sobald genug Nodes wieder erreichbar sind.
:::

- **Kein TLS:** Bewusste Homelab-Entscheidung. Im isolierten Netz kein Sicherheitsrisiko -- würde aber in einer produktiven Umgebung zwingend sein.
- **KV v2 Überschreiben:** Ein schreibender Zugriff auf ein Secret ersetzt alle Keys des Secrets, nicht nur den angegebenen. Sollen nur einzelne Keys aktualisiert werden, müssen alle bestehenden Keys mitgeschrieben werden.

## Credentials

Root Token und Unseal Keys sind in [Credentials](../_referenz/credentials.md) hinterlegt.

::: danger Sicherheitskritisch
Die Unseal Keys und der Root Token ermöglichen vollen Zugriff auf alle Secrets. Speicherort und Zugang ausschliesslich über den verlinkten Credentials-Eintrag.
:::

## Verwandte Seiten

- [Vault Übersicht](index.md)
- [Vault Referenz](referenz.md)
- [Credentials](../_referenz/credentials.md)
- [Nomad](../nomad/)
