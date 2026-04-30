---
title: Gitea
description: Self-hosted Git Server mit PostgreSQL und SSH-Zugang
tags:
  - service
  - productivity
  - nomad
  - git
---

# Gitea

Gitea ist der zentrale Git-Server für private und interne Repositories. Er ergänzt GitHub für Repos, die ausschliesslich intern bleiben sollen, und bietet über den integrierten SSH-Server direkten Git-Zugriff ohne Webinterface.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [gitea.ackermannprivat.ch](https://gitea.ackermannprivat.ch) |
| SSH | `ssh://git@gitea:2222` (Port 2222) |
| Deployment | Nomad Job `services/gitea.nomad` |
| Storage | Linstor CSI (`gitea-data`, 5 GiB replicated) |
| Datenbank | PostgreSQL `gitea` (Shared Cluster via `postgres.service.consul`) |
| Auth | Authentik OIDC + `intern-auth@file` |

## Rolle im Stack

Gitea ist der zentrale Git-Server für private und interne Repositories. Er ergänzt GitHub für Repos, die ausschliesslich intern bleiben sollen (z.B. Konfigurationen, Automatisierungen). Über den integrierten SSH-Server (Port 2222) kann direkt mit Git gearbeitet werden, ohne den Webzugang zu nutzen.

## Architektur

```d2
direction: right

Clients: {
  style.stroke-dash: 4
  GIT: "Git CLI\n(SSH Port 2222)"
  WEB: Browser
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: gitea.*\nintern-auth"
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  GT: "Gitea\n(Port 3003)"
  PG: "PostgreSQL 16\n(postgres.service.consul)" { shape: cylinder }
}

Storage: {
  style.stroke-dash: 4
  CSI: "Linstor CSI\ngitea-data (5 GiB)" { shape: cylinder }
}

Clients.WEB -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.GT
Clients.GIT -> Nomad.GT: SSH
Nomad.GT -> Nomad.PG
Nomad.GT -> Storage.CSI
```

## Konfiguration

### Storage

Gitea verwendet ein Linstor CSI Volume (`gitea-data`, 5 GiB, replicated) anstatt NFS. Das Volume wird unter `/data` im Container gemountet und enthält Repositories, Konfiguration und Logs.

### Datenbank

PostgreSQL-Datenbank `gitea` auf dem Shared Cluster, Zugriff über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf PostgreSQL-Verfügbarkeit bevor Gitea startet.

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/gitea` | `postgres_password` |

### SSH

Der integrierte SSH-Server lauscht auf Port 2222 (static). Registriert als separater Consul Service (`gitea-ssh`) mit TCP Health Check.

### Networking (Bridge-Mode)

Der Job nutzt `network_mode = "bridge"` statt `host`. Grund: das offizielle Gitea-Image (`gitea/gitea`, ab mindestens 1.21) bringt zusätzlich zum Built-in Go-SSH-Server einen klassischen OpenSSH-Daemon mit (s6-supervised, `/etc/s6/openssh/run`), der hardcoded auf Container-Port 22 hört. Mit `host`-Mode würde dieser Daemon den Host-Port 22 belegen und SSH-Wartung des Storage-Nodes blockieren -- alle Verbindungsversuche zu Port 22 landen dann im Container-sshd, der nur `git`-User mit signierten CA-Keys kennt.

::: warning Image-Quirk: kein env-Schalter für openssh
Es gibt im offiziellen Image keinen offiziellen Schalter (env-Variable, Flag), um den s6-openssh-Service zu deaktivieren. Bridge-Mode mit explizitem Port-Mapping (3003 + 2222) isoliert den Daemon container-intern; nur die zwei in der `network`-Stanza definierten Host-Ports sind nach aussen sichtbar.
:::

### Sicherheit

- Registrierung ist deaktiviert (`DISABLE_REGISTRATION=true`)
- Anmeldung erforderlich zum Browsen (`REQUIRE_SIGNIN_VIEW=true`)
- OpenID Sign-in und Sign-up deaktiviert

## Abhängigkeiten

- **PostgreSQL** -- Shared Cluster (`postgres.service.consul`)
- **Traefik** -- HTTPS-Routing und Middleware
- **Linstor** -- CSI Volume für Daten-Persistenz
- **Authentik** -- OIDC-Provider (konfiguriert in Gitea UI)
- **Consul** -- Service Discovery und DNS

## SSH über ProxyJump

Gitea läuft als Nomad Job und kann zwischen `vm-nomad-client-05` und `vm-nomad-client-06` wechseln. Die SSH-IP ist deshalb nicht stabil -- nach einem Reschedule stimmt ein direkt konfigurierter SSH-Alias nicht mehr.

**Lösung:** ProxyJump über einen Nomad Server. Die Server-VMs sind fix und haben Zugang zum Cluster-Netzwerk mit Consul DNS. Über den Proxy wird `gitea.service.consul` zur Laufzeit aufgelöst.

`~/.ssh/config` Eintrag:

```
Host gitea
  HostName gitea.service.consul
  User git
  Port 2222
  ProxyJump vm-nomad-server-04
```

Danach funktioniert `git clone gitea:sam/<repo>.git` unabhängig davon, auf welchem Client Gitea gerade läuft.

::: info ProxyJump-Host
`vm-nomad-server-04` ist der bevorzugte Jump-Host (fest konfiguriert, immer erreichbar). Alternativ sind `vm-nomad-server-05` und `-06` gleichwertig.
:::

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Linstor](../linstor-storage/index.md) -- CSI Storage für Gitea-Daten
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
