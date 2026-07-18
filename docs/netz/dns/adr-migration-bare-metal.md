---
title: ADR DNS-Migration Bare-Metal
description: Migrations-Chronologie der DNS-Infrastruktur von dnsmasq über Pi-hole zu Bare-Metal-LXC
tags:
  - adr
  - platform
  - dns
  - networking
---

# ADR DNS-Migration Bare-Metal

Diese Seite hält die Migrations-Chronologie der DNS-Infrastruktur fest -- von dnsmasq über Pi-hole zur heutigen Bare-Metal-LXC-Lösung. Der aktuelle Ist-Zustand ist in der [DNS-Architektur](./index.md) dokumentiert; diese Seite beschreibt ausschliesslich den Weg dorthin.

## Chronologie

### ~2025

Initialer Stack: dnsmasq -> Pi-hole -> Unbound auf Docker (vm-proxy-dns-01/vm-vpn-dns-01)

### 22.02.2026

10.0.2.1: dnsmasq entfernt, Pi-hole v6 direkt auf Port 53

### 02.04.2026

Kompletter Neuaufbau: 2x LXC (bare-metal Pi-hole v6 + Unbound), Nebula-Sync, IaC-verwaltet

## Verwandte Seiten

- [DNS-Architektur](./index.md) -- Aktueller Ist-Zustand der DNS-Kette
