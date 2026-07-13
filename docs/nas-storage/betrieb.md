---
title: "NAS-Storage: Betrieb"
description: Troubleshooting, SSH-Hardening und Wartungsprozeduren des NAS
tags:
  - storage
  - nas
  - betrieb
  - troubleshooting
---

# NAS-Storage: Betrieb

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

## Erweiterungskarte (10GbE + NVMe)

Der HomeServer ist mit einer Synology E10M20-T1 bestückt (ein 10GbE-Port plus zwei M.2-NVMe-Slots). Die Karte ist nicht auf der Kompatibilitätsliste der DS1825+ und wird von DSM darum standardmässig gesperrt -- der 10GbE-Port liefe sonst als `notsup0`, die NVMe blieben im Storage Manager unsichtbar. Sie wird über einen Aufgabenplaner-Task (Auslöser Herunterfahren) freigeschaltet, analog zum SSH-Hardening. Hintergrund, Patch-Umfang und Persistenz: [E10M20-T1 Freischaltung](./e10m20-freischaltung.md).

## SSH-Zugang und Hardening

Benutzer, IP und Credential-Speicherorte: [SSH-Zugang](../_referenz/ssh-zugang.md) und [Zugangsdaten](../_referenz/credentials.md). Login als `admin` mit Public-Key (`SSH Homelab`) und `sudo` über das Admin-Passwort -- einheitlich auf allen Homelab-Synology (HomeServer, MediaServer, DS1525+, Nana). Passwort-Auth deaktiviert. Login-Daten liegen im 1Password Vault `PRIVAT Agent` (Item `NAS Privat Homeserver Admin`), der Key stammt aus `SSH Homelab Kopie`.

Das NAS ist seit 2026-05-01 nach demselben Pattern wie die DCLab-NAS gehärtet -- relevant für das Verständnis der Architektur:

- **Auth:** ausschliesslich Public-Key, `PasswordAuthentication no`, `PermitRootLogin no`, `AllowUsers admin` (Familien-Accounts mit `csh`-Shell sind ausgeschlossen)
- **Crypto:** moderne Cipher/KEX/MAC-Suites ersetzen die DSM-Defaults (3DES, SHA1) über einen `managed-by-claude-ssh-hardening`-Marker-Block am Anfang von `/etc/ssh/sshd_config` (OpenSSH first-obtained-value-wins)

::: warning Boot-Persistenz
Bei DSM-Major-Updates wird `/etc/ssh/sshd_config` aus den DSM-Defaults wiederhergestellt. Ein Boot-up-Task `ssh-hardening-reapply` im DSM Task Scheduler (User root) ruft `/volume1/scripts/ssh-hardening-reapply.sh` und reapplied den Hardening-Block idempotent. Das Skript liegt bewusst auf dem Daten-Volume und nicht auf der System-Partition (`/usr/local/sbin`) -- dort übersteht es DSM-Updates und Geräte-Migrationen.
:::

## Wartung

- Das NAS verwaltet seine eigene RAID-Konsistenz (SHR/RAID)
- Snapshots werden auf dem NAS selbst gesteuert
- Monitoring: Siehe [Synology NAS Monitoring](../synology-monitoring/index.md)

## Verwandte Seiten

- [NAS-Speicher](./index.md) -- Steckbrief, Architektur und Rolle im Stack
- [NAS-Storage: Referenz](./referenz.md) -- NFS-Exports, Garage-Endpunkte/Buckets, DSM-Konfiguration
- [E10M20-T1 Freischaltung](./e10m20-freischaltung.md) -- 10GbE/NVMe-Freischaltung im Detail
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- CheckMK-Hardware-Health, Grafana Dashboard, Alerting
