---
title: VM-Firewall
description: Proxmox-VM-Firewall als Least-Privilege-Segmentierung der Stack-VMs (input DROP, Security-Groups, Terraform-managed)
tags:
  - netzwerk
  - security
  - proxmox
  - segmentierung
---

# VM-Firewall

Die Proxmox-VM-Firewall filtert den eingehenden Verkehr direkt an der virtuellen NIC
jeder Stack-VM. Sie setzt eine Default-Deny-Policy (`input DROP`) durch: Nur explizit
erlaubte Quellen und Dienste kommen an die VM, alles andere faellt. Das Regelwerk ist
vollstaendig Terraform-managed und bildet die Enforcement-Schicht der Netzwerk-Segmentierung.

## Übersicht

| Attribut | Wert |
|----------|------|
| Ebene | Proxmox-Firewall pro VM/LXC (virtuelle NIC `net0`) |
| Policy | `input DROP` / `output ACCEPT` |
| Deployment | Terraform-Modul `terraform/proxmox-firewall/` (bpg-Provider, eigener State-Scope) |
| Umfang | 3 Nomad-Server, 3 Nomad-Clients, 2 Traefik-VMs, 2 DNS-LXCs (plus Pilot-VMs) |
| IPs/VMs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |
| Ports | [Ports und Dienste](../_referenz/ports-und-dienste.md) |

## Rolle im Stack

