---
title: Infrastruktur
description: Big Picture der physischen und virtuellen Grundlage -- drei Proxmox-Hosts, die Schichten vom Blech zum Nomad-Cluster und der Verwaltungsweg über Terraform und Ansible
tags:
  - overview
  - infrastructure
  - proxmox
  - virtualisierung
---

# Infrastruktur

Dieses Kapitel bündelt die physische und virtuelle Grundlage des Homelabs: Drei Proxmox-Hosts virtualisieren sämtliche VMs und LXCs, Terraform provisioniert die Cluster-VMs, Ansible konfiguriert ihr Innenleben. Diese Seite ist das Big Picture: zwei Szenario-Diagramme zeigen, welche VM auf welchem Blech läuft und auf welchem Weg eine VM entsteht und sich ändert; das [Ausfallverhalten](#ausfallverhalten) beantwortet, was beim Verlust eines Hosts passiert. Die Details bleiben auf den Systemseiten.

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| Deployment | Proxmox VE bare-metal auf drei Hosts; Cluster-VMs und -LXCs via Terraform und Ansible (Repo `homelab-hashicorp-stack`) |
| Monitoring | CheckMK Special-Agent `proxmox_ve`, nativer Metrik-Export nach InfluxDB, PBS-Heartbeat an Uptime Kuma ([Monitoring Stack](../monitoring/)) |
| Hosts/IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Systeme

| System | Zweck | Vertiefung |
| :--- | :--- | :--- |
| **[Proxmox](./proxmox/)** | Drei-Knoten-Cluster lenzburg plus zwei externe Standalone-Nodes | [Referenz](./proxmox/referenz.md), [Betrieb](./proxmox/betrieb.md) |

Die physischen Specs der Hosts führt das [Hardware-Inventar](../_referenz/hardware-inventar.md), alle Adressen und VM-Zuordnungen die [Hosts und IPs](../_referenz/hosts-und-ips.md) -- beide sind SSOT und werden hier nicht dupliziert.

## Das Gesamtbild in zwei Sichten

Die beiden Sichten beantworten die Kernfragen des Kapitels: Die **Schichten-Sicht** zeigt, wie aus drei physischen Rechnern der virtualisierte Unterbau des Nomad-Clusters wird, der **Verwaltungsweg** zeigt, wie eine VM entsteht und wie eine Änderung an ihren Parametern läuft.

Lese-Konvention: Die Schichten-Sicht ist eine Struktur-Übersicht (Verschachtelung heisst "läuft auf", ihre einzige Kante ist die richtungslose Thunderbolt-Direktverbindung). Im Verwaltungsweg zeigt der Pfeil vom **Initiator** zum Ziel, das Label nennt Schritt und Inhalt. **Durchgezogene** Kanten sind synchrone Aufrufe (der Initiator wartet auf die Antwort), **gestrichelte** Kanten laufen asynchron oder dauerhaft im Hintergrund. Die Farben kodieren den Weg: Blau für die Provisionierung (Terraform an die Proxmox-API), Violett für die Konfiguration (Ansible in die VM), Grau für Betriebs- und Workload-Wege.

### Schichten-Sicht -- vom Blech zum Nomad-Cluster

**Leitfrage:** Welche VM läuft auf welchem Host -- und wie wird aus drei physischen Rechnern ein ausfalltoleranter Unterbau?

```d2
classes: {
  vm: { style: { border-radius: 8 } }
  lxc: { style: { border-radius: 8; stroke-dash: 2 } }
  host: { style: { border-radius: 8; stroke-dash: 4 } }
  betrieb: { style: { stroke: "#6b7280" } }
}

cluster: Proxmox VE Cluster lenzburg {
  class: host
  label.near: top-center
  tooltip: Corosync-Quorum 2 von 3 -- HA shutdown_policy conditional

  pve00: pve00 (Quorum-Host) {
    class: host
    grid-columns: 1
    tooltip: Minisforum DeskMini N100 -- kleinster Node, primär Quorum-Geber
    top: 100
    left: 0
    s04: nomad-server-04 { class: vm }
    c04: nomad-client-04 {
      class: vm
      tooltip: leichtester Client -- zugleich diskloser DRBD-Witness
    }
  }

  pve01: pve01 (Compute) {
    class: host
    grid-columns: 1
    tooltip: Minisforum MS-01 -- iGPU per Full Passthrough an nomad-client-05
    top: 100
    left: 400
    s05: nomad-server-05 { class: vm }
    c05: nomad-client-05 {
      class: vm
      tooltip: Storage-Node -- DRBD-Replica, iGPU-Passthrough für QSV-Transcoding
    }
    tr1: traefik-01 { class: vm }
    dns1: lxc-dns-01 { class: lxc }
    pdm: datacenter-manager (PDM) { class: vm }
  }

  pve02: pve02 (Compute) {
    class: host
    grid-columns: 1
    tooltip: Minisforum MS-01 -- iGPU per Full Passthrough an nomad-client-06
    top: 100
    left: 1000
    s06: nomad-server-06 { class: vm }
    c06: nomad-client-06 {
      class: vm
      tooltip: Storage-Node -- DRBD-Replica, iGPU-Passthrough für QSV-Transcoding
    }
    tr2: traefik-02 { class: vm }
    dns2: lxc-dns-02 { class: lxc }
    mgmt: Verwaltungs-VMs {
      class: vm
      tooltip: CheckMK, PBS und Home Assistant -- vollständige Liste in Hosts und IPs
    }
  }

  pve01 <-> pve02: Thunderbolt-Bond -- Migration und DRBD-Spiegelung { class: betrieb }
}
```

Lesehilfe:

1. Die drei Hosts bilden den [Proxmox-Cluster](./proxmox/) lenzburg -- Corosync braucht 2 von 3 Nodes für das Quorum, beim geplanten Herunterfahren migriert der HA-Manager die VMs vorab weg ([HA Konfiguration](./proxmox/index.md#ha-konfiguration)).
2. pve00 ist bewusst der kleinste Host: Er gibt dem Cluster das Quorum und trägt nur die leichtesten Nomad-VMs; nomad-client-04 ist zugleich der disklose Witness des DRBD-Quorums ([Linstor & DRBD](../storage/linstor/index.md#architektur)).
3. Jede redundante Ebene läuft genau einmal pro Host: drei Nomad-Server als Raft-Verbund ([Nomad](../plattform/nomad/)), das Traefik-Paar mit VRRP-VIP ([Traefik](../edge/traefik/)) und das Pi-hole-Paar ([DNS-Architektur](../netz/dns/)) sind auf pve01 und pve02 verteilt -- der Ausfall eines Hosts trifft nie beide Hälften.
4. Der Thunderbolt-Bond zwischen pve01 und pve02 trägt die VM-Livemigration und die synchrone DRBD-Spiegelung zwischen nomad-client-05 und -06 ([Thunderbolt Netzwerk](./proxmox/index.md#thunderbolt-netzwerk), [Storage und Backup](../storage/)).
5. Die iGPU jedes Compute-Hosts ist per Full Passthrough exklusiv an seinen Nomad-Client durchgereicht -- Hardware-Transcoding für Jellyfin ([iGPU Passthrough](./proxmox/referenz.md#igpu-passthrough)).
6. Auf den sechs nomad-VMs setzt die Plattform-Ebene auf: Nomad, Consul und Vault als Systemd-Dienste, darüber alle Container-Workloads ([Plattform](../plattform/)).

::: info Externe Standorte
Neben dem Lenzburg-Cluster laufen zwei Standalone-Nodes in Dottikon und Luzern -- kein Cluster-Mitglied, via Tailscale eingebunden. Ihre Verwaltungs- und Backup-Sicht (PDM, PBS) zeigt die [Standort-Topologie](./proxmox/index.md#standort-topologie) auf der Proxmox-Seite, den Betrieb der [Abschnitt Externe Standalone-Nodes](./proxmox/betrieb.md#externe-standalone-nodes).
:::

### Verwaltungsweg -- wie eine VM entsteht und sich ändert

**Leitfrage:** Wie entsteht eine Cluster-VM, wie läuft eine Änderung an CPU, RAM oder Disk -- und warum nie über die Proxmox-UI?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  repo: { style: { border-radius: 8; stroke-dash: 2 } }
  tfweg: { style: { stroke: "#2563eb" } }
  ansibleweg: { style: { stroke: "#7c3aed" } }
  workload: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

repo: Repo homelab-hashicorp-stack {
  class: repo
  tooltip: terraform/proxmox-vms und ansible/ -- der Code ist der Soll-Zustand
  top: 0
  left: 0
}
admin: Admin-Arbeitsplatz {
  class: node
  tooltip: terraform apply und ansible-playbook laufen manuell -- kein CI-Deploy auf dieser Ebene
  top: 0
  left: 450
}
pveapi: Proxmox-API {
  class: node
  top: 0
  left: 900
}
vm: Cluster-VM oder LXC {
  class: node
  tooltip: VMs als Clone des Ubuntu-Cloud-Init-Templates, LXCs aus dem Ubuntu-Container-Template
  top: 300
  left: 900
}
plattform: Nomad-Scheduler {
  class: node
  top: 300
  left: 450
}

admin -> repo: 1. ändert die Definition (Terraform-Code) { class: tfweg }
admin -> pveapi: 2. terraform apply gleicht Soll und Ist ab (HTTPS) { class: tfweg }
pveapi -> vm: 3. erstellt oder ändert die VM (Clone + cloud-init) { class: tfweg }
admin -> vm: 4. Ansible-Rollen konfigurieren OS und Dienste (SSH) { class: ansibleweg }
plattform -> vm: 5. platziert Container-Workloads (RPC) { class: workload }
```

Lesehilfe:

1. Der Soll-Zustand der Cluster-VMs und -LXCs liegt als Terraform-Code im Repo `homelab-hashicorp-stack` unter `terraform/proxmox-vms/` -- Nomad-Server und -Clients, das Traefik-Paar und die DNS-LXCs; der Edge-Client am Aussenstandort entsteht analog aus `terraform/proxmox-edge/` ([Nomad Aussenstandort](../plattform/nomad/aussenstandort.md)).
2. `terraform apply` läuft manuell vom Admin-Arbeitsplatz gegen die Proxmox-API -- auf dieser Ebene gibt es bewusst kein CI, im Gegensatz zum Workload-Deploy der [Plattform](../plattform/). Der Terraform-State liegt lokal auf dem Admin-Arbeitsplatz (gitignored) -- ein Remote-Backend gibt es nicht.
3. Proxmox erstellt neue VMs als Clone des Ubuntu-Cloud-Init-Templates und passt bestehende an. Die Verwaltungs-VMs (CheckMK, PBS, PDM, Home Assistant) sind nicht Terraform-verwaltet, sondern manuell angelegt.
4. Das Innenleben der VMs konfigurieren die Ansible-Rollen im selben Repo -- unter anderem Nomad, Consul, Vault, Docker, Alloy und die NFS-Mounts. Terraform stellt das Blech der VM, Ansible macht daraus einen Cluster-Node.
5. Ab hier übernimmt die Plattform: Nomad platziert die Container-Workloads auf den fertigen Clients -- der komplette Weg vom Job-File zum erreichbaren Service steht im [Deploy-Fluss](../plattform/index.md#deploy-fluss-vom-job-file-zum-erreichbaren-service).

::: warning Drift-Verbot bei VM-Parametern
VM-Parameter der Cluster-VMs (CPU, RAM, Disks, Netz) sind Terraform-verwaltet. Änderungen laufen über den Terraform-Code, nie ad-hoc über `qm` oder die Proxmox-UI -- sonst weicht der Ist-Zustand vom Code ab und der nächste Apply rollt die Handänderung zurück. Notfall-Änderungen werden sofort im Code nachgezogen, bis `terraform plan` wieder sauber ist.
:::

## Ausfallverhalten

**Leitfrage:** Was passiert bei Ausfall von X -- und was läuft dann noch?

- **Was, wenn pve01 oder pve02 ausfällt?** Der Cluster behält das Corosync-Quorum (2 von 3). Die host-verteilten Paare überbrücken: Die Traefik-VIP wechselt per VRRP auf den überlebenden Node, der zweite Pi-hole beantwortet DNS weiter, Nomad behält 2 von 3 Servern, und DRBD läuft mit einer Replica plus Witness weiter -- degradiert, aber verfügbar ([Storage und Backup -- Ausfallverhalten](../storage/index.md#ausfallverhalten)). Für die HA-verwalteten VMs (homeassistant, checkmk, pbs-backup-server) greift zusätzlich der Proxmox-HA-Manager: Bei einem ungeplanten Ausfall isoliert der Cluster den verlorenen Node per Fencing (CRM-Watchdog) und startet diese Ressourcen auf einem verbleibenden Node neu. Beim geplanten Herunterfahren verschiebt `shutdown_policy=conditional` sie stattdessen vorab über das Thunderbolt-Netz ([HA Konfiguration](./proxmox/index.md#ha-konfiguration)).

- **Was, wenn pve00 ausfällt?** Der kleinste anzunehmende Verlust: Corosync- und Nomad-Quorum halten (je 2 von 3), das DRBD-Quorum ebenso -- der Witness fehlt, aber beide Daten-Replicas auf pve01/pve02 leben. Verloren sind nur die leichtesten Cluster-VMs, bis der Host zurück ist.

- **Was, wenn ein zweiter Node ausfällt?** Der Cluster verliert das Quorum und blockiert alle Schreiboperationen -- laufende VMs laufen weiter, können aber weder migriert noch neu gestartet werden ([Proxmox Betrieb](./proxmox/betrieb.md)). Die Wiederanlauf-Reihenfolge nach einem Komplett-Ausfall steht im Runbook [Cluster-Neustart](../_querschnitt/cluster-restart.md).

- **Was braucht ein VM-Boot von aussen?** Die Nomad-Client-VMs mounten NFS ohne `nofail`: Ist das NAS beim Boot nicht erreichbar, fällt die VM in den Emergency Mode ([Proxmox Betrieb -- Bekannte Einschränkungen](./proxmox/betrieb.md#bekannte-einschrankungen)).

## Verwandte Seiten

- [Proxmox](./proxmox/) -- Cluster, Thunderbolt-Netz, HA-Konfiguration und Standort-Topologie
- [Proxmox Referenz](./proxmox/referenz.md) -- iGPU-Passthrough, VM-Disk-/ZFS-Tuning, SSO und PDM
- [Proxmox Betrieb](./proxmox/betrieb.md) -- Abhängigkeiten, Automatisierung, externe Standalone-Nodes
- [Hardware-Inventar](../_referenz/hardware-inventar.md) -- Physische Specs der Hosts und NAS
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Kanonische Adress- und VM-Zuordnung
- [Plattform](../plattform/) -- Nomad, Consul, Vault und Registry auf den Cluster-VMs
- [Storage und Backup](../storage/) -- Linstor/DRBD, NAS und Backup-Kette
- [Netzwerk](../netz/netzwerk/) -- VLANs, Standorte und Tailscale-Overlay
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Startreihenfolge nach Komplett-Ausfall
