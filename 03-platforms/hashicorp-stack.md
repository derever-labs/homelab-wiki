---
title: HashiCorp Stack
description:
published: true
date: 2025-12-26T17:52:12+00:00
tags:
editor: markdown
dateCreated: 2025-12-26T17:52:12+00:00
---

## Übersicht

- **Infrastruktur**: Proxmox VE 8.x (3 Hosts: pve00, pve01, pve02)
- **OS**: Ubuntu 24.04 LTS
- **Tools**: Consul v1.21.1, Nomad v1.10.1, Vault v1.18.3
- **Automatisierung**: Packer, Terraform, Ansible
- **Storage**: rpool (ZFS)

## Proxmox Hosts

| Host | IP | Specs |
|------|-----|-------|
| pve00 | 10.0.2.40 | 4 CPU, 16GB RAM (begrenzte Ressourcen) |
| pve01 | 10.0.2.41 | Standard |
| pve02 | 10.0.2.42 | Standard |

## Server Nodes (3x)

| VM | IP | VM ID | Specs |
|----|-----|-------|-------|
| vm-nomad-server-04 | 10.0.2.104 | 3004 | 2 CPU, 4GB RAM, 20GB Disk |
| vm-nomad-server-05 | 10.0.2.105 | 3005 | 2 CPU, 4GB RAM, 20GB Disk |
| vm-nomad-server-06 | 10.0.2.106 | 3006 | 2 CPU, 4GB RAM, 20GB Disk |

**Services**: Nomad Server, Consul Server, Vault
**Distribution**: 1 Server pro Proxmox Host

## Worker Nodes (3x)

| VM | IP | VM ID | Specs |
|----|-----|-------|-------|
| vm-nomad-client-04 | 10.0.2.124 | 3104 | 4 CPU, 12GB RAM, 64GB Disk |
| vm-nomad-client-05 | 10.0.2.125 | 3105 | 16 CPU, 48GB RAM, 64GB Disk |
| vm-nomad-client-06 | 10.0.2.126 | 3106 | 16 CPU, 48GB RAM, 64GB Disk |

**Services**: Nomad Client, Consul Client, Docker

## Quick Start

### 1. Voraussetzungen

```bash
# Tools installieren (Mac)
brew install packer terraform ansible git jq genisoimage

# Python-Pakete für Ansible Proxmox Module
pip install proxmoxer

# Ansible Collections
ansible-galaxy collection install community.general

# SSH Key erstellen
ssh-keygen -t ed25519 -f ~/.ssh/homelab_ed25519 -C "admin@homelab"
```

### 2. Repository Setup

```bash
chmod +x setup-homelab-v1.4.2.sh
./setup-homelab-v1.4.2.sh

cd homelab-hashicorp-stack
cp .env.example .env
./scripts/validate-env.sh
source .env
```

### 3. Proxmox API Token

```bash
# Auf Proxmox Host
pveum user add automation@pam
pveum aclmod / -user automation@pam -role Administrator
pveum user token add automation@pam homelab -privsep 0
```

### 4. VM-Template erstellen

```bash
cd packer
packer init ubuntu-2404.pkr.hcl
packer build ubuntu-2404.pkr.hcl
# Template manuell auf andere Hosts replizieren!
```

### 5. Deployment

```bash
cd terraform/proxmox-vms
terraform init && terraform apply

cd ../../ansible
ansible-playbook -i inventory/hosts.yml playbooks/site.yml
```

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
| DNS | 1.1.1.1, 8.8.8.8 |
| NFS Server | 10.0.0.200 |
| Storage Pool | rpool (ZFS) |

## TLS Konfiguration

**Consul TLS ist deaktiviert** für einfachere Cluster-Kommunikation im Homelab:
- `verify_incoming = false`
- `verify_outgoing = false`
- `verify_server_hostname = false`

## Hilfreiche Scripts

| Command | Beschreibung |
|---------|--------------|
| `make snapshot` | VM Snapshots erstellen |
| `make test` | Cluster Health Check |
| `make summary` | Übersicht aller Services |
| `make troubleshoot` | Automatische Fehlerdiagnose |

## Troubleshooting

### SSH Verbindung

```bash
chmod 600 ~/.ssh/homelab_ed25519
ssh -vvv -i ~/.ssh/homelab_ed25519 sam@10.0.2.104
```

### Cluster Status

```bash
consul members
nomad server members
nomad node status
```

### Logs prüfen

```bash
journalctl -u consul -f
journalctl -u nomad -f
```

### Vault unsealen

```bash
vault status
/usr/local/bin/vault-unseal.sh
```

### Cloud-init Probleme

```bash
journalctl -u cloud-init
cat /var/log/cloud-init-output.log
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
Die DNS-Server auf `10.0.2.1` und `10.0.2.2` leiten `.consul` Anfragen an den Cluster weiter.

### Auflösung
- `consul.service.consul` -> 10.0.2.104-106
- `radarr.service.consul` -> 10.0.2.125 (Dynamisch je nach Node)
- Unterstützung für SRV Records zur Port-Ermittlung.
```
