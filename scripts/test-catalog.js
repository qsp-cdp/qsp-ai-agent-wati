// Quick connectivity check for the Shopify catalog integration.
//
// Usage (after filling SHOPIFY_* in .env):
//   npm run test:catalog -- taladro
//   npm run test:catalog            (uses "test" as the query)
//
// Confirms the store domain, API version, token and read_products scope all work,
// without starting the webhook server.
import 'dotenv/config';

import { isCatalogEnabled, searchProducts } from '../src/catalog.js';
import { config } from '../src/config.js';

const query = process.argv.slice(2).join(' ') || 'test';

if (!isCatalogEnabled()) {
  console.error('❌ Shopify no está configurado.');
  console.error('   Define SHOPIFY_STORE_DOMAIN y SHOPIFY_ADMIN_ACCESS_TOKEN en .env');
  process.exit(1);
}

console.log(`Tienda : ${config.shopify.domain} (API ${config.shopify.apiVersion})`);
console.log(`Consulta: "${query}"\n`);

try {
  const result = await searchProducts(query);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\n✅ Conexión OK — ${result.resultados.length} producto(s) encontrado(s).`);
} catch (err) {
  console.error(`\n❌ Error al consultar Shopify: ${err.message}`);
  console.error('   Revisa: dominio, SHOPIFY_API_VERSION, token Admin y permiso read_products,');
  console.error('   y que el host esté permitido por tu política de red (egress).');
  process.exit(1);
}
