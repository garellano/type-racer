# Propuesta inicial de Type Racer

Estado: propuesta para refinar antes de implementar. Las decisiones marcadas
como propuestas todavía pueden cambiar.

## Objetivo y decisiones acordadas

Convertir la elección de quién comienza el standup en una competencia breve de
escritura entre compañeros. El ganador comienza; después el equipo sigue su
dinámica habitual de nombrar a la siguiente persona.

- De 2 a 8 participantes.
- El anfitrión elige el idioma de cada carrera.
- Meta fija: el primero que completa el texto gana.
- Duración deseada de unos 45–60 segundos. Es una estimación, no un temporizador
  que determine al ganador.
- Coches vistos desde arriba, pista animada y posiciones compartidas en vivo.
- Repositorio público y juego accesible desde GitHub Pages.

## Flujo propuesto

1. El anfitrión crea una sala, elige idioma y longitud y copia un enlace.
2. Cada participante entra con su nombre y elige coche o color, sin registrarse.
3. La sala muestra quién está conectado y quién pulsó «Listo». El anfitrión
   puede participar o abrir una vista de espectador para compartir pantalla.
4. El anfitrión inicia la carrera. Todos reciben la misma salida programada y
   una cuenta regresiva de tres segundos.
5. Todos escriben la misma secuencia de frases, en el mismo orden. Se muestra
   la frase actual y una vista breve de la siguiente para anticipar el cambio.
6. El servicio compartido confirma quién llegó primero. Aparece la celebración
   y el mensaje «[Nombre] empieza el standup».
7. Se muestra la clasificación por distancia al cierre y se puede jugar otra
   carrera en la misma sala.

## Escritura y distancia

Propuesta inicial: aproximadamente 200 caracteres en frases originales cortas.
A velocidades de 40–60 palabras por minuto, esa cantidad requiere unos 40–60
segundos de escritura sin errores. Ajustar la longitud después de jugar con el
equipo. Todos reciben exactamente el mismo texto de cada ronda.

Una conversión sencilla para dar sensación de carrera:

- 1 carácter correcto = 3 metros.
- 200 caracteres = 600 metros.
- Una frase de 50 caracteres representa 150 metros.

El número exacto de caracteres del texto determina la meta real. Letras,
espacios y puntuación cuentan; teclas de navegación y retroceso no generan
avance adicional. Solo cuenta el prefijo correcto del texto. Repetir una tecla
o borrar y reescribir no acumula distancia. Si se borra un carácter correcto,
el progreso se recalcula; la interfaz anima la corrección.

Los errores se marcan y deben corregirse antes de seguir avanzando. Para la
primera versión se propone contenido cotidiano con puntuación sencilla y una
opción de omitir tildes que se aplique por igual a toda la sala. Bloquear pegado
en el campo de carrera como regla de juego social, sin prometer protección
contra automatización deliberada.

## Pantalla y movimiento

Tres áreas principales:

1. Minimap superior: de salida a meta, muestra a todos con nombre o iniciales,
   el coche propio destacado y la posición actual.
2. Pista principal: vista cenital, un carril estable por participante y cámara
   que sigue el avance propio. Ventana inicial de 50 metros detrás y 50 delante.
   Los participantes fuera de la ventana conservan su lugar en el minimapa;
   indicadores en los bordes muestran su distancia.
3. Campo de escritura: texto grande, carácter actual claro, errores visibles y
   frase siguiente. Posición, metros restantes y velocidad quedan secundarios.

La cámara se limita en la salida y en la meta. Los coches mantienen carriles
estables aunque cambie la clasificación, para evitar saltos verticales mientras
se escribe. Para 8 participantes se ajusta el alto de los carriles.

Momentos que deben diseñarse explícitamente: entrada a la parrilla, «Listo»,
semáforo, aceleración, rebase, error, cambio de frase, aproximación a la meta,
bandera y celebración. Los efectos acompañan el desempeño; no dan ventajas
aleatorias. Sonido opcional y movimiento reducido disponibles.

Objetivo de movimiento: dibujo fluido a 60 cuadros por segundo cuando el equipo
lo permita. El avance propio responde inmediatamente al teclado. Las posiciones
remotas se suavizan entre actualizaciones, sin inventar progreso cuando una
conexión se pierde. El ganador procede del estado confirmado, no de la animación.

## Sincronización y alojamiento

GitHub Pages aloja archivos estáticos: la interfaz, los recursos visuales y el
programa que ejecuta cada navegador. Necesitamos además un servicio compartido
para salas y carreras en vivo. Su proveedor se elegirá al implementar, según
simplicidad, disponibilidad y costo.

Responsabilidades del servicio:

- Crear salas y mantener presencia, anfitrión y permisos de inicio.
- Entregar el mismo texto y una hora de salida común.
- Recibir cambios de escritura en pequeños lotes, con identificador de carrera
  y secuencia para descartar duplicados o mensajes viejos.
- Validar el prefijo escrito y calcular distancia; no aceptar una posición o
  declaración de victoria arbitraria del navegador.
- Compartir posiciones y confirmar el ganador una sola vez de forma atómica.
- Reconectar a un jugador a su estado confirmado y cerrar salas inactivas.

Propuesta: actualización de estado cada 100–150 ms, más una actualización
inmediata al finalizar. La visualización corre independientemente de esa
frecuencia. La clasificación final usa el orden confirmado por el servicio; los
eventos indistinguibles según la resolución definida se mostrarán como empate.
Una competencia casual no garantiza neutralizar toda diferencia de latencia.

Enlaces de sala con códigos difíciles de adivinar y sin listado público. El
código fuente público no implica publicar nombres o partidas. Propuesta:
conservar solo sesiones temporales, sin historial permanente en la primera
versión. Ningún secreto del servicio se incluye en el sitio de GitHub Pages.

## Decisiones pendientes

- Idiomas iniciales: propuesta español e inglés.
- Frases: propuesta frases originales divertidas sobre trabajo y vida cotidiana,
  con opción de que el anfitrión escriba sus propias frases después.
- Errores: propuesta corrección obligatoria, sin perder metros adicionales.
- Cierre: propuesta terminar al primer ganador; ranking restante por distancia.
- Límite de espera: propuesta 90 segundos. Si nadie llega, resultado «tiempo
  agotado» y mejor distancia, claramente distinto de una llegada a la meta.
- Estética: propuesta coches de juguete, formas claras y efectos arcade.

## Cómo construiremos

1. Refinar las reglas pendientes y aprobar la dirección visual.
2. Prototipo local jugable: teclado, validación, cámara, coches y momentos de
   animación. Rivales simulados claramente identificados.
3. Salas reales: dos navegadores primero y luego una prueba con 2–8 personas.
   Verificar salida, avance compartido, victoria única y reconexión.
4. Publicar en GitHub Pages, conectar el servicio y verificar el recorrido desde
   el enlace de invitación hasta el resultado con participantes reales.
5. Ajustar texto y duración con el equipo durante un standup.

## Referencias

- [Type Rush](https://www.typerush.com/): referencia para escritura competitiva y
  avance de vehículos.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages):
  alojamiento estático y estructura de URL por repositorio.
