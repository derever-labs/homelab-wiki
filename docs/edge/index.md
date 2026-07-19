---
title: Ingress, Auth und Edge
description: Big Picture des Zugriffspfads ins Homelab -- wie Traefik, CrowdSec, Authentik und Cloudflare-DNS beim externen und internen Zugriff zusammenspielen
tags:
  - overview
  - edge
  - security
---

# Ingress, Auth und Edge

Jeder Web-Zugriff aufs Homelab läuft über denselben Edge: Cloudflare löst die Namen extern auf (reines DNS, kein Proxying, kein Tunnel), der UDM Pro forwarded 80/443 auf die keepalived-VIP des Traefik-HA-Paars, Traefik terminiert TLS und routet -- und zwei Wächter entscheiden unterwegs, wer durchkommt: der CrowdSec-Bouncer auf IP-Ebene und Authentik auf Identitäts-Ebene. Diese Seite ist das Big Picture: zwei Szenario-Diagramme zeigen den Request-Pfad und die Kontrollkanäle, der Abschnitt [Ausfallverhalten](#ausfallverhalten) beantwortet die Was-wenn-Fragen.

Die Mechanik der einzelnen Systeme steht auf den Systemseiten: [Traefik](./traefik/) (Routing, HA, Middleware-Chains), [CrowdSec](./crowdsec/) (Detection und Enforcement), [Authentik](./authentik/) (Flows, Outposts, Sicherheit) und [LDAP im Homelab](./ldap.md) (Bind-Interface für Jellyfin).

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Eintrittspunkt | Keepalived-VIP auf dem Traefik-HA-Paar -- [Hosts und IPs](../_referenz/hosts-und-ips.md) |
| DNS extern | Cloudflare-Zonen, nur Namensauflösung auf die WAN-IP (kein Proxying) |
| DNS intern | Pi-hole Split-DNS direkt auf die VIP -- [DNS-Architektur](../netz/dns/) |
| Deployment | Traefik + CrowdSec: Docker Compose auf beiden Traefik-VMs (Ansible `traefik-ha`); Authentik: Nomad Job `identity/authentik.nomad` |

### Systeme

| System | Rolle im Zugriffspfad |
| :--- | :--- |
| [Traefik](./traefik/) | Reverse Proxy -- TLS-Terminierung, Routing, Middleware-Chains, HA-Paar hinter der VIP |
| [CrowdSec](./crowdsec/) | Intrusion Prevention -- Bouncer als erste Middleware der public-Chains, blockt gebannte IPs mit 403 |
| [Authentik](./authentik/) | Identity Provider -- ForwardAuth via Proxy-Outpost, OIDC für native Apps, SSO |
| [LDAP-Outpost](./ldap.md) | Bind-Interface für Services ohne OAuth-Support (Jellyfin) |

## Das Gesamtbild in zwei Pfaden

Der Edge beantwortet zwei Fragen, und jede hat ihr eigenes Diagramm: Der **Request-Pfad** zeigt, wie ein Aufruf vom Client zum Backend kommt und wer ihn unterwegs stoppen darf. Die **Kontrollkanäle** zeigen, woher die Entscheider ihr Wissen beziehen -- Routen, Banlisten, Sessions und Zertifikate.

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten sind synchrone Requests (der Initiator wartet auf die Antwort), gestrichelte Kanten sind asynchrone Kontroll- und Datenflüsse. Farben kodieren den Weg: Blau der externe und Grün der interne Zugriffsweg, Violett die Auth-Entscheidung, Ocker die CrowdSec-Kanäle, Orange die Authentik-Kontrollkanäle.

### Request-Pfad -- vom Client zum Backend

**Leitfrage:** Wie kommt ein externer Request zu einem Service -- und wer darf ihn unterwegs stoppen?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  extpfad: { style: { stroke: "#2563eb"; font-color: "#2563eb" } }
  intpfad: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  auth: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  neutral: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

extern: Externer Client { class: node }
cf: Cloudflare DNS {
  class: node
  tooltip: Zonen ackermannprivat.ch und ackermann.systems -- reine Namensauflösung, kein Proxying, kein Tunnel
}
udm: UDM Pro { class: node }

intern: Interner Client {
  class: node
  tooltip: LAN und Tailscale
}
pihole: Pi-hole {
  class: node
  tooltip: Split-DNS -- antwortet für die Homelab-Domains direkt mit der Traefik-VIP
}

traefik: Aktiver Traefik-Node (via VIP) {
  class: container
  tooltip: vm-traefik-01 oder vm-traefik-02 -- keepalived hält die VIP auf genau einem Node

  tls: TLS-Terminierung {
    class: node
    tooltip: Wildcard-Zertifikate via ACME DNS-01
  }
  bouncer: CrowdSec-Bouncer {
    class: node
    tooltip: Erste Middleware der public-Chains -- entscheidet lokal gegen den Banlisten-Cache
  }
  fa: ForwardAuth-Middleware { class: node }
}

outpost: Authentik Proxy-Outpost {
  class: node
  tooltip: prüft Sessions lokal -- 200 mit Identitäts-Headern oder 302 zum Login
}
backend: Backend-Service { class: node }

extern -> cf: 1. DNS -- Antwort ist die WAN-IP { class: neutral; style.stroke-dash: 3 }
extern -> udm: 2. HTTPS auf die WAN-IP { class: extpfad }
udm -> traefik.tls: "3. Port-Forward 80/443\nauf die VIP" { class: extpfad }
intern -> pihole: A. DNS -- Antwort ist die VIP { class: intpfad; style.stroke-dash: 3 }
intern -> traefik.tls: "B. HTTPS direkt\nauf die VIP" { class: intpfad }
traefik.tls -> traefik.bouncer: 4. public-Chain -- Bouncer zuerst { class: extpfad }
traefik.bouncer -> traefik.fa: 5. nicht gebannt -- weiter { class: extpfad }
traefik.fa -> outpost: 6. ForwardAuth-Subrequest -- 200 oder 302 { class: auth }
traefik.fa -> backend: "7. Request mit\nX-authentik-Headern" { class: extpfad }
```

Lesehilfe:

1. Extern löst Cloudflare den Namen auf: Der A-Record zeigt direkt auf die WAN-IP -- Cloudflare macht reine Namensauflösung, kein Proxying und kein Tunnel, TLS endet erst bei Traefik ([SSL-Terminierung](./traefik/index.md#ssl-terminierung)). Die wechselnde WAN-IP halten zwei Cloudflare-DDNS-Container auf den Traefik-VMs aktuell ([Cloudflare-DDNS](./traefik/index.md#cloudflare-ddns)).
2. Der UDM Pro forwarded 80/443 auf die VIP; keepalived hält sie auf genau einem der beiden Traefik-Nodes ([Hochverfügbarkeit](./traefik/index.md#hochverfugbarkeit-keepalived)).
3. Interne Clients nehmen die Abkürzung: Pi-hole antwortet für die Homelab-Domains direkt mit der VIP ([DNS-Kette](../netz/dns/index.md#dns-kette)) -- derselbe Traefik, nur ohne WAN-Schleife.
4. Erster Stopper: Der CrowdSec-Bouncer ist die erste Middleware aller public-Chains und beantwortet gebannte IPs sofort mit 403 -- die Entscheidung fällt lokal gegen den Banlisten-Cache, ohne API-Call ([Enforcement](./crowdsec/index.md#enforcement-synchroner-request-pfad)). Interne Netze prüft er nie; die intern-Chains ersetzen ihn durch eine IP-Allowlist ([Middleware Chains](./traefik/referenz.md#middleware-chains)).
5. Zweiter Stopper: Die ForwardAuth-Middleware fragt pro Request den Authentik Proxy-Outpost -- die Antwort ist 200 mit Identitäts-Headern oder 302 zur Login-Seite. Die vollständige Sequenz inklusive Callback-Route zeigt der [Login-Ablauf ohne Session](./authentik/index.md#login-ablauf-ohne-session); die Login-Route selbst schützen Rate-Limit und CrowdSec statt einer IP-Allowlist ([Integration mit Traefik](./authentik/index.md#integration-mit-traefik)).
6. Eingeloggt heisst nicht durch: Jede App hat eine explizite Gruppen-Bindung im 3-Tier-Modell admin/family/guest ([Gruppen und Bindings](./authentik/gruppen-bindings.md)).
7. Erst danach erreicht der Request das Backend -- die X-authentik-Header sind dessen einzige Identitätsquelle. OIDC-Apps und Jellyfin (LDAP) machen ihren Login selbst, der Weg über Traefik bleibt derselbe ([Authentik-Architektur](./authentik/index.md#architektur)).

### Kontrollkanäle -- woher die Entscheider ihr Wissen beziehen

**Leitfrage:** Woher wissen Router, Bouncer und Outposts, was sie entscheiden müssen -- und welche Kontrollkanäle laufen selbst wieder über Traefik?

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  crowdsec: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
  authkanal: { style: { stroke: "#ea580c"; font-color: "#ea580c" } }
  neutral: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

consul: Consul Catalog {
  class: node
  tooltip: Service-Discovery -- Nomad-Jobs bringen Host-Regel und Chain als Consul-Tags mit
}
acme: ACME (Cloudflare DNS-01) {
  class: node
  tooltip: Wildcard-Zertifikate von Let's Encrypt -- Challenge über die Cloudflare-Zonen
}
cscloud: CrowdSec Cloud {
  class: node
  tooltip: CAPI und Console (app.crowdsec.net)
}

tnode: Traefik-Node {
  class: container
  tooltip: beide Nodes betreiben je ein eigenes unabhängiges Paar -- Banlisten werden nicht synchronisiert

  traefik: Traefik (mit Bouncer) { class: node }
  engine: CrowdSec Engine { class: node }
}

ak: Authentik-Job {
  class: container

  server: Server { class: node }
  proxy: Proxy-Outpost { class: node }
  ldap: LDAP-Outpost { class: node }
}

tnode.traefik -> consul: 1. pollt Service-Katalog -- Routen aus Tags { class: neutral; style.stroke-dash: 3 }
tnode.engine -> tnode.traefik: 2. liest Access-Logs (Docker-Socket) { class: crowdsec; style.stroke-dash: 3 }
tnode.traefik -> tnode.engine: 3. Bouncer pollt Ban-Decisions alle 15s { class: crowdsec; style.stroke-dash: 3 }
tnode.engine -> cscloud: 4. meldet Signale, holt Community-Blocklist { class: crowdsec; style.stroke-dash: 3 }
tnode.traefik -> acme: 5. erneuert Wildcard-Zertifikate { class: neutral; style.stroke-dash: 3 }
ak.proxy -> ak.server: 6. Kontrollkanal und Code-Exchange -- direkt via Node-IP { class: authkanal; style.stroke-dash: 3 }
ak.ldap -> tnode.traefik: 7. Kontrollkanal nur über Traefik { class: authkanal; style.stroke-dash: 3 }
tnode.traefik -> ak.server: 8. Router authentik -- weiter zum Server { class: authkanal; style.stroke-dash: 3 }
```

Lesehilfe:

1. Traefik baut seine Routen selbst: Beide Nodes pollen den Consul-Katalog, Nomad-Services bringen Host-Regel und Middleware-Chain als Consul-Tags mit; Standalone-Services liefert der File-Provider ([Consul Catalog Integration](./traefik/index.md#consul-catalog-integration)).
2. Die CrowdSec-Engine liest die Traefik-Access-Logs über den Docker-Socket ab -- Traefik selbst weiss nichts von CrowdSec ([Detection](./crowdsec/index.md#detection-asynchroner-datenfluss)).
3. Der Bouncer holt Ban-Decisions alle 15 Sekunden per Stream-Poll bei der Engine seines eigenen Nodes -- deshalb blockt er im Request-Pfad ohne API-Call. Die beiden Node-Paare sind vollständig unabhängig, Banlisten werden nicht synchronisiert ([CrowdSec-Ausfallverhalten](./crowdsec/index.md#ausfallverhalten)).
4. Die Engine meldet bestätigte Angriffe als Signale an die CrowdSec Cloud und bezieht im Gegenzug die Community-Blocklist.
5. Die Wildcard-Zertifikate erneuert jeder Node selbst via ACME DNS-01-Challenge gegen die Cloudflare-Zonen -- beide führen eine eigene `acme.json` ([SSL-Terminierung](./traefik/index.md#ssl-terminierung)).
6. Der Proxy-Outpost spricht den Authentik-Server direkt über die Node-IP an -- sein Kontrollkanal und der Code-Exchange hängen nicht an Traefik.
7. Der LDAP-Outpost dagegen erreicht den Server nur über Traefik und auth.ackermannprivat.ch -- die dokumentierte Asymmetrie der beiden Outposts: Ohne Traefik beantwortet er nur noch gecachte Binds ([LDAP im Homelab](./ldap.md#architektur)).

## Ausfallverhalten

Die Ausfall-Fragen, die das Big Picture beantworten muss -- je mit dem Mechanismus, der den Schaden begrenzt:

- **Was, wenn der aktive Traefik-Node stirbt?** Keepalived prüft Traefik über `/ping`; fällt es aus, schwenkt die VIP zum BACKUP-Node (`nopreempt` und Gateway-Track verhindern Flapping und Split-Brain -- [Hochverfügbarkeit](./traefik/index.md#hochverfugbarkeit-keepalived)). Benutzer-Sessions überleben den Schwenk, denn sie liegen im Proxy-Outpost, nicht auf den Traefik-Nodes. Nicht mit hinüber wandern die CrowdSec-Bans: Der BACKUP arbeitet mit eigener, unabhängig aufgebauter Banliste ([Unabhängige Banlisten](./crowdsec/index.md#ausfallverhalten)).

- **Was, wenn eine CrowdSec-Engine stirbt?** Der Bouncer dieses Nodes kippt fail-closed: Nach spätestens 15 Sekunden bekommt jeder externe Request 403, interne Netze bleiben ausgenommen. Keepalived merkt davon nichts und schwenkt die VIP nicht -- die Engine ist pro Node ein SPOF für den externen Zugriff ([CrowdSec-Ausfallverhalten](./crowdsec/index.md#ausfallverhalten)).

- **Was, wenn der Authentik Proxy-Outpost stirbt?** ForwardAuth liefert 500, und weil `error-pages` in den Chains vor `authentik-forward-auth` steht, sehen Benutzer die Wartungsseite statt eines rohen Fehlers ([Middleware Chains](./traefik/referenz.md#middleware-chains)).

- **Was, wenn der Authentik-Server stirbt?** Keine neuen Logins -- weder ForwardAuth noch OIDC noch LDAP-Erstlogins. Bestehende ForwardAuth-Sessions laufen weiter, der Outpost prüft sie rein lokal ohne Server-Roundtrip ([Login-Ablauf ohne Session](./authentik/index.md#login-ablauf-ohne-session)). Dasselbe Bild, wenn PostgreSQL fehlt: Ohne PG steht Authentik ganz.

- **Was, wenn beide Traefik-Nodes weg sind?** Dann ist der Edge komplett zu -- extern wie intern, denn auch Split-DNS zeigt auf die VIP. Mit weg ist der LDAP-Kontrollkanal: Jellyfin-Erstlogins scheitern, gecachte Binds antworten weiter aus dem Outpost-RAM ([LDAP im Homelab](./ldap.md#architektur)). Nach einem Traefik-Neustart den Authentik-Outpost prüfen -- er braucht Traefik für die OIDC-Discovery ([Traefik](./traefik/index.md)).

## Verwandte Seiten

- [Traefik](./traefik/) -- Reverse Proxy, HA-Setup, SSL-Terminierung, Deployment
- [Traefik Middleware Chains](./traefik/referenz.md) -- Chains, error-pages, Rate-Limits, TLS-Options
- [Traefik Betrieb](./traefik/betrieb.md) -- Failover-, Failback- und Split-Brain-Prozeduren
- [CrowdSec](./crowdsec/) -- Enforcement, Detection und Ausfallverhalten im Detail
- [Authentik](./authentik/) -- Identity Provider, Outposts, Login-Abläufe
- [Authentik Gruppen und Bindings](./authentik/gruppen-bindings.md) -- 3-Tier-Zugriffskontrolle
- [LDAP im Homelab](./ldap.md) -- LDAP-Outpost als Bind-Interface für Jellyfin
- [DNS-Architektur](../netz/dns/) -- Split-DNS, Pi-hole und die DNS-Kette
- [Netzwerk-Topologie](../netz/netzwerk/) -- Router, VLANs und Standorte
- [Sicherheit](../_querschnitt/security/index.md) -- Gesamte Security-Architektur
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
