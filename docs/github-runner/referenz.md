---
title: GitHub Actions Runner - Referenz
description: Technische Referenz -- Nomad Job, Vault-Konfiguration, CD-Pipeline
tags:
  - github
  - ci-cd
  - runner
  - referenz
---

# GitHub Actions Runner: Referenz

Technische Referenz für den Self-hosted GitHub Actions Runner. Für die Architektur-Übersicht siehe [GitHub Actions Runner](./index.md), für Wartung und Troubleshooting siehe [Betrieb](./betrieb.md).

## Nomad Job

- **Job-Name** -- github-runner
- **Typ** -- service
- **Datacenter** -- homelab
- **Constraint** -- vm-nomad-client-05 oder vm-nomad-client-06 (regexp)
- **Count** -- 1
- **Netzwerk** -- host (für `localhost:5000` ZOT-Zugriff)
- **Privileged** -- true (Docker-in-Docker via Docker Socket Mount)
- **Scope** -- org (Organisation `derever-labs`)

Job-Definition: `nomad-jobs/infrastructure/github-runner.nomad`

## Vault-Konfiguration

### Workload Identity (Runner-Authentifizierung)

Der Runner-Job authentifiziert sich bei Vault über die JWT-Auth-Methode `jwt-nomad`. Die Vault-Policy `nomad-workloads` erlaubt Zugriff auf `kv/data/github-runner`.

- **Auth-Method** -- `auth/jwt-nomad`
- **Role** -- `github-runner-deploy`
  - `bound_claims.nomad_job_id` == `github-runner`
  - `token_policies` -- `nomad-workload`, `nomad-deploy-fetch`
- **Vault-Stanza im Job** -- `vault { role = "github-runner-deploy" }`

Die Workload-Identity-Role ist damit zugleich die Brücke zur CD-Pipeline: Derselbe Runner erhält sowohl Zugriff auf seinen PAT als auch auf die Nomad Secret Engine.

### KV Secret (PAT)

- **Vault-Pfad** -- `kv/data/github-runner`
- **Key** -- `access_token` -- Classic PAT (permanent, Scopes: repo, workflow, admin:org)

## CD-Pipeline: Vault Nomad Secret Engine {#cd-pipeline-vault-nomad-secret-engine}

Die `deploy-nomad-jobs.yml`-Pipeline nutzt die Vault Nomad Secret Engine statt einem statischen Repo-Secret. Beim Deployment wird ein kurzlebiger Nomad-Client-Token dynamisch ausgestellt und am Workflow-Ende sofort revoked.

### Architektur-Übersicht

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

gh: GitHub Actions\nWorkflow {
  class: node
  tooltip: "deploy-nomad-jobs.yml\nTrigger: push auf main\n**/*.nomad"
}

runner: Self-hosted Runner\n(Homelab) {
  class: node
  tooltip: "runs-on: [self-hosted, homelab]\nVault-Workload-Identity\nRole: github-runner-deploy"
}

vault: Vault {
  class: container

  engine: Nomad Secret Engine\nnomad/ {
    class: node
    tooltip: "Role: github-deploy\nLease-TTL: 30 min\nMax-TTL: 1 h"
  }
}

nomad: Nomad Cluster {
  class: container

  api: Nomad API {
    class: node
    tooltip: "nomad job plan\nnomad job run"
  }
}

gh -> runner: dispatcht Job
runner -> vault.engine: liest nomad/creds/github-deploy {
  style.stroke-dash: 3
}
vault.engine -> runner: kurzlebiger Client-Token {
  style.stroke-dash: 3
}
runner -> nomad.api: plan + run\n(mit kurzlebigem Token)
runner -> vault.engine: sys/leases/revoke\n(am Workflow-Ende) {
  style.stroke-dash: 3
}
```

### Token-Lebenszyklus

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: down

classes: {
  gh: { style.fill: "#e8f0fe" }
  runner: { style.fill: "#fff4e5" }
  vault: { style.fill: "#e6f4ea" }
  nomad: { style.fill: "#fce8e6" }
}

trigger: 1. Trigger {
  push: "push auf main\npaths matched" { class: gh }
  dispatch: "GitHub Actions dispatcht Workflow" { class: gh }
  push -> dispatch
}

setup: 2. Runner-Setup {
  prep: "checkout + install nomad CLI" { class: runner }
}

token: 3. Kurzlebigen Nomad-Token holen {
  req: "Runner GET nomad/creds/github-deploy\n(Workload-Token)" { class: runner }
  engine: "Vault Engine POST /v1/acl/token\n(Engine-Mgmt-Token)" { class: vault }
  issue: "Nomad liefert Client-Token\nTTL 30m, max 1h" { class: nomad }
  deliver: "Vault gibt secret_id + lease_id an Runner" { class: vault }
  req -> engine -> issue -> deliver
}

deploy: 4. Deploy {
  diff: "git diff + Blocklist-Filter" { class: runner }
  plan: "nomad job plan\n(X-Nomad-Token)" { class: runner }
  run: "nomad job run -detach" { class: runner }
  diff -> plan -> run
}

cleanup: 5. Cleanup {
  revoke: "Runner PUT sys/leases/revoke" { class: runner }
  engine: "Vault widerruft Client-Token bei Nomad" { class: vault }
  revoke -> engine
}

trigger -> setup -> token -> deploy -> cleanup
```

