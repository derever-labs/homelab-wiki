---
title: Plattform
description: Oberkapitel für die Cluster-Grundversorgung -- Nomad als Orchestrierer, Consul für Service Discovery, Vault für Secrets und die Zot Container Registry
tags:
  - overview
  - nomad
  - infrastructure
---

<!-- Übergangs-Stub, wird durch Big-Picture-Seite ersetzt, ClickUp 86carpf04 -->

# Plattform

Dieses Kapitel bündelt die Grundversorgung des Clusters: Nomad orchestriert alle Jobs, Consul liefert Service Discovery und Health Checks, Vault verwaltet die Secrets. Die Zot Registry versorgt die Nomad-Clients mit Container-Images.

## Systeme

- [Nomad](./nomad/) -- Container- und Job-Orchestrierung
- [Consul](./consul/) -- Service Discovery und Health Checks
- [Vault](./vault/) -- Zentrale Secrets-Verwaltung
- [Zot Container Registry](./docker-registry/) -- OCI Registry, Pull-Through Cache
