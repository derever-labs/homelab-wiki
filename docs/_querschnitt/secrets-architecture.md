---
title: Secrets-Architektur
description: Drei-Phasen-Migration von 1Password zu Vault als zentralem Trust-Anchor
tags:
  - querschnitt
  - secrets
  - vault
---

# Secrets-Architektur

::: info
Single Source of Truth für das Bootstrap-Vertrauen im Cluster. Beschreibt die Drei-Phasen-Migration vom 1Password-zentrierten Modell hin zu Vault als zentralem Trust-Anchor.
:::

## Ziel

Reduktion des 1Password-Footprints für Cluster-Operationen. 1Password bleibt für initiale Boot-Recovery (offline-Backup), aber kein laufender Cluster-Service liest mehr aktiv aus 1P. Damit wird die externe Angriffsoberfläche eliminiert: Phishing oder 1P-Service-Kompromiss soll nicht mehr automatisch zu Cluster-Kompromiss führen.

## Architektur-Prinzipien

- **Vault ist zentraler Trust-Anchor** pro Cluster. Alle dynamischen Cluster-Tokens (NOMAD, ZOT, GitHub-Runner) fliessen aus Vault.
- **Kein Cross-Cluster-Coupling.** Homelab und DCLab sind technisch komplett unabhängig. Keine Vault-Transit-Cross-Unseal-Beziehung, keine geteilten Auth-Backends.
- **Lab-Threat-Model.** 3 Admin-User, kein SLA, kein Compliance-Druck. Operative Einfachheit hat Vorrang vor Hardware-HSM-Niveau.
- **Backup-Disziplin.** Recovery-Keys liegen offline (Papier-Tresor oder Encrypted-USB), nicht im laufenden Cluster.

## Phase 1 -- NOMAD_TOKEN aus Vault-KV

**Umgesetzt 2026-04-30.**

NOMAD_TOKEN für Smart-Shutdown, Pre-Drain-Handler und nomad-boot-enable.service kommt aus Vault-KV statt aus 1P. ACL-Policy `boot-enable` (node:write + agent:read) ist im Repo unter `nomad-configs/policies/boot-enable.hcl` versioniert. Token-Storage primär in Vault-KV `kv/nomad/boot-shutdown`, 1P "Nomad Boot-Enable Homelab" bleibt als Backup.

Provisionierung via Ansible-Playbook `playbooks/update-nomad-boot-token.yml`. Operator setzt vor Run `NOMAD_BOOT_TOKEN=$(vault kv get -field=token kv/nomad/boot-shutdown)` und ruft Ansible mit `--extra-vars`. Pattern analog ZOT-Auth-Rollout.

Token-Rotation: alle 12 Monate manuell (Kalender-Eintrag). Blast Radius minimal -- Token erlaubt nur Node-Eligibility-Toggling auf eigenem Node, keine Job-Submission, keine Variablen-Reads.

## Phase 2 -- Vault Auto-Unseal weg von 1P

**Umgesetzt 2026-04-30** (war live, nun auch im Repo versioniert).

Vault Auto-Unseal nutzt **Token-on-Disk** Pattern pro Cluster: `vault-unseal.service` (Systemd, Type=oneshot) liest Shamir-Recovery-Keys aus `/etc/vault.d/unseal-keys` (mode 0600, root) und ruft beim Boot `vault operator unseal` pro Key auf. Skript versioniert in `ansible/roles/vault/templates/vault-unseal.j2`.

Setup war seit Initial-Bootstrap auf beiden Clustern Live, war aber im Repo bisher mit einem anderen (nicht eingesetzten) Pattern versioniert. Drift-Korrektur 2026-04-30: Repo entspricht jetzt Live.

`/etc/vault.d/unseal-keys` wird **nicht** von Ansible deployed -- muss beim Initial-Provisioning eines neuen Vault-Servers manuell angelegt werden. Recovery-Keys-Backup liegt offline in 1P "Vault Token Privat" (Vault "PRIVAT Agent").

Trade-off bewusst gewählt: Disk-Compromise des Vault-Servers bedeutet Vault-Master-Compromise. Aber wer Root auf der laufenden Vault-VM hat, hat eh Zugang zum Vault-Binary -- effektiv kein neues Risiko gegenüber externem 1P-Provider, und externe Angriffsoberfläche (Phishing, 1P-Cloud-Outage) ist eliminiert.

Cross-Cluster-Cross-Unseal (Homelab unsealt DCLab oder umgekehrt) wurde bewusst verworfen. DCLab und Homelab bleiben technisch unabhängig.

