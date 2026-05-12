#!/usr/bin/env node
// Generiert docs/authentik/.generated/zugriffsmatrix.md aus der Authentik-API.
// Listet welche Applications welchen Gruppen offenstehen und vergleicht mit der
// Traefik-Router-API um Cluster-Apps ohne SSO-Middleware zu identifizieren.
//
// ENV (alle Pflicht ausser markierten):
//   AUTHENTIK_URL    Basis-URL ohne Trailing-Slash, z.B. https://auth.intra.dclab.ch
//   AUTHENTIK_TOKEN  API-Token (Bearer)
//   TRAEFIK_URL      optional, z.B. http://traefik.service.consul:8080
//   SSO_MIDDLEWARES  optional, Komma-Liste von Middleware-Namen die als SSO zaehlen
//   OUT_FILE         optional, Default docs/authentik/.generated/zugriffsmatrix.md

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const env = process.env;
const url = (env.AUTHENTIK_URL ?? '').replace(/\/+$/, '');
const token = env.AUTHENTIK_TOKEN ?? '';
const traefikUrl = (env.TRAEFIK_URL ?? '').replace(/\/+$/, '');
const outFile = resolve(env.OUT_FILE ?? 'docs/authentik/.generated/zugriffsmatrix.md');
const ssoMiddlewares = (env.SSO_MIDDLEWARES ??
  'public-auth@file,intern-auth@file,authentik-forward-auth@docker,authentik-forward-auth@file,auth-outpost@docker,auth-outpost@file,authentik@file,authentik@docker'
).split(',').map(s => s.trim()).filter(Boolean);

if (!url || !token) {
  console.error('FEHLER: AUTHENTIK_URL und AUTHENTIK_TOKEN sind erforderlich');
  process.exit(2);
}

