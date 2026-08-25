# Conversaciones cerradas — cuando el que escribe NO es un cliente

Hay números de WhatsApp que llegan al mismo inbox pero no son clientes: proveedores, mensajeros,
bancos, el contador. El copiloto no tiene forma de adivinarlo — para él todo el que escribe es alguien
a quien hay que ayudar a comprar. Y ahí es donde hace daño: le contesta a un proveedor con NUESTRO
precio de venta y NUESTRO inventario.

Para eso existe `status = 'cerrada'`.

## Cómo se marca

```sql
update public.conversations set status = 'cerrada' where wa_id = '507XXXXXXX';
```

Y para devolverlo a la normalidad:

```sql
update public.conversations set status = 'bot' where wa_id = '507XXXXXXX';
```

## Qué hace el bot con una conversación cerrada

- **No contesta. Nunca.** Ni texto, ni el puente de notas de voz, ni el aviso de trámite.
- **Sí guarda** todo lo que llega, para que el asesor tenga el hilo completo cuando lo abra.
- **No hay re-enganche en frío.** Las otras conversaciones vuelven al bot solas cuando el asesor lleva
  horas sin escribir; una `cerrada` no. Sale de ahí solo quien la escribió, a mano.
- El asesor sigue escribiendo por WATI con toda normalidad. Lo único que cambia es que el bot calla.

## Cómo saber a quién cerrar

El watchdog lo busca solo y lo manda por correo. La señal no es lo que dice el contacto sino lo que le
dice NUESTRO asesor: si el asesor pregunta "¿tienes…?", "¿me cotizas…?", "¿cuánto te…?", entonces los
que estamos comprando somos nosotros y del otro lado hay un proveedor. Se exigen 2 o más de esas
preguntas para que una frase suelta no dispare.

Consultarlo a mano:

```sql
select * from public.contactos_posibles_proveedores(60);
```

Lista vacía = no hay ninguno nuevo. Los ya cerrados no aparecen (por eso queda vacía, no porque el
detector se haya apagado).

**Solo reporta, no cierra.** Cerrar por cuenta propia dejaría mudo a un cliente real cada vez que la
heurística se equivoque, y eso no se ve venir: el cliente simplemente no recibe respuesta y nadie se
entera. La decisión la toma una persona.

## El caso que lo destapó (25-ago-2026)

Nuestro proveedor llevaba **45 respuestas del bot en 60 días**. No era ruido: el asesor le preguntaba
"¿tienes 0692C005AA?" para comprarle, el proveedor contestaba "$46.80, disponible 7", y el bot se metía
en medio con nuestro precio de venta: "$54.99 + ITBMS, 5 unidades". Ese mismo día pasó otra vez con el
tóner CF230X — el proveedor cotizó **$112.35** y el bot publicó **$132.00 + ITBMS**. Es decir, le
enseñamos nuestro margen renglón por renglón, durante dos meses, sin que nadie lo viera.

`status='cerrada'` existía en el esquema desde julio y **jamás se había usado** (1 conversación cerrada
de 3.043). Era un freno instalado y sin estrenar.

## Y por qué el freno se soltaba solo (v115)

Al marcarla `cerrada` a las 14:15, el bot calló… hasta las 14:32, cuando un asesor saludó al proveedor.
A las 14:47 el bot ya estaba contestando otra vez.

La causa estaba en el manejador del mensaje del asesor: al escribir un humano, el código subía la
conversación a `handoff` **sin mirar en qué estado estaba**. Como `cerrada` es justamente el estado que
hace callar al bot, cada mensaje de un asesor lo volvía a soltar. El estado más fuerte lo pisaba el
evento más común.

Desde la **v115** las dos ramas que atienden al asesor (texto y adjuntos) respetan `cerrada`. Verificado
en vivo el mismo día: 15:24 el proveedor escribe y el bot calla → 15:25 el asesor escribe → 15:26 el
proveedor escribe y el bot **sigue** callado. Antes, ese tercer renglón no existía.

La lección para el resto del sistema: un estado que representa una **decisión del negocio** no puede
vivir en el mismo campo que los estados de tránsito sin que alguien lo proteja de forma explícita.

## Segunda capa: el secret `WA_IGNORAR` (v117)

Idea de Isaac. Un freno guardado en la base **lo puede borrar un bug nuestro** — es literalmente lo que
acaba de pasar. Un secret no: el copiloto lo lee y nunca lo escribe, así que ninguna ruta del código
puede pisarlo. No es un duplicado de `cerrada`, es una capa de otra naturaleza.

Se configura en Supabase → *Project Settings* → *Edge Functions* → *Secrets*:

| Nombre | Valor |
|---|---|
| `WA_IGNORAR` | números separados por comas |

Se guardan solo los dígitos, así que `+507 6741-7632`, `507-6741-7632` y `50767417632` son el mismo
número. Vacío = apagado.

El freno se aplica en **`enviarWati`**, la única función que le habla a WhatsApp, y no en la entrada.
Así ninguna ruta futura —asistencia, puente de audio, avisos de trámite, barridos— puede saltárselo por
descuido. El corte que hay junto al gate de `cerrada` es solo para no gastar el modelo en una respuesta
que igual se iba a bloquear.

