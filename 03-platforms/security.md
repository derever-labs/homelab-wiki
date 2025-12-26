---
title: Security & Authentication
description: Keycloak, OAuth2-Proxy und Zugriffskontrolle
published: true
date: 2025-12-26T20:15:00+00:00
tags: platform, security, keycloak
editor: markdown
---

# Security Architecture

## Übersicht
Der Zugriff auf interne Services wird zentral über Traefik gesteuert, welches Authentifizierungsanfragen an Keycloak delegiert.

```
User Request -> Traefik -> ForwardAuth Middleware -> oauth2-proxy -> Backend Service
                              |
                         Keycloak OIDC
                         (Gruppenprüfung)
```

## Komponenten

### Keycloak (SSO Provider)
- **URL:** `https://sso.ackermannprivat.ch`
- **Realm:** `traefik`
- **Client:** `traefik-forward-auth`

### oauth2-proxy
Fungiert als Brücke zwischen Traefik und Keycloak. Es prüft das Session-Cookie und validiert die Gruppenzugehörigkeit.

## Zugriffsgruppen

| Gruppe | Mitglieder | Zugriff |
|--------|------------|---------|
| `admin` | samuel@... | Voller Zugriff auf alle Services (Grafana, Prowlarr, etc.) |
| `family` | corinna@... | Familien-Zugriff (Jellyseerr, Jellyfin) |
| `guest` | Andere | Limitierter Zugriff |

## Konfiguration neuer Services

Um einen Service zu schützen, muss in Traefik (bzw. im Nomad Job) die entsprechende Middleware aktiviert werden:

```hcl
tags = [
  "traefik.http.routers.my-service.middlewares=admin-chain-v2@file"
]
```

**Wichtig:** Für jeden neuen Service muss in Traefik eine Callback-Route definiert werden, damit der OAuth2-Redirect funktioniert:

```yaml
oauth2-myservice:
  rule: "Host(`myservice.ackermannprivat.ch`) && PathPrefix(`/oauth2/`)"
  service: oauth2-admin-backend
```

---
*Letztes Update: 26.12.2025*
