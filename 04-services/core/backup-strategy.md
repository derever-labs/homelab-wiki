---
title: Backup-Strategie
description: PostgreSQL Backups, DRBD Snapshots und Monitoring
published: true
date: 2026-01-01T12:00:00+00:00
tags: backup, postgresql, drbd, linstor, monitoring
editor: markdown
---

# Backup-Strategie

Diese Seite beschreibt die vollstaendige Backup-Strategie fuer das Homelab.

## Uebersicht

| Layer | Technologie | Ziel | RPO | Retention |
|-------|-------------|------|-----|-----------|
| PostgreSQL Dump | pg_dumpall | NFS (/nfs/backup/postgres/) | 24h | GFS: 7d/4w/3m |
| DRBD Snapshots | Linstor native | Lokal auf DRBD | 24h | 7 Snapshots |
| DRBD S3 Shipping | Linstor → MinIO | NAS (linstor-backups bucket) | 24h | GFS: 7d/4w/3m |
| SQLite Replication | Litestream | MinIO (NAS + Peer) | 5s | 7 Tage |
| VM Backups | Proxmox PBS | PBS Server | 24h | 6 Monate |

## 1. PostgreSQL Backup

### Architektur

```
PostgreSQL (DRBD Volume)
         │
         │ pg_dumpall (03:00 UTC)
         ▼
   NFS: /nfs/backup/postgres/
         ├── daily/   (7 Backups)
         ├── weekly/  (4 Backups)
         └── monthly/ (3 Backups)
         │
         │ Uptime Kuma Push
         ▼
   Monitoring Dashboard
```

### Nomad Job

**Pfad:** `nomad-jobs/batch-jobs/postgres-backup.nomad`

```bash
# Manuell ausfuehren
nomad job run nomad-jobs/batch-jobs/postgres-backup.nomad

# Status pruefen
nomad job status postgres-backup

# Letzte Ausfuehrung
nomad job dispatch postgres-backup
```

### Restore

```bash
# Einzelne Datenbank
gunzip -c /nfs/backup/postgres/daily/postgres-all-YYYYMMDD-HHMM.sql.gz | \
  psql -h postgres.service.consul -U postgres -d target_db

# Alle Datenbanken (ACHTUNG: Ueberschreibt alles!)
gunzip -c /nfs/backup/postgres/daily/postgres-all-YYYYMMDD-HHMM.sql.gz | \
  psql -h postgres.service.consul -U postgres

# Spezifische Tabelle extrahieren
gunzip -c backup.sql.gz | grep -A1000 "CREATE TABLE tablename" | \
  grep -B1 "ALTER TABLE" | head -n -1
```

### Vault Secrets

```bash
# Secret anlegen (einmalig)
vault kv put kv/postgres \
  password="<POSTGRES_PASSWORD>"

vault kv put kv/uptime-kuma \
  postgres_backup_push="https://uptime.ackermannprivat.ch/api/push/mygkJdM53Ra5h793CPB1c4c6lvKJQA43" \
  linstor_backup_push="https://uptime.ackermannprivat.ch/api/push/r7RK5nb27UR2edl0gOcG9ICo8FhzbWvO" \
  snapshot_push="https://uptime.ackermannprivat.ch/api/push/G3H1RhLaNCbdtczjlDefFdaeFUG3QPfc"

# Policy erstellen
cat <<EOF | vault policy write postgres -
path "kv/data/postgres" {
  capabilities = ["read"]
}
EOF

cat <<EOF | vault policy write postgres-backup -
path "kv/data/postgres" {
  capabilities = ["read"]
}
path "kv/data/uptime-kuma" {
  capabilities = ["read"]
}
EOF
```

---

## 2. DRBD/Linstor Snapshots

### Lokale Snapshots

Taeglich um 02:00 Uhr werden automatisch Snapshots aller DRBD-Ressourcen erstellt.

**Script:** `/usr/local/bin/linstor-snapshot.sh` auf client-05

**Cron:** `0 2 * * * root /usr/local/bin/linstor-snapshot.sh`

```bash
# Snapshots anzeigen
linstor snapshot list

# Snapshots einer Ressource
linstor snapshot list -r postgres-data

# Manueller Snapshot
linstor snapshot create postgres-data manual-$(date +%Y%m%d-%H%M)
```

### S3 Shipping nach MinIO

Linstor kann Snapshots nativ nach S3-kompatiblem Storage exportieren.

#### Konfiguration

```bash
# 1. S3 Remote definieren
linstor remote create s3 nas-backup \
  --endpoint http://10.0.0.200:9000 \
  --access-key <MINIO_ACCESS_KEY> \
  --secret-key <MINIO_SECRET_KEY> \
  --bucket linstor-backups \
  --region us-east-1

# 2. Remote pruefen
linstor remote list

# 3. Manuelles Backup einer Ressource
linstor backup create nas-backup postgres-data

# 4. Backup-Status pruefen
linstor backup list --remote nas-backup
```

#### Automatisches Scheduling

```bash
# Schedule erstellen (GFS: 7 daily, 4 weekly, 3 monthly)
linstor schedule create backup-gfs \
  --full-daily --keep-daily 7 \
  --full-weekly --keep-weekly 4 \
  --full-monthly --keep-monthly 3

# Schedule fuer Ressourcen aktivieren
for res in postgres-data traefik-data authentik-data uptime-kuma-data \
           jellyfin-config paperless-data stash-data vaultwarden-data influxdb-data; do
  linstor resource-definition set-property $res Backup/S3 nas-backup
  linstor resource-definition set-property $res Backup/Schedule backup-gfs
done

# Schedule-Status pruefen
linstor schedule list
```

