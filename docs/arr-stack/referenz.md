---
title: Qualitätsprofile
description: Radarr- und Sonarr-Quality-Profiles und die SQP-Familie, verwaltet über Profilarr aus den TRaSH Guides
tags:
  - service
  - media
  - radarr
  - sonarr
---

# Qualitätsprofile

Diese Seite beschreibt die in Radarr und Sonarr konfigurierten Quality Profiles, die TRaSH-SQP-Familie und ihre Unterschiede. Die Profile stammen aus den [TRaSH Guides](https://trash-guides.info/) und werden über [Profilarr](./profilarr.md) verwaltet. Persönliche Anpassungen liegen als User-Layer-Overrides und überleben Upstream-Updates.

::: info Custom Formats sind nicht Profile
Ein **Custom Format** ist eine einzelne Erkennungsregel (z.B. `x265 (HD)`, `DV Boost`, `TrueHD ATMOS`), die eine Eigenschaft eines Releases erkennt. Ein **Quality Profile** legt erlaubte Auflösungen + Cutoff fest und gibt jedem Custom Format einen Score — es kombiniert viele Formate mit Gewichten. Die Custom Formats sind also die Bausteine, die Profile verwenden, nicht die Profile selbst.
:::

::: tip Zielformat fürs Heimkino
Die Wiedergabekette (Apple TV mit Infuse, Hisense-C1-Beamer, Sonos) spielt **Dolby Vision Profil 8.1** und **Dolby Atmos** voll aus. **Dolby Vision Profil 7** (das Dual-Layer-Format der UHD-Blu-ray-Remuxes) wird von Apple TV/Infuse nur als HDR10 wiedergegeben — für diese Kette sind gute **4K-Encodes in DV Profil 8.1** wertvoller als ein P7-Remux. Wiedergabe-Details: siehe [Jellyfin](../jellyfin/index.md).
:::

## Radarr — Übersicht

| Profil | Ziel-Qualität | HDR/DV | Audio | Sprache | Status |
|--------|---------------|--------|-------|---------|--------|
| SQP-1 (1080p) | 1080p WEB/Bluray | — | verlustfrei bevorzugt | Englisch | Hauptprofil 1080p |
| SQP-5 | 1080p-Remux + 4K WEB/Bluray-Encode | DV + breites HDR | Atmos + verlustfrei | Englisch | aktiv (4K) |
| SQP-3 | Remux 1080p/2160p + 4K WEB | DV + breites HDR | Atmos + verlustfrei | Englisch | aktiv (wenige Titel) |
| HD-1080p English | 1080p HDTV/WEB/Bluray | leicht | leicht | Englisch | aktiv (wenige) |
| 4K English | bis 2160p (inkl. Remux) | leicht | leicht | Englisch | aktiv (wenige) |
| SQP-1 WEB (1080p) | 1080p WEB | — | verlustfrei | Englisch | konfiguriert, ungenutzt |
| SQP-2 | 4K Remux + UHD Bluray + WEB | DV granular | verlustfrei | — | konfiguriert, ungenutzt |
| SQP-4 | 4K WEB | DV granular | WEB | — | konfiguriert, ungenutzt |
| HD-1080p Deutsch / French | 1080p | leicht | leicht | Deutsch / Französisch | konfiguriert, ungenutzt |
| min HD-720p English / German / Original | 720p–1080p | — | — | je Variante | konfiguriert, ungenutzt |

## Die SQP-Familie im Detail

SQP steht für [Special Quality Profiles](https://trash-guides.info/SQP/) der TRaSH Guides — feiner abgestimmte Profile, die sich vor allem in der **Quelle** (WEB / Bluray-Encode / Remux), der **Audio-Haltung** und der **HDR/DV-Strategie** unterscheiden. Über die trash-pcd-Datenbank stehen alle Varianten zur Verfügung; bei uns ist nur ein Teil als Radarr-Profil angelegt.

### SQP-1 — streaming-optimiert (1080p / 2160p, je auch WEB-only)

Für Clients, die kein verlustfreies Audio bitstreamen. **Blockiert** verlustfreies/Objekt-Audio (TrueHD ATMOS, DTS X, DTS-HD MA, TrueHD, FLAC, PCM mit −10000) und bevorzugt DD+ Atmos — die Logik: diese Formate kommen nur auf Remuxen vor, die das Profil nicht will. Quellen Bluray-Encode + WEB (1080p bzw. 2160p), kein Remux. Die `WEB`-Varianten beschränken zusätzlich auf WEB-DL/WEBRip. → Bei uns aktiv als **SQP-1 (1080p)**, das 1080p-Hauptprofil.

### SQP-2 — 4K-Allround (Remux + Encode + WEB)

Breitestes 4K-Profil: Remux-2160p, Bluray-2160p-Encode und WEB in einer Hierarchie. Verlustfreies Audio und DV/HDR10+ werden **geboostet** (Remux-Tiers sind enthalten). → Bei uns konfiguriert, aber ungenutzt.

### SQP-3 / SQP-3 (Audio) — Remux-fokussiert

Decke ist **Remux-2160p** (plus Remux-1080p + WEB), **kein** Bluray-Encode-Tier — der Upgrade-Pfad endet auf dem Remux. Verlustfreies Audio geboostet. Die Variante **(Audio)** hebt die Audio-Scores so an, dass ein Remux mit TrueHD ATMOS einen WEB-DL mit DD+ Atmos in der Rangliste schlägt. → Bei uns aktiv als **SQP-3** (wenige Titel).

### SQP-4 / SQP-4 (MA Hybrid) — WEB-only 4K

Reines WEB-DL/WEBRip-4K, **kein** Remux und **kein** Bluray-Encode. Kleinste Dateien, schnell verfügbar, niedrigere Bitrate; WEB liefert DV Profil 5 oder 8.1. Die Variante **(MA Hybrid)** priorisiert WEB-Releases mit injizierter Disc-Tonspur (DTS-HD MA / TrueHD) und blockt rohe 10-bit-Encodes. → Bei uns konfiguriert, ungenutzt.

### SQP-5 — UHD-Bluray-Encode + IMAX Enhanced

HQ-**Encode** statt Remux: Quellen sind Bluray-2160p-Encodes (UHD Bluray Tier 01–03 von Top-Gruppen) + WEB, **kein** 2160p-Remux. Verlustfreies Audio geboostet (gute Encodes behalten oft TrueHD ATMOS), DV geboostet, IMAX Enhanced priorisiert. Spart gegenüber Remux ~50–60 % Platz bei nahezu gleicher Bildqualität. → Bei uns aktiv als **SQP-5**, unser 4K-Profil.

## SQP-3 vs SQP-4 vs SQP-5 — der Unterschied

| Profil | Decke / Quelle | DV-Profil typisch | Grösse pro Film | Audio |
|--------|----------------|-------------------|-----------------|-------|
| SQP-3 | Remux-2160p | Profil 7 | ~40–100 GB | verlustfrei |
| SQP-4 | WEB-2160p | Profil 5 / 8.1 | ~15–25 GB | WEB (lossy) |
| SQP-5 | UHD-Bluray-Encode | Profil 8.1 | ~20–40 GB | verlustfrei (oft) |

Kurz: SQP-3 zielt auf das absolute Maximum (Remux, riesig), SQP-4 auf minimalen Platz (WEB), SQP-5 auf Disc-Qualität ohne Remux-Grösse.

## Welches SQP für unser Setup

Für die Kette Apple TV + Infuse, Hisense C1 und Sonos ist **SQP-5 das beste 4K-Profil**:

- **Dolby Vision:** Gute UHD-Bluray-Encodes (SQP-5) tragen meist **DV Profil 8.1** und spielen auf Apple TV/Infuse als echtes Dolby Vision. **Remuxe** (SQP-2/SQP-3) tragen **DV Profil 7**, das auf dieser Kette nur als HDR10 ankommt — der DV-Vorteil ginge verloren, bei 2–3× Dateigrösse.
- **Audio:** Verlustfreies Audio bleibt in der Datei; Apple TV reicht Atmos als DD+/MAT an die Sonos weiter (kein TrueHD-Bitstream möglich, aber kein Nachteil gegenüber Remux für diese Kette). SQP-5 blockt verlustfreies Audio nicht.
- **Ergänzend SQP-4** (WEB-only) für Neuerscheinungen, bevor ein guter Encode existiert (WEB erscheint früher).
- **SQP-3 (Remux)** lohnt nur mit einem P7-fähigen Player (z.B. Shield mit Kodi) oder wenn maximale Bitrate über Speicher und DV-Kompatibilität steht.

## Radarr — Sprachprofile

`HD-1080p [Sprache]`, `4K English` und `min HD-720p [Sprache]` sind ältere, nur leicht gescorte Profile (kleine HDR-/Atmos-Boni, fester Cutoff) und an eine Sprache gebunden. Sie dienen gezielten Sprach- oder Spezialfällen und sind seit der SQP-Umstellung grösstenteils ungenutzt.

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
- **Dolby Vision als Profil 8.1 bevorzugen:** spielt auf DV-Geräten als DV und fällt auf allen anderen sauber auf HDR10 zurück. Remuxe (Profil 7) sind auf der Apple-TV/Infuse-Kette nur HDR10.
- **Auflösung ist eine Akquise-Entscheidung:** 4K bringt vor allem über DV/HDR Mehrwert, kostet aber ein Vielfaches an Speicher — lohnt also nicht für jeden Titel.

## Quellen

- [TRaSH Guides — SQP](https://trash-guides.info/SQP/)
- [TRaSH Guides — Radarr Quality Profiles](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/)
- [TRaSH Guides — Sonarr Quality Profiles](https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles/)
- [TRaSH Guides — Collection of Custom Formats](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/)
- [TRaSH Guides — Was unterstützt mein Media Player](https://trash-guides.info/Plex/what-does-my-media-player-support/)
- [TRaSH Guides — x265 / 4K](https://trash-guides.info/Misc/x265-4k/)

## Verwandte Seiten

- [Arr Stack](./index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Profilarr](./profilarr.md) -- verwaltet diese Profile und synchronisiert sie nach Radarr/Sonarr
- [Jellyfin](../jellyfin/index.md) -- Media Server, der die Inhalte abspielt (Wiedergabe-/Client-Kompatibilität)
