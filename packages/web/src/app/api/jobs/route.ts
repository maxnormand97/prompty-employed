import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { JobSubmissionSchema } from "@/lib/types";

/**
 * POST /api/jobs
 *
 * Stub: Validates the submission payload and returns a new jobId.
 * In production this triggers S3 uploads and a Step Functions execution.
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-internal-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  // Enforce API key only when INTERNAL_API_KEY is configured in the environment.
  // During local prototype development the env var is intentionally unset so
  // the form works without any setup from the developer.
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

  // Stub: generate a job ID — no AWS calls yet.
  const jobId = uuidv4();

  return NextResponse.json({ jobId }, { status: 201 });
}
