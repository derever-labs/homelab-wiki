---
title: Traefik Reverse Proxy
description: Zentraler Ingress und SSL-Terminierung (HA-Setup)
tags:
  - service
  - core
  - networking
---

# Traefik Reverse Proxy

## Übersicht

Traefik läuft als HA-Reverse-Proxy auf zwei VMs mit Keepalived VIP. Alle Homelab-Services werden über Traefik geroutet.

| Attribut | Wert |
|----------|------|
| Dashboard | [traefik.ackermannprivat.ch](https://traefik.ackermannprivat.ch) \| Siehe [Web-Interfaces](../../_referenz/web-interfaces.md) |
| Deployment | Docker Compose auf vm-traefik-01 + vm-traefik-02 (Ansible rolling deployed) |
| IPs | [Hosts und IPs](../../_referenz/hosts-und-ips.md) |
| Auth | `intern-auth@file` (Authentik) |

## Architektur

Zwei Szenario-Sichten zeigen die Traefik-eigene Mechanik: der Request-Fluss durch den Proxy und die [Ausfall-Sicht](#ausfall-sicht-vip-failover) des HA-Paars. Das Big Picture des gesamten Zugriffspfads -- Cloudflare-DNS, UDM-Port-Forward, interner Split-DNS-Weg und die Kontrollkanäle aller Edge-Systeme -- steht auf der [Edge-Übersicht](../index.md#das-gesamtbild-in-zwei-pfaden).

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten sind synchron (der Initiator wartet auf die Antwort), gestrichelte asynchron. Farben kodieren die Wege: Blau der synchrone Request-Pfad, Violett der ForwardAuth-Subrequest, Ocker die asynchronen Kontroll- und Prüfkanäle, Grün der Failover-Weg.

### Request-Fluss durch Traefik

**Leitfrage:** Welche Stationen durchläuft ein Request zwischen VIP und Backend -- und woher hat der Router sein Wissen?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  pfad: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  auth: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  kontrolle: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
}

client: Externer Client {
  class: node
  tooltip: "Weg bis zur VIP (Cloudflare-DNS, UDM-Port-Forward 80/443) -- siehe Edge-Übersicht"
}

vm: Aktiver Traefik-Node {
  class: container
  label.near: top-right
  tooltip: "vm-traefik-01 oder vm-traefik-02 -- keepalived hält die VIP 10.0.2.20 auf genau einem Node"

  entry: EntryPoint 443 + TLS {
    class: node
    tooltip: "terminiert TLS mit dem Wildcard-Zertifikat aus der lokalen acme.json -- SNI strict, min. TLS 1.2"
  }
  router: Router mit Host-Regel {
    class: node
    tooltip: "wählt anhand des Hostnamens Backend-Service und Middleware-Chain"
  }
  chain: Middleware-Chain public-auth {
    class: container

    bouncer: CrowdSec-Bouncer {
      class: node
      tooltip: "erstes Glied aller public-Chains -- prüft die Client-IP lokal gegen den Banlisten-Cache"
    }
    mw: secure-headers + error-pages {
      class: node
      tooltip: "Security-Header und Maintenance-Page -- error-pages steht bewusst vor forward-auth"
    }
    fwdauth: authentik-forward-auth { class: node }
  }
}

outpost: Authentik Proxy-Outpost {
  class: node
  tooltip: "prüft die Session -- 200 mit Identitäts-Headern oder 302 zum Login"
}
backend: Backend-Service {
  class: node
  tooltip: "Nomad-Service oder Standalone-Service -- Ziel aus der Router-Definition"
}
consul: Consul Catalog {
  class: node
  tooltip: "Service-Katalog Port 8500 -- Nomad-Jobs bringen Host-Regel und Chain als Service-Tags mit"
}
file: services-external.yml {
  class: data
  tooltip: "File-Provider für Standalone-Services -- live geladen bei Dateiänderung (watch)"
}

client -> vm.entry: "1. HTTPS\nauf die VIP" { class: pfad }
vm.entry -> vm.router: "2. entschlüsselter Request" { class: pfad }
vm.router -> vm.chain.bouncer: "3. Chain der Route --\nhier public-auth" { class: pfad }
vm.chain.bouncer -> vm.chain.mw: "4. IP nicht gebannt" { class: pfad }
vm.chain.mw -> vm.chain.fwdauth: "5. Header gesetzt" { class: pfad }
vm.chain.fwdauth -> outpost: "6. Auth-Subrequest --\n200 oder 302 zum Login" { class: auth }
vm.chain.fwdauth -> backend: "7. authentifizierter Request\n+ Response" { class: pfad }
vm.router -> consul: "A. pollt die Catalog-API --\nRouter aus Service-Tags" { class: kontrolle; style.stroke-dash: 3 }
vm.router -> file: "B. Router aus dem\nFile-Provider (watch)" { class: kontrolle; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Die Sicht beginnt beim Eintreffen auf dem aktiven Node -- den Weg dorthin (Cloudflare-DNS, UDM-Port-Forward 80/443, intern Split-DNS direkt auf die VIP) zeigt die [Edge-Übersicht](../index.md#das-gesamtbild-in-zwei-pfaden).
2. TLS endet am EntryPoint: Jeder Node terminiert mit dem Wildcard-Zertifikat aus seiner lokalen `acme.json` ([SSL-Terminierung](#ssl-terminierung), Härtung: [TLS-Options](./referenz.md#tls-options)).
3. Der Router matcht den Hostnamen und bestimmt Backend und Middleware-Chain. Sein Wissen entsteht asynchron aus zwei Quellen: Nomad-Services bringen Host-Regel und Chain als Consul-Tags mit, Standalone-Services stehen im File-Provider ([Consul Catalog Integration](#consul-catalog-integration)).
4. In den public-Chains prüft der CrowdSec-Bouncer als erstes Glied die Client-IP lokal gegen seinen Banlisten-Cache -- gebannte IPs erhalten sofort 403 ([CrowdSec Enforcement](../crowdsec/index.md#enforcement-synchroner-request-pfad)). Interne Clients laufen durch intern-Chains mit IP-Allowlist statt Bouncer ([Middleware Chains](./referenz.md#middleware-chains)).
5. `secure-headers` setzt die Security-Header; `error-pages` steht bewusst vor `authentik-forward-auth`, damit ein nicht erreichbarer Outpost die Wartungsseite zeigt statt eines rohen Fehlers ([Middleware Chains](./referenz.md#middleware-chains)).
6. Der ForwardAuth-Subrequest fragt den Authentik-Outpost: 200 mit Identitäts-Headern oder 302 zum Login ([Authentifizierung](#authentifizierung-middlewares)).
7. Erst danach erreicht der Request das Backend; die Response nimmt denselben Weg zurück.

## Hochverfügbarkeit (Keepalived)

| Attribut | Wert |
|----------|------|
| MASTER | Priorität 150 |
| BACKUP | Priorität 100 |
| Health-Check | Keepalived VRRP-Script prüft Traefik `/ping` |

VIP und Node-Zuordnung: siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md).

Keepalived prüft per VRRP-Script ob Traefik antwortet. Bei Ausfall wechselt die VIP automatisch zum BACKUP-Node.

### Ausfall-Sicht (VIP-Failover)

**Leitfrage:** Wer bemerkt den Ausfall des aktiven Nodes, wie schnell wandert die VIP -- und was wandert nicht mit?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  pfad: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  failover: { style: { stroke: "#42714a"; font-color: "#42714a" } }
  kontrolle: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
}

vip: VIP 10.0.2.20 {
  class: node
  tooltip: "VRRP Virtual IP -- Clients und Port-Forward sprechen immer die VIP an"
  top: 0
  left: 620
}

n1: vm-traefik-01 (MASTER) {
  class: container
  tooltip: "10.0.2.21 -- Priorität 150, nopreempt"
  top: 320
  left: 160
  grid-columns: 1
  grid-gap: 70

  t: Traefik { class: node }
  ka: keepalived { class: node }
}

n2: vm-traefik-02 (BACKUP) {
  class: container
  tooltip: "10.0.2.22 -- Priorität 100, nopreempt"
  top: 320
  left: 1060
  grid-columns: 1
  grid-gap: 70

  t: Traefik { class: node }
  ka: keepalived { class: node }
}

gw: Pi-hole 10.0.2.1 {
  class: node
  tooltip: "Gateway-Track-Ziel -- antwortet der Ping nicht, gilt das Netz des MASTER als gestört"
  top: 880
  left: 160
}

vip -> n1.t: "1. Normalbetrieb --\nMASTER hält die VIP" { class: pfad }
vip -> n2.t: "4. nach Failover (~4 s)" { class: failover; style.stroke-dash: 3 }
n1.ka -> n1.t: "2a. prüft /ping" { class: kontrolle; style.stroke-dash: 3 }
n2.ka -> n2.t: "prüft /ping" { class: kontrolle; style.stroke-dash: 3 }
n1.ka -> gw: "2b. chk_gateway pingt -- bei Ausfall Priorität 150 auf 90" { class: kontrolle; style.stroke-dash: 3 }
n1.ka -> n2.ka: "3. VRRP-Advertisements --\nbleiben sie aus, übernimmt der BACKUP" { class: kontrolle; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Clients und Port-Forward sprechen immer die VIP an; im Normalbetrieb hält sie der MASTER (Priorität 150 gegen 100). Adressen: [Hosts und IPs](../../_referenz/hosts-und-ips.md).
2. Zwei Checks steuern die VIP-Vergabe: Das VRRP-Script prüft Traefik über `/ping` -- stirbt nur der Traefik-Prozess, gibt der Node die VIP ebenfalls ab. `chk_gateway` pingt Pi-hole; fällt der Ping aus, sinkt die MASTER-Priorität von 150 auf 90 und der MASTER gibt die VIP ab ([Split-Brain-Prevention](#split-brain-prevention)).
3. Der MASTER sendet VRRP-Advertisements. Bleiben sie aus oder gibt er die VIP ab, übernimmt der BACKUP -- im Test innert ~4 s ([Failover-Test](./betrieb.md#failover-test)).
4. `nopreempt` verhindert automatisches Hin- und Herschwenken nach kurzen Ausfällen; das kontrollierte Failback ist eine Betriebsprozedur ([Failover-Test](./betrieb.md#failover-test)).
5. Nicht mit wandern: der CrowdSec-Banlisten-Stand -- der BACKUP arbeitet mit eigener, unabhängig aufgebauter Banliste ([Unabhängige Banlisten](../crowdsec/index.md#ausfallverhalten)). Die Zertifikate sind kein Failover-Thema: Beide Nodes halten eigene gültige `acme.json` ([SSL-Terminierung](#ssl-terminierung)).
6. Ein Ausfall der CrowdSec-Engine löst keinen VIP-Schwenk aus -- Keepalived prüft nur Traefik und das Gateway ([CrowdSec-Ausfallverhalten](../crowdsec/index.md#ausfallverhalten)).

### Split-Brain-Prevention

Drei Massnahmen verhindern, dass beide Nodes gleichzeitig die VIP halten:

**Gateway-Track-Script (`chk_gateway`):** Pingt Pi-hole DNS (10.0.2.1). Bei Ausfall sinkt die Priority des MASTER um 60 (von 150 auf 90, unter BACKUP's 100). Der MASTER gibt die VIP ab. Schützt gegen Netzwerk-Partitionen, bei denen VRRP-Heartbeats noch durchkommen, echter Traffic aber nicht.

**`nopreempt` auf beiden Nodes:** Ein Node übernimmt die VIP nur, wenn kein VRRP-Heartbeat mehr eintrifft, nicht allein wegen höherer Priority. Auf dem MASTER verhindert das ein sofortiges Zurückschwenken nach kurzem Ausfall, auf dem BACKUP eine sofortige Übernahme bei kurzzeitig erhöhtem Priority-Wert -- in beiden Fällen entsteht so kein Flapping.

**Atomarer Keepalived-Restart:** Das Ansible-Deployment startet Keepalived auf allen Hosts gleichzeitig (`serial: 0`, separater Play am Ende). Rolling-Restarts würden einen kurzen Auth-Mismatch erzeugen, bei dem MASTER und BACKUP unterschiedliche VRRP-Auth-Passwörter verwenden und beide gleichzeitig die VIP beanspruchen.

## SSL-Terminierung

Wildcard-Zertifikate für `*.ackermannprivat.ch` und `*.ackermann.systems` werden automatisch via Let's Encrypt (ACME, Cloudflare DNS Challenge, EC256) bezogen. Beide Nodes haben eigene `acme.json` mit gültigen Zertifikaten.

Der früher hier laufende `traefik-certs-dumper` (PEM-Export nach `/nfs/cert/`) ist mit dem NAS-Cutover 2026-06 abgelöst und entfernt -- er hatte keine Konsumenten mehr. Details: [TLS-Zertifikate](../../_referenz/tls-zertifikate.md).

TLS ist mit expliziten Cipher Suites und `minVersion: TLS 1.2` gehärtet. Details: [Traefik Referenz -- TLS-Options](./referenz.md#tls-options)

## Consul Catalog Integration

Traefik nutzt den Consul Catalog Provider für automatische Service Discovery. Nomad-Jobs registrieren sich in Consul und Traefik erkennt sie automatisch als Backend. Routing (Host-Regel, Middleware-Chain) erfolgt über Consul Service Tags im Nomad Job.

Für Standalone-Services (nicht in Nomad) wird der File-Provider verwendet (`services-external.yml`).

## Authentifizierung (Middlewares)

Authentifizierung läuft über Authentik als Identity Provider mit ForwardAuth. Vier Chains (intern-auth, intern-api, public-auth, public-noauth) decken die Zugriffsmuster ab. Vollständige Dokumentation: [Traefik Middleware Chains](./referenz.md)

## Security

CrowdSec läuft als natives Traefik-Plugin (`crowdsec-bouncer-traefik-plugin`, Stream-Modus) und blockiert automatisch IP-Adressen bei erkannten Angriffen. Details: [CrowdSec](../crowdsec/index.md)

## Deployment

Traefik wird per Ansible-Rolle `traefik-ha` deployed (rolling, serial: 1) via `standalone-stacks/traefik-ha/deploy.yml`.

Das Playbook:
1. Synchronisiert Templates (docker-compose, traefik.yml, keepalived.conf)
2. Synchronisiert dynamische Konfiguration aus `traefik-proxy/configurations/`
3. Startet Docker Compose Stack neu (rolling, serial: 1)
4. Verifiziert Traefik Health + Keepalived Status
5. Startet Keepalived auf allen Hosts gleichzeitig neu (serial: 0, verhindert Auth-Mismatch)

### Cloudflare-DDNS

Auf denselben beiden Traefik-VMs laufen im Docker-Compose-Stack zwei Cloudflare-DDNS-Container (`oznu/cloudflare-ddns`), je einer für die Zone `ackermannprivat.ch` und `ackermann.systems`. Sie halten die A-Records dieser Zonen auf der aktuellen WAN-IP -- die Voraussetzung dafür, dass die externen Namen ohne Cloudflare-Proxying direkt auf den Ingress zeigen ([Edge-Übersicht](../index.md#das-gesamtbild-in-zwei-pfaden)). Die Container gehören zum `traefik-ha`-Stack und werden über dasselbe Playbook ausgerollt, laufen aber bewusst ausserhalb von Nomad, damit der Ingress-Pfad nicht von der Cluster-Plattform abhängt. Definiert sind sie im Compose-Template `standalone-stacks/traefik-ha/templates/docker-compose.yml.j2`. Den Monitoring-Stand dieses Bausteins führt die [Monitoring-Coverage](../../monitoring/coverage/index.md).

### Härtungen (aktiv auf vm-traefik-01 + vm-traefik-02)

- Docker Provider eliminiert (kein `docker.sock`-Mount)
- Images gepinnt (Versionen im Docker Compose Stack)
- VRRP-Authentifizierung aktiv (keepalived `auth_pass`)
- Dashboard-Port 8080 nur auf localhost gebunden
- CrowdSec als natives Traefik-Plugin (kein separater ForwardAuth-Bouncer)

### Konfigurationsstruktur

Die dynamische Config wird live geladen (`watch: true`). Die Quelldateien liegen unter `standalone-stacks/traefik-proxy/configurations/` und werden per Ansible synchronisiert. Vollständige Dateiliste: [Konfigurationsdateien](./referenz.md#konfigurationsdateien).

### Statische Konfiguration

Template: `standalone-stacks/traefik-ha/templates/traefik.yml.j2` → deployed nach `/opt/traefik/traefik.yml` (Modus 0600, enthält Consul-Token).

## Storage (lokal, kein NFS)

Traefik nutzt ausschliesslich lokalen Storage. NFS für den Reverse Proxy ist ein Anti-Pattern (Boot-Abhängigkeit, inotify funktioniert nicht über NFS).

| Pfad | Inhalt |
|------|--------|
| `/opt/traefik/traefik.yml` | Statische Konfiguration (readonly, 0600) |
| `/opt/traefik/acme/acme.json` | Let's Encrypt Zertifikate (read-write, 0600) |
| `/opt/traefik/configurations/` | Dynamische Config (readonly) |

`acme.json` wird bei Verlust automatisch neu generiert (Let's Encrypt stellt innerhalb von Minuten neu aus).

::: warning Traefik startet nicht nach Reboot
Falls Traefik nach einem Reboot nicht läuft: Docker Compose Stack manuell starten. Danach Authentik-Outpost prüfen -- er braucht Traefik für OIDC Discovery.
:::

## Verwandte Seiten

- [Traefik Middleware Chains](./referenz.md) -- Vollständige Middleware-Dokumentation
- [Traefik Betrieb](./betrieb.md) -- Failover-, Failback- und Split-Brain-Prozeduren
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking und Threat Intelligence
- [DNS-Architektur](../../netz/dns/index.md) -- DNS-Auflösung für *.ackermannprivat.ch
- [Authentik](../authentik/index.md) -- Identity Provider für ForwardAuth
- [Netzwerk-Topologie](../../netz/netzwerk/index.md) -- Netzwerkarchitektur und Routing
