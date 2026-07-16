---
title: Storage und Backup
description: Oberkapitel für die Persistenz-Schicht -- Linstor/DRBD als Block-Storage für Cluster-Volumes, Synology NAS mit NFS und S3, Backup-Strategie mit PBS und App-Level-Dumps
tags:
  - overview
  - storage
  - backup
---

<!-- Übergangs-Stub, wird durch Big-Picture-Seite ersetzt, ClickUp 86carpf04 -->

# Storage und Backup

Dieses Kapitel bündelt die Persistenz-Schicht des Homelabs: Linstor stellt DRBD-repliziertes Block-Storage für Cluster-Volumes bereit, das Synology NAS liefert NFS-Exports und S3-Speicher, und die Backup-Strategie sichert VMs wie Applikationsdaten.

## Systeme

- [Linstor Storage](./linstor/) -- DRBD-repliziertes Block-Storage (CSI)
- [NAS Storage](./nas/) -- Synology NFS-Exports und Garage S3
- [Backup](./backup/) -- Backup-Strategie, PBS, pg_dumpall
