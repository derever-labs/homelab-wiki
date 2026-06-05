---
title: NAS-Speicher
description: Synology NAS als zentraler NFS- und S3-Speicher im Homelab
tags:
  - infrastructure
  - storage
  - nfs
  - garage
  - nas
---

# NAS-Speicher

Das NAS ist der zentrale Shared-Storage-Knoten im Cluster für NFS-Exports, S3 (Garage) und Backup-Ziele.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Bare-metal (Synology DSM) |
| NFS-Clients | Ansible-Rolle `roles/nfs` (fstab-Mounts auf den VMs) |
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |
| Hardware | [Server-Hardware](../_referenz/hardware-inventar.md#nas) |

## Rolle im Stack

Alle persistenten Daten, die nicht auf lokalen SSDs oder DRBD-Volumes liegen müssen, werden hier gespeichert. Die Nomad-Clients mounten die NFS-Shares und stellen sie als Docker-Volumes bereit. Zusätzlich bietet das NAS über Garage einen S3-kompatiblen Object Store für Backups und Terraform State.

## NFS-Exports

Die folgenden Pfade werden als NFS-Shares bereitgestellt und auf allen Nomad-Client-VMs gemountet:

| Export-Pfad | Mount auf Clients | Verwendung |
| :--- | :--- | :--- |
| `/nfs/docker/` | `/nfs/docker/` | Persistente Daten für Container (Configs, DB-Dateien) |
| `/nfs/jellyfin/` | `/nfs/jellyfin/` | Medien-Bibliothek für Jellyfin und arr-Stack |
| `/nfs/nomad/` | `/nfs/nomad/` | Nomad-Daten (inkl. `consul-cert`-Subpfad) |
| `/nfs/backup/` | `/nfs/backup/` | Backup-Ziel für pg_dumpall und weitere Jobs |
| `/nfs/logs/` | `/nfs/logs/` | Log-Dateien für Batch-Jobs |

Die Mount-Punkte werden über Ansible (`roles/nfs`) in `/etc/fstab` der jeweiligen VMs konfiguriert. Die Exports kommen vom HomeServer (DS1825+, 10.0.0.200, `/volume1`); das alte Blech (DS2419+, 10.0.0.210, `/volume2`) serviert separat die Jellyfin-Mediathek von USB-Shares an die Media-Worker.

Der frühere Export `/nfs/cert/` (TLS-Zertifikate der alten acme-Pipeline) wurde mit dem NAS-Cutover 2026-06 stillgelegt: Der native `acme.sh` deployt direkt in den DSM-Store, kein Cluster-Konsument liest den Pfad mehr. Mount, Export und Shared Folder sind entfernt -- siehe [TLS-Zertifikate](../_referenz/tls-zertifikate.md).

## Garage S3

Garage läuft als Container auf dem NAS als S3-kompatibler Object Store für Backups und Terraform State. Der Endpoint ist nur intern erreichbar -- kein Public-Routing über Traefik. Single-Node-Setup, `replication_factor = 1`, Zone `homeserver`, Capacity 3.6 TiB. Storage liegt auf `/volume1/garage/{meta,data}` (seit NAS-Cutover 2026-06 auf DS1825+). Garage löste die zuvor auf dem NAS betriebene MinIO-Instanz im Mai 2026 ab (MinIO-Repository im April 2026 archiviert).

Die NAS-IP steht in [Hosts und IPs](../_referenz/hosts-und-ips.md).

| Attribut | Wert |
| :--- | :--- |
| **API-Endpoint** | Port 9012 |
| **S3 Web (Static Hosting)** | Port 9013 |
| **Admin/Metrics** | Port 9014 (Bearer-Token-Auth) |
| **Storage** | `/volume1/garage/{meta,data}` |
| **Config** | `/volume1/garage/garage.toml` (0600/root) |
| **Credentials** | siehe [Zugangsdaten](../_referenz/credentials.md) |

### Buckets

| Bucket | Zweck | Verwendet von |
| :--- | :--- | :--- |
| `linstor-backups` | Linstor S3 Shipping (Daily/Weekly/Monthly) | drbd_storage Cron |
| `gravel-recherche` | Bilder + Files Directus Gravel-Bike-Recherche | Directus Gravel |

Jeder Bucket hat einen dedizierten Per-Bucket-Access-Key (kein globaler Admin-Account). Neue Buckets werden über die `garage`-CLI im Container angelegt.

### Linstor Remote

Linstor adressiert Garage über das Remote `nas-backup`. Die S3-Konfiguration (Endpoint, Credentials, Bucket, Region) ist im Linstor-Controller hinterlegt; das Setup-Playbook ist in [`infra/homelab-hashicorp-stack/ansible/playbooks/setup-backup-infrastructure.yml`](https://github.com/derever-labs/homelab-hashicorp-stack/blob/main/ansible/playbooks/setup-backup-infrastructure.yml) dokumentiert.

### Eigenschaften

- Keine eigene Admin-Web-UI -- Administration via `garage`-CLI im Container oder Admin-HTTP-API mit Bearer-Token
- Kein Object Versioning, kein Object Locking, keine Bucket Policies
- Per-Key-pro-Bucket-Permission-Modell statt globaler IAM-Policies
- Prometheus-Metriken unter `/metrics` (Token-geschützt)

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

Benutzer, IP und Credential-Speicherorte: [SSH-Zugang](../_referenz/ssh-zugang.md) und [Zugangsdaten](../_referenz/credentials.md). Login als `admin` mit Public-Key, Passwort-Auth deaktiviert. Login-Daten liegen im 1Password Vault `PRIVAT Agent` (Item `NAS Privat Homeserver Admin`), der Key stammt aus `SSH Homelab Kopie`.

Das NAS ist seit 2026-05-01 nach demselben Pattern wie die DCLab-NAS gehärtet -- relevant für das Verständnis der Architektur:

- **Auth:** ausschliesslich Public-Key, `PasswordAuthentication no`, `PermitRootLogin no`, `AllowUsers admin` (Familien-Accounts mit `csh`-Shell sind ausgeschlossen)
- **Crypto:** moderne Cipher/KEX/MAC-Suites ersetzen die DSM-Defaults (3DES, SHA1) über einen `managed-by-claude-ssh-hardening`-Marker-Block am Anfang von `/etc/ssh/sshd_config` (OpenSSH first-obtained-value-wins)

::: warning Boot-Persistenz
Bei DSM-Major-Updates wird `/etc/ssh/sshd_config` aus den DSM-Defaults wiederhergestellt. Ein Boot-up-Task `ssh-hardening-reapply` im DSM Task Scheduler (User root) ruft `/usr/local/sbin/ssh-hardening-reapply.sh` und reapplied den Hardening-Block idempotent.
:::

## Wartung

- Das NAS verwaltet seine eigene RAID-Konsistenz (SHR/RAID)
- Snapshots werden auf dem NAS selbst gesteuert
- Monitoring: Siehe [Synology NAS Monitoring](../synology-monitoring/index.md)

## Verwandte Seiten

- [Server-Hardware](../_referenz/hardware-inventar.md) -- NAS-Hardware-Details
- [Datenstrategie](../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Replikation
- [Backup-Strategie](../backup/index.md) -- pg_dumpall und Linstor Snapshots auf NFS/Garage
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Backup-Ziele
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-VMs, die NFS mounten
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Telegraf SNMP, Grafana Dashboard, Alerting
