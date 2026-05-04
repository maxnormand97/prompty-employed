# User Experience & User Stories — Promptly Employed

> This document describes the product from the user's perspective — how they interact with the system, what they see at each step, and the value they receive. User stories are written in the standard format and map directly to the Phase 1 feature set.

---

## Who Is the User?

**Primary persona:** A job seeker in Australia who has accumulated work experience across multiple roles and wants to apply for a specific position without spending hours manually rewriting their CV and drafting a cover letter from scratch.

They have:
- A **master experience list or detailed resume** — a comprehensive document containing all their roles, skills, and achievements (not yet tailored for any specific job)
- A **target job description** — copied from Seek, LinkedIn, or a company careers page

They want:
- A **tailored CV** that highlights the most relevant experience for that specific role
- A **cover letter** written in a professional tone, specific to that job
- An honest **likelihood score** telling them how competitive they are for the role
- **Practical gap advice** — if they're missing something, tell them exactly what to do about it

---

## End-to-End User Flow

### Step 1 — Land on the Homepage

The user arrives at the Promptly Employed web app. They see a clean, single-purpose input form with two text areas and a submit button. No sign-up required. No distractions.

Before submitting, they can also choose from a local **Resume Library**:

- Upload a resume file in **PDF, DOCX, or TXT** format
- Keep multiple saved resume variants locally in the browser
- Select which saved resume to use for the next application
- Replace or delete older resume versions from a dedicated `/resumes` page

The selected resume fills the master resume field automatically, but the user can still edit the text before submission if they want to make small changes for that run.

```
┌─────────────────────────────────────────────────────────┐
│              Promptly Employed                          │
│  Get a tailored CV, cover letter, and honest feedback   │
│  on your chances — in under a minute.                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Your Master Resume / Experience List           │   │
│  │  (paste full text — roles, skills, achievements)│   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Job Description                                │   │
│  │  (paste the full JD from Seek, LinkedIn, etc.)  │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│              [ Tailor My Application ]                  │
└─────────────────────────────────────────────────────────┘
```

---

### Step 2 — Submit

The user pastes their resume and the job description, then clicks **Tailor My Application**.

- The form is validated client-side (minimum lengths enforced)
- On submit, the UI immediately transitions to a **live status screen** for that job
- The inputs are uploaded to S3 and a Step Functions execution begins in the background

---

### Step 3 — Live Status Screen

The user is redirected to `/jobs/[jobId]`. The page streams real-time status updates via **Server-Sent Events** — no manual refresh needed.

Each stage is shown with a progress indicator:

```
┌─────────────────────────────────────────────────────────┐
│  Tailoring your application...                          │
│                                                         │
│  ✅  Submitted                                          │
│  ⏳  Drafting your tailored CV and cover letter...      │
│  ○   Analysing your fit for the role                    │
│  ○   Ready                                              │
└─────────────────────────────────────────────────────────┘
```

Status transitions in order:

| Status | What's happening |
|---|---|
| `PENDING` | Job recorded, pipeline starting |
| `DRAFTING` | Claude 3.7 Sonnet is rewriting the CV and drafting the cover letter |
| `CRITIQUE` | Claude 3 Haiku is scoring the application and analysing experience gaps |
| `COMPLETE` | All results ready — page auto-scrolls to results |
| `FAILED` | Something went wrong — error message shown with option to resubmit |

The whole pipeline typically completes in **30–60 seconds**.

---

### Step 4 — Results

Once `COMPLETE`, the results page auto-populates with four distinct sections:

---

#### Section A — Tailored CV

A complete, rewritten CV in Markdown, restructured to lead with the experience most relevant to the job description. Skills, achievements, and language are aligned to the JD's terminology.

- Rendered as formatted Markdown on-page
- **Download as `.md`** button provided

---

#### Section B — Cover Letter

A professional, role-specific cover letter in Markdown. Not a generic template — written with direct reference to the job description and the user's most relevant experience.

- Rendered as formatted Markdown on-page
- **Download as `.md`** button provided

