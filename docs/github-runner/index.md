---
title: GitHub Actions Runner
description: Self-hosted GitHub Actions Runner für CI/CD aller Repos in derever-labs
tags:
  - infrastructure
  - ci-cd
  - github
  - nomad
---

# GitHub Actions Runner

Self-hosted GitHub Actions Runner für alle Repos der Organisation [derever-labs](https://github.com/derever-labs). Ein einzelner Runner deckt alle CI/CD Pipelines ab -- Wiki-Builds, Container-Builds und Deployments.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `infrastructure/github-runner.nomad` |
| Auth | Classic PAT (permanent) aus Vault -- Details: [Referenz](./referenz.md#kv-secret-pat) |

## Rolle im Stack

Der Runner ist die Bootstrap-Schicht der CD-Pipeline: die Brücke zwischen GitHub und dem Nomad-Cluster. Er führt alle CI/CD-Workflows der Organisation aus -- Wiki-Builds, Container-Builds und Deployments -- und holt sich zur Laufzeit über die Vault Workload Identity sowohl seinen PAT als auch kurzlebige Nomad-Tokens für Deploys. Weil er den Deploy-Workflow selbst ausführt, steht er auf der Blocklist der CD-Pipeline und wird manuell deployed.

## Architektur

Der Runner ist ein self-hosted GitHub Actions Runner, der als Nomad Service Job auf dem Cluster läuft. Mit `RUNNER_SCOPE=org` steht er allen Repos der Organisation zur Verfügung.

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

github: GitHub (derever-labs) {
  class: container

  wiki: homelab-wiki {
    class: node
    tooltip: "VitePress Build + Webhook"
  }
  nomad-jobs: homelab-nomad-jobs {
    class: node
    tooltip: "Container Build + Deploy"
  }
  immo: immo-monitor {
    class: node
    tooltip: "Container Build + Deploy"
  }
}

nomad: Nomad Cluster {
  class: container

  runner: Self-hosted Runner {
    class: node
    tooltip: "RUNNER_SCOPE=org\nPrivileged, Host-Networking\nclient-05 oder client-06"
  }
  zot: ZOT Registry\nlocalhost:5000 {
    class: node
  }
}

vault: Vault\nkv/github-runner {
  class: node
  tooltip: "Classic PAT (permanent)\nScopes: repo, workflow, admin:org"
}

github.wiki -> nomad.runner: push on main
github.nomad-jobs -> nomad.runner: push on main
github.immo -> nomad.runner: push on main

nomad.runner -> nomad.zot: docker build + push
vault -> nomad.runner: PAT via Workload Identity {
  style.stroke-dash: 3
}
```

## Docker-in-Docker

Der Runner braucht Docker-Zugriff, um innerhalb von GitHub Actions Container zu bauen. Dafür wird der Docker-Socket des Hosts in den Container gemountet (`/var/run/docker.sock`). Der Container läuft im privileged Mode.

::: warning Sicherheitshinweis
Privileged Mode und gemounteter Docker-Socket geben dem Container Root-Zugriff auf den Host. Dies ist akzeptabel, weil der Runner nur für eigene Repos innerhalb der Organisation eingesetzt wird und keine externen Workflows ausführt.
:::

## Placement

Der Job hat eine Constraint auf `vm-nomad-client-05` und `vm-nomad-client-06`. Auf diesen Nodes ist die lokale Container-Registry (ZOT) unter `localhost:5000` erreichbar, was der Runner für Image-Builds benötigt.

Der Container nutzt `network_mode = "host"`, damit `localhost:5000` direkt auflösbar ist.

## Runner Group

Das PAT wird über die Vault-Integration als Umgebungsvariable injiziert; der Runner registriert sich damit bei der Organisation `derever-labs`. Vault-Pfad und Key siehe [Referenz](./referenz.md#kv-secret-pat).

::: info Runner Group
Die Default Runner Group der Organisation hat `allows_public_repositories=true`, damit auch das öffentliche Repo `homelab-wiki` den Runner nutzen kann. Ohne diese Einstellung bleiben Jobs von public Repos in der Queue hängen.
:::

## Aktive Repos

Der Runner bedient alle Repos der Organisation `derever-labs`:

- **homelab-wiki** -- VitePress Build-Validierung + Webhook-Trigger
- **homelab-nomad-jobs** -- Container-Builds (z.B. Immoscraper) + ZOT Push
- **immo-monitor** -- SvelteKit Build + Deploy

## Deploy-Pattern

Zwei Deploy-Muster laufen über den Runner: die zentrale `deploy-nomad-jobs.yml`-Pipeline mit kurzlebigem Nomad-Token aus der Vault Nomad Secret Engine, und für Repos mit eigenem Container-Image (z.B. `immo-monitor`) ein Alloc-Stop-Refresh -- Build, ZOT Push, laufende Allocs per API stoppen, Nomad reschedult und pullt das neue Image. Pipelines und Token-Fluss: [Referenz](./referenz.md#cd-pipeline-vault-nomad-secret-engine). Operative Deploy- und Recovery-Schritte: [Betrieb](./betrieb.md).

## Verwandte Seiten

- [Wiki](../vitepress-wiki/index.md) -- CI/CD Pipeline und Deployment-Ablauf
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-Nodes (Placement)
- [HashiCorp Stack](../nomad/index.md) -- Vault-Integration und Nomad-Job-Übersicht
