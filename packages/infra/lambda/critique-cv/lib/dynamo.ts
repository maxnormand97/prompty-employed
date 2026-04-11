import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { log } from "./log";

export async function setJobCritiquing(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string
): Promise<void> {
  log("info", "Setting job status to CRITIQUE", { jobId });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": { S: "CRITIQUE" } },
    })
  );
}

export async function setJobComplete(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  s3AnalysisKey: string,
  completedAt: string
): Promise<void> {
  log("info", "Setting job status to COMPLETE", { jobId, s3AnalysisKey, completedAt });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s, completedAt = :ca, s3Key = :sk",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "COMPLETE" },
        ":ca": { S: completedAt },
        ":sk": { S: s3AnalysisKey },
      },
    })
  );
}

export async function setJobFailed(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  log("info", "Setting job status to FAILED", { jobId, errorMessage });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: "SET #s = :s, errorMessage = :e",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: "FAILED" },
        ":e": { S: errorMessage },
      },
    })
  );
}
