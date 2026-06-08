---
title: App-Standard
description: Wiederverwendbarer Build-/Deploy-Standard fuer selbst gebaute Homelab-Apps
tags:
  - ci-cd
  - nomad
  - standard
  - deploy
---

# Homelab-App-Standard

Der Homelab-App-Standard ist ein wiederverwendbares Build- und Deploy-Geruest fuer selbst gebaute Apps (React/Vite-SPA mit BFF, Node-Fullstack, statische SPA, Python-Service). Ziel: eine neue App ist ein duenner Caller, der ein zentrales Reusable-Workflow und fertige Templates erbt -- statt jede App ihre eigene Pipeline, Dockerfile-Variante und ihr eigenes Auth-Muster neu erfindet.

::: info SSOT
Die verbindliche Detail-Quelle (Reusable-Workflow, Templates, Gates) ist die Repo-Datei `docs/app-standard.md` in `derever-labs/homelab-nomad-jobs`. Diese Seite gibt den Architektur-Ueberblick und das Warum; konkrete Workflow- und Template-Inhalte werden dort gepflegt, nicht hier dupliziert.
:::

## Uebersicht

| Attribut | Wert |
|----------|------|
| SSOT-Repository | `derever-labs/homelab-nomad-jobs` -- `docs/app-standard.md`, `docs/templates/` |
| Reusable-Workflow | `.github/workflows/app-build-deploy.yml@v1` |
| Registry | `zot.service.consul:5000/library/<app>:<sha12>` |
| App-Repo | duenner Caller (`.github/workflows/build.yml` -> `uses: ...@v1`), kein Secrets-Block |
| Deploy | SHA-Bump-PR auf `homelab-nomad-jobs` -> `deploy-nomad-jobs.yml` (Health-Gate + `auto_revert`) |
| Pilot | [Keep Mobile](../monitoring/keep-mobile.md) |

## Bausteine

- **Reusable CI/CD-Workflow:** baut das Image, fuehrt einen echten Container-Smoke-Test (Container starten, auf `health=healthy` pollen) sowie `hadolint` und `Trivy` (`--ignore-unfixed`, blockt fixbare HIGH/CRITICAL) aus und pusht per `skopeo` in die ZOT-Registry. Ein CI-Grep stellt sicher, dass kein serverseitiges Secret ins Client-Bundle gelangt.
- **Templates:** Caller-Stub, Dockerfile-Varianten (vite-spa-bff, node-fullstack, static-spa, python-service), `nginx.conf`, BFF-Skelett (`server-bff-stub.ts`), Job-Template, `dockerignore`, `renovate.json`.
- **Secrets ueber Vault, kein GitHub-Secret:** der CI-Push und der Bump-Token (GitHub-App) werden zur Laufzeit aus Vault geholt. Das passt zum GitHub-Free-Plan, in dem Org-Secrets fuer private Repos nicht verfuegbar sind.

## Deploy-Flow

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

commit: "Commit\n(App-Repo)" { class: node }
build: "CI: Build + Smoke\n+ Trivy + Push" { class: node }
registry: "ZOT-Registry\nzot.service.consul:5000" { class: node }
pr: "SHA-Bump-PR\n(homelab-nomad-jobs)" { class: node }
deploy: "deploy-nomad-jobs.yml" { class: node }
nomad: "Nomad-Deploy\nHealth-Gate + auto_revert" { class: node }

commit -> build
build -> registry: "skopeo push"
build -> pr: "oeffnet Bump-PR"
pr -> deploy: "Merge (squash)"
deploy -> nomad
```

Der Bump-PR wird bewusst manuell gemergt (kein Auto-Merge), damit der Image-Wechsel ein sichtbarer, einzelner Schritt bleibt. Der Merge startet den Nomad-Deploy; schlaegt der Health-Check fehl, rollt `auto_revert` auf die letzte gesunde Version zurueck.

## Auth-Muster fuer SPAs hinter Authentik

Selbst gebaute SPAs laufen hinter dem zentralen Authentik-ForwardAuth und betreiben **kein** eigenes OIDC. Bei Session-Ablauf liefert ForwardAuth einen Cross-Origin-302, dem ein `fetch`/XHR nicht folgen kann. Der Standard faengt das in der SPA ab: einmaliger, guarded Top-Level-Reload; bei Blockade ein App-weites "Session abgelaufen"-Overlay; Polling stoppt bei 401 statt Fehler zu spammen. Ein Service Worker wird fuer auth-gated Live-Apps ohne Offline-Nutzen bewusst vermieden.

Liveness-Endpoints (`/api/health`), die ein externer Monitor pruefen soll, bekommen einen eigenen Traefik-Router ueber `intern-noauth` (interne IP-Allowlist, kein Authentik) -- eng auf den exakten Pfad begrenzt, dependency-frei, ohne schuetzenswerten Inhalt.

## Pilot: Keep Mobile

[Keep Mobile](../monitoring/keep-mobile.md) ist die erste produktive App nach diesem Standard: React-SPA + Hono-BFF, Auth-Muster wie oben, Self-Monitoring ueber Uptime-Kuma, vollautomatischer Folge-Deploy ueber den SHA-Bump-PR.

## Verwandte Dokumentation

- [Keep Mobile](../monitoring/keep-mobile.md) -- Pilot-App
- [Docker-Registry (ZOT)](../docker-registry/) -- Image-Registry
- [GitHub-Runner](../github-runner/) -- CI-Ausfuehrung im Homelab
- [Vault](../vault/) -- Secret-Quelle fuer CI und Laufzeit
