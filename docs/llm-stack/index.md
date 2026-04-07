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
| **Auth** | `intern-noauth@file` (IP-Allowlist) | Natives OIDC via Authentik + `intern-noauth@file` | `intern-noauth@file` (IP-Allowlist) |
| **Ressourcen** | 12 CPU / 32 GB RAM | 2 CPU / 1-2 GB RAM | 200 MHz / 256 MB RAM |

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

Nomad: "Nomad Cluster (48 GB Nodes)" {
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

Open WebUI authentifiziert ueber OIDC direkt gegen Authentik (Provider `open-webui-oidc`). Das klassische Passwort-Login ist deaktiviert (`ENABLE_LOGIN_FORM=false`). Die OAuth-Konfiguration wird ausschliesslich ueber Umgebungsvariablen gesteuert (`ENABLE_OAUTH_PERSISTENT_CONFIG=false`).

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/open-webui` | `oauth_client_secret` |

## HolLama

HolLama ist ein minimales, rein clientseitiges UI. Es hat keine Datenbank, keine Benutzerverwaltung und keinen serverseitigen State. Der Zugriff ist ueber IP-Whitelist (`intern-noauth@file`) eingeschraenkt.

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
- [Authentik](../authentik/index.md) -- OIDC-Provider für Open WebUI
- [Storage NAS](../nas-storage/index.md) -- NFS-Speicher für Ollama-Modelle und Open WebUI Daten
