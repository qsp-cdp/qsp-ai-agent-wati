// Real-time product catalog backed by the Shopify Admin GraphQL API.
//
// Exposes a single LLM tool, `buscar_productos`, that the agent calls when a
// customer asks about price, availability or whether a product exists. If Shopify
// credentials are not configured the tool is simply not offered and the agent
// behaves as before (no price/stock answers).

import { config } from './config.js';

export function isCatalogEnabled() {
  return Boolean(config.shopify.domain && config.shopify.token);
}

const SEARCH_QUERY = `
  query Search($q: String!) {
    shop { currencyCode }
    products(first: 5, query: $q) {
      edges {
        node {
          title
          status
          onlineStoreUrl
          variants(first: 10) {
            edges {
              node {
                title
                sku
                price
                availableForSale
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

async function shopifyGraphQL(query, variables) {
  const { domain, token, apiVersion } = config.shopify;
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors).slice(0, 200)}`);
  }
  return json.data;
}

/**
 * Search the catalog by free text and return normalised, compact results
 * (kept small to limit tokens) with live price and stock.
 */
export async function searchProducts(query) {
  const data = await shopifyGraphQL(SEARCH_QUERY, { q: query });
  const moneda = data?.shop?.currencyCode || null;
  const resultados = (data?.products?.edges || []).map(({ node }) => ({
    producto: node.title,
    estado: node.status,
    url: node.onlineStoreUrl || null,
    variantes: (node.variants?.edges || []).map(({ node: v }) => ({
      variante: v.title,
      sku: v.sku || null,
      precio: v.price,
      disponible: v.availableForSale,
      existencias: v.inventoryQuantity,
    })),
  }));
  return { moneda, resultados };
}

// ── LLM tool surface ─────────────────────────────────────────────────────────

export function getCatalogTools() {
  if (!isCatalogEnabled()) return [];
  return [
    {
      name: 'buscar_productos',
      description:
        'Busca productos en el catálogo de Shopify de QSP por nombre o palabra clave y ' +
        'devuelve precio y disponibilidad/stock EN TIEMPO REAL. Úsala SIEMPRE que el ' +
        'cliente pregunte por el precio, la disponibilidad, las existencias o si se vende ' +
        'un producto. No respondas precios ni stock de memoria.',
      input_schema: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description: 'Nombre o palabras clave del producto, p. ej. "taladro" o "camisa azul talla M".',
          },
        },
        required: ['consulta'],
      },
    },
  ];
}

/**
 * Execute a catalog tool call. Always resolves to a string (JSON) — errors are
 * returned as { error } so the model can apologise / offer a human gracefully.
 */
export async function runCatalogTool(name, input) {
  try {
    if (name === 'buscar_productos') {
      const result = await searchProducts(String(input?.consulta || ''));
      return JSON.stringify(result);
    }
    return JSON.stringify({ error: `herramienta desconocida: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}
