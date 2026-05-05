---
title: Cluster Cold-Start Runbook
description: Reihenfolge und Henne-Ei-Probleme beim Hochfahren des kompletten Homelab-Clusters nach Komplett-Ausfall
tags:
  - runbook
  - cluster
  - recovery
  - bootstrap
---

# Cluster Cold-Start Runbook

Bei einem vollstaendigen Homelab-Cluster-Ausfall (z.B. Stromausfall, Pi-hole-Crash + Quorum-Loss, Synology-Reboot) muss die Infrastruktur in einer bestimmten Reihenfolge hochgefahren werden, sonst entstehen Henne-Ei-Probleme bei denen Komponente A auf B wartet, B aber A braucht. Diese Seite dokumentiert die Reihenfolge und die fuenf wichtigsten Bootstrap-Fallen.

## Reihenfolge beim Cold-Start

1. Netzwerk-Layer: Switch + Pi-hole VMs (10.0.2.1 + 10.0.2.2)
2. DNS-Layer: Pi-hole-1 oder Pi-hole-2 muss antworten, beide ideal
3. Storage-Layer: Synology-NAS (10.0.0.200) muss erreichbar sein, MinIO + NFS exporten
4. Consul-Quorum: 3 Server bilden Quorum (Bootstrap-Expect)
5. Vault-Quorum + Auto-Unseal: 3 Server, Auto-Unseal-Provider darf NICHT Consul-KV sein
6. Nomad-Server-Quorum: 3 Server, kommen nach Vault hoch (fuer Workload-Identity)
7. Nomad-Clients: brauchen Consul + Vault + lokales Docker
8. System-Jobs: ZOT, redis-zot, traefik, alloy
9. Restliche Workloads in Abhaengigkeitsreihenfolge

Pro Schritt vor dem naechsten verifizieren dass die Komponente tatsaechlich healthy ist. Verweise auf cluster-restart.md fuer einen einfacheren Restart-Fall (alles laeuft schon, nur Service-Restart-Sequenz).

## Fuenf Henne-Ei-Probleme

### 1. Vault Auto-Unseal darf nicht gegen Consul

Wenn Vault sich beim Start gegen Consul-KV unsealt, ist Vault tot bis Consul up ist. Bei Cluster-Cold-Start: Consul kommt erst nach Vault stabil. Resultat: Vault startet nie sauber.

Loesung: Auto-Unseal via 1Password-CLI-Provider oder analoger externer Provider. NICHT Consul. Das ist die Ist-Konfiguration; bei Cluster-Recovery muss verifiziert werden dass die Provider-Kette intakt ist (1P-Token gueltig).

### 2. Nomad-CSI-Storage darf nicht gegen Vault-on-Nomad

Wenn Nomad's CSI-Volume-Plugin seine Credentials aus Vault zieht, aber Vault selbst auf Nomad-CSI-Storage liegt: Loop. Vault braucht Storage um zu starten, Nomad braucht Vault um Storage-Plugin laufen zu lassen.

Loesung: Vault hat lokales Disk-Storage (Raft-Storage auf jedem Vault-Server-Node), nicht CSI-Volume von Nomad. Das ist die Ist-Konfiguration.

### 3. ZOT-Image-Pull bei Cold-Start

ZOT-Container laufen auf Nomad-Workers und ziehen ihr eigenes Image aus -- ZOT. Bei Cold-Start nach Cache-Verlust ist ZOT down, also kann ZOT sich selbst nicht ziehen. Plus: erstes Service-Image (alloy, traefik) braucht ZOT, das auch noch nicht laeuft.

Loesung: ZOT-Bootstrap-Image preloaded auf jedem Worker per Ansible (siehe ClickUp 86c9jr08n -- gilt analog fuer Homelab). Plus Top-20-Base-Images permanent in ZOT-S3-Bucket (statt OnDemand). Damit kommt ZOT auch ohne Hub-Pull hoch.

