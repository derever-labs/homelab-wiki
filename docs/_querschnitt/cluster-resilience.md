---
title: Cluster-Resilience
description: Architektur-Strategie gegen Cluster-Restart-Cascade -- Selbstreferenz-Audit, 4-Schichten-Modell, Failure-Mode-Analyse
tags:
  - architecture
  - cluster
  - resilience
  - cluster-restart
  - zot
  - selbstreferenz
---

# Cluster-Resilience

Architektur-Strategie gegen Cluster-Restart-Cascade. Definiert das Selbstreferenz-Prinzip,
das 4-Schichten-Modell der Cluster-Resilience und das erwartete Verhalten in verschiedenen
Failure-Szenarien.

::: info Architektur-Entscheidung 2026-05-17
Diese Seite beschreibt das Ziel-Modell ("Strategie III"). Die Migration wird ueber den
ClickUp-Master-Task [86c9uu5cu](https://app.clickup.com/t/86c9uu5cu) gesteuert. Bis die
Migration abgeschlossen ist, gilt der Ist-Zustand (siehe Diagramm 1) als bekannte
Architektur-Limitation.
:::

## Prinzip: Selbstreferenz-Audit

Jeder Mechanismus, der eine Komponente X absichert, darf nicht selbst von X abhaengen. Wer
gegen ZOT-Outage schuetzt, darf kein ZOT-Image nutzen. Wer Postgres-Verfuegbarkeit prueft,
darf nicht warten muessen bis Postgres erreichbar ist. Verletzung dieses Prinzips fuehrt zu
Cascade-Failures, bei denen die Schutz-Mechanismen mit dem zu schuetzenden System sterben.

Konkret unterscheidet die Architektur drei Komponenten-Klassen:

- **Bootstrap-Klasse** -- haengt nicht an ZOT, sondern zieht Images direkt von Upstream-
  Registries oder laeuft komplett ohne Container (systemd, raw_exec). Muss ohne Cluster-
  Services startfaehig sein.
- **Service-Klasse** -- darf ZOT als Image-Quelle nutzen, ist aber durch die 4 Schichten
  unten gegen ZOT-Outage entkoppelt.
- **Selbstreferenz** (Anti-Pattern) -- ein Mechanismus der X absichert nutzt X als
  Abhaengigkeit. Wird konsequent vermieden.

## Diagramm 1: Selbstreferenz-Audit (Stand 2026-05-17)

Welche Komponenten sind eigenstaendig startbar, welche haengen heute an ZOT?

```d2
direction: down

classes: {
  clean: { style: { border-radius: 8; stroke: "#188038"; fill: "#e6f4ea" } }
  antipattern: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  systemd: { style: { border-radius: 8; stroke: "#1a73e8"; fill: "#e8f0fe" } }
  upstream: { style: { border-radius: 8; stroke-dash: 4 } }
}

Upstream: "Upstream-Registries (Internet)" {
  class: upstream
  ghcr: "ghcr.io"
  quay: "quay.io"
  dockerio: "docker.io"
  gcp: "us-central1-docker.pkg.dev"
}

Systemd_Layer: "systemd (kein Container)" {
  consul: "Consul"
  vault: "Vault"
  consul.class: systemd
  vault.class: systemd
}

Bootstrap_Clean: "Bootstrap-Klasse clean (kein ZOT im Pfad)" {
  zot_img: "ZOT-Job\nImage: ghcr.io/project-zot/zot"
  keep: "Keep\nImage: us-central1-docker.pkg.dev/keephq"
  kuma: "Uptime-Kuma\nImage: louislam/uptime-kuma:2\n(via daemon.json mirror-fallback)"
  csi: "Linstor-CSI\nImage: quay.io/piraeusdatastore"
  zot_img.class: clean
  keep.class: clean
  kuma.class: clean
  csi.class: clean
}

Anti_Pattern: "Anti-Pattern (haengt an ZOT)" {
  alloy: "Alloy (Monitoring)\nzot.service.consul/grafana/alloy\nKommt nicht hoch wenn ZOT weg"
  helper: "wait-for-postgres prestart-Helper\n4 Jobs: zot.service.consul/library/alpine\nMechanismus selbst von ZOT abhaengig"
  latest: "7 Jobs mit force_pull=true + :latest\nzot.service.consul/.../<image>:latest\nImmer Pull bei Restart"
  alloy.class: antipattern
  helper.class: antipattern
  latest.class: antipattern
}

ZOT_Service: "ZOT-Service\nzot.service.consul:5000" {
  style: { border-radius: 8; stroke: "#e8710a"; fill: "#feefe3" }
}

Upstream.ghcr -> Bootstrap_Clean.zot_img
Upstream.gcp -> Bootstrap_Clean.keep
Upstream.dockerio -> Bootstrap_Clean.kuma: "via mirror-fallback"
Upstream.quay -> Bootstrap_Clean.csi

Bootstrap_Clean.zot_img -> ZOT_Service

ZOT_Service -> Anti_Pattern.alloy: "Image-Pull"
ZOT_Service -> Anti_Pattern.helper: "Image-Pull"
ZOT_Service -> Anti_Pattern.latest: "Image-Pull (force)"
```

::: warning Drei Anti-Pattern-Gruppen identifiziert
- **Alloy** (System-Job, Monitoring-Agent) -- ZOT-Down kann nicht monitored werden wenn ZOT
  selbst die Image-Quelle ist
- **wait-for-postgres** Helper in immoscraper, immoscraper-weekly, immo-monitor,
  special-yt-dlp -- nutzt `zot.service.consul/library/alpine` als Image
- **7 Jobs** mit `force_pull=true` auf `zot.service.consul/.../<image>:latest`
  (immoscraper-Familie + meshcmd + stash-jellyfin-proxy + video-grabber + special-yt-dlp)

Aufloesung erfolgt ueber Schicht 2 (siehe unten) im Migrations-Track 86c9uu5cu.
:::

## Diagramm 2: 4-Schichten-Modell

Resilience entsteht durch vier ineinandergreifende Schichten. Jede Schicht hat ein klares
Ziel und ist gegen Selbstreferenz immunisiert.

```d2
direction: down

classes: {
  layer: { style: { border-radius: 8; stroke-dash: 4 } }
  cfg: { style: { border-radius: 8; stroke: "#1a73e8" } }
  job: { style: { border-radius: 8; stroke: "#188038" } }
  raw: { style: { border-radius: 8; stroke: "#e8710a" } }
  pol: { style: { border-radius: 8; stroke: "#9334e6" } }
}

S1: "Schicht 1: Cache-Layer (Pull-Versuche vermeiden)" {
  class: layer
  gc: "gc.image_delay = 168h\nclient.hcl"
  fp: "force_pull = false als Standard\nin Service-Klasse-Jobs"
  tag: "Renovate auf feste Tags\n(eigene Builds, langfristig)"
  gc.class: cfg
  fp.class: cfg
  tag.class: cfg
}

S2: "Schicht 2: Bootstrap-Class (Image-Quellen, nicht ZOT)" {
  class: layer
  alloy: "Alloy auf direkten Upstream\nghcr.io/grafana/alloy"
  helper: "wait-for-postgres image-frei\nraw_exec + /usr/bin/pg_isready"
  alloy.class: job
  helper.class: raw
}

S3: "Schicht 3: Wait-Layer (image-freie Prestart-Hooks)" {
  class: layer
  hook: "raw_exec + /usr/bin/curl\n--retry 60 --max-time 300\nin den 7 Anti-Pattern-Jobs"
  pattern: "Pattern-Dokumentation\n(HCL2-Funktion oder Block-Konvention)"
  hook.class: raw
  pattern.class: cfg
}

S4: "Schicht 4: Failure-Mode (restart / reschedule / disconnect)" {
  class: layer
  restart: "restart mode=fail\nattempts=3, interval=10m, delay=20s"
  resch: "reschedule unlimited, exponential\nmax_delay=30m"
  disc: "disconnect lost_after=3m\nreplace=true reconcile=best_score"
  boot: "Bootstrap-Sonderprofil:\nattempts=5, festes reschedule attempts=5"
  restart.class: pol
  resch.class: pol
  disc.class: pol
  boot.class: pol
}

S1 -> S2: "deckt 80% via Image-Cache"
S2 -> S3: "bei nicht-cached Image\noder neuem Job"
S3 -> S4: "bei Timeout / echtem Bug"
```

### Wie die Schichten ineinandergreifen

- **Schicht 1** ist der erste Daemmwall. In den meisten Cluster-Restart-Faellen ist das Image
  lokal cached, kein Pull-Versuch noetig, kein ZOT-Bedarf
- **Schicht 2** entfernt strukturelle Abhaengigkeiten. Monitoring und Bootstrap-Helper
  ueberleben ZOT-Down weil sie nicht von ZOT pullen
- **Schicht 3** ist die Sicherheitsleine fuer Cases die Schicht 1 verfehlt (neues Image,
  GC'd Image, neuer Job). Apps schlafen im prestart-Loop statt sofort zu kippen. Hartes
  Timeout 300s sorgt fuer sichtbaren Failure statt silent-hang
- **Schicht 4** raeumt Restart/Reschedule sauber auf. Bei dauerhaftem Problem wird der
  Failure sichtbar (mode=fail + Reschedule-Backoff + Disconnect-Block) statt im unsichtbaren
  delay-Loop zu versanden

## Diagramm 3: Cluster-Restart -- Ist-Verhalten

Stromausfall, alle Nodes neu. Vor Migration: Big-Bang-Startup ohne Reihenfolge-Disziplin.

```d2
direction: down

classes: {
  ok: { style: { border-radius: 8; stroke: "#188038" } }
  problem: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  warn: { style: { border-radius: 8; stroke: "#fbbc04"; fill: "#fef7e0" } }
}

t1: "t=0: Stromausfall, alle Nodes neu"
t2: "t=30s: systemd Consul + Vault hochgefahren"
t3: "t=60s: Nomad-Server hochgefahren"
t4: "t=90s: Nomad-Clients connecten" { class: ok }

t5: "t=120s: ALLE Jobs gescheduled gleichzeitig\n(Runbook 'Schritt 4: Jobs re-evaluieren')" { class: warn }

t6_zot: "ZOT-Job startet\nCSI-Mount + BoltDB-Init: 30s" { class: ok }
t6_apps: "30+ Apps starten parallel\nforce_pull=true gegen ZOT der noch nicht ready" { class: problem }

t7_apps: "Image-Pull-Fail: 'context deadline exceeded'\nrestart mode=delay: 3 attempts, dann ewig delay\nKEIN reschedule (mode=delay verhindert)" { class: problem }

t8_alloy: "Alloy startet auch -- braucht ZOT\nMonitoring kommt nicht hoch\n-> Cascade unsichtbar" { class: problem }

t9: "t=15-30 min: ZOT vollstaendig ready\nApps die im delay-Loop stehen probieren noch\nApps mit 'exceeded' Status: Operator-Restart noetig" { class: warn }

t1 -> t2 -> t3 -> t4 -> t5
t5 -> t6_zot
t5 -> t6_apps
t6_apps -> t7_apps
t5 -> t8_alloy
t7_apps -> t9
t6_zot -> t9
```

## Diagramm 4: Cluster-Restart -- Ziel-Verhalten

Selbe Ausgangslage, mit allen 4 Schichten + Runbook-Disziplin.

```d2
direction: down

classes: {
  ok: { style: { border-radius: 8; stroke: "#188038" } }
  wait: { style: { border-radius: 8; stroke: "#1a73e8"; fill: "#e8f0fe" } }
  done: { style: { border-radius: 8; stroke: "#188038"; fill: "#e6f4ea" } }
}

t1: "t=0: Stromausfall, alle Nodes neu" { class: ok }
t2: "t=30s: systemd Consul + Vault" { class: ok }
t3: "t=60s: Nomad-Server" { class: ok }
t4: "t=90s: Nomad-Clients" { class: ok }

t5: "t=120s: Runbook Schritt 4a -- Linstor-CSI verifizieren\n(via Ansible-Check oder manuell)" { class: ok }

t6: "t=180s: Runbook Schritt 4b -- ZOT explizit zuerst hochfahren\nWarten auf zot.service.consul:5000/readyz" { class: wait }

t7: "t=210s: ZOT antwortet /readyz" { class: done }

t8: "t=210s: Runbook Schritt 4c -- Rest des Stacks deployen\nApps werden gescheduled" { class: ok }

t9_cache: "Schicht 1: 80% der Apps haben Image lokal cached\n-> kein Pull, sofort gestartet" { class: done }

t9_wait: "Schicht 3: 20% mit neuem Tag oder GC'd Image\n-> prestart wait-for-zot mit raw_exec+curl\n-> kein Pull-Versuch bevor ZOT da" { class: wait }

t10_alloy: "Alloy startet aus ghcr.io direkt\n-> Monitoring sofort verfuegbar\n-> sehen Cascade in Echtzeit" { class: done }

t11: "t=300s: alle Apps healthy" { class: done }

t1 -> t2 -> t3 -> t4 -> t5 -> t6 -> t7 -> t8
t8 -> t9_cache
t8 -> t9_wait
t8 -> t10_alloy
t9_cache -> t11
t9_wait -> t11
t10_alloy -> t11
```

### Was sich aendert

- Runbook splittet "Jobs re-evaluieren" in Linstor → ZOT → Rest (siehe
  [cluster-restart.md](./cluster-restart.md))
- Cache (Schicht 1) deckt Mehrheit der Apps ab ohne Pull-Versuch
- Prestart-Wait (Schicht 3) faengt den Rest sauber ab
- Alloy laeuft via Bootstrap-Class autonom hoch -- Monitoring sieht alles ab Sekunde 0

## Diagramm 5: ZOT-Outage waehrend Betrieb

ZOT crasht waehrend Apps laufen. Vergleich Ist vs Ziel.

```d2
direction: right

classes: {
  ok: { style: { border-radius: 8; stroke: "#188038" } }
  problem: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  wait: { style: { border-radius: 8; stroke: "#1a73e8"; fill: "#e8f0fe" } }
}

Heute: "Ist-Zustand" {
  hz1: "ZOT crasht"
  hz2: "Apps laufen weiter\n(Image schon im Container)"
  hz3: "App-Restart triggered\nz.B. Job-Update, OOM" { class: problem }
  hz4: "force_pull=true Jobs:\nsofortiger Pull-Fail" { class: problem }
  hz5: "mode=delay: 3x restart\ndann delay, dann nochmal\n= ewig auf gleichem Node" { class: problem }
  hz6: "Operator muss eingreifen" { class: problem }

  hz1 -> hz2 -> hz3 -> hz4 -> hz5 -> hz6
}

Neu: "Ziel-Modell" {
  nz1: "ZOT crasht"
  nz2: "Apps laufen weiter\n(Image schon im Container)" { class: ok }
  nz3: "App-Restart triggered\nz.B. Job-Update, OOM"
  nz4_cache: "Schicht 1: force_pull=false\n-> Image lokal, kein Pull-Versuch\n-> App startet normal" { class: ok }
  nz4_wait: "Schicht 3: prestart wait-for-zot\nraw_exec+curl mit --max-time 300\n-> wartet bis ZOT zurueck" { class: wait }
  nz5: "Nomad reschedulet ZOT auf anderen Node\nCSI-Volume folgt via DRBD-Re-Attach\nZOT in ~30s wieder online" { class: ok }
  nz6: "prestart-curl wird erfolgreich\nmain-Task startet normal" { class: ok }

  nz1 -> nz2 -> nz3
  nz3 -> nz4_cache
  nz3 -> nz4_wait
  nz4_wait -> nz5 -> nz6
}
```

::: tip Kernunterschied
Heute ist `force_pull=true` der Bottleneck, nicht der ZOT-Crash selbst. Im Ziel-Modell ist
Schicht 1 (force_pull=false + Cache) der Hauptdaemmwall, Schicht 3 (prestart-wait) faengt
den Rest.
:::

## Diagramm 6: Node-Ausfall

c05 stirbt (Hardware-Crash, VM-Lost). ZOT lief dort.

```d2
direction: right

classes: {
  ok: { style: { border-radius: 8; stroke: "#188038" } }
  problem: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  warn: { style: { border-radius: 8; stroke: "#fbbc04"; fill: "#fef7e0" } }
}

Heute_n: "Ist-Zustand" {
  ha1: "c05 stirbt"
  ha2: "Nomad detected via heartbeat-grace ~10s" { class: ok }
  ha3: "ZOT reschedule auf c06\nCSI re-attach: ~10s\nBoltDB-Open: instant\n-> 30s Outage gesamt" { class: ok }
  ha4: "Andere Apps auf c05:\nmode=delay haengt auf c05\nstirbt mit dem Node\nNomad evictet nach 5min" { class: warn }
  ha5: "Apps die ZOT brauchen:\nforce_pull triggert sofort\nfail wenn ZOT noch nicht ready auf c06" { class: problem }

  ha1 -> ha2 -> ha3
  ha2 -> ha4
  ha3 -> ha5
}

Neu_n: "Ziel-Modell" {
  na1: "c05 stirbt"
  na2: "disconnect lost_after=3m:\nNomad wartet 3min auf c05-Reconnect\nbevor Allocs replaced werden" { class: ok }
  na3: "ZOT reschedule auf c06\nCSI re-attach + start: 30s" { class: ok }
  na4: "Andere Apps:\nmode=fail nach 3 attempts\n-> reschedule exponential auf anderen Node" { class: ok }
  na5: "Apps mit prestart-wait:\nwarten auf ZOT-ready\nkein Pull-Versuch bevor ZOT da" { class: ok }
  na6: "Apps mit force_pull=false + Cache:\nstarten sofort auf neuem Node\nImage lokal vorhanden" { class: ok }

  na1 -> na2 -> na3
  na2 -> na4
  na3 -> na5
  na4 -> na6
}
```

::: tip Kernunterschied
`mode=delay` blockiert den Node-Wechsel; `mode=fail` ermoeglicht sauberes Failover. Der
`disconnect`-Block faengt kurze Netzausfaelle ab ohne unnoetig zu reschedulen.
:::

## Diagramm 7: App-Bug beim Start

App selbst hat Bug (Vault-Secret fehlt, Config kaputt). Wichtig: das **darf** schnell
sichtbar werden, nicht maskiert im Retry-Loop.

```d2
direction: right

classes: {
  ok: { style: { border-radius: 8; stroke: "#188038" } }
  problem: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  warn: { style: { border-radius: 8; stroke: "#fbbc04"; fill: "#fef7e0" } }
}

Heute_b: "Ist-Zustand" {
  hb1: "App crasht beim Start"
  hb2: "restart attempts=3 in 5min" { class: warn }
  hb3: "delay-Mode: nach 3 fails warten,\ndann nochmal probieren\nendlos auf gleichem Node" { class: problem }
  hb4: "Operator sieht Job als 'running'\nim Nomad-UI (Restart-Loop versteckt)" { class: problem }

  hb1 -> hb2 -> hb3 -> hb4
}

Neu_b: "Ziel-Modell" {
  nb1: "App crasht beim Start"
  nb2: "restart attempts=3 in 10min, mode=fail" { class: ok }
  nb3: "Nach 3 Fails: alloc 'failed'\nReschedule auf anderen Node startet" { class: ok }
  nb4: "Anderer Node, gleicher Bug\nReschedule retry mit exponential backoff\n30s -> 1m -> 2m -> ... bis max_delay=30m" { class: warn }
  nb5: "Alloy sieht 'failed alloc'\nAlert in Kuma/Grafana" { class: ok }

  nb1 -> nb2 -> nb3 -> nb4 -> nb5
}
```

::: tip Kernunterschied
Heute ist App-Bug **versteckt** (alloc bleibt "running" im delay-Loop), im Ziel-Modell wird
er **sichtbar** (alloc geht in failed, Reschedule mit exponential backoff, Alert).
:::

## Profile fuer restart / reschedule / disconnect

Zwei Standard-Profile abhaengig von der Komponenten-Klasse:

### Service-Klasse (Standard-Apps)

```hcl
restart {
  attempts = 3
  interval = "10m"
  delay    = "20s"
  mode     = "fail"
}

reschedule {
  unlimited      = true
  delay          = "30s"
  delay_function = "exponential"
  max_delay      = "30m"
}

disconnect {
  lost_after = "3m"
  replace    = true
  reconcile  = "best_score"
}
```

### Bootstrap-Klasse (ZOT, Linstor-CSI, Alloy)

```hcl
restart {
  attempts = 5
  interval = "20m"
  delay    = "30s"
  mode     = "fail"
}

reschedule {
  attempts       = 5
  interval       = "2h"
  delay          = "1m"
  delay_function = "exponential"
  max_delay      = "20m"
}
```

Begruendung: Bootstrap-Komponenten haben laengere Startup-Zeiten (CSI-Mount, BoltDB-Init).
Festes `reschedule.attempts=5` (statt `unlimited=true`) erzwingt Operator-Alert bei
wiederholten Fails, weil Bootstrap-Down den ganzen Stack blockiert.

## Wait-Layer-Pattern (Schicht 3)

Image-freier Prestart-Hook fuer Apps die ZOT als Image-Quelle nutzen:

```hcl
task "wait-for-zot" {
  lifecycle {
    hook    = "prestart"
    sidecar = false
  }
  driver = "raw_exec"
  config {
    command = "/usr/bin/curl"
    args = [
      "-sf",
      "--retry", "60",
      "--retry-delay", "5",
      "--retry-connrefused",
      "--max-time", "300",
      "http://zot.service.consul:5000/v2/"
    ]
  }
}
```

Eigenschaften:

- Kein Container, kein Image-Pull, kein ZOT-Bezug -- `/usr/bin/curl` ist OS-Paket
- `--retry 60 --retry-delay 5` erlaubt bis 5 Minuten auf ZOT zu warten
- `--max-time 300` ist hartes Timeout -- Exit-Code != 0 = sichtbarer Failure statt
  silent-hang. Restart-Counter zaehlt, Alert greift
- Funktioniert weil `raw_exec` cluster-weit enabled ist und `curl` auf allen Workern liegt

## Verwandte Seiten

- [Docker Registry (ZOT)](../docker-registry/index.md) -- aktueller ZOT-Stand
- [Cluster-Restart-Runbook](./cluster-restart.md) -- konkrete Schritt-fuer-Schritt-Anleitung
- [Cold-Start-Runbook](./cold-start-runbook.md) -- Disaster-Recovery-Reihenfolge
- [Service-Abhaengigkeiten](./service-abhaengigkeiten.md) -- Service-Dependency-Mapping
- [Postmortem 2026-05-12](../postmortems/2026-05-12-zot-nas-cascade.md) -- Ausloeser fuer
  diese Strategie
