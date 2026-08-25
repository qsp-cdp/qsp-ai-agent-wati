-- HP DeskJet Ink Advantage 2975: la nota decía "ficha sin velocidades" y era cierto de la ficha que
-- teníamos. HP publica estas hojas por una API propia (pcb.inc.hp.com/dc/api/spec-sheet/…) y ahí sí
-- están, con un nivel de detalle que ninguna otra ficha de esta tabla trae.
--
-- Sobre la fuente: la única combinación de la API que responde es la hoja brasileña, cuyo número de
-- parte es AJ4Y4A y el nuestro es AJ4Y5A. NO es otro equipo: el documento dice "Número do modelo
-- 2975" y su propia imagen de catálogo se llama AJ4Y5A_…png. Son los códigos regionales del mismo
-- 2975. Se deja dicho aquí para que nadie repita el susto de la imageRUNNER 1643i.
--
-- Y es la primera fila de esta tabla donde carta y A4 dan lo MISMO: HP publica "Print speed black
-- (ISO, A4) 7,5 ppm" y "(ISO, letter) 7,5 ppm". Que coincidan es el dato, no la ausencia de dato.
--
-- El borrador va a la nota porque en esta gama es donde la gente compara: 20 ppm en negro contra los
-- 7,5 ISO. Y el volumen recomendado — 50 a 100 páginas AL MES — es lo más útil de todo el documento
-- para el asesor: si el cliente imprime más que eso, esta no es su impresora.
update public.impresoras_specs set
  ppm_negro = 7.5, ppm_color = 5.5,
  notas = replace(notas, 'ficha sin velocidades', 'ISO 7,5 ppm negro y 5,5 color — igual en carta que en A4')
          || '; en borrador sube a 20 ppm negro y 16 color (carta); copia 6 cpm ISO; foto 4x6 en 63 s; volumen recomendado por HP: 50 a 100 páginas AL MES',
  fuente_url = 'https://pcb.inc.hp.com/dc/api/spec-sheet/br-br/2102771898/pdf/AJ4Y4A.pdf',
  fuente_fecha = current_date, updated_at = now()
where modelo = 'HP DeskJet Ink Advantage 2975';
