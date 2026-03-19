---
title: HashiCorp Stack
description: Nomad, Consul und Vault -- Cluster-Architektur und Zusammenspiel
tags:
  - platform
  - hashicorp
  - nomad
  - consul
  - vault
---

## Übersicht

| Eigenschaft | Wert |
|-------------|------|
| Infrastruktur | Proxmox VE 8.x (3 Hosts: pve00, pve01, pve02) |
| OS | Ubuntu 24.04 LTS |
| Consul | v1.21.1 |
| Nomad | v1.10.1 |
| Vault | v1.18.3 |
| Automatisierung | Packer, Terraform, Ansible |

## Zusammenspiel der Komponenten

Die drei HashiCorp-Tools bilden zusammen die Container-Plattform:

- **Nomad** ist der Workload-Scheduler. Er entscheidet auf welchem Worker-Node ein Container läuft, überwacht die Ausführung und sorgt für Restarts bei Fehlern.
- **Consul** stellt Service Discovery und DNS bereit. Jeder Container registriert sich automatisch als Consul Service und ist danach über `<service>.service.consul` erreichbar. Consul verwaltet ausserdem Health Checks und stellt ein Key-Value Store bereit.
- **Vault** ist das zentrale Secrets Management. Nomad Jobs authentifizieren sich über Workload Identity (JWT) und erhalten Secrets zur Laufzeit, ohne dass statische Tokens in Job-Definitionen stehen.

```mermaid
flowchart TD
    Nomad:::svc["Nomad Server<br/>(Scheduling, Job-Lifecycle)"]
    Consul:::svc["Consul Server<br/>(Service Discovery, DNS, KV)"]
    Vault:::accent["Vault<br/>(Secrets Management)"]
    Worker:::entry["Nomad Client + Docker<br/>(Container-Ausführung)"]

    Nomad -->|"Job placement"| Worker
    Worker -->|"Service Registration"| Consul
    Worker -->|"JWT Auth → Secrets"| Vault
    Nomad -->|"Service Health"| Consul
    Nomad -->|"Workload Identity"| Vault

    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Cluster-Topologie

Der Stack läuft auf 3 Server-Nodes (Consul/Nomad/Vault) und 3 Worker-Nodes (Nomad Client/Docker), jeweils 1 pro Proxmox-Host. Die Server bilden einen Raft-Consensus-Cluster -- bei Ausfall eines Servers übernehmen die verbleibenden zwei.

- **Server-Nodes**: Nomad Server, Consul Server, Vault
- **Worker-Nodes**: Nomad Client, Consul Client, Docker

Vollständige Host-/IP-/Spec-Tabellen: [Proxmox Cluster](../infrastructure/proxmox-cluster.md#hashicorp-stack-vms)

## Ersteinrichtung

Siehe README.md im Repository `homelab-hashicorp-stack`.

## Service URLs

| Service | URL |
|---------|-----|
| Nomad UI | http://10.0.2.104:4646 |
| Consul UI | http://10.0.2.104:8500 |

## Wichtige Pfade

| Pfad | Verwendung |
|------|------------|
| /nfs/nomad/jobs/ | Nomad Jobs (NFS) |
| /opt/consul | Consul Daten |
| /opt/nomad | Nomad Daten |
| /opt/vault | Vault Daten |
| /nfs/cert | Zertifikate (read-only) |

## Repository Struktur

Das Repository `homelab-hashicorp-stack` enthält die vollständige IaC-Pipeline: `packer/` für VM-Templates (inkl. Cloud-init), `terraform/` für die Infrastruktur-Provisionierung, `ansible/` für Konfigurationsmanagement (Inventory, Playbooks, Roles), sowie `consul-configs/` und `vault-configs/` für die jeweiligen Service-Konfigurationen.

## Konfiguration

| Parameter | Wert |
|-----------|------|
| Admin User | sam (nur SSH Key Auth) |
| Netzwerk | 10.0.2.0/22 |
| Gateway | 10.0.0.1 |
| DNS | 10.0.2.1, 10.0.2.2 |
| NFS Server | [NAS-Speicher](../infrastructure/storage-nas.md) |
| Storage Pool | rpool (ZFS) |

## Security

| Komponente | Massnahme | Status |
|------------|-----------|--------|
| Consul | Gossip Encryption | Aktiv |
| Consul | ACLs | Aktiv (default: allow) |
| Nomad | ACLs | Aktiv |
| Vault | Audit Logging | Aktiv |
| TLS | Deaktiviert | Homelab-Entscheidung |

**Consul Gossip Encryption:** Gesamter Gossip-Traffic zwischen Consul Nodes ist verschlüsselt (symmetrischer Key, auf allen Nodes identisch).

**Consul ACLs:** Aktiviert mit `default_policy = "allow"` — Services funktionieren ohne Token. Management Token in `infra/.consul-token`.

**Nomad ACLs:** Aktiviert. UI und API erfordern Token-Authentifizierung. Management Token in `infra/.nomad-token`.

| Policy | Beschreibung |
|--------|--------------|
| operator | Jobs deployen, Logs lesen, Allocs verwalten |

**Vault Audit Logging:** Alle Vault-Zugriffe werden protokolliert unter `/opt/vault/audit/vault-audit.log`. Logrotate konfiguriert (30 Tage, komprimiert).

**TLS Deaktiviert:** Kein Expiry-Risiko durch Zertifikate. Gossip Encryption schützt Traffic trotzdem.

## Vault

Zentrales Secrets Management. Startet versiegelt und muss nach Reboot entsperrt werden.

### Workload Identity

Nomad Jobs authentifizieren sich bei Vault über JWT (Workload Identity) ohne statische Tokens.
- **Auth Method:** `jwt-nomad`
- **JWKS URL:** `http://10.0.2.104:4646/.well-known/jwks.json`
- **Default Role:** `nomad-workloads`

### Auto-Unseal

Vault wird nach Neustart automatisch via systemd entsperrt:
- **Keys:** `/etc/vault.d/unseal-keys` (chmod 600)
- **Service:** `vault-unseal.service`

## Consul DNS

Siehe [DNS-Architektur](dns-architecture.md) für die vollständige DNS-Dokumentation inkl. Consul-Forwarding.

## Verwandte Seiten

- [Nomad Job-Übersicht](nomad-architecture.md) -- Alle Nomad Jobs und deren Konfiguration
- [DNS-Architektur](dns-architecture.md) -- DNS-Kette inkl. Consul-Forwarding
- [Sicherheit](security.md) -- Keycloak, OAuth2-Proxy und Zugriffskontrolle
- [Linstor & DRBD](linstor-drbd.md) -- Distributed Storage mit CSI-Integration in Nomad
- [Proxmox Cluster](../infrastructure/proxmox-cluster.md) -- Host- und VM-Übersicht
