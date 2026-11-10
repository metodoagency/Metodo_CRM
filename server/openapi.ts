import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { apiContracts } from '../shared/contracts.js';
extendZodWithOpenApi(z);
export function openapiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'OwnerSession', { type: 'apiKey', in: 'cookie', name: '__Host-metodo_session' });
  const error = z.object({ code: z.string(), fields: z.array(z.string()).optional() });
  for (const route of apiContracts.filter(route => !route.testOnly)) {
    const mutation = route.method !== 'get';
    let success = { description: route.success === 302 ? 'Top-level OAuth redirect' : 'Successful response' };
    if (route.csv) success = Object.assign({ description: 'CSV excluding sensitive fields' }, { content: { 'text/csv': { schema: z.string() } } });
    if (route.download) success = Object.assign({ description: 'Versioned document attachment' }, {
      content: Object.fromEntries(route.download.map(mime => [mime, { schema: z.string().openapi({ type: 'string', format: 'binary' }) }])),
    });
    registry.registerPath({
      method: route.method, path: route.path.replace(/:(\w+)/g, '{$1}'), security: route.public ? [] : [{ OwnerSession: [] }],
      request: {
        ...(route.params ? { params: route.params as z.ZodObject } : {}),
        ...(route.query ? { query: route.query as z.ZodObject } : {}),
        ...(route.body ? { body: { required: true, content: { 'application/json': { schema: route.body } } } } : {}),
        ...(route.multipart ? { body: { required: true, content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }) } } } } : {}),
        ...(mutation && !route.public ? { headers: z.object({ 'x-csrf-token': z.string().min(1), origin: z.url() }) } : {}),
      },
      responses: {
        [route.success ?? 200]: success,
        ...Object.fromEntries([[400, 'Invalid input'], [401, 'Unauthenticated'], [403, 'Owner, Origin or CSRF restriction'], [404, 'Not found'], [409, 'Stale version, stale preview or linked records'], [429, 'Rate limited'], [503, 'Service unavailable']].map(([status, description]) => [status, { description: String(description), content: { 'application/json': { schema: error } } }])),
      },
    });
  }
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({ openapi: '3.0.3', info: { title: 'Metodo CRM', version: '0.2.0' } });
}
