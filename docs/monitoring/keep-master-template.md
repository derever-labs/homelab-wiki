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

Vereinheitlichtes Telegram-Nachrichtenformat für alles, was Keep in den Channel `Homelab Alerts` schreibt. Die Vereinheitlichung passiert auf **Incident-Ebene**: jede Quelle (Gatus, Grafana, Uptime Kuma, CheckMK) wird zuerst zu einem Incident korreliert, und die vier Incident-Workflows (notify/escalate/ack/resolve) rendern alle dasselbe kompakte Format. Es gibt keine Source-Spezialfälle und keine `display_*`-Wrapper mehr -- das frühere HTML-Master-Template-Konzept wurde zugunsten dieses einfacheren, quellen-agnostischen Formats verworfen.

## Zweck

- **Lesbarkeit auf Mobilgeräten** -- die erste Zeile ist die Scan-Zeile (Severity-Emoji + Severity + Kurzname). Wer durch ein Topic scrollt, entscheidet in unter einer Sekunde, ob er reagieren muss.
- **Quellen-Agnostik** -- das Format kennt keine Source-Spezialfälle. Es liest generische Incident-Felder (`rule_fingerprint`, `alerts_count`, `status`) plus den ersten Alert für die Problemzeile.
- **Lifecycle-Sichtbarkeit** -- notify / escalate / ack / resolve haben je einen eigenen Indikator, sodass im Topic-Verlauf auf einen Blick klar ist, was firing, eskaliert, quittiert oder behoben ist.
- **Verifizierbarkeit** -- kritische Meldungen tragen einen Ack-Deep-Link-Button (`m.keep`), der direkt auf die Incident-Seite springt.

## Kein parse_mode

Die Nachrichten werden **ohne `parse_mode`** gesendet (kein HTML, kein MarkdownV2). Severity-Emojis rendern auch ohne Markup, und dynamische Werte (Hostnamen, Pfade, Messwerte) können keine Formatierung mehr brechen -- MarkdownV2 würde an Punkten, Underscores und eckigen Klammern still scheitern. Der Deep-Link kommt als Inline-Keyboard-Button (`reply_markup`), nicht als Link im Text -- damit gibt es keine Link-Preview-Karte, die das Layout zerschiesst.

## Format je Lifecycle-Phase

Die Felder stammen aus dem korrelierten Incident: `rule_fingerprint` (der Gruppierungs-Wert -- Dienstname, Grafana-Alertname oder beim Catch-all ein Hash), die Problemzeile aus dem ersten Alert (`output`, mit Fallback auf `description`) plus dessen `providerType`, sowie `alerts_count` und `status.value`.

**Notify (events:[created]) -- nach Severity ins Topic:**

```
🔴 critical · vault-sealed
Vault is sealed (grafana)
3 Alert(s) · firing
Acken im Keep-UI:
[ Im Keep öffnen / acken ]
```

Erste Zeile mit Severity-Emoji; zweite Zeile Problem + Quelle; dritte Zeile Anzahl + Status. Nur das Kritisch-Topic trägt die vierte Zeile + den Ack-Button.

**Escalate (events:[updated]) -- warning -> critical, ins Kritisch-Topic:**

```
⏫ nomad-client-down eskaliert
Allocation failed (grafana)
auf critical · 5 Alert(s) · firing
[ Im Keep öffnen / acken ]
```

**Ack (events:[updated]) -- Quittung, ins Kritisch-Topic:**

```
🔵 vault-sealed quittiert
War: critical · 3 Alert(s) · Eskalation gestoppt
```

**Resolve (events:[updated]) -- Entwarnung im selben Topic wie die Meldung:**

```
✅ vault-sealed behoben
War: critical · 3 Alert(s) · resolved
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

- **Problemzeile** -- Mustache-Section auf `incident.alerts.0.output`, mit Fallback auf `incident.alerts.0.description` wenn `output` leer ist. Quellen ohne brauchbares Detail fallen sauber auf die `description` zurück.
- **`rule_fingerprint`** -- bei Service-/Grafana-/CheckMK-Incidents lesbar (Dienst-/Alertname), beim Catch-all ein Hash. `incident.services` ist im Body bewusst weggelassen (oft `None`).
- **`status` immer über `.value`** -- sonst rendert der Enum-repr (`IncidentStatus.FIRING`).
- **Deep-Link** -- `reply_markup`-Button auf `https://m.keep.ackermannprivat.ch/incidents/<id>` (mobile PWA, nicht `keep.`).

Die exakte Syntax steht in den Workflows `nomad-jobs/monitoring/keep-workflows/homelab-incident-{notify,escalate,ack,resolve}.yaml`.

## Verwandt

- [Keep](keep.md) -- Hub-Service, Correlation, Incident-Workflows
- [Telegram-Bots](telegram-bots.md) -- Bot-Tokens, Channel-IDs, Severity-Topics
- [Monitoring-Stack-Übersicht](index.md) -- alle Komponenten und ihre Rollen
