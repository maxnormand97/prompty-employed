import { NextResponse } from "next/server";
import { MOCK_TAILORED_OUTPUT } from "@/lib/mock-data";

/**
 * GET /api/jobs/[jobId]/stream
 *
 * Server-Sent Events endpoint. Stub: simulates the full pipeline lifecycle
 * with timed transitions so the UI can exercise every status step.
 *
 * Each message is a JSON-encoded `SSEPayload` object:
 *   { status: "PENDING" | "DRAFTING" | "CRITIQUE" }
 *   { status: "COMPLETE"; result: TailoredOutput }
 *   { status: "FAILED"; errorMessage: string }
 *
 * In production this would poll DynamoDB and send real status transitions.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
      };

      const delay = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));

      try {
        // Simulate the full pipeline lifecycle
        send({ status: "PENDING" });
        await delay(800);

        send({ status: "DRAFTING" });
        await delay(3500);

        send({ status: "CRITIQUE" });
        await delay(3000);

        send({ status: "COMPLETE", result: { ...MOCK_TAILORED_OUTPUT, jobId } });
      } catch {
        send({ status: "FAILED", errorMessage: "An unexpected error occurred." });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