Die VM-Firewall ist die dritte und innerste Segmentierungs-Schicht des Homelab. Die
[VLAN-Segmente](../netzwerk/index.md#netzwerk-segmente) trennen die Zonen auf dem UniFi-Gateway
(die [Perimeter-Firewall](../unifi/referenz.md#firewall) am Netzrand), das Tailscale-Overlay regelt
den Remote-Zugang -- und die VM-Firewall zieht die Grenze unmittelbar an jeder einzelnen VM. Damit ist eine Stack-VM auch dann geschuetzt, wenn ein
Angreifer bereits im selben Subnetz steht (kompromittiertes Gerät im Management-Netz, lateral
movement): Ohne passende Regel erreicht er den Dienst nicht.

Der Leitsatz der Auslegung lautet **"von ausserhalb des Clusters dicht"**. Die grobe
Segmentierung nach aussen macht die VM-Firewall; den intra-Cluster-Feinschliff (mTLS,
Service-Intentions) uebernimmt spaeter das Service-Mesh. Die VM-Firewall friert daher die
Platzierung von Nomad-Jobs bewusst nicht ein: cluster-interne statische Ports sind pauschal
fuer die Cluster-Mitglieder offen, nur der Zugriff von ausserhalb ist eingeschraenkt.

::: info Warum diese Schicht
Zwei Ziele: **Least Privilege** je VM (jede VM nimmt nur die Dienste an, die sie wirklich
anbietet, und nur von den Quellen, die sie wirklich brauchen) und die **Vorbereitung des
Service-Mesh** (Phase 3+). Die Firewall alleine schliesst den intra-VM-Vektor nicht -- dafür
kommt das Mesh -- aber sie schneidet den gesamten Zugriff von ausserhalb des Clusters auf ein
nachvollziehbares Minimum zurueck.
:::

## Architektur

Das Modell hat drei Bausteine: **IPSets** definieren die Quell-Zonen (wer), **Security-Groups**
buendeln erlaubte Dienste je Rolle (was), und die **Firewall-Options** je VM schalten
`input DROP` scharf (Enforcement). Eine VM erhaelt genau die Security-Groups ihrer Rolle;
was keine Regel trifft, faellt in die DROP-Policy.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

zones: Quell-Zonen (IPSets) {
  class: container
  tooltip: "Wer darf zugreifen -- als IPSets modelliert"

  admin: Admin / Operator {
    class: node
    tooltip: "Tailnet-NoSNAT 100.64.0.0/10 + Management-LAN"
  }
  cluster: Cluster-intern {
    class: node
    tooltip: "Nomad-Server + Nomad-Clients"
  }
  traefik: Traefik {
    class: node
    tooltip: "Ingress-VIP und Nodes"
  }
  monitoring: Monitoring {
    class: node
    tooltip: "CheckMK-Agent + Kuma-Watchdogs"
  }
  world: Alle Zonen {
    class: node
    tooltip: "Internet und interne VLANs -- nur HTTP/S und DNS"
  }
}

vms: Stack-VMs hinter input DROP {
  class: container
  tooltip: "Jede VM nimmt nur die Security-Groups ihrer Rolle"

  server: Nomad-Server {
    class: node
    tooltip: "sg-base + sg-consul-member + sg-nomad-server"
  }
  client: Nomad-Clients {
    class: node
    tooltip: "sg-base + sg-consul-member + sg-nomad-client"
  }
  ingress: Traefik-VMs {
    class: node
    tooltip: "sg-base + sg-traefik"
  }
  dns: DNS-LXCs {
    class: node
    tooltip: "sg-base + sg-dns"
  }
}

zones.admin -> vms.server: SSH, Control-Plane-APIs {
  style.stroke: "#2563eb"
}
zones.admin -> vms.client: SSH, Admin-Pfade {
  style.stroke: "#2563eb"
}
zones.admin -> vms.ingress: SSH {
  style.stroke: "#2563eb"
}
zones.admin -> vms.dns: SSH, Pi-hole-UI {
  style.stroke: "#2563eb"
}
zones.cluster -> vms.server: Consul, Nomad, Vault {
  style.stroke: "#16a34a"
}
zones.cluster -> vms.client: Dyn- und Static-Ports {
  style.stroke: "#16a34a"
}
zones.traefik -> vms.client: Backend-Routen {
  style.stroke: "#7c3aed"
}
zones.traefik -> vms.server: Consul-Catalog, Vault {
  style.stroke: "#7c3aed"
}
zones.monitoring -> vms.server: Health-Checks {
  style.stroke: "#6b7280"
}
zones.monitoring -> vms.client: Health-Checks {
  style.stroke: "#6b7280"
}
zones.world -> vms.ingress: HTTP / HTTPS {
  style.stroke: "#dc2626"
}
zones.world -> vms.dns: DNS :53 {
  style.stroke: "#dc2626"
}
```

Detaillierte Zuordnung der Security-Groups und IPSets: [Referenz](./referenz.md).

### Was gefiltert wird -- und was bewusst nicht

- **`input DROP`, `output ACCEPT`:** In Phase 2 wird nur der eingehende Verkehr gefiltert. Der
  ausgehende Verkehr bleibt offen -- ausgehende Einschraenkung ist Sache spaeterer Phasen.
- **Nur `net0` (das VLAN-Interface):** Der Storage-Interconnect `net1` (Bridge `vmbr-tb`,
  10.99.1.0/24) bleibt bewusst **ungefiltert**. Die LINSTOR/DRBD-Replikation zwischen den
  Storage-Nodes laeuft ueber diese Punkt-zu-Punkt-Thunderbolt-Strecke am VM-Filter vorbei.
  Details: [Linstor Storage](../linstor-storage/).
- **Host-INPUT bleibt `ACCEPT`:** Die Firewall der Proxmox-Hosts selbst wird nicht angefasst.
  Corosync, Live-Migration und PBS-Backups laufen auf Host-Ebene weiter, und die pve-API kann
  die VM-Firewall jederzeit wieder abschalten -- der Rueckweg bleibt so immer offen.
- **Cluster-intern grosszuegig, nach aussen dicht:** Static-Job-Ports sind pauschal fuer die
  Cluster-Mitglieder offen (kein Port-Freeze der Job-Platzierung), Zugriff von ausserhalb des
  Clusters ist die eigentliche Schutzleistung.

### Zweistufiges Quellenmodell

Die Quell-Zone "cluster-intern" umfasst Nomad-Server **und** Nomad-Clients gemeinsam
(`ip-cluster`), waehrend feinere IPSets (`ip-nomad-servers`, `ip-nomad-clients`,
`ip-storage-nodes`) einzelne Rollen adressieren. So bleiben rollenspezifische Regeln (etcd und
Vault-Cluster-Port nur unter Servern, DRBD nur unter Storage-Nodes) eng, waehrend die breiten
Control-Plane-Pfade den ganzen Cluster abdecken. Alle IPSets sind aus einzelnen IP-Bausteinen
komponiert; die SSOT der Adressen ist das Ansible-Inventar, im Terraform als Variablen
gespiegelt.

## Terraform-Modul

Der gesamte Firewall-Code liegt in `homelab-hashicorp-stack/terraform/proxmox-firewall/`:

- `ipsets.tf` -- die Quell-Zonen als cluster-weite IPSets
- `security-groups.tf` -- die Security-Groups mit ihren erlaubten Diensten
- `server-wave.tf`, `client-wave.tf`, `traefik-wave.tf`, `dns-wave.tf` -- Attachment und
  `input DROP` je Systemgruppe (eine Datei pro Ausroll-Welle)
- `pilot-dcm.tf`, `pilot-client04.tf` -- die beiden Pilot-Systeme
- `variables.tf` -- die IP-Bausteine (SSOT-Spiegel aus dem Ansible-Inventar)

Das Modul hat einen **eigenen State-Scope**, getrennt vom VM-Modul (`proxmox-vms`), damit die
Firewall-Ressourcen den VM-State nie beruehren. Alle Regeln werden ausschliesslich ueber
Terraform gepflegt -- manuelle Firewall-Edits im Proxmox-UI erzeugen Drift und sind nicht erlaubt.

::: warning Node-Zuordnung driftet bei VM-Migration
Die Firewall-Ressourcen sind im Terraform an den Proxmox-Node gebunden, auf dem die VM liegt.
Wandert eine VM per Live-Migration auf einen anderen Node, wirken die Regeln zwar weiter, aber
der Terraform-Plan zeigt Drift. Nach einer Migration die Node-Zuordnung im Code nachziehen.
:::

## Verwandte Seiten

- [Referenz](./referenz.md) -- Security-Groups, IPSets und die Zuordnung zu den Systemen
- [Betrieb](./betrieb.md) -- Drop-Log-Triage, Ausroll-Wellen, Lockout-Vermeidung
- [Netzwerk](../netzwerk/index.md) -- VLAN-Segmente und Topologie am Hauptstandort
- [Proxmox](../proxmox/index.md) -- Cluster, VMs und Plattform
- [Sicherheit & Authentifizierung](../security/index.md) -- Auth-Schicht ueber Traefik
- [UniFi](../unifi/referenz.md#firewall) -- Perimeter-Firewall (VLAN-Zonen) am Netzrand, zur Abgrenzung
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige VM- und IP-Zuordnung
