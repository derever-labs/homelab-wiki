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

Der Runner ist ein self-hosted GitHub Actions Runner, der als Nomad Service Job auf dem Cluster läuft. Er übernimmt die CI/CD Pipeline für das [Wiki](../vitepress-wiki/index.md) -- bei jedem Push auf `main` wird das VitePress Wiki gebaut und deployed.

```d2
direction: right

GH: "GitHub\nderever/homelab-wiki"
Runner: "GitHub Runner\n(Nomad Job)"
ZOT: "ZOT Registry\n(localhost:5000)"
Nomad: Nomad API
Wiki: Wiki Container
Vault: "Vault\nkv/github-runner"

GH -> Runner: Webhook: push on main
Runner -> ZOT: docker build
Runner -> Nomad: nomad job run
Nomad -> Wiki: Pull Image
Runner -> Vault: PAT Auth
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

Der Runner ist ein zentraler Bestandteil der Wiki CI/CD Pipeline. Der vollständige Ablauf ist in der [Wiki-Dokumentation](../vitepress-wiki/index.md) beschrieben.

## Verwandte Seiten

- [Wiki](../vitepress-wiki/index.md) -- CI/CD Pipeline und Deployment-Ablauf
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-Nodes (Placement)
- [HashiCorp Stack](../nomad/index.md) -- Vault-Integration für Secrets
- [Nomad Architektur](../nomad/index.md) -- Job-Übersicht
