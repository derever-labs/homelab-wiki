---
title: Nomad Referenz
description: Verzeichnisstruktur, Job-Konfigurationsmuster und Abhängigkeiten
tags:
  - nomad
  - referenz
  - jobs
---

# Nomad Referenz

## Verzeichnisstruktur

Alle Nomad Jobs liegen unter `/nfs/nomad/jobs/` und sind thematisch in Verzeichnisse gruppiert.

| Verzeichnis | Inhalt |
|-------------|--------|
| batch-jobs/ | Renovate, Docker Prune, Daily Cleanup/Reboot/Restart, Daily Restart Jellyfin, Reddit Downloader, PH Downloader, PostgreSQL Backup |
| databases/ | PostgreSQL (DRBD), DbGate, OpenLDAP (Legacy) |
| infrastructure/ | SMTP Relay, Filebrowser, Zot Registry, GitHub Runner |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Janitorr, JellyStat, Stash, Stash-Secure, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Special-YouTube-DL, Special-YT-DLP, Video-Grabber |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, Gatus, iperf3-to-influxdb |
| services/ | VitePress Wiki, Paperless, Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Flame-Intra, Homepage-Intra, Guacamole, Tandoor, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT, Gitea, Metabase, solidtime, Kimai, n8n, MeshCommander, PHDler Telegram Bot, Swissbau Viewer |
| system/ | Alloy (Log-Collector), Linstor CSI, Linstor GUI |
| test/ | Linstor Volume Test |

## Job-Konfigurationsmuster

### Docker Driver

Alle Jobs nutzen den Docker Task Driver. Images werden von Docker Hub oder der internen [Zot Registry](../docker-registry/) bezogen. Image-Updates laufen kontrolliert über [Renovate](../_querschnitt/renovate.md), das Pull Requests für veraltete Images erstellt.

### NFS Volumes

Persistente Daten liegen auf dem NAS unter `/nfs/docker/<service>/`. Die Volumes werden als `host` Volumes im Job konfiguriert. Details zum NFS-Setup: [NAS-Speicher](../nas-storage/)

### Bridge Networking

Jobs nutzen Bridge Networking mit expliziten Port Mappings. Nomad weist dynamische Host-Ports zu, die über Consul SRV-Records aufgelöst werden. Für Services hinter Traefik ist der Host-Port irrelevant -- Traefik ermittelt ihn automatisch über den Consul Catalog.

### Health Checks

Wo anwendbar definieren Jobs HTTP- oder TCP-Health-Checks in der `check {}` Stanza. Consul überwacht diese und markiert ungesunde Services, sodass Traefik sie aus dem Routing entfernt.

### Resource Limits

Jeder Task hat CPU- und Memory-Limits gesetzt. Nomad nutzt diese Werte für die Scheduling-Entscheidung (Bin-Packing) und zur Laufzeit-Begrenzung.

### Vault-Integration

Services, die Secrets benötigen, nutzen die `vault {}` Stanza zusammen mit Workload Identity. Secrets werden via `template` Stanza als Umgebungsvariablen oder Dateien injiziert. Details: [Vault](../vault/)

### Restart/Reschedule/Disconnect

CSI-Jobs haben Resilience-Stanzas auf Group-Level:

- **restart**: Lokale Neustarts bei Task-Crashes (`attempts = 3, interval = "5m", delay = "15s"`)
- **reschedule**: Rescheduling auf anderen Node (`delay = "30s", delay_function = "exponential", max_delay = "10m"`)
- **max_client_disconnect**: Wartezeit bei kurzen Netzwerk-Ausfällen (`"5m"`)
- **kill_timeout**: Für Datenbanken erhöht (`"30s"` bei PostgreSQL für WAL flush)

::: info Postgres-Sonderfall
PostgreSQL hat `reschedule { unlimited = false, attempts = 3, interval = "30m" }` und `restart { mode = "fail" }` -- bei wiederholtem Failure wird manuelles Eingreifen erwartet.
:::

### PostgreSQL-Abhängigkeiten

Jobs, die PostgreSQL benötigen, enthalten einen `wait-for-postgres` Init-Task. Dieser prüft die Erreichbarkeit der Datenbank bevor der Haupt-Task startet. Details: [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md)

## update-Stanza

Alle stateless Service-Jobs sollten eine `update`-Stanza mit `auto_revert = true` haben. Das stellt sicher, dass fehlgeschlagene Deployments automatisch auf die letzte stabile Version zurückgerollt werden.

### Standard (die meisten Jobs)

