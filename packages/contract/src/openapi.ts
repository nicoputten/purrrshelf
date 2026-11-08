import { z } from 'zod';
import { ErrorResponse } from './errors.js';
import { API_PREFIX, endpoints, type Endpoint } from './endpoints.js';

type JsonObject = Record<string, unknown>;

/** Builds the OpenAPI 3.1 document from the endpoint map. */
export function buildOpenApi(version: string): JsonObject {
  const uri = (id: string): string => `#/components/schemas/${id}`;
  const options = { target: 'draft-2020-12', io: 'output', unrepresentable: 'any', uri } as const;
  const usedIds = new Set<string>();
  const ref = (schema: z.ZodType): JsonObject => {
    const id = schema.meta()?.id;
    if (typeof id === 'string') {
      usedIds.add(id);
      return { $ref: uri(id) };
    }
    return strip(z.toJSONSchema(schema, options) as JsonObject);
  };

  const paths: Record<string, JsonObject> = {};
  for (const [name, ep] of Object.entries(endpoints) as [string, Endpoint][]) {
    const op: JsonObject = {
      operationId: name,
      summary: ep.summary,
      responses: {
        [String(ep.status)]: {
          description: 'OK',
          content: { 'application/json': { schema: ref(ep.response) } },
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: ref(ErrorResponse) } },
        },
      },
    };
    if (ep.auth) op.security = [{ bearer: [] }];
    if (ep.body) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: ref(ep.body) } },
      };
    }
    const path = `${API_PREFIX}${ep.path}`.replace(/:(\w+)/g, '{$1}');
    paths[path] = { ...(paths[path] ?? {}), [ep.method.toLowerCase()]: op };
  }

  const all = z.toJSONSchema(z.globalRegistry, options).schemas as Record<string, JsonObject>;
  const components = Object.fromEntries(
    [...usedIds].sort().map((id) => [id, strip(all[id] ?? {})]),
  );

  return {
    openapi: '3.1.0',
    info: { title: 'Purrshelf broker API', version },
    paths,
    components: {
      schemas: components,
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
}

function strip(schema: JsonObject): JsonObject {
  const { $schema: _s, $id: _id, id: _legacyId, ...rest } = schema;
  return rest;
}
