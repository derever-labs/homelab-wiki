---
title: SMTP Relay
description: Zentraler Mail-Relay fuer Homelab Infrastruktur und Services
published: true
date: 2026-02-21T15:00:00+00:00
tags: smtp, mail, infrastructure, nomad, postfix
editor: markdown
---

# SMTP Relay

## Uebersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Image** | `boky/postfix:latest` |
| **Deployment** | Nomad Job (`infrastructure/smtp-relay.nomad`) |
| **Consul DNS** | `smtp.service.consul:25` |
| **Upstream** | `mail.netzone.ch:587` (TLS + SASL) |
| **Absender** | `services@ackermann.systems` |

## Beschreibung

Zentraler SMTP-Relay fuer das gesamte Homelab. Nimmt Mails von internen Nodes und Services ohne Authentifizierung entgegen (Netzwerk `10.0.0.0/8`) und leitet sie via TLS an `mail.netzone.ch` weiter.

**Problem:** Kein Infrastruktur-Node konnte E-Mails versenden — kritische Alerts (Backup-Fehler, Disk-Warnungen, HA-Events) gingen verloren.

**Loesung:** `boky/postfix` als Nomad Job mit Vault-Credentials.

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
| `POSTFIX_smtp_sasl_mechanism_filter` | SASL auf `plain,login` beschraenkt |
| `POSTFIX_smtp_tls_security_level` | TLS erzwungen (`encrypt`) |
| `POSTFIX_inet_protocols` | Nur IPv4 (kein IPv6-Routing im Homelab) |
| `POSTFIX_smtp_generic_maps` | Sender-Rewrite auf `services@ackermann.systems` |

### Sender-Rewrite

`mail.netzone.ch` erlaubt nur den authentifizierten Benutzer als Absender. Alle Absender-Adressen werden via `smtp_generic_maps` auf `services@ackermann.systems` umgeschrieben:

```
/^.*$/   services@ackermann.systems
```

Die urspruengliche Absender-Info (z.B. `root@pve00`) ist im Mail-Body oder Subject ersichtlich.

### Vault Secret

Pfad: `kv/data/smtp`

| Key | Wert |
| :--- | :--- |
| `host` | `mail.netzone.ch` |
| `port` | `587` |
| `username` | `services@ackermann.systems` |
| `password` | (in Vault) |
| `from` | `homelab@ackermann.systems` |

Zugriff ueber bestehende Policy `nomad-workload` (erlaubt `read` auf `kv/data/*`).

## Infrastruktur-Nodes (Ansible)

Die Ansible-Role `postfix-relay` konfiguriert Postfix auf Infrastruktur-Nodes als Satellite:

```bash
cd homelab-hashicorp-stack/ansible
ansible-playbook playbooks/configure-smtp-relay.yml
```

**Targets:**
| Host | IP | Status |
| :--- | :--- | :--- |
| pve00 | 10.0.2.40 | Konfiguriert |
| pve01 | 10.0.2.41 | Konfiguriert |
| pve02 | 10.0.2.42 | Konfiguriert |
| pbs-backup-server | 10.0.2.50 | Konfiguriert |
| checkmk | 10.0.2.150 | Konfiguriert |

**Postfix-Konfiguration** (`/etc/postfix/main.cf`):
```
myhostname = <hostname>.homenet.local
mydestination = $myhostname, localhost
relayhost = [smtp.service.consul]:25
inet_interfaces = loopback-only
inet_protocols = ipv4
mynetworks = 127.0.0.0/8
```

**Wichtig:** Alle Infra-Nodes muessen `10.0.2.1` als DNS-Server verwenden, damit `smtp.service.consul` aufgeloest werden kann.

## Nomad Services

Services koennen den Relay direkt nutzen via `smtp.service.consul:25` (ohne Auth).

### Vaultwarden
```
SMTP_HOST=smtp.service.consul
SMTP_PORT=25
SMTP_SECURITY=off
SMTP_FROM=services@ackermann.systems
SMTP_FROM_NAME=Vaultwarden
```

### Keycloak (Docker Compose auf vm-proxy-dns-01)
```yaml
KC_SPI_EMAIL_SMTP_HOST: smtp.service.consul
KC_SPI_EMAIL_SMTP_PORT: "25"
KC_SPI_EMAIL_SMTP_AUTH: "false"
KC_SPI_EMAIL_SMTP_STARTTLS: "false"
KC_SPI_EMAIL_SMTP_FROM: services@ackermann.systems
KC_SPI_EMAIL_SMTP_FROM_DISPLAY_NAME: "Homelab SSO"
```

## Abhaengigkeiten

- [x] Vault (kv/data/smtp Credentials)
- [x] Consul DNS (smtp.service.consul Aufloesung)
- [x] Lokale Registry (boky/postfix Image)
- [x] DNS-Proxy 10.0.2.1 (fuer .consul-Aufloesung auf Infra-Nodes)
- [ ] Upstream SMTP (mail.netzone.ch erreichbar)

## Maintenance & Runbook

### Verifikation

```bash
# 1. Nomad Job Status
nomad job status smtp-relay

# 2. Consul Service Check
dig smtp.service.consul

# 3. Test-Mail vom Relay (sendmail, da mail nicht im Container)
ALLOC=$(nomad job status smtp-relay | grep running | awk '{print $1}')
nomad alloc exec $ALLOC sh -c 'printf "Subject: Test\nFrom: test@homenet.local\nTo: ziel@example.com\n\nTest\n" | sendmail ziel@example.com'

# 4. Test-Mail von PBS
ssh root@10.0.2.50 'echo "PBS Test" | mail -s "PBS SMTP Test" ziel@example.com'
```

### Troubleshooting

```bash
# Postfix Logs im Container
nomad alloc logs -job smtp-relay postfix

# Mail Queue im Container pruefen
ALLOC=$(nomad job status smtp-relay | grep running | awk '{print $1}')
nomad alloc exec $ALLOC postqueue -p

# Queue flushen
nomad alloc exec $ALLOC postqueue -f

# Auf Infrastruktur-Node
journalctl -u postfix --since "1 hour ago"
mailq
```

**Haeufige Probleme:**

| Problem | Ursache | Loesung |
| :--- | :--- | :--- |
| SASL auth failed | Passwort abgelaufen | Vault Secret updaten, Job restarten |
| Sender rejected | Absender nicht `services@` | Generic-Maps pruefen |
| Host not found (.consul) | DNS nicht auf 10.0.2.1 | `/etc/resolv.conf` und `/etc/network/interfaces` pruefen |
| IPv6 unreachable | Kein IPv6-Routing | `inet_protocols = ipv4` in Postfix-Config |

### Vault Secret aendern

```bash
export VAULT_ADDR=http://10.0.2.104:8200
export VAULT_TOKEN=$(cat .vault-token)
vault kv put kv/smtp host="mail.netzone.ch" port="587" \
  username="services@ackermann.systems" password="<NEUES_PW>" \
  from="homelab@ackermann.systems"

# Nomad Job restarten (damit neues Secret gezogen wird)
nomad job stop smtp-relay && nomad job run infrastructure/smtp-relay.nomad
```

### Update

```bash
# Image aktualisieren (wird via Pull-Through Cache gezogen)
nomad job run infrastructure/smtp-relay.nomad
```

---
*Dokumentation erstellt am: 21.02.2026*
