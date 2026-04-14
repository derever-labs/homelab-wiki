---
title: Migration Flux → InfluxQL
description: Retrospektive der Grafana-Dashboard-Migration von Flux-Queries auf InfluxQL als Reaktion auf InfluxDB 3.x und die parallele Entdeckung von Wiki/Realität-Drifts
tags:
  - monitoring
  - influxdb
  - grafana
  - migration
  - adr
---

# Migration Flux → InfluxQL (2026-04)

## Kontext

Anlass war ein Screenshot des Nomad-Resources-Dashboards mit durchgehend "No data"-Panels. Die Ursachenanalyse ergab zwei Befunde gleichzeitig: erstens einen falschen Datasource-Mismatch (InfluxQL-Queries gegen eine Flux-Datasource), zweitens und strategisch wichtiger, dass Flux bei InfluxData in den Wartungsmodus übergeht und in InfluxDB 3.x (GA April 2025) nur noch über einen performance-schwachen Compatibility-Layer zur Verfügung steht. InfluxQL ist in 3.x nativ, SQL ist die mittelfristige Zukunft.

Parallel dazu bestand im Homelab bereits die Wiki-Empfehlung "InfluxQL für alle Dashboards" -- umgesetzt war sie aber nur in einem einzigen Dashboard (`nomad-resources.json`).

## Entscheidung

Alle 9 produktiv genutzten Dashboards und alle 22 metrikbasierten Alert Rules werden von Flux auf InfluxQL umgestellt. Die `InfluxDB-Flux`-Datasource bleibt parallel bestehen, bis auch die drei verbliebenen HART-Alerts umgezogen werden können. InfluxDB bleibt bewusst bei 2.8 -- ein 3.x-Sprung wurde evaluiert und für das aktuelle Homelab-Setup (Retention, Backup, Downsampling-Tasks) als verfrüht bewertet.

Begleitend:

- **Downsampling-Tasks** werden erstmals im Repo versioniert. Quelle-der-Wahrheit ist Git, die Tasks laufen aber weiter in der InfluxDB-UI -- der Import erfolgt manuell.
- **GitOps-Workflow** für Dashboard-Deployment: Grafana zieht die JSON-Dateien nicht mehr von einem NFS-Mount, sondern ein GitHub-Actions-Workflow pusht geänderte Dashboards per HTTP-API.
- **Uptime Kuma Push-Monitore** für jeden Downsampling-Task, damit ein stiller Task-Ausfall nicht wie beim Bug in `downsample_telegraf_to_1y` wochenlang unbemerkt bleibt.

## Umfang

Dashboards (alle in `nomad-jobs/monitoring/grafana-dashboards/`):

- `ups.json` -- Pilot
- `dns.json`
- `raft-health.json`
- `synology-nas.json`
- `linstor.json`
- `media.json`
- `overview.json`
- `proxmox.json`
- `log-overview.json` -- gerettet aus dem NFS-Mount, war im Git nicht vorhanden, Loki-basiert (keine Flux-Arbeit nötig)

Alerts in `grafana.nomad`:

- 19 triviale Alerts: Storage/DRBD/Nomad/USV/Synology/Proxmox/Linstor
- 3 HART-Alerts bleiben Flux: `nomad-memory-warn`, `nomad-memory-crit`, `synology-volume-warn`
- 4 Loki-basierte Alerts unverändert (SSH / Traefik 5xx / Nomad Alloc Failed / Vault Permission Denied)

## Trade-offs

### Was InfluxQL gegenüber Flux verliert

- **Multi-Table-Joins** sind in InfluxQL nicht nativ. Flux kann mit `join(tables: {a, b}, on: [...])` zwei Query-Resultate anhand eines Tags zusammenführen. In InfluxQL müssen solche Panels als zwei Grafana-Queries mit anschliessender `Join by field`-Transformation realisiert werden, oder -- wo möglich -- als einzelne Query mit Arithmetik zwischen Aggregaten.
- **Pivot + map()** für Label-Rewrites ist in Flux kompakt. In InfluxQL ersetzen Grafana-Template-Variablen (`$tag_*` in der Panel-Alias) das meiste davon.
- **Flux-Variable-Blöcke** mit mehreren zusammengesetzten Pipelines (wie bei den Memory-Prozent-Alerts) sind in InfluxQL unschön, weil die arithmetische Verknüpfung zwischen verschiedenen `last()`-Aggregaten am Schema scheitert, sobald die Felder unterschiedliche Tag-Strukturen haben. Dort bleiben die HART-Alerts bewusst auf Flux.

### Was InfluxQL gewinnt

- **Nativer 3.x-Pfad.** Migration auf InfluxDB 3.x wird später zu einem Syntax-Adapter, nicht zu einem Query-Rewrite.
- **Performance** für einfache Aggregationen, je nach Query-Typ 6-30x schneller laut Wiki-Messungen.
- **Arithmetik im SELECT** (`SELECT last(a) - last(b)`) ist mächtiger als der Ruf -- damit konnten mehrere vermeintliche HART-Panels (z.B. Raft Log Index Gap) tatsächlich als einzelne Query realisiert werden.

