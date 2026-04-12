---
title: Vault
description: Zentrales Secrets Management für den Nomad-Cluster
tags:
  - platform
  - hashicorp
  - vault
  - secrets
---

# Vault

## Übersicht

Vault ist das zentrale Secrets Management. Alle Passwörter, Tokens und API-Keys werden hier gespeichert und versioniert.

| Attribut | Wert |
|----------|------|
| Deployment | Ansible + Systemd (3-Node Raft Cluster) |
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Rolle im Stack

Vault ist das zentrale Secrets Management. Alle Passwörter, Tokens und API-Keys werden hier gespeichert und versioniert. Kein Service im Cluster speichert Secrets lokal -- alles kommt aus Vault. Nomad Jobs authentifizieren sich über Workload Identity (JWT) und erhalten Secrets zur Laufzeit, ohne dass statische Tokens in Job-Definitionen stehen.

::: danger Kritischer Service
Bei Vault-Ausfall können laufende Dienste keine Secrets mehr erneuern und neue Jobs nicht starten (Workload Identity schlägt fehl). Vault benötigt mindestens 2 von 3 Servern für Quorum.
:::

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
}

direction: right

raft: Vault Raft Cluster {
  class: container

  V1: vm-nomad-server-04 {
    class: node
    tooltip: "10.0.2.104 | Port 8200 (API) / 8201 (Cluster)"
  }
  V2: vm-nomad-server-05 {
    class: node
    tooltip: "10.0.2.105 | Port 8200 (API) / 8201 (Cluster)"
  }
  V3: vm-nomad-server-06 {
    class: node
    tooltip: "10.0.2.106 | Port 8200 (API) / 8201 (Cluster)"
  }

  V1 <-> V2: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8201 | Datenreplikation und Leader Election"
  }
  V2 <-> V3: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8201 | Datenreplikation und Leader Election"
  }
  V3 <-> V1: Raft {
    style.stroke: "#6b7280"
    tooltip: "Port 8201 | Datenreplikation und Leader Election"
  }
}

Nomad: Nomad Server {
  class: node
  tooltip: "Stellt JWT fuer Workload Identity aus"
}

NJ: Nomad Task {
  class: node
  tooltip: "Container mit vault-Stanza und identity-Block"
}

Consul: Consul {
  class: node
  tooltip: "Service Discovery fuer active.vault"
}

Nomad -> NJ: JWT ausstellen {
  style.stroke: "#6b7280"
}
NJ -> raft: JWT vorzeigen (HTTP :8200) {
  style.stroke: "#7c3aed"
  tooltip: "Task authentifiziert sich mit dem JWT"
}
raft -> NJ: Secret (KV v2) {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
  tooltip: "Vault liefert Secrets aus dem Job-spezifischen KV-Pfad"
}
raft -> Consul: Service registrieren {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
  tooltip: "Vault registriert sich als active/standby in Consul"
}
```

Vault läuft als 3-Node Raft Cluster. Jeder Server führt einen eigenen Vault-Prozess aus. Die Leader-Election erfolgt über das Raft-Konsensprotokoll: es gibt immer genau einen Leader, die anderen beiden sind Standby-Nodes.

Daten werden automatisch zwischen allen drei Nodes repliziert. Bei einem Schreibvorgang muss der Leader die Bestätigung von mindestens einem weiteren Node erhalten (Quorum), bevor der Vorgang als erfolgreich gilt.

## Designentscheide

| Entscheidung | Begründung |
|-------------|-------------|
| Integrated Storage (Raft) statt Consul-Backend | Weniger Abhängigkeiten: Vault verwaltet seinen eigenen Zustand |
| TLS deaktiviert | Homelab-Entscheidung: kein Expiry-Risiko |
| Auto-Unseal Service | Minimiert manuelle Eingriffe nach Neustarts oder Stromausfällen |
| KV v2 Secret Engine | Versionierung von Secrets, Soft-Delete möglich |

## Workload Identity

Nomad-Jobs authentifizieren sich bei Vault über JWT-basierte Workload Identity. Dadurch brauchen Jobs keine statischen Tokens -- die Identität ergibt sich aus dem Job selbst.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Nomad: Nomad Server {
  class: node
  tooltip: "Stellt beim Task-Start automatisch ein signiertes JWT aus (Workload Identity)"
}

Task: Nomad Task {
  class: node
  tooltip: "Container mit vault-Stanza und identity-Block (env = true, file = true)"
}

Vault: Vault {
  class: node
  tooltip: "JWT Auth Method validiert die Signatur gegen Nomads JWKS-Endpoint"
}

KV: KV v2 Secret Engine {
  class: node
  tooltip: "Pfad-Konvention: kv/data/JOB_ID -- Policy nomad-workloads beschraenkt Zugriff auf eigenen Pfad"
}

# 1. JWT ausstellen
Nomad -> Task: 1. JWT ausstellen (Workload Identity) {
  style.stroke: "#6b7280"
}

# 2. JWT an Vault vorzeigen
Task -> Vault: 2. JWT vorzeigen (HTTP :8200) {
  style.stroke: "#7c3aed"
  tooltip: "Task authentifiziert sich mit dem JWT -- kein statischer Token noetig"
}

# 3. Vault validiert und gibt Token
Vault -> Task: 3. Vault Token (Policy: nomad-workloads) {
  style.stroke-dash: 3
  style.stroke: "#7c3aed"
  tooltip: "Vault prueft JWT-Signatur via Nomad JWKS, dann Token mit eingeschraenkter Policy"
}

# 4. Secrets lesen
Task -> KV: 4. kv/data/JOB_ID lesen {
  style.stroke: "#2563eb"
  tooltip: "Task liest nur Secrets unter seinem eigenen Job-Pfad"
}

# 5. Secret-Werte zurueck
KV -> Task: 5. Secret-Werte {
  style.stroke-dash: 3
  style.stroke: "#16a34a"
}
```

Jeder Task, der Vault-Secrets benötigt, braucht eine `vault {}` Stanza und einen `identity` Block mit `env = true` und `file = true`. Technische Details zu Auth Methods, JWKS URL und Policies: [Vault Referenz](referenz.md)

::: warning Pfad-Konvention
Secrets für einen Nomad-Job liegen immer unter `kv/<job_id>`. Der Job `postgres-linstor` liest also aus `kv/postgres`. Diese Konvention ist in der Policy festgelegt und darf nicht abgeändert werden.
:::

## Verwandte Seiten

- [Vault Referenz](referenz.md) -- Auth Methods, Policies, Secret-Pfade
- [Vault Betrieb](betrieb.md) -- Unseal, Secret-Verwaltung, Troubleshooting
- [Nomad](../nomad/) -- Workload Scheduler mit Vault-Integration
- [Consul](../consul/) -- Service Discovery im selben Cluster
