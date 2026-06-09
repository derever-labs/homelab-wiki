---
title: Keep
description: Incident-Hub und Alert-Routing für das Homelab
tags:
  - service
  - monitoring
  - alerting
  - keep
---

# Keep

Keep ist der zentrale Incident-Hub im Homelab. Alle Alert-Quellen (Gatus, Grafana, Uptime Kuma, CheckMK sowie einzelne Apps) schicken ihre Events an **einen** Endpoint, statt jede Quelle einzeln mit Telegram zu verdrahten. Keep reichert die Alerts an, korreliert sie zu **Incidents**, dedupliziert und routet anschliessend nach Severity in drei Forum-Topics des Telegram-Channels `Homelab Alerts`. Acknowledgen, Eskalieren und Entwarnen laufen über vier Incident-Workflows.

## Zweck

- **Single Point of Routing** -- Alle Quellen treffen sich auf `https://keep.ackermannprivat.ch/alerts/event/<source>`. Änderungen an Bot oder Topics passieren in Keep, nicht in jeder Quelle.
- **Korrelation zu Incidents** -- Eingehende Alerts werden über zwei Correlation-Rules zu Incidents gruppiert (nach `service`, plus Catch-all nach `fingerprint`). Aus N gleichartigen Alerts wird ein Incident.
- **Severity-Routing in drei Topics** -- Die Incident-Severity entscheidet das Ziel-Topic: Kritisch / Warnung / Info. Stummschalten ist Telegram-natives Per-Topic-Mute beim Empfänger (siehe [Telegram-Bots](telegram-bots.md)).
- **Acknowledge & Eskalation** -- Kritische Incidents tragen einen Ack-Deep-Link; eine echte Hoch-Eskalation (warning -> critical) pagt nach, ein bereits kritisch gestarteter Incident wird nicht doppelt gemeldet.
- **Dead-Man-Switch** -- Ein Keep-unabhängiger Heartbeat-Watcher plus drei Uptime-Kuma-Watchdogs machen einen stillen Keep-Ausfall sichtbar.

## Architektur in drei Schichten

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  svc: { style: { border-radius: 8 } }
  layer: { style: { border-radius: 8; stroke-dash: 4 } }
  sink: { style: { border-radius: 8 } }
}

sources: Alert-Quellen {
  class: layer
  gatus: Gatus { class: svc }
  grafana: Grafana\n(Loki + InfluxDB) { class: svc }
  kuma: Uptime Kuma { class: svc }
  checkmk: CheckMK { class: svc }
}

keep: Keep {
  class: layer
  ident: 1. Identification\nExtraction + Mapping\n-> service-Feld { class: svc }
  corr: 2. Correlation\n2 Rules (service / catch-all)\n-> Incident { class: svc }
  act: 3. Action\n4 Incident-Workflows\n(notify/escalate/ack/resolve) { class: svc }
}

topics: Homelab Alerts {
  class: layer
  krit: Kritisch (25009) { class: sink }
  warn: Warnung (25010) { class: sink }
  info: Info (25011) { class: sink }
}

