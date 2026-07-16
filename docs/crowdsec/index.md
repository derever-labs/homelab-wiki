---
title: CrowdSec
description: Intrusion Detection und IP-Blocking für Traefik
tags:
  - platform
  - security
  - crowdsec
---

# CrowdSec

CrowdSec ist ein kollaboratives Intrusion-Detection-System, das Traefik Access Logs analysiert und bösartige IPs via Bouncer-Plugin in Traefik blockiert.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Docker Compose auf vm-traefik-01/vm-traefik-02 (zusammen mit Traefik) |
| Datenquelle | Traefik Access Logs |

## Architektur

Die Architektur trennt zwei Pfade, die in den Diagrammen farblich kodiert sind: blau der synchrone Request-Pfad, ocker der asynchrone Detection-Datenfluss.

### Enforcement (synchroner Request-Pfad)

*Wer entscheidet am Request-Pfad, ob ein Request durchkommt -- und warum blockt der Bouncer sofort, obwohl die Detection asynchron läuft?*

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  pfad: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  datenfluss: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
}

client: Client (Internet) { class: node }

vm: Aktiver Traefik-Node {
  class: container
  tooltip: "vm-traefik-01 oder vm-traefik-02, erreichbar via VIP 10.0.2.20 (keepalived)"

  traefik: Traefik {
    class: container

    bouncer: Bouncer-Middleware {
      class: node
      tooltip: "Erste Middleware aller public-Chains -- interne Netze (clientTrustedIPs) werden nie geprüft"
    }
    banliste: "Banlisten-Cache\n(in-memory)" { class: data }
    chain: Restliche Middleware-Chain {
      class: node
      tooltip: "secure-headers, error-pages, authentik-forward-auth (Chain public-auth)"
    }
  }

  engine: CrowdSec Engine (LAPI) { class: node }
}

backend: Backend-Service { class: node }

