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
| **Version** | v3.4 (gepinnt) |
| **Deployment** | Docker Compose auf vm-proxy-dns-01 |
| **Dashboard** | [traefik.ackermannprivat.ch](https://traefik.ackermannprivat.ch) |
| **Auth** | `intern-auth@file` (Authentik) |

## Rolle im Stack

Traefik ist der zentrale Reverse Proxy und Ingress-Controller für das gesamte Homelab. Alle HTTP/HTTPS-Anfragen von aussen und intern laufen über Traefik, das SSL terminiert, Authentifizierung erzwingt und Requests an die richtigen Backend-Services weiterleitet.

## SSL-Terminierung

Traefik bezieht automatisch TLS-Zertifikate via Let's Encrypt mit der Cloudflare DNS Challenge (ACME `keyType: EC256`). Der Cloudflare API-Token ist in der statischen Konfiguration hinterlegt. Zertifikate werden automatisch erneuert und für alle konfigurierten Domains (`*.ackermannprivat.ch`) ausgestellt. Interne Clients sprechen Traefik über HTTPS an, die Kommunikation zu den Backends erfolgt unverschlüsselt über das interne Netzwerk.

TLS ist mit expliziten Cipher Suites und `minVersion: TLS 1.2` gehärtet. Details: [Traefik Referenz -- TLS-Options](./referenz.md#tls-options)

## Consul Catalog Integration

Traefik nutzt den Consul Catalog Provider für automatische Service Discovery. Nomad-Jobs, die sich in Consul registrieren, werden von Traefik automatisch als Backend erkannt. Die Routing-Konfiguration (Host-Regel, Middleware-Chain) erfolgt über Consul Service Tags im Nomad Job. Dadurch müssen neue Services nicht manuell in Traefik konfiguriert werden -- ein Nomad-Deploy reicht aus.

Für Standalone-Services (Docker Compose auf vm-proxy-dns-01) wird der Docker Provider verwendet. Traefik erkennt diese Container über Docker Labels.

## Authentifizierung (Middlewares)

Die Authentifizierung läuft über Authentik als Identity Provider mit ForwardAuth. Vollständige Dokumentation: [Traefik Middleware Chains](./referenz.md)

Kurzübersicht:
- **intern-auth:** Authentik ForwardAuth + IP-Allowlist (für internen Zugriff mit Login)
- **public-auth:** Authentik ForwardAuth ohne IP-Einschränkung (für externen Zugriff)
- **public-noauth:** Nur CrowdSec, kein Login (öffentliche Services)
- **intern-noauth:** Nur IP-Allowlist, kein Login (interne Services ohne Auth)
- **intern-api:** IP-Allowlist für API-Endpunkte

## Observability

Traefik schreibt Access-Logs im JSON-Format mit einem Buffer von 100 Einträgen. Anfragen unter 10 ms werden nicht geloggt (Rauschen reduzieren), aber es gibt keinen Filter nach Statuscodes -- sicherheitsrelevante Fehler werden immer geloggt.

Prometheus-Metriken sind aktiv und liefern Daten für Entry Points, Router und Services. Die Metriken werden vom Prometheus-Stack im Homelab gescraped.

## Security

CrowdSec läuft als Bouncer-Plugin in Traefik und blockiert automatisch IP-Adressen bei erkannten Angriffen (Brute-Force, Scans). Details zur CrowdSec-Integration: [CrowdSec](../crowdsec/index.md)

## Docker Compose Deployment

Traefik läuft als Docker Compose Stack auf vm-proxy-dns-01. Die Compose-Konfiguration wird durch die Ansible-Rolle `traefik-proxy` verwaltet und aus Templates generiert (`standalone-stacks/traefik-proxy/templates/docker-compose.yml.j2`).

## Konfigurationsstruktur

Die dynamische Konfiguration ist in Einzeldateien aufgeteilt (statt einer monolithischen `config.yml`):

| Datei | Inhalt |
|-------|--------|
| `middlewares.yml` | Middleware-Definitionen (compress, ipAllowList, error-pages etc.) |
| `middleware-chains.yml` | Authentik-basierte Chains |
| `tls-options.yml` | TLS-Mindestversion, Cipher Suites, Curves |
| `servers-transports.yml` | `insecureSkipVerify` Transport für interne Backends |
| `auth-routes.yml` | Authentik-Callback-Routen (Priority 1000) |
| `services-external.yml` | File-Provider-Routen (checkmk, dns, pihole etc.) |
| `tcp-meeting.yml` | TCP Passthrough für meeting.ackermannprivat.ch |

Alle Dateien liegen unter `/opt/traefik/configurations/` und werden von Traefik live geloaded (`watch: true`). Die Templates für diese Dateien befinden sich im Git unter `standalone-stacks/traefik-proxy/configurations/`.

## Statische Konfiguration

Die statische Konfiguration ist als Ansible-Template im Git versioniert: `standalone-stacks/traefik-proxy/templates/traefik.yml.j2`. Sie wird per Ansible Role auf `/opt/traefik/traefik.yml` deployed (Modus 0600, da der Consul-Token enthalten ist).

## Wartung

### Konfiguration ändern

- **Templates (Git):** `standalone-stacks/traefik-proxy/templates/` (statische Config)
- **Dynamische Config (Git):** `standalone-stacks/traefik-proxy/configurations/` (Middlewares, Routen)
- **Deployed auf VM:** `/opt/traefik/` (wird per Ansible verteilt)

Änderungen werden per Ansible Role `traefik-proxy` verteilt. Die dynamische Konfiguration wird automatisch hot-reloaded -- kein Traefik-Neustart nötig.

## Storage (lokal, kein NFS!)

Traefik nutzt ausschliesslich lokalen Storage auf vm-proxy-dns-01. NFS wird bewusst **nicht** verwendet -- ein Netzwerk-Storage für den zentralen Reverse Proxy ist ein Anti-Pattern (Boot-Abhängigkeit, inotify funktioniert nicht über NFS).

| Pfad | Inhalt | Zugriff |
|------|--------|---------|
| `/opt/traefik/traefik.yml` | Statische Konfiguration (inkl. Consul-Token) | readonly, 0600 |
| `/opt/traefik/acme/acme.json` | Let's Encrypt Zertifikate | read-write, chmod 600 |
| `/opt/traefik/configurations/` | Dynamische Config (Middlewares, Routen) | readonly |

`acme.json` wird bei Verlust automatisch neu generiert (Let's Encrypt stellt innerhalb von Minuten neu aus).

Der Certs-Dumper schreibt die exportierten PEM-Zertifikate weiterhin auf NFS (`/nfs/cert/`), da andere Services sie von dort lesen.

::: warning Traefik startet nicht nach Reboot
Falls Traefik nach einem Reboot nicht läuft: `docker start traefik`. Danach Authentik-Outpost prüfen -- er braucht Traefik für OIDC Discovery und restartet automatisch.
:::

## Verwandte Seiten

- [Traefik Middleware Chains](./referenz.md) -- Vollständige Middleware-Dokumentation
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking und Threat Intelligence
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für *.ackermannprivat.ch
- [Authentik](../authentik/index.md) -- Identity Provider für ForwardAuth
- [Netzwerk-Topologie](../netzwerk/index.md) -- Netzwerkarchitektur und Routing
