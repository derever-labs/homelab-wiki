---
title: Consul - Betrieb
description: Betriebskonzepte für den Consul Cluster
tags:
  - consul
  - betrieb
---

# Consul - Betrieb

## Übersicht

Der Consul-Cluster besteht aus drei Servern und drei Clients, die auf denselben VMs wie Nomad und Vault betrieben werden. Die Server (vm-nomad-server-04, -05, -06) bilden einen Raft-Cluster und sind verantwortlich für Konsens, KV Store und Catalog. Die Clients (vm-nomad-client-04, -05, -06) laufen auf den Worker-Nodes und melden lokal gestartete Services beim Cluster an.

## Abhängigkeiten

Der Cluster erfordert folgende Voraussetzungen für den Normalbetrieb:

- **Raft-Quorum:** Mindestens 2 der 3 Server müssen erreichbar sein. Bei Ausfall von 2 Servern gleichzeitig verliert der Cluster seinen Leader und ist nicht mehr schreibfähig.
- **Netzwerk-Konnektivität:** Alle 6 Nodes müssen sich gegenseitig über den Serf-Gossip-Port (8301) erreichen können. Unterbrochene Konnektivität führt dazu, dass Nodes als "failed" markiert werden.
- **Gossip Encryption Key:** Ein symmetrischer Key ist auf allen Nodes identisch konfiguriert. Ohne den Key kann ein Node dem Cluster nicht beitreten.

## Automatisierung

Folgende Vorgänge laufen im Normalbetrieb vollständig automatisch ab:

- **Service Registration:** Nomad registriert jeden Container bei Start automatisch als Consul-Service. Dazu genügt eine `service`-Stanza im Nomad-Job. Der lokale Consul-Client auf dem Worker-Node übermittelt die Registrierung an den Cluster.
- **Health Checks:** Consul führt für jeden registrierten Service kontinuierlich Health Checks durch (HTTP, TCP oder Script). Failing Services werden aus dem Catalog entfernt und sind über DNS nicht mehr auflösbar.
- **DNS-Aktualisierung:** Consul DNS auf Port 8600 spiegelt immer den aktuellen Cluster-Zustand. Neue Services sind sofort nach erfolgreicher Health-Check-Runde auflösbar.
- **Autopilot:** Ausgefallene Server werden nach Wiederherstellung oder Ersatz automatisch aus dem Raft-Cluster bereinigt. Das Cluster-Membership muss nicht manuell korrigiert werden.

## Bekannte Einschränkungen

Bewusste Homelab-Entscheidungen, die vom Produktions-Best-Practice abweichen:

- **Kein TLS:** Die Kommunikation zwischen Consul-Nodes und zur API ist nicht TLS-verschlüsselt. Begründung: Kein Zertifikat-Expiry-Risiko, Gossip Encryption schützt den Cluster-Traffic trotzdem. Nur im internen Netz exponiert.
- **ACLs deaktiviert:** Alle Consul-Operationen (API, DNS, KV) sind ohne Token möglich. Im Homelab akzeptabel, da kein Mehrmandanten-Betrieb.
- **Single Datacenter:** Kein WAN-Federation mit anderen Datacentern. Port 8302 (Serf WAN) ist nicht aktiv genutzt.

::: info Bewusste Entscheidungen
Diese Einschränkungen sind dokumentiert und akzeptiert -- sie sollen beim nächsten Review nicht ohne Abwägung "gefixt" werden.
:::

## Credentials

Der Gossip Encryption Key ist in der Ansible-Konfiguration hinterlegt und wird beim Rollout automatisch auf alle Nodes verteilt. Weitere Zugangsdaten und Tokens: [Credentials](./../_referenz/credentials.md)

## Verwandte Seiten

- [Consul Übersicht](./index.md) -- Architektur und Service Discovery
- [Consul Referenz](./referenz.md) -- Ports, Pfade, DNS-Forwarding
- [Nomad](../nomad/) -- Workload Scheduler, der Services in Consul registriert
- [DNS-Architektur](../dns/) -- DNS-Kette inkl. Consul-Forwarding
- [Credentials](./../_referenz/credentials.md) -- Zugangsdaten und Keys
