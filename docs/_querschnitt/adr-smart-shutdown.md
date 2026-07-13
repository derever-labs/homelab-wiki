---
title: ADR Smart-Shutdown-Entscheidungsweg
description: Design-Historie des Smart-Shutdown-Verfahrens fuer Nomad-Clients (v9 bis v10.2)
tags:
  - adr
  - querschnitt
  - nomad
  - linstor
  - shutdown
---

# ADR Smart-Shutdown-Entscheidungsweg

Dieser Architecture Decision Record dokumentiert, wie das Smart-Shutdown-Verfahren fuer Nomad-Clients mit Linstor/DRBD Storage zu seiner heutigen Form gefunden hat. Er haelt die verworfenen Zwischenstaende und ihre Fehlermodi fest, damit bereits gepruefte Wege nicht erneut beschritten werden.

Die aktuelle Funktionsweise (Ist-Zustand) ist im [Runbook Kontrolliertes Herunterfahren](./smart-shutdown.md) beschrieben. Diese Seite beschreibt ausschliesslich den Weg dorthin.

## Kontext

Beim Standard-Shutdown beendet systemd Dienste oft parallel. Wird der Nomad-Agent oder das Netzwerk beendet, bevor die Storage-Volumes (DRBD/Linstor) ausgehaengt sind, entstehen Stale Locks und Filesystem-Fehler (Read-Only). Betroffen sind vor allem die Client-Nodes 05 und 06, auf denen Linstor CSI Volumes fuer PostgreSQL, Grafana und Loki gemountet sind.

Das Verfahren musste den Node vor dem Shutdown zuverlaessig drainen, DRBD sauber evakuieren und nach dem Reboot die Eligibility wiederherstellen. Die folgenden Iterationen zeigen, an welchen Details die jeweils naheliegende Loesung gescheitert ist.

## Entscheidungsweg

### v9 (bis 14.04.2026)

Erste Umsetzung als kombinierte `nomad-smart-shutdown.service` zusammen mit `drain_on_shutdown` in `client.hcl`. Der Nomad-Token war direkt im Skript hardcoded.

Problem: Der hardcodierte Token war weder rotierbar noch aus der Versionskontrolle heraushaltbar. Das motivierte die naechste Iteration.

### v10.0 (14.04.2026)

Der Token wanderte in ein EnvironmentFile, das Skript prueft seither auf dessen Vorhandensein.

Luecke: Die `nomad-boot-enable.service` hatte kein eigenes `EnvironmentFile=`. Am 22.04.2026 fuehrte das zum Ausfall: ein apt-daily-upgrade loeste einen `daemon-reexec` aus, dieser einen Nomad-Restart, worauf die Boot-Enable-Unit mit "NOMAD_TOKEN nicht gesetzt" scheiterte und der Node ineligible blieb. Der Vorfall zeigte, dass das `drain_on_shutdown`-Flag und die Boot-Restore-Logik entkoppelt werden mussten.

### v10.1 (23.04.2026)

`drain_on_shutdown` wurde aus `client.hcl` entfernt zugunsten des tgross-Pfads (`leave_on_interrupt=true` + `leave_on_terminate=false` + `KillSignal=SIGINT`).

Gescheitert: Solange das `drain_on_shutdown`-Flag gesetzt war, dominierte es und loeste bei jedem Agent-Stop einen Drain aus. Der Ansatz wurde verworfen.

### v10.1b (23.04.2026)

Neuer Versuch mit einer separaten `nomad-shutdown-drain.service` mit `Conflicts=shutdown.target`, die den Drain als eigenstaendige Unit orchestrieren sollte.

Gescheitert: Der Reboot-Test auf client-04 am 24.04.2026 zeigte, dass das ExecStop nicht feuerte. Ursache war ein systemd-Timing-Issue mit `DefaultDependencies=no`. Damit fiel das Konzept der separaten Unit weg.

### v10.2 (24.04.2026, aktueller Stand)

Die Shutdown-Orchestrierung laeuft seither als ExecStop-Drop-in direkt auf `nomad.service` statt ueber eine separate Unit. Der Stand wurde im Reboot-Test live verifiziert und auf allen Homelab- und DCLab-Clients ausgerollt.

## Nachwirkungen im heutigen Design

Zwei Details des aktuellen Verfahrens sind direkte Konsequenz des Ausfalls vom 22.04.2026 und ergeben sich nur aus diesem Entscheidungsweg:

- Die `nomad-boot-enable.service` traegt bewusst **kein** `PartOf=nomad.service`, sonst wuerde jeder `systemctl restart nomad` die Unit erneut triggern (der Vorfall-Vektor vom 22.04.2026).
- Die `needrestart`-Blacklist (`/etc/needrestart/conf.d/nomad.conf`) schuetzt gegen genau die apt-daily-upgrade-Kaskade, die den Ausfall vom 22.04.2026 ausgeloest hat.

Die vollstaendige Beschreibung dieser Schutzmechanismen im heutigen Zustand steht im [Runbook](./smart-shutdown.md).

## Verwandte Seiten

- [Kontrolliertes Herunterfahren](./smart-shutdown.md) -- Ist-Zustand des Smart-Shutdown-Verfahrens
- [Linstor/DRBD](../linstor-storage/index.md) -- Storage-Cluster und DRBD-Ressourcen
- [HashiCorp Stack](../nomad/index.md) -- Nomad Node Lifecycle und Drain-Konzept
