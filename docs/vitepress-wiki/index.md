---
title: VitePress Wiki
description: Homelab-Dokumentation mit automatischem Deployment
tags:
  - service
  - core
  - wiki
  - vitepress
---

# VitePress Wiki

Das Homelab-Wiki wird mit VitePress gebaut und via Nomad als statische Seite serviert, mit automatischem Deployment über GitHub Webhooks.

Technische Details (Nomad-Tasks, VitePress-Konfiguration, Vault-Secrets) siehe [Referenz](./referenz.md), die Build- und Webhook-Automatik siehe [Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [wiki.ackermannprivat.ch](https://wiki.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/vitepress-wiki.nomad` |
| Auth | Authentik ForwardAuth (`intern-auth@file`) |

## Rolle im Stack

Das VitePress Wiki ist die zentrale Dokumentations-Plattform des Homelabs. Es wird bei jedem Push auf `main` automatisch via Self-Hosted Runner gebaut und per Webhook neu deployt. Ablauf der Build- und Deploy-Pipeline: [Betrieb](./betrieb.md).

## Richtlinien

Inhaltliche Regeln und Formatierungs-Konventionen: [Wiki-Richtlinien](../wiki-richtlinien.md)

## Verwandte Seiten

- [Referenz](./referenz.md) -- Nomad-Tasks, VitePress-Konfiguration und Vault-Secrets
- [Betrieb](./betrieb.md) -- Build-, Webhook- und Deploy-Automatik
- [GitHub Runner](../github-runner/index.md) -- Self-Hosted Runner für CI/CD des Wiki-Builds
- [Traefik Reverse Proxy](../edge/traefik/index.md) -- Ingress und SSL-Terminierung für wiki.ackermannprivat.ch
- [Wiki-Richtlinien](../wiki-richtlinien.md) -- Formatierungs- und Inhaltskonventionen
