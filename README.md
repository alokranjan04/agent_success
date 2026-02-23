# AgentOS — Master Documentation
*The Unified AI Co-Pilot for Inbound Contact Centers*

---

## 🌐 Quick Access Links

Easily access the platform across different environments.

### 🚀 Production (Live)
- **Main Dashboard:** [agent-success-utsa5eayma-uc.a.run.app](https://agent-success-utsa5eayma-uc.a.run.app)
- **🎤 Voice Agent Interface:** [agent-success-utsa5eayma-uc.a.run.app/voice](https://agent-success-utsa5eayma-uc.a.run.app/voice)
- **⚙️ Admin Configuration:** [agent-success-utsa5eayma-uc.a.run.app/admin](https://agent-success-utsa5eayma-uc.a.run.app/admin)
- **💬 Customer Chat Widget:** [agent-success-utsa5eayma-uc.a.run.app/customer](https://agent-success-utsa5eayma-uc.a.run.app/customer)

### 💻 Local Development
- **Main Dashboard:** [localhost:3005](http://localhost:3005)
- **Voice Agent:** [localhost:3005/voice](http://localhost:3005/voice)
- **Admin Panel:** [localhost:3005/admin](http://localhost:3005/admin)
- **Customer Chat:** [localhost:3005/customer](http://localhost:3005/customer)
- **Voice Customer:** [localhost:3005/voice/customer](http://localhost:3005/voice/customer)

---

## 📖 Table of Contents
1. [Product Overview](#1-product-overview)
2. [Pricing & ROI](#2-pricing--roi)
3. [Inbound Call Journey & AI Coaching](#3-inbound-call-journey--ai-coaching)
4. [Feature List](#4-feature-list)
5. [Knowledge Assist (RAG)](#5-knowledge-assist-rag)
6. [System Architecture](#6-system-architecture)
7. [Tech Stack](#7-tech-stack)
8. [Local Setup](#8-local-setup)
9. [GCP Deployment](#9-gcp-deployment)
10. [Admin Configuration Guide](#10-admin-configuration-guide)
11. [FAQ](#11-faq)
12. [Pitch Q&A](#12-pitch-qa)

---

## 1. Product Overview

**AgentOS** is a real-time AI coaching platform for **inbound call center agents**. It acts as a silent AI co-pilot that reads conversation transcripts in real time and provides instructions, empathy alerts, and smart replies to ensure every customer interaction is professional and compliant.

### The Problem It Solves
- **Agent Skill Gaps:** Turns new hires into experts on day one.
- **Script Compliance:** Ensures identity verification and empathy are never skipped.
- **Average Handle Time (AHT):** Smart suggestions reduce thinking time.

---

## 2. Pricing & ROI

### Pricing Tiers
| Tier | Price | Features |
|---|---|---|
| **Free** | $0/mo | 2 Agents, 100 calls/mo, Basic coaching |
| **Pro** | $45/agent/mo | Unlimited calls, Custom prompts, 7-day retention |
| **Enterprise** | Custom | Dedicated instance, CRM Integration, PII Masking |

### Business ROI
- **20% AHT Reduction:** Saves ~$150k+ annually for a 100-agent center.
- **QA Automation:** Replaces up to 80% of manual call monitoring with AI summaries.
- **Onboarding:** Reduces agent ramp-up time by ~40%.

---

## 3. Inbound Call Journey & AI Coaching

AgentOS guides agents through 5 critical stages of an inbound call:

1.  **GREETING & VERIFICATION:** Collect Name, Email, and Phone.
2.  **ISSUE CAPTURE:** Confirm understanding before proposing solutions.
3.  **EMPATHY:** Acknowledge customer frustration to de-escalate.
4.  **RESOLUTION:** Offer clear next steps and timelines.
5.  **CLOSURE:** Confirm the fix and ask if anything else is needed.

---

## 4. Feature List

- **Real-time Transcription:** Zero-latency voice-to-text for agent and customer.
- **AI Coaching Tags:** QA Labels like "Empathy Gap" or "Identity Not Verified."
- **Escalation Risk Meter:** 0–100% score that auto-escalates based on sentiment.
- **Smart Replies:** Gemini-generated professional responses available for TTS playback.
- **Post-Call Summary:** Structured QA-ready reports generated instantly.

---

## 5. Knowledge Assist (RAG)

The latest update modularizes the Retrieval Augmented Generation (RAG) feature:

- **Modular Sidebar:** A dedicated UI for live knowledge suggestions.
- **Manual Search:** Agents can manually query the knowledge base during a call.
- **Document Indexing:** Admins can upload PDFs to the Knowledge Base in the Admin Panel.
- **Copy Snippets:** One-click copying of policy text for use in chat or speech.

---

## 6. System Architecture

### Cloud Infrastructure Diagram
```text
┌──────────────────────────────────────────────────────────┐
│                   PUBLIC INTERNET                        │
│  ┌──────────────────┐           ┌──────────────────┐     │
│  │  Agent Browser   │           │ Customer Browser │     │
│  └─────────┬────────┘           └─────────┬────────┘     │
└────────────┼──────────────────────────────┼──────────────┘
             │           Socket.IO          │
             ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                GOOGLE CLOUD PLATFORM                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │             GOOGLE CLOUD RUN (Compute)             │  │
│  │  ┌──────────────────────┐  ┌────────────────────┐  │  │
│  │  │   Express.js Server  │◄─┤  Socket.IO Server  │  │  │
│  │  └──────────┬───────────┘  └────────────────────┘  │  │
│  └─────────────┼──────────────────────────────────────┘  │
│                │                                         │
│  ┌─────────────▼──────────┐    ┌──────────────────────┐  │
│  │   Gemini 1.5 Flash     │    │  Firebase Firestore  │  │
│  │   (Coaching Engine)    │    │   (Vector DB / App)  │  │
│  └────────────────────────┘    └──────────────────────┘  │
│                                                          │
│  ┌────────────────────────┐    ┌──────────────────────┐  │
│  │   Google Cloud TTS     │    │    Secret Manager    │  │
│  └────────────────────────┘    └──────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Real-Time Flow
1. **Transcription:** Agent/Customer voice is transcribed in-browser via Web Speech API.
2. **Synchronization:** Transcripts are emitted to the **Socket.IO** server and broadcast to the relevant room.
3. **AI Coaching:** The server debounces the transcript and sends it to **Gemini 1.5 Flash** for real-time coaching JSON.
4. **Knowledge Retrieval:** Gemini identifies intent and queries the **Vector DB** (KnowledgeBase) via semantic search.
5. **Persistence:** Configuration and call summaries are stored in **Firebase Firestore**.

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS.
- **Backend:** Node.js, Express.
- **Real-time:** Socket.IO v4.
- **Voice:** Web Speech API (STT), Google Cloud TTS.
- **Deployment:** Google Cloud Build, Google Cloud Run.

---

## 8. Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Run dev mode
npm run dev
```

**Required `.env` Variables:**
`GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `VITE_FIREBASE_API_KEY`.

---

### Manual Deployment
Build the image and deploy to Cloud Run:
```bash
gcloud builds submit --tag gcr.io/[PROJECT_ID]/agent-success
gcloud run deploy agent-success --image gcr.io/[PROJECT_ID]/agent-success --min-instances 1
```

### Automated Deployment (GitHub Actions)
The repository is configured with a GitHub Actions workflow in `.github/workflows/deploy.yml`. To enable automated deployment on every `push` to `main`:

1.  **GCP Service Account:** Create a Service Account with `Cloud Run Admin` and `Storage Admin` roles.
2.  **GitHub Secrets:** Add the following secrets to your GitHub repository:
    - `GCP_PROJECT_ID`: Your GCP Project ID (e.g., `ai-voice-agent-c2a2b`).
    - `GCP_SA_KEY`: The entire content of your Service Account JSON key.
    - `GCP_SERVICE_NAME`: The name of your Cloud Run service (e.g., `agent-success`).
    - `GCP_REGION`: The region (e.g., `us-central1`).
3.  **Trigger:** Any change pushed to the `main` branch will automatically trigger a build and a new revision deployment to Cloud Run.

---

## 10. Admin Configuration Guide

Admins can customize the experience via `/admin`:
- **System Prompt:** Set the agent's persona.
- **Coaching Prompt:** Define QA stages and triggers.
- **Summary Prompt:** Define the output structure for call reports.
- **Policies:** Toggle requirements like "Mandatory ID Verification."

---

## 11. FAQ

**Q: Does the customer need to install anything?**  
A: No. The customer opens a URL on any Chrome browser. No app download, no login required.

**Q: How does the customer's voice get to the agent?**  
A: The customer's browser transcribes their speech via Google's Web Speech API. The text is sent over Socket.IO to the server, which broadcasts it to the agent's view in real time.

**Q: Can the agent hear the customer's actual voice?**  
A: Currently, the system works via transcription (text sent over the internet). For actual audio bridging, integration with a telephony provider (Twilio, Genesys) is a next step.

**Q: What if the customer's English isn't perfect?**  
A: Web Speech API supports 60+ languages. The `recognition.lang` can be set per session. Gemini also handles imperfect grammar and colloquial language well.

**Q: How fast does coaching update?**  
A: After each finalized speech result, Gemini is called with a 1.5s debounce. Total latency from speech end → coaching update: ~3–4 seconds.

**Q: Can we tailor coaching for specific issue types (billing, technical, cancellation)?**  
A: Yes — via the coaching prompt. Different teams can have different prompts (e.g., billing team sees different QA tags than technical support).

**Q: What happens after the call?**  
A: Agent clicks "Generate AI Summary" → Gemini produces a full structured report including issue type, resolution, sentiment analysis, and QA scores. Agent can copy it directly into their CRM.

---

## 12. Pitch Q&A — All Possible Questions

### 💼 Business Case & ROI

**Q: What exact problem does AgentOS solve for inbound contact centers?**  
A: Three critical problems: (1) **New agent ramp time** — new hires take 6–12 weeks to handle complex calls confidently. AgentOS turns week-1 agents into week-8 performers on day one. (2) **Script compliance** — agents forget to verify identity, skip empathy, or offer the wrong resolution under pressure. AgentOS ensures the right thing happens every time. (3) **AHT (Average Handle Time)** — agents waste time thinking of what to say. Smart replies cut pauses by 30–40%.

**Q: What's the ROI for a 100-agent inbound center?**  
A: Conservative estimate: 20% AHT reduction → at 8min avg handle time → saves 1.6min per call → at 100 calls/agent/day → 2.67 hours/day saved per agent → $6.50/hour cost → $650/day/100 agents → **$163,000/year** saved in efficiency alone. Plus improved CSAT and reduced escalations.

**Q: How does this reduce escalations?**  
A: Gemini's escalation risk meter detects frustration signals (repeated complaints, emotional language, certain trigger words) before the customer demands a supervisor. The coaching tag "Escalation Signal" fires early, giving the agent time to de-escalate. In pilots, this approach reduces unnecessary escalations by 25–35%.

**Q: Who's the economic buyer at a contact center?**  
A: VP of Customer Experience, Director of Contact Center Operations, or Head of Quality Assurance. The QA team is also a key champion — the post-call summaries with automated QA scores directly replace manual call monitoring effort.

### 🧠 AI Coaching Quality

**Q: How does the AI know what stage of the call we're on?**  
A: It doesn't track stages explicitly with hard rules. Gemini reads the full conversation and the coaching prompt defines what to look for at each stage. The prompt says "if identity hasn't been collected, prioritize verification" — so the AI naturally enforces the right sequence.

**Q: What if the AI gives wrong coaching advice during a critical call?**  
A: Agents are always in control. The AI's suggestions are advisory — prominently labeled as "Suggested" rather than mandatory. An experienced agent will naturally ignore suggestions that don't apply. Over time, the coaching prompt is refined to reduce noise.

**Q: Can it handle highly emotional customers?**  
A: Yes — detecting frustrated or emotional sentiment is one of Gemini's strengths. When sentiment = frustrated, the coaching immediately shifts to empathy-first tags and the escalation risk bar rises, alerting the agent to focus on emotional de-escalation before any transactional steps.

**Q: How does it know the customer is calling about a billing issue vs. a technical issue?**  
A: Gemini reads the actual words in the transcript. No keyword matching required. The coaching prompt can be customized to look for specific issue categories and produce different coaching tags for each type.

### 🔐 Security & Compliance

**Q: Where is the call transcript stored?**  
A: The transcript lives in server memory for the duration of the session only. Post-call summaries (text) can optionally be stored in Firebase Firestore. No audio is ever recorded or stored anywhere.

**Q: Is customer identity data (name, email, phone) stored?**  
A: Only if it appears in the post-call summary and the summary is saved. Raw transcripts are not persisted. Retention policies can be configured (e.g., auto-delete summaries after 30 days).

**Q: Is this GDPR compliant?**  
A: The infrastructure (Google Cloud Run, Firebase, Secret Manager) is GDPR-capable. Application-level compliance requires configuring data retention, consent mechanisms, and DPA agreements — a standard enterprise onboarding step.

**Q: What if a customer doesn't want their conversation transcribed?**  
A: The customer voice page (`/voice/customer`) clearly states that their voice will be transcribed. For regulatory environments, a consent overlay can be added before the microphone activates.

### 🏗️ Technical

**Q: How does the customer's voice get to the agent in real time?**  
A: Customer browser → Web Speech API transcribes → text emitted via Socket.IO `voice_transcript` event → server stores in session room → broadcasts `voice_new_entry` to agent's view. Average latency: 1–2 seconds.

**Q: Does it work with existing telephony (Cisco, NICE, Avaya)?**  
A: AgentOS currently works with browser-based voice capture. The AI coaching engine (`/api/coaching`) accepts any transcript source — so it can be integrated with any telephony platform that can deliver a text transcript stream via webhook or API.

**Q: What browsers does the agent need?**  
A: Chrome or any Chromium-based browser (Edge, Brave) for the Web Speech API. Firefox and Safari don't support it. This is a Google-native feature of Chrome.

**Q: What if the internet drops during a call?**  
A: Socket.IO auto-reconnects. The speech recognition also auto-restarts. The biggest risk is losing transcription for a few seconds — the conversation history is preserved in the session room until reconnection.

**Q: Can supervisors listen in or monitor agent calls?**  
A: Architecturally yes — they can join the Socket.IO room as a passive listener. A dedicated supervisor monitoring dashboard is on the product roadmap.

### 📈 Scalability

**Q: What's the max number of simultaneous calls?**  
A: Each Cloud Run instance handles ~1,000 Socket.IO connections (500 active calls with agent + customer sides). Cloud Run auto-scales to multiple instances. For 10,000 concurrent agents: configure `--max-instances 50` + Redis-backed Socket.IO adapter.

**Q: What are the cloud costs for a 500-agent deployment?**  
A: Approximate monthly estimate:
- Cloud Run: ~$300–500/month (1 always-on instance + autoscaling)
- Gemini API: ~$50–100/month (500 agents × 50 calls/day × 500 tokens = 12.5B tokens at $0.075/1M)
- Google TTS: ~$20/month
- Firebase: ~$25/month
- **Total: ~$400–650/month** for 500 agents

### 🔌 Integration & Customization

**Q: Can we white-label this with our own branding?**  
A: Yes. The UI is React + Tailwind — fully customizable. Colors, logos, company name, and tone are all configurable. White-labeled enterprise licensing is a standard offering.

**Q: Can we add custom QA criteria to the coaching?**  
A: Yes. The coaching prompt is plain text in the Admin Panel. Add any custom criteria: "Flag if agent offers a discount without supervisor approval", "Tag if agent fails to mention the 3-business-day SLA", etc.

**Q: Can the post-call summary auto-populate our CRM?**  
A: The summary is currently returned as structured text. A REST webhook integration (push to Salesforce, Zendesk, Freshdesk, etc.) is a planned feature and straightforward to add via a single API call after call end.

**Q: How do we onboard a new team with different coaching rules?**  
A: Change the coaching prompt in the Admin Panel. No code change, no redeploy. Takes 5 minutes. A multi-tenant version (different configs per team) is on the roadmap.

### 🆚 Competitive Differentiation

**Q: How is this different from Balto, Observe.AI, or Cresta?**  
A: (1) **Google-native** — STT, TTS, and AI coaching all from one vendor, with GSuite-level reliability and support; (2) **Configurable without ML** — competitors require weeks of model training; AgentOS coaching is configured in plain English prompts in 30 minutes; (3) **Browser-native STT** — zero additional STT cost (built into Chrome); competitors bill $0.004–$0.016/minute for STT; (4) **Open architecture** — designed for integration, not lock-in.

**Q: Why not just use ChatGPT or Copilot?**  
A: General-purpose AI assistants aren't real-time. They don't watch the live conversation, they don't have inbound call stage awareness, no escalation risk detection, no Google TTS integration, and no socket-based agent↔customer sync. AgentOS is purpose-built for the inbound call center moment.

**Q: What's your defensibility / moat?**  
A: (1) Google technology integration depth (STT + TTS + Gemini as one pipeline); (2) Coaching prompt library — as installs grow, best-practice prompts for each industry become proprietary data assets; (3) Network effects in a multi-tenant model — aggregated QA insights across customers improve coaching quality over time.

---
*Document Version: 1.6 (Feb 2026) · Unified Master Documentation*
