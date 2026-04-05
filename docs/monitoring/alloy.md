---
title: Grafana Alloy
description: Log-Collector für alle Infrastruktur-Komponenten -- Betrieb, Konfiguration und Troubleshooting
tags:
  - service
  - monitoring
  - logging
  - alloy
---

# Grafana Alloy

Grafana Alloy ist der zentrale Log-Collector im Homelab. Er sammelt Logs aus Docker-Containern, systemd-Journalen und Logfiles und leitet sie an Loki weiter. Zusätzlich empfängt er Syslog von Netzwerkgeräten.

## Deployment-Varianten

| Variante | Ziel-Hosts | Deployment | Quellen |
| :--- | :--- | :--- | :--- |
| **Nomad System-Job** | vm-nomad-client-04/05/06 | `system/alloy.nomad` | Docker-Container-Logs + Syslog-Receiver |
| **Ansible Rolle `alloy`** | Server-, Client-Nodes, Proxmox, Infra-VMs | `playbooks/deploy-alloy.yml` u.a. | systemd-Journal + optionale Logfiles |
| **Ansible Rolle `alloy` (Traefik-VMs)** | vm-traefik-01/02 | Separate Ansible-Konfiguration | Docker-Compose-Logs + Syslog-Receiver |

Die vollständige Tabelle aller Log-Quellen mit ihren Source-Labels ist unter [Monitoring Stack -- Zentrales Logging](./index.md#grafana-alloy-log-collector) dokumentiert.

## Variante 1: Nomad System-Job

Der System-Job `system/alloy.nomad` läuft auf jedem Nomad Client-Node und sammelt Container-Logs über den Docker-Socket.

**Kernfunktionen:**

- Docker-Container-Discovery via `discovery.docker`
- Nomad-Labels aus Container-Namen extrahieren: `nomad_task` (aus Container-Name), `nomad_alloc_id` (aus Docker-Label)
- Nicht-Nomad-Container werden gefiltert (Drop-Regel: kein `alloc_id`-Label)
- Syslog-Receiver auf Port 1514 (TCP + UDP) für NAS und Router
- Health-Check via `/-/ready` (Port 12345)

**Ressourcen:** 100 MHz CPU, 256 MiB RAM (max. 768 MiB)

**Job-Datei:** `nomad-jobs/system/alloy.nomad`

## Variante 2: Ansible-Rolle `alloy` (systemd)

Der systemd-Service läuft auf allen Nicht-Nomad-Hosts. Die Konfiguration wird via Ansible aus dem Template `roles/alloy/templates/config.alloy.j2` generiert.

**Quellen pro Playbook:**

| Playbook | Hosts | Source-Label | Besonderheiten |
| :--- | :--- | :--- | :--- |
| `deploy-alloy.yml` (Server) | vm-nomad-server-04/05/06 | `journal` | Vault Audit-Log als File-Target (`vault-audit.log`) |
| `deploy-alloy.yml` (Clients) | vm-nomad-client-04/05/06 | `nomad-client` | Linstor-Logs als File-Target |
| `deploy-alloy-proxmox.yml` | pve00, pve01, pve02 | `proxmox` | `www-data`-Gruppe für pveproxy-Logs |
| `deploy-alloy-infra.yml` | CheckMK, PBS, PDM, DNS-LXC, Traefik, Zigbee | je Host | CheckMK: Core/Web/Notify-Logs |

**Ansible-Rollen-Verzeichnis:** `homelab-hashicorp-stack/ansible/roles/alloy/`

**Config-Template:** `roles/alloy/templates/config.alloy.j2`

Das Template unterstützt optionale File-Targets über die Ansible-Variable `alloy_file_targets`. Die `source`- und `node`-Labels werden als `external_labels` an Loki übergeben.

## Variante 3: Traefik-VMs (Docker-Compose + Syslog)

Die Traefik-VMs (vm-traefik-01/02) nutzen eine abweichende Konfiguration, da sie Docker-Compose-Services (kein Nomad) betreiben und als Syslog-Empfänger für Netzwerkgeräte hinter der Keepalived-VIP dienen.

**Config-Template:** `homelab-hashicorp-stack/standalone-stacks/traefik-ha/templates/alloy-config.alloy.j2`

**Besonderheiten:**
- Container-Discovery via `discovery.docker` ohne Nomad-Label-Extraktion
- Syslog-Receiver Port 1514 empfängt von der Keepalived-VIP
- External Label: `source = "docker-compose"`

## Syslog-Receiver

Beide Syslog-fähigen Varianten (System-Job, Traefik-VMs) empfangen auf **Port 1514 TCP und UDP**.

**Format:** RFC3164 (BSD Syslog) -- UniFi und Synology senden dieses Format, nicht RFC5424.

**Label-Extraktion:** Das `__syslog_message_hostname`-Feld wird auf das Label `host` gemappt. So ist in Loki erkennbar, von welchem Gerät ein Syslog-Eintrag stammt.

**Abfrage in Loki:** `{job="syslog"}` -- filtert alle Syslog-Quellen. Mit `{job="syslog", host="nas"}` auf ein bestimmtes Gerät einschränken.

## Label-Strategie

Die Labels sind so gewählt, dass sie einerseits eindeutige Identifikation ermöglichen, andererseits die Kardinalität in Loki begrenzen.

| Label | Wert (Beispiel) | Quelle | Zweck |
| :--- | :--- | :--- | :--- |
| `node` | `vm-nomad-client-05` | `external_labels` (alle Varianten) | Welcher physische Node |
| `source` | `proxmox`, `checkmk`, `journal` | `external_labels` (Ansible-Variante) | Welche Host-Klasse |
| `nomad_task` | `grafana`, `loki` | Relabel aus Container-Name | Welcher Nomad-Task |
| `nomad_alloc_id` | `a1b2c3d4-...` | Relabel aus Docker-Label | Eindeutige Alloc-ID |
| `container` | `grafana-a1b2c3d4-...` | Relabel aus Container-Name | Vollständiger Container-Name |
| `unit` | `consul.service` | Journal-Relabel | Systemd-Unit |
| `level` | `err`, `warning` | Journal-Relabel | Log-Severity |
| `job` | `syslog`, `vault-audit` | Statisches Label | Log-Kategorie |
| `host` | `nas`, `unifi` | Syslog-Relabel | Absender-Hostname bei Syslog |

**Warum `session-*.scope` gedroppt werden:** Diese Systemd-Scopes entstehen bei jeder SSH-Verbindung und erzeugen hohe Kardinalität ohne diagnostischen Mehrwert.

**Warum kein `alloc_id` in File-Targets:** File-Targets auf Ansible-Hosts haben keinen Nomad-Kontext, daher nur `node` und `source` als Labels.

## LogQL-Beispiele

Alle Abfragen in Grafana verwenden die Datasource **Loki** (uid: `loki-logs`).

Nomad-Container-Logs:
- `{nomad_task="grafana"}` -- alle Grafana-Logs
- `{nomad_task="loki"} |= "error"` -- Loki-Fehler
- `{nomad_task="traefik"} | json` -- Traefik-Logs als JSON parsen

Node-übergreifend:
- `{node="vm-nomad-client-05"}` -- alle Logs von client-05
- `{source="proxmox"} |= "error"` -- Proxmox-Fehler

Infrastruktur-Dienste:
- `{source="checkmk"}` -- alle CheckMK-Logs
- `{source="vault-audit"}` -- Vault Audit-Trail
- `{unit="nomad.service"}` -- Nomad-Daemon-Logs auf Server-Nodes

Netzwerkgeräte:
- `{job="syslog"}` -- alle Syslog-Quellen
- `{job="syslog", host="nas"}` -- nur NAS-Syslog
- `{job="syslog"} |= "error"` -- Fehler aller Netzwerkgeräte

Sicherheits-relevante Abfragen (Grafana Alerting):
- `{unit="sshd.service"} |= "Failed password"` -- SSH-Brute-Force
- `{source="vault-audit"} |= "permission denied"` -- Vault-Zugriffsfehler

## Troubleshooting: Logs kommen nicht an

### Diagnosepfad

**1. Alloy läuft überhaupt?**

Beim System-Job: `NOMAD_ADDR=http://10.0.2.104:4646 nomad job status alloy` -- alle Allocs sollten `running` sein.

Beim systemd-Service: `systemctl status alloy` auf dem betroffenen Host.

**2. Alloy Health-Check**

System-Job: Alloy ist via Consul registriert (`alloy.service.consul`). Health-Status im Consul UI oder `consul members` prüfen.

Der HTTP-Endpunkt `/-/ready` (Port 12345) liefert `200 OK` wenn Alloy bereit ist.

**3. Alloy UI aufrufen**

Via SSH-Tunnel auf Port 12345 des Nomad-Clients. Das Alloy-UI zeigt den Komponentenstatus und eventuelle Fehler in der Pipeline.

**4. Loki erreichbar?**

`loki.service.consul:3100` muss auflösbar sein. Alloy nutzt DNS `10.0.2.1` / `10.0.2.2`.

Bei systemd-basierten Hosts: `curl http://loki.service.consul:3100/ready` auf dem Host ausführen.

**5. Docker-Socket erreichbar? (System-Job)**

Der Docker-Socket `/var/run/docker.sock` wird als read-only Volume gemountet. Wenn der Nomad-Client neu gestartet wurde, manchmal Alloy-Alloc neu deployen: `nomad alloc restart <alloc-id>`.

**6. Labels korrekt?**

In Loki unter `Explore` prüfen: Existieren Logs mit dem erwarteten `node`-Label? Wenn Logs ankommen aber mit falschen Labels, ist das Relabeling-Problem.

Beim System-Job: Container-Name muss dem Muster `/taskname-{uuid}` entsprechen. Nicht-Nomad-Container werden explizit gedroppt.

**7. Syslog-Gerät sendet nicht an?**

Port 1514 auf dem Node prüfen: `ss -ulnp | grep 1514` und `ss -tlnp | grep 1514`.

Beim System-Job läuft der Receiver im Nomad-Netzwerk (`bridge`-Mode), der statische Port 1514 wird auf den Host gemappt. Sicherstellen, dass das sendende Gerät die richtige IP des Nomad-Clients (oder der Traefik-VIP) als Syslog-Ziel konfiguriert hat.

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Gesamtübersicht mit Architektur-Diagramm und allen Log-Quellen
- [Loki](./index.md#loki-log-storage) -- Log-Storage-Backend
- [Grafana Alerting](./index.md#alerting-unified-alerting) -- Log-basierte Alert Rules
