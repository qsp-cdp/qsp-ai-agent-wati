-- Primera tanda del cierre de fuentes: las matriciales Epson.
--
-- Su `ppm_negro`/`ppm_color` ya estaban en NULL, y eso es lo CORRECTO, no un hueco: una matricial se
-- mide en caracteres por segundo (cps), no en páginas por minuto. Poner un ppm ahí sería inventar una
-- unidad. Así que aquí no se corrige velocidad: solo se ata la fuente que ya la respalda.
--
-- La ficha de la LX-350 deja ver por qué el número de portada no basta: anuncia "390 cps" y su propia
-- tabla aclara que eso es a 15 cpi — a 10 cpi son 347. El titular siempre es el mejor caso.
update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/Matriciales_LX-350_specs_spa.pdf?v=1732908324',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson LX-350' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/FX890II_EAI_ES.pdf?v=1732908443',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson FX-890 II' and fuente_url is null;

update public.impresoras_specs set
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/FX-2190ll_EAI.pdf?v=1732908670',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson FX-2190II' and fuente_url is null;

-- LQ-590II: la nota decía "584 cps a 12 cpi en borrador". La ficha oficial dice "hasta 584 cps" y NO
-- dice a cuántos cpi (su tabla se extrae en dos columnas y el número queda separado de su etiqueta).
-- El "a 12 cpi" no está respaldado por esta fuente, y la LX-350 acaba de mostrar que ese detalle
-- cambia la cifra. Se deja solo lo que la ficha afirma.
update public.impresoras_specs set
  notas = replace(notas, '584 cps a 12 cpi en borrador', 'hasta 584 cps (la ficha no precisa a cuántos cpi)'),
  fuente_url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/LQ-590II_EAI_ES.pdf?v=1732908727',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'Epson LQ-590II';

-- DFX-9000: su ficha NO sirve como fuente. El PDF usa una codificación no estándar y el texto salió
-- ilegible (991 caracteres de control en 6.639 = 14,9%): "Beneficios Principales" se lee, pero la
-- tabla de velocidad sale como ")VYYHKVY...LSVJPKHK". Se borra de fichas_pdf para que nadie la use
-- ni la vuelva a contar como disponible; la fila queda SIN fuente, que es lo honesto.
-- (ficha-pdf v2 ya rechaza este caso en origen, así que no vuelve a entrar.)
delete from public.fichas_pdf
where modelo = 'Epson DFX-9000'
  and url = 'https://cdn.shopify.com/s/files/1/0015/3128/1455/files/C11C605001_DFX9000.pdf?v=1732908617';
