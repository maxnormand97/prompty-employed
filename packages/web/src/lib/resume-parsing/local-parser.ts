import type { ResumeParseInput, ResumeParseResult, ResumeParserProvider } from "./provider";

async function parsePdfText(bytes: Uint8Array): Promise<string> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ) => Promise<{ text?: string }>;

  const result = await pdfParse(Buffer.from(bytes));
  return (result.text ?? "").trim();
}

export class LocalResumeParser implements ResumeParserProvider {
  async parse(input: ResumeParseInput): Promise<ResumeParseResult> {
    if (input.fileType === "txt") {
      return { text: new TextDecoder().decode(input.bytes) };
    }

    if (input.fileType === "docx") {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(input.bytes);
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value };
    }

    return { text: await parsePdfText(input.bytes) };
  }
}
