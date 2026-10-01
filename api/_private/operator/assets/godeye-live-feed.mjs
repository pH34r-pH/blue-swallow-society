import { isLiveWigleSnapshot, parseWiglePayload } from './wigle.mjs';

const DEFAULT_SOURCE = 'cybermap-postgis';

export function createGodeyeLiveFeedClient({
  endpoint = '/api/operator-signals',
  fetchImpl = fetch,
  getHeaders = () => ({}),
  buildRequestPayload = (location) => location,
  source = DEFAULT_SOURCE,
} = {}) {
  return Object.freeze({ read });

  async function read(location) {
    const requestPayload = buildRequestPayload(location);
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await readResponsePayload(response);
    const current = payload?.live === true || isLiveWigleSnapshot(payload);
    const parsed = parseWiglePayload(payload, { source });
    const sourceLabel = parsed.source || payload?.source || source;
    const message = current
      ? `Godeye Cybermap viewport connected from ${sourceLabel}.`
      : `Godeye Cybermap viewport from ${sourceLabel} returned no recent observations.`;

    return Object.freeze({ current, parsed, sourceLabel, message });
  }
}

async function readResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
