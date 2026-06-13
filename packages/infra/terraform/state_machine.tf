resource "aws_sfn_state_machine" "ingestion_pipeline" {
  name       = "PromptlyEmployedIngestionPipeline"
  role_arn   = "arn:aws:iam::757967396093:role/service-role/StepFunctions-PromptlyEmployedIngestionPipeline-role-hsnp4ldls"
  type       = "STANDARD"
  definition = jsonencode({
    Comment           = "A description of my state machine"
    StartAt           = "DraftCVLambda"
    QueryLanguage     = "JSONata"
    TimeoutSeconds    = 80
    States = {
      DraftCVLambda = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Output   = "{% $states.result.Payload %}"
        Arguments = {
          FunctionName = "arn:aws:lambda:ap-southeast-2:757967396093:function:DraftCVLambda:$LATEST"
          Payload      = "{% $states.input %}"
        }
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
            IntervalSeconds = 1
            MaxAttempts     = 3
            BackoffRate     = 2
            JitterStrategy  = "FULL"
          }
        ]
        Next = "CritiqueCVLambda"
      }
      CritiqueCVLambda = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Output   = "{% $states.result.Payload %}"
        Arguments = {
          FunctionName = "arn:aws:lambda:ap-southeast-2:757967396093:function:CritiqueCVLambda:$LATEST"
          Payload      = "{% $states.input %}"
        }
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
            IntervalSeconds = 1
            MaxAttempts     = 3
            BackoffRate     = 2
            JitterStrategy  = "FULL"
          }
        ]
        End = true
      }
    }
  })
}