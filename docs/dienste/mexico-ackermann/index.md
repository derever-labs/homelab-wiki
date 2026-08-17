---
title: Mexiko-Reiseübersicht
description: Statische Reise-Übersicht zur Mexiko-Reise 2026/27 hinter Authentik, mit Offline-Nutzung über einen Service-Worker
tags:
  - service
  - nomad
  - authentik
  - statisch
  - reise
---

# Mexiko-Reiseübersicht

Die Mexiko-Reiseübersicht (Dienst `mexico-ackermann`) bündelt alles, was für die Reise vom 15. Dezember 2026 bis 23. Januar 2027 zusammengetragen wurde: Route und Termine, Feste, Natur, Kultur, Kulinarik, Mobilität, die Sicherheits-Einordnung der Regionen nach EDA und US-Reisehinweisen, eine Fristen-Checkliste, Favoriten zum Teilen sowie einen Kalender-Export. Sie ist als Nachschlagewerk fürs Handy gebaut und läuft dank Service-Worker auch ohne Netz. Zielgruppe sind Samuel und die zwei Mitreisenden.

Technisch ist es die kleinstmögliche Ausprägung des [Homelab-App-Standards](../../_querschnitt/app-standard/index.md): eine einzige HTML-Datei mit eingebetteten Schriften und Icons, ausgeliefert von einem nginx ohne Datenbank, ohne API und ohne Secrets.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [mexico.ackermannprivat.ch](https://mexico.ackermannprivat.ch) (extern und intern erreichbar, immer hinter Authentik) |
| Deployment | Nomad Job `tools/mexico-ackermann.nomad`, Image aus [github.com/derever-labs/mexico-ackermann](https://github.com/derever-labs/mexico-ackermann) |
| Storage | Keins -- die gesamte Seite liegt im Image |
| Auth | Extern `public-auth@file`, intern `intern-auth@file` plus ClientIP-Filter; Authentik-Application `mexico` |
| Secrets | Keine |

## Rolle im Stack

Der Dienst ist reine Wissensablage für eine befristete Reise und hängt an keinem anderen System: Fällt er aus, ist kein Arbeitsablauf betroffen. Er liegt trotzdem im Homelab statt auf einem öffentlichen Hoster, weil die Übersicht Reisedaten, Unterkünfte und persönliche Einschätzungen enthält -- die Authentik-Kette vor der Seite ist der ganze Zugriffsschutz, die Anwendung selbst kennt keine Benutzer.

Das Design ist aus dem [Design-System](https://github.com/derever-labs/ackermann-design-system) übernommen und inline in die Seite gezogen, damit die Datei ohne weiteren Abruf auskommt.

## Zugriffswege

**Leitfrage:** Wie kommt ein Aufruf von unterwegs und aus dem eigenen Netz zur Seite -- und was passiert, wenn unterwegs das Netz fehlt?

Lesekonvention: Ocker kodiert den externen Weg, Blau den internen, Grau die Nebenwege. Gestrichelt sind die Pfade, die keine Benutzer-Anfrage tragen.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  extern: { style: { stroke: "#b45309"; font-color: "#b45309" } }
  intern: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  neben: { style: { stroke: "#6b7280"; font-color: "#6b7280"; stroke-dash: 4 } }
}

direction: right

browser: "Browser\nHandy oder Laptop" {
  class: node
}

cache: "Service-Worker-Cache\nim Browser" {
  class: node
  tooltip: "App-Shell plus Schriften und Icon -- nur was beim Installieren precached wurde"
}

traefik: Traefik {
  class: container

  rext: "Router extern" {
    class: node
    tooltip: "Host-Regel plus public-auth -- CrowdSec vor der Authentik-ForwardAuth"
  }
  rint: "Router intern" {
    class: node
    tooltip: "Host-Regel plus ClientIP-Filter auf LAN und Tailscale plus intern-auth"
  }
}

authentik: "Authentik\nApplication mexico" {
  class: node
  tooltip: "Proxy-Provider mexico-proxy im Forward-Auth-Modus fuer eine einzelne Anwendung auf beiden Outposts"
}

app: "nginx\nJob mexico-ackermann" {
  class: node
  tooltip: "Statische Seite plus Service-Worker plus Icon -- kein Volume und keine API"
}

consul: Consul {
  class: node
}

browser -> traefik.rext: "1 HTTPS von unterwegs" { class: extern }
traefik.rext -> authentik: "2 ForwardAuth hinter CrowdSec" { class: extern }
traefik.rext -> app: "3 Anfrage mit gültiger Sitzung" { class: extern }
browser -> traefik.rint: "1b HTTPS aus LAN oder Tailscale" { class: intern }
traefik.rint -> authentik: "2b ForwardAuth ohne CrowdSec" { class: intern }
traefik.rint -> app: "3b Anfrage mit gültiger Sitzung" { class: intern }
browser -> cache: "ohne Netz: Seite aus dem Cache" { class: neben }
consul -> app: "Health-Check auf die Alloc-IP" { class: neben }
```

1. Von unterwegs trifft der Aufruf den externen Router, der die volle öffentliche Kette vorschaltet (siehe [Zwei Router ohne auth-freie Route](#zwei-router)).
2. Ohne gültige Sitzung endet der Aufruf als Weiterleitung auf den Authentik-Login; die Anwendung sieht ihn nie.
3. Erst danach erreicht die Anfrage den nginx, der die Seite ausliefert.
4. Aus dem eigenen Netz oder über Tailscale greift stattdessen der interne Router mit ClientIP-Filter -- ebenfalls mit Authentik, aber ohne CrowdSec davor.
5. Ist ein Gerät einmal angemeldet und die Seite installiert, beantwortet der Service-Worker den Aufruf ohne Netz aus dem Cache (siehe [Offline-Nutzung](#offline-nutzung)).
6. Der Health-Check läuft rein Consul-intern gegen die Alloc-IP und braucht deshalb keine eigene Traefik-Route.

**Belegt gegen** `tools/mexico-ackermann.nomad` im Repo `homelab-nomad-jobs` sowie `nginx.conf`, `sw.js` und `README.md` im App-Repo `derever-labs/mexico-ackermann`, Stand 17.08.2026.

## Zwei Router ohne auth-freie Route {#zwei-router}

Ein Consul-Service trägt zwei Traefik-Router auf demselben Host: den externen mit `public-auth@file` und den internen mit ClientIP-Filter auf die privaten Netze und den Tailscale-Bereich plus `intern-auth@file`. Der externe Weg existiert bewusst, weil die Übersicht genau dann gebraucht wird, wenn niemand im Heimnetz ist -- der interne spart im Alltag den CrowdSec-Umweg. Details zu den Ketten: [Traefik Referenz](../../edge/traefik/referenz.md).

Einen dritten, auth-freien Router auf `/api/health` gibt es nicht, obwohl der App-Standard ihn für Liveness-Endpunkte vorsieht. Für diesen Dienst genügt der Consul-Health-Check aus dem Cluster heraus, und jede zusätzliche öffentlich erreichbare Route wäre Angriffsfläche ohne Gegenwert. Ein eigener DNS-Eintrag entfällt ebenfalls: Der Host läuft über das Wildcard-Zertifikat und den Wildcard-Eintrag für `*.ackermannprivat.ch` (siehe [TLS-Zertifikate](../../_referenz/tls-zertifikate.md)).

## Zugang für die Mitreisenden {#zugang-mitreisende}

Die Authentik-Application `mexico` ist an die Gruppen `admin`, `family` und `guest` gebunden -- alle drei einzeln, weil Authentik Gruppen-Mitgliedschaft nicht transitiv vererbt. Es ist dasselbe Muster wie bei Jellyseerr und der Grund, warum die beiden Mitreisenden ausserhalb der Familie über `guest` Zugriff haben, ohne dass für sie eine Sonderlösung nötig wäre. Hintergrund zur Binding-Strategie: [Authentik Gruppen und Bindings](../../edge/authentik/gruppen-bindings.md).

## Offline-Nutzung {#offline-nutzung}

Ein Service-Worker legt beim ersten Besuch die Seite samt Schriften und Icon in den Browser-Cache und beantwortet Aufrufe danach zuerst daraus. Er ist bewusst minimal: nur dieser Vorrat, kein Laufzeit-Caching, und aktualisiert wird ausschliesslich über einen Versions-String im Worker selbst. Damit ein neuer Stand überhaupt ankommt, liefert der nginx `sw.js` mit `no-store` aus -- sonst hält der Browser einen alten Worker fest und die Seite erneuert sich nie.

::: warning Bewusste Ausnahme vom App-Standard
Der [App-Standard](../../_querschnitt/app-standard/index.md#auth-muster-fuer-spas-hinter-authentik) vermeidet Service-Worker hinter Authentik, weil sie bei Live-Apps mit eigener API Auth-Sackgassen erzeugen: Der Worker beantwortet Aufrufe aus dem Cache, während die Sitzung längst abgelaufen ist. Hier wurde die Ausnahme am 17.08.2026 bewusst getroffen -- die Seite ist rein statisch, ruft keine API auf, und der Offline-Nutzen in mexikanischen Funklöchern ist der Kernzweck. Die Folge ist trotzdem real: Ein einmal angemeldetes Gerät zeigt die Seite weiter, ohne erneut durch die Authentik-Kette zu gehen. Wer den Zugriff eines Geräts wirklich entziehen will, muss den Browser-Speicher auf diesem Gerät leeren, nicht nur die Authentik-Sitzung beenden.
:::

::: info SSOT im App-Repo
Aufbau der Seite, Datenstand der Programmpunkte und Deploy-Ablauf werden im README von [derever-labs/mexico-ackermann](https://github.com/derever-labs/mexico-ackermann) gepflegt und hier nicht dupliziert.
:::

## Verwandte Seiten

- [Homelab App-Standard](../../_querschnitt/app-standard/index.md) -- Build- und Deploy-Muster des Dienstes
- [Authentik Gruppen und Bindings](../../edge/authentik/gruppen-bindings.md) -- Tier-Logik hinter dem Gast-Zugriff
- [Traefik Referenz](../../edge/traefik/referenz.md) -- Middleware-Ketten `public-auth` und `intern-auth`
- [CrowdSec](../../edge/crowdsec/index.md) -- Schutzschicht vor dem externen Router
- [Zot Container Registry](../../plattform/docker-registry/index.md) -- Ablage des Images
- [Monitoring Coverage](../../monitoring/coverage/index.md) -- Überwachungs-Status des Dienstes
