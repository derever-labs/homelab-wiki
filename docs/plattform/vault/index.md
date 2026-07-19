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
| Storage | Integrated Storage (Raft), repliziert über alle 3 Nodes |
| Seal | Shamir (3 Key-Shares, Threshold 2) |
| API-Zugang | HTTPS über `vault.service.consul:8200` (private CA) |
| Workload-Auth | Nomad Workload Identity (JWT), kein statischer Token |

## Rolle im Stack

Kein Service im Cluster speichert Secrets lokal -- alles kommt aus Vault. Nomad Jobs authentifizieren sich über Workload Identity (JWT) und erhalten Secrets zur Laufzeit, ohne dass statische Tokens in Job-Definitionen stehen.

::: danger Kritischer Service
Bei Vault-Ausfall können laufende Dienste keine Secrets mehr erneuern und neue Jobs nicht starten (Workload Identity schlägt fehl). Vault benötigt mindestens 2 von 3 Servern für Quorum.
:::

## Architektur

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

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

clients: Vault-Clients {
  class: node
  tooltip: "Nomad Tasks (Workload Identity, Ablauf siehe unten), Admin-CLI"
}

Consul: Consul {
  class: node
  tooltip: "Service Discovery: vault.service.consul und active.vault"
}

clients -> raft: HTTPS :8200 {
  style.stroke: "#7c3aed"
  tooltip: "Zugriff über vault.service.consul -- kein fest verdrahteter Node"
}
raft -> Consul: registriert active/standby {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
  tooltip: "Jeder Node meldet seinen Zustand, Consul löst auf den aktiven Leader auf"
}
```

Vault läuft als 3-Node Raft Cluster. Jeder Server führt einen eigenen Vault-Prozess aus. Die Leader-Election erfolgt über das Raft-Konsensprotokoll: es gibt immer genau einen Leader, die anderen beiden sind Standby-Nodes.

Daten werden automatisch zwischen allen drei Nodes repliziert. Bei einem Schreibvorgang muss der Leader die Bestätigung von mindestens einem weiteren Node erhalten (Quorum), bevor der Vorgang als erfolgreich gilt.

## Designentscheide

| Entscheidung | Begründung |
|-------------|-------------|
| Integrated Storage (Raft) statt Consul-Backend | Weniger Abhängigkeiten: Vault verwaltet seinen eigenen Zustand |
| Shamir Seal statt Cloud-/Transit-Auto-Unseal | Self-Hosted ohne externen KMS -- die Seal-Keys bleiben lokal auf den Nodes, keine Abhängigkeit von einem Cloud-Anbieter. Das Entsiegeln nach einem Neustart übernimmt ein lokaler Boot-Service (siehe [Betrieb](./betrieb.md#unseal-nach-reboot)), kein herstellerseitiges Auto-Unseal. |
| Permanenter Admin-Root-Token in 1Password | Das Ein-Personen-Homelab hält bewusst einen Root-Token als Admin- und Bootstrap-Zugang im zugriffsgeschützten Passwort-Manager (1Password), nicht als stehendes Secret auf einem Node. Pragmatischer Kompromiss statt Best-Practice-Ideal. Break-Glass bei Token-Verlust: `vault operator generate-root` aus den Shamir-Keys (siehe [Betrieb](./betrieb.md#root-zugang)). |
| TLS mit privater CA | Vault läuft seit 2026-07-15 auf HTTPS (`:8200`) mit einer selbst betriebenen privaten CA statt Klartext-HTTP. Die Nomad-Integration vertraut der CA über `ca_file` in der `vault {}`-Stanza. |
| KV v2 Secret Engine | Versionierung von Secrets, Soft-Delete möglich |

## Workload Identity

Nomad-Jobs authentifizieren sich bei Vault über JWT-basierte Workload Identity. Dadurch brauchen Jobs keine statischen Tokens -- die Identität ergibt sich aus dem Job selbst.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

Nomad: Nomad Server {
  class: node
  tooltip: "Stellt beim Task-Start automatisch ein signiertes JWT aus (Workload Identity)"
}

Task: Nomad Task {
  class: node
  tooltip: "Container mit vault-Stanza (role nomad-workloads) -- Workload Identity kommt aus der default_identity der Nomad-Config"
}

vault: Vault {
  class: container

  auth: JWT Auth Method {
    class: node
    tooltip: "Validiert die JWT-Signatur gegen Nomads JWKS-Endpoint"
  }
  kv: KV v2 Secret Engine {
    class: node
    tooltip: "Pfad-Konvention: kv/data/JOB_ID -- Policy nomad-workload beschränkt Zugriff auf eigenen Pfad"
  }
}

Nomad -> Task: 1. JWT ausstellen (Workload Identity) {
  style.stroke: "#6b7280"
}
Task -> vault.auth: 2. JWT vorzeigen (HTTPS :8200) {
  style.stroke: "#7c3aed"
  tooltip: "Task authentifiziert sich mit dem JWT -- kein statischer Token nötig"
}
vault.auth -> Task: 3. Vault Token (Policy nomad-workload) {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
  tooltip: "Vault prüft JWT-Signatur via Nomad JWKS, dann Token mit eingeschränkter Policy"
}
Task -> vault.kv: 4. kv/data/JOB_ID lesen {
  style.stroke: "#2563eb"
  tooltip: "Task liest nur Secrets unter seinem eigenen Job-Pfad"
}
vault.kv -> Task: 5. Secret-Werte {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
```

Ein Task, der Vault-Secrets benötigt, deklariert eine `vault {}` Stanza (in der Regel mit `role = "nomad-workloads"`). Die Workload Identity liefert die clusterweite `default_identity` aus der Nomad-Agent-Konfiguration, darum kommen die meisten Jobs ohne eigenen `identity`-Block aus. Nur Jobs, die das JWT zusätzlich als Umgebungsvariable oder Datei im Container brauchen, ergänzen einen `identity`-Block mit `env = true` und `file = true`. Technische Details zu Auth Methods, JWKS URL und Policies: [Vault Referenz](./referenz.md)

::: warning Pfad-Konvention
Der Normalfall ist ein Secret-Pfad pro Job unter `kv/<job_id>`. Secrets, die sich mehrere Jobs teilen, liegen dagegen unter einem gemeinsamen `kv/shared/<name>`-Pfad -- der Job `postgres` etwa liest aus `kv/shared/postgres` (Template-Pfad `kv/data/shared/postgres`). Welche Pfade ein Job lesen darf, ist in der Policy festgelegt.
:::

## Verwandte Seiten

- [Vault Referenz](./referenz.md) -- Auth Methods, Policies, Secret-Pfade
- [Vault Betrieb](./betrieb.md) -- Unseal, Secret-Verwaltung, Troubleshooting
- [Nomad](../nomad/) -- Workload Scheduler mit Vault-Integration
- [Consul](../consul/) -- Service Discovery im selben Cluster
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- Adressen der Vault-Nodes
