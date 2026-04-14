---
title: Claude Task-Tracking (Privat)
description: Wie Claude Code Homelab-Aufgaben über ClickUp-Tasks im privaten Workspace trackt
tags:
  - claude-code
  - clickup
  - workstation
---

# Claude Task-Tracking (Privat)

Damit Homelab-Arbeit über `/clear`, `/compact` und Session-Ende hinweg nicht verloren geht, legt Claude Code bei mehrschrittigen Aufgaben initial einen ClickUp-Task an, führt die Schritte dort als Checkliste und schliesst den Task selbst, sobald die Aufgabe fertig ist.

Diese Seite dokumentiert die Defaults für den privaten Workspace `clickup-privat`. Die äquivalente Seite für den HSLU-Workspace liegt im AI-Wiki unter `claude-code/task-tracking`.

## Wann wird ein Task angelegt

- Aufgabenklasse **Standard** (2--5 Dateien) oder **Complex** (ab 6 Dateien, Architektur-Entscheidungen)
- zusätzlich: mindestens 2 erwartete Arbeitsschritte **oder** erwartete Dauer über 15 Minuten
- Trivial-Aufgaben (1 Datei, offensichtlich) bekommen **keinen** Task -- dort übersteigt der Overhead den Nutzen

Die Aufgabenklassifikation stammt aus der globalen `config/AGENT.md` im `HSLU-DC/agents`-Repo und gilt für beide Workspaces identisch.

## Workspace-Wahl

Claude wählt den ClickUp-Workspace anhand des aktuellen Arbeitsverzeichnisses:

- Repo unter `github/HSLU_DC/` → Workspace `clickup-hslu` (siehe AI-Wiki)
- alles andere (Homelab, Privat-Repos, `/Users/Shared/git`) → Workspace `clickup-privat` (hier dokumentiert)

## Default-Liste

Im privaten Workspace ist die Default-Liste für Claude-Work im Homelab-Kontext:

- Liste: **IT Generell** (Pfad: Haus Lenzburg / IT)
- List-ID: **`901504641206`**

Diese Liste ist der Default für Homelab-, Infrastruktur- und `immo-monitor`-Arbeit. Wenn der Scope eines Auftrags offensichtlich nicht in `IT Generell` gehört -- zum Beispiel eine reine Familie-/Finanz-Aufgabe oder ein nicht-IT-Thema -- fragt Claude nach der richtigen Liste, statt falsch einzusortieren.

## Kein Claude-Label

Im privaten Workspace existiert (derzeit) kein `Claude`-Custom-Field. Claude legt Tasks im Privat-Workspace daher ohne Label an. Wenn später ein Label eingeführt werden soll, ist dieser Abschnitt der Ort, an dem die Field-/Option-ID dokumentiert wird.

## Ablauf

### Duplikat-Check

Vor jeder Neuanlage durchsucht Claude die Default-Liste nach offenen Tasks mit passenden Keywords aus dem Scope. Bei Treffer fragt Claude kurz, ob der bestehende Task fortgesetzt oder ein neuer angelegt werden soll -- beides stillschweigend zu tun wäre Doppelspurigkeit.

### Anlage

Der Scope wandert in die Task-Beschreibung, die geplanten Schritte werden als Checkliste eingetragen.

### Checklist-Pflege

Items werden sofort nach Abschluss gehakt -- nie gebatcht am Sessionende. Taucht ein neuer Schritt auf, der ursprünglich nicht geplant war, ergänzt Claude ihn als neues Checklist-Item; stillschweigendes Weiterarbeiten wäre Scope-Creep, der später nicht mehr rekonstruierbar ist.

### Schliessen

Claude schliesst den Task selbst, sobald die Aufgabe fertig ist -- nicht erst am Sessionende und nicht erst auf User-Zuruf. Offene Punkte, die sich am Ende herausstellen, wandern zurück in den Task als neue Checklist-Items oder als Kommentar.

### Resume

Verweist der User explizit auf einen bestehenden Task (per Task-ID, Titel oder Link), lädt Claude den Task direkt, liest den Checklist-State und setzt dort fort. Der Duplikat-Check entfällt in diesem Fall.

## Defaults anpassen

Diese Seite ist bewusst der Ort, an dem die Privat-Defaults gepflegt werden -- zusammen mit der globalen Regel in `config/AGENT.md` im `HSLU-DC/agents`-Repo.

- **Default-Liste ändern** -- Diesen Abschnitt und den Verweis in `config/AGENT.md` (`Session Hygiene`) konsistent aktualisieren
- **Trigger verschärfen oder lockern** -- Formulierung der Trigger-Schwelle hier und in `config/AGENT.md` nachziehen
- **Claude-Label einführen** -- Sobald ein entsprechendes Custom Field im Privat-Workspace existiert: Field-ID und Option-ID hier dokumentieren und die Regel in `config/AGENT.md` (`ClickUp (HSLU Workspace)`) um den Privat-Workspace erweitern
- **Dynamische Liste-Wahl** -- Optional möglich: Claude könnte über `clickup_get_lists` den Space-Baum laden und die Zielliste per Scope-Matching finden. Aktuell wird bewusst die statische Default-Liste verwendet, um Overhead und Fehlklassifikation zu vermeiden

::: tip Cross-Workspace
Für Aufgaben, die sowohl HSLU- als auch Homelab-Infrastruktur berühren, entscheidet der hauptsächliche Arbeitskontext. Im Zweifel fragt Claude vor der Anlage.
:::

::: info Verwandte Seiten
- [Claude Code Config-Sync](./claude-code-sync.md) -- Geteilte Config zwischen beiden macOS-Accounts
- [ClickUp Multi-Instance](./clickup-multi-instance.md) -- Zwei ClickUp-Instanzen gleichzeitig auf macOS
:::
