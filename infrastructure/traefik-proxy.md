---
title: Traefik Proxy Stack
description:
published: true
date: 2025-12-26T17:52:13+00:00
tags:
editor: markdown
dateCreated: 2025-12-26T17:52:13+00:00
---

## Übersicht

Zentralisierte Konfiguration für VM `vm-proxy-dns-01` (10.0.2.1).

## Services

| Service | Beschreibung |
|---------|--------------|
| Traefik | Reverse Proxy mit Let's Encrypt (Cloudflare DNS Challenge) |
| Keycloak 20.0 | OIDC/SSO Provider (Quarkus-basiert) |
| OAuth2-Proxy | Gruppenbasierte Auth (admin/family/guest) |
| traefik-forward-auth | Forward-Auth Middleware |
| OpenLDAP + phpLDAPadmin | LDAP Directory |
| dnsmasq | Lokaler DNS Server |
| Pi-hole | DNS-based Ad Blocking |
| Unbound | Recursive DNS Resolver |
| CrowdSec | Intrusion Detection |
| Cloudflare DDNS | Dynamic DNS Updates |
| Watchtower | Automatische Container Updates |
| Portainer | Docker Management UI |

## Deployment

### Voraussetzungen

1. Ansible mit ansible-vault Passwort konfiguriert
2. SSH-Zugang zu vm-proxy-dns-01

### Secrets verschlüsseln

```bash
cd standalone-stacks/traefik-proxy
ansible-vault encrypt vars/secrets.yml
```

### Deployment ausführen

```bash
# Vollständiges Deployment
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --ask-vault-pass

# Nur Konfiguration synchronisieren
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --ask-vault-pass --tags sync-only

# Nur docker-compose ausführen
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --ask-vault-pass --tags deploy-only

# Mit Image-Pull
ansible-playbook standalone-stacks/traefik-proxy/deploy.yml --ask-vault-pass -e "pull_images=true"
```

## Verzeichnisstruktur

```
traefik-proxy/
├── configs/
│   ├── keycloak_themes/keywind/    # Keycloak Login Theme
│   ├── nginx/
│   │   ├── config/                 # nginx Konfiguration
│   │   └── error-pages/            # Custom Error Pages
│   └── oauth2-proxy-templates/     # OAuth2 Error Templates
├── templates/
│   └── docker-compose.yml.j2       # Jinja2 Template
├── vars/
│   ├── secrets.yml                 # Verschlüsselte Secrets
│   └── secrets.yml.example         # Template für Secrets
├── deploy.yml                      # Ansible Playbook
└── docker-compose.yml              # Referenz (Original von VM)
```

## Secrets

Die `vars/secrets.yml` enthält:

- Cloudflare API Credentials
- Keycloak Passwörter
- OIDC Client Secrets
- OAuth2 Cookie Secrets
- LDAP Passwörter
- SMTP Credentials
- Telegram Bot Token

## Keycloak 20.0 (Quarkus)

Wichtige Unterschiede zu älteren Versionen:

| Alt | Neu |
|-----|-----|
| `/auth/realms/` | `/realms/` |
| `/auth/admin/` | `/admin/` |
| `KEYCLOAK_*` | `KC_*` |

## OAuth2 Callback-Routen

**Wichtig**: Bei jedem neuen Service mit OAuth2-Auth muss eine Callback-Route hinzugefügt werden!

### Konfigurationsdatei

`/nfs/docker/traefik/configurations/config.yml` auf vm-proxy-dns-01

### Neue Route hinzufügen

```yaml
oauth2-<service-name>:
  entryPoints:
    - "https"
  rule: "Host(`<hostname>.ackermannprivat.ch`) && PathPrefix(`/oauth2/`)"
  tls: {}
  service: oauth2-admin-backend  # oder oauth2-family-backend
  priority: 1000
```

### Prüfen auf fehlende Routen

```bash
ssh sam@10.0.2.1 'curl -s http://localhost:8080/api/http/routers' > /tmp/routes.json
```

### Nach Änderungen

```bash
# YAML-Syntax prüfen
python3 -c "import yaml; yaml.safe_load(open('config.yml'))"
# Traefik lädt Änderungen automatisch (File Provider mit Watch)
```
