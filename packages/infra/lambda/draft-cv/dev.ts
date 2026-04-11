/**
 * Local development entry point for DraftCVLambda.
 *
 * Runs the Lambda logic against local test-data files using in-memory stubs
 * for S3, DynamoDB and Bedrock — zero AWS calls, zero cost.
 *
 * Usage:  pnpm start   (or: ts-node dev.ts)
 */

import * as fs from "fs";
import * as path from "path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

import { log } from "./lib/log";
import { DraftCVClients, DraftCVEnv, DraftCVInput } from "./lib/types";
import { runDraftCV } from "./core";

export async function main(): Promise<void> {
  const testDataDir = path.join(__dirname, "../../test-data");
  const resume = fs.readFileSync(path.join(testDataDir, "sample-resume.txt"), "utf-8");
  const jobDesc = fs.readFileSync(path.join(testDataDir, "sample-job-desc.txt"), "utf-8");

  const mockEvent: DraftCVInput = {
    jobId: "local-test-job-001",
    s3ResumeKey: "inputs/local-test-job-001/resume.txt",
    s3JobDescKey: "inputs/local-test-job-001/job-desc.txt",
  };

  const mockEnv: DraftCVEnv = {
    bedrockModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
    jobsTableName: "PromptlyEmployedJobs",
    resultsBucketName: "PromptlyEmployedResults",
  };

  // In-memory S3 store seeded with local test data
  const s3Store: Record<string, string> = {
    [mockEvent.s3ResumeKey]: resume,
    [mockEvent.s3JobDescKey]: jobDesc,
  };

  const s3Stub = {
    send: async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        const key = (command as GetObjectCommand).input.Key!;
        const content = s3Store[key];
        if (!content) throw new Error(`Mock S3: key not found: ${key}`);
        return { Body: { transformToString: (_enc: string) => Promise.resolve(content) } };
      }
      if (command instanceof PutObjectCommand) {
        const { Key, Body } = (command as PutObjectCommand).input;
        s3Store[Key!] = Body as string;
        log("info", "[Mock S3] PutObject", { key: Key, bytes: (Body as string).length });
        return {};
      }
      throw new Error(`Mock S3: unhandled command type`);
    },
  } as unknown as S3Client;

  const dynamoStub = {
    send: async (command: unknown) => {
      if (command instanceof UpdateItemCommand) {
        const { Key, ExpressionAttributeValues } = (command as UpdateItemCommand).input;
        log("info", "[Mock DynamoDB] UpdateItem", {
          key: Key,
          status: ExpressionAttributeValues?.[":s"]?.S,
        });
        return {};
      }
      throw new Error(`Mock DynamoDB: unhandled command type`);
    },
  } as unknown as DynamoDBClient;

  const DELIMITER = "---COVER_LETTER_START---";
  const bedrockStub = {
    send: async (_command: unknown) => {
      const tailoredCV = fs.readFileSync(
        path.join(testDataDir, "sample-tailored-cv.txt"),
        "utf-8"
      );
      const coverLetter = fs.readFileSync(
        path.join(testDataDir, "sample-cover-letter.txt"),
        "utf-8"
      );
      const responseText = `${tailoredCV}\n${DELIMITER}\n${coverLetter}`;
      return { body: Buffer.from(JSON.stringify({ content: [{ text: responseText }] })) };
    },
  } as unknown as BedrockRuntimeClient;

  const clients: DraftCVClients = { s3: s3Stub, dynamo: dynamoStub, bedrock: bedrockStub };

  log("info", "Starting local DraftCV run", { event: mockEvent });
  try {
    const result = await runDraftCV(mockEvent, clients, mockEnv);
    console.log("\n─── Result ───────────────────────────────────────────────");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n─── Generated CV ─────────────────────────────────────────");
    console.log(s3Store[result.s3TailoredCVKey]);
    console.log("\n─── Cover Letter ─────────────────────────────────────────");
    console.log(s3Store[result.s3CoverLetterKey]);
  } catch (err) {
    log("error", "Local run failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