### Vault Nomad Secret Engine

- **Mount-Pfad** -- `nomad/`
- **Engine-Mgmt-Token** -- separater Nomad Management-Token, konfiguriert via `nomad/config/access`. Accessor bei Bedarf über Recovery-Token (1Password "Nomad Recovery Homelab") auslesbar.
- **Role** -- `nomad/role/github-deploy`
  - Stellt Client-Tokens mit Nomad-Policy `github-deploy` aus
  - Lease-TTL: 30 min, Max-TTL: 1 h

### Vault-Policy `nomad-deploy-fetch`

Erlaubt dem Runner-Workload, den kurzlebigen Token zu holen und den Lease am Ende zu widerrufen:

- `read` auf `nomad/creds/github-deploy`
- `update` auf `sys/leases/revoke`

Policy-Datei: `homelab-hashicorp-stack/vault-configs/policies/nomad-deploy-fetch.hcl`

### Nomad ACL Policy `github-deploy`

Minimale Permissions für den kurzlebigen Nomad-Token:

- `namespace.default` -- write mit Capabilities submit-job, dispatch-job, read-logs, read-job, list-jobs, csi-mount-volume, csi-register-plugin, csi-write-volume
- `node` -- read
- `agent` -- read
- `plugin` -- read (CSI-Plugin-Zugriff, für Jobs mit CSI-Volume-Claims zwingend)
- Bewusst kein `alloc-exec`, kein `operator`, kein `sentinel-override`

Policy-Datei: `homelab-hashicorp-stack/nomad-configs/policies/github-deploy.hcl`

## Workflow: `deploy-nomad-jobs.yml`

Workflow-Datei im Repo: `.github/workflows/deploy-nomad-jobs.yml`

- **Trigger** -- push auf `main`, paths-Filter auf `nomad-jobs/**/*.nomad`
- **Concurrency-Group** -- `nomad-deploy-homelab` (verhindert parallele Deploys)
- **Checkout** -- SHA-gepinnte `actions/checkout@v4.2.2`

### Pipeline-Ablauf

1. Checkout des Repositories
2. Installation Nomad CLI
3. Vault-Token-Fetch über die Nomad Secret Engine (`nomad/creds/github-deploy`)
4. Diff-Filter: geänderte `.nomad`-Dateien ermitteln, Blocklist anwenden
5. Für jede nicht-blockierte Datei: `nomad job plan` + `nomad job run`
6. Lease-Revoke: der ausgestellte Nomad-Token wird sofort widerrufen

### Blocklist

Folgende Verzeichnisse werden von der automatischen Pipeline ausgeschlossen und müssen manuell deployed werden:

- `infrastructure/`, `ingress/`, `system/`, `databases/`, `identity/`, `volumes/`, `monitoring/`

::: warning Nur Service-Jobs via Pipeline
Die Blocklist schützt kritische Infrastruktur-Jobs vor versehentlichen automatischen Deploys. Alles ausserhalb der Blocklist (typisch: Anwendungs-Services) wird automatisch deployed.
:::

## Aktive Pipelines im Überblick

- **deploy-nomad-jobs.yml** -- Vault-basiertes CD, alle `nomad-jobs/**/*.nomad` ausserhalb der Blocklist
- **deploy.yml** (immo-monitor Repo) -- Alloc-Stop-Refresh via statischem `NOMAD_TOKEN` Repo-Secret (älteres Pattern)

## Verwandte Seiten

- [GitHub Actions Runner](./index.md) -- Übersicht und Architektur
- [GitHub Actions Runner Betrieb](./betrieb.md) -- Wartung und Recovery
- [HashiCorp Stack](../nomad/index.md) -- Vault und Nomad im Homelab
