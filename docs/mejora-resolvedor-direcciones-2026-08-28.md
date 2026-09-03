# Resolvedor de direcciones: el diccionario confiado bloquea a Google (caso Santa María, 28-ago)

> Acordado con Isaac el 28-ago: "Google Places debería tener más peso y el diccionario copiando,
> mejorando y registrando". Este archivo registra el caso, el mecanismo verificado y el diseño de la
> mejora, para ejecutarla luego sobre la rama que despliega.

## El caso (50766402661, Eric, 28-ago ~10:06)

Cliente en el **Santa María Business District** (Juan Díaz, después de Costa del Este). El bot lo
resolvió como el barrio **Santa María de Betania** → Z1, $6.00, y así lo guardó ("estacionamientos
S1 (Betania)"). El cliente lo corrigió dos horas después: *"Esto no es Betania, es Santa María Juan
Díaz"* → el bot re-resolvió bien: Z2, $7.00. La recuperación funcionó; la promesa inicial de $6 y la
dirección mal guardada llegaron al cliente.

## Mecanismo (verificado contra el RPC real de prod)

`resolver_tarifa_v2('el edificio de banco prival en santa maria businnes district')` devuelve:

```
estado: "ok" · match: ["barrio:santa maria"] · Betania → Z1 $6 · confianza: "Media"
```

Tres eslabones:

1. **El match por frontera de palabra encontró "santa maria" dentro del nombre largo** y declaró
   victoria con `estado: ok`. La consulta tenía 9 palabras y el match cubrió 2 — "business",
   "district" y "banco prival" quedaron sin explicar. Esa señal existía y nadie la usa.
2. **`confianza: "Media"` se ignora.** Nada en el flujo la mira: un ok Media pesa igual que un ok Alta.
3. **La capa 3 (Google + polígono) SOLO corre con `sin_match` o `ambiguo`** — un ok equivocado la
   bloquea por completo. Google habría puesto el pin en Juan Díaz y `zona_por_coordenadas` habría
   dicho Z2; nunca se le preguntó.

## El hallazgo de data que agrava (y una joya)

En `sectores_entrega` hoy:

- **0 filas** contienen "business district".
- Torres del Business District casi seguro MAL ATRIBUIDAS a Betania: `Betania / Santa Maria Court
  East`, `Betania / Santa Maria Signature`, `Betania / Santa Maria West` → Z1. (Son nombres de las
  torres del desarrollo de Juan Díaz; confirmar con el equipo antes de mover.)
- La joya: existe `Juan Díaz / Santa Maria Sigature` (**typo**: "Sigature") → Z2. Si estuviera bien
  escrita, colisionaría con la de Betania y el resolvedor devolvería `ambiguo` → **el bot habría
  preguntado el corregimiento, que es el comportamiento diseñado**. El typo derrotó al mecanismo de
  ambigüedad.

## Arreglo de DATA inmediato (SQL para aplicar, no requiere deploy)

```sql
-- 1) El Business District como alias explícito → Juan Díaz Z2 (la corrección que dio el cliente)
insert into sectores_entrega (corregimiento, barrio, alias, zona, validacion, barrio_norm, alias_norm)
values ('Juan Díaz', 'Santa María Business District',
        'santa maria business district, smbd, santa maria juan diaz, banco prival santa maria',
        'Z2 Este cercano', 'Alta',
        'santa maria business district',
        'santa maria business district, smbd, santa maria juan diaz, banco prival santa maria');

-- 2) El typo (tras confirmar): corregir "Sigature" → "Signature" en la fila de Juan Díaz
-- update sectores_entrega set barrio='Santa Maria Signature', barrio_norm='santa maria signature'
--  where corregimiento='Juan Díaz' and barrio_norm='santa maria sigature';

-- 3) Las 3 torres bajo Betania: CONFIRMAR con el equipo si existen en el barrio Santa María de
--    Betania o si son del Business District; si es lo segundo, moverlas a Juan Díaz / Z2.
--    (No se incluye el UPDATE a propósito: la geografía la confirma un humano, no el bot ni esta nota.)
```

Nota de ranking: la fila nueva tiene el nombre MÁS LARGO, y el resolvedor v2 desempata por longitud —
"santa maria business district" (exacto, 300 pts) le gana a "santa maria" (contenida) para las
consultas que traen el nombre completo. Verificar tras aplicar:
`select resolver_tarifa_v2('santa maria business district')->>'zona';` → debe dar `Z2 Este cercano`.

## La mejora de CÓDIGO acordada (para la rama que despliega, luego)

**"Google con más peso" hecho con las líneas rojas de la casa** (Google traduce, el polígono decide,
la tarifa nunca sale de Google):

1. **Verificación por cobertura**: cuando el diccionario devuelva `ok` PERO (`confianza <> 'Alta'` **o**
   los tokens matcheados cubren menos de ~la mitad de la dirección), correr TAMBIÉN la capa 3
   (geo-fallback → `zona_por_coordenadas`) y comparar. Si el polígono contradice al diccionario,
   **ganan las coordenadas** (un pin es evidencia; un nombre es una hipótesis — el mismo principio
   por el que Shipday prioriza el pin) y se registra `zona_conflicto {consulta, dicc, poligono}`.
2. **El diccionario que aprende — "copiando, mejorando y registrando"**: cada `zona_conflicto` y cada
   resolución exitosa de la capa 3 alimenta la cola que YA existe —
   **`promover_geocache_al_diccionario`** está en prod desde el 20-ago — para que la frase real del
   cliente ("santa maria business district") se promueva a alias con su zona verificada por polígono.
   Hoy esa promoción existe pero nada la nutre con los casos donde el diccionario ganó estando
   equivocado, que son exactamente los que más enseñan.
3. **Costo acotado**: la verificación extra solo corre en ok-dudosos (confianza Media/Baja o cobertura
   pobre) — no en cada dirección; el geocache y el tope diario de geo-fallback ya limitan el gasto.

Relación con el mapa del catálogo (diseño del 27-ago): es la misma forma de falla — **un match
confiado-pero-equivocado le gana a una capa de verificación que existía**. Allá el top-5 del MCP
tapaba a la réplica; acá el ok del diccionario tapa a Google. La regla general de la casa que ambos
casos piden: cuando una capa barata responde con confianza no-máxima, la capa de verificación corre
igual y el desacuerdo se registra.
