# Project Budget, Billing & AWS Account Setup

> **Goal:** Ensure the project can be developed and demoed as a portfolio piece with **minimal to zero personal cost**. All AWS services (except Bedrock) are comfortably within the free tier for this workload. Bedrock costs are capped and negligible at portfolio scale.

---

## Budget & Cost Estimate

> **Summary:** Amazon Bedrock is the only meaningful cost driver. At portfolio-level usage (~50–100 end-to-end runs during development and demos), total AWS spend is estimated at **under $5 USD**. Every other service used sits comfortably within its free tier for this workload.

### Per-Service Cost Breakdown

#### Amazon Bedrock — Claude Models *(only real cost)*

Bedrock has no free tier. Costs are token-based and billed per request.

| Model | Input | Output | Est. tokens/run | Cost/run |
|---|---|---|---|---|
| Claude 3.7 Sonnet (draft) | $3.00 / MTok | $15.00 / MTok | ~2 000 in / ~1 500 out | ~$0.028 |
| Claude 3 Haiku (critique) | $0.25 / MTok | $1.25 / MTok | ~3 000 in / ~500 out | ~$0.001 |
| **Per full pipeline run** | | | | **~$0.03** |

| Scenario | Runs | Estimated cost |
|---|---|---|
| Active development & debugging | ~50 | ~$1.50 |
| Demo sessions + recruiter reviews | ~30 | ~$0.90 |
| **Total estimated lifetime spend** | **~100** | **~$3–5 USD** |

> Costs can be further capped by setting an **AWS Billing Alert** at $10 — well above expected spend, but a safe backstop.

---

#### All Other Services — Within Free Tier

| Service | Free Tier Type | Allowance | Expected Usage | Cost |
|---|---|---|---|---|
| **AWS Lambda** | 12-month + Always Free | 1M requests/mo; 400K GB-sec/mo | < 500 requests total | **$0** |
| **AWS Step Functions** | Always Free (Express) | 1M transitions/mo | < 300 transitions total | **$0** |
| **Amazon S3** | 12-month | 5 GB storage; 20K GET; 2K PUT | < 10 MB total | **$0** |
| **Amazon DynamoDB** | Always Free | 25 GB storage; 200M requests/mo (on-demand) | < 500 requests total | **$0** |
| **AWS Amplify Hosting** | 12-month | 1 000 build min/mo; 15 GB served/mo; 5 GB storage | Negligible | **$0** |
| **Amazon CloudWatch Logs** | Always Free | 5 GB ingestion/mo | < 10 MB total | **$0** |
| **AWS X-Ray** | Always Free | 100K traces recorded/mo | < 200 traces total | **$0** |
| **AWS CDK / CloudFormation** | Always Free | Unlimited | N/A | **$0** |
| **AWS IAM** | Always Free | Unlimited | N/A | **$0** |

> **Note:** The 12-month free tier applies to new AWS accounts created within the last 12 months. If using an existing account past 12 months, Lambda, S3, and Amplify costs at this scale are still fractions of a cent and effectively $0.

---

## AWS Account Setup Checklist

### 1. Create / Use an AWS Account
- Sign up at [aws.amazon.com](https://aws.amazon.com) if you don't have an account
- A personal account is sufficient — no AWS Organisation is needed for Phase 1
- Add a payment method (required even for free-tier usage); a prepaid card works

### 2. Enable Amazon Bedrock Model Access *(manual step — easy to miss)*
Claude models are **not enabled by default** on Bedrock. This must be done once per region:
1. Open the [AWS Console → Amazon Bedrock → Model access](https://console.aws.amazon.com/bedrock/home#/modelaccess)
2. Click **Manage model access**
3. Request access to:
   - `Anthropic — Claude 3.7 Sonnet` (`anthropic.claude-3-7-sonnet-20250219-v1:0`)
   - `Anthropic — Claude 3 Haiku` (`anthropic.claude-3-haiku-20240307-v1:0`)
4. Accept Anthropic's end-user licence agreement when prompted
5. Access is typically approved within seconds to a few minutes

> **Region:** deploy everything to a single region that supports both models — `us-east-1` (N. Virginia) or `us-west-2` (Oregon) are the safest choices.

### 3. Install and Configure the AWS CLI
```bash
# Install (macOS via Homebrew)
brew install awscli

# Configure with your IAM credentials
aws configure
# Prompts: Access Key ID, Secret Access Key, default region (e.g. us-east-1), output format (json)
```
Create a dedicated IAM user with `AdministratorAccess` for local CDK deployment rather than using the root account.

### 4. Bootstrap AWS CDK
CDK requires a one-time bootstrap per account/region pair (creates an S3 bucket and IAM roles for CDK asset staging):
```bash
pnpm --filter infra exec cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
# e.g. cdk bootstrap aws://123456789012/us-east-1
```

### 5. Connect Amplify to GitHub
1. Push the repo to GitHub
2. Open [AWS Console → AWS Amplify → New app → Host web app](https://console.aws.amazon.com/amplify)
3. Connect the GitHub repo; select the `main` branch
4. Set the build root to `packages/web`; Amplify auto-detects Next.js
5. Amplify will auto-deploy on every push to `main`

### 6. Set a Billing Alert (Recommended)
1. Open [AWS Console → Billing → Budgets → Create budget](https://console.aws.amazon.com/billing/home#/budgets)
2. Use the **Monthly cost budget** template
3. Set the threshold to **$10 USD**
4. Add your email for alerts — you should never receive one, but it's good practice

---

## Cost Summary

| Category | Estimated Spend |
|---|---|
| Amazon Bedrock (development + demos) | ~$3–5 USD |
| All other AWS services | $0 (free tier) |
| **Total** | **< $5 USD** |
