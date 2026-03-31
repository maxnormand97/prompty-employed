// Unit tests for the shared Zod validation schemas.
// These run in isolation with no Next.js or browser dependencies.
import { JobSubmissionSchema, JobStatusSchema, JobRecordSchema } from './schemas';

describe('JobSubmissionSchema', () => {
  it('accepts a valid submission with minimum-length strings', () => {
    const result = JobSubmissionSchema.safeParse({
      masterResume: 'A'.repeat(200),
      jobDescription: 'B'.repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a masterResume shorter than 200 characters', () => {
    const result = JobSubmissionSchema.safeParse({
      masterResume: 'too short',
      jobDescription: 'B'.repeat(50),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a jobDescription shorter than 50 characters', () => {
    const result = JobSubmissionSchema.safeParse({
      masterResume: 'A'.repeat(200),
      jobDescription: 'tiny',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a masterResume exceeding 15 000 characters', () => {
    const result = JobSubmissionSchema.safeParse({
      masterResume: 'A'.repeat(15001),
      jobDescription: 'B'.repeat(50),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty object (both fields missing)', () => {
    const result = JobSubmissionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('JobStatusSchema', () => {
  it.each(['PENDING', 'DRAFTING', 'CRITIQUE', 'COMPLETE', 'FAILED'])(
    'accepts the valid status "%s"',
    (status) => {
      expect(JobStatusSchema.safeParse(status).success).toBe(true);
    }
  );

  it('rejects an unknown status string', () => {
    expect(JobStatusSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('rejects a lower-case variant of a valid status', () => {
    expect(JobStatusSchema.safeParse('pending').success).toBe(false);
  });
});

describe('JobRecordSchema', () => {
  const base = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    submittedAt: new Date().toISOString(),
    status: 'PENDING',
  };

  it('accepts a minimal valid record', () => {
    expect(JobRecordSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a record with an invalid UUID', () => {
    const result = JobRecordSchema.safeParse({ ...base, jobId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a record with an invalid status', () => {
    const result = JobRecordSchema.safeParse({ ...base, status: 'RUNNING' });
    expect(result.success).toBe(false);
  });
});
