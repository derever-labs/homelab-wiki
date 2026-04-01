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
| **Deployment** | Docker Compose auf vm-proxy-dns-01 |
| **Dashboard** | [traefik.ackermannprivat.ch](https://traefik.ackermannprivat.ch) |
| **Auth** | `admin-chain-v2@file` (OAuth Admin) |

## Rolle im Stack

Traefik ist der zentrale Reverse Proxy und Ingress-Controller für das gesamte Homelab. Alle HTTP/HTTPS-Anfragen von aussen und intern laufen über Traefik, das SSL terminiert, Authentifizierung erzwingt und Requests an die richtigen Backend-Services weiterleitet.

## SSL-Terminierung

Traefik bezieht automatisch TLS-Zertifikate via Let's Encrypt mit der Cloudflare DNS Challenge. Der Cloudflare API-Token ist in der statischen Konfiguration hinterlegt. Zertifikate werden automatisch erneuert und für alle konfigurierten Domains (*.ackermannprivat.ch) ausgestellt. Interne Clients sprechen Traefik über HTTPS an, die Kommunikation zu den Backends erfolgt unverschlüsselt über das interne Netzwerk.

## Consul Catalog Integration

Traefik nutzt den Consul Catalog Provider für automatische Service Discovery. Nomad-Jobs, die sich in Consul registrieren, werden von Traefik automatisch als Backend erkannt. Die Routing-Konfiguration (Host-Regel, Middleware-Chain) erfolgt über Consul Service Tags im Nomad Job. Dadurch müssen neue Services nicht manuell in Traefik konfiguriert werden -- ein Nomad-Deploy reicht aus.

Für Standalone-Services (Docker Compose auf vm-proxy-dns-01) wird der Docker Provider verwendet. Traefik erkennt diese Container über Docker Labels.

## Authentifizierung (Middlewares)

Traefik nutzt v2 Middleware Chains mit OAuth2-Proxy und Keycloak. Vollständige Dokumentation: [Traefik Middleware Chains](./referenz.md)

Kurzübersicht:
- **public-*-chain-v2:** CrowdSec + OAuth2 (für externen Zugriff)
- **intern-*-chain-v2:** OAuth2 + IP-Whitelist (für internen Zugriff)
- **admin-chain-v2:** OAuth2 Admin ohne IP-Einschränkung (z.B. Traefik Dashboard)

## Security

CrowdSec läuft als Bouncer-Plugin in Traefik und blockiert automatisch IP-Adressen bei erkannten Angriffen (Brute-Force, Scans). Details zur CrowdSec-Integration: [CrowdSec](../crowdsec/index.md)

## Docker Compose Deployment

Traefik läuft als Docker Compose Stack auf vm-proxy-dns-01 zusammen mit weiteren Infrastruktur-Services (OpenLDAP, Keycloak, OAuth2-Proxy, Pi-hole). Die Compose-Konfiguration wird durch die Ansible-Rolle `traefik-proxy` verwaltet und aus Templates generiert.

## Wartung

### Konfiguration ändern

- **Templates (Git):** `infra/homelab-hashicorp-stack/standalone-stacks/traefik-proxy/templates/`
- **Statische Config (VM):** `/nfs/docker/traefik/traefik.yml`
- **Dynamische Config (VM):** `/nfs/docker/traefik/configurations/config.yml` (Middlewares, Routen)

Änderungen werden per Ansible Role `traefik-proxy` verteilt.

**Hinweis:** Die dynamische Konfiguration (Middlewares, OAuth2-Callbacks) wird direkt auf der VM bearbeitet und ist nicht im Git versioniert.

## Boot-Abhängigkeit (NFS)

Traefik mountet Konfiguration und ACME-Zertifikate von NFS (`/nfs/docker/traefik/`). Beim Systemstart muss der NFS-Mount bereit sein bevor Docker die Container startet, sonst schlägt der Bind-Mount von `acme.json` fehl (Docker erstellt ein Verzeichnis statt die Datei zu finden → OCI runtime error).

**Lösung:** Ein systemd Drop-In `/etc/systemd/system/docker.service.d/wait-for-nfs.conf` stellt sicher, dass Docker erst nach den NFS-Mounts startet:

```ini
[Unit]
After=nfs-docker.mount nfs-cert.mount
Requires=nfs-docker.mount nfs-cert.mount
```

Wird automatisch über die Ansible-Rolle `traefik-proxy` verteilt.

::: warning Traefik startet nicht nach Reboot
Falls Traefik nach einem Reboot nicht läuft: `docker start traefik`. Danach oauth2-proxy prüfen (`docker logs oauth2-proxy`) -- er braucht Traefik + Keycloak für OIDC Discovery und restartet automatisch.
:::

## Verwandte Seiten

- [Traefik Middleware Chains](./referenz.md) -- Vollständige Middleware-Dokumentation
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking und Threat Intelligence
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für *.ackermannprivat.ch
- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- Keycloak/LDAP-Stack auf derselben VM
- [Netzwerk-Topologie](../netzwerk/index.md) -- Netzwerkarchitektur und Routing