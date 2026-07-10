---
title: VM-Firewall Betrieb
description: Ausroll-Wellen, Drop-Log-Triage und Lockout-Vermeidung der VM-Firewall
tags:
  - netzwerk
  - security
  - betrieb
---

# VM-Firewall Betrieb

Betriebswissen zur [VM-Firewall](./index.md): wie eine VM sicher unter Filterung genommen wird,
wie die Drop-Logs ausgewertet werden und welche Fallstricke zu einer Selbstaussperrung führen.

## Ausroll-Wellen

Die Firewall wird **strikt sequenziell** scharf geschaltet -- ein System nach dem anderen, mit
einem Verifikations-Gate dazwischen (Quorum, Storage-Status, VIP-Lage, je nach Rolle). Nie zwei
kritische Schichten in einem Schritt. Die bewährte Reihenfolge:

1. **Piloten** -- eine unkritische Verwaltungs-VM und ein gut drainbarer Nomad-Client als erste
   scharfe Systeme.
2. **Nomad-Server** (Control-Plane) -- innerhalb der Welle der Consul- und Nomad-Leader zuletzt.
3. **Nomad-Clients** (Storage-Nodes) -- die beiden LINSTOR/DRBD-Nodes nie gleichzeitig, den Node
   mit dem aktiven LINSTOR-Controller zuletzt.
4. **Traefik-VMs** -- den BACKUP-Node zuerst, den MASTER mit der aktiven VIP zuletzt.
5. **DNS-LXCs** zuletzt -- den Sekundär-Resolver vor dem Primär-Resolver, weil die Clients beide
   kennen und ein Einzelausfall unkritisch bleibt.

Das Leitprinzip: die Komponente, deren Ausfall am meisten mitreisst (Leader, Storage-Controller,
VIP-Master, Primär-Resolver), immer als letzte scharf schalten -- so ist bei einem Fehler die
Redundanz noch intakt.

::: info NIC-Flag-Hotplug ist unterbrechungsfrei
Das Setzen des Firewall-Flags an der virtuellen NIC läuft heiss, ohne Link-Flap und ohne
NIC-Reattach (am Pilot mit 0 % Paketverlust und durchgehender Consul-Membership belegt). Server
und Clients können daher einzeln und ohne Drain genommen werden. Nach dem Live-Setzen des Flags
muss es im VM-Modul (`proxmox-vms`) als `firewall=true` nachgezogen werden, damit ein späterer
VM-Apply den Zustand nicht wieder überschreibt (Drift-Schutz); der gezielte Plan dort ist dann
ein No-op.
:::

## Auto-Revert als Sicherheitsnetz

Vor jedem scharfen Eingriff wird ein zeitgesteuerter Rückroll-Timer auf dem betroffenen
pve-Host gesetzt (Muster `systemd-run` mit kurzer Frist, der die VM-Firewall automatisch wieder
deaktiviert). Bleibt die Verifikation aus oder bricht etwas, stellt der Timer den alten Zustand
selbsttätig wieder her; ist alles grün, wird er manuell abbestellt. Dieses Netz hat im Rollout
mehrfach gegriffen (ein fehlender Port wurde vor Ablauf des Timers nachgezogen).

Zusätzlich bleibt der Rückweg immer offen, weil die **Host-INPUT-Kette auf `ACCEPT`** steht: Die
pve-API kann die VM-Firewall jederzeit wieder abschalten, auch wenn die VM selbst dicht ist.

## Drop-Log-Triage

Nach jeder Welle werden die gedroppten Pakete ausgewertet (die VMs loggen eingehende Drops mit
`log_level_in = info`), bis das Log frisch sauber ist. Die Einträge stehen in der
Firewall-Log der pve-Hosts; die VM-ID steht am **Zeilenanfang** (Grep-Anker `^<VMID>`, nicht
als eingebettetes Feld). Zwei Eigenheiten:

- Die pve-Hosts rotieren die Firewall-Log um Mitternacht. Alt-Einträge von vor einem Fix nicht
  mit frischen Drops verwechseln.
- Der Zeitbezug zählt: relevant sind Drops **nach** dem letzten Regel-Fix.

### Tolerierte Kategorien

Nicht jeder Drop ist ein Fehler. Bewusst toleriert werden:

