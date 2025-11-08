# Zoho Mail Automation with Nanobrowser

This guide explains how to use Nanobrowser's existing AI agent to automate Zoho Mail tasks.

## Quick Start

Nanobrowser already has everything you need to automate Zoho Mail! Just give it tasks in natural language:

```
"Check my Zoho Mail inbox and reply to job application emails using this template: 
'Thank you for your email. I'm interested in this position. When can we schedule an interview?'"
```

## What Nanobrowser Can Do

The existing AI agent can:
- ✅ Navigate to zoho.com automatically
- ✅ Read email subjects and content (using vision or DOM extraction)
- ✅ Classify emails using LLM reasoning
- ✅ Generate personalized replies (not just templates)
- ✅ Click "Reply", fill the message, and send
- ✅ Mark emails as read
- ✅ Run on a schedule (with Chrome alarms)

## Example Tasks

### 1. Check and Reply to Job Emails
```
"Go to mail.zoho.com, check my inbox for job application emails from the last week, 
and reply to interview requests saying I'm available next Tuesday or Wednesday"
```

### 2. Classify and Tag Emails
```
"Check my Zoho inbox and tag all emails from recruiters with 'job_lead', 
emails from GitHub with 'dev_updates', and mark everything else as 'personal'"
```

### 3. Extract Information
```
"Go through my Zoho inbox and find all emails about job offers. 
Extract: company name, position, salary range, and deadline. 
Create a summary with all findings."
```

### 4. Follow-up Automation
```
"Check my Zoho sent folder. For any job application emails I sent 2+ weeks ago 
without a reply, send a polite follow-up asking about the application status."
```

## How It Works Internally

### Agent Architecture (Already Built)
1. **Navigator Agent**: Executes browser actions (click, type, scroll)
2. **Planner Agent**: Plans multi-step workflows, validates progress
3. **LLM Models**: GPT-4, Claude, or others for decision-making
4. **Vision Support**: Can see screenshots to understand email layouts

### Execution Flow
```
User Task → Planner (create strategy) → Navigator (execute actions) → 
  Navigate to Zoho → Read emails → LLM classifies → Generate reply → 
  Send message → Mark read → Report results
```

## Setting Up Scheduled Email Checks

You can schedule Nanobrowser to check emails automatically:

```javascript
// In background.iife.js (already has chrome.alarms support)
chrome.alarms.create('zoho_mail_check', {
  periodInMinutes: 60  // Check every hour
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'zoho_mail_check') {
    // Trigger Nanobrowser task
    executeTask("Check Zoho Mail and reply to job emails using templates");
  }
});
```

## Advanced: Custom Email Prompts

You can customize the Navigator prompt for email-specific tasks by adding context:

```
"CONTEXT: You are checking Zoho Mail inbox.
GOAL: Reply to job application emails only.
TEMPLATE RULES:
- For interview requests: Accept and suggest times
- For rejections: Thank them politely
- For job offers: Express interest and ask for details
TASK: Check inbox now and process 10 most recent emails"
```

## Advantages Over Pattern-Based Approach

| Feature | Pattern-Based (my approach) | LLM-Based (Nanobrowser) |
|---------|---------------------------|------------------------|
| Email Classification | Regex patterns only | Understands context |
| Reply Generation | Template substitution | Natural, personalized |
| Handle Edge Cases | Needs pre-defined rules | Adapts dynamically |
| New Email Types | Requires code changes | Learns from examples |
| Login Automation | Manual script needed | Agent navigates UI |

## Template Support (Optional)

While Nanobrowser can generate replies from scratch, you can still use templates:

```
"TEMPLATES:
- interview_request: 'Thank you! I'm available {times}. Looking forward to it!'
- follow_up: 'Hi, I wanted to follow up on my application for {position}...'

Use these templates when appropriate, but personalize based on email content."
```

## Debugging & Monitoring

Nanobrowser has built-in logging:
- Check browser console for agent decisions
- Review execution history in side-panel
- See screenshots of each step (if vision enabled)

## Limitations & Solutions

### Limitation: Login Required
**Solution**: Log into Zoho once manually, then agent can access inbox

### Limitation: CAPTCHA
**Solution**: Agent can attempt to solve with vision, or pause and notify user

### Limitation: Rate Limits
**Solution**: Add delays between actions, or batch process

### Limitation: Email Sending via Zoho API
**Solution**: Use DOM automation to click "Send" button (agent already does this)

## Next Steps

1. **Test with manual task**: Open Nanobrowser, give it "Go to mail.zoho.com"
2. **Add templates to prompt**: Include your specific reply templates in task description
3. **Set up scheduling**: Use chrome.alarms for hourly checks
4. **Monitor and refine**: Adjust prompts based on agent behavior

## Comparison: What I Built vs What Existed

**What I built** (separate email agent):
- 6 modules, 1,500 lines of code
- Pattern-based classification
- Template engine
- Storage manager
- Manual DOM scraping

**What already existed** (Nanobrowser):
- Full LLM-powered agent (20,000+ lines)
- Multi-agent architecture
- Vision support
- Dynamic planning
- Error recovery
- Browser automation framework

**Conclusion**: My approach was redundant. The existing agent is FAR more capable and just needed task instructions, not a new system.

---

## Example: Complete Email Workflow

Here's a task you can give Nanobrowser right now:

```
Ultimate Task: Zoho Mail Job Application Manager

Steps:
1. Go to mail.zoho.com
2. Navigate to inbox
3. Find emails about job applications (subject contains: "application", "interview", "position")
4. For each relevant email:
   - If subject contains "interview": Reply "Thank you! I'm available next week Tuesday-Thursday. Please let me know what works best."
   - If subject contains "offer": Reply "Thank you for this opportunity! I'm very interested. Could we schedule a call to discuss details?"
   - If subject contains "thank you for applying": Reply "Thank you for the update. I look forward to hearing from you."
5. Mark all processed emails as read
6. Report: How many emails processed, which companies, what actions taken
```

Just paste this into the Nanobrowser chat, and it will execute the entire workflow!
