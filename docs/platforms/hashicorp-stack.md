---
title: HashiCorp Stack
---

## Uebersicht

- **Infrastruktur**: Proxmox VE 8.x (3 Hosts: pve00, pve01, pve02)
- **OS**: Ubuntu 24.04 LTS
- **Tools**: Consul v1.21.1, Nomad v1.10.1, Vault v1.18.3
- **Automatisierung**: Packer, Terraform, Ansible
- **Storage**: rpool (ZFS)

## Nodes

Der Stack laeuft auf 3 Server-Nodes (Consul/Nomad/Vault) und 3 Worker-Nodes (Nomad Client/Docker), jeweils 1 pro Proxmox-Host.

- **Server**: Nomad Server, Consul Server, Vault
- **Worker**: Nomad Client, Consul Client, Docker

Vollstaendige Host-/IP-/Spec-Tabellen: [Proxmox Cluster](../infrastructure/proxmox-cluster.md#hashicorp-stack-vms)

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

```
homelab-hashicorp-stack/
├── packer/           # VM-Templates
│   └── cloud-init/   # Cloud-init Konfigurationen
├── terraform/        # Infrastructure as Code
├── ansible/          # Konfigurationsmanagement
│   ├── inventory/    # Host-Definitionen
│   ├── playbooks/    # Ansible Playbooks
│   └── roles/        # Ansible Roles
├── consul-configs/   # Consul Konfigurationen
├── vault-configs/    # Vault Policies & Configs
├── scripts/          # Hilfs-Scripts
├── docs/             # Dokumentation
└── backups/          # Backup Verzeichnis
```

## Konfiguration

| Parameter | Wert |
|-----------|------|
| Admin User | sam (nur SSH Key Auth) |
| Netzwerk | 10.0.2.0/22 |
| Gateway | 10.0.0.1 |
| DNS | 10.0.2.1, 10.0.2.2 |
| NFS Server | 10.0.0.200 |
| Storage Pool | rpool (ZFS) |

## Security

| Komponente | Massnahme | Status |
|------------|-----------|--------|
| Consul | Gossip Encryption | Aktiv |
| Consul | ACLs | Aktiv (default: allow) |
| Nomad | ACLs | Aktiv |
| Vault | Audit Logging | Aktiv |
| TLS | Deaktiviert | Homelab-Entscheidung |

**Consul Gossip Encryption:** Gesamter Gossip-Traffic zwischen Consul Nodes ist verschluesselt (symmetrischer Key, auf allen Nodes identisch).

**Consul ACLs:** Aktiviert mit `default_policy = "allow"` — Services funktionieren ohne Token. Management Token in `infra/.consul-token`.

**Nomad ACLs:** Aktiviert. UI und API erfordern Token-Authentifizierung. Management Token in `infra/.nomad-token`.

| Policy | Beschreibung |
|--------|--------------|
| operator | Jobs deployen, Logs lesen, Allocs verwalten |

**Vault Audit Logging:** Alle Vault-Zugriffe werden protokolliert unter `/opt/vault/audit/vault-audit.log`. Logrotate konfiguriert (30 Tage, komprimiert).

**TLS Deaktiviert:** Kein Expiry-Risiko durch Zertifikate. Gossip Encryption schuetzt Traffic trotzdem.

## Vault

Zentrales Secrets Management. Startet versiegelt und muss nach Reboot entsperrt werden.

### Workload Identity

Nomad Jobs authentifizieren sich bei Vault ueber JWT (Workload Identity) ohne statische Tokens.
- **Auth Method:** `jwt-nomad`
- **JWKS URL:** `http://10.0.2.104:4646/.well-known/jwks.json`
- **Default Role:** `nomad-workloads`

### Auto-Unseal

Vault wird nach Neustart automatisch via systemd entsperrt:
- **Keys:** `/etc/vault.d/unseal-keys` (chmod 600)
- **Service:** `vault-unseal.service`

## Consul DNS

Siehe [DNS-Architektur](dns-architecture.md) fuer die vollstaendige DNS-Dokumentation inkl. Consul-Forwarding.

---
*Letztes Update: 21.02.2026*
