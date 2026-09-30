import auth from './api-access-token.cjs';
/** Maintenance action only. API principal determines audit actor; input cannot claim an owner. */
export async function orbitMaintenance({ store, token, action, failureId, reason, verify = auth.verifyApiAccessToken }) {
  if (!['status','reset'].includes(action)) throw new Error('orbit_action_invalid');
  const principal = await verify(token,action==='reset' ? 'World.Manage' : 'Owner.Read');
  if (action==='status') return store.read();
  return store.reset({ failureId,reason,actorId:principal.operatorId });
}
