---
title: Referenz
description: MCP-Server, Skills und ClickUp-Integration im Homelab
tags:
  - claude-code
  - referenz
  - mcp
---

# Referenz

Homelab-spezifische Claude-Code-Integrationen. Die Basis-Konfiguration (CLAUDE.md-Hierarchie, Hooks, Circuit Breaker, Path-Deny) ist in der Team-Config dokumentiert und gilt identisch im Homelab.

## MCP-Server

| Server | Zweck |
|--------|-------|
| `playwright` | Browser-Automatisierung, u.a. für den Homegate-Scraper und Scrapfly-Migrationen |
| `clickup-hslu` | ClickUp Workspace HSLU DC |
| `clickup-privat` | ClickUp Workspace für Homelab- und persönliche Tasks |

Beide ClickUp-Server rufen `agents/scripts/clickup-mcp.sh` mit `privat` als Account-Argument auf. Die beiden API-Keys liegen im PRIVAT-Vault, weil der DC-Service-Account keine ClickUp-Credentials hat.

::: warning Privat-Token ist Voraussetzung für ClickUp-MCP
Sowohl `clickup-hslu` als auch `clickup-privat` brauchen den Privat-Token. Wer `load-secrets.sh --dc-only` aufruft und die Privat-Biometrie überspringt, bekommt **keinen** ClickUp-MCP-Server zum Laufen -- auch nicht den HSLU-Workspace.
:::

## Homelab-spezifische Skills

Skills liegen im `agents/skills/`-Verzeichnis und sind per Symlink als `~/.claude/skills/` eingebunden. Neben den Team-Skills (`nomad-deploy`, `skill-creator`) werden im Homelab-Kontext zusätzlich diese Skills verwendet:

| Skill | Zweck |
|-------|-------|
| `homegate-scan` | Immobilien-Scanner für Homegate, füttert das Immo-Monitor-Projekt |
| `neubau-research` | Tiefenrecherche für Neubauprojekte (Archiv-Extraktion, historische Preise) |
| `ics` | ICS-Kalender-Export aus unstrukturiertem Text |
| `wiki-update` | Systematische Revision von Homelab- und IT-Wiki |

## ClickUp-Workspaces

- **clickup-hslu** -- Workspace HSLU DC, Default für HSLU-Repos unter `github/HSLU_DC/`
- **clickup-privat** -- Workspace Familie Ackermann, Default für private Repos und Homelab-Arbeit

Die Workspace-Wahl orientiert sich am Current Working Directory: Repos unter `github/HSLU_DC/` landen in HSLU, sonst in Privat.

Details zur IT-Task-Liste und zum Tracking-Workflow liegen unter [Claude Task-Tracking](../_querschnitt/claude-task-tracking.md).
