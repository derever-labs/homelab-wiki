---
title: "Arr-Stack: SQP-Familie"
description: TRaSH-SQP-Profilfamilie (Special Quality Profiles) im Detail -- Quelle, Audio-Haltung und HDR/DV-Strategie je Variante
tags:
  - service
  - media
  - radarr
  - sonarr
---

# Arr-Stack: SQP-Familie

SQP steht für [Special Quality Profiles](https://trash-guides.info/SQP/) der TRaSH Guides — feiner abgestimmte Profile, die sich vor allem in der **Quelle** (WEB / Bluray-Encode / Remux), der **Audio-Haltung** und der **HDR/DV-Strategie** unterscheiden. Über die trash-pcd-Datenbank stehen alle Varianten zur Verfügung; bei uns ist nur ein Teil als Radarr-Profil angelegt.

Die Einordnung in unsere Profile (Radarr-/Sonarr-Übersicht, der Vergleich SQP-3 vs SQP-4 vs SQP-5 und die Setup-Empfehlung) steht in den [Qualitätsprofilen](./referenz.md).

## SQP-1 — streaming-optimiert (1080p / 2160p, je auch WEB-only)

Für Clients, die kein verlustfreies Audio bitstreamen. **Blockiert** verlustfreies/Objekt-Audio (TrueHD ATMOS, DTS X, DTS-HD MA, TrueHD, FLAC, PCM mit −10000) und bevorzugt DD+ Atmos — die Logik: diese Formate kommen nur auf Remuxen vor, die das Profil nicht will. Quellen Bluray-Encode + WEB (1080p bzw. 2160p), kein Remux. Die `WEB`-Varianten beschränken zusätzlich auf WEB-DL/WEBRip. → Bei uns aktiv als **SQP-1 (1080p)**, das 1080p-Hauptprofil.

## SQP-2 — 4K-Allround (Remux + Encode + WEB)

Breitestes 4K-Profil: Remux-2160p, Bluray-2160p-Encode und WEB in einer Hierarchie. Verlustfreies Audio und DV/HDR10+ werden **geboostet** (Remux-Tiers sind enthalten). → Bei uns konfiguriert, aber ungenutzt.

## SQP-3 / SQP-3 (Audio) — Remux-fokussiert

Decke ist **Remux-2160p** (plus Remux-1080p + WEB), **kein** Bluray-Encode-Tier — der Upgrade-Pfad endet auf dem Remux. Verlustfreies Audio geboostet. Die Variante **(Audio)** hebt die Audio-Scores so an, dass ein Remux mit TrueHD ATMOS einen WEB-DL mit DD+ Atmos in der Rangliste schlägt. → Bei uns aktiv als **SQP-3** (wenige Titel).

## SQP-4 / SQP-4 (MA Hybrid) — WEB-only 4K

Reines WEB-DL/WEBRip-4K, **kein** Remux und **kein** Bluray-Encode. Kleinste Dateien, schnell verfügbar, niedrigere Bitrate; WEB liefert DV Profil 5 oder 8.1. Die Variante **(MA Hybrid)** priorisiert WEB-Releases mit injizierter Disc-Tonspur (DTS-HD MA / TrueHD) und blockt rohe 10-bit-Encodes. → Bei uns konfiguriert, ungenutzt.

## SQP-5 — UHD-Bluray-Encode + IMAX Enhanced

HQ-**Encode** statt Remux: Quellen sind Bluray-2160p-Encodes (UHD Bluray Tier 01–03 von Top-Gruppen) + WEB, **kein** 2160p-Remux. Verlustfreies Audio geboostet (gute Encodes behalten oft TrueHD ATMOS), DV geboostet, IMAX Enhanced priorisiert. Spart gegenüber Remux ~50–60 % Platz bei nahezu gleicher Bildqualität. → Bei uns aktiv als **SQP-5**, unser 4K-Profil.

## Verwandte Seiten

- [Qualitätsprofile](./referenz.md) -- Radarr-/Sonarr-Profile, SQP-Vergleich und Setup-Empfehlung
- [Profilarr](./profilarr.md) -- verwaltet und synchronisiert diese Profile nach Radarr/Sonarr
- [Arr Stack](./index.md) -- Sonarr, Radarr, Prowlarr und SABnzbd