## Phase 3 -- ZOT-Auth und GitHub-Runner aus Vault

**Umgesetzt 2026-04-30.**

ZOT htpasswd kommt aus Vault-KV `kv/zot/htpasswd` (Felder `username` + `password`). 1P "ZOT HTPasswd nomad-client" bleibt als Backup. Provisionierung analog Phase 1 (Ansible mit `--extra-vars`; Playbook `playbooks/docker-registry-auth.yml`, Operator setzt vor Run `ZOT_NOMAD_CLIENT_PW=$(vault kv get -field=password kv/zot/htpasswd)`). Live-deployed auf den Nomad-Clients vm-nomad-client-04/05/06.

GitHub-Runner nutzt bereits Vault Nomad Secret Engine (`nomad/creds/github-deploy`) für kurzlebige Tokens (30 min TTL). Keine Migration nötig -- ist heute schon 1P-frei im CD-Pipeline-Pfad.

## End-Zustand

Nach allen drei Phasen enthält 1Password für Cluster-Operationen nur noch:

- Recovery-Keys-Backup (offline, nicht aktiv genutzt)
- SSH-Keys für Operator-Zugang (User-Login, nicht Service)
- Operator-Vault-Login-Credentials für manuelle Sessions

Kein laufender Cluster-Service liest mehr aktiv aus 1P. Phishing-/1P-Compromise-Szenarien führen nicht mehr automatisch zu Cluster-Kompromittierung.

## Threat-Model-Bewertung

::: details Was die Migration adressiert
- Externe Angriffsoberfläche durch 1P-Service-Kompromiss
- Phishing-Angriffe gegen Operator mit 1P-Zugang
- 1P-Cloud-Outage-Resilienz (Vault ist self-hosted)
:::

::: details Was die Migration NICHT adressiert
- Vollständiger Host-Compromise eines Vault-Servers
- Proxmox-Host-Compromise (vTPM-Migration wurde gegen Token-on-Disk-Einfachheit abgewogen)
- Insider-Threat mit physischem Lab-Zugang
- Disaster-Recovery bei vollständigem Cluster-Verlust (Recovery-Keys-Offline-Backup essenziell)
:::

## Monitoring (Layered Approach)

**Layer 1 -- umgesetzt 2026-04-30:** 10 Loki-Recording-Rules in Grafana Unified Alerting (`monitoring/grafana.nomad`) decken die wichtigsten Failure-Modes der Phase 1+2+3 ab:

- Pre-Drain-Handler exit 2 (NOMAD_TOKEN missing) -- critical
- Pre-Drain-Handler exit 5 (Vault unreachable) -- warning
- Smart-Shutdown silent skip (NOMAD_TOKEN missing) -- critical
- Drain-Timeout (>5min) -- critical
- nomad-boot-enable.service failed -- critical
- vault-unseal.service failed -- critical
- Vault Restart-Loop -- warning
- ZOT auth-failure -- warning
- ZOT pull-failure spike -- warning
- Nomad-Node ineligible >10min -- warning

Routing: Grafana → Webhook → Keep → Telegram (severity-Eskalation an VIP-Bot bei `critical`).

**Layer 2 -- Telegraf Host-Agent (systemd_units, defensive Redundanz), live seit 2026-05-01:** Deployed auf allen 6 Privat-Hosts (3 Server + 3 Clients). Telegraf liest `vault/vault-unseal/nomad/nomad-boot-enable/docker.service` State und schreibt zu InfluxDB Bucket `telegraf-host` (org `ackermann`). Grafana Alert-Rule `secrets-systemd-service-failed` alarmiert bei `active_state=failed` (Code 3). Greift wenn Loki-Pipeline ausfällt. Code: `ansible/roles/telegraf-host/`.

**Layer 3 -- Uptime Kuma Push-Monitor (active-probe, Token-Validity), live seit 2026-05-01:** Deployed auf allen 6 Privat-Hosts. Cron-Job `/usr/local/bin/nomad-token-healthcheck.sh` läuft alle 15 Minuten, prüft Token-Validity gegen Vault und pusht Status an Uptime Kuma (6 Push-Monitore, einer pro Host). Schliesst die Lücke "Token im File aber tot" die Loki nicht erkennt. Code: `ansible/roles/vault-token-healthcheck/`.

## Verwandte Seiten

- [Smart-Shutdown](smart-shutdown.md) -- Reader des Boot-Tokens
- [Cold-Start-Runbook](cold-start-runbook.md) -- Disaster-Recovery-Reihenfolge
