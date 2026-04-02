---
title: SMTP Relay
description: Zentraler Mail-Relay fuer Homelab Infrastruktur und Services
tags:
  - smtp
  - mail
  - infrastructure
  - nomad
  - postfix
---

# SMTP Relay

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Image** | `boky/postfix:latest` |
| **Deployment** | Nomad Job (`infrastructure/smtp-relay.nomad`) |
| **Consul DNS** | `smtp.service.consul:25` |
| **Upstream** | `mail.netzone.ch:587` (TLS + SASL) |
| **Absender** | `services@ackermann.systems` |
| **Ressourcen** | 100 MHz CPU, 128 MB RAM (max 256 MB) |
| **Priority** | 90 |

## Beschreibung

Zentraler SMTP-Relay für das gesamte Homelab. Nimmt Mails von internen Nodes und Services ohne Authentifizierung entgegen (Netzwerk `10.0.0.0/8`) und leitet sie via TLS an `mail.netzone.ch` weiter.

**Problem:** Kein Infrastruktur-Node konnte E-Mails versenden — kritische Alerts (Backup-Fehler, Disk-Warnungen, HA-Events) gingen verloren.

**Lösung:** `boky/postfix` als Nomad Job mit Vault-Credentials.

## Architektur

```mermaid
flowchart TD
    subgraph Infra["Infrastruktur-Nodes"]
        PVE:::svc["PVE / PBS / CheckMK<br>Postfix Satellite"]
    end

    subgraph Services["Nomad Services"]
        VW:::svc["Vaultwarden"]
        KC:::svc["Keycloak"]
        PL:::svc["Paperless"]
    end

    PVE -->|"smtp.service.consul:25"| SMTP:::accent["smtp-relay<br>(Nomad Job)<br>boky/postfix<br>10.0.0.0/8 ohne Auth"]
    VW --> SMTP
    KC --> SMTP
    PL --> SMTP
    SMTP -->|"TLS + SASL Auth"| EXT:::ext["mail.netzone.ch<br>Port 587"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Nomad Job

Datei: `infrastructure/smtp-relay.nomad`

* **Image:** `localhost:5000/boky/postfix:latest`
* **Netzwerk:** Host Mode, Port 25 (static)
* **Vault:** `kv/data/smtp` (Relay-Credentials)
* **Nodes:** `vm-nomad-client-04/05/06`

### Environment Variables

| Variable | Zweck |
| :--- | :--- |
| `RELAYHOST` | Upstream SMTP Server (`[mail.netzone.ch]:587`) |
| `RELAYHOST_USERNAME` | SASL Username (aus Vault) |
| `RELAYHOST_PASSWORD` | SASL Passwort (aus Vault) |
| `ALLOWED_SENDER_DOMAINS` | Erlaubte Absender-Domains (`ackermann.systems ackermannprivat.ch homenet.local`) |
| `MYNETWORKS` | Netze ohne Auth (`10.0.0.0/8 127.0.0.0/8`) |
| `POSTFIX_smtp_sasl_mechanism_filter` | SASL-Mechanismen (`plain,login`) |
| `POSTFIX_smtp_tls_security_level` | TLS erzwungen (`encrypt`) |
| `POSTFIX_inet_protocols` | Nur IPv4 (kein IPv6-Routing im Homelab) |
| `POSTFIX_smtp_generic_maps` | Sender-Rewrite auf `services@ackermann.systems` |
| `POSTFIX_myhostname` | SMTP-Hostname (`smtp-relay.ackermann.systems`) |

### Sender-Rewrite

`mail.netzone.ch` erlaubt nur den authentifizierten Benutzer als Absender. Alle Absender-Adressen werden via `smtp_generic_maps` auf `services@ackermann.systems` umgeschrieben. Die ursprüngliche Absender-Info (z.B. `root@pve00`) ist im Mail-Body oder Subject ersichtlich.

### Vault Secret

Pfad: `kv/data/smtp`

| Key | Wert |
| :--- | :--- |
| `host` | `mail.netzone.ch` |
| `port` | `587` |
| `username` | `services@ackermann.systems` |
| `password` | (in Vault) |
| `from` | `homelab@ackermann.systems` |

## Infrastruktur-Nodes (Ansible)

Die Ansible-Role `postfix-relay` konfiguriert Postfix auf Infrastruktur-Nodes als Satellite. Die Postfix-Konfiguration (`main.cf`) wird durch die Role verwaltet.

| Host | IP | Status |
| :--- | :--- | :--- |
| pve00 | 10.0.2.40 | Konfiguriert |
| pve01 | 10.0.2.41 | Konfiguriert |
| pve02 | 10.0.2.42 | Konfiguriert |
| pbs-backup-server | 10.0.2.50 | Konfiguriert |
| checkmk | 10.0.2.150 | Konfiguriert |

**Wichtig:** Alle Infra-Nodes müssen `10.0.2.1` (lxc-dns-01) als DNS-Server verwenden, damit `smtp.service.consul` aufgelöst werden kann.

## Nomad Services

Services können den Relay direkt nutzen via `smtp.service.consul:25` (ohne Auth). Die SMTP-Konfiguration der einzelnen Services (Vaultwarden, Keycloak, Paperless etc.) ist in den jeweiligen Nomad Jobs bzw. Docker Compose Dateien definiert.

## Abhängigkeiten

- [x] Vault (kv/data/smtp Credentials)
- [x] Consul DNS (smtp.service.consul Auflösung)
- [x] Lokale Registry (boky/postfix Image)
- [x] DNS 10.0.2.1/10.0.2.2 (lxc-dns-01/02, für .consul-Auflösung auf Infra-Nodes)
- [ ] Upstream SMTP (mail.netzone.ch erreichbar)

## Troubleshooting

| Problem | Ursache | Lösung |
| :--- | :--- | :--- |
| SASL auth failed | Passwort abgelaufen | Vault Secret updaten, Job restarten |
| Sender rejected | Absender nicht `services@` | Generic-Maps prüfen |
| Host not found (.consul) | DNS nicht auf 10.0.2.1/10.0.2.2 | `/etc/resolv.conf` und `/etc/network/interfaces` prüfen |
| IPv6 unreachable | Kein IPv6-Routing | `inet_protocols = ipv4` in Postfix-Config |

## Verwandte Seiten

- [CheckMK Monitoring](../checkmk/index.md) -- Nutzt SMTP Relay für Alert-E-Mails
- [Proxmox Backup Server](../backup/referenz.md) -- Sendet Backup-Benachrichtigungen via SMTP
- [Proxmox-Cluster](../proxmox/index.md) -- PVE-Nodes als Postfix Satellites
- [DNS-Architektur](../dns/index.md) -- Consul DNS für smtp.service.consul
