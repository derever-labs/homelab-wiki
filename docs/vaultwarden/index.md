---
title: Vaultwarden
description: Selbstgehosteter Passwort-Manager (Bitwarden API kompatibel) auf PostgreSQL und DRBD-repliziertem CSI-Volume
tags:
  - service
  - security
  - nomad
---

# Vaultwarden

## Übersicht

Vaultwarden ist der zentrale Passwort-Manager -- eine leichtgewichtige Reimplementierung der Bitwarden-Server-API. Alle Bitwarden-Clients (Browser-Extension, Desktop, iOS, Android) sprechen direkt mit der Vaultwarden-API.

| Attribut | Wert |
|----------|------|
| URL | [p.ackermannprivat.ch](https://p.ackermannprivat.ch) -- siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/vaultwarden.nomad` |
| Image | `localhost:5000/vaultwarden/server:1.35.4` (gepinnt, via lokale Registry) |
| Datenbank | PostgreSQL via Consul DNS (`postgres.service.consul`, DB `vaultwarden`) |
| Storage | Linstor CSI Volume `vaultwarden-data` (1 GiB ext4, DRBD-repliziert auf client-05/06) |
| Platzierung | Nur `vm-nomad-client-05` oder `vm-nomad-client-06`, Affinity auf 05 |
| Auth | `intern-noauth@file` (IP-Allowlist, kein Authentik) |
| SMTP | `smtp.service.consul:25` (Plain) |

## Rolle im Stack

Vaultwarden ist der zentrale Passwort-Manager im Homelab. Alle Passwörter, TOTP-Secrets, Anhänge und sichere Notizen werden hier verwaltet -- inklusive der Familienfreigaben über Bitwarden-Organisationen. Die Bitwarden-Mobile-Apps und Browser-Extensions sind vollständig kompatibel mit Vaultwarden.

## Architektur

Vaultwarden trennt zwei Datenpfade: die strukturierte Vault-Datenbank lebt im gemeinsamen PostgreSQL-Cluster, der lokale Service-State (Anhänge, generierte Server-Schlüssel, Icon-Cache) liegt auf einem DRBD-replizierten Linstor-CSI-Volume. Beide Pfade sind dadurch zwischen client-05 und client-06 redundant.

```d2
direction: right

clients: Clients {
  style.stroke-dash: 4
  brw: Browser-Extension
  app: "Bitwarden-App (iOS / Android / Desktop)"
}

traefik: Traefik 10.0.2.20 {
  style.stroke-dash: 4
  router: "Router p.ackermannprivat.ch (intern-noauth)"
}

nomad: Nomad-Cluster {
  style.stroke-dash: 4
  vw: Vaultwarden { tooltip: "client-05/06, image vaultwarden/server:1.35.4" }
}

storage: Storage {
  style.stroke-dash: 4
  csi: "Linstor CSI vaultwarden-data" { tooltip: "1 GiB ext4, DRBD-repliziert auf client-05/06" }
  pg: "PostgreSQL postgres.service.consul" { tooltip: "DB vaultwarden im Postgres-DRBD-Cluster" }
}

clients.brw -> traefik.router: HTTPS
clients.app -> traefik.router: HTTPS
traefik.router -> nomad.vw
nomad.vw -> storage.csi: "Anhänge / Konfig"
nomad.vw -> storage.pg: "Vault-Datenbank"
```

## Konfiguration

### Datenbank

Vaultwarden nutzt die gemeinsame PostgreSQL-Instanz des `postgres-drbd`-Cluster über `postgres.service.consul:5432`. Die Datenbank `vaultwarden` und der zugehörige User werden dort betrieben. Zugangsdaten und der Vaultwarden-Admin-Token kommen aus Vault (`kv/data/vaultwarden`) und werden vom Job per Vault-Integration als Environment ins Template gerendert.

Der Hauptcontainer wartet über einen `prestart`-Sidecar (Alpine `nc`-Loop auf Port 5432) auf die Verfügbarkeit von Postgres, bevor Vaultwarden selbst startet. Damit überlebt der Job Postgres-Failover ohne Crashloop.

### Storage

Das CSI-Volume `vaultwarden-data` (Definition unter `nomad-jobs/volumes/vaultwarden-volume.hcl`, Resource Group `rg-replicated`, `autoPlace=2`) wird mit `mount_options { fs_type = "ext4", mount_flags = ["noatime", "discard"] }` ins Volume gemountet. Es enthält:

- Anhänge der Vault-Einträge
- Generierte Server-RSA-Schlüssel (`rsa_key.pem`, `rsa_key.pub.pem`)
- Icon-Cache und Send-Daten

Linstor repliziert es zwischen `vm-nomad-client-05` und `vm-nomad-client-06`. Der Job läuft mit `single-node-writer`-Access-Mode und ist per Constraint auf 05/06 gepinnt. Eine Affinity bevorzugt client-05, weil dort die Postgres-Primary-Rolle bevorzugt liegt -- gleicher Host = lokaler Loopback-Pfad zur DB.

### Sicherheit

- Traefik-Middleware-Chain `intern-noauth@file` ist eine reine IP-Allowlist auf 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 und 100.64.0.0/10. Es läuft kein Authentik-ForwardAuth davor -- die Bitwarden-Clients authentisieren direkt gegen Vaultwarden mit Master-Passwort und 2FA.
- Externe Zugriffe (Mobile, unterwegs) laufen über das Tailscale-Netz im 100.64.0.0/10-Bereich, das in der Allowlist enthalten ist.
- TLS terminiert Traefik mit dem Default-Wildcard-Zertifikat.

::: warning
Die `intern-noauth`-Chain enthält keine CrowdSec-Bouncer-Stufe. Brute-Force-Schutz liegt damit allein auf Vaultwarden-Ebene (Rate-Limit der Login-Endpoints, lange Master-Passwörter, optional 2FA).
:::

### SMTP

Vaultwarden verschickt Mails (Einladungen, Hinweise, Master-Password-Hint) über `smtp.service.consul:25` ohne TLS, mit Absender `services@ackermann.systems`. Der SMTP-Relay übernimmt die externe Zustellung samt DKIM/SPF.

## Backup

Die zwei Datenpfade werden separat gesichert:

- **PostgreSQL-DB `vaultwarden`** -- Teil der `postgres-backup`-Pipeline aus dem zentralen Postgres-Cluster
- **CSI-Volume `vaultwarden-data`** -- DRBD-Replikation zwischen client-05/06; die [Backup-Strategie](../backup/index.md) deckt darüber hinaus Off-Cluster-Snapshots ab

## Verwandte Seiten

- [Backup-Strategie](../backup/index.md)
- [Linstor / DRBD-Storage](../linstor-storage/index.md)
- [Traefik Middlewares](../traefik/referenz.md)
- [SMTP-Relay](../smtp-relay/index.md)
