/**
 * @jest-environment node
 */

const parseMock = jest.fn();

jest.mock("@/lib/resume-parsing", () => ({
  getResumeParser: () => ({
    parse: parseMock,
  }),
}));

import { POST } from "./route";

describe("POST /api/resumes/parse", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parseMock.mockImplementation(async ({ fileType }: { fileType: string }) => {
      if (fileType === "docx") return { text: "DOCX parsed text" };
      if (fileType === "pdf") return { text: "PDF parsed text" };
      if (fileType === "txt") return { text: "Jane Smith\nSenior Engineer" };
      return { text: "" };
    });
  });

  function makeRequest(file?: File): Request {
    const formData = new FormData();
    if (file) formData.set("file", file);
    return new Request("http://localhost/api/resumes/parse", {
      method: "POST",
      body: formData,
    });
  }

  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("parses plain text files directly", async () => {
    const res = await POST(
      makeRequest(new File(["Jane Smith\nSenior Engineer"], "resume.txt", { type: "text/plain" }))
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      name: "resume.txt",
      fileType: "txt",
      mimeType: "text/plain",
      text: "Jane Smith\nSenior Engineer",
    });
  });

  it("rejects unsupported file types", async () => {
    const res = await POST(
      makeRequest(new File(["data"], "resume.rtf", { type: "application/rtf" }))
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/unsupported file type/i),
    });
  });

  it("uses mammoth for docx files", async () => {
    const res = await POST(
      makeRequest(
        new File([new Uint8Array([1, 2, 3])], "resume.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      )
    );

    expect(res.status).toBe(200);
    expect(parseMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      fileType: "docx",
      text: "DOCX parsed text",
    });
  });

  it("uses pdf-parse for pdf files", async () => {
    const res = await POST(
      makeRequest(new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }))
    );

    expect(res.status).toBe(200);
    expect(parseMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({
      fileType: "pdf",
      text: "PDF parsed text",
    });
  });
});
