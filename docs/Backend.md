# Dreamcore Backend — Especificación Completa (tablas, validaciones y reglas)

Este documento define **qué debe cubrir el backend** de Dreamcore de punta a punta, tomando como base lo ya existente en el proyecto (`Run`, `Leaderboard`, `Player` + data game-driven en `database/*.txt`) y extendiéndolo a una versión robusta para producción.

---

## 1) Objetivo del backend

El backend debe resolver 4 responsabilidades principales:

1. **Persistencia de runs y ranking** (score, leaderboard, anti-cheat básico).
2. **Identidad y perfil de jugador** (estado de cuenta, nivel, baneos, trazabilidad).
3. **Publicación de contenido versionado** (cards, relics, events) para evitar des-sync entre cliente y servidor.
4. **Telemetría operativa** (errores, métricas, auditoría y salud del sistema).

---

## 2) Modelo de datos recomendado

> Nota: se separa en **Core Gameplay**, **Contenido**, **Operación/Seguridad**.

## 2.1 Core Gameplay

### Tabla `players`

- `id` UUID PK.
- `user_id` VARCHAR(64) UNIQUE NOT NULL (id externo/plataforma o id interno).
- `nickname` VARCHAR(16) NOT NULL.
- `avatar_id` VARCHAR(64) NULL.
- `platform` VARCHAR(32) NULL.
- `platform_user_id` VARCHAR(128) NULL.
- `app_version` VARCHAR(32) NULL.
- `player_level` INT NOT NULL DEFAULT 1.
- `player_xp` INT NOT NULL DEFAULT 0.
- `gems_balance` INT NOT NULL DEFAULT 0.
- `gold_balance` INT NOT NULL DEFAULT 0.
- `best_score` INT NOT NULL DEFAULT 0.
- `best_run_id` UUID NULL.
- `rank_position_cached` INT NULL.
- `trust_score` INT NOT NULL DEFAULT 100.
- `is_flagged` BOOLEAN NOT NULL DEFAULT FALSE.
- `is_banned` BOOLEAN NOT NULL DEFAULT FALSE.
- `ban_reason` TEXT NULL.
- `ban_until` TIMESTAMPTZ NULL.
- `first_seen` TIMESTAMPTZ NOT NULL DEFAULT now().
- `last_seen` TIMESTAMPTZ NOT NULL DEFAULT now().
- `sessions_count` INT NOT NULL DEFAULT 0.
- `total_playtime_seconds` INT NOT NULL DEFAULT 0.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now().

**Validaciones clave**

- `nickname`: trim, largo 3..16, charset permitido (`[A-Za-z0-9_\- ]`), sin espacios dobles.
- `player_level >= 1`.
- `player_xp >= 0`.
- balances (`gems_balance`, `gold_balance`) nunca negativos.
- `trust_score` en rango `0..100`.
- si `is_banned = true`, `ban_reason` no vacío.

**Índices sugeridos**

- `UNIQUE(user_id)`.
- `INDEX(best_score DESC)`.
- `INDEX(last_seen DESC)`.
- `INDEX(is_banned, is_flagged)`.

---

### Tabla `runs`

- `id` UUID PK.
- `player_id` UUID NOT NULL FK -> `players.id`.
- `user_id` VARCHAR(64) NOT NULL (desnormalizado para queries rápidas).
- `nickname_snapshot` VARCHAR(16) NOT NULL.
- `score` INT NOT NULL.
- `seed` VARCHAR(128) NOT NULL.
- `run_seed` BIGINT NOT NULL.
- `run_time_ms` INT NOT NULL.
- `version` VARCHAR(32) NOT NULL.
- `current_floor` INT NOT NULL.
- `start_class` VARCHAR(32) NOT NULL.
- `start_deck` JSONB NOT NULL.
- `start_relics` JSONB NOT NULL.
- `end_class` VARCHAR(32) NOT NULL.
- `end_deck` JSONB NOT NULL.
- `end_relics` JSONB NOT NULL.
- `floor_events` JSONB NOT NULL.
- `nodes_state` JSONB NOT NULL.
- `inputs_hash` VARCHAR(256) NULL.
- `proof_hash` VARCHAR(256) NULL.
- `flags` JSONB NULL.
- `run_result` VARCHAR(16) NOT NULL DEFAULT 'finished' (`finished|quit|defeat|victory`).
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().

