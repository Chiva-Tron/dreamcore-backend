# Dreamcore Backend — Hoja de Ruta de Implementación (Fresh Build)

Fecha: 2026-02-22  
Estado: plan ejecutable alineado con `docs/dreamcore_back.md`

## Supuestos cerrados

- Se permite romper 100% compatibilidad con el backend actual.
- No se migran rutas legacy (`/submit-run` y aliases históricos).
- Contrato nuevo obligatorio con envelope `ok/data/meta`.
- Auth real en Fase A (`Bearer` para cliente público, `x-api-key` para server/internal).
- Concurrencia inicial sin `revision`; se usa idempotencia + state machine.

---

## Orden de implementación (alto nivel)

1. Fundaciones técnicas (estructura, config, errores, envelope, request-id).
2. Modelo de datos y migraciones Prisma (accounts/sessions/runs/snapshots/idempotency).
3. Auth real (register/login/refresh/logout + hashing + JWT + refresh rotativo).
4. Estado de jugador (`GET /player/me/state`, `PATCH /player/me`).
5. Core de run activa (`runs/start`, `runs/active`, `runs/snapshot`, `runs/finish`, `runs/abandon`).
6. Leaderboard por run (`GET /leaderboard` paginado).
7. Contenido versionado (`/content/bundle`, `/content/:table`).
8. Telemetría batch (`POST /telemetry/events/batch`).
9. Hardening operativo (rate-limit, observabilidad, anti-abuso, pruebas).
10. Limpieza final de código legacy.

---

## Fase 0 — Fundaciones (bloqueante)

## Objetivo
Preparar una base limpia para no mezclar lógica de dominio con plumbing.

## Entregables

- Nueva estructura modular en `src/`:
  - `src/app.ts`
  - `src/server.ts`
  - `src/config/`
  - `src/middleware/`
  - `src/modules/auth/`
  - `src/modules/player/`
  - `src/modules/runs/`
  - `src/modules/content/`
  - `src/modules/leaderboard/`
  - `src/modules/telemetry/`
  - `src/lib/`
- Middleware global:
  - `request_id` (si no llega, generar UUID)
  - envelope de éxito/error unificado
  - mapeo de errores de dominio -> HTTP code + `error.code`
- Contratos base para validación (zod o equivalente).

## Criterio de salida

- Toda respuesta del servidor sale en envelope estándar.
- No queda endpoint fuera del router modular.

---

## Fase 1 — Prisma y esquema canónico

## Objetivo
Alinear DB al contrato nuevo antes de exponer endpoints.

## Entregables DB

- Nuevos modelos (o remodelado completo):
  - `accounts`
  - `players` (con `account_id`, `best_score`, `best_run_id`, `is_banned`)
  - `sessions`
  - `runs` (`status`: `in_progress|finished|abandoned`, `result`: `victory|loss`)
  - `run_snapshots`
  - `leaderboard` por run
  - `content_versions`
  - `idempotency_keys`
  - `telemetry_events`
  - `request_logs`
- Índices críticos:
  - `players(user_id)` unique
  - `sessions(refresh_token_hash)` unique
  - `idempotency_keys(scope, player_id, idempotency_key)` unique
  - `leaderboard(score DESC, created_at ASC)`
  - parcial/estratégico para unicidad de run `in_progress` por jugador

## Criterio de salida

- `prisma migrate dev` limpio.
- Seed mínimo funcional (content + 1 account/player de prueba opcional).

---

## Fase 2 — Seguridad y Auth real

## Objetivo
Cerrar identidad/sesión antes de habilitar escritura de progreso.

## Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

## Reglas

- Password hash con Argon2id (o bcrypt cost alto).
- Access token corto (ej. 1h).
- Refresh token rotativo; guardar hash en DB.
- Logout revoca sesión.
- Rate limit estricto para register/login/refresh.

## Criterio de salida

- Flujo completo: register -> login -> refresh -> logout -> refresh inválido.

---

## Fase 3 — Estado de jugador

## Objetivo
Exponer estado canónico inicial para startup de cliente.

## Endpoints

- `GET /player/me/state`
- `PATCH /player/me` (requiere `x-idempotency-key`)

## Reglas

- `GET /player/me/state` devuelve player + estado de run activa (`none` o `in_progress`).
- `PATCH /player/me` idempotente por key+payload.
- Validaciones de nickname según contrato.

## Criterio de salida

