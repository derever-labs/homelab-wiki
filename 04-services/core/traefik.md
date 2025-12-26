---
title: Traefik Reverse Proxy
description: Zentraler Ingress und SSL-Terminierung
published: true
date: 2025-12-26T19:30:00+00:00
tags: service, core, networking
editor: markdown
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
Traefik nutzt verschiedene Sicherheitsstufen für Services:
- **admin-chain:** Zugriff nur für Administratoren.
- **family-chain:** Zugriff für Administratoren und Familienmitglieder.
- **internal-network:** Zugriff nur aus dem lokalen Netz (10.0.0.0/8).

## Wartung
### Konfiguration ändern
- **Templates (Git):** `infra/homelab-hashicorp-stack/standalone-stacks/traefik-proxy/templates/`
- **Statische Config (VM):** `/nfs/docker/traefik/traefik.yml`
- **Dynamische Config (VM):** `/nfs/docker/traefik/configurations/config.yml` (Middlewares, Routen)

Änderungen werden per Ansible verteilt:
```bash
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --tags sync-only
```

**Hinweis:** Die dynamische Konfiguration (Middlewares, OAuth2-Callbacks) wird direkt auf der VM bearbeitet und ist nicht im Git versioniert.

### Logs prüfen
```bash
ssh sam@10.0.2.1 "docker logs -f traefik"
```

---
*Letztes Update: 26.12.2025*