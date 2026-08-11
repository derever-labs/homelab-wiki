---
title: Zot Container Registry
description: OCI-native Container Registry mit Linstor-CSI DRBD Volume, BoltDB MetaDB und Pull-Through Cache
tags:
  - docker
  - registry
  - container
  - infrastructure
  - linstor
  - zot
---

# Zot Container Registry

Zot ist eine OCI-native Container Registry mit Linstor-CSI DRBD-Volume, BoltDB (embedded) und Pull-Through Cache für Docker Hub, ghcr.io und quay.io. Als Nomad Service Job läuft eine Instanz auf dem Nomad-Cluster und wird bei Node-Ausfall automatisch rescheduled.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL (intern) | `zot.service.consul:5000` (via Consul DNS, kein Traefik-Routing) |
| Deployment | Nomad Job `infrastructure/zot-registry.nomad` (Service Job, 1 Alloc) |
| Storage | Linstor-CSI Volume `zot-data` (150 GB, ext4 noatime) |
| Auth | htpasswd -- nomad-client (read), ci-push (read+write), anonym lesen erlaubt |
| Secrets | Vault `kv/data/zot-registry` (htpasswd), `kv/data/dockerhub` (Sync-Token) |

## Rolle im Stack

Zot ist der zentrale Pull-Through-Cache für sämtliche Nomad-Jobs: Alle App- und
Basis-Images werden über `zot.service.consul:5000` bezogen, on-demand aus Docker
Hub, ghcr.io und quay.io gespiegelt und auf dem Linstor-CSI-Volume vorgehalten.
Eigene Pushes (`library/...`) liegen ebenfalls hier. Die
Verfügbarkeit hängt am Linstor-CSI DRBD-Volume; eine Bootstrap-Klasse von Jobs
umgeht den Cache bewusst, um bei Zot-Ausfall startfähig zu bleiben.

Gegenüber Docker Registry v2 bietet Zot OCI-native Manifeste, eine eingebaute
Web-UI samt GraphQL-Suche und Pull-Through-Cache für drei Upstream-Registries
statt nur Docker Hub. Docker-Format-Manifeste werden über `compat: ["docker2s2"]`
akzeptiert.

## Architektur

**Leitfrage:** Woher kommt ein Image beim Pull -- und wer entscheidet, ob der Upstream gefragt wird?

Lese-Konvention: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt -- Request und Antwort teilen sich einen Pfeil. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** sind Neben- oder Ausweichwege. Farben: Blau der Pull-Pfad, Violett der Upstream-Sync, Grün der CI-Push, Grau die Wege an Zot vorbei.

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  pull: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  sync: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  push: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  neben: { style: { stroke: "#6b7280"; stroke-dash: 3; font-color: "#6b7280" } }
}

Consumers: Konsumenten {
  class: container

  Nodes: "Nomad-Nodes\n(docker pull)" {
    class: node
    tooltip: "Job-Files referenzieren zot.service.consul:5000 explizit -- daemon.json registry-mirrors nur als Fallback für Kurz-Referenzen"
  }
  CI: "CI-Pipeline\n(skopeo, User ci-push)" {
    class: node
    tooltip: "GitHub-Workflow app-build-deploy.yml -- holt das ci-push-Passwort zur Laufzeit aus Vault"
  }
}

Zot: "Zot Registry\nzot.service.consul:5000" {
  class: node
  tooltip: "Nomad Service Job, 1 Alloc auf client-04/05/06 -- BoltDB embedded, entscheidet pro Request über Cache-Hit oder Upstream-Sync"
}

Volume: "Linstor-CSI Volume\nzot-data" {
  shape: cylinder
  tooltip: "DRBD-repliziert auf beiden Storage-Nodes, client-04 diskless -- Blobs und BoltDB MetaDB folgen dem Alloc via CSI"
}

Upstream: Upstream-Registries {
  class: container

  Hub: Docker Hub { class: node }
  GHCR: ghcr.io { class: node }
  Quay: quay.io { class: node }
}

