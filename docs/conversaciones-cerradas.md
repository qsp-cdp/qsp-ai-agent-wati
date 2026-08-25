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
