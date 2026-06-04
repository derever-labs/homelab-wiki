---
title: "TLS-Zertifikate"
description: Zwei getrennte Zertifikatspfade im Homelab -- Traefik-Wildcard und direktes NAS-Zertifikat
tags:
  - referenz
  - tls
  - zertifikate
  - acme
  - traefik
  - nas
---

# TLS-Zertifikate

## Übersicht

Das Homelab verwendet zwei vollständig getrennte Zertifikatspfade -- beide via Let's Encrypt (ACME) mit Cloudflare DNS-01-Challenge, aber mit unterschiedlichen ACME-Clients, Subdomains und Challenge-Records:

- **Pfad 1:** Traefik als ACME-Client -- Wildcard `*.ackermannprivat.ch` für alle reverse-proxied Services
- **Pfad 2:** `acme.sh` direkt auf dem NAS (DS1825+) -- dediziertes Zertifikat für `login.ackermannprivat.ch` inkl. nativer Synology-Dienste

Die zwei Challenge-Records sind kollisionsfrei, da sie auf unterschiedliche Subdomains ausgestellt werden:
- Traefik: `_acme-challenge.ackermannprivat.ch` (Wildcard)
- acme.sh auf NAS: `_acme-challenge.login.ackermannprivat.ch` (Single-Hostname)

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: down

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

CF: Cloudflare DNS {
  class: node
  tooltip: "Zone ackermannprivat.ch | DNS-01 ACME-Validierung"
}

path1: Pfad 1 -- Traefik Wildcard {
  class: container

  Traefik: "Traefik v3.4 HA\n(vm-traefik-01 MASTER / vm-traefik-02 BACKUP)" {
    class: node
    tooltip: "10.0.2.21 / 10.0.2.22 | VIP 10.0.2.20 | certificatesResolvers Cloudflare DNS-01, EC256 | acme.json lokal"
  }
  Services: "Reverse-proxied Services\n(*.ackermannprivat.ch)" {
    class: node
    tooltip: "Alle Homelab-Services hinter Traefik -- TLS-Terminierung zentral"
  }
  Traefik -> Services: "TLS terminiert\n(Wildcard-Cert)"
}

path2: Pfad 2 -- NAS direkt {
  class: container

  AcmeSH: "acme.sh\n(nativ auf NAS)" {
    class: node
    tooltip: "/usr/local/share/acme.sh | --nocron | crontab Mittwoch 04:00"
  }
  DSMStore: "DSM-Cert-Store\n(/usr/syno/etc/certificate/_archive/<DEFAULT>)" {
    class: node
    tooltip: "reloadcmd-Script kopiert Cert in alle System- und Paket-Dienst-Stores + nginx-Reload"
  }
  DSMServices: "DSM-Web + Drive (Port 6690) + Photos" {
    class: node
    tooltip: "DSM terminiert TLS direkt auf allen Ports -- kein Proxy dazwischen"
  }
  AcmeSH -> DSMStore: "--install-cert\nreloadcmd"
  DSMStore -> DSMServices: "synosystemctl\nrestart nginx"
}

