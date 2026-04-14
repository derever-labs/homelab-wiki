---
title: GitHub Actions Runner - Betrieb
description: Wartung, Troubleshooting und Recovery-Szenarien für Runner und CD-Pipeline
tags:
  - github
  - ci-cd
  - runner
  - betrieb
---

# GitHub Actions Runner: Betrieb

Wartung, Troubleshooting und Recovery-Szenarien für den Self-hosted GitHub Actions Runner und die CD-Pipeline. Für die Architektur-Übersicht siehe [GitHub Actions Runner](./index.md), für die technische Referenz siehe [Referenz](./referenz.md).

## Wartung

### Runner-Version aktualisieren

Neuen Image-Tag in der Job-Datei `nomad-jobs/infrastructure/github-runner.nomad` eintragen und via CD-Pipeline oder manuell deployen. GitHub deprecated alte Runner-Versionen regelmässig -- bei einem veralteten Runner erscheinen Warnungen in den Workflow-Logs.

### Classic PAT rotieren

1. Neues PAT in GitHub generieren (Scopes: repo, workflow, admin:org)
2. Neues Token in Vault speichern: `kv/github-runner`, Key `access_token`
3. Runner-Job neu starten -- er liest den neuen Token automatisch aus Vault

## Troubleshooting

### Runner offline

**Symptom:** Runner erscheint in GitHub als offline, Workflows bleiben in "queued" hängen.

Mögliche Ursachen:

- Allocation nicht running -- Job-Status im Nomad UI prüfen
- Runner registriert sich, aber Listener startet nie (Exit Code 0, Restart-Loop) -- Entrypoint-Override prüfen
- Runner-Version veraltet -- Image-Tag auf aktuelle Version aktualisieren
- Classic PAT abgelaufen oder widerrufen -- PAT rotieren (siehe oben)
- Vault nicht erreichbar -- Vault-Status und Workload Identity prüfen

### Push zu ZOT Registry schlägt fehl

**Symptom:** CI/CD-Pipeline schlägt beim Image-Push fehl.

- ZOT nicht erreichbar: Läuft der ZOT System Job auf demselben Node?
- Host-Networking nicht aktiv: Ohne Host-Networking ist `localhost:5000` nicht erreichbar
- Docker API Inkompatibilität: `skopeo copy` statt `docker push` verwenden

### Workflow hängt in "queued"

**Symptom:** Workflow wird nicht ausgeführt, bleibt in der Warteschlange.

- Runner in GitHub als "online" sichtbar? (Org Settings > Actions > Runners)
- Labels korrekt? Workflow muss `runs-on: [self-hosted, homelab]` verwenden
- Bei count=1 kann nur ein Job gleichzeitig laufen -- parallele Workflows warten

## Recovery-Szenarien: CD-Pipeline

### Vault Nomad Secret Engine nicht funktionsfähig

Wenn die Vault Engine `nomad/` defekt oder die Konfiguration verloren gegangen ist, kann die CD-Pipeline keinen Nomad-Token mehr holen. Für manuelle Deploys oder zur Neukonfiguration der Engine steht der Recovery-Mgmt-Token in 1Password unter "Nomad Recovery Homelab" zur Verfügung. Accessor: `0a1fd26e-...`.

Mit diesem Token kann:

- `nomad job run` manuell ausgeführt werden
- die Vault Nomad Engine-Konfiguration (`nomad/config/access`) neu aufgesetzt werden

::: warning Recovery-Token schützen
Der Recovery-Token ist ein Nomad Management Token mit vollen Rechten. Er liegt ausschliesslich in 1Password und sollte nach Gebrauch durch einen neuen ersetzt werden.
:::

### Workflow fehlgeschlagen nach Deploy

Wenn ein `nomad job run` erfolgreich war, der Job danach aber fehlerhaft läuft: Die vorherige Job-Version wiederherstellen mit `nomad job revert <job-id> <prior-version>`. Dafür wird der Recovery-Token oder ein normales Mgmt-Token aus 1Password benötigt.

### Renovate auto-merged einen broken Patch

Wenn Renovate einen automatischen Merge auf main ausgelöst hat und der Deploy-Workflow einen defekten Job eingespielt hat:

1. Im Repo einen Revert-Commit erstellen
2. Push auf main löst die Pipeline erneut aus -- der revertierte Stand wird deployed

Falls das Renovate-Image selbst defekt ist (Runner nicht mehr startfähig): `ignoreDeps` in der Renovate-Konfiguration schützt davor, indem kritische Job-Dateien von automatischen Updates ausgenommen werden.

### Repository umbenannt

Vault sieht nur das Workload-Token des Jobs `github-runner`, keine Repo-Namen. Eine Umbenennung des Repositories erfordert keine Vault- oder Nomad-Konfigurationsänderung.

### Volumen- oder CSI-Plugin-Updates

Volumen und CSI-Plugins sind in der Blocklist der CD-Pipeline und werden **nicht** automatisch deployed. Sie müssen manuell out-of-band aktualisiert werden.

## Verwandte Seiten

- [GitHub Actions Runner](./index.md) -- Übersicht und Architektur
- [GitHub Actions Runner Referenz](./referenz.md) -- Vault-Konfiguration, Pipeline-Details
- [HashiCorp Stack](../nomad/index.md) -- Vault und Nomad
