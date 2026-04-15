import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { log } from "./log";

export interface InvokeBedrockOptions {
  /** Top-level system prompt — treated with higher authority than the user turn. */
  systemPrompt?: string;
  /** Max tokens to generate. Defaults to 4096. */
  maxTokens?: number;
}

export async function invokeBedrockText(
  bedrock: BedrockRuntimeClient,
  modelId: string,
  prompt: string,
  options?: InvokeBedrockOptions
): Promise<string> {
  const maxTokens = options?.maxTokens ?? 4096;
  log("info", "Invoking Bedrock model", { modelId, promptLength: prompt.length, maxTokens });
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  const response = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    })
  );

  const parsed = JSON.parse(Buffer.from(response.body).toString("utf-8"));
  const text: string = parsed?.content?.[0]?.text;
  if (!text) throw new Error("Bedrock returned an empty or malformed response");
  log("info", "Bedrock response received", { responseLength: text.length });
  return text;
}
