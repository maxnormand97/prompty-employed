import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { log } from "./log";

export async function readS3Object(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<string> {
  log("info", "Reading S3 object", { bucket, key });
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  if (!response.Body) throw new Error(`Empty body for S3 key: ${key}`);
  return response.Body.transformToString("utf-8");
}

export async function writeS3Object(
  s3: S3Client,
  bucket: string,
  key: string,
  body: string,
  contentType = "application/json"
): Promise<void> {
  log("info", "Writing S3 object", { bucket, key, bytes: body.length, contentType });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}
