# Dreamcore Backend & Data Persistence — Especificación Objetivo Final

Documento maestro para alinear cliente Godot y backend en una arquitectura robusta, multi-dispositivo (mobile + PC), con consistencia fuerte en datos de valor, idempotencia en escrituras y control de concurrencia.

Este documento define el estado objetivo final. La implementación puede hacerse por fases.

## Decisiones cerradas (22-02-2026)

Estas decisiones son obligatorias para alinear especificación y ejecución real:

- Auth real entra en Fase A (sin fase transicional basada en `user_id` + `x-api-key` para cliente).
- No se mantiene compatibilidad backward con rutas legacy de gameplay (`POST /submit-run` y aliases históricos).
- Todas las rutas públicas quedan bajo envelope unificado `ok/data/meta` (incluyendo reemplazos de rutas legacy).
- Leaderboard canónico por run (top N runs), manteniendo `best_score`/`best_run_id` en `players` para perfil.
- Cliente público usa `authorization: Bearer <access_token>`; `x-api-key` queda para tráfico server/internal.
- Sin `revision` en release inicial; control de concurrencia por idempotencia + reglas de estado.

---

## 1) Objetivo y alcance

## 1.1 Objetivo

Garantizar que toda la data crítica del juego sea consistente entre dispositivos y resistente a:

- pérdida de conexión,
- reintentos duplicados,
- race conditions entre dispositivos,
- divergencias entre estado local y backend,
- manipulación del cliente.

## 1.2 Alcance

Incluye especificación de:

- autenticación real (cuenta + sesión),
- perfil de jugador,
- catálogo de contenido versionado,
- run activa y snapshots de progreso,
- cierre de run + ranking + telemetría,
- sincronización crossplay/cross-device,
- concurrencia e idempotencia,
- contratos API exactos (request/response/errores),
- roadmap de implementación incremental.

---

## 2) Principios de diseño

## 2.1 Server-authoritative

El backend es la única fuente de verdad para:

- identidad y sesión,
- progreso persistente,
- economía y desbloqueos,
- run activa persistida,
- runs finalizadas y ranking.

El cliente solo mantiene:

- cache de lectura,
- estado UI,
- buffer temporal/offline (outbox) para reintentos.

## 2.2 Idempotencia obligatoria en escrituras

Toda mutación de valor debe soportar `x-idempotency-key`.

## 2.3 Concurrencia explícita

En el release inicial no se usa control optimista por `revision`.

Concurrencia mínima obligatoria:

- `x-idempotency-key` en todas las escrituras críticas,
- unicidad de run `in_progress` por jugador,
- validación de transiciones de estado (`in_progress -> finished|abandoned`),
- error `409 state_conflict` en transición inválida.

Mejora posterior (v1.1+):

- agregar `revision` y `expected_revision` en requests de update.

## 2.4 Compatibilidad multi-dispositivo

Un usuario puede:

- iniciar en mobile A,
- continuar en mobile B,
- cerrar en PC,

sin pérdida de progreso ni forks de run.

---

## 3) Modelo de datos objetivo (alto nivel)

## 3.1 Entidades núcleo

### `accounts`

- `id` (uuid, pk)
- `email` (string, unique)
- `password_hash` (string)
- `email_verified` (bool)
- `created_at`, `updated_at`

### `players`

- `id` (uuid, pk)
- `account_id` (uuid, fk)
- `user_id` (string, unique externo estable para cliente)
- `nickname` (string)
- `best_score` (int)
- `best_run_id` (uuid nullable)
- `is_banned` (bool)
- `ban_reason` (string nullable)
- `created_at`, `updated_at`

### `sessions`

- `id` (uuid, pk)
- `account_id` (uuid, fk)
- `refresh_token_hash` (string)
- `device_id` (string)
- `platform` (string)
- `expires_at` (timestamp)
- `revoked_at` (timestamp nullable)
- `created_at`

### `runs`

- `id` (uuid, pk)
- `player_id` (uuid, fk)
- `client_run_id` (string, unique por player)
- `status` (`in_progress|finished|abandoned`)
- `run_seed` (bigint / int64)
- `version` (string)
- `current_floor` (int)
- `start_class` (enum)
- `end_class` (enum nullable)
- `start_deck` (jsonb)
- `start_relics` (jsonb)
- `end_deck` (jsonb nullable)
- `end_relics` (jsonb nullable)
- `nodes_state` (jsonb)
- `floor_events` (jsonb)
- `run_time_ms` (int)
- `score` (int)
- `result` (`victory|loss` nullable; sólo cuando `status=finished`)
- `abandon_reason` (`new_run_started|crash_recovery|server_invalidation|manual_quit` nullable; sólo cuando `status=abandoned`)
- `started_at`, `finished_at`, `updated_at`