sources.gatus -> keep.ident: "/alerts/event/<source>"
sources.grafana -> keep.ident
sources.kuma -> keep.ident
sources.checkmk -> keep.ident
keep.ident -> keep.corr -> keep.act
keep.act -> topics.krit: "critical / high / fail-open"
keep.act -> topics.warn: "warning"
keep.act -> topics.info: "info / low"
```

Drei Schichten, alle drei müssen sitzen: **Identification** (jeder Alert bekommt ein `service`-Feld), **Correlation** (Alerts werden zu sinnvollen Incidents gruppiert statt in einen Catch-all-Eimer), **Action** (Incident-Workflows benachrichtigen, eskalieren, acknowledgen, entwarnen).

## Drei Eingangs-Pfade zu Keep

Quellen erreichen Keep auf einem von drei Wegen, je nachdem ob sie eigenes Alerting mitbringen oder nur Rohdaten liefern. Alle drei münden im selben Hub.

::: info 1. Direct-Webhook
Die Quelle hat eigenes Alerting und postet direkt an `keep.ackermannprivat.ch/alerts/event/<source>`. Beispiele: Grafana Unified Alerting, CheckMK Notifications, Gatus, einzelne Apps.
:::

::: info 2. Log-basiert über Loki
Die Quelle liefert nur Logs. Alloy nimmt sie auf, schreibt nach Loki, Grafana definiert LogQL-Alert-Rules, und die Rule postet den Webhook nach Keep. Beispiel: Failed SSH Logins, Traefik 5xx Spike, Vault Permission Denied.
:::

::: info 3. Metrik-basiert über InfluxDB
Telegraf scraped (SNMP, Prometheus, Exec), schreibt Zeitreihen nach InfluxDB, Grafana hat InfluxQL-Alert-Rules. Beispiel: LVM Thin Pool, DRBD Out-of-Sync, Telegraf-Heartbeat-Absence.
:::

Faustregel: Webhook-/Notifications-Mechanismus -> Pfad 1. Nur Logs -> Pfad 2. Nur Metriken -> Pfad 3. Schwellwerte und Alert-Logik liegen bei Pfad 2/3 ausschliesslich in Grafana.

## Identification -- das service-Feld

Damit Alerts sinnvoll korrelieren, braucht jeder Alert ein kanonisches `service`-Feld. Das setzen Keep-eigene **Extraction- und Mapping-Rules** (`nomad-jobs/monitoring/keep-bootstrap/setup-enrichment.py`), nicht Custom-Code in den Quellen:

- **Extraction** -- zieht aus dem Uptime-Kuma-Monitornamen den Dienstnamen ins `service`-Feld (Regex-Named-Group).
- **Mapping (CSV)** -- ergänzt abgeleitete Felder (Routing-/Team-Tags) anhand des `service`-Werts.

Die Enrichment-Schicht läuft beweisbar **vor** dem Workflow-Trigger und der Correlation (Ingestion-Reihenfolge: Extraction -> Mapping -> Workflows -> Correlation). Das `service`-Feld füllt später `incident.services` und ist damit die strukturelle Voraussetzung für Per-Dienst-Acknowledge.

## Correlation -- zwei Rules

Statt einer einzigen Catch-all-Rule (die früher 545 Incidents in einen Eimer warf) korrelieren zwei disjunkte Rules (`setup-topology.py`, beide `resolveOn: all_resolved`):

| Rule | Bedingung (CEL) | Gruppierung |
| :--- | :--- | :--- |
| Service-Correlation | `size(service) > 0` | nach `service` -- ein Incident pro `service`-Wert (alle Quellen) |
| Catch-all | `size(service) == 0` | nach `fingerprint` -- Fallback für service-lose Alerts |

Alle aktiven Incidents tragen daher den Rule-Namen `Homelab Service-Correlation` bzw. den Catch-all. (Eine frühere 4-Rule-Variante mit eigenen Grafana-/CheckMK-Rules wurde nicht deployt -- live sind diese zwei.)

::: warning CEL-null-Falle (CON-25)
Die Bedingungen nutzen `size(service) > 0` statt `service != null`. Keeps Rules-Engine ersetzt `null`-Tokens textuell durch `""`, und der CEL-Evaluator kann `NoneType` nicht vergleichen -- `service != null` würde entweder jeden service-losen Alert fälschlich fangen oder die Rule lautlos töten. Gleiche `size()`-CEL bricht uebrigens den `GET /rules`-Endpoint (HTTP 500, `CelToAstConverter`) -- kosmetisch, das Matching (`run_rules`) ist nicht betroffen.
:::

::: warning service = Alertname bei Grafana-Alerts -- Spam-Vektor bei Node-Ausfall
Grafana-Alerts tragen als `service` den Rule-Titel (z.B. `DRBD Out-of-Sync > 1 MiB`), keinen kanonischen Dienst. Die Service-Correlation bündelt daher nur INNERHALB eines Alertnamens, nicht darüber hinaus: ein Storage-Node-Ausfall erzeugt einen Incident pro DRBD-/Linstor-Alertname, und bei Flapping je Zyklus einen neuen. Das ist der dominante Spam-Vektor bei Node-Ausfällen (siehe [Coverage](coverage.md) Layer 3: „DRBD Verbindung getrennt" flappte historisch 8601 Transitions/50h). Primär an der Quelle zu dämpfen (Grafana `for`/`keep_firing_for`), nicht in Keep.
:::

## Incident-Workflows -- Severity-Routing & Lifecycle

Vier `type:incident`-Workflows unter `nomad-jobs/monitoring/keep-workflows/`, alle über den `telegram-homelab-batch`-Provider in den Channel `Homelab Alerts` (`-1003971798942`):

| Workflow | Trigger | Ziel | Zweck |
| :--- | :--- | :--- | :--- |
| notify | `created` | 25009 / 25010 / 25011 | je Incident genau eine Meldung, nach Severity ins Topic; Kritisch trägt Ack-Button |
| escalate | `updated` | 25009 | echte Hoch-Eskalation (warning -> critical) pagt nach (schliesst G1) |
| ack | `updated` | 25009 | Quittung wenn ein Incident im Keep-UI acknowledged wird |
| resolve | `updated` | 25009 / 25010 / 25011 | Entwarnung im selben Topic wie die Meldung, genau einmal (Flag-Dedup) |

Wichtige Engine-Eigenheiten, die das Design tragen:

- **`created` feuert genau einmal pro Incident** (beim `is_visible`-Flip) -> `events:[created]` = eine Telegram-Meldung pro Incident ohne Spam-Loop. Folgeänderungen kommen als `updated`.
- **Severity-Gate Kritisch ist fail-open:** `severity not in ['warning','info','low']` fängt `critical`/`high` UND jede unerwartete oder leere Severity. Warnung `== 'warning'`, Info `in ['info','low']` -- disjunkt und lückenlos.
- **`enrich_incident` darf NIE an einer Telegram-Action hängen** (der Telegram-Provider hat kein `_notify` für Enrichment -> NoneType-Crash). Dedup-Flags (`escalation_notified`, `ack_notified`, `resolve_notified`) werden über configless `console`-Actions gesetzt -- erst benachrichtigen, dann Flag.
- **Status immer über `status.value`** lesen, sonst rendert der Enum-repr (`IncidentStatus.FIRING`) und Gates greifen nie.
- **Workflow-Selektion ist ALL-MATCH** (kein First-Match): jeder passende Workflow läuft, Disjunktheit muss über die `if:`-Gates hergestellt werden.

Stilles Verstummen/Expiry erzeugt **kein** Workflow-Event und damit kein Auto-Resolve -- Schweigen ist keine Entwarnung. Das fängt der Dead-Man-Switch als Report-Digest.

## Dead-Man-Switch und Watchdog-Tier

Wenn Keep selbst tot ist, geht jeder Alert verloren. Drei Keep-**unabhängige** Pfade machen das sichtbar -- alle posten über den batch-Bot direkt ins Kritisch-Topic (umgehen die Keep-Engine):

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  svc: { style: { border-radius: 8 } }
  watch: { style: { border-radius: 8; stroke-dash: 2 } }
  sink: { style: { border-radius: 8 } }
}

keep: Keep\n(Postgres) { class: svc }

dms: keep-heartbeat-watch\n(Dead-Man-Switch, alle 3 min) { class: watch; tooltip: "Kuma-Heartbeat + stale-firing-Digest" }

kuma: Uptime-Kuma-Watchdog-Tier {
  class: watch
  m84: in-cluster\nMonitor keep-heartbeat { class: watch }
  home: wd-home (LXC) { class: watch }
  nana: wd-nana (Dottikon) { class: watch }
}

batch: batch-Bot { class: svc }
krit: Kritisch-Topic (25009) { class: sink }

keep -> dms: "Heartbeat-Push"
dms -> batch: "bei Fehler/Stille"
kuma.m84 -> batch
kuma.home -> batch
kuma.nana -> batch
batch -> krit: "Kuma-Watchdog\n+ Uptime-Link"
```

