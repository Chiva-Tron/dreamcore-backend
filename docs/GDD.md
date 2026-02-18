# Dreamcore - Game Design Document (GDD)

## 1. Resumen ejecutivo

Dreamcore es un deckbuilder roguelike con progresion por mapa de nodos, ambientado en un universo onirico y surreal. El jugador construye un mazo de cartas para invocar criaturas y lanzar hechizos mientras recorre un mapa de 60 pisos con eventos, tiendas, mejoras, sacrificios y jefes. El objetivo es sobrevivir a una run completa y derrotar al jefe final, tomando decisiones tacticas y de economia en cada paso.

## 2. Identidad y fantasia central

- Genero: deckbuilder roguelike con combate tactico por cartas.
- Fantasia central: dominar pesadillas y entidades del sueno a traves de un mazo vivo.
- Tono: oscuro, etereo, fragmentado y simbolico.
- Gancho diferencial: estetica VHS/glitch y sistema de invocaciones en tablero, con costos de oro y efectos combinables.

## 3. Vision y pilares

### Vision

Ofrecer una experiencia compacta y altamente rejugable, donde la tension nace del equilibrio entre poder inmediato y riesgo futuro. Cada run debe sentirse distinta por la combinacion de mazos, reliquias y eventos.

### Pilares

1. Elecciones significativas en cada tramo (mapa, cartas, reliquias, eventos).
2. Combate tenso con resultados legibles y contra-juego claro.
3. Atmosfera fuerte: surreal, VHS/glitch, audio inquietante.
4. Variedad de runs por sinergias, modificadores y eventos raros.

## 4. Publico objetivo

- Fans de Slay the Spire y deckbuilders clasicos.
- Jugadores que valoran estetica, tono y narrativa fragmentada.
- Audiencia PC con preferencia por juegos de estrategia ligera.

## 5. Plataformas y controles

- Plataforma inicial: Mobile.
- Controles: Mobile.
- Interaccion principal: tap y drag de cartas.

## 6. Loop principal de gameplay

1. Seleccionar reliquia inicial y mazo base.
2. Elegir ruta en un mapa de nodos con bifurcaciones.
3. Resolver nodos: combate, eventos, tienda, descanso, mejora o sacrificio.
4. Obtener recompensas: cartas, reliquias y oro.
5. Enfrentar jefes periodicos y el jefe final.

## 7. Estructura de run (detalles reales)

### 7.1 Inicio de run

- Piso -2: eleccion de reliquia inicial (2 opciones).
- Piso -1: eleccion de mazo inicial (2 opciones).
- Piso 0: bienvenida y primer enfrentamiento (enemy1/enemy2).

### 7.2 Mapa de nodos

- Total de pisos: 60.
- Jefes cada 10 pisos (boss interval).
- Descanso en el piso siguiente a un jefe cuando aplica.
- Pisos de mejora: 12 en total, sin colocarse consecutivamente.
- Nodos especiales: descanso, forja (blacksmith), sacrificio, tienda, misterio.
- Nodos de misterio: 16, con minimo desde el piso 2.
- Eventos iniciales controlados para early game estable:
	- Piso 1: enemy1 (izq) y enemy2 (der).
	- Piso 2: enemy2 (izq) y enemy3 (der).

### 7.3 Aleatoriedad y seed

- Cada run usa `run_seed` para determinismo.
- La generacion de rutas, eventos y picks iniciales se basan en el seed.

## 8. Sistema de combate (detallado)

### 8.1 Flujo de turno

- Turnos alternos entre jugador y oponente.
- Las intenciones enemigas se muestran antes de que actuen.
- El jugador gasta recursos para jugar cartas y posicionar invocaciones.

### 8.2 Mazo, mano y cementerio

- Mano inicial: 4 cartas base + bonus de reliquias.
- Limite de mano: 7 cartas.
- Al robar: si el mazo esta vacio, se baraja el cementerio.
- Algunas cartas se **exilian** (no vuelven al mazo).

### 8.3 Tipos de carta

- **Invocacion**: unidad que se coloca en slots. Tiene stats y habilidades.
- **Hex**: carta de efecto directo (daño, buff/debuff, robo, oro, destruccion, etc.).

### 8.4 Stats de invocacion

- `attack`: daño base.
- `speed`: determina orden y prioridad.
- `health`: vida base.
- `skill1/2/3` + valores: habilidades pasivas o activas.

### 8.5 Recursos y costos

- Costo principal: `goldCoins`.
- Costos secundarios: `redCoins`, `lifeCost`, `additionalCost`.
- Reliquias y efectos pueden modificar costos.

### 8.6 Efectos disponibles (observados en data)

- `deal_damage`, `deal_damage_all_opponent_invo`, `deal_damage_all_invo`.
- `buff_attack`, `buff_attack_all_player_invo`, `buff_attack_all_opponent_invo`.
- `buff_speed`, `buff_speed_all_player_invo`, `buff_speed_all_opponent_invo`.
- `buff_health`.
- `destroy`, `destroy_all_invo`.
- `player_draw_card`, `player_gain_gold_coins`.
- `change_slot`.

### 8.7 Efectos compuestos

- Cada carta puede aplicar hasta 3 efectos con duracion, chance y prioridad.
- El sistema soporta buffs/debuffs con duraciones.

### 8.8 Keywords y habilidades

- Ejemplos presentes: `spikes`, `goldsmith`, `flying`, `lifelink`, `guard`, `trample`.
- Estas keywords afectan el comportamiento en combate o economia.

### 8.9 IA e intenciones enemigas