### `run_snapshots`

- `id` (uuid, pk)
- `run_id` (uuid, fk)
- `snapshot_type` (`map|combat_strategy`)
- `payload` (jsonb)
- `created_at`

### `leaderboard`

- `id` (bigint, pk)
- `run_id` (uuid, unique, fk runs.id)
- `player_id` (uuid, fk)
- `user_id` (string)
- `nickname` (string)
- `score` (int)
- `created_at`
- `updated_at`

### `content_versions`

- `id` (uuid, pk)
- `version` (string)
- `checksum_sha256` (string)
- `is_active` (bool)
- `created_at`

### `idempotency_keys`

- `id` (uuid, pk)
- `scope` (string endpoint)
- `player_id` (uuid)
- `idempotency_key` (string)
- `request_hash` (string)
- `response_payload` (jsonb)
- `status_code` (int)
- `created_at`
- unique(`scope`, `player_id`, `idempotency_key`)

---

## 4) Flujo real actual vs objetivo final

## 4.1 Real actual (resumen)

- Contenido: backend con fallback local TXT.
- Perfil: `user_id` + nickname, sin auth real.
- Guardado/carga de run: archivo local.
- Fin de run: submit backend para ranking/run.

## 4.2 Objetivo final

1. App inicia -> valida sesión -> obtiene estado canónico.
2. Trae contenido versionado backend.
3. Si hay run activa en backend -> muestra Continue remoto.
4. Start run -> crea run activa backend.
5. Save game -> snapshot backend (no solo local).
6. Continue run -> siempre desde backend (con cache local como fallback UX).
7. Finish run -> cierre transaccional backend + ranking + telemetría.

---

## 5) Contratos API v1 (exactos)

## 5.1 Convenciones globales

### Headers requeridos

- `content-type: application/json` (POST/PUT/PATCH)
- `authorization: Bearer <access_token>` (todos los endpoints de cliente autenticados)

### Headers requeridos (server/internal)

- `x-api-key: <API_KEY>` (endpoints internos, administración y jobs server-to-server)

### Headers recomendados

- `x-request-id: <uuid>`
- `x-idempotency-key: <uuid>` en escrituras críticas

### Envelope de éxito

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

### Envelope de error

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "Payload inválido",
    "details": [
      { "field": "nickname", "message": "length_3_16" }
    ]
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

### Códigos HTTP estándar

- `200` OK
- `201` Created
- `400` validation/syntax
- `401` unauthorized
- `403` forbidden/banned
- `404` not_found
- `409` conflict (idempotency/state)
- `413` payload_too_large
- `415` unsupported_media_type
- `422` semantic_validation_failed (opcional, si separan de 400)
- `429` too_many_requests
- `500` internal_error

---

## 5.2 Auth real

## 5.2.1 `POST /auth/register`

Request:

```json
{
  "email": "player@email.com",
  "password": "S3cret123!",
  "nickname": "Player",
  "platform": "android",
  "device_id": "device-abc"
}
```

Response 201:

```json
{
  "ok": true,
  "data": {
    "account_id": "acc_uuid",
    "player": {
      "user_id": "usr_uuid",
      "nickname": "Player"
    },
    "tokens": {
      "access_token": "jwt",
      "refresh_token": "opaque_or_jwt",
      "expires_in": 3600
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `409 email_already_exists`
- `429 too_many_requests`
- `500 internal_error`

## 5.2.2 `POST /auth/login`

Request:

```json
{
  "email": "player@email.com",
  "password": "S3cret123!",
  "platform": "pc",
  "device_id": "pc-001"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "player": {
      "user_id": "usr_uuid",
      "nickname": "Player",
      "is_banned": false
    },
    "tokens": {
      "access_token": "jwt",
      "refresh_token": "opaque_or_jwt",
      "expires_in": 3600
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 invalid_credentials`
- `403 account_banned`
- `429 too_many_requests`
- `500 internal_error`

## 5.2.3 `POST /auth/refresh`

Request:

```json
{
  "refresh_token": "opaque_or_jwt"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "access_token": "jwt",
    "refresh_token": "opaque_or_jwt_rotated",
    "expires_in": 3600
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Errores:

- `401 refresh_token_invalid`
- `401 refresh_token_expired`
- `403 session_revoked`
- `500 internal_error`

## 5.2.4 `POST /auth/logout`

Request:

```json
{
  "refresh_token": "opaque_or_jwt"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "revoked": true
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

---

## 5.3 Estado de jugador

## 5.3.1 `GET /player/me/state`

Response 200:

```json
{
  "ok": true,
  "data": {
    "player": {
      "user_id": "usr_uuid",
      "nickname": "Player",
      "best_score": 123,
      "best_run_id": "run_uuid_or_null",
      "is_banned": false,
      "updated_at": "2026-02-22T12:00:00.000Z"
    },
    "active_run": {
      "status": "none"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Si existe run activa:

```json
{
  "ok": true,
  "data": {
    "player": {
      "user_id": "usr_uuid",
      "nickname": "Player",
      "best_score": 123,
      "is_banned": false
    },
    "active_run": {
      "status": "in_progress",
      "run_id": "run_uuid",
      "client_run_id": "client_uuid",
      "snapshot_type": "map",
      "current_floor": 8,
      "updated_at": "2026-02-22T12:10:00.000Z"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:10:01.000Z"
  }
}
```

Errores:

- `401 unauthorized`
- `403 player_banned`
- `404 player_not_found`
- `500 internal_error`

## 5.3.2 `PATCH /player/me`

Headers:

- `x-idempotency-key` requerido

Request:

```json
{
  "nickname": "NewName"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "player": {
      "user_id": "usr_uuid",
      "nickname": "NewName",
      "updated_at": "2026-02-22T12:00:00.000Z"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `409 idempotency_conflict`
- `500 internal_error`

---

## 5.4 Contenido versionado

## 5.4.1 `GET /content/bundle`

Response 200:

```json
{
  "ok": true,
  "data": {
    "content_version": "2026.02.22",
    "checksum_sha256": "hex",
    "cards": [],
    "relics": [],
    "events": []
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

## 5.4.2 `GET /content/:table` (`cards|relics|events`)

Response 200:

```json
{
  "ok": true,
  "data": {
    "table": "cards",
    "content_version": "2026.02.22",
    "checksum_sha256": "hex",
    "items": []
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Errores:

- `400 unknown_content_table`
- `401 unauthorized`
- `404 content_not_found`
- `500 internal_error`

---

## 5.5 Run activa (core crossplay)

## 5.5.1 `POST /runs/start`

Headers:

- `x-idempotency-key` requerido

Request:

```json
{
  "client_run_id": "uuid-client-run",
  "run_seed": 12345,
  "version": "0.8.3",
  "start_class": "titan",
  "start_deck": { "items": [1, 2, 3] },
  "start_relics": { "items": [1] },
  "started_at_client": "2026-02-22T12:00:00.000Z"
}
```

Reglas:

- Si ya existe run activa:
  - o devuelve `409 active_run_exists`,
  - o devuelve run activa existente si `client_run_id` coincide (idempotente).

Response 201:

```json
{
  "ok": true,
  "data": {
    "run": {
      "run_id": "run_uuid",
      "client_run_id": "uuid-client-run",
      "status": "in_progress",
      "current_floor": 1,
      "updated_at": "2026-02-22T12:00:01.000Z"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:01.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `409 active_run_exists`
- `409 idempotency_conflict`
- `500 internal_error`

## 5.5.2 `GET /runs/active`

Response 200 sin activa:

```json
{
  "ok": true,
  "data": {
    "active_run": null
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:00:00.000Z"
  }
}
```

Response 200 con activa:

```json
{
  "ok": true,
  "data": {
    "active_run": {
      "run_id": "run_uuid",
      "client_run_id": "client_uuid",
      "status": "in_progress",
      "current_floor": 8,
      "snapshot_type": "combat_strategy",
      "snapshot": {
        "payload": {}
      },
      "updated_at": "2026-02-22T12:20:00.000Z"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:20:01.000Z"
  }
}
```

## 5.5.3 `PATCH /runs/:run_id/snapshot`

Headers:

- `x-idempotency-key` requerido

Request:

```json
{
  "snapshot_type": "map",
  "current_floor": 8,
  "nodes_state": { "items": [] },
  "payload": {
    "class": "titan",
    "gold": 100,
    "deck": [1, 2, 3],
    "relics": [1],
    "hp": 60,
    "map_player_pos": { "x": 100, "y": 200 },
    "map_camera_pos": { "x": 0, "y": 0 }
  }
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "run": {
      "run_id": "run_uuid",
      "status": "in_progress",
      "current_floor": 8,
      "updated_at": "2026-02-22T12:21:00.000Z"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:21:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `404 run_not_found`
- `409 state_conflict` (usar `details.reason=run_not_active` cuando aplique)
- `409 idempotency_conflict`
- `413 payload_too_large`
- `500 internal_error`

Límites operativos (default v1):

- tamaño máximo de body: `256 KB` (si excede -> `413 payload_too_large`).
- `payload` recomendado <= `220 KB` para dejar margen de envelope/proxy.
- compresión HTTP permitida (`gzip`/`br`) sin cambiar semántica de validación.

## 5.5.4 `POST /runs/:run_id/finish`

Headers:

- `x-idempotency-key` requerido

Request:

```json
{
  "result": "victory",
  "score": 12,
  "run_time_ms": 456000,
  "current_floor": 12,
  "end_class": "titan",
  "end_deck": { "items": [1, 2, 3, 4] },
  "end_relics": { "items": [1, 3] },
  "nodes_state": { "items": [] },
  "floor_events": { "items": [] },
  "inputs_hash": "",
  "proof_hash": "",
  "flags": { "completed": true }
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "run": {
      "run_id": "run_uuid",
      "status": "finished",
      "result": "victory",
      "finished_at": "2026-02-22T12:30:00.000Z"
    },
    "leaderboard": {
      "best_score": 120,
      "is_new_best": true,
      "best_run_id": "run_uuid"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:30:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `403 player_banned`
- `404 run_not_found`
- `409 state_conflict` (usar `details.reason=run_not_active` cuando aplique)
- `409 idempotency_conflict`
- `500 internal_error`

Garantía transaccional (obligatoria):

- el cierre de run (`status/result/finished_at`), la proyección a `leaderboard` y la actualización de `players.best_score/best_run_id` ocurren en una única transacción lógica.
- si cualquier paso falla, se revierte todo (sin estado parcial visible).
- ante retry con mismo `x-idempotency-key`, devolver replay 1:1 de la respuesta previamente confirmada.

## 5.5.5 `POST /runs/:run_id/abandon`

Headers:

- `x-idempotency-key` requerido

Request:

```json
{
  "reason": "manual_quit"
}
```

Response 200:

```json
{
  "ok": true,
  "data": {
    "run": {
      "run_id": "run_uuid",
      "status": "abandoned"
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:35:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `404 run_not_found`
- `409 state_conflict` (usar `details.reason=run_not_active` cuando aplique)
- `409 idempotency_conflict`
- `500 internal_error`

---

## 5.6 Compatibilidad con endpoint legado `POST /submit-run`

Decisión: no se mantiene compatibilidad backward con `POST /submit-run`.

Acción de rollout:

1. Cliente migra en bloque a `runs/*`.
2. Backend retira `POST /submit-run` en el mismo release de contrato.

- No se documenta respuesta legacy estable porque el endpoint queda fuera de contrato v1.

---

## 5.7 Leaderboard

## 5.7.1 `GET /leaderboard?limit=<n>&offset=<n>`

Regla de desempate (orden total):

1. `score` DESC
2. `run_time_ms` ASC
3. `created_at` ASC

Si persiste empate exacto, ordenar por `run_id` ASC para estabilidad determinística.

Response 200:

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "rank": 1,
        "run_id": "run_uuid",
        "user_id": "usr_uuid",
        "nickname": "Player",
        "score": 120,
        "current_floor": 12,
        "run_result": "victory",
        "updated_at": "2026-02-22T12:40:00.000Z"
      }
    ],
    "total": 1000,
    "limit": 50,
    "offset": 0
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:40:00.000Z"
  }
}
```

Errores:

- `400 validation_failed`
- `401 unauthorized`
- `429 too_many_requests`
- `500 internal_error`

---

## 5.8 Telemetría

## 5.8.1 `POST /telemetry/events/batch`

Request:

```json
{
  "events": [
    {
      "event_id": "uuid",
      "event_name": "run_finished",
      "event_ts": "2026-02-22T12:30:00.000Z",
      "run_id": "run_uuid",
      "payload": { "result": "victory" }
    }
  ]
}
```

Response 202:

```json
{
  "ok": true,
  "data": {
    "accepted": 1,
    "rejected": 0
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:45:00.000Z"
  }
}
```

---

## 6) Reglas de concurrencia e idempotencia

## 6.1 `x-idempotency-key`

- Obligatorio en `runs/start`, `runs/snapshot`, `runs/finish`, `runs/abandon`, `player PATCH`.
- Mismo key + mismo payload -> backend devuelve misma respuesta previa (replay seguro).
- Mismo key + payload distinto -> `409 idempotency_conflict`.

Política de almacenamiento idempotente:

- Scope de clave: por `scope + player_id + idempotency_key` (unique).
- `request_hash` canónico obligatorio (método + ruta canónica + payload JSON canónico).
- JSON canónico: ordenar claves recursivamente, preservar arrays por orden, normalizar unicode, sin espacios irrelevantes.
- TTL de registro: 72 horas (mínimo); cleanup por job periódico.
- Replay behavior:
  - mismo key + mismo hash: responder mismo `status_code` + `response_payload` persistido.
  - mismo key + hash distinto: `409 idempotency_conflict`.
  - key expirada/no encontrada: procesar como request nueva.
- Persistencia sugerida de respuesta: almacenar envelope completo (`ok/data/meta`) para replay 1:1.

## 6.2 `state_conflict` (release inicial)

- En release inicial no se usa `expected_revision`.
- Los conflictos de concurrencia se modelan con transiciones de estado e idempotencia.
- Si la transición no es válida (ej: finalizar una run no activa) -> `409 state_conflict`.
- `run_not_active` no se usa como `error.code` principal; se reporta en `error.details.reason`.

Ejemplo error:

```json
{
  "ok": false,
  "error": {
    "code": "state_conflict",
    "message": "State transition conflict",
    "details": {
      "reason": "run_not_active",
      "run_id": "run_uuid",
      "current_status": "finished",
      "allowed_from": ["in_progress"]
    }
  },
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-02-22T12:21:01.000Z"
  }
}
```

## 6.3 Run activa única

Regla de negocio:

- 1 sola run `in_progress` por jugador.
- Intentar iniciar otra -> `409 active_run_exists`.

## 6.4 Tabla de transiciones de estado (canónica)

| Estado actual | Operación | Estado destino | ¿Permitido? | Error si no aplica |
|---|---|---|---|---|
| `in_progress` | `POST /runs/:id/finish` | `finished` | Sí | - |
| `in_progress` | `POST /runs/:id/abandon` | `abandoned` | Sí | - |
| `in_progress` | `PATCH /runs/:id/snapshot` | `in_progress` | Sí | - |
| `finished` | `POST /runs/:id/finish` | - | No | `409 state_conflict` (`reason=run_not_active`) |
| `finished` | `POST /runs/:id/abandon` | - | No | `409 state_conflict` (`reason=run_not_active`) |
| `finished` | `PATCH /runs/:id/snapshot` | - | No | `409 state_conflict` (`reason=run_not_active`) |
| `abandoned` | `POST /runs/:id/finish` | - | No | `409 state_conflict` (`reason=run_not_active`) |
| `abandoned` | `POST /runs/:id/abandon` | - | No | `409 state_conflict` (`reason=run_not_active`) |
| `abandoned` | `PATCH /runs/:id/snapshot` | - | No | `409 state_conflict` (`reason=run_not_active`) |

Notas:

- `POST /runs/start` sólo crea run nueva si no existe otra `in_progress` para el jugador.
- Intentar crear una nueva run con otra ya `in_progress` -> `409 active_run_exists`.

---

## 7) Estrategia crossplay/cross-device

## 7.1 Startup

1. validar/refresh token,
2. `GET /player/me/state`,
3. `GET /content/bundle`,
4. si `active_run.status=in_progress` -> habilitar Continue remoto.

## 7.2 Save Game

- Cliente manda snapshot a backend.
- Puede guardar cache local para UX instantánea.
- En `409 state_conflict`, refetch y reconciliación usando `error.details.reason`.

## 7.3 Continue Game

- Preferir snapshot backend.
- Si offline, usar snapshot local con bandera “stale/offline”.
- Al reconectar, reconciliar estado.

## 7.4 Cambio de dispositivo

- Login en nuevo dispositivo.
- Backend entrega estado canónico + run activa + snapshot.
- No depende de archivo local previo.

---

## 8) Resiliencia de red (cliente)

## 8.1 Retry

Reintentar solo en:

- network error,
- `429`,
- `5xx`.

No retry automático en:

- `400`, `401`, `403`, `404`, `409`.

## 8.2 Backoff

- `0.3s`, `0.6s`, `1.2s`, `2.4s` + jitter.

## 8.3 Outbox local

Persistir escrituras críticas en cola local:

- `op_id`, `endpoint`, `payload`, `idempotency_key`, `state`.
- States: `pending|sent|acked|failed`.
- Reintentar al recuperar red.

---

## 9) Seguridad

## 9.1 Passwords

- Hash con Argon2id o bcrypt cost alto.
- Nunca guardar password en texto plano.

## 9.2 Tokens

- Access token corto (ej 1h).
- Refresh token rotativo y revocable.
- Invalidar sesiones comprometidas.

Política de sesiones por dispositivo (default v1):

- máximo `5` sesiones activas por cuenta.
- al crear la 6ta sesión, revocar la más antigua activa (`LRU` por `created_at`).
- endpoint `POST /auth/logout` revoca solo la sesión del `refresh_token` provisto.
- soporte interno para revocación global de sesiones ante incidente de seguridad.

## 9.3 Anti-abuso mínimo

- rate limit por `ip + account_id`.
- bloqueo temporal por intentos de login fallidos.
- detección de payload anómalo (score/tiempo imposible).

---

## 10) Observabilidad

## 10.1 Logs estructurados

Siempre loggear:

- `request_id`, `player_id`, `endpoint`, `status_code`, `duration_ms`, `error_code`.

## 10.2 Métricas

- p50/p95 latency por endpoint,
- error rate por endpoint,
- replay idempotente count,
- conflicts (`state_conflict`) count,
- outbox retry success rate.

## 10.3 Trazabilidad

- `meta.request_id` obligatorio en todas las respuestas.

---

## 11) Rate-limit headers

Responder con:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`

Defaults operativos sugeridos (v1):

- `POST /auth/login`: `10 req/min` por `ip`, y `30 req/15min` por `account/email`.
- `POST /auth/register`: `5 req/hora` por `ip`.
- `POST /runs/start|finish|abandon`: `20 req/min` por `player_id`.
- `PATCH /runs/:id/snapshot`: `60 req/min` por `player_id`.
- `GET /leaderboard`: `120 req/min` por `ip`.

Cuando aplique `429`, incluir `retry-after` (segundos) además de headers de cuota.

---

## 12) Matriz de errores por endpoint (resumen)

| Endpoint | 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 |
|---|---|---|---|---|---|---|---|---|
| POST /auth/register | validation_failed | - | - | - | email_already_exists | - | too_many_requests | internal_error |
| POST /auth/login | validation_failed | invalid_credentials | account_banned | - | - | - | too_many_requests | internal_error |
| POST /auth/refresh | - | refresh_token_invalid | session_revoked | - | - | - | - | internal_error |
| GET /player/me/state | - | unauthorized | player_banned | player_not_found | - | - | - | internal_error |
| PATCH /player/me | validation_failed | unauthorized | - | - | idempotency_conflict | - | - | internal_error |
| GET /content/bundle | - | unauthorized | - | content_not_found | - | - | - | internal_error |
| POST /runs/start | validation_failed | unauthorized | - | - | active_run_exists/idempotency_conflict | - | - | internal_error |
| GET /runs/active | - | unauthorized | - | - | - | - | - | internal_error |
| PATCH /runs/:id/snapshot | validation_failed | unauthorized | - | run_not_found | state_conflict/idempotency_conflict | payload_too_large | - | internal_error |
| POST /runs/:id/finish | validation_failed | unauthorized | player_banned | run_not_found | state_conflict/idempotency_conflict | - | - | internal_error |
| POST /runs/:id/abandon | validation_failed | unauthorized | - | run_not_found | state_conflict/idempotency_conflict | - | - | internal_error |
| GET /leaderboard | validation_failed | unauthorized | - | - | - | - | too_many_requests | internal_error |

---

## 13) Ejemplo E2E completo (cross-device)

## Escenario

- Usuario inicia run en mobile A.
- Guarda en piso 8.
- Abre PC y continúa.
- Termina run y actualiza ranking.

## Secuencia

1. Mobile A: `POST /auth/login`
2. Mobile A: `POST /runs/start`
3. Mobile A: `PATCH /runs/:id/snapshot` (piso 8)
4. PC: `POST /auth/login`
5. PC: `GET /player/me/state` (detecta run activa)
6. PC: `GET /runs/active` (obtiene snapshot)
7. PC: gameplay
8. PC: `POST /runs/:id/finish`
9. PC: `GET /leaderboard`

Resultado:

- No se pierde progreso.
- No se duplica run por idempotencia.
- Ranking consistente y actualizado.

---

## 14) Roadmap de implementación (backend dev)

## Fase A — Base robusta mínima

- Auth real (`register/login/refresh/logout`).
- `GET /player/me/state`.
- `runs/start`, `runs/active`, `runs/finish`.
- corte de `POST /submit-run` y rutas legacy de gameplay.
- idempotency table + middleware.
- state-machine de run + validación de transición.
- middleware global de envelope `ok/data/meta` y `request_id`.

## Fase B — Save/Continue cross-device

- `runs/snapshot`.
- snapshots map/combat_strategy.
- conflict handling + retry strategy documentada.

## Fase C — Operación y hardening

- outbox-friendly semantics.
- telemetría batch.
- métricas + dashboards + alertas.
- hardening anti-cheat básico.

## 15) Checklist final

## Backend

- [ ] Auth real implementada y segura.
- [ ] Estado canónico de jugador (`/player/me/state`).
- [ ] Run activa y snapshots cross-device.
- [ ] Idempotencia en todas las escrituras críticas.
- [ ] State conflict handling (`409`) por transición inválida.
- [ ] Leaderboard transaccional al cerrar run.
- [ ] Contratos de error unificados.
- [ ] Observabilidad (logs+metrics+request_id).

## Cliente Godot

- [ ] Login obligatorio para progreso persistente.
- [ ] Startup sync (player+content+active run).
- [ ] Continue desde backend (no solo local).
- [ ] Save/Load remoto con fallback local UX.
- [ ] Retry + backoff + outbox.
- [ ] Manejo explícito de `409 state_conflict` (leer `details.reason`) y `idempotency_conflict`.

---

## 16) Notas de adopción

- El objetivo final está definido aquí; la entrega puede ser iterativa por fases sin bloquear el roadmap del juego.
- No conviven endpoints de gameplay nuevos/legacy: el contrato v1 entra con corte directo.
- Cada fase debe cerrar con pruebas de integración cliente-backend para escenarios cross-device.

---

## 17) Anexo — Production Readiness (recomendado)

Este anexo cubre lo que normalmente diferencia una implementación correcta de una operación estable en producción.

## 17.1 Account linking y migración de identidad

Objetivo: evitar pérdida de progreso al pasar de invitado a cuenta real o al usar múltiples proveedores de login.

Recomendaciones:

- soportar estado `guest` y flujo `guest -> account` con migración atómica de progreso.
- permitir linking de identidad (email + proveedor social/plataforma) sobre la misma cuenta.
- definir política de merge de cuentas (manual con soporte o automática con reglas estrictas).
- auditar migraciones con `migration_id`, timestamps y rollback posible.

Checklist:

- [ ] endpoint de `link account` definido.
- [ ] migración de progreso probada sin duplicar inventario/run.
- [ ] política explícita para colisiones de cuenta.

## 17.2 Detección de fraude avanzada

Objetivo: complementar validación de payload con señales de comportamiento anómalo.

Señales sugeridas:

- score o progreso imposible por tiempo de run.
- secuencia de eventos inconsistente (`floor_events` vs `nodes_state`).
- frecuencia de runs finalizadas anómala por ventana temporal.
- repetición sospechosa de seeds/resultados.

Acciones sugeridas:

- registrar `fraud_flags` con severidad (`low|medium|high|critical`).
- poner runs sospechosas en cuarentena (no impactan ranking hasta revisión).
- recalcular ranking excluyendo registros en cuarentena.

Checklist:

- [ ] reglas automáticas mínimas de fraude activas.
- [ ] tabla de flags y pipeline de revisión.
- [ ] mecanismo de cuarentena de runs en ranking.

## 17.3 Herramientas internas de operación/soporte

Objetivo: permitir resolver incidencias sin tocar base de datos manualmente.

Capacidades mínimas del panel interno:

- búsqueda por `user_id`, email, nickname.
- ver/forzar cierre de run activa.
- revocar sesiones por dispositivo.
- inspeccionar historial de idempotency keys y outbox fail patterns.
- reprocesar operaciones fallidas de backend jobs (si aplica).

Checklist:

- [ ] panel interno con RBAC (roles y permisos).
- [ ] auditoría de acciones administrativas.
- [ ] playbook de soporte para casos comunes.

## 17.4 Compliance y privacidad de datos

Objetivo: cumplir normativa y reducir riesgo legal/operativo.

Recomendaciones:

- política de retención por tipo de dato (runs, logs, telemetry, sessions).
- endpoint/proceso para export y borrado de datos de usuario.
- minimización de PII en logs (masking/hash de campos sensibles).
- consentimiento y trazabilidad para analytics según región.

Checklist:

- [ ] data retention policy documentada y aplicada.
- [ ] flujo de borrado/export de usuario implementado.
- [ ] sanitización de logs validada.

## 17.5 Confiabilidad operativa

Objetivo: asegurar continuidad del servicio ante fallas y picos.

Recomendaciones:

- backups automáticos con pruebas de restore periódicas.
- tests de carga (picos de login, runs/finish, leaderboard).
- SLO/SLI por endpoint crítico.
- alertas en error rate, latencia p95, saturación DB, cola de retries.

Checklist:

- [ ] backup + restore testeado regularmente.
- [ ] pruebas de carga con umbrales de aceptación.
- [ ] SLO/SLI definidos y observables.
- [ ] alerting en producción con on-call owner.

## 17.6 Criterio de “listo para producción”

Se considera listo cuando:

- se cumplen secciones 1–16,
- y al menos el 80% del checklist de este anexo está implementado,
- sin blockers en seguridad, integridad de datos ni recuperación ante desastres.

---

## 18) Anexo — Operación del backend implementado (23-02-2026)

Este anexo deja explícitos los puntos de operación que deben estar activos para que la implementación cumpla el contrato v1 en runtime.

## 18.1 Unicidad de run activa por jugador (DB-level)

Además de la validación en lógica de aplicación, la unicidad de `in_progress` debe quedar reforzada en base de datos con índice parcial único:

- `runs_one_in_progress_per_player_idx`
- definición: `UNIQUE (player_id) WHERE status='in_progress'`

Objetivo:

- evitar race conditions bajo concurrencia alta incluso si dos requests pasan validación de app al mismo tiempo.

## 18.2 Job de cleanup para idempotency keys (TTL)

La política de TTL de idempotencia (72h mínimo) requiere ejecución periódica.

Comando operativo:

- `npm run cleanup:idempotency`

Configuración:

- `IDEMPOTENCY_TTL_HOURS` (default recomendado: `72`)

Frecuencia sugerida:

- cada 1h o 1 vez por día según volumen.

## 18.3 Variables de entorno mínimas requeridas

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT` (opcional, default `3000`)
- `ACCESS_TOKEN_TTL_SECONDS` (default `3600`)
- `REFRESH_TOKEN_TTL_DAYS` (default `30`)
- `MAX_ACTIVE_SESSIONS_PER_ACCOUNT` (default `5`)
- `IDEMPOTENCY_TTL_HOURS` (default `72`)

## 18.4 Aclaración de comportamiento idempotente

Para `POST /runs/start`:

- si ya existe run activa del jugador con el mismo `client_run_id`, se responde con la run existente (idempotente) en lugar de crear una nueva.

Para claves de idempotencia en escrituras críticas:

- el hash canónico se calcula con `método + ruta canónica + payload JSON canónico`.
- el JSON canónico normaliza strings en Unicode NFC, ordena claves recursivamente y preserva orden de arrays.

## 18.5 Checklist operativo rápido (go-live)

- [ ] Migrations aplicadas en entorno (`prisma migrate deploy`).
- [ ] Seed de contenido activo ejecutado (`npm run seed:content`).
- [ ] Cron de cleanup idempotency activo (`npm run cleanup:idempotency`).
- [ ] `JWT_SECRET` fuerte y rotación definida.
- [ ] Healthcheck y restart policy del proceso configurados.
