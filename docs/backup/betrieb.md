---
title: Backup - Betrieb
description: Restore-Prozeduren, Drill-Ergebnisse und Runbooks für alle Backup-Typen
tags:
  - backup
  - restore
  - betrieb
  - runbook
---

# Backup - Betrieb

## Restore-Prozeduren

### Postgres

Dump-Pfad: `/nfs/backup/postgres/daily/postgres-all-YYYYMMDD-HHMM.sql.gz`

Voraussetzungen:

- NFS-Mount `/nfs/backup/` auf dem Ziel-Host vorhanden
- Docker verfügbar
- Postgres-Version aus dem Dump-Header lesen: `zcat <dump> | grep 'Dumped from'`

```text
# Wegwerf-Container starten (Version dem Dump anpassen, aktuell 16)
docker run -d --name pg-restore \
  -e POSTGRES_PASSWORD=<passwort> \
  -e POSTGRES_USER=postgres \
  postgres:16-alpine

# Warten bis Container bereit ist (ca. 10s)

# Dump einspielen
zcat /nfs/backup/postgres/daily/postgres-all-YYYYMMDD-HHMM.sql.gz \
  | docker exec -i pg-restore psql -U postgres -v ON_ERROR_STOP=0

# Validierung: Datenbankliste prüfen
docker exec pg-restore psql -U postgres -c '\l'

# Stichproben
docker exec pg-restore psql -U postgres -d authentik \
  -c 'SELECT COUNT(*) FROM authentik_core_user;'

# Cleanup
docker rm -f pg-restore
```

::: info pg_dumpall --clean
Der Dump enthält `DROP ... IF EXISTS`-Statements (Flag `--clean` im Backup-Job). Ein Einspielen in eine bereits befüllte Instanz überschreibt bestehende Objekte. Für einen isolierten Test stets einen leeren Container verwenden.
:::

### MariaDB

Dump-Pfad: `/nfs/backup/mariadb/daily/mariadb-all-YYYYMMDD-HHMM.sql.gz`

MariaDB-Version aus Dump-Header: `zcat <dump> | head -5`

```text
docker run -d --name mariadb-restore \
  -e MARIADB_ROOT_PASSWORD=<passwort> \
  mariadb:11.4

# Warten (ca. 15s)

zcat /nfs/backup/mariadb/daily/mariadb-all-YYYYMMDD-HHMM.sql.gz \
  | docker exec -i mariadb-restore mariadb -u root -p<passwort>

# Validierung
docker exec mariadb-restore mariadb -u root -p<passwort> -e 'SHOW DATABASES;'

docker rm -f mariadb-restore
```

### InfluxDB

Backup-Pfad: `/nfs/backup/influxdb/daily/influxdb-YYYYMMDD-HHMM.tar.gz`

Das Archiv enthält das native InfluxDB-Backup-Format (bolt, sqlite, TSM-Shards).

```text
# Temporäres Verzeichnis
mkdir -p /tmp/influx-restore
tar -xzf /nfs/backup/influxdb/daily/influxdb-YYYYMMDD-HHMM.tar.gz \
  -C /tmp/influx-restore/

# Container starten
docker run -d --name influx-restore \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=<passwort> \
  -e DOCKER_INFLUXDB_INIT_ORG=homelab \
  -e DOCKER_INFLUXDB_INIT_BUCKET=restore-test \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=<temp-token> \
  -v /tmp/influx-restore:/backup:ro \
  influxdb:2

# Warten (ca. 20s)

# Restore (--full ersetzt alle Orgs, Buckets, Tokens)
docker exec influx-restore influx restore \
  --full \
  --token <temp-token> \
  /backup/influxdb-YYYYMMDD-HHMM/
```

::: warning --full überschreibt den Operator-Token
`influx restore --full` ersetzt die gesamte KV-Datenbank inklusive Auth-Tokens. Nach dem Restore gelten die Produktions-Tokens — der `<temp-token>` aus der Container-Initialisierung ist ungültig. Health-Check ohne Token: `curl http://localhost:8086/health` → `status: pass`.

Für eine reine Bucket-Validierung ohne `--full` einen Teilrestore per `--bucket` verwenden (kein Token-Ersatz).
:::

```text
# Health-Check
docker exec influx-restore curl -s http://localhost:8086/health

# Cleanup
docker rm -f influx-restore
rm -rf /tmp/influx-restore
```

