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
  const awsRegion = process.env.AWS_REGION;
  const tableName = process.env.JOBS_TABLE_NAME;
  if (!awsRegion || !tableName) {
    return NextResponse.json(
      { error: "Server misconfigured: missing required AWS environment variables" },
      { status: 500 }
    );
  }

  const { jobId } = await params;

  const { Item } = await dynamo.send(
    new GetItemCommand({
      TableName: tableName,
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
