# Radarr Quality Profiles

Diese Dokumentation beschreibt alle konfigurierten Quality Profiles in Radarr und gibt Empfehlungen basierend auf den [TRaSH Guides](https://trash-guides.info/).

## Übersicht

| ID | Profil | Ziel-Qualität | Sprache | Empfohlen für |
|----|--------|---------------|---------|---------------|
| 3 | min HD-720p English | 720p-1080p | Englisch | Ältere Filme, begrenzte Bandbreite |
| 4 | HD-1080p English | 1080p | Englisch | Standard-Nutzung, gute Qualität |
| 5 | 4K English | 2160p UHD | Englisch | 4K TV/Projektor, beste Qualität |
| 8 | HD-1080p Deutsch | 1080p | Deutsch | Deutsche Synchro bevorzugt |
| 10 | HD-1080p French | 1080p | Französisch | Französische Filme |
| 11 | max Remux-1080p English | Remux 1080p | Englisch | Höchste 1080p Qualität, viel Speicher |
| 12 | max Remux-1080p Deutsch | Remux 1080p | Deutsch | Höchste 1080p Qualität mit dt. Audio |
| 13 | min HD-720p Any Language | 720p-1080p | Alle | Internationale Filme |
| 14 | min HD-720p Original Language | 720p-1080p | Original | Originalsprache bevorzugt |
| 15 | min HD-720p German | 720p-1080p | Deutsch | Deutsche Synchro, flexibel |
| 18 | All Quality Original | Alle (SD-4K) | Original | Seltene Filme, Archiv |
| 19 | 4K Original Language | 2160p UHD | Original | 4K in Originalsprache |
| 20 | HD-1080p Original | 1080p | Original | Standard mit Originalsprache |
| 21 | SQP-5 | UHD Remux | Multi | Premium 4K, IMAX Enhanced |
| 22 | SQP-1 (1080p) | Bluray 1080p | Multi | Beste 1080p Bluray Releases |
| 23 | SQP-1 WEB (1080p) | WEB 1080p | Multi | Beste WEB-DL 1080p |
| 24 | SQP-2 | UHD Remux/Bluray | Multi | Hohe 4K Qualität |
| 25 | SQP-3 | UHD Remux/WEB | Multi | 4K mit WEB Fallback |
| 26 | SQP-4 | WEB 2160p | Multi | 4K WEB-DL (weniger Speicher) |

---

## Standard-Profile (Eigene Konfiguration)

### min HD-720p [Sprache]
**Profile:** 3, 13, 14, 15

**Beschreibung:** Flexibles Profil das mit 720p startet und automatisch auf 1080p upgradet wenn verfügbar.

**Erlaubte Qualitäten:**
- HDTV-720p, WEB 720p, Bluray-720p
- HDTV-1080p, WEB 1080p, Bluray-1080p

**Anwendungsfall:**
- Ältere Filme die möglicherweise nicht in höherer Qualität existieren
- Begrenzte Speicherkapazität
- Bandbreitenbeschränkungen beim Streaming

**Durchschnittliche Dateigrösse:** 4-10 GB

---

### HD-1080p [Sprache]
**Profile:** 4, 8, 10, 20

**Beschreibung:** Standard 1080p Profil - der beste Kompromiss zwischen Qualität und Speicherplatz.

**Erlaubte Qualitäten:**
- HDTV-1080p, WEB 1080p, Bluray-1080p

**Anwendungsfall:**
- Tägliche Nutzung
- Full HD Fernseher
- Gute visuelle Qualität ohne exzessiven Speicherbedarf

**Durchschnittliche Dateigrösse:** 6-15 GB

---

### max Remux-1080p [Sprache]
**Profile:** 11, 12

**Beschreibung:** Höchstmögliche 1080p Qualität mit Remux-Support (verlustfreie Kopie der Bluray).

**Erlaubte Qualitäten:**
- HDTV-1080p, WEB 1080p, Bluray-1080p
- **Remux-1080p** (höchste Priorität)

**Anwendungsfall:**
- Heimkino-Enthusiasten mit 1080p Projektor
- Beste Audioqualität (TrueHD, DTS-HD MA)
- Archivierung in bestmöglicher 1080p Qualität

**Durchschnittliche Dateigrösse:** 20-40 GB

---

### 4K [Sprache]
**Profile:** 5, 19

**Beschreibung:** UHD 4K Profil mit HDR/Dolby Vision Support.

**Erlaubte Qualitäten:**
- Bluray-720p (Fallback)
- HDTV-1080p, WEB 1080p, Bluray-1080p
- HDTV-2160p, WEB 2160p, Bluray-2160p
- Remux-2160p

**Anwendungsfall:**
- 4K HDR Fernseher oder Projektor
- Dolby Vision fähige Geräte
- Maximale visuelle Qualität

**Durchschnittliche Dateigrösse:** 20-60 GB (Encode), 50-100 GB (Remux)

---

### All Quality Original
**Profil:** 18

**Beschreibung:** Akzeptiert jede verfügbare Qualität von SD bis 4K in Originalsprache.

**Erlaubte Qualitäten:** Alle (SDTV bis Remux-2160p, inkl. BR-DISK)

**Anwendungsfall:**
- Seltene oder obskure Filme
- Archivzwecke wo Verfügbarkeit wichtiger als Qualität ist
- Filme die nur in niedriger Qualität existieren

**Durchschnittliche Dateigrösse:** Variabel (1-100+ GB)

---

## SQP Profile (TRaSH Guides Special Quality Profiles)

Die SQP Profile sind speziell konfigurierte Profile basierend auf den [TRaSH Guides](https://trash-guides.info/SQP/). Sie nutzen Custom Formats mit präzisen Scores um die beste Release-Qualität zu identifizieren.

> **Hinweis:** Die detaillierten SQP Guides sind nur im [TRaSH Guides Discord](https://trash-guides.info/discord) verfügbar.

### SQP-1 (1080p) / SQP-1 WEB (1080p)
**Profile:** 22, 23

**Beschreibung:** Optimiert für höchste 1080p Qualität mit Fokus auf renommierte Release-Gruppen.

**Erlaubte Qualitäten:**
- Bluray-720p (Fallback)
- Bluray-1080p, WEB-1080p (gruppiert)

**Custom Format Scoring:**
| Format | Score |
|--------|-------|
| TrueHD | 2750 |
| DTS-HD MA | 2500 |
| FLAC/PCM | 2250 |
| HD Bluray Tier 01 | 1800 |
| HD Bluray Tier 02 | 1750 |
| WEB Tier 01 | 1700 |

**Minimum Format Score:** 1000

**Anwendungsfall:**
- Beste verfügbare 1080p Releases
- Qualitätsbewusste Sammler
- Wenn 4K nicht verfügbar oder nicht benötigt

**Durchschnittliche Dateigrösse:** 8-20 GB

---

### SQP-2
**Profil:** 24

**Beschreibung:** UHD Profil mit Remux und Bluray Encode Support. Balanciert Qualität und Speicherplatz.

**Erlaubte Qualitäten:**
- Remux-1080p (Fallback)
- WEB-2160p, Remux-2160p, Bluray-2160p (gruppiert)

**Custom Format Scoring:**
| Format | Score |
|--------|-------|
| UHD Bluray Tier 01 | 2300 |
| UHD Bluray Tier 02 | 2200 |
| UHD Bluray Tier 03 | 2100 |
| Remux Tier 01-03 | 1850-1950 |
| WEB Tier 01-03 | 1600-1700 |
| DV/HDR Formate | 1500 |

**Minimum Format Score:** 550

**Anwendungsfall:**
- 4K HDR Setup
- Guter Kompromiss zwischen Encode und Remux
- Upgrade-Pfad: WEB -> Encode -> Remux

**Durchschnittliche Dateigrösse:** 15-50 GB

---

### SQP-3
**Profil:** 25

**Beschreibung:** UHD Remux-fokussiert mit WEB Fallback. Priorisiert Remux über Encodes.

**Erlaubte Qualitäten:**
- Remux-1080p (Fallback)
- WEB-2160p, Remux-2160p (gruppiert, kein Bluray Encode)

**Custom Format Scoring:**
| Format | Score |
|--------|-------|
| Remux Tier 01 | 1950 |
| Remux Tier 02 | 1900 |
| Remux Tier 03 | 1850 |
| WEB Tier 01-03 | 1600-1700 |
| DV/HDR | 1500 |
| IMAX/IMAX Enhanced | 800 |

**Minimum Format Score:** 550

**Anwendungsfall:**
- Maximale Qualität ohne Bluray Encodes
- Heimkino mit verlustfreiem Audio
- Dolby Vision + Atmos Setup

**Durchschnittliche Dateigrösse:** 40-80 GB

---

### SQP-4
**Profil:** 26

**Beschreibung:** WEB-DL 2160p fokussiert - kleinste Dateigrössen bei 4K Qualität.

**Erlaubte Qualitäten:**
- WEB-2160p nur

**Custom Format Scoring:**
Identisch zu SQP-3, aber nur WEB Qualitäten erlaubt.

**Minimum Format Score:** 550

**Anwendungsfall:**
- 4K Qualität mit minimalem Speicherbedarf
- Streaming-Dienst Qualität (Netflix, Disney+, etc.)
- Limitierter Speicherplatz

**Durchschnittliche Dateigrösse:** 10-25 GB

---

### SQP-5
**Profil:** 21

**Beschreibung:** Premium UHD Profil mit IMAX Enhanced Support. Höchste verfügbare Qualität.

**Erlaubte Qualitäten:**
- Remux-1080p (Fallback)
- WEBDL-2160p, Bluray-2160p (gruppiert)

**Custom Format Scoring:**
| Format | Score |
|--------|-------|
| TrueHD ATMOS | 5000 |
| DTS X | 4500 |
| ATMOS/DD+ ATMOS | 3000 |
| UHD Bluray Tier 01-03 | 2100-2300 |
| Remux Tier 01-03 | 1850-1950 |

**Minimum Format Score:** 550

**Upgrade-Pfad:**
1. WEB-DL 4K (initial)
2. HQ Encode (upgrade)
3. IMAX Enhanced (final, optional)

**Anwendungsfall:**
- Premium Heimkino
- Dolby Atmos fähiges Audio-System
- IMAX Enhanced Releases bevorzugt
- Archivierung in höchster Qualität

**Durchschnittliche Dateigrösse:** 30-80 GB

---

## Entscheidungshilfe

### Nach Speicherplatz

| Verfügbarer Speicher | Empfohlenes Profil |
|---------------------|-------------------|
| Begrenzt (<2TB) | min HD-720p oder SQP-4 |
| Mittel (2-10TB) | HD-1080p oder SQP-1 |
| Gross (10-50TB) | 4K oder SQP-2 |
| Sehr gross (>50TB) | SQP-3 oder SQP-5 |

### Nach Hardware

| Setup | Empfohlenes Profil |
|-------|-------------------|
| 1080p TV | HD-1080p oder SQP-1 |
| 4K TV (SDR) | 4K (ohne HDR CFs) |
| 4K TV (HDR) | 4K oder SQP-2 |
| 4K TV (Dolby Vision) | SQP-2, SQP-3 oder SQP-5 |
| Projektor 1080p | max Remux-1080p |
| Projektor 4K | SQP-3 oder SQP-5 |
| Dolby Atmos System | SQP-5 |

### Nach Sprache

| Präferenz | Empfohlenes Profil |
|-----------|-------------------|
| Englisch (OV) | *English Varianten |
| Deutsche Synchro | *Deutsch Varianten |
| Originalsprache | *Original Varianten |
| Egal | *Any Language oder SQP |

---

## Custom Formats Erklärung

Die SQP Profile nutzen Custom Formats um Releases zu bewerten:

### Video Qualität
- **Remux Tier 01-03**: Release-Gruppen Qualitätsstufen (FraMeSToR, BHDStudio, etc.)
- **UHD Bluray Tier 01-03**: Encoder Qualitätsstufen
- **WEB Tier 01-03**: Streaming-Dienst Qualität

### HDR Formate
- **DV HDR10+**: Dolby Vision mit HDR10+ Fallback (beste Kompatibilität)
- **DV HDR10**: Dolby Vision mit HDR10 Fallback
- **HDR10+**: Samsung HDR Format
- **HDR10**: Standard HDR

### Audio Formate
- **TrueHD ATMOS**: Verlustfreies Dolby Atmos (höchste Qualität)
- **DTS X**: Objekt-basiertes DTS Audio
- **DTS-HD MA**: Verlustfreies DTS
- **DD+ ATMOS**: Lossy Dolby Atmos (Streaming)

### Spezial
- **IMAX Enhanced**: Optimiert für IMAX Wiedergabe
- **Remaster/4K Remaster**: Neu gemasterte Versionen
- **Criterion Collection**: Hochwertige Restaurierungen

---

## Quellen

- [TRaSH Guides - Quality Profiles](https://trash-guides.info/Radarr/radarr-setup-quality-profiles/)
- [TRaSH Guides - Custom Formats](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/)
- [TRaSH Guides - SQP (Discord)](https://trash-guides.info/SQP/)
- [Recyclarr Config Templates](https://github.com/recyclarr/config-templates)