**Validaciones clave**

- `score >= 0`.
- `run_seed >= 0`.
- `run_time_ms` en `0..86400000`.
- `current_floor` en `0..60` (ajustar si cambia diseño).
- `version` formato semver simple (`x.y.z` o `x.y.z+meta`).
- JSONs requeridos deben ser parseables y con tipos correctos.
- `start_class` y `end_class` dentro del catálogo permitido (`titan|arcane|umbralist|no_class`).
- `inputs_hash/proof_hash` máximo 256 chars.

**Índices sugeridos**

- `INDEX(user_id, created_at DESC)`.
- `INDEX(score DESC, created_at ASC)`.
- `INDEX(run_seed)`.
- `INDEX(version)`.

---

### Tabla `leaderboard`

- `user_id` VARCHAR(64) PK.
- `player_id` UUID UNIQUE NOT NULL FK -> `players.id`.
- `nickname` VARCHAR(16) NOT NULL.
- `best_score` INT NOT NULL DEFAULT 0.
- `best_run_id` UUID UNIQUE NULL FK -> `runs.id`.
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now().

**Reglas de consistencia**

- `best_score` debe coincidir con `runs.score` del `best_run_id`.
- al actualizar mejor score, actualizar `players.best_score`, `players.best_run_id` y `leaderboard` en la **misma transacción**.

**Índices sugeridos**

- `INDEX(best_score DESC, updated_at ASC)`.

---

### Tabla `run_events` (opcional pero recomendada)

Desnormaliza `floor_events` para analítica y anti-cheat.

- `id` BIGSERIAL PK.
- `run_id` UUID NOT NULL FK -> `runs.id`.
- `floor` INT NOT NULL.
- `node_type` VARCHAR(32) NOT NULL.
- `event_id` INT NULL.
- `payload` JSONB NULL.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().

**Índices**

- `INDEX(run_id, floor)`.
- `INDEX(node_type)`.

---

## 2.2 Contenido versionado (server-authoritative)

Actualmente las fuentes están en TXT (`cards_database.txt`, `events_database.txt`, `relics_database.txt`). Para backend robusto:

### Tabla `content_versions`

- `id` UUID PK.
- `content_type` VARCHAR(32) NOT NULL (`cards|events|relics|full_bundle`).
- `version` VARCHAR(32) NOT NULL.
- `checksum_sha256` VARCHAR(64) NOT NULL.
- `is_active` BOOLEAN NOT NULL DEFAULT FALSE.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().
- UNIQUE (`content_type`, `version`).

### Tabla `cards`

Campos alineados con `cards_database.txt`:

- identidad: `id` INT PK, `card_class`, `rarity`, `tier`, `name_es`, `name_en`, `image`.
- costos: `gold_coins`, `red_coins`, `life_cost`, `additional_cost`.
- stats: `attack`, `speed`, `health`.
- habilidades: `skill1..3`, `skill_value1..3`.
- comportamiento: `displayed_text`, `condition`, `target`, `effect1..3`, `value1..3`, `turn_duration1..3`, `chance1..3`, `priority1..3`.
- tipo: `type` (`invocation|hex`).
- `ethereal` BOOLEAN.
- `content_version_id` UUID FK -> `content_versions.id`.

**Validaciones mínimas**

- `type` en catálogo permitido.
- `gold_coins >= 0`, `red_coins >= 0`, `life_cost >= 0`.
- `chanceN` en `0..100`.
- `turn_durationN >= 0`.
- si `type='invocation'`, exigir stats base (`attack/speed/health`).
- evitar filas vacías (en origen hay huecos de IDs).

### Tabla `relics`

- `id` INT PK, `tier`, `name_es`, `name_en`, `description`, `image`, `rarity`, `special_conditions`.
- `effect1..3`, `value1..3`.
- `content_version_id` UUID FK.

**Validaciones**

- `rarity` en catálogo (`common|rare|epic|legendary` si aplica).
- al menos un `effect` definido.

### Tabla `events`

- `id` INT PK, `event_class`, `name_es`, `name_en`, `enemy_skill`, `enemy_explanation`, `deck`, `image`, `scene`.
- `health`, `reward_multiplier`, `relic_reward`.
- `starting_gold_coins`, `starting_cards_in_hand`, `cards_per_turn`, `discards_per_turn`.
- `special_conditions`.
- `content_version_id` UUID FK.

