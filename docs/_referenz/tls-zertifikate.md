---
title: TLS-Zertifikate
description: Zertifikatsverwaltung, Aussteller und Pfade
tags:
  - referenz
  - tls
  - zertifikate
---

# TLS-Zertifikate

## Let's Encrypt via Traefik

Alle öffentlichen Services unter `*.ackermannprivat.ch` erhalten automatisch TLS-Zertifikate über Traefik. Traefik nutzt die Cloudflare DNS Challenge für die Validierung -- es muss kein Port 80 nach aussen offen sein.

| Eigenschaft | Wert |
| :--- | :--- |
| Aussteller | Let's Encrypt |
| Challenge-Typ | DNS-01 (Cloudflare) |
| Domain | `*.ackermannprivat.ch` |
| Erneuerung | Automatisch durch Traefik |

## NFS-Zertifikate

Zertifikate, die von mehreren Services benötigt werden, liegen auf dem NFS-Share:

| Pfad | Zugriff | Verwendung |
| :--- | :--- | :--- |
| `/nfs/cert` | Read-only | Geteilte Zertifikate für Services |

## HashiCorp Stack -- TLS deaktiviert

Die interne Kommunikation zwischen Consul, Nomad und Vault ist bewusst ohne TLS konfiguriert. Dies ist eine Homelab-Entscheidung, die das Risiko von Zertifikats-Expiry eliminiert. Consul Gossip Encryption schützt den Cluster-Traffic trotzdem.

| Komponente | TLS | Schutz |
| :--- | :--- | :--- |
| Consul | Deaktiviert | Gossip Encryption (symmetrischer Key) |
| Nomad | Deaktiviert | ACLs aktiv |
| Vault | Deaktiviert | Audit Logging, ACLs |

## Verwandte Seiten

- [Traefik](../traefik/) -- Reverse Proxy und Zertifikatsverwaltung
- [Vault](../vault/) -- Secrets Management und Security-Entscheidungen
