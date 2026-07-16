---
title: LLM-Stack
description: Ollama als LLM-Backend mit Open WebUI als Chat-Interface
tags:
  - service
  - ai
  - llm
  - nomad
---

# LLM-Stack

Zwei Komponenten bilden den lokalen LLM-Stack: Ollama hostet und betreibt die Sprachmodelle, Open WebUI bietet das Web-Interface für die Interaktion.

## Übersicht

**Ollama** (LLM-Backend, Inferenz):

| Attribut | Wert |
|----------|------|
| URL | [ollama.ackermannprivat.ch](https://ollama.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/ollama.nomad` |
| Storage | NFS `/nfs/docker/ollama` |
| Auth | `intern-noauth@file` (IP-Allowlist) |

**Open WebUI** (Chat-Interface):

| Attribut | Wert |
|----------|------|
| URL | [chat.ackermannprivat.ch](https://chat.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/open-webui.nomad` |
| Datenbank | PostgreSQL via Consul DNS (`postgres.service.consul`, DB `open_webui`) |
| Storage | Linstor CSI `open-webui-data` (`/app/backend/data`, Uploads/Vektor-Store) |
| Auth | Natives OIDC via Authentik + `intern-noauth@file` |

## Architektur

```d2
direction: right

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

Client: "Browser /\nAPI-Client" { class: node }

Traefik: "Traefik" {
  class: container
  RC: "chat.*\n(intern-noauth)" { class: node }
  RO: "ollama.*\n(intern-noauth)" { class: node }
}

Nomad: "Nomad-Cluster" {
  class: container
  OW: "Open WebUI" { class: node }
  OL: "Ollama" { class: node }
  OW -> OL: "REST via Consul DNS"
}

PG: "PostgreSQL\nShared Cluster" { shape: cylinder }
NFS: "NFS\nOllama-Modelle" { shape: cylinder }
Vol: "Linstor CSI\nopen-webui-data" { shape: cylinder }

Client -> Traefik.RC: Chat-UI
Client -> Traefik.RO: Ollama-API
Traefik.RC -> Nomad.OW
Traefik.RO -> Nomad.OL
Nomad.OW -> PG
Nomad.OW -> Vol
Nomad.OL -> NFS
```

## Rolle im Stack

Ollama ist das zentrale Backend. Es lädt Sprachmodelle in den RAM, führt die Inferenz durch und stellt eine REST-API auf Port 11434 bereit. Open WebUI ist das primäre Chat-Interface und verbindet sich serverseitig über Consul DNS (`ollama.service.consul:11434`). Es verwaltet Chat-Historien, unterstützt mehrere Benutzer via OAuth und bietet Features wie Prompt-Templates und RAG-Integration.

::: info Modell-Verwaltung
Ollama zieht beim Start automatisch ein Startmodell (via model-init Poststart-Task). Weitere Modelle können über Open WebUI oder die Ollama-API nachgeladen werden. Die Modelle liegen persistent auf NFS.
:::

## Ollama

### Konfiguration

Ollama läuft ausschliesslich auf den RAM-starken Nodes `vm-nomad-client-05` / `vm-nomad-client-06` (Specs siehe [hosts-und-ips.md](../_referenz/hosts-und-ips.md)) mit Affinität zu Node 06.

Die Tuning-Strategie ist auf den CPU-only-Betrieb ausgelegt: nur ein Modell gleichzeitig im RAM, parallele Anfragen erlaubt, Modell bleibt nach der letzten Anfrage eine Weile geladen und Flash Attention ist aktiv. Die konkreten Umgebungsvariablen-Werte stehen im Nomad-Job `services/ollama.nomad`.

Ollama registriert sich als `ollama.service.consul` und ist damit für andere Services im Cluster ohne IP-Konfiguration erreichbar.

## Open WebUI

### Auth

Open WebUI authentifiziert über OIDC direkt gegen Authentik (Provider `open-webui-oidc`). Das klassische Passwort-Login ist deaktiviert (`ENABLE_LOGIN_FORM=false`). Die OAuth-Konfiguration wird ausschliesslich über Umgebungsvariablen gesteuert (`ENABLE_OAUTH_PERSISTENT_CONFIG=false`).

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/open-webui` | `oauth_client_secret`, `postgres_password` |

## Entscheidungslog

- **Ollama CPU-only:** Kein GPU-Passthrough im Proxmox-Cluster vorhanden. Inferenz läuft komplett auf CPU (Ressourcen: Siehe Nomad-Job).

## Verwandte Seiten

- [Traefik Reverse Proxy](../edge/traefik/index.md) -- Ingress und Middleware-Chains für Ollama und Open WebUI
- [Authentik](../edge/authentik/index.md) -- OIDC-Provider für Open WebUI
- [Storage NAS](../nas-storage/index.md) -- NFS-Speicher für Ollama-Modelle
