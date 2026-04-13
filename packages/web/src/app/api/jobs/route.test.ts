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

// Mock AWS SDK clients so real credentials/network are never needed in tests.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutObjectCommand: jest.fn((input: unknown) => input),
  DeleteObjectsCommand: jest.fn((input: unknown) => input),
}));
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  PutItemCommand: jest.fn((input: unknown) => input),
  UpdateItemCommand: jest.fn((input: unknown) => input),
}));
jest.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
  StartExecutionCommand: jest.fn((input: unknown) => input),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

const MockS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const MockDynamoDBClient = DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>;
const MockSFNClient = SFNClient as jest.MockedClass<typeof SFNClient>;

// Capture `send` mock references from the singleton client instances created
// when the route module was first imported. We save direct references here so
// they remain valid even after jest.clearAllMocks() wipes mock.results.
const s3Send = (MockS3Client.mock.results[0].value as { send: jest.Mock }).send;
const dynamoSend = (MockDynamoDBClient.mock.results[0].value as { send: jest.Mock }).send;
const sfnSend = (MockSFNClient.mock.results[0].value as { send: jest.Mock }).send;

// A payload that satisfies all JobSubmissionSchema constraints.
const VALID_PAYLOAD = {
  masterResume: 'A'.repeat(200),
  jobDescription: 'B'.repeat(50),
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TEST_ENV = {
  INTERNAL_API_KEY: 'test-key',
  AWS_REGION: 'eu-west-1',
  RESULTS_BUCKET_NAME: 'test-bucket',
  JOBS_TABLE_NAME: 'test-table',
  STATE_MACHINE_ARN: 'arn:aws:states:eu-west-1:000000000000:stateMachine:test',
};

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

function makeAuthRequest(body: unknown): NextRequest {
  return makeRequest(body, { 'x-internal-api-key': 'test-key' });
}

describe('POST /api/jobs', () => {
  beforeEach(() => {
    Object.assign(process.env, TEST_ENV);
    // Clear constructor call history on command mocks.
    jest.mocked(PutObjectCommand).mockClear();
    jest.mocked(DeleteObjectsCommand).mockClear();
    jest.mocked(PutItemCommand).mockClear();
    jest.mocked(UpdateItemCommand).mockClear();
    jest.mocked(StartExecutionCommand).mockClear();
    // Reset send behaviour to the default (succeed with an empty response).
    s3Send.mockReset().mockResolvedValue({});
    dynamoSend.mockReset().mockResolvedValue({});
    sfnSend.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    for (const key of Object.keys(TEST_ENV)) {
      delete process.env[key];
    }
  });

  it('returns 201 with a UUID jobId for a valid payload', async () => {
    const res = await POST(makeAuthRequest(VALID_PAYLOAD));
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
      makeAuthRequest({ masterResume: 'short', jobDescription: 'B'.repeat(50) })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.issues[0].field).toBe('masterResume');
  });

  it('returns 400 with field-level issues when jobDescription is too short', async () => {
    const res = await POST(
      makeAuthRequest({ masterResume: 'A'.repeat(200), jobDescription: 'tiny' })
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

  describe('AWS env var validation', () => {
    it.each([
      'AWS_REGION',
      'RESULTS_BUCKET_NAME',
      'JOBS_TABLE_NAME',
      'STATE_MACHINE_ARN',
    ])('returns 500 when %s is missing', async (varName) => {
      delete process.env[varName];
      const res = await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toMatch(/misconfigured/i);
    });
  });

  describe('AWS integration — happy path', () => {
    it('uploads both inputs to the configured S3 bucket', async () => {
      await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(jest.mocked(PutObjectCommand)).toHaveBeenCalledTimes(2);
      for (const [input] of jest.mocked(PutObjectCommand).mock.calls) {
        expect(input).toMatchObject({ Bucket: 'test-bucket' });
      }
    });

    it('writes a PENDING record to the configured DynamoDB table', async () => {
      await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(jest.mocked(PutItemCommand)).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-table',
          Item: expect.objectContaining({ status: { S: 'PENDING' } }),
        })
      );
    });

    it('starts a Step Functions execution with the configured state machine ARN', async () => {
      await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(jest.mocked(StartExecutionCommand)).toHaveBeenCalledWith(
        expect.objectContaining({ stateMachineArn: TEST_ENV.STATE_MACHINE_ARN })
      );
    });

    it('uses the same jobId for S3 keys, DynamoDB record, and SFN execution name', async () => {
      const res = await POST(makeAuthRequest(VALID_PAYLOAD));
      const { jobId } = await res.json() as { jobId: string };

      for (const [input] of jest.mocked(PutObjectCommand).mock.calls) {
        expect((input as { Key: string }).Key).toContain(jobId);
      }
      expect(jest.mocked(PutItemCommand).mock.calls[0][0]).toMatchObject({
        Item: expect.objectContaining({ jobId: { S: jobId } }),
      });
      expect(jest.mocked(StartExecutionCommand).mock.calls[0][0]).toMatchObject({
        name: jobId,
      });
    });
  });

  describe('SFN failure compensation', () => {
    beforeEach(() => {
      sfnSend.mockRejectedValue(new Error('SFN unavailable'));
    });

    it('returns 500 when StartExecution fails', async () => {
      const res = await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(res.status).toBe(500);
    });

    it('marks the DynamoDB record as FAILED when StartExecution fails', async () => {
      await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(jest.mocked(UpdateItemCommand)).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: 'test-table',
          ExpressionAttributeValues: expect.objectContaining({
            ':s': { S: 'FAILED' },
          }),
        })
      );
    });

    it('deletes the S3 input objects when StartExecution fails', async () => {
      await POST(makeAuthRequest(VALID_PAYLOAD));
      expect(jest.mocked(DeleteObjectsCommand)).toHaveBeenCalledWith(
        expect.objectContaining({ Bucket: 'test-bucket' })
      );
    });
  });
});