- **Dead-Man-Switch** (`keep-heartbeat-watch.nomad`) -- pusht alle 3 min einen Kuma-Heartbeat und überwacht stale-firing Incidents; meldet Keep-interne Fehler direkt ins Kritisch-Topic.
- **Kuma-Watchdog-Tier** -- drei Uptime-Kuma-Instanzen alarmieren mit einem Custom-Template, das die Kuma-Standardmeldung um eine `Kuma-Watchdog`-Kennzeile und den Uptime-Link ergänzt, sodass die Herkunft klar ist.

::: danger Stack-Single-Point bleibt
Der interne Backstop ist **nicht** vollständig unabhängig: er pusht an Kuma (MariaDB), Keep läuft auf Postgres -- beide DRBD-Single auf client-05/06. Ein Postgres- oder MariaDB-Ausfall killt Keep UND den Backstop gleichzeitig. Echte Unabhängigkeit liefert nur der externe Watchdog `wd-nana` in Dottikon. Siehe [Coverage](coverage.md) Layer 7.
:::

## Deduplizierung

Default-Dedup-Rule (Provider-Type `keep`) plus optional source-spezifische Rules. Fingerprint-Felder: `fingerprint`, `name`, `source`. Wiederholte Alerts mit gleichem Fingerprint lösen nur einen Incident-Eintrag aus.

## Wartungsfenster -- Notifications temporär stummschalten

Zwei verschiedene Bedürfnisse, zwei verschiedene Wege -- bewusst **kein** globaler Mute-Knopf in der App. Ein globales Mute würde eine echte kritische Störung während des Fensters verschlucken und wäre damit schlechter als die feineren Alternativen (Entscheid nach Challenge 2026-06-09).

