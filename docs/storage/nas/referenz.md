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

## Home-Zugang der Dokumenten-Verarbeitung

Seit dem 01.08.2026 greifen zwei Cluster-Konsumenten auf den persönlichen Datenbestand im `homes`-Share zu: die [Dokumenten-Pipeline](../../dienste/dokumenten-pipeline/index.md) liest den Bestand, [Paperless-ngx](../../dienste/paperless/index.md) legt seine Dokumente dort ab. Dieser Zugang ist von den Cluster-Exports oben getrennt zu betrachten -- er ist enger geschnitten und existiert nur auf den beiden Storage-Nodes.

### Export-Regel auf dem NAS

| Attribut | Wert |
| :--- | :--- |
| Freigabe | `homes` (Shared Folder, DSM) |
| Berechtigte Hosts | genau zwei Einzel-IP-Regeln: `10.0.2.125` und `10.0.2.126` |
| Privileg | Lesen und Schreiben |
| Squash | `root` auf `guest` |
| Sicherheit | `sys`, keine nicht-privilegierten Quellports, kein Zugriff auf eingehängte Unterordner |

DSM kennt NFS-Berechtigungen ausschliesslich pro Freigabeordner, nie pro Unterordner. Ein rein lesender Export des Bestands und ein schreibender Export für Paperless sind deshalb serverseitig nicht gleichzeitig aus demselben Share zu bekommen -- der Export ist rw, und die Lese-Beschränkung passiert client-seitig. Beide Node-IPs stehen bewusst in der Regel, weil Nomad den Paperless-Job zwischen den Storage-Nodes verschieben darf.

Wildcard- und Subnetz-Muster im Host-Feld sind bewusst nicht verwendet (in der Community als unzuverlässig umgesetzt beschrieben, bei zwei Clients sind Einzel-IPs eindeutiger). Kerberos, ein dediziertes NFS-VLAN und ein erzwungenes NFSv4.1 wurden geprüft und verworfen: Sie stehen bei zwei festen, vertrauten Client-IPs im eigenen Netz in keinem Verhältnis zum Zusatznutzen gegenüber IP-Regel und Squash.

::: warning DSM-Firewall bleibt aus
Die DSM-Firewall ist geräteweit deaktiviert und wurde für diesen Zugang bewusst nicht aktiviert -- sie einzuschalten wäre ein Grundsatz-Eingriff, der alle Dienste und alle Familien-Clients betrifft und ein Aussperr-Risiko trägt. Die Zugriffsbegrenzung leisten die beiden Einzel-IP-Regeln und der Squash. Akzeptierte Restrisiken: Die NFS-Hilfsdienste bleiben im LAN ansprechbar, und ein bereits kompromittiertes LAN-Gerät könnte eine der beiden Node-IPs übernehmen.
:::

### Mounts auf den Storage-Nodes

Auf `vm-nomad-client-05` und `vm-nomad-client-06` liegen zwei getrennte Unterpfad-Mounts desselben Exports, identisch über Ansible verwaltet:

| Mount | Modus | Zweck |
| :--- | :--- | :--- |
| `/nfs/home-samuel` | Kernel-`ro`, lange Attribut-Cache-Zeiten | Lesezugriff der Pipeline auf den Gesamtbestand |
| `/nfs/paperless` | `rw`, kurze Attribut-Cache-Zeiten | Ablage von Paperless (Unterordner `90_Paperless`) |

Dass client-seitig zwei Unterpfade desselben Exports mit unterschiedlichen Rechten gemountet werden können, ist der Kern des Zuschnitts -- die Beschränkung auf Freigabeordner-Ebene betrifft nur die Export-Regel auf dem NAS, nicht das Mounten. Weil der Export selbst rw ist, trägt der Kernel-`ro`-Mount die Nur-Lese-Garantie für den Bestand: Er gilt für jeden Prozess auf dem Node, unabhängig von Job-Konfiguration und Benutzer, während ein `read_only` am Nomad-Volume nur bei Nomad-verwalteten Binds greift.

Beide Mounts sind `hard` gesetzt statt `soft` -- ein `soft`-Mount riskiert bei einem Dauerdienst Datenkorruption statt nur einer Verzögerung -- und tragen `nosuid`, `nodev` und `noexec`: Auf diesen Pfaden liegen Dokumente, ausgeführt wird dort nie etwas. Die Attribut-Cache-Zeiten sind bewusst verschieden: Der Bestand ändert sich während eines Laufs praktisch nicht und wird in zehntausenden Dateien am Stück gelesen, die Paperless-Ablage wird laufend beschrieben und von beiden Nodes gesehen. Die konkreten Optionen stehen in der Ansible-Rolle `roles/nfs`.

Nomad reicht die Pfade als deklarierte `host_volumes` weiter (`nfs-home-samuel` schreibgeschützt, `nfs-paperless` schreibend), sodass nur Jobs zugreifen, die das Volume explizit anfordern, und die Nomad-ACL greifen kann.

::: info Übergangszustand bis zum eigenen Share
Dass der `homes`-Share überhaupt rw exportiert wird, ist ein bewusst befristeter Kompromiss. Der Zielzustand des NAS-Projekts sind zwei eigene Freigaben für den aufgeräumten Bestand (Export nur lesend) und für Paperless (Export schreibend). Sobald die Einsortierung abgeschlossen ist, entfällt der `homes`-Export ersatzlos und die harte serverseitige Nur-Lese-Garantie ist wieder da. Die Sortierung schreibt ohnehin um -- der neue Share wird direkt ihr Ablageziel, ein separater Massen-Umzug entfällt.
:::

## Garage S3

Garage läuft als Container auf dem NAS als S3-kompatibler Object Store für Backups. Der Endpoint ist nur intern erreichbar -- kein Public-Routing über Traefik. Single-Node-Setup, `replication_factor = 1`, Zone `homeserver`, Capacity 3.6 TiB. Storage liegt auf `/volume1/garage/{meta,data}` (seit NAS-Cutover 2026-06 auf DS1825+).

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
