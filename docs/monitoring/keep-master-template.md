---
title: Keep Master-Template
description: Vereinheitlichtes Telegram-Alert-Format fuer alle Quellen die ueber Keep routen
tags:
  - monitoring
  - keep
  - telegram
  - alerting
---

# Keep Master-Template

Vereinheitlichtes Telegram-Alert-Format fuer alle Quellen, die Keep ueber Forum-Topics in den Channel `Homelab Alerts` schreibt. Loest die historische Mischung aus rohen `*severity* | name`-Texten ab und etabliert eine scannbare Struktur mit Severity-Indikator, Host-/Service-Trennung, Detail-Zeile und Deeplink.

::: info Status
**Pilot-Phase** -- der erste Source-Cluster (CheckMK Homelab) ist in Iteration. Aktive Aufgaben und naechste Schritte werden im ClickUp-Task gefuehrt: [86c9kt78u -- Keep Telegram-Alert-Format vereinheitlichen](https://app.clickup.com/t/86c9kt78u).
:::

## Zweck

- **Lesbarkeit auf Mobilgeraeten** -- die erste Zeile ist die Scan-Zeile (Indikator + Status + Kurzname); der Rest ergaenzt nur. Wer durch das Forum scrollt, entscheidet in unter einer Sekunde, ob er reagieren muss.
- **Resolved-Erkennung** -- Recovery-Nachrichten haben einen anderen Indikator (gruener Haken) und einen kuerzeren Body. Im Forum-Thread sieht man auf einen Blick, was Firing und was Resolved ist.
- **Quellen-Agnostik** -- alle Quellen liefern dieselben `display_*`-Felder. Das Template kennt keine Source-Spezialfaelle mehr; das Routing bleibt aber pro Source getrennt.
- **Verifizierbarkeit** -- jede Telegram-Nachricht traegt einen Deeplink zur Quelle (CheckMK-UI, Grafana-Alert-Rule), damit man von der Push-Notification direkt ins Detail springt.

## Architektur in drei Schichten

### Source-Layer -- Felder normalisieren

Jede Quelle, deren Code wir besitzen, baut die strukturierten Felder bevor sie an Keep postet. Damit muss das Template keine Source-Spezialfaelle kennen.

- **CheckMK** -- `webhook-keep.py` ergaenzt das Standard-Provider-Payload um `display_severity` (lowercase), `display_severity_emoji` und `display_severity_badge`, `display_status` und `display_status_label`, `display_short_title`, `display_host_short`, `display_source_pretty`, `display_detail_short` (erste Zeile vom Output, Severity-Prefix entfernt), `display_link` und `display_started_at`. Quelle: `homelab-hashicorp-stack/ansible/files/webhook-keep.py`.
- **Renovate-Backlog-Watchdog** -- noch nicht migriert.
- **Gatus** -- noch nicht migriert; hat zusaetzlich einen Resolved-Bug (`status` ist hardkodiert `firing`, das muss bei der Migration mitgefixt werden).

Quellen, deren Body wir nicht kontrollieren -- aktuell vor allem Uptime Kuma -- liefern keine `display_*`-Felder. Das Master-Template faellt mit Mustache-Defaults sauber zurueck auf das, was Keep aus dem Provider extrahiert. Einzelne Zeilen ohne Inhalt fallen weg, statt mit Platzhaltern haesslich zu bleiben.

### Workflow-Layer -- Routing und Severity-Eskalation

Pro Source-Cluster ein eigener Keep-Workflow im Repo `nomad-jobs/monitoring/keep-workflows/`. Filter nach `alert.source` (Regex-Pipe-Pattern, Pflicht), Severity-VIP-Eskalation analog zu allen anderen Workflows. Jeder Workflow nutzt das gleiche Template, Drift wird durch Code-Review verhindert.

::: warning Filter-Konvention
Der Source-Filter muss eine Pipe (`|`) im Regex enthalten -- z.B. `r"checkmk|cmk"`. Single-Word-Filter wie `r"checkmk"` werden vom Keep-CEL-Konverter nicht unterstuetzt und fuehren zu einem stillen Workflow-Skip. Diese Faustregel haben wir aus dem Pilot-Bug 2026-05 gelernt.
:::

### Template-Layer -- HTML mit Mustache-Sections

`parse_mode: html` ist Pflicht. MarkdownV2 funktioniert nicht zuverlaessig mit dynamischen Werten -- Punkte, Underscores und eckige Klammern in Hostnamen oder Pfaden brechen die Telegram-Formatierung still. HTML braucht nur `<`, `>` und `&` zu escapen, was bei Monitoring-Daten selten vorkommt.

Das konkrete Template steht in `nomad-jobs/monitoring/keep-workflows/homelab-route-checkmk.yaml`. Aufbau:

- **Zeile 1 -- Scan-Zeile** -- Severity-Emoji, Severity-Badge in eckigen Klammern, fett der Kurz-Titel, Trennzeichen, Status-Label.
- **Zeile 2 -- Kontext** -- Host-Kurzname, Trennzeichen, Source-Pretty (z.B. `nana-nas · CheckMK`).
- **Zeile 3 -- Detail** -- der eigentliche Fehlertext in `<code>`-Tags, damit lange Pfade nicht umbrechen.
- **Zeile 4 -- Zeit** -- Trigger-Zeitpunkt der Quelle (nicht der Telegram-Empfangszeitpunkt).
- **Zeile 5 -- Deeplink** -- Anker-Tag zur Quelle, fehlt automatisch wenn die Quelle keinen Link liefert.

## Severity-Indikatoren

Visueller Anker (Emoji) plus Text-Badge. Emojis sind in Mobile-Vorschauen sofort erkennbar, Badges bleiben suchbar in der Telegram-Suchfunktion und im Archiv-Grep.

- **critical** -- 🔴 mit Badge `CRIT`
- **high** -- 🟠 mit Badge `HIGH`
- **warning** -- 🟡 mit Badge `WARN`
- **info** -- 🔵 mit Badge `INFO`
- **low** -- ⚪ mit Badge `LOW`
- **resolved** (alle Severities ueber alles) -- ✅ mit Badge `OK`
- **acknowledged** -- 👁 mit Badge `ACK`
- **unknown / Fallback** -- ⚫ mit Badge `?`

## Quellen-Status

::: tip ClickUp ist Source-of-Truth fuer offene Punkte
Diese Wiki-Seite fasst den Architektur-Stand zusammen. Wer aktuell woran arbeitet, welche Source-Migration priorisiert ist und welche Trade-offs offen sind, steht im verknuepften ClickUp-Task. Bitte dort kommentieren oder Subtasks anlegen, nicht hier.
:::

- **CheckMK Homelab** -- Pilot in Iteration. `webhook-keep.py` mit `display_*`-Feldern auf vm-checkmk deployed (Ansible-Playbook `checkmk-notification-scripts.yml`). Workflow `homelab-route-checkmk` in Keep aktiv. Format-Verifikation per Telegram in Arbeit.
- **CheckMK DCLab** -- noch nicht migriert. Wartet auf gruenes Licht aus Homelab-Pilot.
- **Grafana** (deckt Telegraf, Loki, Prometheus) -- noch nicht migriert. Pfad: Annotations-Standard fuer Alert-Rules definieren, dann iterativ on-touch umstellen.
- **Uptime Kuma** -- bleibt bei Provider-eigenem Format. Master-Template mit Defaults uebernimmt das.
- **Gatus** -- noch nicht migriert; bei Migration auch Resolved-Bug fixen.
- **Renovate-Backlog-Watchdog** -- noch nicht migriert; Bash-Push-Script muss `display_*`-Felder ergaenzen.
- **Authentik / Notifiarr** -- Status unklar (Webhook-Konfiguration nicht code-versioniert). Vor Migration klaeren ob aktive Quelle.

## Verwandt

- [Keep](./keep.md) -- Hub-Service, Auth, Drei Eingangs-Pfade
- [Telegram-Bots](./telegram-bots.md) -- Bot-Tokens, Channel-IDs, Topic-Mapping
- [Monitoring-Stack-Uebersicht](./index.md) -- alle Komponenten und ihre Rollen
- ClickUp-Task: [86c9kt78u -- Keep Telegram-Alert-Format vereinheitlichen](https://app.clickup.com/t/86c9kt78u)
