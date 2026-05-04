// Unit tests for the shared Zod validation schemas.
// These run in isolation with no Next.js or browser dependencies.
import {
  JobSubmissionSchema,
  JobStatusSchema,
  JobRecordSchema,
  ResumeRecordSchema,
  StepFunctionInputSchema,
  TailoredOutputSchema,
} from './schemas';

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

describe('JobSubmissionSchema — companyInfo (optional)', () => {
  const base = {
    masterResume: 'A'.repeat(200),
    jobDescription: 'B'.repeat(50),
  };

  it('accepts a submission without companyInfo', () => {
    expect(JobSubmissionSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a submission with a valid companyInfo string', () => {
    const result = JobSubmissionSchema.safeParse({
      ...base,
      selectedResumeId: 'resume-123',
      resumeName: 'Platform resume',
      resumeSource: 'upload',
      resumeFileType: 'pdf',
      resumeMimeType: 'application/pdf',
      companyInfo: 'Acme Corp — builds best-in-class widgets.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects companyInfo exceeding 5 000 characters', () => {
    const result = JobSubmissionSchema.safeParse({
      ...base,
      companyInfo: 'C'.repeat(5001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('companyInfo');
    }
  });

  it('accepts companyInfo at exactly the 5 000 character limit', () => {
    expect(
      JobSubmissionSchema.safeParse({ ...base, companyInfo: 'C'.repeat(5000) }).success
    ).toBe(true);
  });
});

describe('StepFunctionInputSchema', () => {
  const base = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    s3ResumeKey: 'inputs/abc/resume.txt',
    s3JobDescKey: 'inputs/abc/job-desc.txt',
  };

  it('accepts a valid input without s3CompanyInfoKey', () => {
    expect(StepFunctionInputSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a valid input with s3CompanyInfoKey', () => {
    const result = StepFunctionInputSchema.safeParse({
      ...base,
      selectedResumeId: 'resume-123',
      resumeName: 'Platform resume',
      resumeSource: 'upload',
      resumeFileType: 'pdf',
      resumeMimeType: 'application/pdf',
      s3CompanyInfoKey: 'inputs/abc/company-info.txt',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an input with a non-UUID jobId', () => {
    expect(StepFunctionInputSchema.safeParse({ ...base, jobId: 'not-a-uuid' }).success).toBe(
      false
    );
  });
});

describe('ResumeRecordSchema', () => {
  const base = {
    id: 'resume-123',
    name: 'Platform Engineer Resume',
    text: 'A'.repeat(200),
    source: 'upload',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('accepts a valid resume record', () => {
    expect(ResumeRecordSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a resume record with lastUsedAt', () => {
    expect(
      ResumeRecordSchema.safeParse({
        ...base,
        lastUsedAt: new Date().toISOString(),
      }).success
    ).toBe(true);
  });

  it('rejects a resume record with too-short text', () => {
    expect(ResumeRecordSchema.safeParse({ ...base, text: 'short' }).success).toBe(false);
  });
});

describe('TailoredOutputSchema — companySummary (optional)', () => {
  const base = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    completedAt: new Date().toISOString(),
    tailoredCV: 'cv content',
    coverLetter: 'letter content',
    critiqueNotes: 'notes',
    fitScore: 80,
    fitRationale: 'good fit',
    likelihoodScore: 65,
    likelihoodRationale: 'likely',
    suggestedImprovements: ['improve A'],
    gapAnalysis: [],
  };

  it('accepts a result without companySummary', () => {
    expect(TailoredOutputSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a result with a valid companySummary string', () => {
    const result = TailoredOutputSchema.safeParse({
      ...base,
      companySummary: 'Key things to keep in mind about this company.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companySummary).toBe('Key things to keep in mind about this company.');
    }
  });

  it('rejects a result with a fitScore out of range', () => {
    expect(TailoredOutputSchema.safeParse({ ...base, fitScore: 101 }).success).toBe(false);
  });

  it('accepts decision-grade optional fields', () => {
    const result = TailoredOutputSchema.safeParse({
      ...base,
      redFlags: [
        {
          type: 'RECENCY_GAP',
          severity: 'HIGH',
          description: 'Primary stack has not been used recently enough for this role level.',
        },
      ],
      hardFloorTriggers: ['HF_DOMAIN_YEARS_SHORTFALL'],
      requirementsCoverage: [
        {
          requirement: 'sql',
          status: 'PARTIAL',
          evidenceSummary: 'SQL last used 3 years ago.',
        },
      ],
      confidenceScore: 64,
      normalizationSummary: {
        seniority: 'SENIOR',
        requiredYears: 5,
        mandatoryStack: ['typescript', 'sql'],
        complianceSignals: ['pci-dss'],
        domainSignals: ['fintech'],
        scaleSignals: ['distributed systems'],
        stabilitySensitiveWording: ['fast-paced'],
        degreeRequirement: 'MASTERS',
        uncertainLines: ['Nice to have: Rust'],
      },
      policyAdjustments: [
        {
          ruleId: 'PENALTY_PRIMARY_STACK_NOT_RECENT',
          penalty: 15,
          reason: 'Primary stack appears only in older experience blocks.',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('TailoredOutputSchema — NO_FIT results', () => {
  const noFitBase = {
    jobId: '123e4567-e89b-12d3-a456-426614174000',
    completedAt: new Date().toISOString(),
    fitVerdict: 'NO_FIT',
    fitReason: 'Candidate lacks required 3D modelling experience.',
    critiqueNotes: 'Automated pre-screening determined the candidate does not have a sufficient basis to apply.',
    fitScore: 5,
    fitRationale: 'The candidate lacks the minimum qualifications for this role.',
    likelihoodScore: 5,
    likelihoodRationale: 'Would not pass initial screening.',
    suggestedImprovements: [],
    gapAnalysis: [],
  };

  it('accepts a NO_FIT result without tailoredCV or coverLetter', () => {
    expect(TailoredOutputSchema.safeParse(noFitBase).success).toBe(true);
  });

  it('accepts a FIT result with fitVerdict set to FIT', () => {
    const fitResult = {
      ...noFitBase,
      fitVerdict: 'FIT',
      tailoredCV: 'cv content',
      coverLetter: 'letter content',
    };
    expect(TailoredOutputSchema.safeParse(fitResult).success).toBe(true);
  });

  it('accepts a result without fitVerdict (legacy records without pre-screen)', () => {
    const legacy = {
      ...noFitBase,
      fitVerdict: undefined,
      tailoredCV: 'cv content',
      coverLetter: 'letter content',
    };
    expect(TailoredOutputSchema.safeParse(legacy).success).toBe(true);
  });

  it('rejects an unknown fitVerdict value', () => {
    expect(
      TailoredOutputSchema.safeParse({ ...noFitBase, fitVerdict: 'MAYBE' }).success
    ).toBe(false);
  });

  it('stores fitReason when provided', () => {
    const result = TailoredOutputSchema.safeParse(noFitBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fitReason).toBe('Candidate lacks required 3D modelling experience.');
      expect(result.data.tailoredCV).toBeUndefined();
      expect(result.data.coverLetter).toBeUndefined();
    }
  });
});
