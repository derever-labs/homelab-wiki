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

Vault läuft als 3-Node Raft Cluster auf den Server-VMs -- ein eigener Prozess pro Node, koresident mit Nomad-Server und Consul-Server (Adressen: [Hosts und IPs](../../_referenz/hosts-und-ips.md)). Zwei Szenario-Sichten zeigen die Mechanik: die **Cluster-Sicht** (wer beantwortet Anfragen, was passiert bei Ausfall und Reboot) und der **Workload-Identity-Fluss** (wie ein Nomad-Task ohne statischen Token an Secrets kommt).

Lese-Konvention: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt-Nummer und Inhalt -- Request und Antwort teilen sich einen Pfeil. **Durchgezogene** Kanten sind synchrone Aufrufe, **gestrichelte** laufen zyklisch oder dauerhaft im Hintergrund. Farben: Violett der Secrets-Zugriff, Grün Service Discovery über Consul, Grau Cluster-interner Kontroll- und Hintergrundverkehr.

### Cluster-Sicht -- Leader, Standby, Ausfall

**Leitfrage:** Wer beantwortet eine Vault-Anfrage im 3-Node-Cluster -- und was passiert bei einem Node-Ausfall oder nach einem Reboot?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  secrets: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  disco: { style: { stroke: "#16a34a"; font-color: "#16a34a" } }
  disco-async: { style: { stroke: "#16a34a"; stroke-dash: 3; font-color: "#16a34a" } }
  intern: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
  intern-async: { style: { stroke: "#6b7280"; stroke-dash: 3; font-color: "#6b7280" } }
}

direction: right

clients: Vault-Clients {
  class: node
  tooltip: "Nomad-Tasks via Workload Identity, Admin-CLI, nächtlicher Snapshot-Job"
}

Consul: Consul {
  class: node
  tooltip: "Health-Check pro Node -- ein sealed Node fällt aus der DNS-Antwort"
}

raft: Vault Raft Cluster {
  class: container
  tooltip: "vm-nomad-server-04/05/06 -- je ein Vault-Prozess"

  leader: Aktiver Node (Leader) {
    class: node
    tooltip: "einziger schreibender Node -- Schreib-Quorum 2 von 3"
  }
  standby: 2 Standby-Nodes {
    class: node
    tooltip: "nehmen Anfragen an, beantworten sie aber nicht selbst"
  }

  standby -> leader: "3. Forward an den\nLeader (8201)" { class: intern }
  leader <-> standby: "Raft (8201) --\nReplikation und\nLeader-Election" { class: intern-async }
}

unseal: vault-unseal.service {
  class: node
  tooltip: "Boot-Service auf jedem Node -- liest die Shamir-Keys lokal aus /etc/vault.d/unseal-keys"
}

