---
title: Claude Rotate
description: Multi-Konto-Proxy für Claude Code als Opt-in-Pfad für Agenten-Flotten und Headless-Läufe, seit September 2026 als Standardweg abgelöst vom lokalen Live-Wechsler claude-swap
tags:
  - service
  - proxy
  - nomad
  - claude
---

# Claude Rotate

Claude Rotate ist ein kleiner HTTP-Proxy vor der Anthropic-API. Claude Code auf dem Mac oder in Container-Jobs zeigt per Umgebungsvariable auf den Proxy statt direkt auf `api.anthropic.com`, der Proxy tauscht den Anmelde-Header gegen das Token des gerade aktiven Kontos und reicht alles andere unverändert durch. Aus den Antwort-Headern liest er die Auslastung der Limiten und wechselt das Konto, bevor eine Session in die Sperre läuft. Grundlage ist der Open-Source-Proxy [doxaras/claude-rotate](https://github.com/doxaras/claude-rotate), betrieben als Fork [derever-labs/claude-rotate](https://github.com/derever-labs/claude-rotate) mit Erweiterungen für den Cluster-Betrieb und für das separate Fable-Wochenfenster. Er ergänzt [Claude Usage](../claude-usage/index.md): das Dashboard zeigt die Limiten, der Proxy handelt danach. Der Standardweg für den Kontowechsel ist er seit dem 6. September 2026 nicht mehr, siehe [Betriebsweise](#betriebsweise).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | `rotate.ackermannprivat.ch` (nur intern und VPN, keine Seite, nur API) |
| Deployment | Nomad Job `services/claude-rotate.nomad`, Image aus [github.com/derever-labs/claude-rotate](https://github.com/derever-labs/claude-rotate) nach [Homelab-App-Standard](../../_querschnitt/app-standard/index.md) |
| Storage | Keins. Zustand und Audit-Log liegen ephemer im Container |
| Auth | Kein Authentik (Claude Code kann keinem Login-Redirect folgen). Device-Key pro Gerät im Anmelde-Header, unbekannter Key ergibt 401, dazu ClientIP-Allowlist im Router `intern-noauth@file` |
| Secrets | Vault `kv/claude-rotate` (Device-Keys als `devices_json`) und lesend `kv/claude-usage/creds/*` (Konto-Tokens, gepflegt vom Poller in Claude Usage) |

## Betriebsweise

Standardweg für den Kontowechsel ist seit dem 6. September 2026 nicht mehr der Proxy, sondern der lokale Live-Wechsler `claude-swap` (Kommando `cswap`, MIT-Lizenz, Projekt `realiti4/claude-swap`) auf Samuels Mac. Er tauscht das angemeldete Konto direkt im macOS-Keychain. Claude Code liest den Credential-Store pro Anfrage neu, deshalb wechselt auch eine bereits laufende Session samt ihrer Subagenten das Konto, ohne Neustart. Erfasst sind die drei Konten des Proxys `hslu-dc`, `hslu-privat` und `privat` sowie seit dem 9. September 2026 zusätzlich `hslu-digital`, das nur der Wechsler kennt (der Proxy bleibt bei drei Konten).

Der Wechsel läuft automatisch. Ein LaunchAgent `ch.ackermannprivat.claude-swap-auto` prüft jede Minute, ob das aktive Konto die Schwelle von 95 Prozent erreicht, bewertet dabei das Fable-Wochenfenster mit und wählt das nächste Konto nach der Strategie consume-first. Protokoll unter `~/.local/var/log/claude-swap-auto.log`.

### Warum der Proxy nicht mehr Standard ist

Anthropic erlaubt die OAuth-Tokens eines Abos ausdrücklich nur im unveränderten Claude Code und in nativen Anthropic-Anwendungen. Ein Proxy, der diese Tokens hält und Konten tauscht, fällt nicht darunter und umgeht eine serverseitige Sperre. Der Wechsel per Anmeldung mit eigenen Konten bleibt dagegen regelkonform, weil er nichts umgeht: jede Anfrage läuft als das Konto, an dem Claude Code angemeldet ist. Für beide Wege gilt unverändert, dass nur eigene, bezahlte Konten genutzt werden und nie als geteilter Dienst.

Dazu kommen die dokumentierten Funktionskosten einer fremden Basis-URL, die den lokalen Wechsel auch technisch überlegen machen: kein Remote Control, keine Session-URL, der Prompt-Cache läuft nach fünf statt nach sechzig Minuten ab, und das grosse Kontextfenster braucht ein undokumentiertes Flag.

### Der Proxy als Opt-in

Der Proxy läuft weiter, aber als bewusster Opt-in für Agenten-Flotten und Headless-Läufe, bei denen niemand vor der Session sitzt und die Funktionskosten der fremden Basis-URL nicht ins Gewicht fallen. Aktiviert wird er pro Shell mit `rotate-on`, der Standard ist aus (Details unter [Nutzung auf dem Mac](#nutzung-auf-dem-mac)).

## Rolle im Stack

Vier Konten teilen sich die Arbeit von Claude Code. Ohne Proxy heisst ein volles Limit: Session abbrechen, umloggen, weiterarbeiten, und das Fable-Wochenfenster eines Kontos ist regelmässig leer, während das andere Konto Platz hätte. Der Proxy macht daraus eine Betriebsentscheidung, die niemand von Hand treffen muss. Er umgeht dabei keine Nutzungslimite: jedes Konto bleibt einzeln durch Anthropic begrenzt, der Proxy verteilt nur auf Konten, die Samuel selbst bezahlt.

Ein Ausfall mitten in einer Session heisst `rotate-off` und Resume, der Prompt-Cache liegt bei Anthropic pro Konto und überlebt das. Der Poller von Claude Usage läuft immer direkt gegen Anthropic, weil die Claude-CLI dort ihr eigenes Token erneuern muss.

## Datenfluss

**Leitfrage:** Wie kommt eine Anfrage von Claude Code zum richtigen Konto, und woher kennt der Proxy die Tokens und die Auslastung?

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Ocker kodiert den Anfrage-Weg, Blau die Datenpflege im Hintergrund.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  req: { style: { stroke: "#b45309"; font-color: "#b45309" } }
  bg: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
}

direction: right

client: "Claude Code (Mac, Pods)" {
  class: node
  tooltip: "ANTHROPIC_BASE_URL zeigt auf den Proxy, CLAUDE_CODE_OAUTH_TOKEN trägt den Device-Key"
}

traefik: "Traefik" {
  class: container
  rproxy: "Proxy-Router" {
    class: node
    tooltip: "Host-Regel plus ClientIP-Allowlist, Chain intern-noauth, kein Authentik"
  }
  rhealth: "Health-Router /rotate/health, /rotate/ready" {
    class: node
    tooltip: "Hohe explizite Priorität, damit Kuma nicht am Proxy-Router hängen bleibt"
  }
}

rotate: "claude-rotate (Nomad)" {
  class: node
  tooltip: "Tauscht den Device-Key gegen den Access-Token des aktiven Kontos, liest die Ratelimit-Header der Antwort, wechselt bei Bedarf"
}

anthropic: "api.anthropic.com" { class: node }

vault: "Vault kv/claude-usage/creds" {
  class: node
  tooltip: "Access-Tokens der drei Konten, refresht vom Poller in Claude Usage; der Proxy liest nur"
}

usage: "Claude Usage usage.json" {
  class: node
  tooltip: "Auslastung aller Konten inklusive Fable-Fenster, auch der gerade nicht aktiven"
}

kuma: "Uptime-Kuma" { class: node }

client -> traefik.rproxy: "1 Anfrage mit Device-Key" { class: req }
traefik.rproxy -> rotate: "2 durchreichen" { class: req }
rotate -> anthropic: "3 mit Konto-Token, Antwort-Header liefern Auslastung" { class: req }
rotate -> vault: "alle 60 s und bei 401: Tokens lesen" { class: bg }
rotate -> usage: "alle 5 min: Auslastung aller Konten" { class: bg }
kuma -> traefik.rhealth: "jede Minute /rotate/ready" { class: bg }
traefik.rhealth -> rotate { class: bg }
```

## Konten und Kontowahl

Der Proxy kennt zwei Modellklassen. Anfragen an Fable oder Mythos sind *scoped*: Anthropic führt für diese Modelle ein eigenes Wochenfenster, das in den Antwort-Headern nur bei solchen Anfragen mitkommt (`7d_oi`). Alle anderen Anfragen sind *normal*. Für jede Klasse hält der Proxy ein eigenes aktives Konto.

| Klasse | Nutzbar wenn | Kontowahl |
|--------|--------------|-----------|
| normal | 5-Stunden- und Wochenfenster unter der Schwelle | Bleibt am aktiven Konto, solange es nutzbar ist. Beim Wechsel zählt die Priorität, dann die geringere Auslastung. Kein vorauseilender Wechsel, weil jeder Wechsel den Prompt-Cache der laufenden Sessions verwirft |
| scoped | zusätzlich Fable-Fenster unter der Schwelle | Verbraucht zuerst das Konto, dessen Fable-Fenster als nächstes zurücksetzt (consume-first), weil ungenutztes Wochenkontingent verfällt |

Ein 429 wird nach den Headern eingeordnet: meldet nur das Fable-Fenster erschöpft, verliert das Konto nur die scoped-Klasse. Meldet das 5-Stunden- oder Wochenfenster erschöpft, verliert es beide. Ein Burst-429 (Minutenlimit) löst keinen Wechsel aus, die Anfrage wartet die vom Server genannte Zeit.

Alle drei Konten `hslu-dc`, `hslu-privat` und `privat` stehen mit Priorität 1 in der Wahl, seit auch das private Abo wieder ein Max-Abo ist. Die früheren Sonderfälle für dieses Konto (deaktiviert, Fable-Modelle gesperrt) sind damit entfallen. Die Konfiguration steht sichtbar im Job-File, nur die Device-Keys kommen aus Vault.

## Tokens und Auslastung

Der Proxy besitzt keine eigenen Anmeldedaten. Er liest die Access-Tokens der Konten aus Vault, wo der Poller von [Claude Usage](../claude-usage/index.md) sie pflegt und rund alle acht Stunden erneuert. Der Proxy liest jede Minute neu und zusätzlich sofort, wenn Anthropic ein Token ablehnt, dann wiederholt er die Anfrage einmal mit dem frischen Token. Er erneuert nie selbst, damit es nur einen Schreiber gibt. Der Zugriff läuft über eine eigene Vault-Rolle `claude-rotate`, die nur lesen darf, während der Poller über die Rolle `claude-usage` schreibt.

Die Auslastung aller Konten holt der Proxy alle fünf Minuten aus der `usage.json` des Dashboards, damit auch ein gerade nicht aktives Konto mit aktuellen Zahlen in die Wahl eingeht. Frischere Werte aus echten Antwort-Headern haben Vorrang. Ein Konto, das im Dashboard als `relogin_required` steht, nimmt der Proxy vorsorglich aus der Wahl.

::: warning Poller-Ausfall trifft den Proxy mit Verzögerung
Fällt der Poller in Claude Usage aus, laufen die Access-Tokens in Vault innerhalb weniger Stunden ab, und der Proxy hat danach kein nutzbares Konto mehr. `/rotate/ready` antwortet dann 503, der Kuma-Monitor meldet es. Die Heilung ist immer die des Pollers.
:::

## Nutzung auf dem Mac

Die Shell-Funktionen `rotate-on`, `rotate-off` und `rotate-status` liegen im Claude-Config-Repo unter `scripts/claude-rotate.zsh` und werden aus der `.zshrc` geladen. Der Standard ist aus: eine neue Shell lässt Claude Code direkt gegen Anthropic laufen, erst `rotate-on` schaltet den Proxy für diese eine Shell ein und setzt dabei auch das First-Party-Flag. `rotate-off` nimmt das zurück. Der Device-Key liegt in einer Datei mit Modus 600 im Claude-Verzeichnis, bewusst nicht in der `settings.json`.

::: warning Kontextfenster: First-Party-Flag ist Pflicht
Mit einer fremden Base-URL behandelt Claude Code den Proxy als Cloud-Gateway, kennt seine Modelltabelle nicht mehr und kappt Modelle ohne `[1m]`-Suffix auf 200k Kontext. Beim Resume kommt genau die nackte Modell-ID zurück, die Session meldet dann "Prompt is too long". Die Shell-Funktionen setzen deshalb zusätzlich `_CLAUDE_CODE_ASSUME_FIRST_PARTY_BASE_URL=1`, damit die Modelltabelle wieder gilt (gemessen: 730k statt 180k effektives Fenster). Remote Control bleibt laut CLI trotzdem aus.
:::

::: warning Session-Verknüpfung mit claude.ai entfällt
Mit einer fremden Basis-URL baut Claude Code keine Verbindung zu claude.ai auf: keine Session-URL, kein Weiterarbeiten am Handy, kein Remote Control. Die Desktop-App ist nicht betroffen.
:::

## Betrieb

Zwei Endpunkte ohne Anmeldung: `/rotate/health` antwortet immer 200 (Prozess lebt) und ist der Consul-Check, damit Kontokapazität nie das Routing oder das Deploy-Gate beeinflusst. `/rotate/ready` antwortet 200 nur mit mindestens einem nutzbaren Konto, sonst 503, dazu das Alter der letzten Vault- und usage.json-Daten; darauf prüft der Kuma-Monitor `claude-rotate Ready`, und daraus speist sich der Proxy-Block im Usage-Dashboard. `/rotate/status` (mit Device-Key im Header) zeigt beide aktiven Konten, die Fenster pro Konto, die letzten Wechsel, die letzten Requests und die Sessions der letzten 24 Stunden mit Gerät, Konten und Modellen. Jeder Request landet zusätzlich als Audit-Zeile im Nomad-Log der Task.

Die Session-Kennung aus `metadata.user_id` wird streng geprüft, bevor sie in die Statistik geht: erlaubt sind nur nichtleere, UTF-8-saubere Zeichenketten bis 128 Zeichen, in beiden Schreibweisen des Feldnamens. Unbrauchbare Werte verwirft der Proxy und beantwortet die Anfrage trotzdem, denn sonst konnte `/rotate/status` mit Fehler 500 ausfallen.

Nach dem Tiefenreview vom 6. September 2026 ist der Proxy bewusst schmal: keine Strategien, keine Cooldowns, kein Panel, keine OpenAI-Route, kein Zustand auf Platte. Die Kontowahl ist eine einzige Regel vor jedem Request, alles andere sind Messwerte. Der Proxy liest seine Konfiguration nur beim Start und nennt unbekannte Schlüssel als Warnung. Änderungen am Job-File deployen über die CD-Pipeline. Neue Geräte bekommen einen Eintrag in `devices_json` in Vault und den Key als Datei auf dem Gerät.

Die Traefik-Antwortzeit ist für diesen Dienst angehoben: der HTTPS-Entrypoint erlaubt 30 Minuten pro Antwort, weil Claude Code minutenlang streamt und die frühere Grenze von 60 Sekunden lange Modellantworten abgeschnitten hätte (siehe [Traefik](../../edge/traefik/index.md)).

## Verwandte Seiten

- [Claude Usage](../claude-usage/index.md) -- Dashboard der Konto-Limiten und Quelle der Access-Tokens in Vault
- [Traefik](../../edge/traefik/index.md) -- Router, Allowlist-Chain und die angehobene Antwortzeit
- [Monitoring-Coverage](../../monitoring/coverage/index.md) -- Einordnung der Überwachung dieses Dienstes
