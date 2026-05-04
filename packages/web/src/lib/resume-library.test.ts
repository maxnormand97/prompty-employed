import {
  clearResumeLibrary,
  deleteResumeRecord,
  getSelectedResumeId,
  listStoredResumes,
  markResumeUsed,
  saveResumeRecord,
  setSelectedResumeId,
} from "./resume-library";

describe("resume-library", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and lists resume records", () => {
    const created = saveResumeRecord({
      name: "Platform Resume",
      text: "A".repeat(200),
      source: "manual",
    });

    expect(listStoredResumes()).toEqual([created]);
  });

  it("tracks the selected resume id", () => {
    setSelectedResumeId("resume-123");
    expect(getSelectedResumeId()).toBe("resume-123");
  });

  it("updates lastUsedAt and selection when marked used", () => {
    const created = saveResumeRecord({
      id: "resume-123",
      name: "Platform Resume",
      text: "A".repeat(200),
      source: "upload",
      fileType: "pdf",
      mimeType: "application/pdf",
    });

    const updated = markResumeUsed(created.id);

    expect(updated?.lastUsedAt).toEqual(expect.any(String));
    expect(getSelectedResumeId()).toBe(created.id);
  });

  it("removes deleted resumes and clears selection when needed", () => {
    saveResumeRecord({
      id: "resume-123",
      name: "Platform Resume",
      text: "A".repeat(200),
      source: "manual",
    });
    setSelectedResumeId("resume-123");

    deleteResumeRecord("resume-123");

    expect(listStoredResumes()).toEqual([]);
    expect(getSelectedResumeId()).toBeNull();
  });

  it("clears the full library", () => {
    saveResumeRecord({
      name: "Platform Resume",
      text: "A".repeat(200),
      source: "manual",
    });
    setSelectedResumeId("resume-123");

    clearResumeLibrary();

    expect(listStoredResumes()).toEqual([]);
    expect(getSelectedResumeId()).toBeNull();
  });
});