- Cada enemigo define un `enemySkill` y una explicacion visible para el jugador.
- Ejemplos:
	- `ritual_doom`: no actua varios turnos y luego invoca criaturas poderosas.
	- `slot_destruction`: destruye slots del tablero.
	- `invocation_mimic`: copia invocaciones del jugador.
	- `deck_thin_punisher`: castiga mazos demasiado delgados.

## 9. Progresion meta (planeada)

- Desbloqueo de cartas, reliquias y variantes por hitos.
- Modificadores de dificultad opcionales.
- Metaprogresion cosmetica y logros.

## 10. Economia

- Monedas obtenidas en combate y eventos.
- Tiendas permiten comprar cartas y reliquias.
- Varias cartas y reliquias generan oro extra.

## 11. Contenido (data-driven)

### 11.1 Cartas

Base de datos: [database/cards_database.txt](database/cards_database.txt).

Campos principales:

- Identidad: `id`, `cardClass`, `rarity`, `tier`, `nameES`, `nameEN`, `image`.
- Costos: `goldCoins`, `redCoins`, `lifeCost`, `additionalCost`.
- Stats de invocacion: `attack`, `speed`, `health`.
- Skills: `skill1/2/3` y `skillValue1/2/3`.
- Texto: `displayedText`, `condition`, `target`.
- Efectos: `effect1/2/3`, `value1/2/3`, `turnDuration1/2/3`, `chance1/2/3`, `priority1/2/3`.
- Tipo: `type` (invocation o hex).
- Propiedad especial: `ethereal` (cartas que se exilian).

Ejemplos actuales de cartas:

- `Whispers of Knowledge`: roba 3 cartas y se exilia.
- `Golden Harvest`: gana 4 monedas doradas.
- `Wave of Decay`: daño a todas las invocaciones enemigas.
- `Echo of Defeat`: daño a una invocacion y daño en area.
- `Apocalypse Unbound`: destruye todas las invocaciones.

### 11.2 Reliquias

Base de datos: [database/relics_database.txt](database/relics_database.txt).

Campos principales:

- Identidad: `id`, `tier`, `nameES`, `nameEN`, `image`, `rarity`.
- Efectos: `effect1/2/3` + `value1/2/3`.
- Reglas: `specialConditions`.

Ejemplos actuales:

- `Overpower Core`: +2 cartas en el primer turno.
- `Arcane Seal`: descartas 1 carta menos al inicio de combate.
- `Sigil of Greed`: la primera carta del turno cuesta -1.
- `Scroll of Momentum`: cada 7 cartas jugadas, robas 1.
- `Ashes of War`: al inicio de turno hace 1 daño a todas las invocaciones enemigas.

### 11.3 Eventos y enemigos

Base de datos: [database/events_database.txt](database/events_database.txt).

Campos principales:

- Identidad: `id`, `eventClass`, `nameES`, `nameEN`.
- Enemigos: `enemySkill`, `enemyExplanation`, `deck`.
- Escena y arte: `image`, `scene`.
- Parametros de combate: `health`, `rewardMultiplier`, `relicReward`.
- Configuracion de mano: `startingGoldCoins`, `startingCardsInHand`, `cardsPerTurn`, `discardsPerTurn`.
- Reglas: `specialConditions`.

### 11.4 Jefes

- Definidos como eventos con clase `boss`.
- Cada boss tiene mazo propio, vida y parametros de combate.
- Existe un boss final `finalboss`.

## 12. UX y UI

- Intenciones enemigas visibles.
- Tooltips al hover con texto breve.
- Jerarquia visual: costos, rareza, clase y tipo de carta.
- El borde de la carta indica clase (`titan`, `arcane`, `umbralist`, `no_class`).
- Iconografia de rareza visible en cada carta.

## 13. Direccion de arte

- Estetica surreal, oscura y onirica.
- Texturas analogicas, grano, aberraciones y glitch.
- Shaders VHS/glitch para identidad visual.

## 14. Direccion de audio

- Pads y sintetizadores ambientales.
- Percusion contenida en combate.
- UI con sonidos suaves y etereos.

## 15. Narrativa

- Historia fragmentada y simbolica.
- Eventos como vehiculo principal de lore.
- Lenguaje críptico y evocativo.

## 16. Tecnico

- Motor: Godot.
- Contenido data-driven en TXT (cartas, eventos, reliquias).
- Sistema de guardado para estado de run.
- Semillas para reproducibilidad de runs.

## 17. Balance y QA

- Seguimiento de winrates y arquetipos.
- Ajustes regulares de costos y recompensas.
- Herramientas internas para testeo de cartas.

## 18. Monetizacion

- Premium (sin gacha).
- DLC cosmetico opcional en fase posterior.

## 19. Milestones (borrador)

- Prototipo: combate base + cartas esenciales.
- Vertical slice: 1 ruta, 1 boss, 20+ cartas.
- Alpha: loop completo, 60+ cartas, 2 bosses.
- Beta: contenido objetivo + balance final.
- Release: estabilidad y pulido.

## 20. Glosario

- **Invocacion**: unidad jugable con stats propios.
- **Hex**: carta de efecto directo.
- **Exilio**: carta que se elimina del ciclo del mazo.
- **Run**: intento completo de juego desde inicio hasta derrota o victoria.

## 21. Referencias de data

- Cartas: [database/cards_database.txt](database/cards_database.txt).
- Eventos: [database/events_database.txt](database/events_database.txt).
- Reliquias: [database/relics_database.txt](database/relics_database.txt).

.