**Validaciones**

- `event_class` en catálogo (`enemy|boss|rest|shop|sacrifice|upgrade|beginning|exit|mystery`).
- `health >= 0`.
- `reward_multiplier >= 0`.
- `deck` debe ser JSON array de IDs enteros válidos.

---

## 2.3 Seguridad, auditoría y operación

### Tabla `api_keys`

- `id` UUID PK.
- `name` VARCHAR(64) NOT NULL.
- `key_hash` VARCHAR(128) NOT NULL UNIQUE.
- `scope` VARCHAR(64) NOT NULL (`client_submit|admin|internal`).
- `status` VARCHAR(16) NOT NULL DEFAULT 'active'.
- `expires_at` TIMESTAMPTZ NULL.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().

### Tabla `request_logs`

- `id` BIGSERIAL PK.
- `request_id` UUID NOT NULL.
- `path` VARCHAR(128) NOT NULL.
- `method` VARCHAR(8) NOT NULL.
- `user_id` VARCHAR(64) NULL.
- `ip_hash` VARCHAR(128) NULL.
- `status_code` INT NOT NULL.
- `duration_ms` INT NOT NULL.
- `error_code` VARCHAR(64) NULL.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().

### Tabla `fraud_flags`

- `id` BIGSERIAL PK.
- `run_id` UUID NOT NULL FK -> `runs.id`.
- `user_id` VARCHAR(64) NOT NULL.
- `rule_code` VARCHAR(64) NOT NULL.
- `severity` VARCHAR(16) NOT NULL (`low|medium|high|critical`).
- `details` JSONB NULL.
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now().

---

## 2.4 Telemetría de producto (métricas de gameplay)

Esta capa responde directamente a: **¿de dónde salen las métricas?**

> Enfoque simple (recomendado para arrancar):
> - primero medir con tablas que ya existen (`runs`, `players`, `request_logs`),
> - después agregar una sola tabla de eventos si hace falta más detalle.

### Tabla `telemetry_events`

Evento atómico enviado por backend (y opcionalmente por cliente en eventos no críticos).

- `id` BIGSERIAL PK.
- `event_id` UUID NOT NULL UNIQUE (idempotencia).
- `event_name` VARCHAR(64) NOT NULL.
- `event_ts` TIMESTAMPTZ NOT NULL.
- `received_at` TIMESTAMPTZ NOT NULL DEFAULT now().
- `user_id` VARCHAR(64) NULL.
- `player_id` UUID NULL FK -> `players.id`.
- `run_id` UUID NULL FK -> `runs.id`.
- `app_version` VARCHAR(32) NULL.
- `platform` VARCHAR(32) NULL.
- `session_id` VARCHAR(64) NULL.
- `floor` INT NULL.
- `node_type` VARCHAR(32) NULL.
- `event_payload` JSONB NULL.
- `source` VARCHAR(16) NOT NULL (`server|client|worker`).
- `trust_level` VARCHAR(16) NOT NULL DEFAULT 'high' (`high|medium|low`).

**Validaciones**

- `event_name` dentro de un catálogo permitido.
- `event_payload` con tamaño máximo (ej: 4KB).
- `source='client'` nunca puede sobrescribir datos críticos de score/economía.
- si existe `run_id`, debe pertenecer al `user_id`.

### Catálogo mínimo de eventos

- `run_started`
- `run_submitted`
- `run_finished`
- `floor_completed`
- `node_entered`
- `battle_started`
- `battle_finished`
- `card_picked`
- `relic_picked`
- `shop_purchase`
- `player_banned`
- `fraud_flag_created`

### Regla de confianza (muy importante)

- **Fuente de verdad para economía, score y ranking: siempre server-side** (tablas `runs`, `leaderboard`, `players`).
- Eventos del cliente se usan para UX/product analytics, no para autoridad de estado.

---

## 3) Contratos de API mínimos

## 3.1 `POST /submit-run`

**Headers**

- `Content-Type: application/json`
- `x-api-key: <key>`

**Body requerido**

- `user_id`, `nickname`, `score`, `seed`, `run_seed`, `run_time_ms`, `version`, `current_floor`.
- `start_class`, `start_deck`, `start_relics`, `end_class`, `end_deck`, `end_relics`, `floor_events`, `nodes_state`.
- opcional: `inputs_hash`, `proof_hash`, `flags`.

