---
title: Wiki-Richtlinien
description: Regeln und Best Practices fuer diese Dokumentation
tags:
  - meta
  - guidelines
---

# Wiki-Richtlinien

Diese Seite definiert die Regeln fuer Inhalt, Struktur und Pflege dieses Wikis.

## Grundprinzip

Das Wiki erklaert das **Warum** und **Wie es zusammenhaengt**. Das Git-Repository enthaelt das **Was** (Code, Config, Jobs).

## Inhalt

### Was ins Wiki gehoert

- Architektur-Entscheidungen und deren Begruendung
- Konzeptionelle Erklaerungen (wie Komponenten zusammenspielen)
- Tabellen mit Uebersichtsdaten (Hosts, IPs, Services, URLs)
- ASCII-Diagramme fuer Architektur und Datenfluesse
- Runbooks mit knappen Schritt-Beschreibungen

### Was NICHT ins Wiki gehoert

- **Keine Code-Bloecke** (HCL, YAML, JSON, TOML, INI) — stattdessen Verweis auf die Repo-Datei
- **Keine CLI-Befehle** in Bash-Bloecken — hoechstens als Inline-Code (`befehl`) wenn unverzichtbar
- **Keine Konfigurationsdateien** — "Verwaltet durch Ansible" oder "Siehe `pfad/zur/datei`"
- **Keine Installationsanleitungen** — gehoeren ins Repo (README, Ansible Roles)

## Single Source of Truth

Jede Information existiert an genau **einem** Ort. Andere Seiten verlinken dorthin.

| Daten | Kanonische Quelle |
|-------|-------------------|
| Hosts, VMs, IPs, Specs | [Proxmox Cluster](../02-infrastructure/proxmox-cluster.md) |
| NFS-Exports, Mount-Pfade | [NAS-Speicher](../02-infrastructure/storage-nas.md) |
| Service-Verzeichnis (URLs) | [Infrastruktur-Uebersicht](../01-architecture/overview.md) |
| Middleware Chains | [Traefik Middlewares](../03-platforms/traefik-middlewares.md) |
| Backup-Architektur | [Backup-Strategie](../04-services/core/backup-strategy.md) |

## Struktur

### Verzeichnisse

| Ordner | Inhalt |
|--------|--------|
| 01-architecture/ | Gesamtuebersicht, Datenstrategie, Netzwerk |
| 02-infrastructure/ | Proxmox, Storage, Netzwerk-Hardware |
| 03-platforms/ | HashiCorp Stack, Traefik, Linstor, Security |
| 04-services/ | Einzelne Services (core, media, monitoring, productivity, iot) |
| 05-runbooks/ | Betriebsanleitungen fuer Wartung und Notfaelle |
| 06-meta/ | Wiki-Richtlinien und Metadaten |

### Dateinamen

- Kleinbuchstaben mit Bindestrichen: `proxmox-cluster.md`, `backup-strategy.md`
- Keine Leerzeichen, keine Umlaute im Dateinamen

### Frontmatter

Jede Seite beginnt mit YAML-Frontmatter:

```yaml
---
title: Seitentitel auf Deutsch
description: Kurze Beschreibung
tags:
  - relevantes-tag
---
```

### Titel

- **Sprache:** Deutsch
- **Gross-/Kleinschreibung:** Wie im normalen Satz (kein Title Case)
- **Kein "ss" statt "ss":** Schweizer Rechtschreibung (kein Eszett)

## Verlinkung

- Relative Pfade verwenden: `[Text](../02-infrastructure/proxmox-cluster.md)`
- Bei Verweisen auf spezifische Abschnitte: `[Text](datei.md#abschnitt)`
- Lieber einmal verlinken als Inhalte duplizieren