clients -> Consul: "1. vault.service.consul\nauflösen (DNS)" { class: disco }
clients -> raft: "2. HTTPS 8200 (private CA) --\nbeliebiger unsealed Node" { class: secrets }
raft -> Consul: "registriert Service vault --\nHealth-Status pro Node" { class: disco-async }
unseal -> raft: "entsiegelt nach jedem Reboot\n(Shamir: 3 Shares, Threshold 2)" { class: intern-async }
```

Lesehilfe:

1. Clients erreichen Vault über `vault.service.consul` -- die DNS-Antwort enthält alle Nodes mit bestandenem Health-Check, ein sealed oder toter Node fällt automatisch heraus ([Vault Service Discovery](./referenz.md#vault-service-discovery)).
2. Die Anfrage darf bei jedem Node landen: Standby-Nodes leiten sie über den Cluster-Port an den Leader weiter, für den Client transparent -- es gibt keinen fest verdrahteten Leader.
3. Schreibvorgänge gelten erst als erfolgreich, wenn Raft sie auf das Quorum (2 von 3) repliziert hat. Fällt ein Node aus, wählen die verbleibenden zwei bei Bedarf einen neuen Leader und der Dienst läuft weiter -- erst ohne Quorum steht Vault ([Plattform-Ausfallverhalten](../index.md#ausfallverhalten)).
4. Nach einem Reboot startet ein Node immer sealed. Der lokale Boot-Service entsiegelt ihn mit den Node-lokal abgelegten Shamir-Keys -- ohne Cloud-KMS und ohne manuellen Eingriff ([Betrieb -- Unseal nach Reboot](./betrieb.md#unseal-nach-reboot), [Designentscheide](#designentscheide)).
5. Gegen Datenverlust zieht ein nächtlicher Batch-Job einen verschlüsselten Raft-Snapshot über die API ([Betrieb -- Raft Snapshots](./betrieb.md#raft-snapshots)).

## Designentscheide

| Entscheidung | Begründung |
|-------------|-------------|
| Integrated Storage (Raft) statt Consul-Backend | Weniger Abhängigkeiten: Vault verwaltet seinen eigenen Zustand |
| Shamir Seal statt Cloud-/Transit-Auto-Unseal | Self-Hosted ohne externen KMS -- die Seal-Keys bleiben lokal auf den Nodes, keine Abhängigkeit von einem Cloud-Anbieter. Das Entsiegeln nach einem Neustart übernimmt ein lokaler Boot-Service (siehe [Betrieb](./betrieb.md#unseal-nach-reboot)), kein herstellerseitiges Auto-Unseal. |
| Permanenter Admin-Root-Token in 1Password | Das Ein-Personen-Homelab hält bewusst einen Root-Token als Admin- und Bootstrap-Zugang im zugriffsgeschützten Passwort-Manager (1Password), nicht als stehendes Secret auf einem Node. Pragmatischer Kompromiss statt Best-Practice-Ideal. Break-Glass bei Token-Verlust: `vault operator generate-root` aus den Shamir-Keys (siehe [Betrieb](./betrieb.md#root-zugang)). |
| TLS mit privater CA | Vault läuft seit 2026-07-15 auf HTTPS (`:8200`) mit einer selbst betriebenen privaten CA statt Klartext-HTTP. Die Nomad-Integration vertraut der CA über `ca_file` in der `vault {}`-Stanza. |
| KV v2 Secret Engine | Versionierung von Secrets, Soft-Delete möglich |

## Workload Identity

**Leitfrage:** Wie kommt ein Nomad-Task ohne statischen Token an seine Secrets -- und wie prüft Vault, dass das JWT echt ist?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  secrets: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  intern: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
  intern-async: { style: { stroke: "#6b7280"; stroke-dash: 3; font-color: "#6b7280" } }
}

direction: down

Nomad: Nomad {
  class: node
  tooltip: "Die Server signieren das Workload-JWT -- der Client-Agent erledigt Login und Template-Rendering stellvertretend für den Task"
}

Task: Nomad Task {
  class: node
  tooltip: "vault-Stanza mit role nomad-workloads -- Identity aus der clusterweiten default_identity"
}

vault: Vault {
  class: container

  kv: KV v2 Secret Engine {
    class: node
    tooltip: "Pfad-Konvention kv/data/JOB_ID -- Policy nomad-workload beschränkt auf eigenen Pfad plus shared"
  }
  auth: JWT Auth Method jwt-nomad {
    class: node
    tooltip: "bound_audiences vault.io -- Identität des Tasks kommt aus dem Claim nomad_job_id"
  }
}

Nomad -> Task: "1. stellt signiertes Workload-JWT\naus (aud vault.io, TTL 1 h)" { class: intern }
Task -> vault.auth: "2. JWT vorzeigen --\nerhält kurzlebigen Vault-Token" { class: secrets }
vault -> Nomad: "3. holt Signatur-Schlüssel vom JWKS-\nEndpunkt der Nomad-Server (4646)" { class: intern-async }
Task -> vault.kv: "4. liest kv/data/JOB_ID --\nAntwort: Secret-Werte" { class: secrets }
```

Lesehilfe:

1. Beim Task-Start stellt Nomad das signierte JWT automatisch aus der clusterweiten `default_identity` aus (Audience `vault.io`, TTL 1 Stunde) -- im Jobfile steht kein Token, nur die `vault`-Stanza mit der Rolle `nomad-workloads`.
2. Login und Rendern der `template`-Stanzas erledigt der Nomad-Client-Agent stellvertretend für den Task: Der Container sieht nur die fertigen Werte. Einen eigenen `identity`-Block mit `env = true` und `file = true` ergänzen nur Jobs, die das JWT selbst als Variable oder Datei brauchen.
3. Die JWT-Auth-Method `jwt-nomad` prüft die Signatur gegen die Schlüssel vom JWKS-Endpunkt der Nomad-Server und stellt einen periodischen Token mit der Policy `nomad-workload` aus (Laufzeit 1 Stunde, vom Client-Agent erneuert) -- Auth Method, JWKS-URL und Rolle: [Vault Referenz](./referenz.md#auth-methods).
4. Der Token erlaubt im Kern nur den eigenen Pfad `kv/data/JOB_ID` plus die geteilten Pfade unter `kv/shared/` -- wenige Cross-Job-Ausnahmen regelt die Policy explizit ([Referenz -- Policies](./referenz.md#policies)).
5. Zum Henne-Ei mit Nomad (Vault prüft JWTs gegen Nomad, Nomad-Jobs lesen Secrets aus Vault): Die Schleife existiert nur auf Workload-Ebene, beide Dienste starten unabhängig -- [Abhängigkeits-Sicht der Plattform-Seite](../index.md#abhangigkeits-sicht-wer-braucht-wen).

::: warning Pfad-Konvention
Der Normalfall ist ein Secret-Pfad pro Job unter `kv/<job_id>`. Secrets, die sich mehrere Jobs teilen, liegen dagegen unter einem gemeinsamen `kv/shared/<name>`-Pfad -- der Job `postgres` etwa liest aus `kv/shared/postgres` (Template-Pfad `kv/data/shared/postgres`). Welche Pfade ein Job lesen darf, ist in der Policy festgelegt.
:::

## Verwandte Seiten

- [Vault Referenz](./referenz.md) -- Auth Methods, Policies, Secret-Pfade
- [Vault Betrieb](./betrieb.md) -- Unseal, Secret-Verwaltung, Troubleshooting
- [Nomad](../nomad/) -- Workload Scheduler mit Vault-Integration
- [Consul](../consul/) -- Service Discovery im selben Cluster
- [Hosts und IPs](../../_referenz/hosts-und-ips.md) -- Adressen der Vault-Nodes