- Cliente puede bootear con estado remoto consistente sin leer disco local.

---

## Fase 4 — Core de runs (cross-device)

## Objetivo
Implementar el núcleo transaccional del juego multi-dispositivo.

## Endpoints

- `POST /runs/start`
- `GET /runs/active`
- `PATCH /runs/:run_id/snapshot`
- `POST /runs/:run_id/finish`
- `POST /runs/:run_id/abandon`

## Reglas de negocio

- 1 sola run `in_progress` por jugador.
- State machine estricta:
  - `in_progress -> finished`
  - `in_progress -> abandoned`
  - cualquier otra transición => `409 state_conflict`
- Idempotencia obligatoria en todas las escrituras.
- `finish` actualiza:
  - run,
  - best personal en `players`,
  - entrada en `leaderboard`.

## Criterio de salida

- Escenario E2E cross-device pasa sin forks de run.

---

## Fase 5 — Leaderboard por run

## Objetivo
Publicar ranking estable y paginado.

## Endpoint

- `GET /leaderboard?limit=<n>&offset=<n>`

## Reglas

- Orden principal por score DESC (con tie-break definido en contrato).
- Tope configurable (ej. 1000 entradas max).
- Respuesta con `rank`, `run_id`, `user_id`, `nickname`, `score`, metadatos de run.

## Criterio de salida

- Ranking consistente después de múltiples `finish` concurrentes.

---

## Fase 6 — Contenido versionado

## Objetivo
Resolver bootstrap de gameplay desde backend canónico.

## Endpoints

- `GET /content/bundle`
- `GET /content/:table` (`cards|relics|events`)

## Reglas

- Siempre incluir `content_version` + `checksum_sha256`.
- `unknown_content_table` para tabla inválida.

## Criterio de salida

- Cliente puede validar versión/checksum y cachear.

---

## Fase 7 — Telemetría

## Objetivo
Habilitar ingestión confiable de eventos de cliente.

## Endpoint

- `POST /telemetry/events/batch`

## Reglas

- Dedupe por `event_id`.
- Aceptación parcial (`accepted`/`rejected`).
- Límites de payload y size.

## Criterio de salida

- Batch idempotente y robusto a reintentos.

---

## Fase 8 — Hardening y operación

## Objetivo
Subir a nivel productivo mínimo.

## Entregables

- Logs estructurados con `request_id`, `player_id`, `endpoint`, `status_code`, `duration_ms`, `error_code`.
- Headers de rate-limit en respuestas.
- Métricas p50/p95, error-rate, idempotency replay count, state-conflict count.
- Reglas anti-abuso mínimas (score/tiempo imposible, volumen anómalo).
- Pruebas de carga base para login/start/finish/leaderboard.

## Criterio de salida

- SLO internos definidos + alertas básicas activas.

---

## Fase 9 — Limpieza final

## Objetivo
Publicar backend nuevo sin arrastre de legado.

## Entregables

- Eliminar rutas legacy antiguas del código.
- Limpiar modelos/helpers no usados.
- Verificar documentación final y ejemplos E2E.
- Tag de release y runbook operativo.

## Criterio de salida

- No existe código legacy ejecutable en runtime.

---

## Plan de PRs sugerido (secuencial)

1. `PR-01`: base modular + middleware global + envelope + request-id.
2. `PR-02`: schema Prisma nuevo + migraciones + seed mínimo.
3. `PR-03`: auth completo + middleware JWT + sesiones.
4. `PR-04`: `player/me/state` + `player/me PATCH` idempotente.
5. `PR-05`: runs start/active/snapshot + state machine base.
6. `PR-06`: runs finish/abandon + integración leaderboard + best score.
7. `PR-07`: leaderboard paginado + límites + tie-break.
8. `PR-08`: content bundle/table + checksum/version.
9. `PR-09`: telemetry batch + dedupe.
10. `PR-10`: observabilidad, rate-limit final, hardening y limpieza legacy.

---

## Definición de Done global

- Todos los endpoints del contrato responden con envelope unificado.
- No hay endpoints legacy de gameplay activos.
- Escrituras críticas con `x-idempotency-key` y replay seguro.
- Run única `in_progress` por jugador garantizada.
- Escenario E2E cross-device validado:
  - Login mobile A -> Start -> Snapshot -> Login PC -> Continue -> Finish -> Leaderboard.
- Checklist backend de `docs/dreamcore_back.md` en estado completo.
