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

::: tip Status: umgesetzt 2026-04-30 (war live, nun auch im Repo versioniert)
:::

Vault Auto-Unseal nutzt **Token-on-Disk** Pattern pro Cluster: `vault-unseal.service` (Systemd, Type=oneshot) liest Shamir-Recovery-Keys aus `/etc/vault.d/unseal-keys` (mode 0600, root) und ruft beim Boot `vault operator unseal` pro Key auf. Skript versioniert in `ansible/roles/vault/templates/vault-unseal.j2`.

Setup war seit Initial-Bootstrap auf beiden Clustern Live, war aber im Repo bisher mit einem anderen (nicht eingesetzten) Pattern versioniert. Drift-Korrektur 2026-04-30: Repo entspricht jetzt Live.

`/etc/vault.d/unseal-keys` wird **nicht** von Ansible deployed -- muss beim Initial-Provisioning eines neuen Vault-Servers manuell angelegt werden. Recovery-Keys-Backup liegt offline in 1P "Vault Token Privat" (Vault "PRIVAT Agent").

Trade-off bewusst gewaehlt: Disk-Compromise des Vault-Servers bedeutet Vault-Master-Compromise. Aber wer Root auf der laufenden Vault-VM hat, hat eh Zugang zum Vault-Binary -- effektiv kein neues Risiko gegenueber externem 1P-Provider, und externe Angriffsoberflaeche (Phishing, 1P-Cloud-Outage) ist eliminiert.

Cross-Cluster-Cross-Unseal (Homelab unsealt DCLab oder umgekehrt) wurde bewusst verworfen. DCLab und Homelab bleiben technisch unabhaengig.

## Phase 3 -- ZOT-Auth und GitHub-Runner aus Vault

::: tip Status: umgesetzt 2026-04-30
:::

ZOT htpasswd kommt aus Vault-KV `kv/zot/htpasswd` (Felder `username` + `password`). 1P "ZOT HTPasswd nomad-client" bleibt als Backup. Provisionierung via existing `playbooks/docker-registry-auth.yml`, Operator setzt vor Run `ZOT_NOMAD_CLIENT_PW=$(vault kv get -field=password kv/zot/htpasswd)` und ruft Ansible mit `--extra-vars`. Gleicher Pattern wie Phase 1.

Live-deployed auf vm-nomad-client-04/05/06 -- Test-Pull `localhost:5000/library/alpine:3.21` OK.

GitHub-Runner nutzt bereits Vault Nomad Secret Engine (`nomad/creds/github-deploy`) fuer kurzlebige Tokens (30 min TTL). Keine Migration noetig -- ist heute schon 1P-frei im CD-Pipeline-Pfad.

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

## Monitoring (Layered Approach)

::: tip Layer 1: umgesetzt 2026-04-30
:::

10 Loki-Recording-Rules in Grafana Unified Alerting (`monitoring/grafana.nomad`) decken die wichtigsten Failure-Modes der Phase 1+2+3 ab:

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

**Layer 2 -- Telegraf Host-Agent (systemd_units, defensive Redundanz):** Code in `ansible/roles/telegraf-host/` committed. Telegraf liest `vault/vault-unseal/nomad/nomad-boot-enable/docker.service` State, schreibt zu zentralem InfluxDB. Greift wenn Loki-Pipeline ausfaellt. **Rollout pending** -- Inventory-Variablen + Grafana-Alert-Rule auf systemd_units.state=failed muessen in eigener Session umgesetzt werden (siehe ClickUp).

**Layer 3 -- Uptime Kuma Push-Monitor (active-probe, Token-Validity):** Code in `ansible/roles/vault-token-healthcheck/` committed. Skript ruft `nomad acl token self` auf, push-monitort zu Uptime Kuma. Schliesst die einzige Luecke "Token im File aber tot" die Loki nicht erkennt. **Rollout pending** -- pro Host UK-Push-Monitor anlegen + `uptime_kuma_token_health_push_url` in inventory host_vars setzen (siehe ClickUp).

## Verwandte Seiten

- [Smart-Shutdown](smart-shutdown.md) -- Reader des Boot-Tokens
- [Cold-Start-Runbook](cold-start-runbook.md) -- Disaster-Recovery-Reihenfolge
