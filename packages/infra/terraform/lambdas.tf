resource "aws_lambda_function" "critique_cv" {
  function_name = "CritiqueCVLambda"
  role          = "arn:aws:iam::757967396093:role/service-role/CritiqueCVLambda-role-k5sqr1mx"
  filename      = "${path.module}/lambda-code-placeholder.zip"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 128

  environment {
    variables = {
      RESULTS_BUCKET_NAME = "promptly-employed-data-757967396093-ap-southeast-2-an"
      BEDROCK_MODEL_ID    = "anthropic.claude-3-haiku-20240307-v1:0"
      JOBS_TABLE_NAME     = "PromptlyEmployedJobs"
    }
  }

  architectures = ["x86_64"]

  ephemeral_storage {
    size = 512
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash, s3_bucket, s3_key, image_uri]
  }
}

resource "aws_lambda_function" "draft_cv" {
  function_name = "DraftCVLambda"
  role          = "arn:aws:iam::757967396093:role/service-role/DraftCVLambda-role-ongj3mm4"
  filename      = "${path.module}/lambda-code-placeholder.zip"
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  timeout       = 30
  memory_size   = 128

  environment {
    variables = {
      RESULTS_BUCKET_NAME = "promptly-employed-data-757967396093-ap-southeast-2-an"
      BEDROCK_MODEL_ID    = "anthropic.claude-3-haiku-20240307-v1:0"
      JOBS_TABLE_NAME     = "PromptlyEmployedJobs"
    }
  }

  architectures = ["x86_64"]

  ephemeral_storage {
    size = 512
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash, s3_bucket, s3_key, image_uri]
  }
}