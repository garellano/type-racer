# Sincronización multijugador: evaluación y recomendación

Fecha de consulta de precios y documentación: 9 de octubre de 2026.
Estado: recomendación técnica para revisar antes de implementar o contratar.

## Recomendación

Mantener la interfaz en GitHub Pages y usar **Cloudflare Workers + un Durable
Object por sala + WebSockets seguros** para coordinar las carreras. Empezar con
Workers Free y Durable Objects con almacenamiento SQLite.

El uso previsto es de 2–8 jugadores por sala, carreras de unos 45–60 segundos y
participantes en US, Irlanda y México. La estimación para un equipo que juega
unas pocas rondas al día es **USD 0 al mes**, sujeta a las cuotas del plan y a la
medición real. La siguiente opción de Cloudflare tiene un mínimo de USD 5 por
mes por cuenta, con cobros adicionales si se exceden las cantidades incluidas.

GitHub Pages cubre el alojamiento estático. Que el repositorio sea público no
convierte automáticamente el servicio multijugador en gratuito; se presupuestan
por separado.

## Qué significa tiempo real en este juego

WebSocket es un canal persistente para enviar y recibir mensajes. Firebase y
Supabase son servicios que pueden resolver parte de la comunicación. Elegir el
canal no resuelve por sí mismo la salida común, la validación o el ganador.

No hay visibilidad literalmente instantánea entre continentes: cada cambio
tarda en viajar. Sí podemos obtener movimiento fluido, retrasos pequeños y un
resultado compartido consistente. Separaremos tres responsabilidades:

- **Respuesta propia:** validación y dibujo locales, inmediatamente al escribir.
- **Estado confirmado:** un coordinador calcula avance, clasificación y cierre.
- **Movimiento remoto:** animación suave entre estados recibidos, sin adelantar
  un coche más allá del progreso confirmado ni decidir un ganador visualmente.

La salida se prepara con texto idéntico y un `startAt` del servidor unos tres
segundos en el futuro. Cada navegador estima la diferencia con el reloj del
servidor mediante intercambios de ida y vuelta. El tiempo local usa un reloj
monótono para que cambiar la hora del dispositivo no mueva la cuenta regresiva.
La estimación no elimina la asimetría de las rutas de Internet.

## Alternativas evaluadas

| Alternativa | Oferta gratuita relevante | Ajuste al proyecto |
| --- | --- | --- |
| Cloudflare Durable Objects | 100.000 solicitudes/día; 13.000 GB-s/día; 100.000 filas escritas/día; 5 GB almacenados. Mensajes WebSocket de salida sin cargo de solicitud. | Recomendado: una autoridad por sala y control directo del protocolo. |
| Firebase Realtime Database, Spark | 100 conexiones simultáneas, 1 GB almacenado y 10 GB descargados/mes. | Alternativa viable para sincronizar progreso con clientes cooperativos. Para lógica propia de servidor, Cloud Functions exige Blaze. |
| Supabase Realtime, Free | 200 conexiones simultáneas; 2 millones de mensajes/mes; límite de 100 mensajes/s. | Viable con agregación, pero la distribución de actualizaciones consume el límite por segundo. Pro desde USD 25/mes. |

