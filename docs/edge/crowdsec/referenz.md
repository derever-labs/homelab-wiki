---
title: CrowdSec Referenz
description: Engine- und Bouncer-Parameter, Collections und lokale Whitelists
tags:
  - platform
  - security
  - crowdsec
  - referenz
---

# CrowdSec Referenz

Diese Seite listet die Konfigurationsparameter von Engine und Bouncer, die verwendeten Collections und die lokalen Whitelists. Rolle, Architektur und Einbindung in Traefik stehen in [CrowdSec (Übersicht)](./index.md).

## Engine-Parameter

| Attribut | Wert |
| :--- | :--- |
| **Log-Quelle** | Docker-Socket (`/var/run/docker.sock:ro`), `source: docker` + `container_name: [traefik]` in `acquis.yaml` |
| **Ban-Dauer** | 4 h (`duration: 4h` im Default-Profil, `profiles.yaml` im config-Volume beider Nodes, nicht im Repo) |
| **Config** | `/home/sam/docker/crowdsec/config` |
| **Daten** | `/home/sam/docker/crowdsec/data` |

## Bouncer-Parameter

| Attribut | Wert |
| :--- | :--- |
| **Plugin** | `maxlerebourg/crowdsec-bouncer-traefik-plugin` |
| **Verbindung** | `crowdsec:8080` (LAPI) |
| **Modus** | Stream (gecachte Entscheidungen, Update alle 15s) |
| **API-Key** | `/run/secrets/crowdsec_bouncer_key` (Datei-Mount) |
| **Ban-Seite** | `banHTMLFilePath: /configurations/ban.html` -- eigene HTML-Ban-Seite statt rohem 403 (vorher leerer 403 ohne `Content-Type`, den Safari als Datei-Download anbot) |
| **Fehlertoleranz** | `updateMaxFailure: 4` -- erst nach vier gescheiterten Stream-Polls (rund 60s) fail-closed statt sofortigem Totalblock bei kurzem LAPI-Ausfall |

## Collections

Die Engine verwendet folgende Collections zur Angriffserkennung:

| Collection | Beschreibung |
|------------|--------------|
| `crowdsecurity/traefik` | Traefik-spezifische Szenarien (Log-Parsing) |
| `crowdsecurity/http-cve` | Bekannte HTTP-Schwachstellen (CVEs) |
| `crowdsecurity/base-http-scenarios` | Allgemeine HTTP-Angriffe (Brute-Force, Crawling) |
| `crowdsecurity/sshd` | Zieht die geoip-/dateparse-Enricher von `crowdsecurity/linux` nach (siehe Warnung unten) |
| `LePresidente/jellyfin` | Jellyfin-spezifische Szenarien |

::: warning sshd-Collection feuert nie -- bleibt bewusst installiert
Die Acquisition liest ausschliesslich die Logs des Traefik-Containers (siehe Log-Quelle in den [Engine-Parametern](#engine-parameter)). `crowdsecurity/sshd` erhält damit nie SSH-Events und löst nie einen Ban aus. Die Collection bleibt trotzdem bewusst installiert, weil sie als Hard-Dependency von `crowdsecurity/linux` dessen geoip- und dateparse-Enricher nachzieht, auf die die Traefik-Parsing-Pipeline aktiv angewiesen ist -- ohne sie bräche das Log-Parsing. `firix/authentik` wurde am 19.07.2026 entfernt, weil es aus demselben Grund (keine Authentik-Logs in der Acquisition) nie feuerte und keinen solchen Nebennutzen hat.
:::

::: info COLLECTIONS-Env ist additiv
Die `COLLECTIONS`-Env-Variable im Compose-Template ist additiv: der Entrypoint installiert die gelisteten Collections bei jedem Start, entfernt aber nie welche. Das Streichen einer Collection aus der Liste deinstalliert sie nicht automatisch von den Nodes -- dafür ist zusätzlich ein manuelles `cscli collections remove` nötig.
:::

## Lokale Whitelists

Ergänzend zu den Hub-Whitelists (z.B. `crowdsecurity/jellyfin-whitelist`) laufen lokale Parser-Whitelists, die spezifische False-Positives ausnehmen ohne ein gesamtes Szenario zu schwächen. Lokale Parser liegen unter `parsers/s02-enrich/` und überleben `cscli hub upgrade`, da sie keinen Hub-Symlink haben.

| Whitelist | Geltungsbereich |
|-----------|-----------------|
| `local/jellyfin-watch-whitelist` | `watch.ackermannprivat.ch`, GET 401/403 auf Jellyfin-API-Pfaden (Items/Images, Users/Items, UserItems/Resume, InfuseSync, Plugins). Verhindert Bans durch Infuse/Findroid/Swiftfin-Bursts bei abgelaufenem Auth-Token. CVE-Vektoren (`/Videos/*/stream`, `/Videos/*/Subtitles`) bleiben bewusst im Szenario `crowdsecurity/http-probing`. |

Quelle: [`standalone-stacks/traefik-ha/configs/crowdsec/parsers/s02-enrich/`](https://github.com/derever-labs/homelab-hashicorp-stack/tree/main/standalone-stacks/traefik-ha/configs/crowdsec/parsers/s02-enrich) im `homelab-hashicorp-stack`-Repo. Deployment via Ansible-Playbook `traefik-ha/deploy.yml`.

::: info expr-Engine-Quirk
CrowdSec compiliert Filter-Expressions über die expr-Engine, die `\-` und `\?` nicht als Regex-Escapes akzeptiert. In Charakter-Klassen muss `-` ans Ende (`[a-f0-9-]`) und `?` als Klasse (`[?]`) geschrieben werden, sonst geht der Container in einen Restart-Loop.
:::