Para verificar que quedó cargado sin que el número aparezca en ningún lado, el endpoint de estado
publica **cuántos** hay: `wa_ignorar: 2`. Nunca cuáles.

## Tercera capa, y la que usa su gente: el atributo `no_es_cliente` (v119)

**Esta es la forma normal de marcar a alguien.** Las dos de arriba quedan de respaldo.

En WATI, en la ficha del contacto, se agrega el atributo:

| Atributo | Valor |
|---|---|
| `no_es_cliente` | `si` |

El copiloto lo lee y pone la conversación en `cerrada` solo. Para devolverla, se le quita el atributo.

Cómo está construido, y por qué así:

- **Una consulta por contacto cada 12 h**, no una por mensaje (`no_cliente_revisado_at` lo marca).
- **Ante la duda, atiende.** Si WATI no responde, si tarda, si el JSON viene raro — el mensaje sigue su
  camino normal. Un cliente real sin respuesta porque WATI tosió es mucho peor que un proveedor con una
  respuesta de más: lo primero no lo ve nadie.
- **Se exige que el teléfono coincida.** El filtro `name` de WATI es difuso; si devolviera otro contacto,
  aplicar su marca silenciaría a un tercero.
- **Solo reabre lo que él mismo cerró.** La columna `cerrada_por` guarda quién cerró. Si dice
  `wati_atributo`, quitar el atributo la reabre. Si está en NULL, la cerró una persona y el código no la
  toca — reabrir una decisión humana porque un campo no está sería repetir el defecto de la v115.

Las cuatro ramas se probaron contra producción el 25-ago:

| caso | resultado |
|---|---|
| sin atributo | no toca nada, solo sella la fecha *(contacto real, 16:02)* |
| `si` + abierta | cierra con `cerrada_por='wati_atributo'` |
| `no` + cerrada por el puente | reabre a `bot` |
| `no` + **cerrada por una persona** | **no la toca**, ni siquiera consulta WATI |

Para probarlo sin esperar a que escriba un cliente hay un botón, detrás de la llave del webhook:
`?diag=no_es_cliente&num=507…` dice qué decidiría sin escribir nada, y con `&seco=0` lo ejecuta y
muestra el antes y el después.

## Lo que NO se puede hacer: filtrar por equipo de WATI

Isaac propuso marcar a los proveedores con un **equipo** de WATI en vez de a mano. Es el lugar correcto
—la decisión viviría donde su gente ya trabaja— pero al medirlo aparecieron dos obstáculos, ninguno de
diseño:

1. **El equipo no viaja en el webhook.** Sonda de 25-ago sobre tráfico real: en 8 mensajes de clientes
   el campo del asignado vino vacío, y ninguno de los tres tipos de evento (`message`,
   `newcontactmessagereceived`, `sessionmessagesent`) trae equipo. O sea que el bot no puede decidir en
   el mismo mensaje; tendría que leer el contacto por API.
2. **La API que el bot alcanza devuelve `teamIds: null`.** `/api/v1/getContacts` sí expone el campo,
   pero llega vacío en los dos contactos probados, aunque el CDP de WATI sí reporta un equipo.
3. Y sobre todo: **hoy el equipo no clasifica nada.** El proveedor y una clienta real están los dos en
   `"Ventas Online | Clientes VIP"`. El campo existe pero nadie lo ha usado para separar.

Lo que ese mismo endpoint **sí** devuelve, y el copiloto ya sabe escribir con
`updateContactAttributes`, son los **atributos personalizados** (`customParams`). Un atributo
`no_es_cliente = si` se edita desde la ficha del contacto en la bandeja —igual de cómodo que un
equipo— y se puede leer hoy, sin incógnitas.

**La prueba se hizo y salió que no.** Se creó el equipo "Contacto con Proveedores", se le asignó el
contacto del proveedor —el CDP de WATI lo confirma— y el endpoint siguió devolviendo `teamIds: null`.
Se probaron cinco rutas con el token del copiloto:

| ruta | HTTP | `teamIds` |
|---|---|---|
| `/api/v1/getContacts` | 200 | **null** |
| `/api/v2/getContacts` | 404 | — |
| `/api/v1/getTeams` | 404 | — |
| `/api/v1/getContact/<num>` | 404 | — |
| `/api/v1/getContactAttributes/<num>` | 404 | — |

El token abre solo la v1 pública, y esa API declara el campo pero no lo llena. El MCP lee los equipos
por otra puerta que el copiloto no tiene. Por eso la marca es un **atributo** y no un equipo.

El equipo igual sirvió para dos cosas: organiza la bandeja, y al mover el contacto **se le apagaron
`allow_broadcast` y `allow_sms`**, que es lo que lo sacó de las campañas.

Un detalle que confunde: dentro del equipo aparece un usuario **"Api Token 764"**. Ese es el propio
copiloto (`api-token-user.764@clare.ai`, el `operatorEmail` de sus envíos). **Sacarlo del equipo no lo
callaría**: el copiloto no trabaja por el enrutamiento de WATI sino por un webhook que le llega en todos
los mensajes, esté la conversación asignada a quien esté. Y es la identidad con la que le manda mensajes
a todo el mundo, así que quitarlo tiene más riesgo que beneficio.