CF -> path1.Traefik: "_acme-challenge\n.ackermannprivat.ch" {
  style.stroke: "#2563eb"
}
CF -> path2.AcmeSH: "_acme-challenge\n.login.ackermannprivat.ch" {
  style.stroke: "#16a34a"
}
```

## Pfad 1 -- Traefik (Wildcard `*.ackermannprivat.ch`)

Traefik ist der ACME-Client für alle reverse-proxied Services. Details zur Traefik-Architektur, dem HA-Setup und der Zertifikatsspeicherung: [Traefik Reverse Proxy](../traefik/index.md).

- Challenge: Cloudflare DNS-01, Algorithmus EC256
- Speicherort: `/opt/traefik/acme/acme.json` (lokal auf beiden Traefik-VMs, je eigene Kopie)
- Erneuerung: vollautomatisch durch Traefik, keine manuelle Intervention nötig
- Geltungsbereich: alle Services unter `*.ackermannprivat.ch` und `*.ackermann.systems`

::: info Ablösung traefik-certs-dumper (2026-06)
Der früher verwendete `traefik-certs-dumper`-Container, der Zertifikate nach `/nfs/cert/` exportierte, wird abgelöst. Der NFS-Export `/nfs/cert/` wird nicht mehr benötigt, sobald alle Konsumenten umgestellt sind.
:::

## Pfad 2 -- NAS (DS1825+, `login.ackermannprivat.ch`)

Das Synology-DSM-Webinterface und native Synology-Dienste brauchen ein gültiges TLS-Zertifikat direkt auf dem NAS. Hintergrund: Details zur NAS-Architektur: [NAS Storage](../nas-storage/index.md).

### Warum ein direktes Zertifikat auf dem NAS

::: warning Synology Drive synct über ein proprietäres Protokoll auf Port 6690
Ein HTTP-Reverse-Proxy wie Traefik kann den nativen Sync-Traffic nicht tunneln. Nur Web-UIs wären über Traefik erreichbar -- die Sync-Dienste nicht. Das Zertifikat muss deshalb direkt auf dem NAS liegen; DSM terminiert TLS auf allen Diensten und Ports selbst.

Ein reines Tailscale-Setup scheidet aus, weil die Client-Geräte nicht auf Tailscale laufen.
:::

### Sicherheitseinordnung

::: warning Synology CVE-Historie -- Härtung ist Pflicht
Direkter Internetzugang zu DSM ist mit Risiko verbunden (Beispiel: CVE-2024-10443 RISK:STATION, zero-click RCE). Erforderliche Massnahmen: DSM-Firewall, Auto-Block, 2FA. Diese Härtung ist Voraussetzung, keine Option.
:::

### Mechanismus

`acme.sh` läuft nativ auf dem NAS (kein Container) unter `/usr/local/share/acme.sh`, installiert mit `--nocron`.

**Ausstellung und Erneuerung:**

- Domain: `login.ackermannprivat.ch`
- Challenge: Cloudflare DNS-01 (getrennt von Traefik: `_acme-challenge.login.ackermannprivat.ch`)
- Cron-Eintrag in `/etc/crontab`: wöchentlich, Mittwoch 04:00, `acme.sh --cron` -- `synocrond` lädt ihn ein

**Verteilung ins DSM:**

`acme.sh --install-cert` mit `reloadcmd`-Script `/usr/local/share/acme.sh/dsm-deploy/install-to-dsm.sh`. Das Script:
1. Kopiert Cert und Key in den DSM-Default-Cert-Store (`/usr/syno/etc/certificate/_archive/<DEFAULT>`)
2. Kopiert Cert und Key in alle System- und Paket-Dienst-Stores
3. Führt `synosystemctl restart nginx` aus

::: info Warum kein offizieller acme.sh `synology_dsm`-Deploy-Hook
Der offizielle Hook registriert das Zertifikat über die DSM-Cert-API -- auf diesem DSM erkannte die API das hochgeladene Cert nicht zuverlässig. Das `reloadcmd`-Script bildet stattdessen den bewährten Mechanismus des früheren `cert.sh` nach, wird aber von nativem `acme.sh` getrieben (abgelöst 2026-06).
:::

## HashiCorp Stack -- TLS deaktiviert

Die interne Kommunikation zwischen Consul, Nomad und Vault ist bewusst ohne TLS konfiguriert. Diese Homelab-Entscheidung eliminiert das Risiko von Zertifikats-Expiry-Ausfällen. Der Cluster-Traffic ist trotzdem geschützt:

- **Consul:** Gossip Encryption (symmetrischer Key)
- **Nomad:** ACLs aktiv
- **Vault:** Audit Logging und ACLs aktiv

## Verwandte Seiten

- [Traefik Reverse Proxy](../traefik/index.md) -- Wildcard-Zertifikat, acme.json, HA-Setup
- [NAS Storage](../nas-storage/index.md) -- Synology DS1825+, DSM-Dienste
- [Vault](../vault/index.md) -- Secrets Management und Security-Entscheidungen
