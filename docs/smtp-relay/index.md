---
title: SMTP Relay
description: Zentraler Mail-Relay für Homelab-Infrastruktur und Services
tags:
  - smtp
  - mail
  - infrastructure
  - nomad
  - postfix
---

# SMTP Relay

## Übersicht

Zentraler SMTP-Relay für das gesamte Homelab. Nimmt Mails von internen Nodes und Services ohne Authentifizierung entgegen (Management-VLAN `10.0.2.0/24`) und leitet sie via TLS an `mail.netzone.ch` weiter. Ohne den Relay konnte kein Infrastruktur-Node E-Mails versenden, sodass kritische Alerts (Backup-Fehler, Disk-Warnungen, HA-Events) verloren gingen. Der Relay (`boky/postfix` als Nomad Job mit Vault-Credentials) schliesst diese Lücke.

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `infrastructure/smtp-relay.nomad` |
| Consul DNS | `smtp.service.consul:25` |
| Secrets | Vault `kv/data/smtp-relay` |

## Architektur

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

Infra: Infrastruktur-Nodes {
  class: container

  PVE: "PVE / PBS / CheckMK\n(Postfix Satellite)" {
    class: node
    tooltip: "Ansible-Role postfix-relay -- lokaler Postfix leitet an den Relay weiter"
  }
}

Services: Nomad Services {
  class: container

  AK: Authentik {
    class: node
    tooltip: "Recovery-Mails und Benachrichtigungen"
  }
  VW: Vaultwarden {
    class: node
    tooltip: "Einladungen und Master-Password-Hints"
  }
  PL: Paperless {
    class: node
  }
}

SMTP: smtp-relay (Nomad Job) {
  class: node
  tooltip: "boky/postfix | nimmt nur 10.0.2.0/24 ohne Auth an | Sender-Rewrite auf services@ackermann.systems"
}

EXT: mail.netzone.ch {
  class: node
  tooltip: "Upstream-Smarthost Port 587"
}

Infra.PVE -> SMTP: "smtp.service.consul:25"
Services.AK -> SMTP
Services.VW -> SMTP
Services.PL -> SMTP
SMTP -> EXT: "TLS + SASL Auth"
```

## Konfiguration

### Nomad Job

Datei: `infrastructure/smtp-relay.nomad`

* **Netzwerk:** Host Mode, Port 25 (static)
* **Vault:** `kv/data/smtp-relay` (Relay-Credentials)
* **Nodes:** `vm-nomad-client-04/05/06`

### Environment Variables

| Variable | Zweck |
| :--- | :--- |
| `RELAYHOST` | Upstream SMTP Server (`[mail.netzone.ch]:587`) |
| `RELAYHOST_USERNAME` | SASL Username (aus Vault) |
| `RELAYHOST_PASSWORD` | SASL Passwort (aus Vault) |
| `ALLOWED_SENDER_DOMAINS` | Erlaubte Absender-Domains (`ackermann.systems ackermannprivat.ch homenet.local`) |
| `POSTFIX_mynetworks` | Netze ohne Auth (`127.0.0.0/8 10.0.2.0/24`) |
| `POSTFIX_smtp_sasl_mechanism_filter` | SASL-Mechanismen (`plain,login`) |
| `POSTFIX_smtp_tls_security_level` | TLS + Cert-Verifikation erzwungen (`verify`) |
| `POSTFIX_inet_protocols` | Nur IPv4 (kein IPv6-Routing im Homelab) |
| `POSTFIX_sender_canonical_classes` | Rewrite-Geltungsbereich (`envelope_sender,header_sender`) |
| `POSTFIX_sender_canonical_maps` | Sender-Rewrite-Map auf `services@ackermann.systems` |
| `POSTFIX_myhostname` | SMTP-Hostname (`smtp-relay.ackermann.systems`) |

::: tip Warum nur das Management-Subnetz?
`POSTFIX_mynetworks` ist auf `10.0.2.0/24` (Management-VLAN) eingeschränkt. Das verhindert, dass beliebige Hosts aus dem LAN (`10.0.0.0/8`) den Relay ohne Authentifizierung nutzen können. Alle legitimen Sender (PVE-Nodes, PBS, CheckMK, Nomad-Services) laufen im Management-VLAN.
:::

### Sender-Rewrite

`mail.netzone.ch` erlaubt nur den authentifizierten Benutzer als Absender. Alle Absender-Adressen werden via `sender_canonical_maps` (Geltungsbereich `envelope_sender,header_sender`) auf `services@ackermann.systems` umgeschrieben. Bewusst nicht `smtp_generic_maps`, da dieses auch Empfänger umschreibt und so alle Mails zurück in die `services@`-Inbox umleitete. Die ursprüngliche Absender-Info (z.B. `root@pve00`) ist im Mail-Body oder Subject ersichtlich.

### Vault Secret

Die Relay-Credentials liegen in Vault unter `kv/data/smtp-relay`. Der Job liest die Keys `host`, `port`, `username`, `password` und `dkim_private_key` aus. Aus den ersten vier entstehen `RELAYHOST`, `RELAYHOST_USERNAME` und `RELAYHOST_PASSWORD`. Der Schlüssel `dkim_private_key` liefert den DKIM-Signierschlüssel (Selector `mail2026`) für beide Domains.

## Infrastruktur-Nodes (Ansible)

Die Ansible-Role `postfix-relay` konfiguriert Postfix auf den PVE-Nodes, dem Backup-Server und CheckMK als Satellite. Die Postfix-Konfiguration (`main.cf`) wird durch die Role verwaltet. Welche Nodes betroffen sind und deren IPs: [Hosts und IPs](../_referenz/hosts-und-ips.md).

**Wichtig:** Alle Infra-Nodes müssen lxc-dns-01 als DNS-Server verwenden, damit `smtp.service.consul` aufgelöst werden kann.

## Abhängigkeiten

- Vault (`kv/data/smtp-relay` Credentials)
- Consul DNS (`smtp.service.consul` Auflösung)
- Lokale Container Registry
- lxc-dns-01/02 (für `.consul`-Auflösung auf Infra-Nodes)
- Upstream SMTP (`mail.netzone.ch` erreichbar)

## Troubleshooting

| Problem | Ursache | Lösung |
| :--- | :--- | :--- |
| SASL auth failed | Passwort abgelaufen | Vault Secret updaten, Job restarten |
| Sender rejected | Absender nicht `services@` | `sender_canonical`-Map prüfen |
| Host not found (.consul) | DNS-Server nicht lxc-dns-01/02 | `resolv.conf` auf Node prüfen |
| IPv6 unreachable | Kein IPv6-Routing | `inet_protocols = ipv4` in Postfix-Config |

## Verwandte Seiten

- [CheckMK Monitoring](../monitoring/checkmk/index.md) -- Nutzt SMTP Relay für Alert-E-Mails
- [Proxmox Backup Server](../backup/referenz.md) -- Sendet Backup-Benachrichtigungen via SMTP
- [Proxmox-Cluster](../proxmox/index.md) -- PVE-Nodes als Postfix Satellites
- [DNS-Architektur](../dns/index.md) -- Consul DNS für smtp.service.consul
