---
title: ClickUp Multi-Instance
description: Zwei ClickUp-Instanzen gleichzeitig auf macOS (HSLU + PRIVAT)
tags:
  - workstation
  - clickup
---

# ClickUp Multi-Instance

Zwei ClickUp Desktop-Apps laufen gleichzeitig mit getrennten Accounts (HSLU und PRIVAT).

## Funktionsweise

ClickUp ist eine Electron-App. Electron verwendet den `user-data-dir`-Pfad als Singleton-Lock. Zwei Wrapper-Apps starten dieselbe ClickUp-Binary mit unterschiedlichen Datenverzeichnissen:

- **ClickUp HSLU** -> `~/Library/Application Support/ClickUp-HSLU`
- **ClickUp PRIVAT** -> `~/Library/Application Support/ClickUp-PRIVAT`

Die Wrapper-Apps sind minimale `.app`-Bundles (~1 KB) mit eigenem `CFBundleIdentifier`, die die Original-Binary aus `/Applications/ClickUp.app` aufrufen. So bleiben Notifications, Dock-Icons und Shortcuts vollständig erhalten.

## Einrichtung und Updates

Das Setup-Script liegt im Gitea-Repo `dotfiles/clickup-multi-instance.sh`. Nach jedem ClickUp-Update erneut ausführen:

```bash
bash /Users/Shared/git/gitea/dotfiles/clickup-multi-instance.sh
```

## Struktur

- `/Applications/ClickUp.app` -- Original (wird via Auto-Update aktualisiert, nicht direkt starten)
- `/Applications/ClickUp HSLU.app` -- Wrapper für HSLU-Account
- `/Applications/ClickUp PRIVAT.app` -- Wrapper für PRIVAT-Account

## Bekannte Einschränkungen

- Nach einem ClickUp-Update das Script erneut ausführen (Icons werden neu kopiert)
- Gatekeeper zeigt beim ersten Start eine Warnung (einmalig bestätigen)
- Die Original-App (`ClickUp.app`) sollte nicht direkt gestartet werden, da sie das Default-Datenverzeichnis verwendet

## Verwandte Seiten

- [Claude Code Config-Sync](./claude-code-sync.md) -- Geteilte Konfiguration zwischen macOS-Accounts