**Respuesta**

- `201`: `{ run_id, best_score, rank_position? }`

**Errores esperados**

- `400` payload inválido.
- `401` api key inválida.
- `403` usuario baneado.
- `409` duplicado lógico (si se agrega idempotencia).
- `413` body demasiado grande (> 32kb o límite configurado).
- `429` rate limit.
- `500` error interno.

---

## 3.2 `GET /leaderboard?limit=50&offset=0`

**Validaciones**

- `limit` en `1..200`.
- `offset >= 0`.

**Respuesta**

- `200`: `{ items: [{ rank, user_id, nickname, best_score }], total }`

---

## 3.3 `GET /player/:user_id`

Devuelve perfil público/sanitizado.

---

## 3.4 `GET /content/version` y `GET /content/bundle`

Permiten sincronizar cliente con versión activa de contenido.

---

## 3.5 `POST /telemetry/events` (batch)

Endpoint para enviar eventos de analítica no crítica.

**Body**

- `{ events: [ ... ] }` con 1..100 eventos por request.

**Validaciones**

- máximo 100 eventos y 64KB por request.
- cada evento con `event_id` UUID para deduplicación.
- descartar silenciosamente eventos desconocidos o marcarlos con error controlado.

**Respuesta**

- `202`: `{ accepted, rejected }`

---

## 4) Validaciones de negocio (además de schema)

1. **Integridad de run**
   - no aceptar `score` incompatible con `current_floor` extremo (regla heurística configurable).
   - no aceptar `run_time_ms` absurdamente bajo para pisos altos.

2. **Coherencia de inventario final**
   - `end_deck` y `end_relics` deben tener formato válido.
   - impedir arrays gigantes (límite duro por tipo).

3. **Anti-cheat básico**
   - guardar `inputs_hash`/`proof_hash` cuando exista.
   - crear `fraud_flags` si se activan reglas (ej: score outlier por versión).

4. **Consistencia de leaderboard**
   - actualización sólo si `new_score > best_score`.
   - desempate estable por `updated_at` o `run_time_ms`.

5. **Control de versión de cliente**
   - rechazar o degradar features si `version` < `min_supported_version`.

---

## 5) Reglas de seguridad

- API key siempre hasheada en DB (nunca texto plano).
- rate limit por combinación `ip + user_id`.
- sanitización de strings (`nickname`, `seed`, etc.).
- límites de tamaño:
  - body total,
  - tamaño de arrays JSON,
  - longitud de strings.
- CORS restringido por entorno.
- logging sin datos sensibles en texto plano.

---

## 6) Observabilidad y operación

### 6.1 De dónde salen las métricas

1. **Backend API (fuente principal operativa)**
  - middleware HTTP mide RPS, latencia, status codes, error rates.
  - origen: `request_logs` + métricas en memoria/exporter.

2. **Base transaccional (fuente principal de negocio confiable)**
  - `runs`, `leaderboard`, `players`, `fraud_flags`.
  - de acá salen KPIs como runs/día, top score, tasa de victoria, baneos, flags por versión.

3. **Telemetría de eventos (fuente principal de producto/gameplay)**
  - `telemetry_events` (eventos crudos, opcional en MVP).
  - de acá salen embudos: inicio de run -> piso 10 -> piso 20 -> boss -> victoria.

4. **Infraestructura (fuente de salud de plataforma)**
  - uso de CPU/RAM, conexiones DB, saturación del pool, errores de red.
  - fuente: proveedor de hosting + métricas de Postgres/Supabase.

5. **Cliente (fuente complementaria, no autoritativa)**
  - eventos UX (pantallas vistas, clicks, tiempos de carga visual).
  - todo dato crítico se valida/reconcilia con backend.

### 6.1.1 Versión simple para vos (sin pipeline)

Para empezar, alcanza con estas 3 fuentes:

1. `runs`: rendimiento del juego (runs, score, pisos, victoria).
2. `players`: actividad general (usuarios nuevos/activos).
3. `request_logs`: salud técnica (errores y latencia).

Con eso ya podés tomar decisiones de balance y estabilidad sin montar infraestructura extra.

### 6.2 KPIs concretos y query source

