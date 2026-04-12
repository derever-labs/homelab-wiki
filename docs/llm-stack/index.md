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

## Übersicht

Drei Komponenten bilden den lokalen LLM-Stack: Ollama hostet und betreibt die Sprachmodelle, Open WebUI und HolLama bieten jeweils ein Web-Interface für die Interaktion.

| Attribut | Ollama | Open WebUI | HolLama |
| :--- | :--- | :--- | :--- |
| **Rolle** | LLM-Backend (Inferenz) | Chat-Interface (Haupttool) | Chat-Interface (leichtgewichtig) |
| **Status** | Produktion | Produktion | Produktion |
| **URL** | [ollama.ackermannprivat.ch](https://ollama.ackermannprivat.ch) | [chat.ackermannprivat.ch](https://chat.ackermannprivat.ch) | [hollama.ackermannprivat.ch](https://hollama.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/ollama.nomad`) | Nomad Job (`services/open-webui.nomad`) | Nomad Job (`services/hollama.nomad`) |
| **Port** | 11434 (static) | 8080 (dynamic) | 4173 (static) |
| **Storage** | NFS `/nfs/docker/ollama` | NFS `/nfs/docker/open-webui` | Kein persistenter Speicher |
| **Auth** | `intern-noauth@file` (IP-Allowlist) | Natives OIDC via Authentik + `intern-noauth@file` | `intern-noauth@file` (IP-Allowlist) |
| **Ressourcen** | Siehe Nomad-Job | Siehe Nomad-Job | Siehe Nomad-Job |

## Architektur

```d2
direction: right

User: Benutzer {
  style.stroke-dash: 4
  Browser: Browser { style.border-radius: 8 }
}

Traefik: "Traefik (10.0.2.20)" {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
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

User.Browser -> Traefik.RC: HTTPS
User.Browser -> Traefik.RH: HTTPS
Traefik.RC -> Nomad.OW
Traefik.RH -> Nomad.HL
Nomad.OW -> Nomad.OL: "HTTP :11434\nvia Consul DNS"
Nomad.HL -> Nomad.OL: "HTTP :11434\nvia Browser/CORS"
Traefik.RO -> Nomad.OL
Nomad.OL -> NFS
```

## Zusammenspiel

Ollama ist das zentrale Backend. Es lädt Sprachmodelle in den RAM, führt die Inferenz durch und stellt eine REST-API auf Port 11434 bereit. Die beiden Web-UIs sprechen diese API an:

- **Open WebUI** verbindet sich serverseitig über Consul DNS (`ollama.service.consul:11434`). Es verwaltet Chat-Historien, unterstützt mehrere Benutzer via OAuth und bietet Features wie Prompt-Templates und RAG-Integration.
- **HolLama** verbindet sich clientseitig -- der Browser des Benutzers ruft die Ollama-API direkt auf. Dafür ist CORS in Ollama konfiguriert. HolLama speichert alles im Browser (LocalStorage) und hat keinen serverseitigen State.

::: info Modell-Verwaltung
Ollama zieht beim Start automatisch ein Startmodell (via model-init Sidecar). Weitere Modelle können über die Open WebUI oder die Ollama-API nachgeladen werden. Die Modelle liegen persistent auf NFS.
:::

## Ollama

### Konfiguration

Ollama läuft ausschliesslich auf den 48-GB-Nodes (`vm-nomad-client-05` / `vm-nomad-client-06`) mit Affinität zu Node 06.

Wichtige Umgebungsvariablen (vollständige Konfiguration siehe `services/ollama.nomad`):

| Variable | Wert | Bedeutung |
| :--- | :--- | :--- |
| `OLLAMA_NUM_PARALLEL` | 4 | Parallele Anfragen pro Modell |
| `OLLAMA_MAX_LOADED_MODELS` | 1 | Nur ein Modell gleichzeitig im RAM |
| `OLLAMA_KEEP_ALIVE` | 30m | Modell bleibt 30 Min. nach letzter Anfrage geladen |
| `OLLAMA_NUM_THREAD` | 16 | Nutzt alle verfügbaren CPU-Threads |
| `OLLAMA_FLASH_ATTENTION` | 1 | Flash Attention für schnellere Inferenz |

### Consul Service

Ollama registriert sich als `ollama.service.consul` und ist damit für andere Services im Cluster ohne IP-Konfiguration erreichbar.

## Open WebUI

### Auth

Open WebUI authentifiziert über OIDC direkt gegen Authentik (Provider `open-webui-oidc`). Das klassische Passwort-Login ist deaktiviert (`ENABLE_LOGIN_FORM=false`). Die OAuth-Konfiguration wird ausschliesslich über Umgebungsvariablen gesteuert (`ENABLE_OAUTH_PERSISTENT_CONFIG=false`).

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/open-webui` | `oauth_client_secret` |

## HolLama

HolLama ist ein minimales, rein clientseitiges UI. Es hat keine Datenbank, keine Benutzerverwaltung und keinen serverseitigen State. Der Zugriff ist über IP-Whitelist (`intern-noauth@file`) eingeschränkt.

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
