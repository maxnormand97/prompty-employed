import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResumePickerCard } from "./resume-picker-card";
import { useResumeLibrary } from "@/hooks/use-resume-library";
import { parseResumeUpload } from "@/lib/resume-upload";

jest.mock("@/hooks/use-resume-library", () => ({
  useResumeLibrary: jest.fn(),
}));

jest.mock("@/lib/resume-upload", () => ({
  parseResumeUpload: jest.fn(),
}));

const mockUseResumeLibrary = jest.mocked(useResumeLibrary);
const mockParseResumeUpload = jest.mocked(parseResumeUpload);

describe("ResumePickerCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("selects a saved resume from quick select", async () => {
    const onResumeTextChange = jest.fn();
    const selectResume = jest.fn();

    mockUseResumeLibrary.mockReturnValue({
      resumes: [
        {
          id: "resume-1",
          name: "Platform Resume",
          text: "A".repeat(200),
          source: "manual",
          uploadedAt: "2026-05-01T10:00:00.000Z",
          updatedAt: "2026-05-01T10:00:00.000Z",
        },
      ],
      selectedResumeId: null,
      selectedResume: null,
      loaded: true,
      saveResume: jest.fn(),
      selectResume,
      removeResume: jest.fn(),
      touchResume: jest.fn(),
      refresh: jest.fn(),
    });

    render(<ResumePickerCard onResumeTextChange={onResumeTextChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Platform Resume" }));

    expect(selectResume).toHaveBeenCalledWith("resume-1");
    expect(onResumeTextChange).toHaveBeenCalledWith("A".repeat(200));
  });

  it("uploads and saves a parsed resume file", async () => {
    const onResumeTextChange = jest.fn();
    const saveResume = jest.fn().mockReturnValue({
      id: "resume-2",
      name: "Uploaded Resume",
      text: "B".repeat(220),
      source: "upload",
      fileType: "pdf",
      mimeType: "application/pdf",
      uploadedAt: "2026-05-01T10:00:00.000Z",
      updatedAt: "2026-05-01T10:00:00.000Z",
    });

    mockUseResumeLibrary.mockReturnValue({
      resumes: [],
      selectedResumeId: null,
      selectedResume: null,
      loaded: true,
      saveResume,
      selectResume: jest.fn(),
      removeResume: jest.fn(),
      touchResume: jest.fn(),
      refresh: jest.fn(),
    });

    mockParseResumeUpload.mockResolvedValue({
      name: "Uploaded Resume.pdf",
      fileType: "pdf",
      mimeType: "application/pdf",
      text: "B".repeat(220),
    });

    const { container } = render(<ResumePickerCard onResumeTextChange={onResumeTextChange} />);
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    await userEvent.upload(input as HTMLInputElement, new File(["file"], "resume.pdf", { type: "application/pdf" }));

    await waitFor(() => {
      expect(mockParseResumeUpload).toHaveBeenCalledTimes(1);
    });
    expect(saveResume).toHaveBeenCalledWith({
      name: "Uploaded Resume",
      text: "B".repeat(220),
      source: "upload",
      fileType: "pdf",
      mimeType: "application/pdf",
    });
    expect(onResumeTextChange).toHaveBeenCalledWith("B".repeat(220));
  });
});
