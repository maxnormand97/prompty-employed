import type { TailoredOutput } from "@/lib/types";

export const MOCK_TAILORED_CV = `# Alex Chen
**Senior Platform Engineer — APIs & Developer Experience**

alex.chen@email.com · linkedin.com/in/alexchen · github.com/alexchen · Sydney, AU

---

## Professional Summary

Platform engineering leader with 8+ years designing and scaling high-throughput API infrastructure and developer tooling. Proven track record delivering systems that process 50M+ daily requests with 99.95% uptime. Deep expertise in TypeScript/Node.js, AWS, distributed systems, and developer experience tooling. Passionate about enabling engineering teams to move faster through clean abstractions and exceptional observability.

---

## Experience

### Senior Software Engineer — Platform Engineering
**Canva** · Sydney, AU · Jan 2022 – Present

- Architected and shipped an internal API gateway processing **50M+ requests/day**, reducing P99 latency by 38% through connection pooling and intelligent request coalescing
- Led a team of 4 engineers to redesign the developer credential management system (OAuth 2.0 + API keys), reducing provisioning time from 2 days to under 30 seconds
- Built a distributed rate-limiting service on Redis, protecting downstream services from traffic spikes while maintaining platform SLO
- Drove adoption of OpenAPI 3.1 across 20+ internal services, enabling automated client SDK generation and cutting API integration time by 60%
- Deployed containerised workloads to AWS ECS with full Fargate migration; authored runbooks for the top 15 incident patterns
- Mentored 3 junior engineers; 2 received promotions within 18 months

### Software Engineer — Core API
**Atlassian** · Sydney, AU · Mar 2019 – Dec 2021

- Owned the Jira REST API v3 migration, coordinating deprecation across 300+ enterprise customers with zero unplanned breaking changes
- Implemented structured logging and distributed tracing (OpenTelemetry) across 12 backend services, enabling the team to reduce mean time to detection (MTTD) by 55%
- Built internal tooling to auto-generate API documentation from TypeScript types, reducing doc lag from weeks to same-day

### Software Engineer
**Airtasker** · Sydney, AU · Jul 2016 – Feb 2019

- Helped scale the marketplace API from 50K to 1.5M monthly active users
- Introduced integration testing with mocked dependencies, achieving 85% coverage on critical payment flows

---

## Technical Skills

**Languages & Runtimes:** TypeScript, Node.js, Python, Go (familiar)
**Cloud & Infrastructure:** AWS (ECS, Lambda, API Gateway, S3, DynamoDB, CloudWatch, X-Ray), Docker, Terraform
**APIs & Protocols:** REST, GraphQL, OpenAPI 3.1, OAuth 2.0, Server-Sent Events, webhooks
**Databases:** PostgreSQL, DynamoDB, Redis
**Observability:** OpenTelemetry, Datadog, CloudWatch Logs Insights, X-Ray
**Practices:** API design, distributed systems, event-driven architecture, on-call, code review

---

## Education

**B.Sc. Computer Science (First Class Honours)** — University of New South Wales, 2016
`.trim();

export const MOCK_COVER_LETTER = `Dear Hiring Manager,

I'm writing to apply for the Senior Platform Engineer role at Atlassian. Having spent the past eight years building developer platforms and API infrastructure at scale — most recently at Canva where I architected systems handling over 50 million daily requests — I'm excited by the opportunity to help Atlassian continue setting the standard for developer tooling globally.

What draws me to this role specifically is Atlassian's Forge platform. Building a secure, scalable execution environment for third-party developer code is one of the genuinely hard platform engineering problems, and the design decisions your team is navigating (sandboxing, request isolation, per-tenant rate limiting) are problems I've thought about deeply.

At Canva I led the rebuild of our internal credential management system, cutting provisioning time from 2 days to 30 seconds across 40+ internal teams. I drove the OpenAPI 3.1 adoption initiative that enabled automatic SDK generation across 20+ services — a project that required sustained cross-team coordination and careful deprecation management, skills I know are central to platform work at Atlassian's scale.

I'm a strong advocate for developer experience as a force multiplier. I've seen first-hand how a well-designed internal platform can double a team's shipping velocity, and I would bring that same perspective to Atlassian's ecosystem.

I'd welcome the opportunity to discuss the role further. Thank you for your time.

Best regards,
Alex Chen
`.trim();