async function fetchJson(target, init = {}) {
  const res = await fetch(target, {
    ...init,
    headers: { Accept: 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${target} -> HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

async function fetchAllAuthentik(path) {
  const out = [];
  let page = 1;
  for (;;) {
    const u = new URL(`${url}${path}`);
    u.searchParams.set('page_size', '200');
    u.searchParams.set('page', String(page));
    // Authentik filtert /applications/ standardmaessig auf "launchable for me".
    // Mit superuser_full_list bekommen Superuser-Tokens die komplette Liste.
    if (path.includes('/applications/')) u.searchParams.set('superuser_full_list', 'true');
    const data = await fetchJson(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.push(...(data.results ?? []));
    const p = data.pagination;
    if (!p || p.next === 0 || p.next <= p.current) break;
    page = p.next;
  }
  return out;
}

function escapeMd(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function bindingTarget(b) {
  if (b.group_obj) return { kind: 'group', label: b.group_obj.name, pk: b.group_obj.pk };
  if (b.user_obj) return { kind: 'user', label: `User: ${b.user_obj.username}`, pk: b.user_obj.pk };
  if (b.policy_obj) return { kind: 'policy', label: `Policy: ${b.policy_obj.name}`, pk: b.policy_obj.pk };
  return { kind: 'unknown', label: '?' };
}

function hostsFromRule(rule) {
  if (!rule) return [];
  return [...rule.matchAll(/Host\(`([^`]+)`\)/g)].map(m => m[1]);
}

console.log(`[gen-authentik] Authentik=${url}, Traefik=${traefikUrl || '(keine)'}`);

const [apps, groups, bindings, allPolicies] = await Promise.all([
  fetchAllAuthentik('/api/v3/core/applications/'),
  fetchAllAuthentik('/api/v3/core/groups/'),
  fetchAllAuthentik('/api/v3/policies/bindings/?target_in_models=authentik_core.application'),
  fetchAllAuthentik('/api/v3/policies/all/'),
]);

// Authentik's `target_in_models=authentik_core.application` Filter ist nicht strikt --
// es kommen auch Flow/Stage-Bindings mit raus. Wir filtern client-seitig auf bekannte App-UUIDs.
const appPks = new Set(apps.map(a => a.pk));
const appBindings = bindings.filter(b => appPks.has(b.target));

console.log(`[gen-authentik] ${apps.length} Apps, ${groups.length} Gruppen, ${appBindings.length}/${bindings.length} Bindings (auf Apps), ${allPolicies.length} Policies`);

const policyByPk = new Map(allPolicies.map(p => [p.pk, p]));

let traefikRouters = [];
let traefikError = null;
if (traefikUrl) {
  try {
    traefikRouters = await fetchJson(`${traefikUrl}/api/http/routers`);
    console.log(`[gen-authentik] ${traefikRouters.length} Traefik-Router`);
  } catch (e) {
    traefikError = e.message;
    console.warn(`[gen-authentik] Traefik unreachable: ${e.message}`);
  }
}

apps.sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
groups.sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));

const bindingsByApp = new Map();
for (const b of appBindings) {
  if (!b.enabled) continue;
  const arr = bindingsByApp.get(b.target) ?? [];
  arr.push(b);
  bindingsByApp.set(b.target, arr);
}

const appsByGroup = new Map();
for (const b of appBindings) {
  if (!b.enabled || !b.group_obj) continue;
  const app = apps.find(a => a.pk === b.target);
  if (!app) continue;
  const arr = appsByGroup.get(b.group_obj.pk) ?? [];
  arr.push(app.name);
  appsByGroup.set(b.group_obj.pk, arr);
}

const lines = [];
lines.push('<!-- AUTO-GENERIERT durch scripts/gen-authentik-zugriffsmatrix.mjs -- nicht haendisch editieren -->');
lines.push('');
lines.push('## App -> Gruppen');
lines.push('');
lines.push('Welche Authentik-Gruppen koennen welche Application starten. Apps ohne Eintrag sind fuer **alle authentifizierten User** offen.');
lines.push('');
lines.push('| Application | Zugriff durch | Engine-Mode |');
lines.push('| :--- | :--- | :---: |');
for (const app of apps) {
  const bs = bindingsByApp.get(app.pk) ?? [];
  const access = bs.length === 0
    ? '_alle authentifizierten User_'
    : bs.map(b => bindingTarget(b).label).join(', ');
  lines.push(`| ${escapeMd(app.name)} | ${escapeMd(access)} | \`${app.policy_engine_mode}\` |`);
}

lines.push('');
lines.push('## Gruppe -> Apps');
lines.push('');
lines.push('Umgekehrte Sicht: pro Authentik-Gruppe alle Applications mit direktem Group-Binding (Policy- oder User-Bindings werden hier nicht aufgeloest).');
lines.push('');
lines.push('| Gruppe | Applications |');
lines.push('| :--- | :--- |');
for (const g of groups) {
  const list = (appsByGroup.get(g.pk) ?? []).slice().sort((a, b) => a.localeCompare(b, 'de-CH'));
  const flag = g.is_superuser ? ' _(Superuser)_' : '';
  lines.push(`| ${escapeMd(g.name)}${flag} | ${list.length ? list.map(escapeMd).join(', ') : '_(keine)_'} |`);
}

lines.push('');
// Policy-Details: alle Policies die in App-Bindings vorkommen, mit ihrer Bedingung
const referencedPolicyPks = new Set(appBindings.filter(b => b.enabled && b.policy_obj).map(b => b.policy_obj.pk));
if (referencedPolicyPks.size > 0) {
  lines.push('');
  lines.push('## Policy-Details');
  lines.push('');
  lines.push('Bedingungen der Policies, die in den App-Bindings oben referenziert werden.');
  lines.push('');
  const referenced = [...referencedPolicyPks].map(pk => policyByPk.get(pk)).filter(Boolean);
  referenced.sort((a, b) => a.name.localeCompare(b.name, 'de-CH'));
  for (const p of referenced) {
    lines.push(`### ${p.name}`);
    lines.push('');
    lines.push(`**Typ:** \`${p.meta_model_name ?? '?'}\``);
    if (p.expression) {
      lines.push('');
      lines.push('```python');
      lines.push(p.expression.trim());
      lines.push('```');
    } else if (p.group_name) {
      lines.push('');
      lines.push(`**Gruppe:** \`${p.group_name}\``);
    }
    lines.push('');
  }
}

lines.push('## Cluster-Apps ohne SSO-Schutz');
lines.push('');
if (!traefikUrl) {
  lines.push('_Traefik-URL nicht konfiguriert -- Gap-Analyse uebersprungen._');
} else if (traefikError) {
  lines.push(`::: warning Traefik unerreichbar`);
  lines.push(`Gap-Analyse uebersprungen: \`${traefikError}\``);
  lines.push(`:::`);
} else {
  const authentikHosts = new Set();
  for (const a of apps) {
    if (!a.launch_url) continue;
    try { authentikHosts.add(new URL(a.launch_url).host); } catch { /* ignore */ }
  }
  // Authentik selbst (Login-UI) ist nie eine "App" in Authentik -- aus Gap-Liste ausnehmen
  try { authentikHosts.add(new URL(url).host); } catch { /* ignore */ }

  // Router pro Host gruppieren: wenn IRGENDEIN Router fuer den Host SSO hat, gilt der Host als geschuetzt
  const hostsWithSso = new Set();
  for (const r of traefikRouters) {
    const mws = Array.isArray(r.middlewares) ? r.middlewares : [];
    if (!mws.some(m => ssoMiddlewares.includes(m))) continue;
    for (const h of hostsFromRule(r.rule)) hostsWithSso.add(h);
  }

  const gaps = new Map(); // host -> {service, middlewares}
  for (const r of traefikRouters) {
    if (r.provider === 'internal') continue;
    if (r.status !== 'enabled') continue;
    if (r.service === 'api@internal') continue;
    const hosts = hostsFromRule(r.rule);
    if (hosts.length === 0) continue;
    const mws = Array.isArray(r.middlewares) ? r.middlewares : [];
    for (const h of hosts) {
      if (hostsWithSso.has(h)) continue;
      if (authentikHosts.has(h)) continue;
      if (gaps.has(h)) continue;
      gaps.set(h, { service: r.service, middlewares: mws });
    }
  }
  const gapList = [...gaps.entries()].map(([host, v]) => ({ host, ...v }));

  if (gapList.length === 0) {
    lines.push('_Keine Apps ohne SSO-Schutz gefunden -- alle Traefik-Router sind entweder durch eine SSO-Middleware geschuetzt oder in Authentik registriert (native OIDC)._');
  } else {
    lines.push('Hosts mit Web-UI, bei denen kein einziger Router eine SSO-Middleware traegt und die nicht via OIDC in Authentik registriert sind. Kandidaten fuer eine SSO-Anbindung.');
    lines.push('');
    lines.push('| Host | Traefik-Service | Middlewares |');
    lines.push('| :--- | :--- | :--- |');
    gapList.sort((a, b) => a.host.localeCompare(b.host));
    for (const g of gapList) {
      lines.push(`| ${escapeMd(g.host)} | \`${escapeMd(g.service)}\` | ${g.middlewares.length ? g.middlewares.map(m => '`' + escapeMd(m) + '`').join(', ') : '_(keine)_'} |`);
    }
  }
}

const fmt = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Zurich' });
const sha = (env.GITHUB_SHA ?? '').slice(0, 8);
lines.push('');
lines.push('---');
lines.push('');
lines.push(`_Generiert am ${fmt.format(new Date())}${sha ? ` aus Commit \`${sha}\`` : ''}._`);
lines.push(`_${apps.length} Applications · ${groups.length} Gruppen · ${appBindings.length} App-Bindings · ${traefikRouters.length} Traefik-Router._`);

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, lines.join('\n') + '\n');
console.log(`[gen-authentik] Wrote ${outFile}`);
