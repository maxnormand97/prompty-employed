/**
 * @jest-environment node
 *
 * Integration tests for the POST /api/jobs route handler.
 *
 * Next.js App Router handlers are plain async functions that accept a
 * NextRequest and return a NextResponse, so they can be called directly
 * without starting an HTTP server. This replaces supertest's role for
 * App Router projects and gives the same white-box integration coverage.
 */
import { NextRequest } from 'next/server';
import { POST } from './route';

// A payload that satisfies all JobSubmissionSchema constraints.
const VALID_PAYLOAD = {
  masterResume: 'A'.repeat(200),
  jobDescription: 'B'.repeat(50),
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('POST /api/jobs', () => {
  // Provide a known API key for the happy-path tests so the route does not
  // return 500 ("server misconfigured") when running under Jest (NODE_ENV=test).
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it('returns 201 with a UUID jobId for a valid payload', async () => {
    const res = await POST(
      makeRequest(VALID_PAYLOAD, { 'x-internal-api-key': 'test-key' })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.jobId).toMatch(UUID_RE);
  });

  it('returns 403 when the x-internal-api-key header is absent', async () => {
    const res = await POST(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the API key is incorrect', async () => {
    const res = await POST(
      makeRequest(VALID_PAYLOAD, { 'x-internal-api-key': 'wrong-key' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 for a malformed (non-JSON) body', async () => {
    const req = new NextRequest('http://localhost/api/jobs', {
      method: 'POST',
      body: 'not-valid-json',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': 'test-key',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 with field-level issues when masterResume is too short', async () => {
    const res = await POST(
      makeRequest(
        { masterResume: 'short', jobDescription: 'B'.repeat(50) },
        { 'x-internal-api-key': 'test-key' }
      )
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues[0].field).toBe('masterResume');
  });

  it('returns 400 with field-level issues when jobDescription is too short', async () => {
    const res = await POST(
      makeRequest(
        { masterResume: 'A'.repeat(200), jobDescription: 'tiny' },
        { 'x-internal-api-key': 'test-key' }
      )
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues[0].field).toBe('jobDescription');
  });

  describe('when INTERNAL_API_KEY is not configured', () => {
    it('returns 500 in non-development environments (server misconfigured)', async () => {
      delete process.env.INTERNAL_API_KEY;
      // NODE_ENV is 'test' in Jest, so isDev === false → 500 is expected.
      const res = await POST(makeRequest(VALID_PAYLOAD));
      expect(res.status).toBe(500);
    });
  });
});