#### MinIO Bucket vorbereiten

```bash
# Via mc (MinIO Client)
mc alias set nas http://10.0.0.200:9000 <ACCESS_KEY> <SECRET_KEY>
mc mb nas/linstor-backups
mc policy set private nas/linstor-backups

# Bucket-Inhalt anzeigen
mc ls nas/linstor-backups
```

### Restore von S3

```bash
# Verfuegbare Backups anzeigen
linstor backup list --remote nas-backup

# Restore zu neuer Ressource
linstor backup restore nas-backup \
  --from-snapshot <snapshot-id> \
  --to-resource postgres-data-restored \
  --to-node vm-nomad-client-05

# Bestehende Ressource ersetzen (VORSICHT!)
linstor backup restore nas-backup \
  --from-snapshot <snapshot-id> \
  --target-resource postgres-data
```

---

## 3. Monitoring

### Uptime Kuma Push-Monitore

| Monitor | Typ | Interval | Beschreibung |
|---------|-----|----------|--------------|
| PostgreSQL Backup | Push | 93600s (26h) | pg_dump Batch Job |
| Linstor S3 Backup | Push | 93600s (26h) | Linstor Shipping |
| DRBD Snapshots | Push | 93600s (26h) | Lokale Snapshots |

**Hinweis:** 26h Interval gibt 2h Puffer falls Backups laenger dauern als ueblich.

### Linstor Backup Monitor Script

**Pfad:** `/usr/local/bin/linstor-backup-monitor.sh` auf client-05

```bash
#!/bin/bash
# Pruefen ob Backups in den letzten 25h erstellt wurden

UPTIME_KUMA_PUSH_URL="https://uptime.ackermannprivat.ch/api/push/<TOKEN>"

LAST_BACKUP=$(linstor backup list --remote nas-backup 2>/dev/null | \
  grep -E "$(date +%Y-%m-%d)" | wc -l)

if [ "$LAST_BACKUP" -gt 0 ]; then
  curl -fsS -m 10 --retry 3 \
    "${UPTIME_KUMA_PUSH_URL}?status=up&msg=OK&ping=${LAST_BACKUP}" || true
else
  curl -fsS -m 10 --retry 3 \
    "${UPTIME_KUMA_PUSH_URL}?status=down&msg=No+backup+today" || true
fi
```

**Cron:** `0 6 * * * /usr/local/bin/linstor-backup-monitor.sh`

### Snapshot Script Push erweitern

Am Ende von `/usr/local/bin/linstor-snapshot.sh` hinzufuegen:

```bash
# Uptime Kuma Push
UPTIME_KUMA_PUSH_URL="https://uptime.ackermannprivat.ch/api/push/<TOKEN>"
curl -fsS -m 10 --retry 3 \
  "${UPTIME_KUMA_PUSH_URL}?status=up&msg=OK&ping=$(date +%s)" || true
```

---

## 4. NFS Vorbereitung

```bash
# Auf einem Node mit NFS-Zugang
sudo mkdir -p /nfs/backup/postgres/{daily,weekly,monthly}
sudo chown -R 999:999 /nfs/backup/postgres  # postgres user (UID 999)
sudo chmod -R 755 /nfs/backup/postgres

# Struktur pruefen
ls -la /nfs/backup/postgres/
```

---

## 5. Checkliste Ersteinrichtung

### Vault Setup

- [ ] `kv/postgres` Secret mit Passwort anlegen
- [ ] `kv/uptime-kuma` Secret mit Push-URLs anlegen
- [ ] `postgres` Policy erstellen
- [ ] `postgres-backup` Policy erstellen

### NFS/MinIO

- [ ] `/nfs/backup/postgres/` Verzeichnisstruktur erstellen
- [ ] `linstor-backups` Bucket auf MinIO (NAS) erstellen

### Nomad Jobs

- [ ] `postgres-drbd.nomad` neu deployen (Vault Integration)
- [ ] `postgres-backup.nomad` deployen

### Linstor

- [ ] S3 Remote `nas-backup` konfigurieren
- [ ] Schedule `backup-gfs` erstellen
- [ ] Backup fuer alle Ressourcen aktivieren

### Monitoring

- [ ] Push-Monitore in Uptime Kuma erstellen
- [ ] `/usr/local/bin/linstor-backup-monitor.sh` erstellen
- [ ] `/usr/local/bin/linstor-snapshot.sh` erweitern
- [ ] Cron-Jobs einrichten

### Validierung

- [ ] PostgreSQL Backup manuell testen
- [ ] Linstor S3 Backup manuell testen
- [ ] Restore-Test durchfuehren

---

## 6. Troubleshooting

### PostgreSQL Backup fehlgeschlagen

```bash
# Job-Logs pruefen
nomad alloc logs -job postgres-backup

# Manuelle Verbindung testen
docker run --rm -it postgres:16-alpine \
  pg_isready -h postgres.service.consul -U postgres -p 5432

# pg_dump manuell testen
docker run --rm -it postgres:16-alpine \
  pg_dumpall -h postgres.service.consul -U postgres | head
```

### Linstor Backup fehlgeschlagen

```bash
# Remote-Verbindung pruefen
linstor remote list

# Letzte Backup-Fehler
linstor error-report list | head -20

# MinIO-Verbindung testen
mc admin info nas
```

### Uptime Kuma Push nicht angekommen

```bash
# Push manuell testen
curl -v "https://uptime.ackermannprivat.ch/api/push/<TOKEN>?status=up&msg=test"

# DNS-Aufloesung pruefen
nslookup uptime.ackermannprivat.ch
```

---

*Letztes Update: 01.01.2026*
