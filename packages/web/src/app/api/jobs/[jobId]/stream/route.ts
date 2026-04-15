import { NextResponse } from "next/server";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — match state machine timeout

/**
 * GET /api/jobs/[jobId]/stream
 *
 * Server-Sent Events endpoint. Polls DynamoDB every 1.5 s and emits a status
 * event only when the status changes. On COMPLETE, fetches all three S3
 * artefacts and emits the full TailoredOutput payload.
 *
 * Each message is a JSON-encoded SSEPayload:
 *   { status: "PENDING" | "DRAFTING" | "CRITIQUE" }
 *   { status: "COMPLETE"; result: TailoredOutput }
 *   { status: "FAILED"; errorMessage: string }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const awsRegion = process.env.AWS_REGION;
  const tableName = process.env.JOBS_TABLE_NAME;
  const bucketName = process.env.RESULTS_BUCKET_NAME;
  if (!awsRegion || !tableName || !bucketName) {
    return NextResponse.json(
      { error: "Server misconfigured: missing required AWS environment variables" },
      { status: 500 }
    );
  }

  const { jobId } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        const chunk = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(new TextEncoder().encode(chunk));
      };

      const start = Date.now();
      let lastSentStatus: string | null = null;

      try {
        while (Date.now() - start < TIMEOUT_MS) {
          const { Item } = await dynamo.send(
            new GetItemCommand({
              TableName: tableName,
              Key: { jobId: { S: jobId } },
            })
          );

          if (!Item) {
            send({ status: "FAILED", errorMessage: "Job not found" });
            break;
          }

          const status = Item.status?.S ?? "PENDING";

          if (status !== lastSentStatus) {
            if (status === "COMPLETE") {
              // Always fetch analysis.json first — it drives whether CV artefacts exist
              const analysisRaw = await s3
                .send(
                  new GetObjectCommand({
                    Bucket: bucketName,
                    Key: `results/${jobId}/analysis.json`,
                  })
                )
                .then((r) => r.Body!.transformToString("utf-8"));

              const analysis = JSON.parse(analysisRaw);

              if (analysis.fitVerdict === "NO_FIT") {
                // Pre-screening rejected this candidate — CV artefacts were never written
                send({
                  status: "COMPLETE",
                  result: { ...analysis, jobId },
                });
              } else {
                // FIT path — fetch the tailored CV and cover letter in parallel
                const [tailoredCV, coverLetter] = await Promise.all([
                  s3
                    .send(
                      new GetObjectCommand({
                        Bucket: bucketName,
                        Key: `results/${jobId}/tailored-cv.md`,
                      })
                    )
                    .then((r) => r.Body!.transformToString("utf-8")),
                  s3
                    .send(
                      new GetObjectCommand({
                        Bucket: bucketName,
                        Key: `results/${jobId}/cover-letter.md`,
                      })
                    )
                    .then((r) => r.Body!.transformToString("utf-8")),
                ]);

                send({
                  status: "COMPLETE",
                  result: { ...analysis, tailoredCV, coverLetter, jobId },
                });
              }
              break;
            } else if (status === "FAILED") {
              send({
                status: "FAILED",
                errorMessage: Item.errorMessage?.S ?? "Pipeline failed",
              });
              break;
            } else {
              // PENDING, DRAFTING, CRITIQUE
              send({ status });
            }

            lastSentStatus = status;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        if (Date.now() - start >= TIMEOUT_MS) {
          send({ status: "FAILED", errorMessage: "Timed out waiting for pipeline to complete" });
        }
      } catch (err) {
        const errorId = crypto.randomUUID();
        console.error("Job stream endpoint failed", {
          errorId,
          jobId,
          err,
        });
        send({
          status: "FAILED",
          errorMessage: `Server error. Reference ID: ${errorId}`,
        });
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
