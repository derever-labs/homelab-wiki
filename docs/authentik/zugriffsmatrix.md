---
title: Zugriffsmatrix
description: Automatisch generierte Liste der Authentik-Applications und ihrer Gruppen-Zugriffe
tags:
  - authentik
  - sso
  - zugriff
---

# Zugriffsmatrix

Diese Seite wird bei jedem Wiki-Build aus der Authentik-API generiert. Sie zeigt:

- welche Authentik-Gruppen welche Applications starten koennen
- die Bedingungen referenzierter Policies (Expression-Policies werden inline gezeigt)
- welche Cluster-Apps eine Web-UI ueber Traefik haben, aber weder eine SSO-Middleware tragen noch als Authentik-Application registriert sind (Gap-Analyse)

Neue Apps oder Binding-Aenderungen in Authentik sind beim naechsten Wiki-Build sichtbar -- ohne manuellen Eingriff. Schlaegt das Update fehl (Authentik nicht erreichbar, Token abgelaufen), bleibt der letzte erfolgreich generierte Stand stehen.

Erzeugung: [`scripts/gen-authentik-zugriffsmatrix.mjs`](https://github.com/derever-labs/homelab-wiki/blob/main/scripts/gen-authentik-zugriffsmatrix.mjs).

<!--@include: ./.generated/zugriffsmatrix.md-->