### Vault

Snapshot-Pfad: `/nfs/backup/vault/daily/vault-YYYYMMDD-HHMM.snap`

Die `.snap`-Dateien sind gzip-komprimiert (Vault API liefert gzip direkt). Der Befehl `vault operator raft snapshot restore` erwartet die Datei direkt — nicht vorher dekomprimieren.

```text
# Konfiguration für Test-Container (Raft-Backend erforderlich)
cat > /tmp/vault-config.hcl << 'EOF'
storage "raft" {
  path    = "/vault/data"
  node_id = "restore-test-node"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"
disable_mlock = true
EOF

mkdir -p /tmp/vault-data
cp /nfs/backup/vault/daily/vault-YYYYMMDD-HHMM.snap /tmp/vault-restore.snap

docker run -d --name vault-restore \
  --cap-add=IPC_LOCK \
  -v /tmp/vault-config.hcl:/vault-drill/config.hcl \
  -v /tmp/vault-data:/vault/data \
  -v /tmp/vault-restore.snap:/vault-drill/vault.snap:ro \
  hashicorp/vault:latest \
  vault server -config=/vault-drill/config.hcl

sleep 8

# Init und Unseal
INIT=$(docker exec -e VAULT_ADDR=http://127.0.0.1:8200 vault-restore \
  vault operator init -key-shares=1 -key-threshold=1 -format=json)
UNSEAL=$(echo $INIT | python3 -c 'import sys,json; print(json.load(sys.stdin)["unseal_keys_b64"][0])')
TOKEN=$(echo $INIT | python3 -c 'import sys,json; print(json.load(sys.stdin)["root_token"])')

docker exec -e VAULT_ADDR=http://127.0.0.1:8200 vault-restore \
  vault operator unseal $UNSEAL

# Snapshot restore (Datei direkt, kein Gunzip)
docker exec \
  -e VAULT_ADDR=http://127.0.0.1:8200 \
  -e VAULT_TOKEN=$TOKEN \
  vault-restore \
  vault operator raft snapshot restore -force /vault-drill/vault.snap

# Status nach Restore
docker exec -e VAULT_ADDR=http://127.0.0.1:8200 vault-restore vault status

# Cleanup
docker rm -f vault-restore
sudo rm -rf /tmp/vault-data /tmp/vault-restore.snap /tmp/vault-config.hcl
```

::: info Standby nach Restore
Nach dem Restore wechselt der Test-Node auf `standby`, weil der Snapshot die Produktions-Cluster-ID enthält. Das ist korrekt — der Test-Node ist kein Mitglied des Produktions-Clusters. In einer echten DR-Situation wird Vault auf den regulären Nodes in-place restored, nicht in einem fremden Container.

Für einen echten Prod-Restore: Vault auf allen Nodes stoppen, Raft-Daten löschen, Vault neu starten, init überspringen und direkt snapshot restore ausführen. Unseal-Keys liegen unter `/etc/vault.d/unseal-keys` auf den Vault-Server-VMs.
:::

### Consul

Snapshot-Pfad: `/nfs/backup/consul/daily/consul-YYYYMMDD-HHMM.snap`

```text
# Struktur prüfen (kein Container nötig)
docker run --rm \
  -v /nfs/backup/consul/daily/consul-YYYYMMDD-HHMM.snap:/snap:ro \
  hashicorp/consul:latest \
  consul snapshot inspect /snap

# Restore in Wegwerf-Dev-Agent
docker run -d --name consul-restore \
  hashicorp/consul:latest \
  consul agent -dev -client=0.0.0.0

sleep 5

docker cp /nfs/backup/consul/daily/consul-YYYYMMDD-HHMM.snap consul-restore:/tmp/consul.snap
docker exec consul-restore consul snapshot restore /tmp/consul.snap

# Validierung
docker exec consul-restore consul catalog services

# Cleanup
docker rm -f consul-restore
```

### Nomad

Snapshot-Pfad: `/nfs/backup/nomad/daily/nomad-YYYYMMDD-HHMM.snap`

Integritätsprüfung via `nomad operator snapshot inspect` (kein Cluster nötig, lokal auf dem Node):

```text
nomad operator snapshot inspect /nfs/backup/nomad/daily/nomad-YYYYMMDD-HHMM.snap
```

Ein vollständiger Nomad-Restore erfordert einen laufenden Nomad-Server mit Raft-Backend und Root-ACL-Token. Ablauf für Prod:

