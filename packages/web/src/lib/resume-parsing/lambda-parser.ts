import type { ResumeParseInput, ResumeParseResult, ResumeParserProvider } from "./provider";

export class LambdaResumeParser implements ResumeParserProvider {
  async parse(input: ResumeParseInput): Promise<ResumeParseResult> {
    void input;
    throw new Error(
      "Lambda parser is not configured yet. Set RESUME_PARSE_BACKEND=local for now."
    );
  }
}
