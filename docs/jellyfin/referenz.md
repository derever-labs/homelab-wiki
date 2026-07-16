---
title: Jellyfin Referenz
description: Referenz-Tabellen -- Hardware-Transcoding-Codecs, Storage-Mounts, Traefik-Router und Wartungsbanner-CSS
tags:
  - service
  - media
  - referenz
---

# Jellyfin Referenz

Diese Seite bündelt die Referenz von Jellyfin: die Hardware-Transcoding-Konfiguration, die Storage-Mounts und das Traefik-Routing inklusive Streaming-Bypass und Wartungsbanner. Architektur und Steckbrief stehen in der [Jellyfin Übersicht](./index.md), die Betriebsprozeduren in [Jellyfin Betrieb](./betrieb.md).

## Hardware-Transcoding

Jellyfin nutzt **Intel QuickSync (QSV)** über die Intel Iris Xe iGPU der MS-01 Hosts. Die iGPU wird per Full Passthrough von Proxmox an die Nomad-Client VMs durchgereicht (`/dev/dri/renderD128`). Beide Nodes (client-05/06) haben GPU-Zugriff, sodass Jellyfin auf jedem der beiden Nodes HW-Transcoding nutzen kann.

### Konfiguration

| Einstellung | Wert | Begründung |
| :--- | :--- | :--- |
| Hardware-Beschleunigung | Intel QuickSync (QSV) | Iris Xe, 96 EU, zwei MFX-Engines |
| Decode | H.264, HEVC (8/10/12-bit), VP9, AV1 | Alle relevanten Quell-Codecs |
| Encode | H.264 (h264_qsv) | HEVC-Encoding deaktiviert -- H.264 ist ~2x schneller und browser-kompatibler |
| Tone Mapping | OpenCL (hable) | HDR10/HLG/DoVi → SDR. VPP deaktiviert wegen Regression-Bug in 10.11.x (Issue #15576) |
| Low-Power Encoder | Aus (in UI) | Auf Alder Lake im Kernel automatisch aktiv |
| Preset | fast | Guter Kompromiss aus Qualität und Speed |
| Segment-Löschung | An | Verhindert unbegrenztes Cache-Wachstum |

### Warum H.264 statt HEVC als Output

HEVC-Encoding ist nur in Safari nativ abspielbar. H.264 funktioniert in allen Browsern, ist ~2x schneller beim Encoding, und bei 20 Mbps 1080p Zielbitrate ist der Qualitätsunterschied vernachlässigbar. Infuse/Apple TV nutzen Direct Play und sind nicht betroffen.

### Performance

Die Iris Xe schafft 10+ gleichzeitige 4K-Transcodes bei nahe null CPU-Last. Ein typischer 4K HDR HEVC → 1080p H.264 SDR Transcode läuft mit ~4-6x Echtzeit.

### Bekannte Einschränkungen

- **OpenCL Tone Mapping Bug (#15576):** In 10.11.x kann HDR-Content pixelig aussehen. Falls Artifacts auftreten: VPP testen oder auf 10.12.x warten.
- **Seeking bei 4K:** Nach einem Sprung startet ein neuer Transcode -- das kann 2-3 Sekunden dauern bis der Buffer gefüllt ist.

Transcode-Dateien und Caches werden auf dem lokalen `/tmp/jellyfin/`-Verzeichnis der VM abgelegt (nicht auf NFS), um die Schreiblast vom NAS fernzuhalten. Ein Prestart-Task im Nomad Job räumt bei jedem Start alte Caches auf.

## Storage

| Mount | Pfad im Container | Pfad auf Host | Typ |
| :--- | :--- | :--- | :--- |
| Config | `/config` | CSI Volume `jellyfin-config` | Linstor (DRBD-repliziert) |
| Cache | `/config/cache` | `/tmp/jellyfin/cache` | Lokal (flüchtig) |
| Transcodes | `/config/data/transcodes` | `/tmp/jellyfin/transcodes` | Lokal (flüchtig) |
| Medienbibliothek | `/jellyfin` | `/nfs/jellyfin` | NFS ([NAS](../storage/nas/index.md)) |

::: info Lokaler Cache
Die Cache- und Transcode-Verzeichnisse liegen bewusst auf der lokalen SSD statt auf NFS. Das reduziert die Netzwerklast und verbessert die Transcoding-Performance erheblich.
:::

## Traefik-Routing und Streaming-Bypass

Vor Jellyfin laufen drei Traefik-Router nebeneinander:

- **`jellyfin`** -- Default-Router für die Web-UI und Item-/Image-/JSON-Endpoints. Middleware-Chain `public-noauth@file` mit Crowdsec, Security-Headers und Error-Pages. Der [Wartungsbanner](../banner/index.md) kommt nicht mehr aus dieser Chain, sondern über Jellyfins Custom-CSS (siehe unten).
- **`jellyfin-login`** (Priority 10) -- nur `/Users/AuthenticateByName`. Gleiche Chain plus Rate-Limit gegen Brute-Force.
- **`jellyfin-stream`** (Priority 100) -- alle binären oder streaming-ähnlichen Pfade. Chain bewusst kürzer: nur `crowdsec@file` und `secure-headers@file` -- **kein `error-pages`** (das würde sonst HTML in Binär-/Range-Antworten schreiben). Historisch lief hier auch kein `banner-inject`/`force-identity-encoding`; beide sind inzwischen global zurückgebaut.

Hintergrund zum Stream-Router: Ursprünglich war der grössere Treiber `plugin-rewritebody` (= `banner-inject`), das die komplette Response pufferte -- bei multi-GB Videos und HLS-Segmenten zerstörte das `Content-Length` und blockierte `Range`-Requests (HTTP 206 Partial Content); Clients wie **Infuse** brachen mit "Ein Fehler ist aufgetreten -- Beim Laden des Inhaltes" ab. Seit dem `banner-inject`-Rueckbau bleibt als Grund für den Bypass `error-pages`, das keine HTML-Fehlerseiten in Binär-Streams schreiben darf.

Die Stream-Bypass-Rule deckt folgende Pfad-Familien ab (Quelle: Jellyfin-Controller plus Praxiserfahrung):

- `/Videos/*` -- Direct-Stream, HLS-Master/Variant/Segments, Trickplay, eingebettete Subtitles und Attachments
- `/Audio/*` -- Direct, Universal-Audio (Transcode-Fallback), HLS
- `/LiveRecordings/`, `/LiveStreamFiles/` -- LiveTV
- `/Items/<id>/Download` und `/Items/<id>/File` -- vollständige Datei-Direktzugriffe
- `/Providers/Subtitles/` -- Remote-Subtitle-Download
- `/Playback/BitrateTest` -- bis 100 MB Zufalls-Bytes für Bandwidth-Estimation
- `/FallbackFont/Fonts/` -- Font-Dateien für Subtitle-Rendering
- `/websocket` -- sicherheitshalber, obwohl Traefik WebSockets üblicherweise transparent durchreicht

Die Rule nutzt `PathRegexp` mit `(?i)`, weil Jellyfins ASP.NET-Routing case-insensitive matched, Traefik aber case-sensitive ist. Quelldatei: `media/jellyfin.nomad` im Repo `derever-labs/homelab-nomad-jobs`.

::: info Was läuft durch die Default-Chain
Web-UI (`/web/*`), JSON-APIs (`/Users/...`, `/Library/...`, `/Sessions/*`, `/Items/{id}/PlaybackInfo`) und Poster-/Thumbnail-Bilder (`/Items/{id}/Images/*`) laufen durch die Default-Chain (`crowdsec`, `secure-headers`, `error-pages`). Der Wartungsbanner kommt hier nicht mehr aus der Chain, sondern über Jellyfins Custom-CSS (siehe nächster Abschnitt).
:::

## Wartungsbanner via Custom-CSS

Der Wartungsbanner wird nicht mehr von Traefik in die HTML-Antwort injiziert, sondern über Jellyfins **Benutzerdefiniertes CSS** (Dashboard -> Allgemein) eingebunden: eine `@import`-Zeile lädt `banner.ackermannprivat.ch/banner.css`, das Pocketbase je nach `banner_config` server-seitig rendert. Der Import steht hinter dem Ultrachromic-Theme-Import und ist inaktiv, solange kein Banner geschaltet ist. Vollständige Mechanik und Pflege: [Wartungsbanner](../banner/index.md).

Damit entfällt der ursprüngliche `banner-inject`-Grund des Streaming-Bypass oben -- die `plugin-rewritebody`-Pufferung berührt Jellyfin nicht mehr. Der Stream-Router bleibt trotzdem sinnvoll, weil er auch `error-pages` von binären Pfaden fernhält.

## Verwandte Seiten

- [Jellyfin (Übersicht)](./index.md) -- Steckbrief, Architektur und Abhängigkeiten
- [Jellyfin Betrieb](./betrieb.md) -- Authentifizierung, IPv6, täglicher Restart, Kurator-Playlists
- [Proxmox](../proxmox/index.md) -- GPU Full Passthrough der Iris Xe
- [Wartungsbanner](../banner/index.md) -- Banner-Mechanik und Pflege
