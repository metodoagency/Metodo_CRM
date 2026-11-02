import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { clubInput, playerInput, personInput, requestInput, suggestionInput, relationInput } from '../shared/domain.js';
extendZodWithOpenApi(z);
export function openapiDocument() {
  const registry = new OpenAPIRegistry();
  const routes = [
    ['/api/clubs', clubInput], ['/api/players', playerInput], ['/api/people', personInput], ['/api/requests', requestInput], ['/api/suggestions', suggestionInput], ['/api/relations', relationInput],
  ] as const;
  for (const [path, schema] of routes) registry.registerPath({ method: 'post', path, request: { body: { content: { 'application/json': { schema } } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Invalid input' }, 401: { description: 'Unauthenticated' }, 403: { description: 'CSRF or owner restriction' } } });
  for (const path of ['/api/me', '/api/settings', '/api/overview', '/api/clubs', '/api/players', '/api/people', '/api/requests', '/api/proposals', '/api/trash']) registry.registerPath({ method: 'get', path, responses: { 200: { description: 'Owner-scoped response' }, 401: { description: 'Unauthenticated' } } });
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({ openapi: '3.0.3', info: { title: 'Metodo CRM', version: '0.1.0' } });
}
