---
title: NAS-Speicher
description: Synology NAS als zentraler NFS- und S3-Speicher im Homelab
tags:
  - infrastructure
  - storage
  - nfs
  - minio
  - nas
---

# NAS Storage

## Übersicht

Das NAS ist der zentrale Shared-Storage-Knoten im Cluster für NFS-Exports, MinIO S3 und Backup-Ziele.

| Attribut | Wert |
|----------|------|
| Deployment | Bare-metal (Synology DSM) |
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |
| Hardware | [Server-Hardware](../_referenz/hardware-inventar.md#nas) |

## Rolle im Stack

Das NAS ist der zentrale Shared-Storage-Knoten im Cluster. Alle persistenten Daten, die nicht auf lokalen SSDs oder DRBD-Volumes liegen müssen, werden hier gespeichert. Die Nomad-Clients mounten die NFS-Shares und stellen sie als Docker-Volumes bereit. Zusätzlich bietet das NAS über MinIO einen S3-kompatiblen Object Store für Backups und Terraform State.

## NFS-Exports

Die folgenden Pfade werden als NFS-Shares bereitgestellt und auf allen Nomad-Client-VMs gemountet:

| Export-Pfad | Mount auf Clients | Verwendung |
| :--- | :--- | :--- |
| `/nfs/docker/` | `/nfs/docker/` | Persistente Daten für Container (Configs, DB-Dateien) |
| `/nfs/jellyfin/` | `/nfs/media/` | Medien-Bibliothek für Jellyfin und arr-Stack |
| `/nfs/nomad/jobs/` | `/nfs/nomad/jobs/` | Nomad Job-Spezifikationen |
| `/nfs/cert/` | `/nfs/cert/` | TLS-Zertifikate (Read-Only) |
| `/nfs/backup/` | `/nfs/backup/` | Backup-Ziel für pg_dumpall und weitere Jobs |
| `/nfs/logs/` | `/nfs/logs/` | Log-Dateien für Batch-Jobs |

Die Mount-Punkte werden über Ansible in `/etc/fstab` der jeweiligen VMs konfiguriert.

## MinIO S3

Das NAS betreibt eine MinIO-Instanz auf Synology DSM als S3-kompatiblen Object Store. Der Endpoint ist nur intern erreichbar -- kein Public-Routing über Traefik.

| Attribut | Wert |
| :--- | :--- |
| **API-Endpoint** | `http://10.0.0.200:9000` |
| **Console** | Siehe [Web-Interfaces](../_referenz/web-interfaces.md#management) |
| **Credentials** | Siehe [Zugangsdaten](../_referenz/credentials.md#1password) |
| **Replikation** | Zweite MinIO-Instanz vorbereitet (1P-Item "MinIO Peer") |

### Buckets

| Bucket | Zweck | Verwendet von |
| :--- | :--- | :--- |
| `linstor-backups` | Linstor S3 Shipping (Daily/Weekly/Monthly) | drbd_storage Cron |
| `harbor` | Container-Registry-Daten (historisch, vor ZOT-Migration) | Harbor (legacy) |
| `litestream` | SQLite-Replikation (Litestream Stream Backups) | Litestream-Sidecars |
| `zot-registry` | Zot OCI Registry Storage Backend | ZOT (system job) |
| `gravel-recherche` | Bilder + Files Directus Gravel-Bike-Recherche | Directus Gravel |

Neue Buckets werden über die MinIO Console angelegt. Pro App empfiehlt sich ein dedizierter Service-Account (IAM User) mit Bucket-Policy auf nur diesen Bucket -- nicht der globale Admin-Account.

### Linstor Remote

Linstor adressiert MinIO über das Remote `nas-backup`. Die S3-Konfiguration (Endpoint, Credentials, Bucket, Region) ist im Linstor-Controller hinterlegt; das Setup-Playbook ist in [`infra/homelab-hashicorp-stack/ansible/playbooks/setup-backup-infrastructure.yml`](https://github.com/derever-labs/homelab-hashicorp-stack/blob/main/ansible/playbooks/setup-backup-infrastructure.yml) dokumentiert.

## Troubleshooting

### NFS `fileid changed`-Fehler

**Symptom:** Der Linux-Kernel auf den Client-VMs loggt `NFS: server 10.0.0.200 error: fileid changed`. Anwendungen (z.B. SABnzbd) erhalten `FileNotFoundError` oder `ESTALE`.

**Ursache:** Synology DSM läuft auf Kernel 4.4.x. Btrfs vergibt Inode-Nummern pro Subvolume, nicht dateisystemweit. Der NFS-Server kann die verschiedenen Subvolume-IDs nicht in eindeutige fileids umrechnen -- der dafür nötige Kernel-Fix (XOR Subvolume-ID + Inode) existiert erst ab Linux 5.17+. Btrfs-Snapshots, Indexierung und Scrubs können fileids ändern.

**Mitigation (Client-Seite):**
- Niedrige Attribut-Cache-Zeiten (`acregmin/acregmax`, `acdirmin/acdirmax`) verkürzen das Zeitfenster, in dem stale fileids gecacht werden
- Mount-Optionen werden zentral in der Ansible-Rolle `roles/nfs/defaults/main.yml` verwaltet
- `lookupcache=positive` hilft **nicht** -- kontrolliert Dentry-Cache, nicht Attribut-Cache
- `nconnect` erst hinzufügen wenn fileid serverseitig gelöst ist (erhöht Revalidierungs-Parallelität)

**Mitigation (Server-Seite):**
- Indexierung (Media Indexing) für NFS-exportierte Ordner deaktivieren
- Snapshot-Frequenz reduzieren oder deaktivieren für Shares mit aktiver NFS-Nutzung
- `@eaDir`-Verzeichnisse nach Deaktivierung der Indexierung entfernen

### Staler NFS-Directory-Cache

Zu hohe `acdirmin/acdirmax`-Werte (z.B. 1800s) führen dazu, dass der NFS-Client veraltete Verzeichnisinhalte sieht. Anwendungen, die während Downloads neue Dateien erstellen (SABnzbd), erhalten `FileNotFoundError` wenn der gecachte Verzeichniseintrag nicht mit dem aktuellen Zustand übereinstimmt.

## SSH-Zugang und Hardening

Die NAS-Konsole ist via SSH (Port 22, Key-Only-Auth) erreichbar -- Login als `admin` mit Public-Key, Passwort-Auth deaktiviert. Konsistent gehärtet seit 2026-05-01 nach demselben Pattern wie die DCLab-NAS:

- **Auth:** ausschliesslich Public-Key, `PasswordAuthentication no`, `PermitRootLogin no`
- **Crypto:** moderne Cipher/KEX/MAC-Suites (chacha20-poly1305, aes256-gcm, curve25519, sha2-512-etm) -- die DSM-Defaults mit 3DES und SHA1 werden über einen `managed-by-claude-ssh-hardening`-Marker-Block am Anfang von `/etc/ssh/sshd_config` überschrieben (OpenSSH first-obtained-value-wins)
- **AllowUsers:** nur `admin`; die als `csh`-Shell konfigurierten Familien-Accounts haben keinen SSH-Bedarf und sind ausgeschlossen
- **Permissions:** `~/.ssh` 700, `authorized_keys` 600

::: tip Boot-Persistenz
Bei DSM-Major-Updates wird `/etc/ssh/sshd_config` aus den DSM-Defaults wiederhergestellt. Ein Boot-up-Task `ssh-hardening-reapply` im DSM Task Scheduler (User root) ruft `/usr/local/sbin/ssh-hardening-reapply.sh` und reapplied den Hardening-Block idempotent. Auf dem Homelab-NAS via DSM-UI angelegt und nach Reboot verifiziert.
:::

Die NAS-Login-Credentials liegen im 1Password Vault `PRIVAT Agent` als `NAS Privat Homeserver Admin`. Public/Private-Key kommen aus `SSH Homelab Kopie` im selben Vault, der 1P SSH Agent macht sie automatisch verfügbar.

## Wartung

- Das NAS verwaltet seine eigene RAID-Konsistenz (SHR/RAID)
- Snapshots werden auf dem NAS selbst gesteuert
- Monitoring: Siehe [Synology NAS Monitoring](../synology-monitoring/index.md)

## Verwandte Seiten

- [Server-Hardware](../_referenz/hardware-inventar.md) -- NAS-Hardware-Details
- [Datenstrategie](../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Replikation
- [Backup-Strategie](../backup/index.md) -- pg_dumpall und Linstor Snapshots auf NFS/MinIO
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Backup-Ziele
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-VMs, die NFS mounten
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Telegraf SNMP, Grafana Dashboard, Alerting
