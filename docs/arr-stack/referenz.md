---
title: Qualitätsprofile
description: Radarr- und Sonarr-Quality-Profiles, verwaltet über Profilarr aus den TRaSH Guides
tags:
  - service
  - media
  - radarr
  - sonarr
---

# Qualitätsprofile

Diese Seite beschreibt die in Radarr und Sonarr konfigurierten Quality Profiles und ihre Unterschiede. Die Profile stammen aus den [TRaSH Guides](https://trash-guides.info/) und werden über [Profilarr](./profilarr.md) verwaltet. Persönliche Anpassungen (z.B. die bevorzugte Audio- und HDR-Wertung) liegen als User-Layer-Overrides und überleben Upstream-Updates.

::: tip Zielformat fürs Heimkino
Die Wiedergabekette (Apple TV mit Infuse, Hisense-C1-Beamer, Sonos) spielt **Dolby Vision Profil 8.1** und **Dolby Atmos** voll aus. Deshalb bevorzugen die 4K-Profile DV/HDR sowie verlustfreies bzw. Atmos-Audio. **Dolby Vision Profil 7** (das Dual-Layer-Format der UHD-Blu-ray-Remuxes) wird von Apple TV/Infuse nur als HDR10 wiedergegeben — für diese Kette sind gute **4K-Encodes in DV Profil 8.1** wertvoller als ein P7-Remux. Wiedergabe-Details: siehe [Jellyfin](../jellyfin/index.md).
:::

::: info Profile steuern die Akquise, nicht den Bestand
Ein Profil bestimmt, welche Releases künftig geladen oder als Upgrade ersetzt werden — bestehende Dateien werden dadurch nicht umgewandelt. Ein Wechsel der Auflösungs-Strategie löst also einen erneuten Download aus, keine lokale Konvertierung.
:::

## Radarr — Übersicht

| Profil | Ziel-Qualität | HDR/DV | Audio | Sprache | Status |
|--------|---------------|--------|-------|---------|--------|
| SQP-1 (1080p) | 1080p WEB/Bluray | — | verlustfrei bevorzugt | Englisch | Hauptprofil 1080p |
| SQP-5 | 1080p-Remux + 4K WEB/Bluray-Encode | DV + breites HDR | Atmos + verlustfrei | Englisch | aktiv (4K) |
| SQP-3 | Remux 1080p/2160p + 4K WEB | DV + breites HDR | Atmos + verlustfrei | Englisch | aktiv (wenige Titel) |
| HD-1080p English | 1080p HDTV/WEB/Bluray | leicht | leicht | Englisch | aktiv (wenige) |
| 4K English | bis 2160p (inkl. Remux) | leicht | leicht | Englisch | aktiv (wenige) |
| SQP-1 WEB (1080p) | 1080p WEB/Bluray | — | verlustfrei | Englisch | konfiguriert, ungenutzt |
| SQP-2 | 4K Remux + UHD Bluray + WEB | DV granular | — | — | konfiguriert, ungenutzt |
| SQP-4 | 4K WEB | DV granular | — | — | konfiguriert, ungenutzt |
| HD-1080p Deutsch / French | 1080p | leicht | leicht | Deutsch / Französisch | konfiguriert, ungenutzt |
| min HD-720p English / German / Original Language | 720p–1080p | — | — | je Variante | konfiguriert, ungenutzt |

## Radarr — die aktiven Profile im Detail

### SQP-1 (1080p) — das 1080p-Hauptprofil

Das Standardprofil für die grosse Mehrheit der Filme. Auflösung 720p–1080p (WEB + Bluray-Encode), kein 4K und kein Remux. Verlustfreies und objektbasiertes Audio (TrueHD, DTS-HD MA, FLAC/PCM) wird hoch bewertet, es gibt aber **kein HDR-Scoring** (1080p trägt praktisch kein HDR). `x265 (HD)` ist geblockt, weil 1080p-HEVC fast immer ein minderwertiger Re-Encode ist. Renommierte HD-Bluray- und WEB-Tiers steuern die Release-Wahl.

### SQP-5 — 4K mit Dolby Vision und Atmos

Das aktive 4K-Profil. Auflösung Remux-1080p, 1080p-WEB und 2160p (WEB + UHD-Bluray-Encode), aber kein 4K-Remux. Volles Atmos-Scoring (TrueHD ATMOS, DTS X, DD+ ATMOS) sowie `DV Boost` + breites `HDR` + `HDR10+ Boost`. `x264` und 4K-HEVC ohne HDR/DV sind geblockt — so kommen nur hochwertige HDR/DV-Encodes durch. Zielanwendung: Filme, bei denen 4K mit gutem HDR/Dolby Vision den Speicher wert ist.

### SQP-3 — wie SQP-5, aber mit 4K-Remux statt UHD-Encode-Tier

Inhaltlich nahe an SQP-5 (gleiche Audio- und DV-Haltung), aber die Quellen-Mischung unterscheidet sich: SQP-3 erlaubt **Remux-2160p**, dafür ohne die UHD-Bluray-Encode-Tiers. Aktuell nur für wenige Titel im Einsatz.

## Radarr — die einfachen Sprachprofile

`HD-1080p [Sprache]`, `4K English` und `min HD-720p [Sprache]` sind ältere, nur leicht gescorte Profile (z.B. HDR und Atmos 7.1 mit kleinen Boni, fester Cutoff auf Bluray-1080p bzw. -2160p) und an eine Sprache gebunden. Sie dienen gezielten Sprach- oder Spezialfällen und sind seit der Umstellung auf die SQP-Profile grösstenteils ungenutzt.

## Radarr — konfiguriert, aber ungenutzt

`SQP-1 WEB`, `SQP-2` und `SQP-4` sind angelegt, aber keinem Film zugewiesen. `SQP-2` und `SQP-4` nutzen ein **volles granulares DV-Schema** (DV, DV HDR10, DV HLG, DV SDR je hoch bewertet); die aktiven Profile sind bewusst auf `DV Boost` + breites `HDR` umgestellt, weil das im trash-pcd-Vokabular wartbar und syncbar bleibt.

## Sonarr — Übersicht

| Profil | Ziel-Qualität | HDR/DV | Audio | Sprache | Status |
|--------|---------------|--------|-------|---------|--------|
| WEB-1080p | 1080p WEB | — | — | keine | Hauptprofil Serien |
| WEB-2160p | 2160p WEB | DV granular + HDR | — | keine | aktiv (4K-Serien) |

### WEB-1080p

Standard für die meisten Serien. Nur WEB-1080p, kein HDR- und kein Audio-Scoring (Serien-WEB trägt kein verlustfreies Audio), `x265 (HD)` geblockt, Auswahl über die WEB-Tiers.

### WEB-2160p

Für 4K-Serien aus Streaming-Quellen. Volles DV-Scoring (DV-Varianten und HDR10+/HDR hoch bewertet) und `x265 (no HDR/DV)` geblockt — das **erzwingt HDR/DV bei 4K**. Kein Audio-Scoring.

::: warning Kein Sprachfilter bei Sonarr
Beide Sonarr-Profile haben keine Sprach-Einschränkung gesetzt — im Gegensatz zu Radarr, wo jedes Profil explizit auf Englisch, Deutsch, Französisch oder Originalsprache steht.
:::

## Codec- und HDR-Grundsätze

- **x265 nur dort, wo es gut ist:** Bei 1080p geblockt (HEVC dort meist minderwertige Re-Encodes), bei 4K nur mit HDR/DV erlaubt. Hintergrund: [TRaSH x265 / 4K](https://trash-guides.info/Misc/x265-4k/).
- **Dolby Vision als Profil 8.1 bevorzugen:** spielt auf DV-Geräten als DV und fällt auf allen anderen sauber auf HDR10 zurück.
- **Auflösung ist eine Akquise-Entscheidung:** 4K bringt vor allem über DV/HDR Mehrwert, kostet aber ein Vielfaches an Speicher — lohnt also nicht für jeden Titel.

## Quellen

- [TRaSH Guides — Radarr Quality Profiles](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/)
- [TRaSH Guides — Sonarr Quality Profiles](https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles/)
- [TRaSH Guides — Custom Formats](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/)
- [TRaSH Guides — SQP](https://trash-guides.info/SQP/)
- [TRaSH Guides — x265 / 4K](https://trash-guides.info/Misc/x265-4k/)

## Verwandte Seiten

- [Arr Stack](./index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Profilarr](./profilarr.md) -- verwaltet diese Profile und synchronisiert sie nach Radarr/Sonarr
- [Jellyfin](../jellyfin/index.md) -- Media Server, der die Inhalte abspielt (Wiedergabe-/Client-Kompatibilität)
