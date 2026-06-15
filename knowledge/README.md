# knowledge/ — Base de conocimiento del agente

Todo archivo `.md` en esta carpeta (excepto este `README.md`) se carga al iniciar
el agente, se concatena y se inyecta en el **prompt del sistema** de Claude. Es lo
que el agente "sabe" sobre QSP al responder por WhatsApp.

- Lo carga `src/knowledge.js` (`loadKnowledgeBase()`).
- El orden de carga es alfabético por nombre de archivo.
- Cámbialo y reinicia el agente para que tome los cambios.

## Migración desde `qsp-cdp-docs`

El contenido útil del repositorio de documentación
[`qsp-cdp/qsp-cdp-docs`](https://github.com/qsp-cdp/qsp-cdp-docs) vive aquí: es la
"lógica de negocio" que el agente debe preservar (qué ofrece QSP, horarios,
precios, FAQ, políticas, tono de marca, reglas de escalamiento).

Pasos para completar la migración:

1. Obtén acceso al contenido de `qsp-cdp-docs` (ver la nota en el `README.md`
   principal: el repo es privado y no fue accesible durante la configuración
   inicial).
2. Por cada documento relevante, crea o edita un archivo `.md` en esta carpeta.
   Puedes mantener la plantilla `qsp-knowledge-base.md` y rellenar sus secciones,
   o añadir archivos temáticos (p. ej. `servicios.md`, `faq.md`, `politicas.md`).
3. Escribe el contenido pensando en el cliente final y en español de Panamá.
4. Reinicia el agente (`npm start`) y prueba con mensajes reales.

## Buenas prácticas

- **No** incluyas secretos (tokens, contraseñas) aquí: este texto va al LLM.
- Sé específico con precios, horarios y políticas; el agente tiene instrucciones
  de **no inventar** y de escalar a un humano cuando la información no esté.
- Mantén los documentos cortos y bien titulados; facilita que el modelo
  encuentre la respuesta correcta.
