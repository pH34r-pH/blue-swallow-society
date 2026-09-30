import { boundedText, entityError } from './entity-contract.mjs';

/** Trusted integration seam, NOT an HTTP route or an authentication implementation. */
export function createEntityService({ store, authorizeOwner, authorizeMutation } = {}) {
  return {
    async handle(request) {
      const verifier = ['preview', 'mutate'].includes(request.operation) ? authorizeMutation : authorizeOwner;
      if (typeof verifier !== 'function') throw entityError('forbidden', 403);
      const owner = await verifier(request);
      if (owner?.exact_owner !== true) throw entityError('forbidden', 403);
      try { boundedText(owner.actor_id, 256); } catch { throw entityError('forbidden', 403); }
      switch (request.operation) {
        case 'list': return store.list(request.input);
        case 'detail': return store.detail(request.input);
        case 'preview': return store.preview({ actor_id: owner.actor_id, command: request.input });
        case 'mutate': return store.mutate({ actor_id: owner.actor_id, command: request.input });
        default: throw entityError('invalid_entity_operation');
      }
    },
  };
}
