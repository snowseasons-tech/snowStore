export const HUBSPOT_PROPERTIES = ['email', 'company', 'phone', 'website'];
export class HubSpotError extends Error {
  constructor(message, retryable = false, retryAfter = 0) { super(message); this.retryable = retryable; this.retryAfter = retryAfter; }
}
async function call(token, path, method = 'GET', body) {
  let response;
  try {
    response = await fetch('https://api.hubapi.com' + path, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
  } catch { throw new HubSpotError('HubSpot did not confirm the request. Retry will check the email again.', true, 30); }
  if (response.status === 404 || response.status === 409) return { status: response.status };
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const header = response.headers.get('Retry-After');
    const delay = /^\d+$/.test(header || '') ? Math.max(1, Number(header)) : Number.isFinite(Date.parse(header)) ? Math.max(1, Math.ceil((Date.parse(header) - Date.now()) / 1000)) : 30;
    throw new HubSpotError(response.status === 401 || response.status === 403 ? 'HubSpot rejected the credential or contact permissions. Reconnect with contact read/write access.' : retryable ? 'HubSpot is rate limited or temporarily unavailable.' : 'HubSpot rejected the mapped contact fields. Review the mapping and email.', retryable, retryable ? delay : 0);
  }
  let data;
  try { data = await response.json(); } catch { throw new HubSpotError('HubSpot returned an incomplete result. Retry will check the email again.', true, 30); }
  return { status: response.status, data };
}
export async function verifyHubSpot(token) {
  const result = await call(token, '/crm/v3/objects/contacts?limit=1&properties=hs_object_id');
  if (!result.data || !Array.isArray(result.data.results)) throw new HubSpotError('HubSpot contact access could not be verified.');
}
export async function deliverHubSpot(token, properties) {
  const email = properties.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HubSpotError('A valid contact email is required.');
  const path = '/crm/v3/objects/contacts/' + encodeURIComponent(email) + '?idProperty=email';
  const payload = { properties: { ...properties, email } };
  // Lookup uses HubSpot's unique email property. PATCH preserves unmapped values
  // and never changes an existing contact's primary email. Lost create responses
  // are reconciled by looking up the same email on retry.
  const update = async found => {
    const changes = { ...properties }; delete changes.email;
    if (!Object.keys(changes).length) return found;
    return call(token, '/crm/v3/objects/contacts/' + encodeURIComponent(String(found.data.id)), 'PATCH', { properties: changes });
  };
  let result = await call(token, path);
  if (result.status === 404) {
    result = await call(token, '/crm/v3/objects/contacts', 'POST', payload);
    if (result.status === 409) {
      result = await call(token, path);
      if (result.data?.id) result = await update(result);
    }
  } else if (result.data?.id) result = await update(result);
  if (!result.data?.id || result.status === 404 || result.status === 409) throw new HubSpotError('HubSpot did not confirm a contact ID. Retry will check the email again.', true, 30);
  return { remoteId: String(result.data.id) };
}
