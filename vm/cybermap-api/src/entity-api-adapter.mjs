import commonAuth from './api-access-token.cjs';
import { createEntityService } from './entity-service.mjs';

/** Scoped adapter using the canonical validator and its verified immutable principal. */
export function createEntityApiAdapter({ store, verifyApiAccessToken = commonAuth.verifyApiAccessToken } = {}) {
  const authorize = (scope) => async (request) => {
    const principal = await verifyApiAccessToken(commonAuth.bearerToken(request), scope);
    return { exact_owner: true, actor_id: principal.operatorId };
  };
  return createEntityService({ store,
    authorizeOwner: authorize('Owner.Read'), authorizeMutation: authorize('Entities.Write') });
}
