---
title: Claude Code
description: Claude Code im Homelab-Kontext
tags:
  - claude-code
  - tooling
  - ai
---

# Claude Code

Claude Code wird im Homelab für Infrastruktur-Arbeit, Scraper-Pflege und Wiki-Revisionen eingesetzt. Die gemeinsame Team-Konfiguration liegt im DCLab-Repo `HSLU_DC/agents` -- für Homelab-Nutzung kommt ein zweiter 1Password-Service-Account und eigene private Skills dazu.

## Beziehung zum DCLab-Setup

Das `agents`-Repo definiert die Team-Konvention (AGENT.md, Hooks, Secrets-Konzept, Wiki-Richtlinien). Das Tooling ist dual-account-fähig: derselbe Script-Satz kann den DC-Vault und den Privat-Vault laden, gesteuert über Flags oder separate Cache-Files.

Die konzeptionelle Secrets-Architektur (drei Stufen, `op run`-Masking, Path-Deny) ist identisch zum DCLab und wird im DCLab-AI-Wiki beschrieben. Dieses Wiki dokumentiert ausschliesslich die **Homelab-spezifischen** Anteile:

- Welcher Vault wird verwendet und welche Items liegen darin
- Welche MCP-Server kommen im Homelab-Kontext dazu
- Welche Skills sind Homelab-spezifisch

## Dual-Account-Setup

Für Homelab-Arbeit braucht Claude zusätzlich zum DCLab-Service-Account einen zweiten 1Password-Service-Account mit Read-Zugriff auf den privaten Vault. `load-secrets.sh` lädt beide Tokens separat und cached sie in `/tmp/op-token-dc` und `/tmp/op-token-privat`. Der SessionStart-Hook meldet, welche Accounts geladen sind.

## Weiterführend

- [Referenz](referenz.md) -- MCP-Server, Skills und ClickUp-Integration im Homelab
- [Secrets im Homelab](../secrets/index.md) -- PRIVAT-Agent-Vault-Struktur