Consumers.Nodes -> Zot: "1. Pull -- anonym\n(anonymousPolicy read)" { class: pull }
Zot -> Volume: "2. Cache-Hit: Blobs und\nMetadaten vom Volume" { class: pull }
Zot -> Upstream: "3. Cache-Miss: on-demand spiegeln --\nder erste Pull wartet auf den Upstream" { class: sync }
Consumers.CI -> Zot: "4. Push eigener Images\n(skopeo mit ci-push)" { class: push }
Consumers.Nodes -> Upstream: "A. Bootstrap-Klasse: direkt oder\nals Fallback am Cache vorbei" { class: neben }
```

Lesehilfe:

1. Nomad-Jobs pullen über die explizite Referenz `zot.service.consul:5000/...` -- der [daemon.json-Mirror](#daemon-json-mirror-pattern) bleibt Fallback für Kurz-Referenzen. Pulls laufen anonym, ein Login ist nur zum Pushen nötig ([Authentifizierung](#authentifizierung)).
2. Bei einem Cache-Hit liefert Zot Blobs und Manifeste direkt vom [Linstor-CSI-Volume](#storage-linstor-csi-volume) -- kein Upstream-Kontakt, Docker-Hub-Limits spielen keine Rolle.
3. Bei einem Cache-Miss spiegelt Zot das Image on-demand vom passenden Upstream (explizite Prefix-Allowlist für Docker Hub, Prefix-Regeln für ghcr.io und quay.io) -- der erste Pull wartet auf den Upstream, danach kommt jedes weitere Exemplar aus dem Cache ([Proxy Cache Registries](#proxy-cache-registries)).
4. Gepusht wird ausschliesslich aus der CI -- via `skopeo` mit dem User `ci-push`, dessen Passwort der Workflow zur Laufzeit aus Vault holt ([Authentifizierung](#authentifizierung)).
5. Die [Bootstrap-Klasse](#bootstrap-klasse-bewusste-direkt-pulls-ohne-cache) läuft an Zot vorbei -- teils permanent (explizite Upstream-Hostnames), teils als automatischer Fallback des Mirror-Mechanismus.
6. Fällt der Node der Registry aus, rescheduled Nomad die Allocation nach der 5-Minuten-Karenz, das Volume folgt via CSI ohne Daten-Sync ([Betrieb -- Failover](./betrieb.md#failover-wiederanlauf)). Solange Zot fehlt, scheitern Re-Pulls expliziter Referenzen -- die Folgen fürs Cluster: [Plattform-Ausfallverhalten](../index.md#ausfallverhalten).

### daemon.json Mirror-Pattern

Auf allen Nodes ist `zot.service.consul:5000` als `registry-mirrors` konfiguriert. Das Mirror-Matching greift **nur** bei Kurz-Format-Referenzen (`library/nginx:1.27`, `louislam/uptime-kuma`). Referenzen mit explizitem Hostname (`ghcr.io/...`, `quay.io/...`) gehen direkt zum Upstream und umgehen den Mirror.

Deshalb nutzen alle Nomad-Job-Files explizite Referenzen der Form `zot.service.consul:5000/<prefix>/<image>:<tag>` statt sich auf den Mirror-Mechanismus zu verlassen. Das macht den tatsächlichen Zugriffspfad im Job-File sichtbar und verhindert überraschende direkte Upstream-Pulls.

## Konfiguration

Die vollständige Konfiguration (Zot Config, Linstor-Volume, Proxy Cache, Auth) ist im Nomad Job definiert: `infrastructure/zot-registry.nomad`

**Wichtig:** `compat: ["docker2s2"]` in der HTTP-Konfiguration ist nötig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlägt der Push von Multi-Arch Images fehl mit `manifest invalid`.

### Authentifizierung

ZOT nutzt htpasswd mit zwei Usern:

- nomad-client -- Read-only (pull), im Pull-Pfad nicht hinterlegt: Pulls laufen anonym, weder die Job-Files noch der Docker Daemon führen Registry-Credentials.
- ci-push -- Read-write (pull + push). Einziger autorisierter Push-Weg: Der CI-Workflow holt das Passwort zur Laufzeit aus Vault (`kv/data/zot-registry`) und pusht via `skopeo` -- `docker push` würde wegen des erlaubten anonymen Lesens keinen Auth-Header mitsenden.

`anonymousPolicy = ["read"]` -- anonymes Lesen (pull) ist erlaubt, Push erfordert htpasswd-Auth.

### Storage: Linstor-CSI Volume

- Volume-Name: `zot-data`, 150 GB, ext4 mit `noatime`
- Block-Daten DRBD-repliziert auf den beiden Storage-Nodes (Resource-Group `rg-replicated`, `place_count 2`); client-04 greift diskless über das Netz zu -- der Datenstand bleibt bei Node-Ausfall erhalten
- Kein S3-Backend mehr, keine Abhängigkeit vom NAS

Volume-Parameter: `volumes/zot-data-volume.hcl` im Repo `homelab-nomad-jobs`; der Replikationsgrad kommt aus der Linstor Resource-Group (Ansible-Rolle `linstor-config`).

### Proxy Cache Registries

Drei Upstream-Registries mit `onDemand: true` -- Images werden beim ersten Request on-demand gespiegelt und danach aus dem Volume-Cache geliefert. Der Destination-Prefix entspricht dem Upstream-Hostname, sodass die Zot-Image-Pfade 1:1 dem Upstream-Format folgen.

- Docker Hub (`registry-1.docker.io`) -- explizite Prefix-Allowlist (offizielle `library/`-Images einzeln, Hub-Namespaces als Wildcard). Docker-Hub-Pro-Plan aktiv (unlimited pulls), 429 im Normalbetrieb nicht zu erwarten. `retryDelay` 30 Sekunden.
- GitHub Container Registry (`ghcr.io`) -- Destination-Prefix `/ghcr.io`. Wird anonym (public) ohne Sync-Credentials gespiegelt. `retryDelay` 5 Minuten.
- Quay.io (`quay.io`) -- Destination-Prefix `/quay.io`, ebenfalls ohne Credentials. `retryDelay` 5 Minuten.

::: danger Kein Catch-All für Docker Hub (Vorfall 10.08.2026)
Der frühere Catch-All (`**`) machte jedes selbst gebaute `library/`-Image zum Docker-Hub-Kandidaten: Zot verglich bei jedem by-Tag-Manifest-Abruf den Upstream-Digest, jeder Pull eines eigenen Images erzeugte Hub-API-Anfragen. Während einer Deploy-Welle drosselte Docker Hub, Manifest-Anfragen hingen clusterweit und kein Dienst konnte mehr ein neues Image ausrollen. Seither gilt die explizite Allowlist im Nomad-Job: **ein neues Docker-Hub-Image braucht zuerst einen Prefix-Eintrag in der Sync-Konfiguration**, sonst scheitert der erste Pull mit 404. ghcr.io- und quay.io-Prefixe sind davon nicht betroffen. Begründung und Vorfall-Details im Nomad-Job (`infrastructure/zot-registry.nomad`).
:::

### Sync Credentials

Nur Docker Hub nutzt für den Sync Credentials; ghcr.io und quay.io werden anonym gespiegelt.

- Docker-Hub-Token: Vault `kv/data/dockerhub` (eigener Service-Account, Public Read, kein Push). Pro-Plan aktiv.
- htpasswd-Hashes (nomad-client, ci-push): Vault `kv/data/zot-registry`.

Beide werden über Vault Workload Identity in die Job-Templates gerendert. Token-Rotation: neuen Docker-Hub-Token erzeugen, in Vault aktualisieren, dann Zot-Job neu deployen (`nomad job run`), damit das Sync-Credentials-Template re-rendert -- ein blosser Restart reicht nicht.

### Retention

Drei Policies, angewendet nach dem First-Match-Prinzip:

- Ausnahme-Policy: eigene, aktiv gepushte Repos -- behält die 30 zuletzt gepushten Tags, löscht keine untagged Manifeste
- Whitelist-Policy: alle explizit gelisteten Upstream-Namespaces -- behält die 10 zuletzt gepushten Tags
- Spam-Killer-Policy: alle übrigen Repos -- `keepTags = 0`, `deleteUntagged = true`; räumt nicht-whitelisted Einträge automatisch auf

Die konkreten Repo- und Namespace-Listen stehen im Nomad-Job.

SSOT ist immer der Nomad-Job (`infrastructure/zot-registry.nomad`), nicht diese Seite.

### Bootstrap-Klasse: bewusste Direkt-Pulls ohne Cache

Einige Jobs sollen bei einem ZOT-Ausfall trotzdem starten können -- erkennbar am Header-Kommentar im jeweiligen Nomad-Job. Zwei Mechanismen:

- **Permanenter Direkt-Pull** über explizite Upstream-Hostnames, die den Mirror vollständig umgehen: ZOT selbst (`ghcr.io/project-zot/...`, Chicken-Egg) und die Keep-Kernservices (`us-central1-docker.pkg.dev/keephq/...` -- eine Registry, die Zot nicht spiegelt -- sowie `quay.io/soketi/...`).
- **Mirror mit Direkt-Fallback** über Kurz-Referenzen (`louislam/uptime-kuma`, `grafana/alloy`, `alpine`): Sie laufen im Normalbetrieb über den Zot-Mirror und fallen bei Zot-Ausfall automatisch auf Docker Hub zurück -- Uptime-Kuma und Alloy als Monitoring-Bastionen, dazu die Keep-Sidecars.

::: info LinuxServer.io: Upstream ghcr.io statt lscr.io
Image-Pfade in den Nomad-Jobs nutzen weiterhin `linuxserver/jellyfin` o.ä., obwohl ZOT intern von `ghcr.io` pullt. Grund: `lscr.io` ist ein Scarf-Redirect-Service -- der `/v2/`-Endpunkt antwortet mit 405, Auth-Tokens kommen ohnehin von `ghcr.io`. Die Tags auf `ghcr.io/linuxserver/...` sind identisch mit jenen auf `lscr.io/linuxserver/...`.
:::

## Betrieb

Failover und Wiederanlauf, Backup-Konzept und Troubleshooting sind im
[Betriebshandbuch](./betrieb.md) dokumentiert. Das architektonische Verhalten
bei Node-Ausfall (Nomad rescheduled die Service-Allokation, das DRBD-Volume
folgt über CSI ohne Daten-Sync) ist oben unter Architektur beschrieben.

## Verwandte Seiten

- [Zot Container Registry - Betrieb](./betrieb.md) -- Failover, Backup, Troubleshooting
- [Storage NAS](../../storage/nas/index.md) -- Garage S3 (ehemaliges ZOT-Backend)
- [DNS-Architektur](../../netz/dns/index.md) -- DNS-Auflösung für Upstream-Registries
- [Cluster-Neustart](../../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart
