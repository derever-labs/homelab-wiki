---
title: Plattform
description: Big Picture der Cluster-Grundversorgung -- wie Nomad, Consul, Vault und die Zot Registry beim Deploy, im Abhängigkeitsnetz und im Fehlerfall zusammenspielen
tags:
  - overview
  - nomad
  - consul
  - vault
  - infrastructure
---

# Plattform

Dieses Kapitel bündelt das Fundament, auf dem alle Workloads laufen: Nomad platziert und überwacht die Container, Consul macht sie auffindbar, Vault liefert ihnen ihre Secrets, und die Zot Registry versorgt die Clients mit Images. Diese Seite ist das Big Picture: zwei Szenario-Diagramme und eine Ausfall-Sicht zeigen, wie die vier Systeme ineinandergreifen -- die Details bleiben auf den System-Seiten.

## Systeme

| System | Rolle | Betriebsform |
| :--- | :--- | :--- |
| [Nomad](./nomad/) | Scheduler -- platziert, startet und überwacht alle Container-Workloads | Systemd auf 3 Server- und 3 Client-VMs (Ansible) |
| [Consul](./consul/) | Service Discovery, DNS (`.consul`), Health Checks, KV Store | Systemd auf denselben 6 VMs (Ansible) |
| [Vault](./vault/) | Secrets zur Laufzeit über Workload Identity | Systemd als 3-Node-Raft-Cluster auf den Server-VMs (Ansible) |
| [Zot Container Registry](./docker-registry/) | Pull-Through-Cache und Registry für sämtliche Images | Nomad-Job `infrastructure/zot-registry.nomad` |

## Das Zusammenspiel in zwei Sichten

Zwei Sichten beantworten die Kernfragen der Plattform: Der **Deploy-Fluss** zeigt, was zwischen `nomad job run` und dem erreichbaren Service passiert, die **Abhängigkeits-Sicht** zeigt, wer wen braucht und warum der Stack trotz Henne-Ei-Beziehungen aus dem Nichts startet.

Lese-Konvention für beide Diagramme: Der Pfeil zeigt vom **Initiator** zum Ziel, das Label nennt Schritt und Inhalt. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** Kanten laufen asynchron oder dauerhaft im Hintergrund. Die Farben kodieren den Weg: Grau für Scheduling und Kontrolle, Blau für den Image-Pfad, Violett für den Secrets-Pfad, Grün für Discovery und Routing.

### Deploy-Fluss -- vom Job-File zum erreichbaren Service

**Leitfrage:** Was passiert, wenn ein Job deployt wird -- von `nomad job run` bis der Service unter seiner Domain antwortet?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  kontrolle: { style: { stroke: "#6b7280" } }
  image: { style: { stroke: "#2563eb" } }
  secret: { style: { stroke: "#7c3aed" } }
  disco: { style: { stroke: "#16a34a" } }
  disco-async: { style: { stroke: "#16a34a"; stroke-dash: 3 } }
}

deploy: Deploy (CI oder CLI) {
  class: node
  tooltip: GitHub-Actions-Workflow deploy-nomad-jobs.yml oder manuelles nomad job run -- beide mit ACL-Token
}
server: Nomad-Server {
  class: node
  tooltip: 3 Nodes im Raft-Verbund -- Scheduler spread mit Preemption, stellt Workload-Identity-JWTs aus
}
client: Nomad-Client {
  class: node
  tooltip: Worker-Node mit Docker-Daemon und lokalem Consul-Agent
}
zot: Zot Registry {
  class: node
  tooltip: Pull-Through-Cache -- läuft selbst als Nomad-Job
}
upstream: Upstream-Registries {
  class: node
  tooltip: Docker Hub, ghcr.io und quay.io
}
vault: Vault {
  class: node
  tooltip: JWT Auth Method jwt-nomad, Secrets in KV v2
}
consul: Consul {
  class: node
  tooltip: Catalog, Health Checks und DNS auf Port 8600
}
traefik: Traefik {
  class: node
  tooltip: Reverse Proxy auf eigenem VM-Paar -- Provider consulCatalog
}

deploy -> server: 1. Job einreichen (HTTPS 4646) { class: kontrolle }
server -> client: 2. Allokation platzieren (RPC 4647) { class: kontrolle }
client -> zot: 3. Image pullen (zot.service.consul 5000) { class: image }
zot -> upstream: 4. Cache-Miss on-demand spiegeln { class: image }
client -> vault: 5. Workload-JWT einlösen, Secrets lesen { class: secret }
vault -> server: 6. JWT-Signatur gegen JWKS prüfen { class: secret }
client -> consul: 7. Service registrieren, Health-Status melden { class: disco }
traefik -> consul: 8. Catalog beobachten, Router bauen { class: disco-async }
```

Lesehilfe:

1. Ein Deploy erreicht die Nomad-Server über die ACL-geschützte HTTPS-API -- im Normalfall durch den CI-Workflow `deploy-nomad-jobs.yml` im Repo `homelab-nomad-jobs`, der seinen kurzlebigen Nomad-Token über Vault bezieht (Muster: [GitHub Runner Referenz](../dienste/github-runner/referenz.md)).
2. Der [Scheduler](./nomad/#scheduler-konfiguration) wählt den Ziel-Client (Spread-Algorithmus, Preemption nach Prioritäts-Schema) und übergibt die Allokation per RPC an dessen Nomad-Agent.
3. Der Docker-Daemon des Clients pullt das Image -- die Job-Files referenzieren `zot.service.consul:5000/...` explizit statt sich auf den [Mirror-Mechanismus](./docker-registry/#daemon-json-mirror-pattern) zu verlassen; die Namensauflösung läuft über Pi-hole an Consul DNS ([DNS-Architektur](../netz/dns/)).
4. Fehlt das Image im Cache, spiegelt Zot es on-demand von [Docker Hub, ghcr.io oder quay.io](./docker-registry/#proxy-cache-registries) und liefert es danach aus dem eigenen Volume.
5. Für Secrets zeigt der Task sein von Nomad ausgestelltes JWT bei Vault vor ([Workload Identity](./vault/#workload-identity)); Vault validiert die Signatur gegen den JWKS-Endpunkt der Nomad-Server und stellt einen Token mit der Policy `nomad-workload` aus -- lesbar ist im Kern der eigene Pfad `kv/<job_id>` plus die geteilten Pfade unter `kv/shared/`; wenige Cross-Job-Ausnahmen regelt die Policy explizit.
6. Der lokale Consul-Agent registriert die `service`-Stanza des Jobs und führt die Health Checks aus -- erst mit bestandenem Check ist der Service im Catalog und per DNS sichtbar ([Service Discovery](./consul/#service-discovery)).
7. Traefik beobachtet den Consul Catalog (Provider `consulCatalog`, `exposedByDefault: false`) und baut Router, Middlewares und Backend aus den Tags der Service-Registrierung -- der Job ist unter seiner Domain erreichbar ([Traefik](../edge/traefik/)).

### Abhängigkeits-Sicht -- wer braucht wen

**Leitfrage:** Wer hängt von wem ab -- und warum startet die Plattform trotz Henne-Ei-Beziehungen aus dem Nichts?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  ebene: { style: { border-radius: 8; stroke-dash: 4 } }
  kontrolle: { style: { stroke: "#6b7280" } }
  image: { style: { stroke: "#2563eb" } }
  image-async: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  secret: { style: { stroke: "#7c3aed" } }
  secret-async: { style: { stroke: "#7c3aed"; stroke-dash: 3 } }
  disco: { style: { stroke: "#16a34a" } }
  disco-async: { style: { stroke: "#16a34a"; stroke-dash: 3 } }
}

basis: Plattform-Ebene (Systemd, Ansible-verwaltet) {
  class: ebene
  label.near: top-center

  nomad: Nomad {
    class: node
    tooltip: Läuft direkt auf den VMs -- braucht weder Container noch Registry zum Starten
  }
  consul: Consul {
    class: node
    tooltip: Namens-Drehscheibe -- alle service.consul-Zugriffe hängen hier dran
  }
  vault: Vault {
    class: node
    tooltip: Shamir-Seal -- nach einem Reboot entsiegelt ein lokaler Boot-Service
  }
}

jobs: Workload-Ebene (Container, von Nomad platziert) {
  class: ebene
  label.near: top-center

  zot: Zot Registry {
    class: node
    tooltip: Einziger Plattform-Baustein, der als Nomad-Job läuft
  }
  apps: Alle übrigen Jobs { class: node }
  bastion: Bootstrap-Klasse {
    class: node
    tooltip: Zot selbst, Keep und Uptime Kuma -- müssen ohne Zot startfähig bleiben
  }
}

upstream: Upstream-Registries {
  class: node
  tooltip: Docker Hub, ghcr.io und quay.io
}

basis.nomad -> jobs: startet und überwacht jeden Job { class: kontrolle }
jobs.apps -> jobs.zot: beziehen ihre Images { class: image }
jobs.zot -> upstream: füllt den Cache on-demand { class: image }
jobs.bastion -> upstream: pullt direkt oder als Fallback am Cache vorbei { class: image-async }
jobs.apps -> basis.vault: lesen Secrets zur Laufzeit { class: secret }
basis.vault -> basis.nomad: prüft Workload-JWTs (JWKS) { class: secret-async }
basis.vault -> basis.consul: meldet active und standby { class: disco-async }
jobs -> basis.consul: Registrierung, Health-Status, Namensauflösung { class: disco }
```

Lesehilfe:

1. Die drei HashiCorp-Dienste laufen als Systemd-Dienste direkt auf den VMs -- sie brauchen weder Container noch Registry, um zu starten. Nur Zot lebt in der Workload-Ebene, die es selbst versorgt.
2. Henne-Ei Nummer eins: Zot läuft als Nomad-Job, liefert aber die Images für alle Nomad-Jobs. Aufgelöst über die [Bootstrap-Klasse](./docker-registry/#bootstrap-klasse-bewusste-direkt-pulls-ohne-cache) -- Zot pullt sein eigenes Image direkt von ghcr.io, Keep und Uptime Kuma fallen bei Zot-Ausfall automatisch auf Docker Hub zurück.
3. Henne-Ei Nummer zwei: Vault validiert Workload-JWTs gegen den JWKS-Endpunkt der Nomad-Server, während Nomad-Jobs ihre Secrets aus Vault beziehen. Die Schleife existiert nur auf Workload-Ebene -- die beiden Dienste selbst starten unabhängig voneinander, und nach einem Reboot entsiegelt der [Unseal-Boot-Service](./vault/betrieb.md#unseal-nach-reboot) Vault ohne manuellen Eingriff.
4. Consul ist die Namens-Drehscheibe: Sowohl der Image-Pfad (`zot.service.consul`) als auch der Secrets-Pfad (`vault.service.consul`) hängen an der `.consul`-Auflösung -- ein Consul-Ausfall trifft darum beide, siehe [Ausfallverhalten](#ausfallverhalten).
5. Die geordnete Startreihenfolge des Gesamt-Clusters steht im Runbook [Cluster-Neustart](../_querschnitt/cluster-restart.md); die Abhängigkeiten der App-Ebene (Datenbanken, Authentik, SMTP) hält [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) fest.

## Ausfallverhalten

**Leitfrage:** Was passiert bei Ausfall von X -- und was läuft dann noch?

- **Consul down (Quorum unter 2 von 3 Servern):** Catalog und `.consul`-Auflösung fallen aus. Traefik verliert seine Backends und alle Web-Dienste werden unerreichbar; neue Image-Pulls (`zot.service.consul`) und Vault-Zugriffe (`vault.service.consul`) scheitern an der Namensauflösung -- neue Starts und Reschedules blockieren. Laufende Container laufen weiter, und Nomad selbst behält seinen RPC-Kanal: die Server-Adressen sind in der Client-Konfiguration fest hinterlegt, nicht über Consul aufgelöst.

- **Vault sealed oder ohne Quorum:** Laufende Dienste behalten ihre gerenderten Secrets, können sie aber nicht mehr erneuern; neue Jobs scheitern beim Template-Rendern. Nach einem Node-Reboot ist der Seal-Zustand der Normalfall -- der lokale Boot-Service entsiegelt automatisch ([Unseal nach Reboot](./vault/betrieb.md#unseal-nach-reboot)).

- **Zot down:** Laufende Container überleben, Re-Pulls über `zot.service.consul:5000/...`-Referenzen scheitern. Ein Restart auf demselben Node kommt meist aus dem lokalen Docker-Cache (ungenutzte Images werden erst nach 72 Stunden abgeräumt), ein Reschedule auf einen Node ohne das Image bleibt hängen. Die [Bootstrap-Klasse](./docker-registry/#bootstrap-klasse-bewusste-direkt-pulls-ohne-cache) startet trotzdem -- und Zot selbst ist kein Dauerausfall: Nomad rescheduled die Allokation, das DRBD-Volume folgt über CSI ([Failover und Wiederanlauf](./docker-registry/betrieb.md#failover-wiederanlauf)).

- **Nomad-Server-Quorum verloren (2 von 3 down):** Kein neues Scheduling, keine Deploys, kein Reschedule bei Node-Ausfall -- laufende Allokationen auf den Clients laufen unverändert weiter. Fallen alle Server aus, fehlt zusätzlich der JWKS-Endpunkt: dann können auch bestehende Workloads keine neuen Vault-Token beziehen. Autopilot bereinigt tote Server automatisch, unterschreitet dabei aber nie 2 Server (`min_quorum`).

## Verwandte Seiten

- [Nomad](./nomad/) -- Scheduler-Konfiguration, Cluster-Topologie, Prioritäts-Schema
- [Consul](./consul/) -- Service Discovery, DNS-Integration, KV Store
- [Vault](./vault/) -- Workload Identity, Designentscheide, Secret-Pfade
- [Zot Container Registry](./docker-registry/) -- Pull-Through-Cache, Mirror-Pattern, Bootstrap-Klasse
- [Nomad Timeout-Matrix](./nomad/timeouts.md) -- Timeout-Zusammenspiel von Cluster-, Job- und Plugin-Ebene
- [Traefik](../edge/traefik/) -- Reverse Proxy mit Consul-Catalog-Discovery
- [DNS-Architektur](../netz/dns/) -- Kette von Pi-hole zu Consul DNS
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Startreihenfolge nach Komplett-Ausfall
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeiten der App-Ebene
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Adressen aller Cluster-VMs
- [Nomad Jobs](../_referenz/nomad-jobs.md) -- Verzeichnis aller Jobs mit Deployment-Pfad
