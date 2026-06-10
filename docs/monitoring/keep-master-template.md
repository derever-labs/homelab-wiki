---
title: Keep Master-Template
description: Vereinheitlichtes Telegram-Nachrichtenformat der Keep-Incident-Workflows
tags:
  - monitoring
  - keep
  - telegram
  - alerting
---

# Keep Master-Template

Vereinheitlichtes Telegram-Nachrichtenformat für alles, was Keep in den Channel `Homelab Alerts` schreibt. Die Vereinheitlichung passiert auf **Incident-Ebene**: jede Quelle (Grafana, Uptime Kuma, CheckMK) wird zuerst zu einem Incident korreliert, und die vier Incident-Workflows (notify/escalate/ack/resolve) rendern alle dasselbe kompakte Format. Es gibt keine Source-Spezialfälle und keine `display_*`-Wrapper mehr -- das frühere HTML-Master-Template-Konzept wurde zugunsten dieses einfacheren, quellen-agnostischen Formats verworfen.

## Zweck

- **Lesbarkeit auf Mobilgeräten** -- die erste Zeile ist die Scan-Zeile (Severity-Emoji + Severity + Kurzname). Wer durch ein Topic scrollt, entscheidet in unter einer Sekunde, ob er reagieren muss.
- **Quellen-Agnostik** -- das Format kennt keine Source-Spezialfälle. Es liest generische Incident-Felder (`service`, `rule_fingerprint` als Fallback-Header, `alerts_count`, `status`) — eine quellen-spezifische zweite Schaltfläche wurde bewusst verworfen (Quellen rendern als Listen-Repr und wären unlesbar).
- **Lifecycle-Sichtbarkeit** -- notify / escalate / ack / resolve haben je einen eigenen Indikator, sodass im Topic-Verlauf auf einen Blick klar ist, was firing, eskaliert, quittiert oder behoben ist.
- **Verifizierbarkeit** -- kritische Meldungen tragen einen Ack-Deep-Link-Button (`m.keep`), der direkt auf die Incident-Seite springt.

## Kein parse_mode

Die Nachrichten werden **ohne `parse_mode`** gesendet (kein HTML, kein MarkdownV2). Severity-Emojis rendern auch ohne Markup, und dynamische Werte (Hostnamen, Pfade, Messwerte) können keine Formatierung mehr brechen -- MarkdownV2 würde an Punkten, Underscores und eckigen Klammern still scheitern. Der Deep-Link kommt als Inline-Keyboard-Button (`reply_markup`), nicht als Link im Text -- damit gibt es keine Link-Preview-Karte, die das Layout zerschiesst.

## Format je Lifecycle-Phase

Die Felder stammen aus dem korrelierten Incident: Zeile 1 enthält Severity-Emoji, Severity und den Header — primär `service` (Dienstname), Fallback `rule_fingerprint` (Grafana-Alertname oder beim Catch-all ein Hash). Zeile 2 ist die `description` des Incidents als Kernwert — nur bei notify und escalate enthalten. Zeile 3 zeigt `alerts_count` und `status.value`. Die Schaltfläche ist ein `reply_markup`-Button (kein Link im Text).

**Notify (events:[created]) -- nach Severity ins Topic:**

```
Severity-Emoji Severity · service-name
description (Kernwert)
N Alert(s) · firing
[ Im Keep öffnen ]
```

Beispiel: Zeile 1 `🔴 critical · vault-sealed`, Zeile 2 die CheckMK-Problemzeile oder Grafana-description, Zeile 3 `3 Alert(s) · firing`. Nur das Kritisch-Topic trägt den Ack-Button.

**Escalate (events:[updated]) -- warning -> critical, ins Kritisch-Topic:**

```
⏫ service-name eskaliert
description (Kernwert)
auf critical · N Alert(s) · firing
[ Im Keep öffnen ]
```

**Ack (events:[updated]) -- Quittung, ins Kritisch-Topic:**

```
🔵 service-name quittiert
War: critical · N Alert(s) · Eskalation gestoppt
```

**Resolve (events:[updated]) -- Entwarnung im selben Topic wie die Meldung:**

```
✅ service-name behoben
War: critical · N Alert(s) · resolved
```

## Severity-Indikatoren

Visueller Anker pro Lifecycle-Phase, sofort in der Mobile-Vorschau erkennbar:

| Phase / Severity | Emoji | Topic |
| :--- | :--- | :--- |
| critical / high (+ fail-open) | 🔴 | Kritisch (25009) |
| warning | 🟡 | Warnung (25010) |
| info / low | ⚪ | Info (25011) |
| Eskalation (warning -> critical) | ⏫ | Kritisch (25009) |
| Acknowledged | 🔵 | Kritisch (25009) |
| Resolved | ✅ | Topic der ursprünglichen Meldung |

`critical` und `high` teilen sich 🔴, weil das Kritisch-Gate fail-open ist (`severity not in ['warning','info','low']`) -- es fängt beide plus jede unerwartete Severity.

## Felder & Fallbacks

- **Header (Zeile 1)** -- primär `service` des Incidents (Dienstname aus der Enrichment-Schicht); Fallback `rule_fingerprint` (Grafana-Alertname, CheckMK-Service oder beim Catch-all ein Hash). `incident.services` ist bewusst weggelassen (oft `None`).
- **Kernwert (Zeile 2)** -- `description` des Incidents, nur bei notify und escalate enthalten. CheckMK liefert die kompakte Problemzeile (`compact_detail`) als description; Grafana und Kuma die Alert-Beschreibung. Ack und Resolve haben keine Zeile 2.
- **`status` immer über `.value`** -- sonst rendert der Enum-repr (`IncidentStatus.FIRING`).
- **Deep-Link** -- `reply_markup`-Button auf `https://m.keep.ackermannprivat.ch/incidents/<id>` (mobile PWA, nicht `keep.`).

Die exakte Syntax steht in den Workflows `nomad-jobs/monitoring/keep-workflows/homelab-incident-{notify,escalate,ack,resolve}.yaml`.

## Verwandt

- [Keep](keep.md) -- Hub-Service, Correlation, Incident-Workflows
- [Telegram-Bots](telegram-bots.md) -- Bot-Tokens, Channel-IDs, Severity-Topics
- [Monitoring-Stack-Übersicht](index.md) -- alle Komponenten und ihre Rollen
