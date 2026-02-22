---
title: Traefik Reverse Proxy
description: Zentraler Ingress und SSL-Terminierung
tags:
  - service
  - core
  - networking
---

# Traefik Reverse Proxy

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **IP** | 10.0.2.1 |
| **Deployment** | Docker Compose (Standalone) |
| **Dashboard** | [traefik.ackermannprivat.ch](https://traefik.ackermannprivat.ch) |

## Funktionen
- **SSL-Terminierung:** Automatische Zertifikate via Let's Encrypt (Cloudflare DNS Challenge).
- **Authentication:** OAuth2-Proxy Middleware integriert mit Keycloak (SSO).
- **Service Discovery:** Findet Nomad-Jobs automatisch via Consul-Catalog.
- **Security:** CrowdSec Bouncer für automatisches IP-Blocking bei Angriffen.
- **Rate Limiting:** Fail2ban-ähnliche Funktionalität via CrowdSec.

## Authentifizierung (Middlewares)

Traefik nutzt v2 Middleware Chains mit OAuth2-Proxy und Keycloak. Vollstaendige Dokumentation: [Traefik Middleware Chains](../../03-platforms/traefik-middlewares.md)

Kurzuebersicht:
- **public-*-chain-v2:** CrowdSec + OAuth2 (fuer externen Zugriff)
- **intern-*-chain-v2:** OAuth2 + IP-Whitelist (fuer internen Zugriff)
- **intern-chain:** Nur IP-Whitelist (ohne Authentifizierung)
- **admin-chain-v2:** OAuth2 Admin ohne IP-Einschraenkung (z.B. Traefik Dashboard)

## Wartung
### Konfiguration ändern
- **Templates (Git):** `infra/homelab-hashicorp-stack/standalone-stacks/traefik-proxy/templates/`
- **Statische Config (VM):** `/nfs/docker/traefik/traefik.yml`
- **Dynamische Config (VM):** `/nfs/docker/traefik/configurations/config.yml` (Middlewares, Routen)

Änderungen werden per Ansible Role `traefik-proxy` verteilt.

**Hinweis:** Die dynamische Konfiguration (Middlewares, OAuth2-Callbacks) wird direkt auf der VM bearbeitet und ist nicht im Git versioniert.