resource "aws_dynamodb_table" "jobs" {
  name           = "PromptlyEmployedJobs"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }
}