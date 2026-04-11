/**
 * Local development entry point for CritiqueCVLambda.
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
import { CritiqueCVClients, CritiqueCVEnv, CritiqueCVInput } from "./lib/types";
import { runCritiqueCV } from "./core";

export async function main(): Promise<void> {
  const testDataDir = path.join(__dirname, "../../test-data");
  const tailoredCV = fs.readFileSync(path.join(testDataDir, "sample-tailored-cv.txt"), "utf-8");
  const coverLetter = fs.readFileSync(path.join(testDataDir, "sample-cover-letter.txt"), "utf-8");
  const jobDesc = fs.readFileSync(path.join(testDataDir, "sample-job-desc.txt"), "utf-8");

  const mockEvent: CritiqueCVInput = {
    jobId: "local-test-job-001",
    s3TailoredCVKey: "results/local-test-job-001/tailored-cv.md",
    s3CoverLetterKey: "results/local-test-job-001/cover-letter.md",
    s3JobDescKey: "inputs/local-test-job-001/job-desc.txt",
  };

  const mockEnv: CritiqueCVEnv = {
    bedrockModelId: "anthropic.claude-3-haiku-20240307-v1:0",
    jobsTableName: "PromptlyEmployedJobs",
    resultsBucketName: "PromptlyEmployedResults",
  };

  const s3Store: Record<string, string> = {
    [mockEvent.s3TailoredCVKey]: tailoredCV,
    [mockEvent.s3CoverLetterKey]: coverLetter,
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

  const mockCritiquePayload = {
    critiqueNotes: "Strong alignment with the role requirements.",
    fitScore: 82,
    fitRationale: "The candidate has the required TypeScript and React experience.",
    likelihoodScore: 70,
    likelihoodRationale: "Good match but lacks Storybook experience mentioned in the JD.",
    suggestedImprovements: [
      "Add Storybook or Chromatic usage to experience section",
      "Quantify accessibility work with WCAG compliance metrics",
    ],
    gapAnalysis: [
      {
        gap: "No Storybook or visual regression testing experience",
        advice: "Build a small Storybook component library on GitHub to demonstrate the skill",
        priority: "HIGH",
      },
    ],
  };

  const bedrockStub = {
    send: async (_command: unknown) => {
      return {
        body: Buffer.from(JSON.stringify({ content: [{ text: JSON.stringify(mockCritiquePayload) }] })),
      };
    },
  } as unknown as BedrockRuntimeClient;

  const clients: CritiqueCVClients = { s3: s3Stub, dynamo: dynamoStub, bedrock: bedrockStub };

  log("info", "Starting local CritiqueCV run", { event: mockEvent });
  try {
    const result = await runCritiqueCV(mockEvent, clients, mockEnv);
    console.log("\n─── Result ───────────────────────────────────────────────");
    console.log(JSON.stringify(result, null, 2));
    console.log("\n─── Analysis JSON (S3 payload) ───────────────────────────");
    console.log(s3Store[`results/${mockEvent.jobId}/analysis.json`]);
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
