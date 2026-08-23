---
title: Portale
description: welcome als Gast-Portal und intra als Arbeits-Portal, beide aus einem statischen Nomad-Job
tags:
  - service
  - portal
  - nomad
  - nginx
---

# Portale

Zwei statische Einstiegsseiten aus einem einzigen Nomad-Job: `welcome` als Portal für Gäste und Familie, `intra` als Arbeits-Portal für den Betrieb. Sie lösten im Juli 2026 die früheren Flame- und Homepage-Dashboards ab.

## Übersicht

**welcome (Gast-Portal)**

| Attribut | Wert |
|----------|------|
| URL | [welcome.ackermannprivat.ch](https://welcome.ackermannprivat.ch) |
| Deployment | Nomad Job `services/welcome-ackermann.nomad` |
| Storage | Kein Volume, Inhalte liegen im Image |
| Auth | `public-auth@file` |

**intra (Arbeits-Portal)**

| Attribut | Wert |
|----------|------|
| URL | [intra.ackermannprivat.ch](https://intra.ackermannprivat.ch) |
| Deployment | Gleicher Job wie welcome, zweiter Traefik-Router |
| Storage | Kein Volume, Inhalte liegen im Image |
| Auth | ClientIP-Filter (RFC-1918 und CGNAT) plus `intern-auth@file` |

## Rolle im Stack

Die Portale sind die Einstiegspunkte ins Homelab und bündeln die Links auf die übrigen Dienste. Sie sitzen am Ingress hinter Traefik und Authentik und halten selbst keinen Zustand: kein Volume, keine Datenbank, keine Secrets. Ein Eintrag ist Markup im App-Repo, kein Datensatz in einer Admin-Oberfläche -- das war der Hauptgrund für die Ablösung der früheren Dashboards, deren Kacheln nur in einem Volume lebten und damit weder versioniert noch reproduzierbar waren.

Beide Seiten teilen einen Job, ein Image und einen Document-Root. Getrennt werden sie ausschliesslich über zwei Traefik-Router mit unterschiedlichen Middleware-Chains.

## Zwei Portale, ein Document-Root

`welcome` richtet sich an Gäste und Familie und ist von aussen erreichbar: Medien, Wunschliste, Statusseite, eigener Account. `intra` ist das Arbeits-Portal und trägt die Admin- und Monitoring-Werkzeuge, gruppiert nach Aufgabe.

Welche Anwendung auf welches Portal gehört und welche Dienste bewusst auf keinem von beiden stehen, ist im App-Repo unter `docs/inventar.md` begründet -- inklusive der Auslassungen, damit ein fehlender Eintrag nicht mit einem Versehen verwechselt wird.

::: danger Trennung hängt an einer nginx-Regel
Beide Portale liefern aus demselben Document-Root. Nur der intra-Router ist per ClientIP abgesichert, der welcome-Router ist es nicht. Damit das Arbeits-Portal nicht über den externen Host erreichbar wird, gibt `nginx.conf` im welcome-Server für `/intra.html` bewusst 404 zurück. Wird diese Regel entfernt, überschattet oder die Datei in ein anderes Verzeichnis verschoben, ist der ClientIP-Schutz umgangen.
:::

## Betrieb

Kacheln und Inhalte werden im App-Repo `derever-labs/welcome-ackermann` gepflegt, nicht im Cluster. Ein Merge auf `main` baut das Image, schiebt es nach ZOT und lässt den Job-Tag automatisch nachziehen -- ein manuelles `nomad job run` erzeugt nur Drift zwischen Cluster und Git. Das Erscheinungsbild kommt aus dem vendorten Design-System, Änderungen daran gehören ins Repo `ackermann-design-system`.

## Verwandte Seiten

- [Traefik Reverse Proxy](../../edge/traefik/index.md) -- Ingress und Middleware-Chains (public-auth vs. intern-auth)
- [Traefik Middleware Chains](../../edge/traefik/referenz.md) -- Unterschied public-auth vs. intern-auth Chains
- [CrowdSec](../../edge/crowdsec/index.md) -- IP-Blocking für die öffentlich erreichbare welcome-Instanz
- [Authentik](../../edge/authentik/index.md) -- Anmeldung und Gruppen-Zuordnung vor beiden Portalen
