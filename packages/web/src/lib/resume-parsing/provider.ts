export type ParseFileType = "pdf" | "docx" | "txt";

export interface ResumeParseInput {
  fileName: string;
  fileType: ParseFileType;
  mimeType?: string;
  bytes: Uint8Array;
}

export interface ResumeParseResult {
  text: string;
}

export interface ResumeParserProvider {
  parse(input: ResumeParseInput): Promise<ResumeParseResult>;
}
