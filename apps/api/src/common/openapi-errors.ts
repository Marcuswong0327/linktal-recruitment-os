import { OpenAPIObject } from '@nestjs/swagger';
import { ErrorResponse } from './error-response.entity';

const ERROR_REF = {
  description: 'Error',
  content: {
    'application/json': {
      schema: { $ref: `#/components/schemas/${ErrorResponse.name}` },
    },
  },
};

/**
 * Attaches the standard error responses to every operation in the document, so
 * error responses are defined once instead of per endpoint. `ErrorResponse`
 * must be included in the document (pass it via `extraModels` to
 * createDocument). This flows into the generated frontend client, giving hooks
 * a typed error.
 *
 * - 400 + 500 on every operation.
 * - 404 only on operations whose path has a parameter (e.g. `/candidates/{id}`).
 */
export function addErrorResponses(document: OpenAPIObject): OpenAPIObject {
  const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    const hasParam = path.includes('{');

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      operation.responses ??= {};
      operation.responses['400'] ??= ERROR_REF;
      operation.responses['500'] ??= ERROR_REF;
      if (hasParam) operation.responses['404'] ??= ERROR_REF;
    }
  }

  return document;
}
