import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { JobSubmissionSchema } from "@/lib/types";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const sfn = new SFNClient({ region: process.env.AWS_REGION });

/**
 * POST /api/jobs
 *
 * Validates the submission payload, uploads inputs to S3, writes a PENDING
 * DynamoDB record, and starts the Step Functions execution.
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;
  const isDev = process.env.NODE_ENV === "development";

  // In non-development environments, require INTERNAL_API_KEY to be configured
  // so that the endpoint does not become publicly accessible by accident.
  if (!expectedKey && !isDev) {
    return NextResponse.json(
      { error: "Server misconfigured: INTERNAL_API_KEY is not set" },
      { status: 500 }
    );
  }

  // Enforce API key whenever it is configured. In development, leaving
  // INTERNAL_API_KEY unset intentionally bypasses this check for easier setup.
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = JobSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const jobId = uuidv4();
  const s3ResumeKey = `inputs/${jobId}/resume.txt`;
  const s3JobDescKey = `inputs/${jobId}/job-desc.txt`;

  // 1. Upload raw inputs to S3
  await Promise.all([
    s3.send(
      new PutObjectCommand({
        Bucket: process.env.RESULTS_BUCKET_NAME,
        Key: s3ResumeKey,
        Body: parsed.data.masterResume,
        ContentType: "text/plain; charset=utf-8",
      })
    ),
    s3.send(
      new PutObjectCommand({
        Bucket: process.env.RESULTS_BUCKET_NAME,
        Key: s3JobDescKey,
        Body: parsed.data.jobDescription,
        ContentType: "text/plain; charset=utf-8",
      })
    ),
  ]);

  // 2. Create a PENDING record in DynamoDB
  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.JOBS_TABLE_NAME,
      Item: {
        jobId: { S: jobId },
        status: { S: "PENDING" },
        submittedAt: { S: new Date().toISOString() },
      },
    })
  );

  // 3. Start the Step Functions execution — jobId used as execution name for idempotency
  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      name: jobId,
      input: JSON.stringify({ jobId, s3ResumeKey, s3JobDescKey }),
    })
  );

  return NextResponse.json({ jobId }, { status: 201 });
}
