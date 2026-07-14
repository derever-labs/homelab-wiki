---
title: Traefik - Betrieb
description: Failover-, Failback- und Split-Brain-Prozeduren für das Traefik-HA-Paar
tags:
  - traefik
  - betrieb
  - ha
---

# Traefik - Betrieb

Betriebsprozeduren für das Traefik-HA-Paar mit Keepalived VIP: Failover, Failback und Split-Brain-Check. HA-Architektur und Split-Brain-Prevention (Gateway-Track, `nopreempt`, atomarer Keepalived-Restart) sind in der [Traefik Übersicht](./index.md) beschrieben, Middleware Chains und TLS-Options in der [Traefik Referenz](./referenz.md).

## Failover-Test

Getestete Szenarien (G2-Test bestanden):

**Failover (MASTER ausgefallen):**
- Keepalived auf dem MASTER-Node stoppen
- Erwartetes Verhalten: VIP wechselt innerhalb ~4s auf den Backup-Node
- Prüfen: VIP liegt auf dem Backup-Node; Services über VIP erreichbar

**Failback (MASTER wieder verfügbar):**
- Keepalived auf dem MASTER-Node starten
- Erwartetes Verhalten: VIP wechselt zurück auf den MASTER-Node (höhere Priorität)
- Prüfen: VIP liegt wieder auf dem MASTER-Node; Services weiterhin erreichbar

**Split-Brain-Check nach Deployment:**
- Nach dem Ansible-Deploy: VIP-Zuordnung auf beiden Nodes prüfen
- Nur ein Node darf die VIP halten
- Falls beide die VIP halten: VRRP-Auth-Konfiguration und Keepalived-Status prüfen

Node-Namen und konkrete IPs siehe [Hosts und IPs](../_referenz/hosts-und-ips.md).

## Verwandte Seiten

- [Traefik Übersicht](./index.md) -- Architektur, HA-Setup und Split-Brain-Prevention
- [Traefik Referenz](./referenz.md) -- Middleware Chains und TLS-Options
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- VIP und Node-Zuordnung