Fuentes: [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[Workers](https://developers.cloudflare.com/workers/platform/pricing/),
[Firebase](https://firebase.google.com/pricing),
[Cloud Functions](https://firebase.google.com/docs/functions/get-started),
[cuotas de Supabase](https://supabase.com/docs/guides/realtime/limits),
[precios de Realtime](https://supabase.com/docs/guides/realtime/pricing) y
[planes de Supabase](https://supabase.com/pricing).

### Por qué Cloudflare

Un Durable Object tiene una instancia activa que recibe las conexiones de la
misma sala. La aplicación puede usarla como árbitro: valida lo escrito, mantiene
la versión oficial del estado y registra una sola transición de carrera activa
a resultado. Las salas diferentes usan objetos diferentes.

Esto permite conservar el control del juego sin mantener una máquina virtual
encendida todo el mes. Usaremos la API de WebSockets con hibernación para que la
sala pueda quedar inactiva durante la espera. La carrera activa sí puede consumir
duración, especialmente mientras funcionen temporizadores de difusión.

El estado crítico se guarda en el almacenamiento del objeto: participantes,
texto, salida, progreso confirmado y resultado. La memoria es una caché; no es
la única copia. Antes de confirmar un avance al cliente se persiste el estado
necesario para recuperarlo. Al cerrar la sala, su estado temporal caduca.

Fuentes: [WebSockets e hibernación](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
y [estado en memoria](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/).

### Qué complica las otras opciones

Firebase Realtime Database sí ofrece sincronización útil para juegos y su cuota
gratuita es suficiente para una sala. La diferencia es de arquitectura: si los
navegadores publican directamente su avance, las reglas de acceso y la
validación deben impedir cambios ajenos y resultados arbitrarios. Un árbitro
con lógica propia requiere añadir un servidor o funciones. Blaze no implica
necesariamente un gasto por consumo bajo, pero cambia el modelo de facturación.

En Supabase, un Broadcast cuenta el envío y las entregas a suscriptores. Con ocho
jugadores enviando diez actualizaciones por segundo a los otros siete, el
patrón directo equivale a **640 mensajes/s**: 80 envíos y 560 entregas. Esto
supera el límite gratuito de 100/s. Agrupar estados o reducir frecuencia lo
resuelve, pero exige diseñarlo y todavía queda la autoridad de carrera.
Los proyectos gratuitos pueden pausarse tras una semana de inactividad.

Fuentes: [conteo de mensajes](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)
y [planes](https://supabase.com/pricing).

## Protocolo propuesto

1. Una ruta HTTP crea la sala; devuelve invitación y credencial del anfitrión.
2. Cada navegador abre un WebSocket con la sala y recibe su identidad de sesión.
3. Los mensajes de escritura contienen cambios del campo de carrera,
   identificador de ronda y secuencia. No contienen posiciones arbitrarias.
4. El coordinador valida el texto, calcula caracteres correctos y distancia, y
   descarta duplicados o mensajes de rondas anteriores.
5. Durante la carrera, cada cliente envía solo cuando cambia su escritura, como
   máximo diez veces por segundo. El coordinador agrupa los estados y reparte
   una instantánea compacta hasta diez veces por segundo, solo si hubo cambios.
6. Cada instantánea incluye versión, hora del servidor, progreso de todos,
   clasificación y fase. Los navegadores descartan versiones anteriores.
7. La última tecla se envía inmediatamente, sin esperar el lote periódico. El
   primer evento válido de finalización recibido por la sala cierra la ronda.
   El resultado se persiste y se comunica inmediatamente a todos.
8. Al reconectar, el jugador recibe una instantánea completa y la última
   secuencia confirmada. Los mensajes repetidos no suman avance. Si la carrera
   ya acabó, recibe el resultado; no puede completar retroactivamente.

El orden de recepción del servidor determina el ganador. Esto evita resultados
contradictorios, pero una llegada muy ajustada puede favorecer una conexión con
menor latencia. No usaremos la hora declarada por un navegador como prueba
incuestionable de que ganó. La cuenta regresiva común y el envío inmediato de
la finalización reducen diferencias evitables.

Si se pierde la conexión, la interfaz muestra «Reconectando» y deja de presentar
progreso como confirmado. Los rivales no continúan avanzando por extrapolación.
Una cola de mensajes atrasados se sustituye por el estado más reciente antes de
repartirlo, para no animar posiciones obsoletas durante segundos.

## Latencia y distribución geográfica

Propuesta inicial: pedir ubicación en el este de Norteamérica (`enam`) al crear
la sala, por la distribución US–Irlanda–México. Es una hipótesis geográfica para
probar, no una ubicación óptima demostrada. El hint de Cloudflare es una
preferencia y no garantiza un centro concreto; el objeto de una sala no se
replica automáticamente cerca de cada jugador.

Compararemos esa preferencia con Europa occidental usando mediciones desde
los participantes reales. No crearemos salas anticipadamente desde otro país,
porque la primera creación influye en su ubicación.

Objetivo inicial de producto: la mayoría de los cambios remotos deberían verse
en menos de 300 ms en conexiones normales, mientras el movimiento se dibuja a
60 cuadros por segundo cuando el dispositivo lo permite. Mediremos el percentil
95; estos números son objetivos de prueba, no una garantía del proveedor.

Si las mediciones fallan, el orden de ajuste será ubicación, frecuencia de
agrupación y suavizado visual. Una implementación de 20 actualizaciones por
segundo también cabe en el presupuesto previsto, pero se decidirá midiendo.

Fuente: [ubicación de Durable Objects](https://developers.cloudflare.com/durable-objects/reference/data-location/).

## Estimación de consumo

Modelo conservador de una carrera de 60 segundos con ocho participantes y
actividad constante al máximo de diez envíos por segundo:

- Entrada: `8 × 10 × 60 = 4.800` mensajes.
- Distribución agrupada: `10 × 60 × 8 = 4.800` entregas de instantáneas.
- Sala activa durante 60 segundos: unos **7,7 GB-s**, usando 128 MB asignados.
- Si cada actualización aceptada guarda una fila, hasta unas 4.800 escrituras,
  más operaciones de entrada, salida, inicio, cierre y limpieza.

Para tres rondas diarias: unas 14.400 entradas, 23 GB-s de carrera activa y
14.400 escrituras de progreso al día. Están por debajo de las cuotas gratuitas.
Hay que añadir lobby, reintentos, espectadores, pruebas y otras aplicaciones
que compartan la cuenta. Esto es un modelo, no una medición ni un límite de gasto.

La política propuesta para mantener costo cero es usar Free, limitar cada sala
a ocho corredores, caducar salas inactivas y apagar temporizadores al terminar.
Si se supera una cuota de Free, la operación correspondiente falla; no se
convierte automáticamente en un cobro de exceso del plan Paid.

La optimización no será dejar estados críticos sin guardar: consistencia y
recuperación tienen prioridad. Verificaremos las filas realmente escritas y la
duración facturada en una prueba representativa, incluyendo varios minutos de
espera y desconexiones.

## Validación antes de publicar

1. Dos navegadores: mismo texto, misma salida, progreso compartido y resultado
   idéntico.
2. Ocho participantes con conexiones de US, Irlanda y México: medir demora de
   cambios remotos y variación de la salida. Comparar ubicaciones propuestas.
3. Finalizaciones casi simultáneas: un solo cierre y mismo ganador en todas las
   pantallas; ningún resultado local anticipado.
4. Desconexión, refresco y reconexión: recuperar estado confirmado sin duplicar
   progreso ni admitir victorias posteriores al cierre.
5. Mensajes viejos, duplicados y carga artificial: rechazar datos inválidos y
   mantener el servidor al día, sin acumular animaciones atrasadas.
6. Medir consumo real de carreras y lobby; dejar documentado el margen gratuito.

La fase siguiente sería una prueba pequeña de esta sincronización con progreso
simple. La implementación visual completa se apoya después en ese protocolo.

No se ha creado un servicio ni activado un plan de pago como parte de esta
evaluación.
