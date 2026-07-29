---
title: Storage und Backup
description: Oberkapitel für die Persistenz-Schicht -- Linstor/DRBD als Block-Storage für Cluster-Volumes, Synology NAS mit NFS und S3, Backup-Strategie mit PBS und App-Level-Dumps
tags:
  - overview
  - storage
  - backup
---

# Storage und Backup

Die Persistenz-Schicht des Homelabs steht auf drei Beinen: Linstor/DRBD repliziert Block-Volumes für den Nomad-Cluster, das Synology NAS liefert Shared Storage über NFS und S3, und die Backup-Kette sichert beides über den Proxmox Backup Server plus app-konsistente Dumps. Diese Seite ist das Big Picture: zwei Szenario-Diagramme zeigen, welche Datenklasse wo liegt und wie die Backup-Kette läuft; das [Ausfallverhalten](#ausfallverhalten) beantwortet, was beim Ausfall einzelner Glieder passiert. Die Details bleiben auf den Systemseiten.

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Deployment | Ansible-Rollen `drbd-reactor` + `nfs`, Nomad `system/linstor-csi.nomad`, Backup-Jobs unter `batch-jobs/`, vzdump in Proxmox VE |
| Monitoring | Kuma-Pushes der Backup-Jobs, CSI-Health-Metriken, CheckMK-SNMP fürs NAS |
| Hosts/IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

### Systeme

| System | Zweck | Vertiefung |
| :--- | :--- | :--- |
| **[Linstor & DRBD](./linstor/)** | DRBD-repliziertes Block-Storage für Cluster-Volumes (CSI) | [Referenz](./linstor/referenz.md), [Betrieb](./linstor/betrieb.md), [Split-Brain-Runbook](./linstor/split-brain-runbook.md) |
| **[NAS-Speicher](./nas/)** | Synology NFS-Exports und Garage S3 | [Referenz](./nas/referenz.md), [Betrieb](./nas/betrieb.md) |
| **[Backup](./backup/)** | PBS-VM-Backups plus app-konsistente Dumps | [Referenz](./backup/referenz.md), [Betrieb](./backup/betrieb.md) |
| **[Videoüberwachung Dottikon](./ueberwachung-dottikon/)** | Kamera-Retention-Ebenen auf der DS1525+ der Aussenstelle | [Referenz](./ueberwachung-dottikon/referenz.md), [Betrieb](./ueberwachung-dottikon/betrieb.md) |

Die Videoüberwachung Dottikon ist ein standort-autonomes Retention-System auf der dortigen Synology -- sie hat keine Berührung mit Linstor, NFS oder der Backup-Kette dieses Big Pictures und taucht in den Diagrammen unten deshalb nicht auf.

## Das Gesamtbild in zwei Pfaden

Storage und Backup beantworten drei Fragen: Welche Datenklasse liegt wo und wer schreibt sie (**Datenpfad**), wie kommen laufende Systeme in ein Backup und was deckt die Kette nicht (**Backup-Kette**), und was passiert beim Ausfall einzelner Glieder (**Ausfallverhalten**).

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt. **Durchgezogene** Kanten sind synchrone Schreib- oder Abrufflüsse, **gestrichelte** Kanten sind ereignisgetriebene Meldungen. Die Farbe kodiert den Weg: Blau ist der replizierte Block-Weg (Linstor/DRBD), Grün der NAS-Weg (NFS und S3), Braun die PBS-Block-Kette, Violett die Dump-Kette, Grau sind lokale und Melde-Wege.

### Datenpfad -- welche Datenklasse liegt wo

**Leitfrage:** Welche Datenklasse liegt wo -- und wer schreibt sie?

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  db: { shape: cylinder; style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  drbdweg: { style: { stroke: "#2563eb" } }
  nasweg: { style: { stroke: "#0f766e" } }
  lokalweg: { style: { stroke: "#6b7280" } }
}

jobs: Nomad-Jobs {
  class: svc
  tooltip: Schreiber sind die Container selbst -- Datenbanken, App-State, Media-Stack, Batch-Jobs
}

linstor: Linstor/DRBD (c05 + c06) {
  class: container
  tooltip: Quorum 2-von-3 mit disklosem Witness c04 -- Topologie auf der Linstor-Seite

  primary: Replica Primary { class: db }
  secondary: Replica Secondary { class: db }

  primary -> secondary: 2. spiegelt synchron (Thunderbolt) { class: drbdweg }
}

nas: NAS (Synology) {
  class: container
  tooltip: HomeServer serviert die Exports -- die Jellyfin-Mediathek kommt separat vom Alt-NAS

  exports: NFS-Exports {
    class: db
    tooltip: /nfs/docker, /nfs/jellyfin, /nfs/backup, /nfs/logs -- fstab-Mounts via Ansible-Rolle nfs
  }
  garage: Garage S3 {
    class: db
    tooltip: S3-Object-Store nur intern -- Single-Node mit Replikationsfaktor 1
  }
}

lokal: Node-lokale Pfade {
  class: db
  tooltip: Transcode- und Cache-Verzeichnisse -- flüchtig, ohne Replikation und Backup
}

jobs -> linstor.primary: 1. schreibt DBs + App-State (CSI) { class: drbdweg }
jobs -> nas.exports: 3. Medien, Bulk und Dumps (NFS) { class: nasweg }
jobs -> nas.garage: 4. S3-API einzelner Apps { class: nasweg }
jobs -> lokal: 5. Transcodes + Caches { class: lokalweg }
```

Lesehilfe:

1. Nomad-Jobs mounten ihren Zustand als Linstor-CSI-Volume -- die Datenbanken (PostgreSQL, MariaDB, InfluxDB) und der App-State (Gitea, Loki, Paperless u.a.); die Volume-Liste führt der [Linstor Betrieb](./linstor/betrieb.md#volume-management). Viele Apps schreiben zusätzlich indirekt über den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md), der selbst auf einem Linstor-Volume liegt.
2. DRBD bestätigt jeden Schreibvorgang erst nach synchroner Spiegelung auf die zweite Replica -- über das Thunderbolt-Netz zwischen client-05 und client-06, das Quorum stellt der diskless Witness client-04 ([Schreibpfad](./linstor/index.md#schreibpfad-synchrone-replikation)).
3. Medien, Bulk-Daten und die Backup-Ablage hängen als NFS-Mounts an allen Client-VMs -- verwaltet über die Ansible-Rolle `nfs`; die Export-Tabelle steht in der [NAS Referenz](./nas/referenz.md#nfs-exports), die Verteilung auf die beiden Geräte in der [NAS-Architektur](./nas/index.md#architektur).
4. Einzelne Apps sprechen [Garage S3](./nas/referenz.md#garage-s3) auf dem NAS direkt über die S3-API an (Per-Bucket-Keys, nur intern erreichbar).
5. Flüchtige Daten wie Jellyfin-Transcodes und Caches bleiben auf node-lokalen Pfaden -- bewusst ohne Replikation und ohne Backup, beim Job-Neustart werden sie geleert.

Die Zuordnungsregel dahinter: Was bei einem NAS-Ausfall weiterlaufen muss (Datenbanken, App-State), liegt auf DRBD. Was gross, geteilt oder wiederbeschaffbar ist (Medien, Bulk, Dumps), liegt auf NFS. Was verzichtbar ist, bleibt lokal. Die Speicher-Ebenen im Detail: [Datenstrategie](../_querschnitt/datenstrategie.md).

### Backup-Kette -- zwei Schichten bis aufs NAS

**Leitfrage:** Wie kommen laufende Systeme in ein Backup -- und was deckt die Kette nicht?

Die Kette hat zwei bewusst getrennte Schichten: Der Block-Weg über PBS bringt ganze VMs zurück, unabhängig davon, was darin lief. Der Dump-Weg bringt einzelne Datenbestände app-konsistent zurück, auch in eine frisch aufgebaute Umgebung. Erst zusammen decken sie den Hardware- wie den Applikationsfall.

```d2
classes: {
  svc: { style: { border-radius: 8 } }
  db: { shape: cylinder; style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  pbsweg: { style: { stroke: "#854d0e" } }
  dumpweg: { style: { stroke: "#7c3aed" } }
  heartbeat: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

pve: Proxmox-Nodes {
  class: svc
  tooltip: Cluster pve00 bis pve02 plus externe Nodes in Luzern und Dottikon (Push via Tailscale)
}
pbs: Proxmox Backup Server { class: svc }
batch: Backup-Batch-Jobs (Nomad) {
  class: svc
  tooltip: Gestaffelt zwischen 01.30 und 03.30 Uhr -- Schedules in der Batch-Jobs-Übersicht
}
quellen: Produktive Datenbestände {
  class: db
  tooltip: PostgreSQL, MariaDB und InfluxDB auf Linstor-Volumes plus Raft-State von Consul, Nomad und Vault
}
nas: NAS (Synology) {
  class: container

  datastore: PBS-Datastore { class: db }
  dumps: /nfs/backup { class: db }
}
kuma: Uptime Kuma { class: svc }

pve -> pbs: 1. vzdump Snapshot-Backup mit Fleecing (Block-Level) { class: pbsweg }
pbs -> nas.datastore: 2. legt deduplizierte Chunks ab (NFS) { class: pbsweg }
batch -> quellen: 3. zieht Dumps + Raft-Snapshots (app-konsistent) { class: dumpweg }
batch -> nas.dumps: 4. schreibt age-verschlüsselt mit GFS-Rotation (NFS) { class: dumpweg }
pbs -> kuma: 5. Heartbeat nach Backup-Erfolg { class: heartbeat }
batch -> kuma: 6. Push nach Job-Erfolg { class: heartbeat }
```

Lesehilfe:

1. Jede Proxmox-Node sichert ihre lokalen VMs täglich per vzdump im Snapshot-Modus mit Fleecing an den PBS -- Block-Level, inklusive der DRBD-Datendisk von client-05; auch die externen Nodes in Luzern und Dottikon pushen via Tailscale ([Was wird gesichert](./backup/referenz.md#was-wird-gesichert)).
2. PBS dedupliziert die Blöcke und legt die Chunks in seinem Datastore ab -- der liegt per NFS auf dem NAS ([Datastore](./backup/referenz.md#datastore)); die Aufbewahrung regelt die [Retention Policy](./backup/referenz.md#retention-policy).
3. Die Nomad-Batch-Jobs ziehen nachts gestaffelt app-konsistente Sicherungen -- `pg_dumpall` über alle PostgreSQL-Datenbanken, MariaDB- und InfluxDB-Backups sowie Raft-Snapshots von Consul, Nomad und Vault ([Batch Jobs](../_querschnitt/batch-jobs.md#backup)).
4. Die Outputs gehen age-verschlüsselt nach `/nfs/backup/` und rotieren nach GFS-Schema (täglich/wöchentlich/monatlich, konkrete Stände in den Job-Headern unter `batch-jobs/`) -- Schlüssel-Handling und Restore-Vorbereitung: [Verschlüsselung (age)](./backup/index.md#verschlusselung-age).
5. PBS meldet erfolgreiche Backups als Heartbeat an Uptime Kuma, jeder Batch-Job pusht nach Erfolg -- bleibt ein Push aus, alarmiert Kuma über Keep ([Check-Pfad](../monitoring/index.md#check-pfad-aktive-uberwachung)).

::: warning Was die Kette nicht deckt
- **DRBD-Replikation ist kein Backup:** Sie hält Volumes verfügbar, repliziert aber jeden logischen Fehler (Löschung, fehlgeschlagene Migration) synchron mit.
- **Die DRBD-Datendisk von client-06 ist vom VM-Backup ausgenommen** (`backup=0`): Fällt client-05 aus, existiert der jüngste Block-Stand der Volumes nur noch live auf client-06 -- die App-Dumps sind in diesem Fenster die Absicherung ([Details](./backup/referenz.md#drbd-datendisk-des-storage-nodes-c06-ausgenommen)).
- **Beide lokalen Backup-Ziele liegen auf demselben NAS:** PBS-Datastore und App-Dumps teilen sich das NAS als Single Point of Failure. Fällt es aus, bleibt nur die [Off-Site-Kopie](./backup/index.md#off-site-kopie) nach Dottikon als Restore-Weg -- langsamer und mit Datenverlust bis zum letzten Lauf ([Architektur-Grenzen](./backup/index.md#bewusste-architektur-grenzen)).
- **Node-lokale flüchtige Daten** (Transcodes, Caches) werden nirgends gesichert -- bewusst.
:::

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss -- je mit dem Verhalten der verbleibenden Glieder:

- **Was, wenn eine DRBD-Replica ausfällt (client-05 oder client-06 down)?** Die Volumes bleiben verfügbar: Die zweite Replica hält jeden Block synchron, das Quorum bleibt mit dem Witness client-04 bei 2-von-3. Der Linstor-Controller failovert via DRBD Reactor in 10-15 Sekunden ([Controller Failover](./linstor/betrieb.md#controller-failover)), Nomad plant betroffene Jobs auf den überlebenden Storage-Node um; Orphan-Mounts nach einem Crash erkennt das [CSI Health Monitoring](./linstor/index.md#csi-health-monitoring). Der Cluster läuft degradiert mit nur noch einer Live-Kopie -- fällt jetzt auch der zweite Node aus, sind die Volumes offline. Speziell beim Ausfall von client-05 gilt die Backup-Lücke aus der Warnung oben: Der jüngste Block-Stand liegt dann nur noch auf client-06, dessen Datendisk nicht im VM-Backup ist.

- **Was, wenn das NAS down ist?** Der replizierte Block-Weg läuft weiter -- Datenbanken und App-State auf Linstor-Volumes sind bewusst NAS-unabhängig. Tot sind der NFS-Weg (Mediathek, Bulk-Daten) und sämtliche Backup-Ziele: PBS-Datastore und `/nfs/backup` liegen beide auf dem NAS, während der Downtime entsteht kein neues Backup. Prozesse, die auf hängende NFS-Mounts zugreifen, blockieren im D-State -- diese Falle hat im Mai 2026 die Storage-Nodes selbst erwischt und ist seither entschärft ([NFS-Selbstreferenz vermieden](./linstor/index.md#csi-health-monitoring)). Sichtbar wird der Ausfall über ausbleibende Kuma-Pushes der Backup-Jobs; die NAS-Hardware überwacht CheckMK via SNMP ([Synology NAS Monitoring](../monitoring/synology-monitoring/index.md)).

- **Was, wenn PBS down ist?** Es fehlt nur die Block-Schicht: vzdump-Jobs schlagen fehl, der PBS-Heartbeat an Kuma bleibt aus und alarmiert. Die App-Dumps laufen unabhängig weiter nach `/nfs/backup/`. Es gehen keine Daten verloren, aber der jüngste VM-Wiederherstellungspunkt altert mit jedem verpassten Tag, und ein VM-Restore ist erst nach der PBS-Wiederherstellung möglich. Restore-Wege und geübte Zeiten: [Restore-Prozeduren](./backup/betrieb.md#restore-prozeduren) und [Drill-Ergebnisse](./backup/betrieb.md#drill-ergebnisse-2026-06-10).

## Verwandte Seiten

- [Linstor & DRBD](./linstor/) -- Cluster-Topologie, Quorum, CSI-Integration, Tuning
- [Linstor Betrieb](./linstor/betrieb.md) -- Failover, Volume-Liste, CSI-Monitoring
- [NAS-Speicher](./nas/) -- NFS-Exports, Garage S3, DSM-Verwaltung
- [Backup](./backup/) -- Backup-Schichten, Verschlüsselung, Architektur-Grenzen
- [Backup Betrieb](./backup/betrieb.md) -- Restore-Prozeduren und Drill-Ergebnisse
- [Datenstrategie](../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Datenbank-Strategie
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Service-Zuordnung
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Schedules der Backup- und Wartungs-Jobs
- [Monitoring Stack](../monitoring/index.md) -- Kuma-Pushes und Storage-Alerts im Gesamtbild
- [Synology NAS Monitoring](../monitoring/synology-monitoring/index.md) -- Hardware-Health des NAS
- [Proxmox](../infrastruktur/proxmox/) -- Cluster, VMs und externe Standalone-Nodes
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Adressen von NAS, PBS und Storage-Nodes
