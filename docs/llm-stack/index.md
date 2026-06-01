---
title: LLM-Stack
description: Ollama als LLM-Backend mit Open WebUI und HolLama als Chat-Interfaces
tags:
  - service
  - ai
  - llm
  - nomad
---

# LLM-Stack

Drei Komponenten bilden den lokalen LLM-Stack: Ollama hostet und betreibt die Sprachmodelle, Open WebUI und HolLama bieten jeweils ein Web-Interface für die Interaktion.

## Übersicht

**Ollama** (LLM-Backend, Inferenz):

| Attribut | Wert |
|----------|------|
| URL | [ollama.ackermannprivat.ch](https://ollama.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/ollama.nomad` |
| Storage | NFS `/nfs/docker/ollama` |
| Auth | `intern-noauth@file` (IP-Allowlist) |

**Open WebUI** (Chat-Interface, Haupttool):

| Attribut | Wert |
|----------|------|
| URL | [chat.ackermannprivat.ch](https://chat.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/open-webui.nomad` |
| Datenbank | PostgreSQL via Consul DNS (`postgres.service.consul`, DB `open_webui`) |
| Storage | NFS `/nfs/docker/open-webui` (Uploads, Vektor-Store) |
| Auth | Natives OIDC via Authentik + `intern-noauth@file` |

**HolLama** (Chat-Interface, leichtgewichtig):

| Attribut | Wert |
|----------|------|
| URL | [hollama.ackermannprivat.ch](https://hollama.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/hollama.nomad` |
| Storage | Kein persistenter Speicher |
| Auth | `intern-noauth@file` (IP-Allowlist) |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

User: Benutzer {
  style.stroke-dash: 4
  Browser: Browser { style.border-radius: 8 }
}

Traefik: "Traefik" {
  style.stroke-dash: 4
  tooltip: "IP siehe _referenz/hosts-und-ips.md"
  RC: "Router: chat.*\nintern-noauth" { style.border-radius: 8 }
  RH: "Router: hollama.*\nintern-noauth" { style.border-radius: 8 }
  RO: "Router: ollama.*\nintern-noauth" { style.border-radius: 8 }
}

Nomad: "Nomad Cluster" {
  style.stroke-dash: 4
  OW: "Open WebUI (chat.*)" { style.border-radius: 8 }
  HL: "HolLama (hollama.*)" { style.border-radius: 8 }
  OL: "Ollama (ollama.*)" { style.border-radius: 8 }
}

NFS: "NFS /nfs/docker/ollama" { shape: cylinder }
NFS_OW: "NFS /nfs/docker/open-webui" { shape: cylinder }

User.Browser -> Traefik.RC: HTTPS
User.Browser -> Traefik.RH: HTTPS
Traefik.RC -> Nomad.OW
Traefik.RH -> Nomad.HL
Nomad.OW -> Nomad.OL: "HTTP :11434\nvia Consul DNS"
Nomad.HL -> Nomad.OL: "HTTP :11434\nvia Browser/CORS"
Traefik.RO -> Nomad.OL
Nomad.OL -> NFS
Nomad.OW -> NFS_OW
```

## Rolle im Stack

Ollama ist das zentrale Backend. Es lädt Sprachmodelle in den RAM, führt die Inferenz durch und stellt eine REST-API auf Port 11434 bereit. Die beiden Web-UIs sprechen diese API an:

- **Open WebUI** verbindet sich serverseitig über Consul DNS (`ollama.service.consul:11434`). Es verwaltet Chat-Historien, unterstützt mehrere Benutzer via OAuth und bietet Features wie Prompt-Templates und RAG-Integration.
- **HolLama** verbindet sich clientseitig -- der Browser des Benutzers ruft die Ollama-API direkt auf. Dafür ist CORS in Ollama konfiguriert. HolLama speichert alles im Browser (LocalStorage) und hat keinen serverseitigen State.

::: info Modell-Verwaltung
Ollama zieht beim Start automatisch ein Startmodell (via model-init Poststart-Task). Weitere Modelle können über die Open WebUI oder die Ollama-API nachgeladen werden. Die Modelle liegen persistent auf NFS.
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

## HolLama

::: tip Wann welches UI?
- **Open WebUI** für den Alltag: Chat-Historien, mehrere Modelle vergleichen, längere Konversationen
- **HolLama** für schnelle Fragen: Kein Login, sofort einsatzbereit, leichtgewichtig
:::

## Entscheidungslog

- **Ollama CPU-only:** Kein GPU-Passthrough im Proxmox-Cluster vorhanden. Inferenz läuft komplett auf CPU (Ressourcen: Siehe Nomad-Job).
- **Zwei UIs parallel:** Open WebUI deckt den Hauptanwendungsfall ab (Chat mit Historie, OAuth). HolLama bietet eine schnelle Alternative ohne Login für einfache Anfragen.
- **CORS-Konfiguration:** HolLama benötigt CORS, da es clientseitig direkt die Ollama-API aufruft. Die erlaubten Origins sind in der Ollama-Konfiguration explizit gesetzt.

## Verwandte Seiten

- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress und Middleware-Chains für alle drei Komponenten
- [Authentik](../authentik/index.md) -- OIDC-Provider für Open WebUI
- [Storage NAS](../nas-storage/index.md) -- NFS-Speicher für Ollama-Modelle und Open WebUI Daten
