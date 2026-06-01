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

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  legacy: { style: { border-radius: 8; stroke-dash: 2; opacity: 0.55 } }
}

direction: down

Services: Services {
  class: container

  JF: Jellyfin {
    class: node
    tooltip: "LDAP-Plugin bindet gegen Outpost -- kein OAuth-Flow"
  }
  OIDC: "OIDC-Clients\n(Grafana, Gitea, Proxmox)" {
    class: node
    tooltip: "Native OpenID-Connect-Integration"
  }
  FWD: "ForwardAuth-Services\n(alle anderen Web-UIs)" {
    class: node
    tooltip: "Traefik Middleware-Chain mit Authentik Proxy Outpost"
  }
}

Outpost: LDAP Outpost {
  class: node
  tooltip: "authentik-ldap.service.consul:3389 -- Go-Prozess im Authentik Nomad Job"
}

Store: Authentik (Identity Store) {
  class: container

  AK: Authentik Server {
    class: node
    tooltip: "FlowExecutor, Policy Engine, OIDC Provider, API"
  }
  PG: PostgreSQL {
    class: node
    shape: cylinder
    tooltip: "postgres.service.consul -- User, Gruppen, Policies"
  }
  AK -> PG: "User-Lookup"
}

Legacy: Legacy (inaktiv) {
  class: container

  OLDAP: "OpenLDAP (ldap Job)" {
    class: legacy
    tooltip: "Nomad Job databases/open-ldap.nomad -- kein aktiver Consumer"
  }
}

Services.JF -> Outpost: "LDAP Simple Bind" {
  style.stroke: "#7c3aed"
}
Outpost -> Store.AK: "Flow Executor\n+ check_access + users/me" {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
}
Services.OIDC -> Store.AK: "OIDC Token Exchange" {
  style.stroke: "#2563eb"
  style.stroke-dash: 3
}
Services.FWD -> Store.AK: "ForwardAuth" {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
```

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
- Guacamole hat zwar die `auth-ldap`-Extension geladen, aber keine `LDAP_HOSTNAME`-Konfiguration -- die effektive Authentifizierung läuft über `intern-auth@file` (ForwardAuth)

## Verwandte Seiten

- [Authentik](../authentik/index.md) -- Identity Provider und Stack-Einbindung
- [Authentik Referenz -- LDAP Authentication Flow](../authentik/referenz.md#ldap-authentication-flow) -- Stages, Cache, Sequenz-Diagramm
- [Jellyfin](../jellyfin/index.md) -- einziger aktiver LDAP-Consumer
- [Sicherheit](../security/index.md) -- Authentifizierungskonzept und Zugriffsgruppen
- [Traefik Referenz](../traefik/referenz.md) -- ForwardAuth und Middleware-Chains