client -> vm.traefik.bouncer: "1. HTTPS-Request" { class: pfad }
vm.traefik.bouncer -> vm.traefik.banliste: "2. IP-Lookup (lokal)" { class: pfad }
vm.traefik.bouncer -> client: "3a. gebannt: 403 sofort" { class: pfad }
vm.traefik.bouncer -> vm.traefik.chain: "3b. nicht gebannt: weiter" { class: pfad }
vm.traefik.chain -> backend: "4. Request + Response" { class: pfad }
vm.traefik.bouncer -> vm.engine: "A. pollt Decisions alle 15s (HTTP)" { class: datenfluss; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Ein externer Request trifft über die VIP auf den aktiven Traefik-Node. In allen `public-*`-Chains ist die [Bouncer-Middleware](#crowdsec-bouncer-traefik-plugin) das erste Glied ([Middleware Chains](../traefik/referenz.md#middleware-chains)).
2. Der Bouncer prüft die Client-IP ausschliesslich gegen seine lokal gecachte Banliste -- im Request-Pfad gibt es keinen API-Call zur Engine.
3. Gebannte IPs erhalten sofort HTTP 403, der Request erreicht weder Authentik noch ein Backend. CrowdSec steht bewusst vor `error-pages`, damit die Ban-Antwort nicht durch die Wartungsseite ersetzt wird.
4. Nicht gebannte Requests durchlaufen die restliche Chain zum Backend, die Response läuft denselben Weg zurück.
5. Den Cache aktualisiert der Bouncer asynchron alle 15 Sekunden per Stream-Poll bei der lokalen Engine ([Bouncer-Parameter](./referenz.md#bouncer-parameter)) -- deshalb blockt er sofort, obwohl die Detection asynchron ist.
6. Interne Netze stehen in `clientTrustedIPs` und werden vom Bouncer nie geprüft -- Bans wirken nur auf externe Clients.
7. Antwortet die Engine nicht, kippt der Bouncer nach dem ersten gescheiterten Poll in fail-closed: Nach spätestens 15 Sekunden erhält jeder externe Request HTTP 403, interne Netze bleiben ausgenommen ([Ausfallverhalten](#ausfallverhalten)).

### Detection (asynchroner Datenfluss)

*Wie wird aus einem verdächtigen Request eine Ban-Decision -- und welche Requests sieht die Engine überhaupt?*

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  ext: { style: { border-radius: 8; stroke-dash: 4 } }
  datenfluss: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
}

traefik: Traefik { class: node }

dockerlog: "Docker-Log-Driver\n(json-file)" {
  class: data
  tooltip: "stdout des Traefik-Containers, Rotation durch den Log-Driver"
}

engine: CrowdSec Engine {
  class: container

  parser: Parser + Whitelists {
    class: node
    tooltip: "Lokale Whitelists unter parsers/s02-enrich nehmen False-Positives vor den Szenarien aus"
  }
  szenarien: Szenarien (Collections) { class: node }
  lapi: "LAPI +\nDecision-DB" { class: data }
}

cloud: "CrowdSec Cloud\n(CAPI + Console)" { class: ext }

bouncer: Bouncer-Middleware (Traefik) { class: node }

traefik -> dockerlog: "1. Access-Log nach stdout (JSON, nur 4xx/5xx, Retries, Requests über 2s)" { class: datenfluss; style.stroke-dash: 3 }
engine.parser -> dockerlog: "2. liest neue Log-Zeilen (Docker-Socket, Pull)" { class: datenfluss; style.stroke-dash: 3 }
engine.parser -> engine.szenarien: "3. geparste Events (Whitelist-gefiltert)" { class: datenfluss; style.stroke-dash: 3 }
engine.szenarien -> engine.lapi: "4. Szenario ausgelöst: Ban-Decision" { class: datenfluss; style.stroke-dash: 3 }
bouncer -> engine.lapi: "5. Decision beim nächsten Poll (HTTP)" { class: datenfluss; style.stroke-dash: 3 }
engine.lapi -> cloud: "A. meldet Signale (HTTPS)" { style.stroke-dash: 3 }
engine.lapi -> cloud: "B. holt Community-Blocklist (HTTPS)" { style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Traefik schreibt sein Access-Log als JSON nach stdout. Log-Filter lassen nur 4xx/5xx, Backend-Retries und Requests über 2 s durch -- die [Engine](#crowdsec-engine) sieht also nur diesen sicherheitsrelevanten Ausschnitt des Traffics, schnelle 2xx/3xx nie.
2. Die Engine holt die Log-Zeilen aktiv über den Docker-Socket ab (Pull) -- Traefik selbst weiss nichts von CrowdSec.
3. Parser normalisieren die Events. [Lokale Whitelists](./referenz.md#lokale-whitelists) nehmen bekannte False-Positives aus, bevor Szenarien sie sehen.
4. Die Szenarien der installierten [Collections](./referenz.md#collections) aggregieren Events über Zeit (z. B. Probing-Zähler) und erzeugen beim Auslösen eine Ban-Decision in der lokalen Decision-DB.
5. Wirksam wird ein Ban erst, wenn der [Bouncer](#crowdsec-bouncer-traefik-plugin) die Decision beim nächsten Stream-Poll abholt -- zwischen Angriff und Block liegen darum bis zu einige Sekunden plus Log-/Parsing-Latenz.
6. Die Engine meldet bestätigte Angriffe als Signale an die CrowdSec Cloud und bezieht im Gegenzug die Community-Blocklist, die als zusätzliche Decisions in die lokale DB einfliesst.

Die Console der CrowdSec Cloud ist unter [app.crowdsec.net](https://app.crowdsec.net) erreichbar.

## Ausfallverhalten

*Was passiert, wenn die Engine ausfällt -- und was passiert mit den Bans beim Failover auf den zweiten Node?*

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  aktiv: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  passiv: { style: { stroke: "#42714a"; font-color: "#42714a" } }
}

client: Client (Internet) {
  class: node
  top: 0
  left: 670
}

vip: "VIP 10.0.2.20\n(keepalived)" {
  class: node
  top: 300
  left: 690
}

node1: vm-traefik-01 (MASTER) {
  class: container
  top: 520
  left: 250

  traefik: "Traefik + Bouncer\n(eigener Cache)" { class: node }
  engine: "CrowdSec Engine\n(eigene Banliste)" { class: node }
}

node2: vm-traefik-02 (BACKUP) {
  class: container
  top: 520
  left: 950

  traefik: "Traefik + Bouncer\n(eigener Cache)" { class: node }
  engine: "CrowdSec Engine\n(eigene Banliste)" { class: node }
}

client -> vip: "1. HTTPS-Request" { class: aktiv }
vip -> node1.traefik: "2. aktiver Node" { class: aktiv }
vip -> node2.traefik: "nur bei Failover" { class: passiv; style.stroke-dash: 3 }
node1.traefik -> node1.engine: "pollt nur die eigene Engine" { class: aktiv; style.stroke-dash: 3 }
node2.traefik -> node2.engine: "pollt nur die eigene Engine" { class: passiv; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. keepalived hält die VIP auf dem MASTER, Clients erreichen zu jedem Zeitpunkt genau einen Node ([Traefik](../traefik/index.md)).
2. Jeder Node betreibt sein eigenes, vollständiges Paar aus Traefik (mit Bouncer-Cache) und [Engine](#crowdsec-engine) -- der Bouncer spricht ausschliesslich die Engine seines eigenen Nodes an.
3. Die beiden Engines synchronisieren ihre Decisions nicht untereinander: Jede baut ihre Banliste allein aus den Logs auf, die ihr Node selbst gesehen hat. Auch cloud-seitig sind beide unabhängig registriert.
4. Engine-Ausfall: Der Bouncer dieses Nodes kippt nach dem ersten gescheiterten Poll in fail-closed und beantwortet nach spätestens 15 Sekunden jeden externen Request mit HTTP 403, interne Netze (`clientTrustedIPs`) bleiben ausgenommen. keepalived bemerkt den Engine-Ausfall nicht und schwenkt die VIP nicht um.
5. Node-Failover: Der BACKUP übernimmt die VIP mit eigener, unabhängig aufgebauter Banliste -- aktive Bans des MASTER gelten dort nicht zwingend weiter.
6. Ein kurz vor dem Failover gebannter Angreifer kommt nach dem Failover so lange durch, bis die Engine des BACKUP ihn selbst erkennt oder die Community-Blocklist ihn liefert.

::: warning Engine-Ausfall blockt externen Traffic (fail-closed)
Der Bouncer toleriert mit der aktuellen Config keinen einzigen gescheiterten
Stream-Poll (`updateMaxFailure` ungesetzt, Default 0 in Plugin v1.4.7). Fällt
die CrowdSec-Engine eines Nodes aus, beantwortet Traefik auf diesem Node nach
spätestens 15 Sekunden jeden externen Request mit HTTP 403 -- interne Netze
(`clientTrustedIPs`) bleiben ausgenommen. keepalived prüft nur Traefik selbst
und das Gateway, ein Engine-Ausfall löst also keinen VIP-Failover aus. Die
Engine ist damit pro Node ein Verfügbarkeits-SPOF für den externen Zugriff
(fail-closed by design der aktuellen Config).
:::

::: warning Unabhängige Banlisten pro Node
Die beiden Engines synchronisieren ihre Decisions nicht untereinander. Beim
VIP-Failover übernimmt der BACKUP mit einer eigenen, unabhängig aufgebauten
Banliste -- aktive Bans des MASTER gelten dort nicht zwingend weiter.
:::

## Komponenten

### CrowdSec Engine

Analysiert Traefik Access Logs und erkennt Angriffspatterns anhand von Szenarien. Entscheidet über IP-Bans und stellt die lokale API (LAPI) bereit.

### CrowdSec Bouncer (Traefik Plugin)

Natives Traefik-Plugin, das als Middleware direkt in Traefik läuft.

Engine- und Bouncer-Parameter, verwendete Collections und lokale Whitelists: [CrowdSec Referenz](./referenz.md).

## Integration mit Traefik Middleware Chains

CrowdSec ist als erste Middleware in allen `public-*` Chains eingebunden. Damit werden alle öffentlich erreichbaren Services geschützt, bevor die Authentik-Authentifizierung greift. Die genaue Reihenfolge der Chains ist in [Traefik Middlewares](../traefik/referenz.md) dokumentiert.

## Verwandte Seiten

- [CrowdSec Referenz](./referenz.md) -- Engine-/Bouncer-Parameter, Collections, Whitelists
- [Sicherheit](../security/index.md) -- Gesamte Security-Architektur
- [Traefik Middlewares](../traefik/referenz.md) -- Middleware Chains mit CrowdSec
- [Authentik](../authentik/index.md) -- Ergänzende Schutzschicht (Reputation Policy)