- **NAS-SSDP-Spätantworten** -- verspätete Broadcast-Antworten der NAS mit Quellport `1900` an
  Ephemeral-Ports. Kein Funktionspfad; die Stack-VMs brauchen kein SSDP.
- **Vereinzelte ICMP-Sonden** von Rack-Geräten an die Resolver -- Beobachtungspunkt, kein
  Dienstpfad (`sg-base` erlaubt ICMP nur von Admin).

Alles, was ein legitimer Dienstpfad ist, wird dagegen als fehlende Regel behandelt und im
Terraform nachgezogen. Eine Liste erwarteter Broadcast- und Discovery-Nebenpfade hilft, in der
Triage sauber zwischen "tolerierbar" und "Regel fehlt" zu trennen.

::: tip Verifikations-Quelle muss ausserhalb der Admin-Zone liegen
Für einen echten Block-Beweis muss die Testquelle ausserhalb von `10.0.0.0/22` **und**
`100.64.0.0/10` liegen (ein Host aus dem Device- oder IoT-VLAN oder extern) -- das gesamte
Management-Netz `10.0.2.x` fällt sonst unter `ip-admin` und ist immer erlaubt. Für den
Erlaubt-Pfad eignet sich eine Management-IP.
:::

## Lockout-Vermeidung

Die grösste Gefahr beim Ausrollen ist die Selbstaussperrung. Vor jedem Eingriff gilt die Frage:
**"Wer kommuniziert über diesen Pfad -- inklusive meiner selbst?"** Drei konkrete Fallen:

- **NoSNAT / ts-input:** Hosts, die selbst `tailscaled` laufen lassen, sind vom Arbeitsplatz nur
  über ihre **native Tailscale-IP** erreichbar, nicht über die LAN-IP (die LAN-IP läuft ins
  ts-input-DROP und läuft in einen Timeout). Beim Scharfschalten einer solchen VM daher immer die
  TS-IP als Zugangspfad verwenden. Hintergrund: [Tailscale](../netzwerk/tailscale.md).
- **Subnet-Router-Rückweg:** Die Traefik-VMs routen das Tailnet. Geroutete Rückweg-Pakete
  LAN -> Tailnet treffen die Eingangskette der VM-Firewall; bei asymmetrischem Routing (Hinweg
  über den einen, Rückweg über den anderen Node) existiert kein Conntrack-Eintrag, und
  `input DROP` würde den kompletten Tailnet-Zugriff killen -- inklusive Operator. Die Regel
  `dest 100.64.0.0/10` in `sg-traefik` fängt das ab und muss vor dem Scharfschalten stehen.
- **VRRP vor dem Scharfschalten:** Ohne die VRRP-Regel zwischen beiden Traefik-Nodes beanspruchen
  nach dem Scharfschalten beide gleichzeitig die Keepalived-VIP (Split-Brain).

::: danger Operator-Zugang zuerst absichern
Bevor eine VM auf `input DROP` geht, muss der eigene Zugangspfad in einer erlaubenden Regel
stehen. `ip-admin` deckt den Operator über den Tailnet-CGNAT-Bereich ab -- fehlt dieser Bereich,
sperrt das erste `input DROP` den Operator aus. Der Notanker ist die Proxmox-Konsole über die
pve-API, deren Host-INPUT auf `ACCEPT` bleibt.
:::

## Terraform-State und -Zugang

- Der State des Firewall-Moduls liegt **lokal** (`terraform.tfstate`, gitignored) und ist vom
  VM-Modul getrennt. Die `terraform.tfvars` enthält den Proxmox-API-Zugang.
- Die Proxmox-API wird über die **Tailscale-IP** eines pve-Hosts angesprochen, nicht über die
  LAN-IP -- letztere läuft wegen NoSNAT ins Leere. Das gilt auch für den No-op-Apply im VM-Modul.

## Verwandte Seiten

- [VM-Firewall](./index.md) -- Architektur und Rolle im Stack
- [Referenz](./referenz.md) -- Security-Groups, IPSets und Zuordnung
- [Tailscale](../netzwerk/tailscale.md) -- Overlay, NoSNAT und Subnet-Router
- [Proxmox Betrieb](../proxmox/betrieb.md) -- Host-Wartung und HA-Prüfungen
