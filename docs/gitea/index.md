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
| Deployment | Nomad Job `services/gitea.nomad` |
| Storage | Linstor CSI (`gitea-data`, 5 GiB replicated) |
| Auth | Authentik OIDC + `intern-auth@file` |
| Secrets | Vault `kv/data/gitea` (`postgres_password`) |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

Clients: {
  style.stroke-dash: 4
  GIT: "Git CLI\n(SSH Port 2222)" { class: node }
  WEB: Browser { class: node }
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: gitea.*\nintern-auth" { class: node }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  GT: "Gitea\n(Port 3003)" { class: node }
  PG: "PostgreSQL\n(postgres.service.consul)" { shape: cylinder }
}

Storage: {
  style.stroke-dash: 4
  CSI: "Linstor CSI\ngitea-data (5 GiB)" { shape: cylinder }
}

Clients.WEB -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.GT: HTTP
Clients.GIT -> Nomad.GT: SSH
Nomad.GT -> Nomad.PG: SQL
Nomad.GT -> Storage.CSI: Mount
```

## Konfiguration

Das Linstor CSI Volume wird unter `/data` gemountet (Repositories, Konfiguration, Logs). Ein Prestart-Task wartet auf PostgreSQL-Verfügbarkeit, bevor Gitea startet.

### SSH

Der integrierte SSH-Server lauscht auf Port 2222 (static). Registriert als separater Consul Service (`gitea-ssh`) mit TCP Health Check.

### Networking (Bridge-Mode)

Der Job nutzt `network_mode = "bridge"` statt `host`. Grund: das offizielle Gitea-Image (`gitea/gitea`, ab mindestens 1.21) bringt zusätzlich zum Built-in Go-SSH-Server einen klassischen OpenSSH-Daemon mit (s6-supervised, `/etc/s6/openssh/run`), der hardcoded auf Container-Port 22 hört. Mit `host`-Mode würde dieser Daemon den Host-Port 22 belegen und SSH-Wartung des Storage-Nodes blockieren -- alle Verbindungsversuche zu Port 22 landen dann im Container-sshd, der nur `git`-User mit signierten CA-Keys kennt.

::: warning Image-Quirk: kein env-Schalter für openssh
Es gibt im offiziellen Image keinen offiziellen Schalter (env-Variable, Flag), um den s6-openssh-Service zu deaktivieren. Bridge-Mode mit explizitem Port-Mapping (3003 + 2222) isoliert den Daemon container-intern; nur die zwei in der `network`-Stanza definierten Host-Ports sind nach aussen sichtbar.
:::

### Sicherheit

Registrierung ist deaktiviert, Anmeldung zum Browsen erforderlich, OpenID Sign-in und Sign-up deaktiviert. Konkrete Konfiguration im Nomad Job `services/gitea.nomad`.

## SSH über ProxyJump

Gitea läuft als Nomad Job und kann zwischen `vm-nomad-client-05` und `vm-nomad-client-06` wechseln. Die SSH-IP ist deshalb nicht stabil -- nach einem Reschedule stimmt ein direkt konfigurierter SSH-Alias nicht mehr.

**Lösung:** ProxyJump über einen Nomad Server. Die Server-VMs sind fix und haben Zugang zum Cluster-Netzwerk mit Consul DNS. Über den Proxy wird `gitea.service.consul` zur Laufzeit aufgelöst.

In `~/.ssh/config` einen Eintrag mit `HostName gitea.service.consul`, `Port 2222` und `ProxyJump vm-nomad-server-04` anlegen. Danach funktioniert `git clone gitea:sam/<repo>.git` unabhängig davon, auf welchem Client Gitea gerade läuft.

::: info ProxyJump-Host
`vm-nomad-server-04` ist der bevorzugte Jump-Host (fest konfiguriert, immer erreichbar). Alternativ sind `vm-nomad-server-05` und `-06` gleichwertig.
:::

## Config-Anbindung HA-Luzern über Tailscale

Die Home-Assistant-Instanz am Standort Luzern (separate HAOS-VM, LAN `172.16.0.163`) versioniert ihre `/config` im privaten Gitea-Repo `sam/ha-luzern`. Ein nächtlicher Auto-Push committet einen Config-Snapshot und schiebt ihn nach Gitea; `.storage`, Secrets und Laufzeit-Dateien sind per `.gitignore` ausgeschlossen (Vollzustand decken HA- und Proxmox-Backups separat ab).

Die HA-VM hat kein privates Routing ins Homelab, und der öffentliche Gitea-Pfad liegt hinter Authentik (zudem kein öffentlicher SSH-Port). Der Push läuft deshalb über das **Tailscale-Overlay direkt auf den Gitea-Node** und umgeht Traefik/Authentik. Die HA-VM ist dafür ein eigener Tailnet-Client (`tag:homelab`, `accept-routes`), siehe [Tailscale](../netzwerk/tailscale.md).

| Aspekt | Wert |
|--------|------|
| Repo | `sam/ha-luzern` (privat) |
| Remote | `ssh://git@<gitea-node>:2222/sam/ha-luzern.git` (aktuelle Node-IP des Gitea-Allocs, via Tailscale erreichbar) |
| Deploy-Key | read-write, privater Key auf der HA-VM unter `/config/.ssh/` (gitignored) |
| Auto-Push | HA `shell_command` → `/config/scripts/git_autopush.sh`, Automation `Git Auto-Push (naechtlich)` |
| Fehlermeldung | Push aufs Handy (`notify.mobile_app`) bei returncode ≠ 0 |

::: warning Stop-Gap: Tailscale-Abhängigkeit
Der Push hängt am Tailscale-Overlay. Bei dessen Ablösung (geplant: UniFi SD-WAN, sobald Public-IPs an beiden Standorten) muss die Erreichbarkeit des Gitea-Node bzw. die Remote-URL angepasst werden. Der gleiche Hinweis steht im Kopf von `/config/scripts/git_autopush.sh`.
:::

::: warning Gitea-Reschedule pinnt die Node-IP
Der Auto-Push zielt auf die aktuelle Node-IP des Gitea-Allocs; Gitea wandert zwischen `vm-nomad-client-05/06`. Nach einem Reschedule zeigt die Remote-URL auf den falschen Node und der Push schlägt fehl -- die Fehlermeldung aufs Handy macht das sichtbar, danach die Remote-URL auf die neue Node-IP setzen. Im Gegensatz zum interaktiven Zugang (ProxyJump über `gitea.service.consul`) hat die HA-VM keinen Consul-DNS.
:::

## Verwandte Seiten

- [Tailscale](../netzwerk/tailscale.md) -- Overlay-VPN, über das der HA-Luzern-Config-Push läuft
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Linstor](../linstor-storage/index.md) -- CSI Storage für Gitea-Daten
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
