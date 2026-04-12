---
title: Claude Code Config-Sync
description: Geteilte Konfiguration zwischen beiden macOS-Accounts (samuel_ackermann + hslu_samuel_ackermann)
tags:
  - workstation
  - claude-code
  - ssh
---

# Claude Code Config-Sync

Zwei macOS-Accounts (`samuel_ackermann` und `hslu_samuel_ackermann`) teilen sich Claude Code Konfiguration über Symlinks und zwei Gitea-Repos.

## Architektur

```d2
direction: down

SharedStorage: "Shared Storage (/Users/Shared/git/)" {
  style.stroke-dash: 4
  gitea: "gitea/" {
    style.stroke-dash: 4
    CS: "claude-skills/ (4 Skills)" { style.border-radius: 8 }
    DF: "dotfiles/ (SSH config + CLAUDE.md)" { style.border-radius: 8 }
  }
  github: "github/" {
    style.stroke-dash: 4
    CMD: "HSLU_DC/agents/commands/ (Slash-Commands)" { style.border-radius: 8 }
  }
}

hslu: "~hslu/.claude/" {
  style.stroke-dash: 4
  HS: "skills ->" { style.border-radius: 8 }
  HC: "commands ->" { style.border-radius: 8 }
  HM: "CLAUDE.md ->" { style.border-radius: 8 }
}

samuel: "~samuel/.claude/" {
  style.stroke-dash: 4
  SS: "skills ->" { style.border-radius: 8 }
  SC: "commands ->" { style.border-radius: 8 }
  SM: "CLAUDE.md ->" { style.border-radius: 8 }
}

hslu.HS -> SharedStorage.gitea.CS
samuel.SS -> SharedStorage.gitea.CS
hslu.HC -> SharedStorage.github.CMD
samuel.SC -> SharedStorage.github.CMD
hslu.HM -> SharedStorage.gitea.DF
samuel.SM -> SharedStorage.gitea.DF
```

## Was geteilt wird vs. pro User

- **Skills** -- geteilt via Symlink auf `gitea:sam/claude-skills`
- **Commands** -- geteilt via Symlink auf `github:HSLU_DC/agents/commands`
- **CLAUDE.md** -- geteilt via Symlink auf `gitea:sam/dotfiles/claude.md`
- **SSH Config** -- geteilt via `Include`-Direktive auf `gitea:sam/dotfiles/ssh-config-shared`
- **settings.json** -- pro User, manuell synchronisiert
- **.claude.json** -- pro User (MCP Server, State)

## SSH-Key-Verwaltung via 1Password

SSH Keys werden über den 1Password SSH Agent bereitgestellt. Keine Key-Dateien auf Disk nötig für neue Verbindungen.

- Der SSH Agent erkennt nur Keys im **persönlichen Vault** ("Persönlich"/"Private"). Team-Vaults funktionieren nicht.
- Ohne `agent.toml` nutzt der Agent automatisch alle SSH Keys aus dem persönlichen Vault.
- Jeder User hat eine eigene `~/.ssh/config` mit `Include`-Direktive auf die geteilte Config.

## Berechtigungskonzept

Alle Shared-Verzeichnisse nutzen die Gruppe `github` mit setgid-Bit. Siehe `gitea:sam/dotfiles/setup-permissions.sh`.

- **Verzeichnisse:** 2775 (`drwxrwsr-x`) -- setgid sorgt für Gruppen-Vererbung
- **Dateien:** 664 (`-rw-rw-r--`)
- **Scripts:** 775 (`-rwxrwxr-x`)
- **ssh-config-shared:** 644 (`-rw-r--r--`) -- SSH verweigert group-writable Configs
- **`.git/`-Interna:** `setup-permissions.sh` setzt `g+w` und `g+s` auf alle `.git/`-Verzeichnisse und -Dateien. `core.sharedRepository = group` sorgt dafür dass neue Objekte korrekt erstellt werden. Bei "Permission denied" in einem Repo: `sudo chmod -R g+w /path/to/repo/.git`
- **safe.directory:** Muss für beide User in `.gitconfig` konfiguriert sein

## Neuen Skill hinzufügen

1. Skill-Verzeichnis mit `SKILL.md` in `gitea:sam/claude-skills/` erstellen
2. Committen und pushen -- beide User sehen den Skill sofort via Symlink

## Neuen SSH Host hinzufügen

1. Host-Eintrag in `gitea:sam/dotfiles/ssh-config-shared` einfügen
2. Permissions prüfen: Datei muss 644 bleiben (nicht 664!)
3. Committen und pushen -- beide User haben den Host sofort

## Statusline: ccstatusline + kanban-code

Beide User nutzen [ccstatusline](https://github.com/sirmalloc/ccstatusline) (npm global) für die Claude Code Statusline. Die Config ist geteilt via Symlink auf `gitea:sam/dotfiles/ccstatusline-settings.json`.

**kanban-code Integration (nur hslu_samuel_ackermann):**

`hslu_samuel_ackermann` nutzt zusätzlich kanban-code, das Session-Context-Daten (Token-Verbrauch, Kosten, Modell) nach `~/.kanban-code/context/<session_id>.json` schreibt. Dies läuft als unsichtbares **Custom Command Widget** in ccstatusline:

- Widget-Typ: `custom-command` mit `maxWidth: 0` (keine sichtbare Ausgabe)
- Kommando: `[ -x "$HOME/.kanban-code/statusline.sh" ] && "$HOME/.kanban-code/statusline.sh" >/dev/null; true`
- Der Existenz-Check (`-x`) sorgt dafür, dass `samuel_ackermann` (ohne kanban-code) nicht betroffen ist
- ccstatusline leitet den vollen Claude Code JSON-Payload via stdin weiter -- kanban-code erhält dieselben Daten wie als eigene Statusline

**kanban-code Hooks (unabhängig von Statusline):**

Die kanban-code Event-Hooks (`~/.kanban-code/hook.sh`) laufen separat über die Claude Code Hook-Events (SessionStart, SessionEnd, Stop, Notification, UserPromptSubmit) und sind nicht von der Statusline-Konfiguration abhängig.

## Gitea API Zugang

Die Gitea API ist von lokal nur via SSH-Tunnel erreichbar:

1. Tunnel: `ssh -fN -L 13000:gitea.service.consul:3003 vm-nomad-client-05`
2. API: `curl -u "sam:<passwort>" http://localhost:13000/api/v1/...`
3. Passwort: 1Password Item "Gitea" im Private Vault

## Verwandte Seiten

- [ClickUp Multi-Instance](./clickup-multi-instance.md) -- Zwei ClickUp-Instanzen gleichzeitig auf macOS
- [SSH-Zugang](../_referenz/ssh-zugang.md) -- SSH-Benutzer und Zugangsregeln
- [Credentials](../_referenz/credentials.md) -- Speicherorte von Zugangsdaten
