import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { log } from "./log";

export async function setJobStatus(
  dynamo: DynamoDBClient,
  tableName: string,
  jobId: string,
  status: "DRAFTING" | "FAILED",
  errorMessage?: string
): Promise<void> {
  log("info", "Setting job status", { jobId, status, errorMessage });
  await dynamo.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { jobId: { S: jobId } },
      UpdateExpression: errorMessage
        ? "SET #s = :s, errorMessage = :e"
        : "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":s": { S: status },
        ...(errorMessage ? { ":e": { S: errorMessage } } : {}),
      },
    })
  );
}
