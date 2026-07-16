---
title: LDAP im Homelab
description: Übersicht über LDAP-Schichten -- Authentik als Identity Store, LDAP Outpost als Bind-Interface für Jellyfin
tags:
  - identity
  - ldap
  - authentik
---

# LDAP im Homelab

LDAP ist im Homelab **kein eigenständiges Identity-System mehr**. User, Gruppen und Credentials leben ausschliesslich in [Authentik](../authentik/index.md). Der Begriff "LDAP" taucht trotzdem an zwei Stellen auf:

- **Authentik LDAP Outpost** -- stellt ein LDAP-Bind-Interface bereit, damit Services wie Jellyfin ohne OAuth-Flow gegen Authentik authentifizieren können
- **OpenLDAP (Legacy)** -- ehemaliger zentraler Verzeichnisdienst, Nomad Job läuft noch, hat aber keinen aktiven Consumer mehr

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `identity/authentik.nomad`, Task `ldap` |
| Storage | [Authentik](../authentik/index.md) -- PostgreSQL-Backend (`postgres.service.consul`) |

## Rolle im Stack

LDAP ist im Homelab ein Kompatibilitäts-Shim: Authentik ist der einzige Identity Store (User, Gruppen, Policies in PostgreSQL). Der LDAP Outpost übersetzt eingehende Bind-Requests von Services ohne OAuth-Support in Authentik-Flow-Calls. OIDC- und ForwardAuth-Services berühren LDAP nicht. OpenLDAP läuft noch als inaktiver Legacy-Job ohne Consumer.

## Architektur

**Leitfragen:** Welche Rolle spielt LDAP noch, wenn Authentik der einzige Identity Store ist? Wovon hängt der LDAP-Weg im Betrieb ab?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  legacy: { style: { border-radius: 8; stroke-dash: 2; opacity: 0.55 } }
}

direction: down

JF: Jellyfin {
  class: node
  tooltip: "LDAP-Plugin -- einziger aktiver LDAP-Consumer"
}

Outpost: LDAP-Outpost {
  class: node
  tooltip: "authentik-ldap.service.consul:3389 -- Go-Prozess im Authentik-Nomad-Job, Bind- und Search-Cache im RAM"
}

Traefik: Traefik {
  class: node
  tooltip: "Der Outpost erreicht den Authentik-Server nur über auth.ackermannprivat.ch -- ohne Traefik keine Cache-Miss-Logins"
}

Store: Authentik (Identity Store) {
  class: container

  AK: Authentik-Server {
    class: node
    tooltip: "FlowExecutor, Policy Engine, API"
  }
  PG: PostgreSQL {
    class: node
    shape: cylinder
    tooltip: "postgres.service.consul -- User, Gruppen, Policies"
  }
}

Legacy: Legacy (inaktiv) {
  class: container

  OLDAP: "OpenLDAP (ldap-Job)" {
    class: legacy
    tooltip: "Nomad-Job databases/open-ldap.nomad -- kein aktiver Consumer"
  }
}

JF -> Outpost: "1. LDAP Simple Bind Port 3389\nbei jedem Jellyfin-Login" { style.stroke: "#7c3aed" }
Outpost -> Traefik: "2. nur bei Cache-Miss -- Flow-Execute,\ncheck_access und users/me\nvia auth.ackermannprivat.ch" { style.stroke: "#7c3aed" }
Traefik -> Store.AK: "3. Router authentik" { style.stroke: "#7c3aed" }
Store.AK -> Store.PG: "4. User-Lookup und\nArgon2-Prüfung" { style.stroke: "#854d0e" }
Outpost -> Traefik: "Kontrollkanal --\ngleicher Weg" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
```

**Lesehilfe:**

1. Der Outpost ist ein Protokoll-Shim: LDAP rein, Authentik-Flow raus. User, Gruppen und Hashes leben ausschliesslich in PostgreSQL ([LDAP Outpost](#ldap-outpost)).
2. Schritt 2 läuft nur bei Cache-Miss. Gecachte Binds beantwortet der Outpost aus dem RAM in unter 5 ms.
3. Der Weg zum Server führt über Traefik und auth.ackermannprivat.ch. Traefik down heisst: Cache-Hits laufen weiter, Erstlogins scheitern.
4. Auch Registrierung und Config-Abruf des Outposts laufen über denselben Weg (gestrichelte Kante).
5. OpenLDAP läuft nur noch als Legacy-Job ohne Consumer ([OpenLDAP (Legacy)](#openldap-legacy)).
6. Die vollständige Login-Sequenz mit Hit- und Miss-Pfad: [Authentik Referenz](../authentik/referenz.md#ldap-authentication-flow).
7. OIDC- und ForwardAuth-Services berühren LDAP nicht, deren Wege zeigt die [Authentik-Übersicht](../authentik/index.md#architektur).

## LDAP Outpost

Der LDAP Outpost ist ein Task im [Authentik Nomad Job](../authentik/index.md#komponenten) und bietet Services ein klassisches LDAP-Bind-Interface. Intern übersetzt er jeden Bind in einen Authentik-Flow-Execute-Call und cached das Ergebnis im RAM.

- **Cached Bind + Cached Search Mode** -- erster Login durchläuft den vollen Authentik-Flow (~1-2s), jeder weitere Bind desselben Users antwortet aus dem Outpost-RAM (<5ms)
- **Eigener Flow** -- der Outpost verwendet `ldap-authentication-flow` (Identification → Password → User-Login) ohne MFA, damit native Jellyfin-Clients ohne Browser funktionieren
- **Reputation-Policy** -- Brute-Force-Schutz auf der Password-Stage (Threshold −3 auf Username + IP)

Vollständige Flow-Dokumentation inklusive Stages, Cache-Verhalten und Sequenz-Diagramm: [Authentik Referenz -- LDAP Authentication Flow](../authentik/referenz.md#ldap-authentication-flow).

## Wie Services authentifizieren

Im Homelab nutzt nur ein Service LDAP: [Jellyfin](../jellyfin/index.md) bindet via LDAP-Plugin gegen den Outpost (`authentik-ldap.service.consul:3389`, Base DN `DC=ldap,DC=ackermannprivat,DC=ch`). OIDC- und ForwardAuth-Services verwenden kein LDAP -- Details zu allen drei Authentifizierungswegen: [Authentik](../authentik/index.md).

## OpenLDAP (Legacy)

Der Nomad Job `databases/open-ldap.nomad` (`osixia/openldap`, Port 389) läuft noch auf `vm-nomad-client-05`, hat aktuell aber keinen Consumer:

- Authentik nutzt OpenLDAP **nicht** mehr als Source -- User leben in der Authentik-PostgreSQL
- Jellyfin bindet gegen den LDAP Outpost (`authentik-ldap.service.consul:3389`), nicht gegen OpenLDAP

## Verwandte Seiten

- [Authentik](../authentik/index.md) -- Identity Provider und Stack-Einbindung
- [Authentik Referenz -- LDAP Authentication Flow](../authentik/referenz.md#ldap-authentication-flow) -- Stages, Cache, Sequenz-Diagramm
- [Jellyfin](../jellyfin/index.md) -- einziger aktiver LDAP-Consumer
- [Sicherheit](../security/index.md) -- Authentifizierungskonzept und Zugriffsgruppen
- [Traefik Referenz](../traefik/referenz.md) -- ForwardAuth und Middleware-Chains
