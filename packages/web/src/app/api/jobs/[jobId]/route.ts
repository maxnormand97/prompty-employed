import { NextResponse } from "next/server";

/**
 * GET /api/jobs/[jobId]
 *
 * Stub: returns a COMPLETE job record with mock data.
 * In production this reads from DynamoDB + S3.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Stub — always return COMPLETE so the polling path works during development.
  return NextResponse.json({ jobId, status: "COMPLETE" });
}
