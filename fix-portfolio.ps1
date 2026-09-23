# ============================================================
# Portfolio fix script
# Run this from VS Code's terminal, inside your project folder
# (the folder that contains index.html and code.gs)
# ============================================================

$ErrorActionPreference = "Stop"

# ---------- 1. Fix index.html ----------
$htmlPath = ".\index.html"

if (-not (Test-Path $htmlPath)) {
    Write-Host "ERROR: index.html not found at $htmlPath. Edit `$htmlPath at the top of this script." -ForegroundColor Red
    exit 1
}

$html = Get-Content -Raw -Path $htmlPath

# Backup first
Copy-Item $htmlPath "$htmlPath.bak" -Force
Write-Host "Backed up original to index.html.bak" -ForegroundColor Yellow

# Fix A: the missing </script> tag that breaks the contact form entirely.
# The V10 skill-background script never closes before the next <script> opens,
# which causes a JS syntax error and stops the contact form's submit
# listener from ever attaching.
$before = $html
$html = $html -replace [regex]::Escape("  update();`r`n})();`r`n<script>  "), "  update();`r`n})();`r`n</script>`r`n`r`n<script>  "
if ($html -eq $before) {
    Write-Host "WARNING: Fix A (missing </script>) pattern not found - may already be fixed, or line endings differ." -ForegroundColor Yellow
} else {
    Write-Host "Fix A applied: closed the stray <script> tag." -ForegroundColor Green
}

# Fix B: remove the leftover debug alert that pops up on every submit attempt.
$before = $html
$html = $html -replace [regex]::Escape("  alert('FORM SUBMIT DETECTED');`r`n"), ""
if ($html -eq $before) {
    Write-Host "WARNING: Fix B (debug alert) pattern not found - may already be removed." -ForegroundColor Yellow
} else {
    Write-Host "Fix B applied: removed the debug alert." -ForegroundColor Green
}

Set-Content -Path $htmlPath -Value $html -NoNewline
Write-Host "index.html saved." -ForegroundColor Green
Write-Host ""

# ---------- 2. Write corrected code.gs ----------
$gsPath = ".\code.gs"

if (Test-Path $gsPath) {
    Copy-Item $gsPath "$gsPath.bak" -Force
    Write-Host "Backed up original to code.gs.bak" -ForegroundColor Yellow
}

@'
var OWNER_EMAIL = 'pranavnambiar5376@gmail.com';

var RESUME_DRIVE_FILE_ID = '1Y0r4vGRlCXE5xfgtRavIm8LOKp3qv8Ts';
var RESUME_LINK = 'https://drive.google.com/file/d/1Y0r4vGRlCXE5xfgtRavIm8LOKp3qv8Ts/view?usp=drive_link';

function doPost(e) {
  try {

    var params = parseRequest_(e);

    var name = (params.name || '').trim();
    var email = (params.email || '').trim();
    var message = (params.message || '').trim();

    var isResumeRequest =
      params.action === 'resume' ||
      params.deliverResume === true ||
      params.deliverResume === 'true';

    if (!name || !email || (!isResumeRequest && !message)) {
      return jsonOutput({
        ok: false,
        message: 'Missing required fields.'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonOutput({
        ok: false,
        message: 'Invalid email address.'
      });
    }

    if (isResumeRequest) {
      return handleResumeRequest(name, email);
    }

    return handleContactMessage(name, email, message);

  } catch (err) {

    return jsonOutput({
      ok: false,
      message: err.toString()
    });

  }
}

// The site sends the form data as a JSON string in a text/plain POST body
// (this avoids a CORS preflight, which Apps Script cannot answer). That
// means the fields show up in e.postData.contents, NOT in e.parameter -
// e.parameter is only populated for application/x-www-form-urlencoded
// bodies or query-string parameters. Read whichever is actually present.
function parseRequest_(e) {
  var params = {};

  if (e && e.parameter) {
    for (var k in e.parameter) {
      params[k] = e.parameter[k];
    }
  }

  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var key in body) {
        if (body[key] !== undefined && body[key] !== null) {
          params[key] = body[key];
        }
      }
    } catch (parseErr) {
      // Not JSON - a real form-urlencoded submit. e.parameter already has it.
    }
  }

  return params;
}

function handleContactMessage(name, email, message) {

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Portfolio Contact Form',
    body:
      'NEW CONTACT FORM MESSAGE\n\n' +
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n\n' +
      'Message:\n' +
      message,
    replyTo: email
  });

  return jsonOutput({
    ok: true,
    message: 'Message sent successfully.'
  });
}

function handleResumeRequest(name, email) {

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: 'Resume Download Request',
    body:
      'A visitor downloaded your resume.\n\n' +
      'Name: ' + name + '\n' +
      'Email: ' + email
  });

  if (RESUME_DRIVE_FILE_ID) {

    var file = DriveApp.getFileById(RESUME_DRIVE_FILE_ID);

    MailApp.sendEmail({
      to: email,
      subject: 'Pranav Nambiar Resume',
      body:
        'Hi ' + name + ',\n\n' +
        'Thank you for your interest.\n\n' +
        'My resume is attached.\n\n' +
        'Regards,\n' +
        'Pranav Nambiar',
      attachments: [file.getAs(MimeType.PDF)]
    });

    return jsonOutput({
      ok: true,
      mode: 'attachment',
      message: 'Resume sent.'
    });
  }

  if (RESUME_LINK) {

    MailApp.sendEmail({
      to: email,
      subject: 'Pranav Nambiar Resume',
      body:
        'Hi ' + name + ',\n\n' +
        'Download my resume here:\n\n' +
        RESUME_LINK +
        '\n\nRegards,\nPranav Nambiar'
    });

    return jsonOutput({
      ok: true,
      mode: 'link',
      message: 'Resume sent.'
    });
  }

  return jsonOutput({
    ok: false,
    message: 'Resume source not configured.'
  });
}

function doGet() {
  return ContentService
    .createTextOutput(
      JSON.stringify({
        ok: true,
        message: 'Portfolio endpoint is live.'
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
'@ | Set-Content -Path $gsPath -Encoding UTF8

Write-Host "code.gs written." -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "DONE. Two manual steps left:" -ForegroundColor Cyan
Write-Host "1. Commit + push index.html and redeploy on Vercel (or just" -ForegroundColor Cyan
Write-Host "   git push if it auto-deploys)." -ForegroundColor Cyan
Write-Host "2. Open script.google.com, open this project, paste the new" -ForegroundColor Cyan
Write-Host "   code.gs content (or open the code.gs file it just wrote)," -ForegroundColor Cyan
Write-Host "   then Deploy > Manage deployments > Edit (pencil) > New" -ForegroundColor Cyan
Write-Host "   version > Deploy. The endpoint URL stays the same." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
