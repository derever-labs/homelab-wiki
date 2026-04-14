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

### Vault Nomad Secret Engine

- **Mount-Pfad** -- `nomad/`
- **Engine-Mgmt-Token** -- separater Nomad Management-Token, konfiguriert via `nomad/config/access`. Accessor zwecks Recovery in 1Password ("Nomad Recovery Homelab", Accessor `ef54c5c7-b27e-56c3-e7bd-0f96a01e466d`).
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

- `namespace.default` -- write: submit-job, dispatch-job, read-logs, read-job, list-jobs
- `node` -- read
- `agent` -- read
- Bewusst kein `alloc-exec`, kein `operator`

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