---

#### Section C — Application Scorecard

Two scores presented side by side:

```
┌───────────────────────┐   ┌───────────────────────┐
│   CV Fit Score        │   │  Likelihood of Hire   │
│                       │   │                       │
│        82 / 100       │   │       61 / 100        │
│                       │   │                       │
│  Your CV is well-     │   │  You meet most core   │
│  aligned to the JD.   │   │  requirements but are │
│  Strong keyword       │   │  missing hands-on     │
│  coverage and         │   │  experience in two    │
│  relevant metrics.    │   │  key areas.           │
└───────────────────────┘   └───────────────────────┘
```

| Score | What it measures |
|---|---|
| **CV Fit Score** | How well the tailored CV reads against the JD — keyword alignment, relevance ranking, structure |
| **Likelihood of Hire** | An honest estimate of how competitive the user is for this specific role based on their actual experience |

Both scores include a **one-paragraph rationale** so the user understands how the score was arrived at.

---

#### Section D — Gap Analysis

A prioritised list of experience or skill gaps identified by comparing the user's background to the JD requirements — each with **specific, actionable advice** on how to close the gap.

```
┌─────────────────────────────────────────────────────────┐
│  Gap Analysis — 3 areas to address                      │
│                                                         │
│  🔴  HIGH   No hands-on Kubernetes experience           │
│             The JD lists Kubernetes as a core           │
│             requirement. Complete the free CKAD         │
│             course on Linux Foundation, then add a      │
│             personal cluster project to your GitHub.    │
│                                                         │
│  🟡  MEDIUM  No formal agile/scrum certification        │
│             Consider a PSM I certification ($150).      │
│             Many AU employers treat this as a           │
│             soft requirement.                           │
│                                                         │
│  🟢  LOW    Limited public speaking / presentation      │
│             examples                                    │
│             Not a blocker, but one example in your      │
│             cover letter of presenting to stakeholders  │
│             would strengthen the application.           │
└─────────────────────────────────────────────────────────┘
```

Each gap item has:
- **Priority badge** — `HIGH` / `MEDIUM` / `LOW`
- **Gap description** — what's missing relative to the JD
- **Practical advice** — a concrete, specific action the user can take

---

### Step 5 — A Failed Job

If the pipeline encounters an error (e.g. Bedrock timeout, malformed model response), the status screen displays:

```
┌─────────────────────────────────────────────────────────┐
│  Something went wrong                                   │
│                                                         │
│  We weren't able to complete your application.          │
│  This is usually a temporary issue.                     │
│                                                         │
│  [ Try Again ]                                          │
└─────────────────────────────────────────────────────────┘
```

The user can resubmit immediately. The original inputs are not stored server-side after the TTL expires, so they may need to re-paste.

---

## User Stories

### Submission

---

**US-00 — Manage multiple resumes locally**
> As a job seeker, I want to keep multiple resume versions in the app and switch between them quickly, so that I can tailor different applications from the most relevant starting point.

**Acceptance criteria:**
- I can open a dedicated resume management area
- I can upload a resume as PDF, DOCX, or TXT
- Uploaded resumes are parsed into plain text for use in the tailoring pipeline
- I can store more than one resume version locally in my browser
- I can select one saved resume as the active resume for my next application
- I can delete a saved resume I no longer need
- I can replace an existing saved resume with a newer file

**US-01 — Submit an application**
> As a job seeker, I want to paste my master resume and a job description into a form and submit it, so that the pipeline can generate tailored application materials for me.

**Acceptance criteria:**
- The form accepts plain text in both fields
- I can either paste resume text manually or choose a saved resume from the Resume Library
- Resume must be at least 200 characters; job description at least 50 characters
- Both inputs are capped at 15 000 characters to prevent abuse
- Submitting navigates me to the live status screen
- If validation fails, I see a clear inline error message without losing my input

---

**US-02 — See real-time progress**
> As a job seeker, I want to see live status updates while my application is being processed, so that I know the pipeline is running and roughly where it is up to.

