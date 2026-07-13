---
title: "CrowdSec: Referenz"
description: Engine- und Bouncer-Parameter, Collections und lokale Whitelists
tags:
  - platform
  - security
  - crowdsec
  - referenz
---

# CrowdSec: Referenz

Diese Seite listet die Konfigurationsparameter von Engine und Bouncer, die verwendeten Collections und die lokalen Whitelists. Rolle, Architektur und Einbindung in Traefik stehen in [CrowdSec (Übersicht)](./index.md).

## Engine-Parameter

| Attribut | Wert |
| :--- | :--- |
| **Log-Quelle** | Docker-Socket (`/var/run/docker.sock:ro`), `source: docker` + `container_name: [traefik]` in `acquis.yaml` |
| **Config** | `/home/sam/docker/crowdsec/config` |
| **Daten** | `/home/sam/docker/crowdsec/data` |

## Bouncer-Parameter

| Attribut | Wert |
| :--- | :--- |
| **Plugin** | `maxlerebourg/crowdsec-bouncer-traefik-plugin` |
| **Verbindung** | `crowdsec:8080` (LAPI) |
| **Modus** | Stream (gecachte Entscheidungen, Update alle 15s) |
| **API-Key** | `/run/secrets/crowdsec_bouncer_key` (Datei-Mount) |

## Collections

Die Engine verwendet folgende Collections zur Angriffserkennung:

| Collection | Beschreibung |
|------------|--------------|
| `crowdsecurity/traefik` | Traefik-spezifische Szenarien (Log-Parsing) |
| `crowdsecurity/http-cve` | Bekannte HTTP-Schwachstellen (CVEs) |
| `crowdsecurity/base-http-scenarios` | Allgemeine HTTP-Angriffe (Brute-Force, Crawling) |
| `crowdsecurity/sshd` | SSH Brute-Force-Erkennung |
| `LePresidente/jellyfin` | Jellyfin-spezifische Szenarien |
| `firix/authentik` | Authentik-spezifische Szenarien |

## Lokale Whitelists

Ergänzend zu den Hub-Whitelists (z.B. `crowdsecurity/jellyfin-whitelist`) laufen lokale Parser-Whitelists, die spezifische False-Positives ausnehmen ohne ein gesamtes Szenario zu schwächen. Lokale Parser liegen unter `parsers/s02-enrich/` und überleben `cscli hub upgrade`, da sie keinen Hub-Symlink haben.

| Whitelist | Geltungsbereich |
|-----------|-----------------|
| `local/jellyfin-watch-whitelist` | `watch.ackermannprivat.ch`, GET 401/403 auf Jellyfin-API-Pfaden (Items/Images, Users/Items, UserItems/Resume, InfuseSync, Plugins). Verhindert Bans durch Infuse/Findroid/Swiftfin-Bursts bei abgelaufenem Auth-Token. CVE-Vektoren (`/Videos/*/stream`, `/Videos/*/Subtitles`) bleiben bewusst im Szenario `crowdsecurity/http-probing`. |

Quelle: [`standalone-stacks/traefik-ha/configs/crowdsec/parsers/s02-enrich/`](https://github.com/derever-labs/homelab-hashicorp-stack/tree/main/standalone-stacks/traefik-ha/configs/crowdsec/parsers/s02-enrich) im `homelab-hashicorp-stack`-Repo. Deployment via Ansible-Playbook `traefik-ha/deploy.yml`.

::: info expr-Engine-Quirk
CrowdSec compiliert Filter-Expressions über die expr-Engine, die `\-` und `\?` nicht als Regex-Escapes akzeptiert. In Charakter-Klassen muss `-` ans Ende (`[a-f0-9-]`) und `?` als Klasse (`[?]`) geschrieben werden, sonst geht der Container in einen Restart-Loop.
:::
