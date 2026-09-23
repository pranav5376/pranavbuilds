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
        message: 'Portfolio endpoint is live - VERSION 2.'
      })
    )
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}