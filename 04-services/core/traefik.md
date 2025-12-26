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
- **Authentication:** Forward-Auth Middleware integriert mit Keycloak (SSO).
- **Service Discovery:** Findet Nomad-Jobs automatisch via Consul-Catalog.

## Authentifizierung (Middlewares)
Traefik nutzt verschiedene Sicherheitsstufen für Services:
- **admin-chain:** Zugriff nur für Administratoren.
- **family-chain:** Zugriff für Administratoren und Familienmitglieder.
- **internal-network:** Zugriff nur aus dem lokalen Netz (10.0.0.0/8).

## Wartung
### Konfiguration ändern
Die statische Konfiguration liegt in `infra/homelab-hashicorp-stack/standalone-stacks/traefik-proxy/`.
Änderungen werden per Ansible verteilt:
```bash
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --tags sync-only
```

### Logs prüfen
```bash
ssh sam@10.0.2.1 "docker logs -f traefik"
```

---
*Letztes Update: 26.12.2025*