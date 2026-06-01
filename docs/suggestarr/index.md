---
title: SuggestArr
description: AI-basierte Film-/Serien-Empfehlungen für Jellyfin via Jellyseerr
tags:
  - service
  - media
  - nomad
  - ai
---

# SuggestArr

SuggestArr analysiert die Watch-History aus Jellyfin und generiert personalisierte Film-/Serien-Empfehlungen über Jellyseerr.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [suggest.ackermannprivat.ch](https://suggest.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/suggestarr.nomad` |
| Storage | NFS `/nfs/docker/suggestarr/config/` |
| Auth | `intern-noauth@file` |

## Rolle im Stack

Die Empfehlungen werden als **Pending Requests** in Jellyseerr erstellt -- ein Admin muss sie manuell genehmigen, bevor Radarr/Sonarr den Download starten.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

JF: Jellyfin { style.border-radius: 8 }
TMDB: TMDB API { style.border-radius: 8 }
OL: Ollama LLM { style.border-radius: 8 }
SA: SuggestArr { style.border-radius: 8 }
JS: Jellyseerr { style.border-radius: 8 }
ARR: Radarr/Sonarr { style.border-radius: 8 }

JF -> SA: Watch History
TMDB -> SA: Metadaten
OL -> SA: AI Empfehlungen
SA -> JS: Pending Requests
JS -> ARR: Genehmigt
```

## Konfiguration

### Externe Services

| Service | Zweck |
| :--- | :--- |
| `jellyfin.service.consul` | Watch-History lesen |
| `jellyseerr.service.consul` | Requests erstellen |
| `ollama.service.consul` | LLM-Empfehlungen |
| `api.themoviedb.org` | Film-/Serien-Metadaten |

### Jellyseerr-Integration

SuggestArr nutzt einen **dedizierten lokalen User** `suggestarr@local` in Jellyseerr:

- Permission: nur **Request** (kein Auto-Approve, kein Manage-Requests)
- Alle Empfehlungen landen als "Pending" und müssen manuell genehmigt werden
- Damit wird verhindert, dass SuggestArr unkontrolliert Downloads auslöst

### LLM

Ollama-API (`/v1/chat/completions`), lokal im Cluster, OpenAI-kompatibel.

## Betrieb

Der Health-Endpunkt unter `/api/health` gibt den Status aller Abhängigkeiten zurück (`db`, `llm`, `seer`, `tmdb`). Über das Web-UI kann mit dem Button "Force Run" ein manueller Lauf ausgelöst werden. Der Tab "AI Search" ermöglicht natürlichsprachige Suchanfragen (z.B. "ein Dokumentarfilm im Stil von David Attenborough").

Das Anwendungs-Log liegt unter `/nfs/docker/suggestarr/config/app.log`.

### Bekannte Einschränkungen

- Watch-History-Abfrage schlägt für Jellyfin-User ohne Playback-Daten fehl (`'NoneType' object has no attribute 'values'`). Nicht kritisch, Empfehlungen funktionieren trotzdem.

## Verwandte Seiten

- [Jellyfin](../jellyfin/index.md) -- Liefert die Watch-History als Eingabe
- [Jellyseerr](../jellyseerr/index.md) -- Empfängt die Pending Requests von SuggestArr
- [Arr Stack](../arr-stack/index.md) -- Führt genehmigte Requests aus
- [LLM-Stack](../llm-stack/index.md) -- Ollama-Provider für AI-Empfehlungen