- `max_parallel = 1`, `auto_revert = true`
- `min_healthy_time = 30s`, `healthy_deadline = 5m`, `progress_deadline = 10m`

### Java/Langsame Apps (Metabase, Guacamole)

Längere `min_healthy_time` weil Java-Apps mehr Startzeit brauchen:

- `min_healthy_time = 60s`, `healthy_deadline = 7m`, `progress_deadline = 10m`

### CSI-Volume-Jobs

Längere Deadlines wegen Volume-Attach-Zeit:

- `min_healthy_time = 30s`, `healthy_deadline = 7m`, `progress_deadline = 12m`

Beispiel-Konfigurationen: siehe `nomad-jobs/services/metabase.nomad` (Java) oder `nomad-jobs/services/meshcmd.nomad` (CSI)

### Kein auto_revert für stateful Jobs

Datenbanken (PostgreSQL, InfluxDB), Identity-Provider (Authentik/Keycloak), und andere Jobs mit Schema-Migrationen dürfen **kein** `auto_revert` haben. Grund: Wenn ein neues Release das DB-Schema migriert und dann fehlschlägt, würde auto_revert die alte Version gegen das bereits migrierte Schema starten -- das führt zu Datenkorruption.

Betroffen: postgres-drbd, loki, influxdb, gitea, n8n, paperless, kimai, mosquitto, ollama.

### Kein auto_revert für System-Jobs

`auto_revert` funktioniert bei System-Jobs (`type = "system"`) erst ab Nomad 1.11. Vor 1.11 wird die update-Stanza bei System-Jobs nur teilweise respektiert (kein Deployment-Tracking, keine Stability-Markierung).

## TLS

Nomad verwendet TLS für die gesamte Kommunikation zwischen Servern und Clients. Die Zertifikate sind selbst-signiert (CA: CN=Nomad CA, O=Homelab, C=CH) und liegen auf den Nodes unter `/etc/nomad.d/tls/`.

- **Server-Nodes** -- `server.pem` / `server-key.pem` (CN=server.global.nomad, gültig bis April 2036)
- **Client-Nodes** -- `client.pem` / `client-key.pem` (CN=client.global.nomad, gültig bis April 2036)
- **CA** -- `nomad-ca.pem` auf allen Nodes (gültig bis April 2036)

`verify_server_hostname` ist aktiv -- Clients verifizieren, dass Server-Zertifikate `server.global.nomad` im SAN haben. `verify_https_client` ist deaktiviert -- die HTTP-API ist ohne Client-Zertifikat erreichbar (CLI-Zugang via `NOMAD_SKIP_VERIFY`).

::: info Cert-Generierung
Das Script `scripts/generate-nomad-tls.sh` generiert CA und Leaf-Zertifikate per OpenSSL. Die Certs werden nicht ins Repository committed (`.gitignore`). Für Neuinstallationen: Script ausführen, dann Ansible mit `nomad_deploy_certs: true`.
:::

## Gossip Encryption

Der Serf-Gossip-Layer zwischen den Nomad-Servern ist verschlüsselt (aktiviert am 12.04.2026). Der Gossip Key liegt in `group_vars/all.yml` als `nomad_gossip_key`. Clients sind nicht betroffen -- sie kommunizieren per RPC (TLS-gesichert), nicht per Gossip.

::: danger Gossip Key ändern
Nomad hat keinen Keyring-Mechanismus wie Consul. Bei einem Key-Wechsel müssen alle 3 Server gleichzeitig gestoppt, die Config geändert und gleichzeitig gestartet werden. Ein Rolling Restart führt zu einem Cluster-Split.
:::

## Bewusste Entscheidungen

### Privileged und raw_exec aktiv

Docker `allow_privileged = true` und `raw_exec` sind auf den Storage-Nodes (client-05/06) aktiviert. client-04 läuft ohne privileged. Das ist notwendig für:

- **LINSTOR CSI**: Braucht privileged für bidirektionales Mount Propagation
- **Maintenance-Jobs**: docker_prune, daily_cleanup brauchen raw_exec für Host-Zugriff

Deaktivierung würde CSI-Storage und alle Maintenance-Batch-Jobs brechen.

## Verwandte Seiten

- [Nomad Übersicht](index.md) -- Cluster-Architektur und Rolle im Stack
- [Nomad Betrieb](betrieb.md) -- Deployment, Node Drain, Troubleshooting
- [Traefik Middlewares](../traefik/referenz.md) -- Middleware Chains für Service-Zugriffskontrolle
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Vollständiges Abhängigkeitsdiagramm
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
