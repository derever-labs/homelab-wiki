---
title: Querschnitt
description: Anleitungen die mehrere Systeme betreffen
tags:
  - querschnitt
  - architektur
---

# Querschnitt

Dieser Bereich enthält Anleitungen und Konzepte, die mehrere Systeme gleichzeitig betreffen. Während die Service-Seiten jeweils ein einzelnes System dokumentieren, beschreiben die Querschnitt-Seiten das Zusammenspiel und übergreifende Architekturentscheidungen.

## Runbooks

- [Cluster Cold-Start Runbook](./cold-start-runbook.md) -- Reihenfolge und Henne-Ei-Probleme beim Hochfahren nach Komplett-Ausfall
- [Cluster-Neustart](./cluster-restart.md) -- Sicherer Neustart des gesamten HashiCorp Stacks
- [Kontrolliertes Herunterfahren](./smart-shutdown.md) -- Smart Shutdown für Nomad-Clients mit Linstor/DRBD-Storage
- [Post-Mortems](./postmortems/) -- Strukturierte Nachschau bei Incidents über 2 Stunden Dauer oder mit Multi-Node-Impact
- [Incident-Template](./incident-template.md) -- Vorlage für Post-Mortem-Einträge

## Architektur und Konzepte

- [Service-Abhängigkeiten](./service-abhaengigkeiten.md) -- Abhängigkeitsdiagramm aller Services
- [Datenbank-Architektur](./datenbank-architektur.md) -- PostgreSQL und MariaDB Shared Cluster mit DRBD-Replikation
- [Datenstrategie und Replikation](./datenstrategie.md) -- Speicher-Ebenen, PostgreSQL-Strategie und Backup-Konzepte
- [Cluster-Resilience](./cluster-resilience.md) -- Architektur-Strategie gegen die Cluster-Restart-Cascade
- [Sicherheit und Authentifizierung](./security/) -- Authentik, CrowdSec und Zugriffskontrolle im Zusammenspiel
- [Secrets-Architektur](./secrets-architecture.md) -- Migration von 1Password zu Vault als zentralem Trust-Anchor
- [App-Standard](./app-standard/) -- Wiederverwendbarer Build- und Deploy-Standard für selbst gebaute Homelab-Apps

## Wartung und Updates

- [Batch Jobs](./batch-jobs.md) -- Übersicht aller periodischen Nomad-Jobs für Wartung, Backup, Monitoring und Updates
- [System-Updates](./system-updates.md) -- Konsolidierte Ansible-Playbooks für apt-Updates auf VMs und Hypervisor
- [Renovate](./renovate.md) -- Automatische Docker-Image-Updates via GitHub Pull Requests
- [Docker Major-Version-Upgrade](./docker-major-update.md) -- Was beim Major-Wechsel passiert und wie die Ansible-Rolle das mitigiert

## Claude-Agent und Arbeitsorganisation

- [Claude Code](./claude-code/) -- Claude-Agent-Setup, MCP-Server und Skills im Homelab-Kontext
- [Secrets (Claude-Agent)](./secrets/) -- PRIVAT-Agent-Vault-Struktur für Claude Code
- [Claude Code Config-Sync](./claude-code-sync.md) -- Geteilte Konfiguration zwischen beiden macOS-Accounts
- [Claude Task-Tracking](./claude-task-tracking.md) -- Wie Claude Code Homelab-Aufgaben über ClickUp trackt
- [ClickUp Multi-Instance](./clickup-multi-instance.md) -- Zwei ClickUp-Instanzen gleichzeitig auf macOS
- [Zeiterfassung](./zeiterfassung/) -- solidtime und Kimai mit automatischer Geofence-Steuerung via n8n

## Verwandte Seiten

- [Globale Referenz](../_referenz/index.md) -- Systemübergreifende Fakten und Tabellen
- [Homelab Wiki](../index.md) -- Startseite mit Schnelleinstieg
