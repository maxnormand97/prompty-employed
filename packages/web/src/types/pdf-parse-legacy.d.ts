declare module "pdf-parse/lib/pdf-parse.js" {
  type ParseResult = {
    text?: string;
  };

  type ParseOptions = Record<string, unknown>;

  export default function pdfParse(
    dataBuffer: Buffer,
    options?: ParseOptions
  ): Promise<ParseResult>;
}
