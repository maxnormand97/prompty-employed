import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { log } from "./log";

export async function invokeBedrockText(
  bedrock: BedrockRuntimeClient,
  modelId: string,
  prompt: string
): Promise<string> {
  log("info", "Invoking Bedrock model", { modelId, promptLength: prompt.length });
  // Prefill the assistant turn with "{" to force Claude to start the JSON object
  // directly, preventing markdown fences or preamble text.
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "{" },
    ],
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
  const stopReason: string = parsed?.stop_reason;
  const text: string = parsed?.content?.[0]?.text;
  if (!text) throw new Error("Bedrock returned an empty or malformed response");
  // Reconstruct the full JSON object by prepending the assistant prefill character
  // only when the model continuation does not already include it.
  const fullText = text.trimStart().startsWith("{") ? text : `{${text}`;
  if (stopReason === "max_tokens") {
    const snippetLength = 200;
    log("error", "Bedrock response truncated at max_tokens limit", {
      modelId,
      responseLength: fullText.length,
      partialResponseSnippet: fullText.slice(0, snippetLength),
      partialResponseSnippetTruncated: fullText.length > snippetLength,
    });
    throw new Error(
      `Bedrock response was truncated (hit max_tokens limit after ${fullText.length} chars)`
    );
  }
  log("info", "Bedrock response received", { stopReason, responseLength: fullText.length });
  return fullText;
}