Alternative falls Pre-Load fehlt: Notfall-Job-Spec mit `image = "docker.io/project-zot/zot-linux-amd64:latest"` direkt von Hub statt localhost:5000 -- braucht aber Docker-Hub-Auth und nicht-rate-limited Account (Account dreverrr ist zwischen Homelab und DCLab geshared, 200 pulls/6h).

### 4. Service-Bootstrap-Klasse darf nicht via ZOT pullen

Wenn ZOT down ist und Keep oder Uptime-Kuma neu gestartet werden muessen, blockiert ein `localhost:5000/...`-Image-Pfad den Restart -- genau dann wenn man Alerts oder Status-Sicht am dringendsten braucht. Resultat: ZOT-Outage wird nicht alarmiert.

Loesung: Diese Jobs pullen direkt vom Upstream (bare Hub-Name oder expliziter Hostname). Bei bare Hub-Names greift der `registry-mirror` im Normalfall trotzdem ueber ZOT (Cache nutzt), faellt aber bei ZOT-404/down auf Docker Hub zurueck. Details und Liste der Bootstrap-Klasse in [docker-registry/index.md](../docker-registry/index.md#proxy-cache-registries).

### 5. Pi-hole-Upstream darf nicht auf Consul

Wenn Pi-hole als Upstream-DNS Consul-Server (`*.service.consul`-Aufloesung) eintraegt und Consul down ist: Recursion-Loop. Jede DNS-Query timeoutet, weil Pi-hole versucht Consul anzufragen, der nicht antwortet.

Loesung: Pi-hole-Upstream auf Public-DNS (1.1.1.1, 9.9.9.9). Consul-Forwarding fuer `.consul`-Suffix als spezifische Zone (Pi-hole conditional forwarding feature), nicht als generischer Upstream.

Status-Hinweis: Pi-hole-Conditional-Forwarding zu Consul ist aktuell broken (ClickUp 86c9d8bhv) -- Workaround in Nomad-Job-Specs ist `dns_servers = ["1.1.1.1","8.8.8.8"]` an einzelnen Jobs (z.B. ZOT). Bis Conditional-Forwarding fix ist, sollte das so bleiben.

## Verifikation pro Schritt

Nach jedem Schritt vor dem naechsten:

- Netzwerk: Ping zwischen Nodes, ARP-Tabelle
- DNS: `dig @10.0.2.1 nomad.service.consul` (auch wenn Consul noch down ist, Pi-hole muss antworten)
- Storage: `mc admin info <minio>` oder Synology-Web-UI
- Consul: `consul members` zeigt 3 alive
- Vault: `vault status` zeigt sealed=false, ha_enabled=true
- Nomad: `nomad server members` zeigt 3 alive, `nomad node status` zeigt Clients ready
- ZOT: `curl -k https://zot.intra.derever.ch/v2/_zot/ext/livez` HTTP 200 (bzw. localhost:5000)

## Restrisiken

- 1Password-CLI nicht erreichbar -- dann Vault-Manual-Unseal mit Recovery-Keys
- Synology-NAS Hardware-Defekt -- ZOT/Storage kein Bootstrap moeglich, NAS-Recovery aus Backup notwendig (DRBD-Tiebreaker hilft hier nicht weil S3 separat liegt)
- Docker-Hub-Rate-Limit voll -- ohne ZOT-Pre-Load und ohne authentifizierten Pull-Through scheitert Service-Bootstrap
- Single-PSU-Limitation der Homelab-Hosts -- Power-Loss-Korrektheit ist Restrisiko (siehe USV-Plan ClickUp)

## Bezug

- Cluster-Restart-Runbook (`cluster-restart.md`) fuer einfacheren Fall
- Smart-Shutdown-v10.2 (`smart-shutdown.md`) fuer geplante Reboots
- ClickUp 86c9d8bhv -- Pi-hole Conditional-Forwarding fix
- SPoF-Analyse 2026-04-29
