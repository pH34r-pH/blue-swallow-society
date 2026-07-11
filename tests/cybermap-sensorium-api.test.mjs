import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const GREEN_TOKEN = 'greenfeed fixture token - not persisted';
const WARD_TOKEN = 'wardriver fixture token - not persisted';
const OPERATOR_TOKEN = 'operator fixture token - not persisted';

function request(server, options = {}) {
  const address = server.address();
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withSensoriumServer(fn) {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const server = createCybermapApiServer({
    tokenRecords: [
      {
        tokenHash: hashToken(GREEN_TOKEN),
        tokenId: 'greenfeed-public',
        clientType: 'greenfeed_worker',
        scopes: ['observations:write'],
        sourceClasses: ['green_public'],
      },
      {
        tokenHash: hashToken(WARD_TOKEN),
        tokenId: 'wardriver-alpha',
        clientType: 'wardriver_device',
        scopes: ['observations:write'],
        sourceClasses: ['owned_device'],
      },
      {
        tokenHash: hashToken(OPERATOR_TOKEN),
        tokenId: 'operator-admin',
        clientType: 'operator_admin',
        scopes: ['*'],
      },
    ],
    logger: () => {},
    now: () => new Date('2026-07-10T18:00:00.000Z'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function jsonPost(path, token, body) {
  return {
    method: 'POST',
    path,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

test('sensorium sessions validate canonical states and default to no raw-frame retention', async () => {
  await withSensoriumServer(async (server) => {
    const started = await request(server, jsonPost('/api/v1/sensorium/sessions', OPERATOR_TOKEN, {
      action: 'start',
      state: 'dream_suspension',
      source_ref: 'mosaic-text-channel',
      source_class: 'local_observation',
      location_basis: { kind: 'cyberspace_language_only' },
    }));

    assert.equal(started.status, 201);
    assert.equal(started.json.ok, true);
    assert.equal(started.json.session.state, 'dream_suspension');
    assert.equal(started.json.session.started_at, '2026-07-10T18:00:00.000Z');
    assert.equal(started.json.session.location_basis.kind, 'cyberspace_language_only');
    assert.equal(started.json.session.policy.raw_frame_retention, 'none');
    assert.equal(started.json.session.policy.pii_redaction_required, true);
    assert.equal(started.json.session.policy.read_only, true);
    assert.doesNotMatch(JSON.stringify(started.json), /raw_payload_ref|rawFrames|image_data/i);

    const invalid = await request(server, jsonPost('/api/v1/sensorium/sessions', OPERATOR_TOKEN, {
      action: 'start',
      state: 'astral_projection',
      source_ref: 'mosaic-text-channel',
      source_class: 'local_observation',
      location_basis: { kind: 'cyberspace_language_only' },
    }));
    assert.equal(invalid.status, 400);
    assert.equal(invalid.json.error.code, 'invalid_sensorium_state');

    const mismatchedLocation = await request(server, jsonPost('/api/v1/sensorium/sessions', OPERATOR_TOKEN, {
      action: 'start',
      state: 'dream_suspension',
      source_ref: 'mosaic-text-channel',
      source_class: 'local_observation',
      location_basis: { kind: 'feed_coordinates', lat: 47.61, lon: -122.33 },
    }));
    assert.equal(mismatchedLocation.status, 400);
    assert.equal(mismatchedLocation.json.error.code, 'invalid_location_basis');
  });
});

test('greenfeed jack-in is Green only and RaID sight is owned-device only even for operator tokens', async () => {
  await withSensoriumServer(async (server) => {
    const green = await request(server, jsonPost('/api/v1/sensorium/sessions', GREEN_TOKEN, {
      action: 'start',
      state: 'greenfeed_jack_in',
      source_ref: 'feed:wsdot:sea-099',
      source_class: 'green_public',
      location_basis: { kind: 'feed_coordinates', lat: 47.61, lon: -122.33 },
    }));
    assert.equal(green.status, 201);
    assert.equal(green.json.session.policy.green_only, true);
    assert.equal(green.json.session.source_class, 'green_public');

    const greyJackIn = await request(server, jsonPost('/api/v1/sensorium/sessions', OPERATOR_TOKEN, {
      action: 'start',
      state: 'greenfeed_jack_in',
      source_ref: 'feed:grey:forbidden',
      source_class: 'grey_enrichment',
      location_basis: { kind: 'feed_coordinates', lat: 47.61, lon: -122.33 },
    }));
    assert.equal(greyJackIn.status, 400);
    assert.equal(greyJackIn.json.error.code, 'invalid_source_class_for_state');

    const ownedRaid = await request(server, jsonPost('/api/v1/sensorium/sessions', WARD_TOKEN, {
      action: 'start',
      state: 'raid_sight',
      source_ref: 'device:raid-alpha',
      source_class: 'owned_device',
      location_basis: { kind: 'operator_foreground_gps', lat: 47.62, lon: -122.35, accuracy_meters: 8 },
    }));
    assert.equal(ownedRaid.status, 201);
    assert.equal(ownedRaid.json.session.policy.green_only, false);
    assert.equal(ownedRaid.json.session.source_class, 'owned_device');

    const rawSessionValue = await request(server, jsonPost('/api/v1/sensorium/sessions', WARD_TOKEN, {
      action: 'start',
      state: 'raid_sight',
      source_ref: 'device:raid-alpha',
      source_class: 'owned_device',
      location_basis: { kind: 'operator_foreground_gps', lat: 47.62, lon: -122.35, map_context: 'raw_payload_ref://private/raw-feed-still' },
    }));
    assert.equal(rawSessionValue.status, 400);
    assert.equal(rawSessionValue.json.error.code, 'private_visual_detail_forbidden');

    const greenRaid = await request(server, jsonPost('/api/v1/sensorium/sessions', OPERATOR_TOKEN, {
      action: 'start',
      state: 'raid_sight',
      source_ref: 'feed:public-camera',
      source_class: 'green_public',
      location_basis: { kind: 'feed_coordinates', lat: 47.61, lon: -122.33 },
    }));
    assert.equal(greenRaid.status, 400);
    assert.equal(greenRaid.json.error.code, 'invalid_source_class_for_state');
  });
});

test('sensorium sessions support explicit end actions without changing retained source policy', async () => {
  await withSensoriumServer(async (server) => {
    const started = await request(server, jsonPost('/api/v1/sensorium/sessions', WARD_TOKEN, {
      action: 'start',
      state: 'raid_sight',
      source_ref: 'device:raid-alpha',
      source_class: 'owned_device',
      location_basis: { kind: 'operator_foreground_gps', lat: 47.62, lon: -122.35 },
    }));
    assert.equal(started.status, 201);

    const crossSourceEnd = await request(server, jsonPost('/api/v1/sensorium/sessions', GREEN_TOKEN, {
      action: 'end',
      session_id: started.json.session.id,
    }));
    assert.equal(crossSourceEnd.status, 403);
    assert.equal(crossSourceEnd.json.error.code, 'source_scope_forbidden');

    const ended = await request(server, jsonPost('/api/v1/sensorium/sessions', WARD_TOKEN, {
      action: 'end',
      session_id: started.json.session.id,
    }));
    assert.equal(ended.status, 200);
    assert.equal(ended.json.session.id, started.json.session.id);
    assert.equal(ended.json.session.ended_at, '2026-07-10T18:00:00.000Z');
    assert.equal(ended.json.session.policy.raw_frame_retention, 'none');
  });
});

test('direct observations require claim caveats and reject certainty language or private visual payloads', async () => {
  await withSensoriumServer(async (server) => {
    const valid = {
      session_id: '00000000-0000-4000-8000-000000000011',
      observed_at: '2026-07-10T17:59:45.000Z',
      claim_ref: 'claim:protest-forming-near-x',
      source_ref: 'feed:wsdot:sea-099',
      source_class: 'green_public',
      location_basis: { kind: 'feed_coordinates', lat: 47.61, lon: -122.33, map_context: 'Seattle downtown camera' },
      visible_summary: 'The camera shows normal vehicle flow and no visible crowd at the frame edge.',
      not_visible_notes: ['camera angle excludes the west sidewalk', 'feed may lag by up to 90 seconds'],
      confidence: 'medium',
      caveats: ['single camera angle', 'night glare reduces detail'],
      evidence_links: ['https://example.invalid/greenfeed/wsdot/sea-099'],
      effect_on_claim: 'weakens',
    };

    const missingCaveats = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      caveats: [],
    }));
    assert.equal(missingCaveats.status, 400);
    assert.equal(missingCaveats.json.error.code, 'required_caveats_missing');

    const certainty = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      effect_on_claim: 'proved',
    }));
    assert.equal(certainty.status, 400);
    assert.equal(certainty.json.error.code, 'invalid_effect_on_claim');

    const privatePayload = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      private_visual_details: 'license plate ABC123 and a private face crop',
    }));
    assert.equal(privatePayload.status, 400);
    assert.equal(privatePayload.json.error.code, 'private_visual_detail_forbidden');

    const redactionOptOut = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      retention_policy: { pii_redaction_required: false },
    }));
    assert.equal(redactionOptOut.status, 400);
    assert.equal(redactionOptOut.json.error.code, 'invalid_retention_policy');

    const missingLocationKind = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      location_basis: { lat: 47.61, lon: -122.33 },
    }));
    assert.equal(missingLocationKind.status, 400);
    assert.equal(missingLocationKind.json.error.code, 'invalid_location_basis');

    const nestedRawPayload = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      location_basis: { ...valid.location_basis, raw_payload_ref: 'frame://private/raw-feed-still' },
    }));
    assert.equal(nestedRawPayload.status, 400);
    assert.equal(nestedRawPayload.json.error.code, 'private_visual_detail_forbidden');

    const nestedRawFrameUrl = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      location_basis: { ...valid.location_basis, raw_frame_url: 'https://camera.example.invalid/raw.jpg' },
    }));
    assert.equal(nestedRawFrameUrl.status, 400);
    assert.equal(nestedRawFrameUrl.json.error.code, 'private_visual_detail_forbidden');

    const nestedRawPayloadReferences = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      location_basis: { ...valid.location_basis, raw_payload_references: ['frame://private/raw-feed-still'] },
    }));
    assert.equal(nestedRawPayloadReferences.status, 400);
    assert.equal(nestedRawPayloadReferences.json.error.code, 'private_visual_detail_forbidden');

    const rawEvidenceLink = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      evidence_links: ['raw_payload_ref://private/raw-feed-still'],
    }));
    assert.equal(rawEvidenceLink.status, 400);
    assert.equal(rawEvidenceLink.json.error.code, 'private_visual_detail_forbidden');

    const privateFrameEvidenceLink = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, {
      ...valid,
      evidence_links: ['frame://private/raw-feed-still'],
    }));
    assert.equal(privateFrameEvidenceLink.status, 400);
    assert.equal(privateFrameEvidenceLink.json.error.code, 'private_visual_detail_forbidden');

    const recorded = await request(server, jsonPost('/api/v1/direct-observations', GREEN_TOKEN, valid));
    assert.equal(recorded.status, 201);
    assert.equal(recorded.json.ok, true);
    assert.equal(recorded.json.observation.claim_ref, valid.claim_ref);
    assert.equal(recorded.json.observation.source_ref, valid.source_ref);
    assert.equal(recorded.json.observation.observed_at, valid.observed_at);
    assert.equal(recorded.json.observation.location_basis.kind, 'feed_coordinates');
    assert.equal(recorded.json.observation.confidence, 'medium');
    assert.equal(recorded.json.observation.effect_on_claim, 'weakens');
    assert.deepEqual(recorded.json.observation.caveats, valid.caveats);
    assert.equal(recorded.json.observation.retention_policy.raw_frame_retention, 'none');
    assert.equal(recorded.json.observation.retention_policy.pii_redaction_required, true);
    assert.doesNotMatch(JSON.stringify(recorded.json), /raw_payload_ref|rawFrames|image_data|private_visual_details/i);
  });
});
