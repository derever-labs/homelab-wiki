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

## Beschreibung

Zentraler SMTP-Relay für das gesamte Homelab. Nimmt Mails von internen Nodes und Services ohne Authentifizierung entgegen (Netzwerk `10.0.0.0/8`) und leitet sie via TLS an `mail.netzone.ch` weiter.

**Problem:** Kein Infrastruktur-Node konnte E-Mails versenden — kritische Alerts (Backup-Fehler, Disk-Warnungen, HA-Events) gingen verloren.

**Lösung:** `boky/postfix` als Nomad Job mit Vault-Credentials.

## Architektur

```
PVE/PBS/CheckMK                    Nomad Services
┌──────────────┐                   ┌──────────────────┐
│ postfix      │                   │ Vaultwarden      │
│ relayhost =  │──┐               │ Keycloak         │
│ smtp.service │  │               │ Paperless        │
│ .consul:25   │  │               └────────┬─────────┘
└──────────────┘  │                        │
                  ▼                        ▼
           ┌─────────────────────────────────────┐
           │  smtp-relay (Nomad Job)              │
           │  boky/postfix Container              │
           │  smtp.service.consul:25              │
           │  Akzeptiert von 10.0.0.0/8 ohne Auth │
           └──────────────┬──────────────────────┘
                          │ TLS + SASL Auth
                          ▼
                 ┌──────────────────┐
                 │ mail.netzone.ch  │
                 │ Port 587         │
                 └──────────────────┘
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
| `ALLOWED_SENDER_DOMAINS` | Erlaubte Absender-Domains |
| `MYNETWORKS` | Netze ohne Auth (`10.0.0.0/8 127.0.0.0/8`) |
| `POSTFIX_smtp_tls_security_level` | TLS erzwungen (`encrypt`) |
| `POSTFIX_inet_protocols` | Nur IPv4 (kein IPv6-Routing im Homelab) |
| `POSTFIX_smtp_generic_maps` | Sender-Rewrite auf `services@ackermann.systems` |

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

**Wichtig:** Alle Infra-Nodes müssen `10.0.2.1` als DNS-Server verwenden, damit `smtp.service.consul` aufgelöst werden kann.

## Nomad Services

Services können den Relay direkt nutzen via `smtp.service.consul:25` (ohne Auth). Die SMTP-Konfiguration der einzelnen Services (Vaultwarden, Keycloak, Paperless etc.) ist in den jeweiligen Nomad Jobs bzw. Docker Compose Dateien definiert.

## Abhängigkeiten

- [x] Vault (kv/data/smtp Credentials)
- [x] Consul DNS (smtp.service.consul Auflösung)
- [x] Lokale Registry (boky/postfix Image)
- [x] DNS-Proxy 10.0.2.1 (für .consul-Auflösung auf Infra-Nodes)
- [ ] Upstream SMTP (mail.netzone.ch erreichbar)

## Troubleshooting

| Problem | Ursache | Lösung |
| :--- | :--- | :--- |
| SASL auth failed | Passwort abgelaufen | Vault Secret updaten, Job restarten |
| Sender rejected | Absender nicht `services@` | Generic-Maps prüfen |
| Host not found (.consul) | DNS nicht auf 10.0.2.1 | `/etc/resolv.conf` und `/etc/network/interfaces` prüfen |
| IPv6 unreachable | Kein IPv6-Routing | `inet_protocols = ipv4` in Postfix-Config |

---
*Dokumentation erstellt am: 21.02.2026*
