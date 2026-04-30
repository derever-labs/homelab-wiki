# Secrets-Architektur

::: info
Single Source of Truth fuer das Bootstrap-Vertrauen im Cluster. Beschreibt die Drei-Phasen-Migration vom 1Password-zentrierten Modell hin zu Vault als zentralem Trust-Anchor.
:::

## Ziel

Reduktion des 1Password-Footprints fuer Cluster-Operationen. 1Password bleibt fuer initiale Boot-Recovery (offline-Backup), aber kein laufender Cluster-Service liest mehr aktiv aus 1P. Damit wird die externe Angriffsoberflaeche eliminiert: Phishing oder 1P-Service-Kompromiss soll nicht mehr automatisch zu Cluster-Kompromiss fuehren.

## Architektur-Prinzipien

- **Vault ist zentraler Trust-Anchor** pro Cluster. Alle dynamischen Cluster-Tokens (NOMAD, ZOT, GitHub-Runner) fliessen aus Vault.
- **Kein Cross-Cluster-Coupling.** Homelab und DCLab sind technisch komplett unabhaengig. Keine Vault-Transit-Cross-Unseal-Beziehung, keine geteilten Auth-Backends.
- **Lab-Threat-Model.** 3 Admin-User, kein SLA, kein Compliance-Druck. Operative Einfachheit hat Vorrang vor Hardware-HSM-Niveau.
- **Backup-Disziplin.** Recovery-Keys liegen offline (Papier-Tresor oder Encrypted-USB), nicht im laufenden Cluster.

## Phase 1 -- NOMAD_TOKEN aus Vault-KV

::: tip Status: umgesetzt 2026-04-30
:::

NOMAD_TOKEN fuer Smart-Shutdown, Pre-Drain-Handler und nomad-boot-enable.service kommt aus Vault-KV statt aus 1P. ACL-Policy `boot-enable` (node:write + agent:read) ist im Repo unter `nomad-configs/policies/boot-enable.hcl` versioniert. Token-Storage primaer in Vault-KV `kv/nomad/boot-shutdown`, 1P "Nomad Boot-Enable Homelab" bleibt als Backup.

Provisionierung via Ansible-Playbook `playbooks/update-nomad-boot-token.yml`. Operator setzt vor Run `NOMAD_BOOT_TOKEN=$(vault kv get -field=token kv/nomad/boot-shutdown)` und ruft Ansible mit `--extra-vars`. Pattern analog ZOT-Auth-Rollout.

Token-Rotation: alle 12 Monate manuell (Kalender-Eintrag). Blast Radius minimal -- Token erlaubt nur Node-Eligibility-Toggling auf eigenem Node, keine Job-Submission, keine Variablen-Reads.

## Phase 2 -- Vault Auto-Unseal weg von 1P

::: warning Status: deferred
Nachverfolgt in ClickUp. Pro-Cluster-Migration ohne Cross-Cluster-Coupling.
:::

Aktuell: Vault Auto-Unseal nutzt 1P-CLI-Provider. Ziel: Token-on-Disk pro Cluster in Kombination mit LUKS-Disk-Encryption auf VM-Ebene. Recovery-Keys offline-Backup.

Trade-off bewusst gewaehlt: Disk-Compromise des Vault-Servers bedeutet Vault-Master-Compromise. Aber wer Root auf der laufenden Vault-VM hat, hat eh Zugang zum Vault-Binary -- effektiv kein neues Risiko gegenueber dem Status-quo.

Cross-Cluster-Cross-Unseal (Homelab unsealt DCLab oder umgekehrt) wurde bewusst verworfen. DCLab und Homelab bleiben technisch unabhaengig.

## Phase 3 -- ZOT-Auth und GitHub-Runner aus Vault

::: warning Status: deferred
Nachverfolgt in ClickUp.
:::

ZOT htpasswd kommt heute aus 1P "ZOT HTPasswd nomad-client". Migration zu Vault-KV `kv/zot/htpasswd` mit gleichem Pattern wie Phase 1.

GitHub-Runner nutzt bereits Vault Nomad Secret Engine (`nomad/creds/github-deploy`) fuer kurzlebige Tokens. Phase 3 ist hier reine Verifikation, kein Migrations-Aufwand.

## End-Zustand

Nach allen drei Phasen enthaelt 1Password fuer Cluster-Operationen nur noch:

- Recovery-Keys-Backup (offline, nicht aktiv genutzt)
- SSH-Keys fuer Operator-Zugang (User-Login, nicht Service)
- Operator-Vault-Login-Credentials fuer manuelle Sessions

Kein laufender Cluster-Service liest mehr aktiv aus 1P. Phishing-/1P-Compromise-Szenarien fuehren nicht mehr automatisch zu Cluster-Kompromittierung.

## Threat-Model-Bewertung

::: details Was die Migration adressiert
- Externe Angriffsoberflaeche durch 1P-Service-Kompromiss
- Phishing-Angriffe gegen Operator mit 1P-Zugang
- 1P-Cloud-Outage-Resilienz (Vault ist self-hosted)
:::

::: details Was die Migration NICHT adressiert
- Vollstaendiger Host-Compromise eines Vault-Servers
- Proxmox-Host-Compromise (vTPM-Migration wurde gegen Token-on-Disk-Einfachheit abgewogen)
- Insider-Threat mit physischem Lab-Zugang
- Disaster-Recovery bei vollstaendigem Cluster-Verlust (Recovery-Keys-Offline-Backup essenziell)
:::

## Verwandte Seiten

- [Smart-Shutdown](smart-shutdown.md) -- Reader des Boot-Tokens
- [Cold-Start-Runbook](cold-start-runbook.md) -- Disaster-Recovery-Reihenfolge
