---
title: NAS-Storage Referenz
description: NFS-Exports, Garage-S3-Endpunkte und Buckets sowie DSM-Konfiguration
tags:
  - storage
  - nfs
  - garage
  - nas
  - referenz
---

# NAS-Storage Referenz

## NFS-Exports

Die folgenden Pfade werden als NFS-Shares bereitgestellt und auf allen Nomad-Client-VMs gemountet:

| Export-Pfad | Mount auf Clients | Verwendung |
| :--- | :--- | :--- |
| `/nfs/docker/` | `/nfs/docker/` | Persistente Daten für Container (Configs, DB-Dateien) |
| `/nfs/jellyfin/` | `/nfs/jellyfin/` | Medien-Bibliothek für Jellyfin und arr-Stack |
| `/nfs/nomad/` | `/nfs/nomad/` | Nomad-Daten (inkl. `consul-cert`-Subpfad) |
| `/nfs/backup/` | `/nfs/backup/` | Backup-Ziel für pg_dumpall und weitere Jobs |
| `/nfs/logs/` | `/nfs/logs/` | Log-Dateien für Batch-Jobs |

Die Mount-Punkte werden über Ansible (`roles/nfs`) in `/etc/fstab` der jeweiligen VMs konfiguriert. Die Verteilung der Exports auf HomeServer und altes Blech ist in der [Architektur](./index.md#architektur) beschrieben.

Der frühere Export `/nfs/cert/` (TLS-Zertifikate der alten acme-Pipeline) wurde mit dem NAS-Cutover 2026-06 stillgelegt: Der native `acme.sh` deployt direkt in den DSM-Store, kein Cluster-Konsument liest den Pfad mehr. Mount, Export und Shared Folder sind entfernt -- siehe [TLS-Zertifikate](../../_referenz/tls-zertifikate.md).

## Garage S3

Garage läuft als Container auf dem NAS als S3-kompatibler Object Store für Backups und Terraform State. Der Endpoint ist nur intern erreichbar -- kein Public-Routing über Traefik. Single-Node-Setup, `replication_factor = 1`, Zone `homeserver`, Capacity 3.6 TiB. Storage liegt auf `/volume1/garage/{meta,data}` (seit NAS-Cutover 2026-06 auf DS1825+).

Die NAS-IP steht in [Hosts und IPs](../../_referenz/hosts-und-ips.md).

| Attribut | Wert |
| :--- | :--- |
| **API-Endpoint** | Port 9012 |
| **S3 Web (Static Hosting)** | Port 9013 |
| **Admin/Metrics** | Port 9014 (Bearer-Token-Auth) |
| **Storage** | `/volume1/garage/{meta,data}` |
| **Config** | `/volume1/garage/garage.toml` (0600/root) |
| **Credentials** | siehe [Zugangsdaten](../../_referenz/credentials.md) |

### Buckets

| Bucket | Zweck | Verwendet von |
| :--- | :--- | :--- |
| `gravel-recherche` | Bilder + Files Directus Gravel-Bike-Recherche | Directus Gravel |

Jeder Bucket hat einen dedizierten Per-Bucket-Access-Key (kein globaler Admin-Account). Neue Buckets werden über die `garage`-CLI im Container angelegt.

::: info Linstor-S3-Shipping zurückgebaut
Garage diente früher als Ziel der Linstor-S3-Backup-Schicht (Remote `nas-backup`, Bucket `linstor-backups`). Scheduling und Deployment wurden am 2026-05-31 zurückgebaut -- Off-Node-Backup läuft seither über den Proxmox Backup Server plus app-konsistente DB-Dumps. Details: [Backup](../backup/).
:::

### Eigenschaften

- Keine eigene Admin-Web-UI -- Administration via `garage`-CLI im Container oder Admin-HTTP-API mit Bearer-Token
- Kein Object Versioning, kein Object Locking, keine Bucket Policies
- Per-Key-pro-Bucket-Permission-Modell statt globaler IAM-Policies
- Prometheus-Metriken unter `/metrics` (Token-geschützt)

## DSM-Verwaltung (alle Synology)

Alle Synology im Privat-Umfeld sind einheitlich konfiguriert. Die Steuerung läuft über die DSM-Web-API (`SYNO.Core.Web.DSM`, `SYNO.Core.Security.DSM`, `SYNO.Storage.CGI.Smart.Scheduler`); Login als `admin` mit OTP, Credentials im 1Password Vault `PRIVAT Agent`.

| Einstellung | Wert | Hinweis |
| :--- | :--- | :--- |
| DSM-Web-Port (HTTP/HTTPS) | 40000 / 40001 | HTTP→HTTPS-Redirect aktiv; einheitlich auf allen Homelab-Geräten |
| Logout-Timer | 600 Minuten | inaktive DSM-Sessions werden nach 10 h abgemeldet |
| SMART Quick-Test | wöchentlich Montag 03:00 | alle Datenträger |
| SMART Extended-Test | monatlich am 1. um 03:00 | alle Datenträger |

Die SMART-Kadenz folgt dem Konsens von TrueNAS/Backblaze/smartmontools (kurzer Selbsttest wöchentlich, langer Oberflächentest monatlich). DSM-Versionsbesonderheit: der Logout-Timer wird je DSM-Release über eine andere API-Version von `SYNO.Core.Security.DSM` gesetzt (DSM 7.3 → v6, DSM 7.2 → v5, DSM 7.1 → v4).

Die HSLU-DCLab- und ARCH-NAS folgen demselben Muster, behalten aber bewusst den DSM-Port `:8443` (wird für den Authentik-Login-Flow gebraucht) -- diese Geräte sind im DCLab-Wiki dokumentiert.

## Verwandte Seiten

- [NAS-Speicher](./index.md) -- Steckbrief, Architektur und Rolle im Stack
- [NAS-Storage: Betrieb](./betrieb.md) -- Troubleshooting, SSH-Hardening, Wartung
- [Zugangsdaten](../../_referenz/credentials.md) -- Garage-Keys und DSM-Login
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- NAS-Adressen