- **Spontaner Alert-Sturm** -- am Telegram-Client das betroffene **Severity-Topic stummschalten** (Kritisch/Warnung/Info einzeln, native Telegram-Funktion). Granular, sofort, kein Server-State; Kritisch bleibt bewusst laut, die Incidents bleiben im Keep-Dashboard sichtbar.

- **Geplante Operation** (z.B. RAID-Erweiterung, Storage-Umbau), die bekanntes Rauschen erzeugt -- ein **gezieltes Maintenance-Window** auf den betroffenen Dienst. Es unterdrückt die Telegram-Notification für passende Alerts, lässt den Vorfall aber sichtbar und ackbar (`suppress=true`).

Maintenance-Windows verwaltet der Runbook-Helfer `nomad-jobs/monitoring/keep-maintenance.py` (`list` / `start <match> <minutes>` / `stop <id>`); der Aufruf-Ablauf steht im Datei-Docstring. Sichere Defaults sind fest verdrahtet: `suppress=true` (nie verwerfen), enger `name.contains`-Scope statt globalem Match, Idempotenz-Schutz gegen doppelte Fenster. Entwarnungen (`resolved`/`acknowledged`) kommen weiter durch.

::: warning Fenster nach der Op aktiv beenden
Der Maintenance-Filter wirkt pro eingehendem Alert-Event und ist der erste Ingestion-Schritt. Läuft ein Fenster mitten in einer echten Störung ab, kommt der nächste Re-Send des Alerts normal durch (Verzögerung = Re-Send-Intervall der Quelle); ein einmaliges Event im Fenster wird hingegen permanent verschluckt. Darum Fenster knapp wählen und nach der Operation mit `stop <id>` aktiv beenden statt auf den Ablauf zu warten.
:::

## Deploy -- GitOps, Restart-pflichtig

Workflows und Provider sind in `keep.nomad` per `file()` eingebettet und werden beim Keep-Start **by-name provisioniert**. Es gibt **keinen Hot-Reload** -- eine Workflow-Änderung im Repo wird erst nach einem Keep-Restart (Job-Redeploy) wirksam. Vor dem Restart den `keep-heartbeat-watch`-Job pausieren, damit der Neustart keinen False-Down-Alarm auslöst. Repo-YAML und Live müssen identisch bleiben (der Restart re-provisioniert die `file()`-Version).

## Konfiguration

- **URL** -- [keep.ackermannprivat.ch](https://keep.ackermannprivat.ch); mobile PWA für Deep-Links: `m.keep.ackermannprivat.ch` (siehe [Keep Mobile](keep-mobile.md))
- **Consul-Service** -- `keep` (Frontend), `keep-backend` (API + Webhook-Endpoint)
- **Auth UI** -- Authentik ForwardAuth (`authentik-app@file`)
- **Auth Webhooks** -- `chain-no-auth@file` auf `/alerts/event/*`, damit Quellen ohne Token pushen können
- **Database** -- PostgreSQL (`postgres.service.consul`, DB `keep`)
- **Storage** -- Linstor CSI-Volume `keep-data` für Backend-State (`SECRET_MANAGER_TYPE=FILE`)
- **Job** -- `nomad-jobs/monitoring/keep.nomad`; Provider nur noch `telegram-homelab-batch`
- **Tokens** -- 1P `Monitoring Telegram Bots` + Vault `kv/keep` (`telegram_batch_token`)

## "Was brennt jetzt"-Dashboard

[`https://keep.ackermannprivat.ch/incidents?status=Open`](https://keep.ackermannprivat.ch/incidents?status=Open) -- Faceted-Filter über alle offenen Incidents (Severity, Source, Service, Assignee). Aus jeder Kritisch-Telegram-Nachricht per Ack-Button (Deep-Link auf die Incident-Seite) erreichbar.

## Verwandte Dokumentation

- [Telegram-Bots](telegram-bots.md) -- Bot- und Topic-Inventar, Severity-Topics, Watchdog-Sender
- [Keep Master-Template](keep-master-template.md) -- Aufbau der Telegram-Nachricht
- [Keep-Correlations](keep-correlations.md) -- Correlation-Patterns
- [Keep Mobile](keep-mobile.md) -- mobile Incident-PWA für Deep-Links
- [Monitoring](index.md) -- Stack-Übersicht und Datenflüsse
- [Coverage](coverage.md) -- Monitoring-Coverage inkl. Keep-Self-Monitoring (Layer 7)
- DCLab-Pendant: HSLU IT-Wiki `monitoring/ops/keep.md`