**Acceptance criteria:**
- I am redirected to a job-specific status page immediately after submission
- Status stages are displayed in order: Submitted → Drafting → Analysing → Ready
- The current active stage is visually distinct (e.g. spinner/animation)
- Updates appear without me needing to refresh the page
- The page transitions automatically to results when the job completes

---

### Results

---

**US-03 — Receive a tailored CV**
> As a job seeker, I want to receive a rewritten version of my CV tailored to the specific job description, so that my most relevant experience is front and centre for that role.

**Acceptance criteria:**
- The tailored CV is rendered as formatted Markdown on the results page
- Content is drawn from my master resume — no fabricated experience
- Language and terminology are aligned to the job description
- I can download the CV as a `.md` file

---

**US-04 — Receive a tailored cover letter**
> As a job seeker, I want to receive a cover letter written specifically for the role, so that I don't have to write one from scratch or use a generic template.

**Acceptance criteria:**
- The cover letter references the specific role and company (if present in the JD)
- It draws on my most relevant experience from the master resume
- It is rendered as formatted Markdown on the results page
- I can download the cover letter as a `.md` file

---

**US-05 — See a CV fit score**
> As a job seeker, I want to see a score showing how well my tailored CV aligns to the job description, so that I know whether the output is strong before I submit it.

**Acceptance criteria:**
- A score between 0 and 100 is displayed
- A one-paragraph rationale explains how the score was determined
- The score reflects keyword alignment, relevance, and structure — not just word matching

---

**US-06 — See a likelihood-of-hire score**
> As a job seeker, I want to see an honest estimate of my chances of getting this job, so that I can prioritise applications and set realistic expectations.

**Acceptance criteria:**
- A score between 0 and 100 is displayed, separate from the CV fit score
- A one-paragraph rationale explains the scoring honestly
- The score reflects my actual experience level versus JD requirements — not inflated to seem encouraging

---

**US-07 — Receive a gap analysis with practical advice**
> As a job seeker, I want to know exactly what experience or skills I'm missing for this role and what I can do about each gap, so that I can take concrete steps to improve my candidacy.

**Acceptance criteria:**
- Each identified gap is listed with a `HIGH`, `MEDIUM`, or `LOW` priority
- Each gap includes a plain-English description of what's missing
- Each gap includes specific, actionable advice (e.g. a course name, a project idea, a certification) — not vague suggestions
- Gaps are ordered by priority (HIGH first)
- If no meaningful gaps are found, the section confirms this positively

---

### Error Handling

---

**US-08 — Handle a pipeline failure gracefully**
> As a job seeker, if something goes wrong during processing, I want to see a clear message and be able to try again, so that a temporary error doesn't leave me stuck.

**Acceptance criteria:**
- The status page shows a clear error state (not a blank screen or unhandled exception)
- A "Try Again" action is available
- The error message does not expose internal technical details

---

**US-09 — Handle invalid input before submission**
> As a job seeker, if I forget to fill in a field or paste something too short, I want to see a helpful validation message before anything is submitted, so that I don't waste a pipeline run on bad input.

**Acceptance criteria:**
- Client-side validation runs on submit
- Each field shows its own error message adjacent to the field
- The form does not submit until all validation passes
- The user's text is preserved when validation errors are shown

---

## User Journey Map

```
  User arrives          Fills in form         Submits
       │                     │                   │
       ▼                     ▼                   ▼
  Homepage            Pastes resume         Form validates
  (input form)        + job desc            → uploads to S3
                                            → Step Function starts
                                                   │
                              ┌────────────────────┘
                              ▼
                       Status page (SSE)
                              │
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
                DRAFTING  CRITIQUE   COMPLETE ──▶ Results page
                              │                       │
                              ▼                  ┌────┴────────────────┐
                           FAILED                │  Tailored CV        │
                              │                  │  Cover Letter       │
                              ▼                  │  CV Fit Score       │
                        Error screen             │  Likelihood Score   │
                        + Try Again              │  Gap Analysis       │
                                                 └─────────────────────┘
```
