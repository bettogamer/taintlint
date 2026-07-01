# Spike S1–S4 — Resultados (2026-07-01)

Referencia del plan: `Workspace/ideas/secretlint/FOUNDING.md` §11 "Plan del spike".
Entorno: Node v24.18.0 portable (`Workspace/.tools/node`), luaparse 0.3.1.

## Veredicto general: la arquitectura queda VALIDADA. Adelante con v0.1.

| # | Pregunta | Resultado |
|---|----------|-----------|
| S1 | ¿luaparse parsea Lua real de addons? | ✅ **PASA** — 581 archivos (MRT 50, Beacon 264, WeakAuras 267), 0 fallos, ~2.7 s total |
| S2 | ¿`Blizzard_APIDocumentationGenerated` es extraíble? | ✅ **PASA** — 3,589 funciones + 91 eventos con flags de secrets; 0 fallos de parseo |
| S3 | ¿Las reglas L0 encuentran algo real? | ✅ **PASA con lecciones** — 1 positivo verdadero en WA; el benchmark MRT expone el diseño de tiers necesario (abajo) |
| S4 | ¿CF/WoWInterface renderizan badges? | ⏳ **PENDIENTE — requiere cuenta del usuario** (pegar una imagen shields.io en una descripción de prueba) |

## S1 — detalle

- Modo `luaVersion: '5.1'` de luaparse tiene un gap: no acepta el `;` opcional tras `break`
  (`break;`), que el Lua 5.1 real (y WoW) sí permite. 15 archivos de WA/Beacon fallaban por esto.
- Modo `'5.2'` acepta `break;` pero rechaza escapes desconocidos en strings (`"\|"` en las
  localizaciones de MRT), que 5.1 trata como literales.
- **Solución adoptada**: modo 5.1 + shim de preproceso que borra el `;` de `break;`
  reemplazándolo por espacio (misma longitud ⇒ las posiciones de los findings no se corrompen).
- **TODO**: PR upstream a luaparse con el fix del laststat opcional-`;` (o vendorear el parser).

## S2 — detalle

- Fuente: `Gethe/wow-ui-source` rama `live` = **12.0.7 (68275)**, commit `dc16328` (el cliente
  instalado no sirve: los addons de Blizzard van empaquetados en CASC, no como archivos sueltos).
  Clone sparse de solo `Interface/AddOns/Blizzard_APIDocumentationGenerated` (592 archivos).
- El extractor parsea la documentación **con luaparse** (dogfooding) y emite
  `apidb-12.0.7-68275.json`.
- Números: 3,589 funciones con algún flag de secrets; 18 con `SecretReturns = true`
  (incondicional — incluye `UnitHealth`); 156 con secrets condicionales; 91 eventos con
  `SecretPayloads` (¡los handlers de eventos también son linteables — no estaba previsto!).
- Vocabulario real de flags (28): `SecretReturns`, `ReturnsNeverSecret`, `SecretArguments`,
  `ConditionalSecret`, y toda la familia `SecretWhen*` (`UnitIdentityRestricted`,
  `UnitPowerRestricted`, `UnitHealthMaxRestricted`, `CooldownsRestricted`, `InCombat`,
  `EncounterEvent`, `AnchoringSecret`…) + `SecretIn*` (`ActivePvPMatch`,
  `ChatMessagingLockdown`). Mucho más rico que lo que documenta la wiki.
- Spot-checks correctos: `UnitHealth` → `SecretReturns`; `UnitHealthMax` →
  `SecretWhenUnitHealthMaxRestricted`; `UnitGUID`/`UnitName` → `SecretWhenUnitIdentityRestricted`.

## S3 — detalle y LECCIONES DE DISEÑO (lo más valioso del spike)

Prototipo de SV001 (aritmética sobre llamada secretable) + SV005 (llamada secretable como key
de tabla), corrido sobre WeakAuras 5.21.1 (sin portar) y MRT (portado, benchmark 0-FP).

**Modo completo** (incondicionales + condicionales, 211 APIs en el matcher):
- WA: 1 finding — `GenericTrigger.lua:2961` `UnitPartialPower("player", …) / 1000` →
  **positivo verdadero** (poder del jugador en path tainted = secret en 12.0).
- MRT: 11 findings — 1 verdadero-por-semántica (`UnitHealth(unitID)/…` en un path de la era
  Classic: fix de Reencarnación) y **8-10 falsos positivos**: `t[UnitName(unitID)]` sobre
  miembros del grupo — `SecretWhenUnitIdentityRestricted` NO aplica a unidades jugador.

**Modo estricto** (solo `SecretReturns` incondicional, 18 APIs):
- WA: 0 findings (se pierde el caso verdadero, que era condicional).
- MRT: 1 finding (el path Classic).

**Lecciones → requisitos de v0.1:**
1. **Dos tiers de confianza** confirmados empíricamente: incondicional (`SecretReturns`) =
   `error`; condicional (`SecretWhen*`) = tier inferior, y NO como hazard plano.
2. Los condicionales necesitan **modelado por predicado + heurística de unit token**: p. ej.
   `UnitIdentityRestricted` no aplica a `"player"`/`"partyN"`/`"raidN"` literales → seguro.
   Sin esto, el benchmark 0-FP en MRT es imposible.
3. **L0 sub-detecta en código bien factorizado**: WA localiza las APIs y opera sobre locals
   (`local health = UnitHealth(u); … health / max`), invisible para L0. El grueso del valor
   está en **L1 (data-flow intra-función)**, como preveía el FOUNDING §7.
4. El finding "verdadero pero en path muerto en retail" (MRT/Classic) confirma la necesidad de
   **supresiones inline** y sugiere considerar gates de versión (`ExRT.isClassic`) a futuro.
5. Bonus S2: eventos con `SecretPayloads` → regla futura para handlers de eventos registrados.

## Decisiones/artefactos que salen del spike

- `taintlint` **libre en npm** (404 en registry) — verificado 2026-07-01.
- Repo: `Workspace/taintlint` (git init, identidad Betto, MIT, package.json con luaparse).
- Scripts: `spike/s1-parse-corpus.mjs`, `spike/s2-extract-apidb.mjs`, `spike/s3-proto-rules.mjs`
  (este último acepta `STRICT=1`).
- DB generada: `spike/.cache/apidb-12.0.7-68275.json` (el `.cache/` no se versiona).
- Node portable en `Workspace/.tools/node` (v24.18.0). Para desarrollo serio: instalar Node
  como prefiera el usuario (`winget install OpenJS.NodeJS.LTS`).

## Próximos pasos (v0.1)

1. S4 (badge en CurseForge/WoWInterface) — manual, usuario.
2. Fixtures por regla (contrato, antes que el código de cada regla) — FOUNDING §11.
3. Núcleo v0.1: walker con scope tracking (base de L1), las 12 reglas L0, tiers, baseline,
   `--format json`, exit codes.
4. PR upstream a luaparse (`break;`) o decisión de vendorear.
