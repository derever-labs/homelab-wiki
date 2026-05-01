---
title: Nomad Betrieb
description: Betrieb und Abhängigkeiten des Nomad Clusters
tags:
  - nomad
  - betrieb
  - operations
---

# Nomad Betrieb

## Übersicht

Der Nomad-Cluster betreibt alle Docker-basierten Workloads im Homelab. Er besteht aus 3 Server-Nodes (Raft-Konsens) und 3 Client-Nodes (Worker). Die Server verwalten den Cluster-Zustand und planen Workloads; die Clients führen Container aus.

Alle drei Server sind gleichwertig als API-Endpunkt nutzbar. ACLs sind aktiv -- jede Interaktion mit der Nomad API erfordert ein Token.

## Abhängigkeiten

- **Consul** -- Service Discovery und Health Checks für alle Jobs; Nomad registriert laufende Allocations automatisch
- **Vault** -- Secret-Injection über den Vault-Agent (Templates in Job-Definitionen); Vault muss erreichbar und unsealed sein
- **NFS (Synology)** -- Persistenter Shared Storage für Jobs die auf `/nfs/` mounten; bei NFS-Ausfall starten betroffene Jobs nicht
- **Docker** -- Container-Runtime auf allen Client-Nodes; Nomad setzt `docker.enable = true` in der Client-Konfiguration voraus
- **Linstor CSI** -- Block-Storage für Datenbanken (PostgreSQL, Redis); das CSI-Plugin muss auf den Clients healthy sein bevor CSI-Volumes gemountet werden können

## Automatisierung

**Preemption** ist seit 01.04.2026 für Service- und Batch-Jobs aktiv. Nomad kann niedrigprioritäre Allocations verdrängen, um höherprioritären Jobs Platz zu schaffen. Das Mindest-Prioritätsdelta beträgt 10 Punkte (Priorität 100 kann Priorität 90 oder tiefer verdrängen). Verdrängte Jobs werden automatisch rescheduled, sofern eine `reschedule`-Stanza konfiguriert ist.

**Smart Shutdown (v10.2, Refactor 2026-04-23/24)** -- der Drain wird nicht mehr ueber die Nomad-Client-Option `drain_on_shutdown` getriggert, sondern explizit ueber einen `ExecStop`-Drop-in auf `nomad.service` mit einem `systemctl is-system-running`-Guard. Unterschied:

- **Bei Reboot / Halt / Shutdown** (`systemctl reboot`) laesst der Guard den Shutdown-Pfad durch, `ExecStop` triggert in Reihenfolge: `nomad node drain -enable -self -yes -deadline 5m -ignore-system`, dann `drbd-reactorctl evict --delay 30 linstor_db` (nur wenn ein UpToDate-Peer existiert, Split-Brain-Schutz), dann Mount-Wait-Loop fuer LINSTOR-CSI-Volumes.
- **Bei systemctl restart nomad** (Config-Reload, Ansible-Run) wird der Guard abgewiesen (Zustand `running`) und der Node draint NICHT. Tasks bleiben auf dem Node, Nomad-Agent zyklt in unter 10 Sekunden.

Historische Falsche Pfade: v10.0 hatte `leave_on_interrupt`/`leave_on_terminate` + `KillSignal=SIGINT` versucht -- funktioniert nicht, weil `drain_on_shutdown` dominiert. v10.1 hatte eine eigene `nomad-shutdown-drain.service` mit `Conflicts=shutdown.target` -- beim Live-Reboot-Test auf client-04 (2026-04-24) hat der ExecStop dort nicht gefeuert (bekanntes systemd-Timing-Issue mit `DefaultDependencies=no`). v10.2 nutzt stattdessen einen Drop-in `/etc/systemd/system/nomad.service.d/20-shutdown-drain.conf` mit `ExecStop=` direkt auf `nomad.service` -- das feuert zuverlaessig im Stop-Lifecycle.

Zusaetzlich: `nomad-boot-enable.service` hat `EnvironmentFile=-/etc/nomad-boot-enable/token.env` (graceful bei fehlendem Token) und bewusst KEIN `PartOf=nomad.service` (sonst wuerde jeder apt-daily-upgrade-Trigger die Unit erneut aufrufen -- das war der Vorfall vom 22.04.2026). `/var/lib/nomad/drain-manual` dient als Sentinel-File: solange es existiert, ueberspringt `nomad-boot-enable` das Re-Enable beim Boot (Admin-Drain bleibt ueber Reboot hinweg erhalten).

Ausgerollt via `scripts/install_smart_shutdown_v10_2.sh` im Homelab-Infra-Repo. Auf allen Nodes ausserdem `needrestart`-Blacklist fuer `nomad.service` (`/etc/needrestart/conf.d/nomad.conf`), damit apt-daily-upgrade Nomad nicht per daemon-reexec restartet.