export const MOCK_TAILORED_OUTPUT: TailoredOutput = {
  jobId: "00000000-0000-0000-0000-000000000001",
  completedAt: new Date().toISOString(),

  tailoredCV: MOCK_TAILORED_CV,
  coverLetter: MOCK_COVER_LETTER,

  critiqueNotes:
    "The tailored CV is well-structured and leads with the most relevant experience. Keyword alignment to this Platform Engineer JD is strong — API design, distributed systems, TypeScript/Node.js, AWS, and observability are all clearly demonstrated with quantified outcomes. The professional summary is tight and role-specific. One area for improvement: the container/Kubernetes dimension could be strengthened — the JD lists Kubernetes as a core requirement, and while ECS/Fargate experience is mentioned, explicit Kubernetes cluster management experience is absent.",

  fitScore: 82,
  fitRationale:
    "The tailored CV demonstrates strong alignment with the role's core platform engineering requirements. API design, distributed systems, and TypeScript/Node.js expertise are consistently evidenced with specific metrics (50M req/day, 38% latency reduction, 60% integration time reduction). Observability (OpenTelemetry, structured logging) and developer experience are well-represented with concrete outcomes. The CV scores lower on Kubernetes — the JD specifies hands-on Kubernetes as a must-have and while container experience is evidenced (ECS/Fargate), Kubernetes is only implicitly referenced. This gap reduces the overall alignment score.",

  likelihoodScore: 61,
  likelihoodRationale:
    "Strong candidate for shortlist consideration. The core platform engineering experience is a close match and the Canva brand carries well in the Sydney tech market. The primary competitive risk is the Kubernetes gap — the JD specifies 'extensive Kubernetes experience' as a core requirement, and in a shortlist of AU senior platform engineers, most will have hands-on EKS or GKE experience. This gap may push the candidate to second-round screening rather than direct progression. Compensation expectations (AU$180–220K total package) are likely aligned. Overall, expect interview consideration but reduced competitiveness for immediate advancement.",

  suggestedImprovements: [
    "Add an explicit Kubernetes bullet under the Canva role — even a statement like 'Evaluated EKS migration path; led proof-of-concept deployment of 3 services to EKS' would close the largest gap",
    "The cover letter opening is strong; consider referencing a specific Forge capability (e.g. storage APIs, UI kit) to signal genuine depth of product knowledge",
    "Add a 'Side Projects / Open Source' section — one public GitHub project that demonstrates API or platform design thinking strengthens applications at this seniority level",
    "Quantify one more Atlassian achievement — the Jira v3 migration story is compelling but currently lacks a metric (e.g. 'reduced API error rate by X%' or 'migrated 300 enterprise customers with 0 support escalations')",
  ],

  gapAnalysis: [
    {
      gap: "No explicit Kubernetes / container orchestration experience",
      advice:
        "The JD lists 'extensive Kubernetes experience' as a core requirement. Pursue the CKAD (Certified Kubernetes Application Developer) certification — the Linux Foundation sells exam vouchers for ~US$395 and the preparation materials are free via killer.sh. In parallel, build a personal Kubernetes project on GKE Free Tier: deploy a small API service, configure HPA auto-scaling, and set up Prometheus + Grafana for observability. Add both the certification and the project to your CV. This single addition would significantly improve your competitiveness for this role.",
      priority: "HIGH",
    },
    {
      gap: "API design experience not linked to measurable ecosystem impact",
      advice:
        "For platform roles at Atlassian scale, interviewers want to see evidence that your API design decisions had downstream ecosystem impact. Expand one bullet to describe a decision-making trade-off (e.g. 'Evaluated gRPC vs. REST for internal services; chose REST + OpenAPI for ecosystem compatibility, enabling SDK generation across 3 languages'). This signals engineering judgement and platform thinking, not just execution.",
      priority: "MEDIUM",
    },
    {
      gap: "No explicit incident management or on-call ownership mentioned",
      advice:
        "Senior platform roles at Atlassian include 24/7 on-call rotation. One bullet about on-call ownership, SLO accountability, or runbook authorship would signal operational maturity. For example: 'Maintained 99.95% gateway SLO; owned on-call rotation and authored runbooks for the top 15 incident patterns, reducing MTTR by 40%'.",
      priority: "LOW",
    },
  ],
};
