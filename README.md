# Pranav P. Nambiar — Portfolio

A portfolio with a live 3D background, a lightweight visitor gate and automatic resume delivery.

1. A visitor enters their name and Gmail. Phone number is not requested.
2. They're let straight in — no emailed code, nothing to type back.
3. You receive the visitor details by email. Owner notifications use Resend so the visitor name is the sender display name and their email is Reply-To.
4. When they ask for the resume, it is emailed to the Gmail they entered and **you are notified**.

Read `docs/VISITOR-VERIFICATION.md` for what is and is not verified, and the daily email limits.
The 3D scene is described in `docs/3D-BACKGROUND.md`.

---

## Pick one of two setups

You do **not** need both. Choose based on where you want to host.

| | **A. Apps Script** | **B. Node server** |
|---|---|---|
| Cost | Free | Free tier on Render/Railway, or your own VPS |
| Setup time | ~5 min | ~10 min |
| Hosting | Any static host (Netlify, Vercel, GitHub Pages) | Needs a Node host |
| Where leads land | Google Sheet + Gmail | `data/leads.csv` + Gmail |
| Uses `.env` | No | Yes |
| Send limit | 100/day | 500/day |

**If you're unsure, pick A.** It's fewer moving parts and there's no server to
keep alive. Everything in `apps-script/` and `docs/SETUP-GMAIL.md` covers it.

---

## A. Apps Script (no backend)

1. Follow **`docs/SETUP-GMAIL.md`** start to finish.
2. Paste the Web App URL into `public/index.html` → search for
   `PORTFOLIO_CONFIG` → set `endpoint`.
3. Upload `public/index.html` to any static host. Done.

Nothing else in this folder matters for route A — no `npm install`, no `.env`.

---

## B. Node server

Full walkthrough in **`docs/SETUP-NODE.md`**. Short version:

```bash
cp .env.example .env     # then fill in GMAIL_APP_PASSWORD
npm install
cp ~/path/to/your-resume.pdf assets/resume.pdf
npm start
```

Open <http://localhost:3000>. Leave `PORTFOLIO_CONFIG.endpoint` as `""` —
the page falls back to `/api/submit` on the same origin automatically.

Check <http://localhost:3000/api/health> to confirm the mailer and resume file
were both found before you go live.

---

## Project layout

```
pranav-portfolio/
├── .env.example          Template for your secrets — copy to .env
├── .gitignore            Keeps .env and visitor data out of git
├── package.json
├── public/
│   └── index.html        The whole site (self-contained)
├── server/
│   └── server.js         Node backend: validation, email, lead log
├── assets/
│   └── resume.pdf        ← put your resume here (route B)
├── data/
│   └── leads.csv         Created on first submission (gitignored)
├── apps-script/
│   └── Code.gs           Google Apps Script backend (route A)
└── docs/
    ├── SETUP-GMAIL.md    Route A walkthrough
    ├── SETUP-NODE.md     Route B walkthrough
    └── DEPLOY.md         Putting it on a real domain
```

---

## Settings you'll probably want to change

In `public/index.html`, near the bottom:

```js
window.PORTFOLIO_CONFIG = {
  endpoint : "",        // Apps Script URL, or "" to use the Node server
  resumeUrl: "",        // optional public PDF link to also open in a tab
  requireGmail: true    // false = accept work emails too
};
```

### Making sure the resume actually reaches people

There are two ways the PDF can get to a visitor, and you should set up at
least one of them or they'll see "the resume is not published yet":

| | Where to set it | What the visitor gets |
|---|---|---|
| **Attachment** | `assets/resume.pdf` (Node) or `RESUME_FILE_ID` (Apps Script) | The PDF in their inbox |
| **Link fallback** | `RESUME_URL` in `.env` or `Code.gs` | An email with an *Open my resume* button |

If both are set, the attachment is used and the link is the safety net. You
get a notification email naming the person either way. Check
`/api/health` (Node) or open your Web App URL (Apps Script) to see which
route is live.

`requireGmail: true` is what you asked for, but it's worth knowing the
trade-off: most recruiters and hiring managers use a company address, not a
personal Gmail. Setting it to `false` will get you noticeably more real
contacts. It's a one-word change whenever you want.

---

## Two honest caveats

**The gate is lead capture, not security.** It runs in the visitor's browser.
Anyone who opens developer tools can switch it off and read the page. What it
reliably does is collect details from people who are genuinely interested —
which is the actual goal. Anything that truly must not leak should not be in
the HTML at all. Your resume isn't: it's emailed from the server on request, so
the PDF never sits in the page source.

**A gate in front of everything will cost you visitors.** Some people bounce
rather than fill in a form, and search engines and link previews won't see your
content either. A common middle ground is leaving the portfolio open and gating
only the resume. To switch to that, delete `class="gate-locked"` from the
`<html>` tag on line 2 of `public/index.html`. Everything else keeps working.

---

## Troubleshooting: "I don't see the gate"

- When you run `npm start`, the terminal prints **Visitor gate: ON**. If it says OFF, you are running an old `public/index.html`.
- The gate asks for name, Gmail and phone **every time** the site is opened or refreshed. Nothing is remembered in the browser.
