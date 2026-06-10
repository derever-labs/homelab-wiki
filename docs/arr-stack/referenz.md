---
title: Radarr Qualitätsprofile
description: Konfigurierte Quality Profiles basierend auf TRaSH Guides
tags:
  - service
  - media
  - radarr
---

# Radarr Qualitätsprofile

Diese Dokumentation beschreibt alle konfigurierten Quality Profiles in Radarr und gibt Empfehlungen basierend auf den [TRaSH Guides](https://trash-guides.info/).

## Übersicht

| Profil | Ziel-Qualität | Sprache | Empfohlen für |
|--------|---------------|---------|---------------|
| min HD-720p English | 720p-1080p | Englisch | Ältere Filme, begrenzte Bandbreite |
| HD-1080p English | 1080p | Englisch | Standard-Nutzung, gute Qualität |
| 4K English | 2160p UHD | Englisch | 4K TV/Projektor, beste Qualität |
| HD-1080p Deutsch | 1080p | Deutsch | Deutsche Synchro bevorzugt |
| HD-1080p French | 1080p | Französisch | Französische Filme |
| max Remux-1080p English | Remux 1080p | Englisch | Höchste 1080p Qualität, viel Speicher |
| max Remux-1080p Deutsch | Remux 1080p | Deutsch | Höchste 1080p Qualität mit dt. Audio |
| min HD-720p Any Language | 720p-1080p | Alle | Internationale Filme |
| min HD-720p Original Language | 720p-1080p | Original | Originalsprache bevorzugt |
| min HD-720p German | 720p-1080p | Deutsch | Deutsche Synchro, flexibel |
| All Quality Original | Alle (SD-4K) | Original | Seltene Filme, Archiv |
| 4K Original Language | 2160p UHD | Original | 4K in Originalsprache |
| HD-1080p Original | 1080p | Original | Standard mit Originalsprache |
| SQP-5 | UHD Remux | Multi | Premium 4K, IMAX Enhanced |
| SQP-1 (1080p) | Bluray 1080p | Multi | Beste 1080p Bluray Releases |
| SQP-1 WEB (1080p) | WEB 1080p | Multi | Beste WEB-DL 1080p |
| SQP-2 | UHD Remux/Bluray | Multi | Hohe 4K Qualität |
| SQP-3 | UHD Remux/WEB | Multi | 4K mit WEB Fallback |
| SQP-4 | WEB 2160p | Multi | 4K WEB-DL (weniger Speicher) |

---

## Standard-Profile (Eigene Konfiguration)

### min HD-720p [Sprache]

Flexibles Profil das mit 720p startet und automatisch auf 1080p upgradet wenn verfügbar. Für ältere Filme, begrenzte Speicherkapazität oder Bandbreitenbeschränkungen beim Streaming.

---

### HD-1080p [Sprache]

Standard 1080p Profil -- der beste Kompromiss zwischen Qualität und Speicherplatz. Tägliche Nutzung, Full HD Fernseher.

---

### max Remux-1080p [Sprache]

Höchstmögliche 1080p Qualität mit Remux-Support (verlustfreie Kopie der Bluray). Für Heimkino-Enthusiasten mit 1080p Projektor und Archivierung in bestmöglicher 1080p Qualität.

---

### 4K [Sprache]

UHD 4K Profil mit HDR/Dolby Vision Support. Für 4K HDR Fernseher oder Projektor, Dolby Vision fähige Geräte.

---

### All Quality Original

Akzeptiert jede verfügbare Qualität von SD bis 4K in Originalsprache. Für seltene oder obskure Filme sowie Archivzwecke wo Verfügbarkeit wichtiger als Qualität ist.

---

## SQP Profile (TRaSH Guides Special Quality Profiles)

Die SQP Profile sind speziell konfigurierte Profile basierend auf den [TRaSH Guides](https://trash-guides.info/SQP/). Sie nutzen Custom Formats mit präzisen Scores um die beste Release-Qualität zu identifizieren. Die genauen Scores und Custom Format Definitionen leben in der Recyclarr-Config im Repo und folgen den TRaSH Guide Updates.

> **Hinweis:** Die detaillierten SQP Guides sind nur im [TRaSH Guides Discord](https://trash-guides.info/discord) verfügbar.

### SQP-1 (1080p) / SQP-1 WEB (1080p)

Optimiert für höchste 1080p Qualität mit Fokus auf renommierte Release-Gruppen. Für qualitätsbewusste Sammler wenn 4K nicht verfügbar oder nicht benötigt.

---

### SQP-2

UHD Profil mit Remux und Bluray Encode Support. Balanciert Qualität und Speicherplatz für 4K HDR Setup. Upgrade-Pfad: WEB -> Encode -> Remux.

---

### SQP-3

UHD Remux-fokussiert mit WEB Fallback. Priorisiert Remux über Encodes. Für Heimkino mit verlustfreiem Audio und Dolby Vision + Atmos Setup.

---

### SQP-4

WEB-DL 2160p fokussiert -- kleinste Dateigrössen bei 4K Qualität. Für limitierten Speicherplatz oder Streaming-Dienst Qualität.

---

### SQP-5

Premium UHD Profil mit IMAX Enhanced Support. Höchste verfügbare Qualität für Premium Heimkino mit Dolby Atmos fähigem Audio-System.

Upgrade-Pfad: WEB-DL 4K (initial) -> HQ Encode -> IMAX Enhanced (final, optional).

---

## Quellen

- [TRaSH Guides - Quality Profiles](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/)
- [TRaSH Guides - Custom Formats](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/)
- [TRaSH Guides - SQP (Discord)](https://trash-guides.info/SQP/)
- [Recyclarr Config Templates](https://github.com/recyclarr/config-templates)

## Verwandte Seiten

- [Arr Stack](./index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
- [Jellyfin](../jellyfin/index.md) -- Media Server der die Inhalte abspielt
- [Profilarr](./profilarr.md) -- Synchronisiert Quality Profiles und Custom Formats (ersetzt notifiarr seit 2026-06-05)