**Restart/Reschedule Policies** sind auf allen CSI-Jobs konfiguriert:
- `restart` -- lokaler Neustart des Tasks bei Crashes (3 Versuche in 5 Minuten)
- `reschedule` -- Platzierung auf einem anderen Node wenn lokale Restarts erschöpft sind
- `max_client_disconnect` -- wartet 5 Minuten bei kurzen Netzwerkausfällen bevor rescheduled wird

**CSI Boot-Reeval Timer** -- auf den Clients 05 und 06 läuft ein `nomad-csi-reeval.timer`, der nach jedem Boot automatisch blockierte Evaluations re-evaluiert. Details: [Linstor Betrieb](../linstor-storage/betrieb.md#csi-boot-race-condition)

### Disk-Housekeeping

Auf allen Linux-Clients greifen mehrere Mechanismen gegen Volllaufen der Boot-Disk:

- **BuildKit GC** (primär, im Docker-Daemon) -- kappt den Build Cache automatisch bei 10 GB. Konfiguriert in `/etc/docker/daemon.json` (`builder.gc`). Relevant, weil der GitHub-Runner-Container den Docker-Socket mountet und auf dem Host Images baut -- ohne Limit würde der Build Cache kontinuierlich wachsen.
- **Nomad Docker GC** -- entfernt ungenutzte Images nach Karenz. Greift auf Image-Ebene, nicht auf Build Cache.
- **Docker Prune Cron** -- wöchentliches Safety-Net für Orphans, die BuildKit GC und Nomad GC verfehlen.
- **Journald-Limit** -- begrenzt `/var/log/journal` auf 500 MB.

::: info Symptom bei Disk-Mangel
Nomad meldet `DimensionExhausted: disk` und platziert Allocations mit EphemeralDisk nicht mehr. Typische Ursache bei Clients mit Runner: Build Cache in `/var/lib/docker` wächst unbegrenzt.
:::

::: warning Docker-Restart disruptiert Nomad-Tasks
Trotz `live-restore: true` markiert Nomad Allocations beim `systemctl restart docker` kurz als failed und rescheduled sie. Änderungen an `daemon.json` vor dem nächsten Maintenance-Fenster machen oder den Node vorher drainen.
:::

## Bekannte Einschränkungen

**Kapazität bei Node-Drain:** Bei 3 Client-Nodes und aktivem Drain eines Nodes laufen alle Container auf 2 Nodes. Die verbleibende Kapazität (CPU, RAM) muss ausreichen -- es gibt keine automatische Prüfung vorab.

**CSI Boot Race Condition:** Nach einem Node-Reboot können CSI-abhängige Jobs in "pending" bleiben, weil das CSI-Plugin zum Evaluation-Zeitpunkt noch nicht healthy ist. Nomad erstellt eine "blocked eval", die normalerweise nach 30--60 Sekunden aufgelöst wird. Der Boot-Reeval-Timer auf clients 05/06 behandelt diesen Fall automatisch.

**auto_revert bei System-Jobs:** Die `auto_revert`-Funktion in Update-Stanzas greift bei System-Jobs erst ab Nomad 1.11. Für ältere Versionen muss bei einem fehlgeschlagenen Rollout manuell revertiert werden.

**Postgres-Sonderbehandlung bei Reschedule:** PostgreSQL hat eine bewusst begrenzte `reschedule`-Policy (`max 3 Versuche, mode = "fail"`). Endloses automatisches Failover zwischen Nodes wäre gefährlich, da DRBD (`single-node-writer`) die eigentliche Fencing-Schicht ist -- nicht Nomad. Bei wiederholtem Failure ist manuelles Eingreifen nötig.

**Restart-Counter via REST-API statt Prometheus:** Die Nomad-Prometheus-Telemetrie liefert keine verlässlichen Restart-Counter. `nomad_client_allocs_restart` existiert in aktuellen Nomad-Versionen nicht im `/v1/metrics`-Output (HashiCorp Issue #3060 ungelöst seit 2016) und `nomad_nomad_job_summary_failed` wird durch Nomad-GC zurückgesetzt -- `rate()`/`increase()`/`spread()`-Patterns liefern False-Positives. Restart- und Reschedule-Loop-Detection läuft daher über ein Cron-Bash-Script (`/usr/local/bin/nomad-job-health-metrics.sh`) auf jedem Worker, das via REST-API `/v1/node/<id>/allocations` die Felder `TaskStates.<task>.Restarts` und `ClientStatus`+`CreateTime` ausliest und als Influx-Lines (`nomad_alloc_restarts`, `nomad_job_health`) nach Telegraf schreibt. Die zwei Grafana-Alerts (`nomad-restart-storm-warn`, `nomad-failed-allocs-crit`) konsumieren diese Quelle. ACL-Policy `nomad-monitor` und Token-File auf jedem Worker; Token in 1Password als "Nomad Monitor Token". Pattern analog zur CSI-Health-Detection.

## Credentials

Token und Zugangsdaten für die Nomad API: [Credentials](../_referenz/credentials.md)

Für den regulären Betrieb wird ein ACL-Token mit der Policy `operator` benötigt (erlaubt Jobs deployen, Logs lesen, Allocs verwalten).
