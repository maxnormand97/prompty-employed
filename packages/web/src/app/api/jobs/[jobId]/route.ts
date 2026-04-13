import { NextResponse } from "next/server";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });

/**
 * GET /api/jobs/[jobId]
 *
 * Returns the current status of a job from DynamoDB.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.JOBS_TABLE_NAME,
      Key: { jobId: { S: jobId } },
    })
  );

  if (!Item) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobId,
    status: Item.status?.S ?? "PENDING",
    ...(Item.errorMessage?.S ? { errorMessage: Item.errorMessage.S } : {}),
  });
}