### Was das HART-Budget ist

Drei Flux-Alerts bleiben stehen, weil eine Umstellung zu viel Grafana-Transformations-Komplexität in die Unified-Alerting-YAML einführt. Der Trade-off ist bewusst: lieber drei kleine Legacy-Flux-Inseln als 10 unleserliche YAML-Blöcke mit Transform-Pipelines. Sobald der InfluxDB-3.x-Sprung bevorsteht, werden die drei Alerts als letzter Schritt umgebaut.

## Stolpersteine auf dem Weg

Die Flux→InfluxQL-Migration hat mehrere ältere Wiki/Realität-Drifts ans Licht geholt. Die Dashboards sind syntaktisch korrekt, liefern aber keine Daten, weil die Source selbst nie wirklich durchverdrahtet wurde oder zwischenzeitlich gebrochen ist:

- **UPS / NUT / Telegraf upsd-Input** -- Wiki beschreibt einen vollständigen NUT + Telegraf-Stack, die `telegraf.conf` hat aber gar kein `[[inputs.upsd]]`. Der `upsd`-Measurement hat 0 Datenpunkte in beiden Buckets.
- **Telegraf prometheus-Input für Nomad/Consul** -- `nomad_raft_*`-Metriken sind seit einiger Zeit leer. Betrifft `raft-health.json`, `nomad-resources.json`, Nomad-Panels im Overview und mehrere Alerts.
- **Telegraf Proxmox-Collector** -- Der gesamte `proxmox`-Bucket ist leer. `proxmox.json` bleibt nach Migration ohne Daten, Task `proxmox-node-down` alert feuert in `NoData`.
- **raid_benchmark-Measurement** -- Ein Custom-Benchmark-Script der Synology, das nie deployt wurde. Das entsprechende Panel in `synology-nas.json` ist migriert, bleibt aber leer.

Diese Drifts wurden während der Source-Health-Prüfung erkannt und in ClickUp erfasst -- sie sind unabhängig von der Flux-Migration selbst und betreffen die Datenquellen, nicht die Query-Sprache.

## GitOps-Workflow

Die Dashboard-Verteilung ist Teil dieser Migration umgebaut worden. Vorher lag ein NFS-Mount `/nfs/docker/grafana/dashboards:ro` im Grafana-Container und Grafana nutzte den File-Provider -- ohne Git-Sync-Automation, ohne Audit-Spur, mit impliziter NAS-Kopplung. Neu: ein GitHub-Actions-Workflow (`deploy-grafana-dashboards.yml`) holt sich via Vault-Workload-Identity das Grafana Service-Account-Token und pusht geänderte Dashboards per `POST /api/dashboards/db`. Die Grafana-Adresse wird dynamisch aus dem Consul-Catalog gelöst, damit der Workflow unabhängig von dynamischen Nomad-Ports funktioniert und Authentik umgeht. Details: [GitHub Runner Referenz](../github-runner/referenz.md).

## Lessons Learned

- **Source-Health vor Query-Migration prüfen.** Die strukturelle Migration war am Ende der einfache Teil; die halbe Zeit ging darauf, zu verstehen, dass mehrere Dashboards nach der Migration weiter leer waren -- nicht wegen Query-Bugs, sondern weil die Datenquelle selbst tot ist. Bei der nächsten grossen Schema-Migration zuerst die Source-Health-Matrix aufstellen, dann migrieren.
- **HART ist ein Budget, kein Qualitätsmassstab.** Nicht jede Komplexität muss aufgelöst werden. Drei Flux-Alerts bleiben stehen, weil die Alternative eine schlechtere YAML war.
- **Grafana markiert alte Alert-UIDs als stale**, wenn sie beim Neuladen nicht mehr in der Provisioning-YAML stehen. Das ist OK und räumt sich selbst auf, aber der Noise im Log beim ersten Deploy ist hoch.
- **File-provisioned Dashboards werden beim Provider-Entfernen gelöscht.** Das war der Gotcha beim Umbau von NFS auf API-Push: Die Dashboards mussten nach dem Provider-Entfernen erneut per API gepusht werden, damit sie als reguläre DB-Einträge und nicht mehr als "provisioned" in der Grafana-Datenbank stehen.
- **InfluxQL arithmetische Operationen zwischen Aggregaten** (`SELECT last(a) - last(b) FROM m`) sind in der Praxis mächtiger als erwartet. Mehrere vermeintliche HART-Panels liessen sich damit als einzelne Query realisieren.

## Referenzen

- Monitoring Stack Übersicht: [monitoring/index.md](./index.md)
- InfluxDB-Details: [monitoring/influxdb.md](./influxdb.md)
- GitHub Runner + CD-Pipelines: [github-runner/referenz.md](../github-runner/referenz.md)
- Betroffene Repo-Pfade: `nomad-jobs/monitoring/grafana-dashboards/`, `nomad-jobs/monitoring/grafana.nomad`, `nomad-jobs/monitoring/influxdb-tasks/`
- Follow-up Source-Fixes: UPS/NUT, Telegraf prometheus-Input, Proxmox-Collector, raid_benchmark -- alle in ClickUp erfasst
