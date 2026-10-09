# Type Racer

Una carrera de escritura en vivo para elegir quién empieza el standup.

El anfitrión comparte una sala por enlace. De 2 a 8 participantes entran con su
nombre, eligen un coche y compiten escribiendo la misma secuencia de frases.
Cada carácter correcto hace avanzar el coche. Quien llega primero a la meta
inicia el standup.

## Estado

Diseño inicial. El juego todavía no está implementado ni publicado en GitHub
Pages. El repositorio es público.

## Decisiones acordadas

- De 2 a 8 participantes por carrera.
- Idioma seleccionable al crear la sala.
- Meta fija; gana quien termine primero.
- Carreras pensadas para unos 45–60 segundos, según la velocidad del equipo.
- Pista animada con coches vistos desde arriba, progreso compartido en vivo y
  un minimapa de toda la carrera.
- Publicación del juego en GitHub Pages, con un servicio externo para la
  sincronización entre participantes.

La propuesta completa y las decisiones pendientes están en
[docs/concepto.md](docs/concepto.md).

La [evaluación de sincronización](docs/sincronizacion.md) recomienda Cloudflare
Workers y Durable Objects con WebSockets, con costo esperado de USD 0 para el
uso del equipo. Incluye alternativas, cuotas y pruebas de latencia propuestas
para US, Irlanda y México. El proveedor aún no está contratado.
