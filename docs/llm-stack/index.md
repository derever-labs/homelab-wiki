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

## Uebersicht

Drei Komponenten bilden den lokalen LLM-Stack: Ollama hostet und betreibt die Sprachmodelle, Open WebUI und HolLama bieten jeweils ein Web-Interface fuer die Interaktion.

| Attribut | Ollama | Open WebUI | HolLama |
| :--- | :--- | :--- | :--- |
| **Rolle** | LLM-Backend (Inferenz) | Chat-Interface (Haupttool) | Chat-Interface (leichtgewichtig) |
| **Status** | Produktion | Produktion | Produktion |
| **URL** | [ollama.ackermannprivat.ch](https://ollama.ackermannprivat.ch) | [chat.ackermannprivat.ch](https://chat.ackermannprivat.ch) | [hollama.ackermannprivat.ch](https://hollama.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/ollama.nomad`) | Nomad Job (`services/open-webui.nomad`) | Nomad Job (`services/hollama.nomad`) |
| **Port** | 11434 (static) | 8080 (dynamic) | 4173 (static) |
| **Storage** | NFS `/nfs/docker/ollama` | NFS `/nfs/docker/open-webui` | Kein persistenter Speicher |
| **Auth** | `intern-chain@file` (IP-Whitelist) | OAuth via Keycloak + `intern-chain@file` | `intern-chain@file` (IP-Whitelist) |
| **Ressourcen** | 12 CPU / 32 GB RAM | 2 CPU / 1-2 GB RAM | 200 MHz / 256 MB RAM |

## Architektur

```mermaid
flowchart LR
    subgraph User["Benutzer"]
        Browser:::entry["Browser"]
    end

    subgraph Traefik["Traefik (10.0.2.20)"]
        RC:::svc["Router: chat.*<br>intern-chain"]
        RH:::svc["Router: hollama.*<br>intern-chain"]
        RO:::svc["Router: ollama.*<br>intern-chain"]
    end

    subgraph Nomad["Nomad Cluster (48 GB Nodes)"]
        OW:::accent["Open WebUI<br>(chat.*)"]
        HL:::svc["HolLama<br>(hollama.*)"]
        OL:::accent["Ollama<br>(ollama.*)"]
    end

    NFS:::db["NFS<br>/nfs/docker/ollama"]

    Browser -->|HTTPS| RC
    Browser -->|HTTPS| RH
    RC --> OW
    RH --> HL
    OW -->|HTTP :11434<br>via Consul DNS| OL
    HL -->|HTTP :11434<br>via Browser/CORS| OL
    RO --> OL
    OL --> NFS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Zusammenspiel

Ollama ist das zentrale Backend. Es laedt Sprachmodelle in den RAM, fuehrt die Inferenz durch und stellt eine REST-API auf Port 11434 bereit. Die beiden Web-UIs sprechen diese API an:

- **Open WebUI** verbindet sich serverseitig ueber Consul DNS (`ollama.service.consul:11434`). Es verwaltet Chat-Historien, unterstuetzt mehrere Benutzer via OAuth und bietet Features wie Prompt-Templates und RAG-Integration.
- **HolLama** verbindet sich clientseitig -- der Browser des Benutzers ruft die Ollama-API direkt auf. Dafuer ist CORS in Ollama konfiguriert. HolLama speichert alles im Browser (LocalStorage) und hat keinen serverseitigen State.

::: info Modell-Verwaltung
Ollama zieht beim Start automatisch `llama3.2:3b` (via model-init Sidecar). Weitere Modelle koennen ueber die Open WebUI oder die Ollama-API nachgeladen werden. Die Modelle liegen persistent auf NFS.
:::

## Ollama

### Konfiguration

Ollama laeuft ausschliesslich auf den 48-GB-Nodes (`vm-nomad-client-05` / `vm-nomad-client-06`) mit Affinitaet zu Node 06.

Wichtige Umgebungsvariablen (vollstaendige Konfiguration siehe `services/ollama.nomad`):

| Variable | Wert | Bedeutung |
| :--- | :--- | :--- |
| `OLLAMA_NUM_PARALLEL` | 4 | Parallele Anfragen pro Modell |
| `OLLAMA_MAX_LOADED_MODELS` | 1 | Nur ein Modell gleichzeitig im RAM |
| `OLLAMA_KEEP_ALIVE` | 30m | Modell bleibt 30 Min. nach letzter Anfrage geladen |
| `OLLAMA_NUM_THREAD` | 16 | Nutzt alle verfuegbaren CPU-Threads |
| `OLLAMA_FLASH_ATTENTION` | 1 | Flash Attention fuer schnellere Inferenz |

### Consul Service

Ollama registriert sich als `ollama.service.consul` und ist damit fuer andere Services im Cluster ohne IP-Konfiguration erreichbar.

## Open WebUI

### Auth

Open WebUI authentifiziert ueber OAuth2/OIDC direkt gegen Keycloak (Realm `traefik`, Client `open-webui`). Das klassische Passwort-Login ist deaktiviert (`ENABLE_LOGIN_FORM=false`). Die OAuth-Konfiguration wird ausschliesslich ueber Umgebungsvariablen gesteuert (`ENABLE_OAUTH_PERSISTENT_CONFIG=false`).

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/open-webui` | `oauth_client_secret` |

## HolLama

HolLama ist ein minimales, rein clientseitiges UI. Es hat keine Datenbank, keine Benutzerverwaltung und keinen serverseitigen State. Der Zugriff ist ueber IP-Whitelist (`intern-chain@file`) eingeschraenkt.

::: tip Wann welches UI?
- **Open WebUI** fuer den Alltag: Chat-Historien, mehrere Modelle vergleichen, laengere Konversationen
- **HolLama** fuer schnelle Fragen: Kein Login, sofort einsatzbereit, leichtgewichtig
:::

## Entscheidungslog

- **Ollama CPU-only:** Kein GPU-Passthrough im Proxmox-Cluster vorhanden. Inferenz laeuft komplett auf CPU mit 16 Threads und 32 GB RAM.
- **Zwei UIs parallel:** Open WebUI deckt den Hauptanwendungsfall ab (Chat mit Historie, OAuth). HolLama bietet eine schnelle Alternative ohne Login fuer einfache Anfragen.
- **CORS-Konfiguration:** HolLama benoetigt CORS, da es clientseitig direkt die Ollama-API aufruft. Die erlaubten Origins sind in der Ollama-Konfiguration explizit gesetzt.

## Verwandte Seiten

- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress und Middleware-Chains für alle drei Komponenten
- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- Keycloak OAuth für Open WebUI
- [Storage NAS](../nas-storage/index.md) -- NFS-Speicher für Ollama-Modelle und Open WebUI Daten
