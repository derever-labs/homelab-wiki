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

| Attribut | Wert |
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

## HashiCorp Stack -- TLS

Bei Consul und Vault ist die interne Kommunikation bewusst ohne TLS konfiguriert. Dies ist eine Homelab-Entscheidung, die das Risiko von Zertifikats-Expiry eliminiert. Consul Gossip Encryption schützt den Cluster-Traffic trotzdem. Nomad nutzt selbstsignierte Zertifikate; CLI und Skripte verbinden sich mit `NOMAD_SKIP_VERIFY=true`.

| Komponente | TLS | Schutz |
| :--- | :--- | :--- |
| Consul | Deaktiviert | Gossip Encryption (symmetrischer Key) |
| Nomad | Aktiv (selbstsigniert, `NOMAD_SKIP_VERIFY=true` bei CLI) | ACLs aktiv |
| Vault | Deaktiviert | Audit Logging, ACLs |

## Proxmox-Nodes -- eigene ACME-Zertifikate

Die Proxmox-Nodes laufen **nicht** hinter Traefik und holen ihre TLS-Zertifikate selbst direkt über den eingebauten ACME-Client (`pvenode acme`). Account `ackermannprivat`, Validierung via Cloudflare DNS-01 (CF-Credentials in `/etc/pve/priv/acme/plugins.cfg`).

| Attribut | Wert |
| :--- | :--- |
| Aussteller | Let's Encrypt |
| Challenge-Typ | DNS-01 (Cloudflare) |
| ACME-Client | Proxmox-eigen (`pvenode acme`), kein Traefik |
| Erneuerung | Automatisch durch Proxmox |

Die Node-FQDNs (`pveXX.ackermannprivat.ch`, `pve-lu-01.ackermannprivat.ch`, `pve01.nana.ackermannprivat.ch`) lösen via Pi-hole-Split-DNS auf die jeweilige Tailscale-IP auf. Dadurch funktioniert in PDM die Anbindung über **FQDN + CA-Trust** (ohne IP-im-SAN und ohne fragiles Fingerprint-Pinning).

## Verwandte Seiten

- [Traefik](../traefik/) -- Reverse Proxy und Zertifikatsverwaltung
- [Vault](../vault/) -- Secrets Management und Security-Entscheidungen
- [Proxmox](../proxmox/) -- PDM-Anbindung und Node-Übersicht
