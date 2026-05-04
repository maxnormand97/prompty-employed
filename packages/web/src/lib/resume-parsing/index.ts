import { LambdaResumeParser } from "./lambda-parser";
import { LocalResumeParser } from "./local-parser";
import type { ResumeParserProvider } from "./provider";

let parserInstance: ResumeParserProvider | null = null;

export function getResumeParser(): ResumeParserProvider {
  if (parserInstance) return parserInstance;

  const backend = process.env.RESUME_PARSE_BACKEND?.toLowerCase();

  parserInstance = backend === "lambda" ? new LambdaResumeParser() : new LocalResumeParser();
  return parserInstance;
}
