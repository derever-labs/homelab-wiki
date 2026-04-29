---
title: Nomad Timeout-Matrix
description: Konsistenz-Regeln fuer TimeoutStopSec, drain, healthy_deadline, restart.interval und pull_activity_timeout
tags:
  - nomad
  - referenz
  - timeouts
---

# Nomad Timeout-Matrix

Nomad-Jobs und Nomad-Clients haben mehrere ineinander verzahnte Timeout-Werte. Wenn diese inkonsistent zueinander sind, entstehen schwer zu diagnostizierende Restart-Loops, abgewuergte Drains und falsch markierte Failed Allocs. Diese Seite listet die wichtigsten Timeouts, ihre Abhaengigkeiten und drei Service-Profile als Orientierung.

## Timeouts auf Cluster-Ebene (Client-Service)

- **TimeoutStopSec** (systemd-Unit `nomad.service`) -- maximale Zeit die systemd dem Nomad-Client beim Stoppen gibt, bevor SIGKILL kommt. Default 90 Sekunden. Im Cluster auf 360s gesetzt, damit `drain_on_shutdown` oder das Smart-Shutdown-ExecStop-Script vollstaendig durchlaufen koennen.
- **drain_on_shutdown.deadline** (`client.hcl`) -- maximale Drain-Zeit beim Stoppen des Nomad-Agents. 5 Minuten ist Standard. Im aktuellen Setup auskommentiert; Smart Shutdown v10.2 uebernimmt den Drain selektiv (nur bei echtem System-Shutdown, nicht bei `systemctl restart nomad`).
- **TimeoutStopSec muss > drain_on_shutdown.deadline + Puffer** sein, sonst killt systemd den Drain mittendrin und Allocs gehen unsauber down.

## Timeouts auf Job-Ebene (Group-Stanza)

- **update.healthy_deadline** -- nach Deploy einer neuen Job-Version: Frist bis Allocs als healthy gelten. Wenn ein Service eine lange Init-Phase hat (Cache-Aufbau, Storage-Connect), muss healthy_deadline > Init-Phase + Puffer sein.
- **update.progress_deadline** -- gesamte Frist fuer das Update aller Allocs. Default 10 Minuten.
- **check_restart.grace** -- Zeit nach Alloc-Start, bevor failed Health-Checks zu einem automatischen Restart fuehren. Wichtig fuer slow-start-Services.
- **check_restart.limit** -- Anzahl konsekutiver Health-Check-Fehler bevor Restart triggert.
- **restart.interval** -- Zeitfenster fuer `restart.attempts`. Wenn Service 9 Minuten braucht und `restart.interval = 10m / attempts = 5`, ist das knapp -- ein langsamer Cold-Start kann den Counter ausschoepfen.
- **restart.delay** -- Pause zwischen Restart-Versuchen.

Mindestabstaende: `update.healthy_deadline > check_restart.grace + Puffer`, sonst markiert update den Alloc bevor check_restart greift. `restart.interval > erwartete Startup-Zeit`, sonst Restart-Loop.

## Timeouts auf Plugin-Ebene (Docker)

- **pull_activity_timeout** (`plugin "docker"` in `client.hcl`) -- maximale Zeit ohne Pull-Fortschritt bevor Docker den Pull abbricht. Default 2 Minuten ist zu knapp wenn die Registry (z.B. ZOT) selbst kalt startet. Im Cluster auf 15 Minuten erhoeht.
- **image_delay** (`plugin "docker"` gc) -- wie lange ungenutzte Images im Docker-Cache bleiben bevor GC sie loescht. Beeinflusst wie oft die Registry abgefragt wird (kuerzer = haeufiger Pull = hoeheres Rate-Limit-Risiko).

## Service-Profile

Drei typische Profile als Orientierung; konkrete Werte muessen zur tatsaechlichen Init-Zeit passen.

### Profil A: stateless-fast (z.B. nginx, kleine Web-Services)

- update.healthy_deadline ~3 Minuten
- check_restart.grace 30 Sekunden
- restart.attempts 3, interval 5 Minuten, delay 15 Sekunden

### Profil B: slow-start (z.B. ZOT mit S3-Connect, Datenbanken mit Recovery)

- update.healthy_deadline 5-10 Minuten (mit kalten Caches eher 10)
- check_restart.grace 120 Sekunden
- restart.attempts 5, interval 15-20 Minuten, delay 15-30 Sekunden

ZOT als Case-Study: Bis zur Umstellung auf Redis-MetaDB hatte ZOT bei 2500+ Repos eine ParseStorage-Phase von ~9 Minuten. `restart.interval = 10m` mit `attempts = 5` war zu knapp -- ein einzelner Cold-Start konnte den Counter erschoepfen. Mit Redis-MetaDB liegt die Startup-Zeit unter 60 Sekunden, der Puffer ist jetzt komfortabel.

### Profil C: stateful (z.B. PostgreSQL, Vault Storage)

- update.healthy_deadline 10-15 Minuten
- check_restart.grace 180-300 Sekunden
- restart.attempts 3, interval 30 Minuten, delay 60 Sekunden
- max_client_disconnect 5-10 Minuten (verhindert dass Allocs zu schnell rescheduled werden bei kurzen Connectivity-Hickups)

## Smart Shutdown v10.2 als Sonderfall

Smart Shutdown v10.2 ersetzt `drain_on_shutdown` durch ein systemd-ExecStop-Script (`/usr/local/bin/nomad-smart-shutdown.sh`), das nur bei echtem System-Shutdown drained (Erkennung ueber `systemctl is-system-running`). Bei `systemctl restart nomad` faellt der Drain weg, was schnelle Restarts ermoeglicht.

Implikation: TimeoutStopSec muss trotzdem die Drain-Phase abdecken (360s). drain_on_shutdown.deadline ist auskommentiert, weil das Script den Drain steuert. Beide Mechanismen sind nicht parallel aktiv.

## Bekannte Inkonsistenzen pruefen

- `update.healthy_deadline` muss > `check_restart.grace` sein
- `restart.interval` muss > erwartete Startup-Zeit sein
- `TimeoutStopSec` muss > `drain_on_shutdown.deadline` (falls aktiv) sein
- `pull_activity_timeout` muss > Registry-Cold-Start-Zeit sein
- `restart.delay` muss < `check_restart.grace` sein, sonst sind Restarts immer "zu spaet"

::: tip Bei Job-Aenderungen
Wenn ein Job seine Init-Zeit verlaengert (z.B. weil neue Migrations laufen), muessen alle abhaengigen Timeouts mitwachsen. Sonst entsteht ein latentes Restart-Risiko, das erst bei Last-Spitzen oder Cold-Starts sichtbar wird.
:::
