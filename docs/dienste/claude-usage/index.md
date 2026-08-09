---
title: Claude Usage
description: Dashboard für die Usage-Limiten der drei Claude-Konten mit Reset-Countdown und Abo-Übersicht
tags:
  - service
  - dashboard
  - nomad
  - claude
---

# Claude Usage

Claude Usage zeigt auf einer Seite, wie weit die Limiten der drei Claude-Konten ausgeschöpft sind -- je Konto das 5-Stunden-Fenster der laufenden Session, das Wochenfenster und das separate Wochenfenster für Fable -- und wann das jeweilige Fenster wieder zurücksetzt. Damit beantwortet die Seite die Planungsfrage, welches Konto gerade arbeitsfähig ist und wie lange ein blockiertes Konto noch blockiert bleibt. Dazu kommt je Konto die Abo-Übersicht mit Plan und nächster Verlängerung (siehe [Abo-Übersicht](#abo-uebersicht)). Technisch ist es eine statische nginx-Seite (nginx-unprivileged) nach dem [Homelab-App-Standard](../../_querschnitt/app-standard/index.md); die Zahlen liefert ein Poller auf Samuels Mac.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [claude.ackermannprivat.ch](https://claude.ackermannprivat.ch) (nur intern und VPN) |
| Deployment | Nomad Job `services/claude-usage.nomad`, Image aus [github.com/derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) |
| Storage | Keins -- `usage.json` liegt ephemer im Container unter `/data` |
| Auth | Seite: `intern-auth@file` (Authentik, Gruppe `admin`) plus ClientIP-Allowlist; `/usage.json`: `intern-api@file` plus nginx-BasicAuth für den Push |
| Secrets | Vault `kv/claude-usage` |

## Rolle im Stack

Der Dienst ist reine Anzeige: Er hält keine Historie, rechnet nichts nach und hängt an keiner Datenbank -- er rendert die letzte Momentaufnahme, die ihm zugestellt wurde. Der tragende Entwurfsentscheid ist die umgekehrte Datenrichtung. Die Konten-Token liegen im macOS-Keychain von Samuels Mac und verlassen ihn nicht als Secret im Cluster, also kann der Cluster die Limiten nicht selbst abfragen. Statt einen Pull zu bauen, der die Token nach Vault kopieren müsste, holt der Mac die Zahlen und schiebt sie in den Cluster. Der Cluster kennt damit nur das Ergebnis, nie die Zugangsdaten der Konten.

Der Einstieg läuft über die Kachel auf dem internen Portal [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) in der Gruppe Monitoring (siehe [Dashboards](../dashboards/index.md)).

## Datenfluss

**Leitfrage:** Wie kommen die Zahlen der drei Konten auf die Seite, und warum nimmt `/usage.json` einen anderen Weg durch Traefik als die Seite selbst?

Lese-Konvention: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Ocker kodiert den Push-Weg vom Mac, Blau den Seiten-Weg des Browsers.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  push: { style: { stroke: "#b45309"; font-color: "#b45309" } }
  seite: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
}

direction: right

mac: "Mac (launchd-Poller)" {
  class: node
  tooltip: "Läuft alle 5 Minuten und liest die OAuth-Token der drei Konten aus dem macOS-Keychain"
}

anthropic: "Anthropic Usage-Endpunkt" {
  class: node
  tooltip: "Interner, undokumentierter Endpunkt -- dieselbe Quelle, aus der Claude Code seine eigene Limiten-Anzeige speist"
}

browser: Browser { class: node }

traefik: Traefik {
  class: container

  rseite: "Seiten-Router" {
    class: node
    tooltip: "Host-Regel plus ClientIP-Allowlist, Chain intern-auth -- Authentik mit Gruppe admin"
  }
  rdata: "Daten-Router /usage.json" {
    class: node
    tooltip: "Pfad-Router mit hoher expliziter Priorität, Chain intern-api -- bewusst ohne Authentik"
  }
}

app: "claude-usage (nginx)" {
  class: container

  html: "Statische Seite" { class: node }
  data: "/data/usage.json" {
    shape: cylinder
    class: node
    tooltip: "Ephemer im Container -- BasicAuth schützt das Schreiben, der nächste Push füllt die Datei nach"
  }
}

mac -> anthropic: "1 Limiten je Konto abfragen" { class: push }
mac -> traefik.rdata: "2 HTTPS PUT usage.json (BasicAuth)" { class: push }
traefik.rdata -> app.data: "3 Datei schreiben" { class: push }
browser -> traefik.rseite: "4 Seite anfordern" { class: seite }
traefik.rseite -> app.html: "5 HTML und JS ausliefern" { class: seite }
browser -> traefik.rdata: "6 usage.json lesen" { class: seite }
```

1. Der Poller auf dem Mac liest die OAuth-Token der drei Konten aus dem macOS-Keychain und fragt damit den Anthropic-Usage-Endpunkt ab (siehe [Datenquelle](#datenquelle)).
2. Alle fünf Minuten schiebt er das Ergebnis per HTTPS PUT an den Dienst, authentifiziert über nginx-BasicAuth aus Vault.
3. nginx legt die Datei unter `/data` ab -- ohne Volume, absichtlich (siehe [Kein Volume](#kein-volume)).
4. Der Browser holt die Seite über den Seiten-Router, der Authentik und die IP-Allowlist vorschaltet.
5. Ausgeliefert wird statisches HTML mit JavaScript; die Aufbereitung der Zahlen passiert im Browser.
6. Die Daten selbst holt das JavaScript über den zweiten Router ohne Authentik (siehe [Zwei Router auf einem Service](#zwei-router-auf-einem-service)).

**Belegt gegen** `services/claude-usage.nomad` im Repo `homelab-nomad-jobs`, Stand 09.08.2026.

## Datenquelle

::: warning Undokumentierter interner Endpunkt
Die Zahlen stammen aus einem internen, nicht dokumentierten Endpunkt von Anthropic -- demselben, den Claude Code für die eigene Limiten-Anzeige nutzt. Er kann sich jederzeit ändern oder wegfallen, ohne Vorwarnung und ohne Migrationspfad. Der Schaden bleibt dabei auf die Anzeige begrenzt: Kein anderer Dienst hängt an diesen Daten, und kein Arbeitsablauf bricht, wenn die Seite leer bleibt.
:::

Der zweite Grenzfall ist der Mac selbst. Ist er aus oder ohne Netz, kommt kein Push an und die Prozentwerte frieren auf dem Stand des letzten Laufs ein. Die Seite verschweigt das nicht, sondern blendet ein Staleness-Banner mit dem Alter der Daten ein. Die Reset-Countdowns bleiben in diesem Zustand korrekt, weil sie aus den mitgelieferten Reset-Zeitpunkten laufen und nicht aus dem Push-Zeitpunkt; ein Fenster, dessen Reset bereits in der Vergangenheit liegt, leitet die Seite clientseitig als wieder frei ab.

## Abo-Übersicht {#abo-uebersicht}

Neben den Limiten zeigt jede Karte den gebuchten Plan und den nächsten Abrechnungstermin. Der Zweck ist die Kündigungsfrist: Zwei der drei Konten laufen auf Max, und ein verpasster Termin verlängert das Abo automatisch um eine weitere Periode. Die Seite hebt den Termin deshalb ab einer Woche vorher hervor.

Plan, Abo-Status und Abo-Beginn liefert derselbe OAuth-Zugang wie die Limiten über einen zweiten Endpunkt. Das eigentliche Verlängerungsdatum gibt Anthropic dort nicht heraus -- die Billing-Schnittstellen verlangen eine Web-Session und lehnen den OAuth-Token ab.

::: warning Der Verlängerungstermin ist gerechnet, nicht abgefragt
Die Seite leitet den nächsten Termin aus dem Abo-Beginn ab: derselbe Kalendertag, geklammert auf die Monatslänge. Das Abrechnungsintervall kennt die Schnittstelle nicht, es ist im Poller je Konto konfiguriert und steht auf monatlich. Ein Konto mit Jahresabo zeigt ohne Umstellung dieser Konfiguration falsche Termine an, und ein ausserhalb des Zyklus vorgenommener Plan-Wechsel verschiebt den Abrechnungstag, bis der Poller das Profil erneut liest.
:::

## Zwei Router auf einem Service

Ein Consul-Service, zwei Traefik-Router: Die Seite läuft wie das interne Portal hinter `intern-auth@file`, `/usage.json` dagegen hinter `intern-api@file` ganz ohne Authentik. Der Grund ist der Poller -- ein Skript kann keinen Authentik-Redirect durchlaufen, sein PUT würde an der Login-Weiterleitung scheitern. Der Schreibschutz sitzt deshalb eine Ebene tiefer bei nginx, das den PUT per BasicAuth gegen ein htpasswd aus Vault prüft. Beide Router tragen zusätzlich die ClientIP-Allowlist, der Dienst ist also weder für die Seite noch für die Daten von aussen erreichbar. Details zu den Ketten: [Traefik Referenz](../../edge/traefik/referenz.md).

::: warning Der Pfad-Router braucht eine explizite Priorität
Ohne gesetzte Priorität sortiert Traefik nach Regel-Länge. Die lange Host- und ClientIP-Regel des Seiten-Routers schlug damit den kürzeren Pfad-Router, und `/usage.json` landete im Authentik-Zweig -- der Push kam nicht durch. Der Daten-Router trägt deshalb eine explizit gesetzte, deutlich höhere Priorität als jede implizite Regel-Länge erreichen kann.
:::

## Kein Volume

Der Job bindet bewusst kein Volume ein: `usage.json` lebt im Container-Dateisystem. Nach einem Alloc-Neustart ist die Datei weg, und die Seite zeigt bis zum nächsten Push ihr Staleness-Banner -- längstens fünf Minuten. Ein repliziertes Volume für einen Zustand mit fünf Minuten Halbwertszeit wäre Betriebsaufwand ohne Nutzen, und der Push ist die vollständige Wiederherstellung.

## Re-Login der Konten

Läuft der OAuth-Token eines Kontos ab, kann der Poller dieses Konto nicht mehr abfragen; die Seite zeigt dafür eine Karte "Re-Login nötig" statt veralteter Zahlen. Behoben wird das auf dem Mac und nicht im Cluster: Claude Code mit dem Konfigurationsverzeichnis des betroffenen Kontos starten (Umgebungsvariable `CLAUDE_CONFIG_DIR`) und den Login-Flow durchlaufen. Beim nächsten Lauf liefert der Poller für dieses Konto wieder Daten.

::: info SSOT im App-Repo
Poller-Einrichtung, Token-Mechanik, die Zuordnung von Konfigurationsverzeichnis zu Konto und der Aufbau von `usage.json` werden im README von [derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) gepflegt und hier nicht dupliziert.
:::

## Verwandte Seiten

- [Dashboards](../dashboards/index.md) -- internes Portal mit der Kachel zu diesem Dienst
- [Traefik Referenz](../../edge/traefik/referenz.md) -- Middleware-Ketten `intern-auth` und `intern-api`
- [Authentik](../../edge/authentik/index.md) -- SSO vor der Seite (Gruppe `admin`)
- [Vault](../../plattform/vault/index.md) -- Secret-Injection des htpasswd über Workload Identity
- [Homelab App-Standard](../../_querschnitt/app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [github.com/derever-labs/claude-usage](https://github.com/derever-labs/claude-usage) -- App-Repo mit README