- Nomad-Server auf allen Nodes stoppen
- Raft-Daten löschen (`/opt/nomad/data/server/raft/`)
- Nomad-Server neu starten
- Snapshot restore: `nomad operator snapshot restore -address=https://<server>:4646 -token=<root-token> /path/to/snap`

Ein Voll-Restore in einem isolierten Test-Cluster wurde im Drill 2026-06-10 nicht durchgeführt (Aufwand unverhältnismässig, Integritätsnachweis via `inspect` ist hinreichend für Drill-Zweck).

### Linstor / DRBD-Volumes

Linstor-native Snapshots existieren nicht (S3-Schicht zurückgebaut 2026-05-31, Cron mitentfernt). DRBD-Volumes sind durch PBS-Block-Backups der Nodes c05/c06 geschützt.

Ein Restore von DRBD-Volumes erfolgt über PBS (VM-Restore von c05 oder c06) — kein applikations-konsistenter Einzelvolume-Restore möglich. Ein Linstor-nativer Restore-Drill wurde im Drill 2026-06-10 nicht durchgeführt.

---

## Drill-Ergebnisse 2026-06-10

Erster E2E-Restore-Drill aller Backup-Typen. Getestet auf `vm-nomad-client-05` (10.0.2.125), Docker 29.5.2, NFS-Mount `/nfs/backup/` (28 TB NAS 10.0.0.200).

### Messwerte

RPO-Ist (Alter des neuesten Dumps zum Drill-Zeitpunkt):

- Postgres: ~19h (dump 2026-06-10 03:00, drill ~20:00)
- MariaDB: ~19h (dump 2026-06-10 03:15)
- InfluxDB: **59 Tage** (letzter Dump 2026-04-12 — Backup-Job seit >7 Wochen inaktiv)
- Vault: ~20h (snapshot 2026-06-10 02:00)
- Consul: ~1h (snapshot 2026-06-10 19:27)
- Nomad: ~20h (snapshot 2026-06-09 23:30)

Restore-Dauer (reine Einspielen-Zeit):

- Postgres: 69s (190 MB gzip, pg_dumpall → psql pipe)
- MariaDB: 20s (3 MB gzip)
- InfluxDB: 4s Entpacken + 56s Restore (714 MB tar.gz)
- Vault: 16s (344 KB .snap)
- Consul: 5s (46 KB .snap)
- Nomad: 1s (inspect only)

### Ergebnisse

- Postgres: Restore erfolgreich. 28 Datenbanken wiederhergestellt, Stichproben-Counts plausibel (authentik 34 User, vaultwarden 1 User, keep 68409 Alerts, authentik 18 Flows).

- MariaDB: Restore erfolgreich. 2 Datenbanken (kimai, uptime_kuma) wiederhergestellt.

- InfluxDB: Restore erfolgreich (health `status: pass`, TSM-Shards korrekt restored). Kritischer Befund: Backup-Job seit 2026-04-12 inaktiv, 59 Tage ohne frischen Dump, kein Monitor hatte das erkannt.

- Vault: Restore erfolgreich. `.snap`-Datei direkt verwenden (nicht gunzippen). Node wechselt nach Restore auf standby (erwartet bei fremder Cluster-ID).

- Consul: Restore erfolgreich. `consul snapshot inspect` validiert Struktur (198 Service-Registrierungen). Nach Restore via dev-Agent `consul catalog services` zeigt alle bekannten Dienste.

- Nomad: `nomad operator snapshot inspect` erfolgreich. Snapshot gültig: 3651 Einträge, 19 MiB, 330 Jobs, 322 Allocs. Voll-Restore nicht durchgeführt.

- Linstor: Keine Snapshots vorhanden. Backup-Cron zusammen mit S3-Schicht deaktiviert. DRBD-Volumes sind via PBS geschützt (Block-Level VM-Backup).

### Kritische Befunde

- InfluxDB-Backup inaktiv seit 59 Tagen: Job-Status prüfen, Ursache beheben, Kuma-Monitor deployen (referenziert in ClickUp 86ca5geqc)
- Linstor-Snapshot-Cron deaktiviert: Bewusst entschieden (PBS-Redundanz), aber im Runbook dokumentiert
- Kuma-Monitore für Vault, Consul, Nomad, InfluxDB fehlen: Silent-Failure-Risiko (86ca5geqc)