- Runs por día -> `runs.created_at`.
- Score promedio y percentiles por versión -> `runs.score`, `runs.version`.
- Tasa de victoria -> `runs.run_result`.
- Retención D1/D7 -> `players.first_seen` + actividad en `telemetry_events`/`runs`.
- Embudo de progresión por piso -> `telemetry_events(event_name='floor_completed')` o `run_events`.
- Detección de fraude por release -> `fraud_flags` + `runs.version`.
- Salud API -> `request_logs` (P95/P99, 4xx/5xx, throughput).

### 6.3 Pipeline recomendado

No es obligatorio al inicio.

MVP sugerido:

1. Guardar datos en tablas normales (`runs`, `players`, `request_logs`).
2. Hacer consultas SQL directas para métricas semanales.
3. Recién cuando haya volumen alto, evaluar jobs o agregados.

En otras palabras: **primero entender el juego, después escalar la analítica**.

### 6.4 Endpoints operativos sugeridos

- `GET /metrics/summary?from&to`
- `GET /metrics/funnel?version&from&to`
- `GET /metrics/health`

Si querés ultra simple, arrancar sólo con:

- `GET /metrics/summary?from&to`

### 6.5 Retención de datos sugerida

- `request_logs`: 30-90 días.
- `telemetry_events` crudo: 90-180 días.
- `runs`: histórico completo si costo lo permite; si no, archivado por partición.

En MVP simple podés omitir retención especial de agregados porque todavía no hay rollups.

### 6.6 Métricas mínimas (las que sí o sí conviene mirar)

1. Runs por día.
2. Score promedio por versión.
3. Tasa de victoria.
4. Error rate API (4xx/5xx).
5. Latencia p95 de endpoints críticos (`submit-run`, `leaderboard`).

Si medís sólo esas 5, ya estás muchísimo mejor que la mayoría de MVPs.

---

## 7) Transacciones críticas

Operación atómica en `submit-run`:

1. upsert de `players` (`last_seen`, nickname, versión).
2. insert de `runs`.
3. comparación y update de `leaderboard` si corresponde.
4. update de `players.best_score`/`best_run_id`.
5. insert opcional de `run_events` y `fraud_flags`.

Si falla cualquier paso, rollback completo.

---

## 8) Especificación de errores (formato unificado)

Respuesta sugerida:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "nickname length must be between 3 and 16",
    "details": {
      "field": "nickname",
      "constraint": "length"
    },
    "request_id": "uuid"
  }
}
```

Códigos base recomendados:

- `VALIDATION_ERROR`
- `AUTH_INVALID_API_KEY`
- `AUTH_USER_BANNED`
- `RATE_LIMITED`
- `RUN_DUPLICATE`
- `RUN_INTEGRITY_FAILED`
- `INTERNAL_ERROR`

---

## 9) Checklist de implementación (MVP -> producción)

## MVP (rápido y consistente)

- [ ] tablas `players`, `runs`, `leaderboard` con constraints.
- [ ] endpoint `POST /submit-run` con validación fuerte.
- [ ] endpoint `GET /leaderboard` paginado.
- [ ] API key + rate limit + límite de body.
- [ ] logs estructurados + `request_id`.

## Fase 2 (robustez)

- [ ] `content_versions` + tablas normalizadas de contenido.
- [ ] `GET /content/version` y `GET /content/bundle`.
- [ ] `fraud_flags` y reglas heurísticas.
- [ ] `telemetry_events` + endpoint batch `POST /telemetry/events`.
- [ ] dashboard simple de métricas (runs, score, winrate, errores, latencia).

## Fase 3 (escala)

- [ ] particionado/archivado de `runs`.
- [ ] caching de leaderboard.
- [ ] workers asíncronos para analítica pesada.

---

## 10) Decisiones que conviene fijar ahora

1. Fuente de verdad de contenido: ¿seguir TXT importado o migrar a tablas administradas por panel interno?
2. Modelo de auth de cliente: ¿sólo API key de build o token por usuario/dispositivo?
3. Nivel de anti-cheat: heurístico liviano vs pipeline de validación offline.
4. Política de retención de logs y runs históricas.

---

## 11) Resumen ejecutivo

Si hoy se implementa exactamente este alcance mínimo, el backend queda listo para:

- recibir runs de forma segura,
- mantener ranking consistente,
- sostener crecimiento de contenido,
- operar con trazabilidad y métricas,
- reducir trampas obvias sin bloquear el desarrollo.
