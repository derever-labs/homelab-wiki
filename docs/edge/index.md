---
title: Ingress, Auth und Edge
description: Oberkapitel für den Zugriffspfad ins Homelab -- Traefik als Reverse Proxy, Authentik als Identity Provider, CrowdSec als Intrusion Prevention und der LDAP-Outpost
tags:
  - overview
  - edge
  - security
---

<!-- Übergangs-Stub, wird durch Big-Picture-Seite ersetzt, ClickUp 86carpf04 -->

# Ingress, Auth und Edge

Dieses Kapitel bündelt den Zugriffspfad ins Homelab: Traefik terminiert TLS und routet alle HTTP-Zugriffe, Authentik liefert Identität und SSO, CrowdSec blockt auffällige IPs am Edge. Der LDAP-Outpost stellt ein Bind-Interface für Dienste bereit, die kein OAuth sprechen.

## Systeme

- [Traefik](./traefik/) -- Reverse Proxy, TLS-Terminierung, Routing
- [Authentik](./authentik/) -- Identity Provider, SSO, ForwardAuth, OIDC
- [CrowdSec](./crowdsec/) -- Intrusion Prevention, Bouncer-Middleware
- [LDAP im Homelab](./ldap.md) -- Authentik LDAP-Outpost als Bind-Interface
