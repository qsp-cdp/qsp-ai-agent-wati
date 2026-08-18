# Plantillas de correo del copiloto

Maquetas de los tres correos que manda el vigilante, para revisar el formato antes de
llevarlo al código. Se editan visualmente en el lienzo publicado; estas son las fuentes.

| archivo | correo |
|---|---|
| `Main.dc.html` | 🚨 Sistema caído — inmediato |
| `Desatencion.dc.html` | ⚠️ Cliente esperando con pago o reclamo — inmediato |
| `Resumen.dc.html` | 🟢🟡🔴 Cómo va el día — 11:00, 2:30pm y 4:00pm |

**Restricción que manda sobre el diseño:** el HTML de correo no admite flexbox, grid,
tipografías externas ni CSS moderno — Gmail y Outlook los descartan. Todo va con tablas,
estilos en línea, tipografías del sistema y 540 px de ancho útil.

Dos decisiones que conviene no deshacer:

- **El color vive en bordes y fondos claros, nunca en bandas oscuras.** El modo oscuro de
  Gmail invierte los fondos sin avisar y un encabezado de color sólido queda ilegible.
- **El teléfono va grande y en su propia línea.** Se toca para copiarlo y buscar al cliente
  en WATI; dentro de una tabla de cinco columnas eso no funciona en el celular.

El HTML sembrado del lienzo (~2 MB) no se versiona: se regenera con el helper de `/design`
a partir de estos archivos y de `canvas.json`.
