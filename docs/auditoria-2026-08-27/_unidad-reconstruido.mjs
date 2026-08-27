// SHIM DE AUDITORIA (solo lectura del worktree): re-crea el helper que el commit 1cf664c olvido versionar.
const RE_UNIDAD =
  /(?:\S{1,10}\s+)?\b(?:apto|apartamento|apt|ofic|oficina|piso|nivel|casa|local|torre|of)\b\.?(?:\s*(?:#|n[º°o]\.?)?\s*[\wáéíóúñ.-]{1,12})?/gi;
export function detallesDeUnidad(...textos) {
  const vistos = new Set();
  const out = [];
  for (const t of textos) {
    const s = String(t ?? '').trim();
    if (!s) continue;
    for (const bruto of s.match(RE_UNIDAD) ?? []) {
      const limpio = bruto.replace(/\s+/g, ' ').replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim();
      if (limpio.length < 3) continue;
      const clave = limpio.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      out.push(limpio);
    }
  }
  return out.join(' · ');
}
