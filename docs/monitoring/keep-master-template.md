---
title: Keep Master-Template
description: Vereinheitlichtes Telegram-Alert-Format für alle Quellen die über Keep routen
tags:
  - monitoring
  - keep
  - telegram
  - alerting
---

# Keep Master-Template

Vereinheitlichtes Telegram-Alert-Format für alle Quellen, die Keep über Forum-Topics in den Channel `Homelab Alerts` schreibt. Löst die historische Mischung aus rohen `*severity* | name`-Texten ab und etabliert eine scannbare Struktur mit Severity-Indikator, Host-/Service-Trennung, Detail-Zeile und Deeplink.

::: info Status
**Pilot-Phase** -- der erste Source-Cluster (CheckMK Homelab) ist in Iteration. Aktive Aufgaben und nächste Schritte werden im ClickUp-Task geführt: [86c9kt78u -- Keep Telegram-Alert-Format vereinheitlichen](https://app.clickup.com/t/86c9kt78u).
:::

## Zweck

- **Lesbarkeit auf Mobilgeräten** -- die erste Zeile ist die Scan-Zeile (Indikator + Status + Kurzname); der Rest ergänzt nur. Wer durch das Forum scrollt, entscheidet in unter einer Sekunde, ob er reagieren muss.
- **Resolved-Erkennung** -- Recovery-Nachrichten haben einen anderen Indikator (grüner Haken) und einen kürzeren Body. Im Forum-Thread sieht man auf einen Blick, was Firing und was Resolved ist.
- **Quellen-Agnostik** -- alle Quellen liefern dieselben `display_*`-Felder. Das Template kennt keine Source-Spezialfälle mehr; das Routing bleibt aber pro Source getrennt.
- **Verifizierbarkeit** -- jede Telegram-Nachricht trägt einen Deeplink zur Quelle (CheckMK-UI, Grafana-Alert-Rule), damit man von der Push-Notification direkt ins Detail springt.

## Architektur in drei Schichten

### Source-Layer -- Felder normalisieren

Jede Quelle, deren Code wir besitzen, baut die strukturierten Felder bevor sie an Keep postet. Damit muss das Template keine Source-Spezialfälle kennen.

- **CheckMK** -- `webhook-keep.py` ergänzt das Standard-Provider-Payload um `display_severity` (lowercase), `display_severity_emoji` und `display_severity_badge`, `display_status` und `display_status_label`, `display_short_title`, `display_host_short`, `display_source_pretty`, `display_detail_short` (erste Zeile vom Output, Severity-Prefix entfernt), `display_link` und `display_started_at`. Quelle: `homelab-hashicorp-stack/ansible/files/webhook-keep.py`.
- **Renovate-Backlog-Watchdog** -- noch nicht migriert.
- **Gatus** -- noch nicht migriert; hat zusätzlich einen Resolved-Bug (`status` ist hardkodiert `firing`, das muss bei der Migration mitgefixt werden).

Quellen, deren Body wir nicht kontrollieren -- aktuell vor allem Uptime Kuma -- liefern keine `display_*`-Felder. Das Master-Template fällt mit Mustache-Defaults sauber zurück auf das, was Keep aus dem Provider extrahiert. Einzelne Zeilen ohne Inhalt fallen weg, statt mit Platzhaltern hässlich zu bleiben.

### Workflow-Layer -- Routing und Severity-Eskalation

Pro Source-Cluster ein eigener Keep-Workflow im Repo `nomad-jobs/monitoring/keep-workflows/`. Filter nach `alert.source` (Regex-Pipe-Pattern, Pflicht), Severity-VIP-Eskalation analog zu allen anderen Workflows. Jeder Workflow nutzt das gleiche Template, Drift wird durch Code-Review verhindert.

::: warning Filter-Konvention
Der Source-Filter muss eine Pipe (`|`) im Regex enthalten -- z.B. `r"checkmk|cmk"`. Single-Word-Filter wie `r"checkmk"` werden vom Keep-CEL-Konverter nicht unterstützt und führen zu einem stillen Workflow-Skip. Diese Faustregel haben wir aus dem Pilot-Bug 2026-05 gelernt.
:::

### Template-Layer -- HTML mit Mustache-Sections

`parse_mode: html` ist Pflicht. MarkdownV2 funktioniert nicht zuverlässig mit dynamischen Werten -- Punkte, Underscores und eckige Klammern in Hostnamen oder Pfaden brechen die Telegram-Formatierung still. HTML braucht nur `<`, `>` und `&` zu escapen, was bei Monitoring-Daten selten vorkommt.

`link_preview_options.is_disabled: true` ist ebenfalls Pflicht, sonst erzeugt der Keep-Link eine Preview-Karte, die das Alert-Layout zerschiesst.

### Finales Format (2026-05-18, live-iteriert via Telegram)

**Firing -- 4 Zeilen, source-agnostisch:**

```
<emoji> [<badge>] <b>title</b> -- <status_label>
<code>host</code> · source_pretty · <i>started_at</i>
<code>detail_short</code>
<a href="keep_url">Im Incident-Hub öffnen</a>
```

**Resolved -- 2 Zeilen, deutlich kürzer:**

```
✅ [OK] <b>title</b> -- <code>host</code> · source_pretty
<i>resolved <resolved_at> (war <duration> firing)</i>
```

**Layout-Entscheidungen** (gegen Industry-Standard abgewogen, am Mobile-Render verifiziert):

- **Severity-Emoji + Badge zusammen**: Emoji ist Push-Strip-resistent (Lockscreen sieht es), Badge bleibt in Telegram-Search durchsuchbar.
- **Host in `<code>`**: verhindert Telegram-Auto-Linkify bei FQDN-Hosts (`jellyfin.ackermannprivat.ch` waere sonst klickbar und würde mit dem Keep-Link konkurrieren).
- **Detail in `<code>`**: monospace macht Werte mobil scanbar, kein Auto-Linkify auf Pfade/Werte.
- **Ein Link, primary Keep**: User landet im Incident-Hub und sieht den eigenen Alert + andere aktuelle Incidents. Source-URL (CheckMK-Service, Grafana-Rule) ist in Keep-UI als Custom-Field verfügbar -- kein zweiter Inline-Link nötig.
- **Resolved als neue Nachricht**, nicht Edit der Firing-Message: PagerDuty/OpsGenie-Pattern; Edits triggern keine Push-Notification.
- **Zeit absolut bei Firing**, relativ + absolut bei Resolved (`resolved 14:31 (war 8min firing)`).

### display_*-Felder (Pflicht-Schema je Source)

Jeder Source-Layer (CheckMK `webhook-keep.py`, künftiger Grafana-Wrapper, etc.) muss diese Felder bereitstellen -- das Template selber kennt keine Source-Spezialfälle:

- `display_severity_emoji` -- 🔴 / 🟠 / 🟡 / 🔵 / ⚪ / ✅
- `display_severity_badge` -- `CRIT` / `HIGH` / `WARN` / `INFO` / `LOW` / `OK`
- `display_status_label` -- `FIRING` / `RESOLVED` / `ACKED`
- `display_title` -- Kurz-Titel (z.B. Service-Name oder Rule-Name)
- `display_host` -- Host-Kurzname (kein FQDN-Strip nötig, `<code>` blockiert Linkify)
- `display_source_pretty` -- z.B. `CheckMK`, `Grafana`, `Uptime Kuma`. Bei Multi-Cluster optional Präfix `Homelab` / `DCLab` (TBD pro Source-Migration)
- `display_started_at` -- absolute Uhrzeit `HH:MM`
- `display_detail_short` -- 1-Zeilen-Detail, Severity-Prefix entfernt
- `display_keep_url` -- Pflicht. Format `https://keep.ackermannprivat.ch/incidents?status=Open` (Dashboard-Default) oder bei verfügbarer Incident-ID `/incidents/<incident_id>`. Per-Alert-Deep-Link via `/alerts/feed` ist möglich, aber URL-Encoding-anfällig -- als Default lieber das Dashboard.
- `display_status` -- `firing` oder `resolved` (steuert Template-Variante)
- `display_resolved_at` -- bei Resolved: absolute Uhrzeit
- `display_duration_firing` -- bei Resolved: relative Dauer (z.B. `8min`, `2h`)

Konkretes Workflow-Beispiel: `nomad-jobs/monitoring/keep-workflows/homelab-route-checkmk.yaml` (Pilot, wird auf v2-Format umgebaut bei Migration).

## Severity-Indikatoren

Visueller Anker (Emoji) plus Text-Badge. Emojis sind in Mobile-Vorschauen sofort erkennbar, Badges bleiben suchbar in der Telegram-Suchfunktion und im Archiv-Grep.

- **critical** -- 🔴 mit Badge `CRIT`
- **high** -- 🟠 mit Badge `HIGH`
- **warning** -- 🟡 mit Badge `WARN`
- **info** -- 🔵 mit Badge `INFO`
- **low** -- ⚪ mit Badge `LOW`
- **resolved** (alle Severities über alles) -- ✅ mit Badge `OK`
- **acknowledged** -- 👁 mit Badge `ACK`
- **unknown / Fallback** -- ⚫ mit Badge `?`

## Quellen-Status

::: tip ClickUp ist Source-of-Truth für offene Punkte
Diese Wiki-Seite fasst den Architektur-Stand zusammen. Wer aktuell woran arbeitet, welche Source-Migration priorisiert ist und welche Trade-offs offen sind, steht im verknüpften ClickUp-Task. Bitte dort kommentieren oder Subtasks anlegen, nicht hier.
:::

- **CheckMK Homelab** -- Pilot in Iteration. `webhook-keep.py` mit `display_*`-Feldern auf vm-checkmk deployed (Ansible-Playbook `checkmk-notification-scripts.yml`). Workflow `homelab-route-checkmk` in Keep aktiv. Format-Verifikation per Telegram in Arbeit.
- **CheckMK DCLab** -- noch nicht migriert. Wartet auf grünes Licht aus Homelab-Pilot.
- **Grafana** (deckt Telegraf, Loki, Prometheus) -- noch nicht migriert. Pfad: Annotations-Standard für Alert-Rules definieren, dann iterativ on-touch umstellen.
- **Uptime Kuma** -- bleibt bei Provider-eigenem Format. Master-Template mit Defaults übernimmt das.
- **Gatus** -- noch nicht migriert; bei Migration auch Resolved-Bug fixen.
- **Renovate-Backlog-Watchdog** -- noch nicht migriert; Bash-Push-Script muss `display_*`-Felder ergänzen.
- **Authentik / Notifiarr** -- Status unklar (Webhook-Konfiguration nicht code-versioniert). Vor Migration klären ob aktive Quelle.

## Verwandt

- [Keep](./keep.md) -- Hub-Service, Auth, Drei Eingangs-Pfade
- [Telegram-Bots](./telegram-bots.md) -- Bot-Tokens, Channel-IDs, Topic-Mapping
- [Monitoring-Stack-Übersicht](./index.md) -- alle Komponenten und ihre Rollen
- ClickUp-Task: [86c9kt78u -- Keep Telegram-Alert-Format vereinheitlichen](https://app.clickup.com/t/86c9kt78u)
