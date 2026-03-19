---
title: GitHub Actions Runner
description: Self-hosted GitHub Actions Runner mit Docker-in-Docker für Wiki CI/CD
tags:
  - infrastructure
  - ci-cd
  - github
  - nomad
---

# GitHub Actions Runner

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | -- (kein Web-UI) |
| **Deployment** | Nomad Job (`infrastructure/github-runner.nomad`) |
| **Scope** | Einzelnes Repo: `derever/homelab-wiki` |
| **Labels** | `self-hosted`, `homelab`, `docker`, `linux`, `x64` |
| **Image** | `myoung34/github-runner:2.332.0` (via lokale Registry) |
| **Auth** | Fine-grained PAT aus Vault |

## Architektur

Der Runner ist ein self-hosted GitHub Actions Runner, der als Nomad Service Job auf dem Cluster läuft. Er übernimmt die CI/CD Pipeline für das [Wiki](../services/core/wiki.md) -- bei jedem Push auf `main` wird das VitePress Wiki gebaut und deployed.

```mermaid
flowchart LR
    GH:::ext["GitHub<br/>derever/homelab-wiki"]
    GH -->|"Webhook: push on main"| Runner:::svc["GitHub Runner<br/>(Nomad Job)"]
    Runner -->|"docker build"| ZOT:::svc["ZOT Registry<br/>(localhost:5000)"]
    Runner -->|"nomad job run"| Nomad:::svc["Nomad API"]
    Nomad -->|"Pull Image"| Wiki:::svc["Wiki Container"]
    Runner -->|"PAT Auth"| Vault:::accent["Vault<br/>kv/github-runner"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Docker-in-Docker

Der Runner braucht Docker-Zugriff, um innerhalb von GitHub Actions Container zu bauen. Dafür wird der Docker-Socket des Hosts in den Container gemountet (`/var/run/docker.sock`). Der Container läuft im privileged Mode.

::: warning Sicherheitshinweis
Privileged Mode und gemounteter Docker-Socket geben dem Container Root-Zugriff auf den Host. Dies ist akzeptabel, weil der Runner nur für ein eigenes privates Repo eingesetzt wird und keine externen Workflows ausführt.
:::

## Placement

Der Job hat eine Constraint auf `vm-nomad-client-05` und `vm-nomad-client-06`. Auf diesen Nodes ist die lokale Container-Registry (ZOT) unter `localhost:5000` erreichbar, was der Runner für Image-Builds benötigt.

Der Container nutzt `network_mode = "host"`, damit `localhost:5000` direkt auflösbar ist.

## Vault Secrets

| Pfad | Key | Beschreibung |
| :--- | :--- | :--- |
| `kv/data/github-runner` | `access_token` | Fine-grained PAT für GitHub API |

Das PAT wird über Vault-Integration als Umgebungsvariable `ACCESS_TOKEN` injiziert. Der Runner nutzt es zur Registrierung bei GitHub.

## Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 4000 MHz (4 Cores) |
| Memory | 4096 MB |

## Beziehung zum Wiki

Der Runner ist ein zentraler Bestandteil der Wiki CI/CD Pipeline. Der vollständige Ablauf ist in der [Wiki-Dokumentation](../services/core/wiki.md) beschrieben.

## Verwandte Seiten

- [Wiki](../services/core/wiki.md) -- CI/CD Pipeline und Deployment-Ablauf
- [Proxmox Cluster](./proxmox-cluster.md) -- Nomad-Client-Nodes (Placement)
- [HashiCorp Stack](../platforms/hashicorp-stack.md) -- Vault-Integration für Secrets
- [Nomad Architektur](../platforms/nomad-architecture.md) -- Job-Übersicht
