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

Dieses Runbook greift im Restore-Fall: geplanter Wiederherstellungs-Drill oder echte Disaster-Recovery nach Daten- oder Node-Verlust. Vorbedingung sind ein erreichbarer NFS-Mount `/nfs/backup/` auf dem Ziel-Host, ein lauffähiger Docker-Daemon und der private age-Schlüssel (Vault `kv/backup/age-key` oder 1Password als DR-Fallback). Alle Backups liegen age-verschlüsselt vor und müssen vor jeder Verwendung entschlüsselt werden. Die Prod-Restore-Schritte für Vault und Nomad sind destruktiv und nur im echten DR-Fall auszuführen.

## Restore-Prozeduren

### Postgres

Dump-Pfad: `/nfs/backup/postgres/daily/postgres-all-YYYYMMDD-HHMM.sql.gz.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

Voraussetzungen:

- NFS-Mount `/nfs/backup/` auf dem Ziel-Host vorhanden
- Docker verfügbar
- Postgres-Version aus dem Dump-Header lesen: `age -d -i "$KEYFILE" <dump> | zcat | grep 'Dumped from'`

Der Drill validiert die Wiederherstellbarkeit: Dump in einen isolierten Wegwerf-Container `postgres:16-alpine` (Version gemäss Dump-Header) einspielen, danach Datenbankliste und Stichproben-Counts prüfen. Die Restore-Prozedur (Entschlüsselung, Einspielen) steht im Runbook `docs/runbooks/backup-restore.md`.

::: info pg_dumpall --clean
Der Dump enthält `DROP ... IF EXISTS`-Statements (Flag `--clean` im Backup-Job). Ein Einspielen in eine bereits befüllte Instanz überschreibt bestehende Objekte. Für einen isolierten Test stets einen leeren Container verwenden.
:::

### MariaDB

Dump-Pfad: `/nfs/backup/mariadb/daily/mariadb-all-YYYYMMDD-HHMM.sql.gz.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

MariaDB-Version aus Dump-Header: `age -d -i "$KEYFILE" <dump> | zcat | head -5`

Der Drill validiert die Wiederherstellbarkeit: Dump in einen Wegwerf-Container `mariadb:11.4` einspielen und die Datenbankliste prüfen. Die Restore-Prozedur steht im Runbook `docs/runbooks/backup-restore.md`.

### InfluxDB

Backup-Pfad: `/nfs/backup/influxdb/daily/influxdb-YYYYMMDD-HHMM.tar.gz.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

Das Archiv enthält das native InfluxDB-Backup-Format (bolt, sqlite, TSM-Shards).

Der Drill validiert die Wiederherstellbarkeit: Archiv entschlüsseln, entpacken und mit `influx restore --full` in einen Wegwerf-Container `influxdb:2` einspielen. Die Restore-Prozedur steht im Runbook `docs/runbooks/backup-restore.md`.

::: warning --full überschreibt den Operator-Token
`influx restore --full` ersetzt die gesamte KV-Datenbank inklusive Auth-Tokens. Nach dem Restore gelten die Produktions-Tokens — der `<temp-token>` aus der Container-Initialisierung ist ungültig. Health-Check ohne Token: `curl http://localhost:8086/health` → `status: pass`.

Für eine reine Bucket-Validierung ohne `--full` einen Teilrestore per `--bucket` verwenden (kein Token-Ersatz).
:::

### Vault

Snapshot-Pfad: `/nfs/backup/vault/daily/vault-YYYYMMDD-HHMM.snap.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

Die `.snap`-Dateien sind gzip-komprimiert (Vault API liefert gzip direkt). Der Befehl `vault operator raft snapshot restore` erwartet die Datei direkt — nicht vorher dekomprimieren.

Der Drill validiert die Wiederherstellbarkeit: Snapshot entschlüsseln und mit `vault operator raft snapshot restore -force` in einen frisch initialisierten und entsiegelten Wegwerf-Vault mit Raft-Backend einspielen. Die Restore-Prozedur steht im Runbook `docs/runbooks/backup-restore.md`.

::: info Standby nach Restore
Nach dem Restore wechselt der Test-Node auf `standby`, weil der Snapshot die Produktions-Cluster-ID enthält. Das ist korrekt — der Test-Node ist kein Mitglied des Produktions-Clusters. In einer echten DR-Situation wird Vault auf den regulären Nodes in-place restored, nicht in einem fremden Container.
:::

::: danger Prod-Restore ist destruktiv
Für einen echten Prod-Restore: Vault auf allen Nodes stoppen, Raft-Daten löschen, Vault neu starten, init überspringen und direkt snapshot restore ausführen. Unseal-Keys liegen unter `/etc/vault.d/unseal-keys` auf den Vault-Server-VMs.
:::

### Consul

Snapshot-Pfad: `/nfs/backup/consul/daily/consul-YYYYMMDD-HHMM.snap.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

Der Drill validiert die Wiederherstellbarkeit: Snapshot entschlüsseln, Struktur mit `consul snapshot inspect` prüfen und in einen Wegwerf-Dev-Agent (`consul agent -dev`) einspielen, danach `consul catalog services` gegenprüfen. Die Restore-Prozedur steht im Runbook `docs/runbooks/backup-restore.md`.

### Nomad

Snapshot-Pfad: `/nfs/backup/nomad/daily/nomad-YYYYMMDD-HHMM.snap.age`

::: info age-Verschlüsselung
Backup-Outputs sind mit age verschlüsselt. Vor dem Restore zuerst entschlüsseln -- privater Schlüssel in Vault und 1Password. Details: Runbook `docs/runbooks/backup-restore.md` im Repo `homelab-hashicorp-stack`.
:::

Der Drill prüft die Snapshot-Integrität lokal via `nomad operator snapshot inspect` (kein Cluster nötig). Entschlüsselung und Restore-Prozedur stehen im Runbook `docs/runbooks/backup-restore.md`.

::: danger Prod-Restore ist destruktiv
Ein vollständiger Nomad-Restore erfordert einen laufenden Nomad-Server mit Raft-Backend und Root-ACL-Token. Ablauf für Prod:

- Nomad-Server auf allen Nodes stoppen
- Raft-Daten löschen (`/opt/nomad/data/server/raft/`)
- Nomad-Server neu starten
- Snapshot restore: `nomad operator snapshot restore -address=https://<server>:4646 -token=<root-token> /tmp/nomad.snap`
:::

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
