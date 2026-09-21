/* Generated from the shared validator — keep identical to the copies in public/index.html and apps-script/Code.gs. */
/* ===== BEGIN SHARED VALIDATOR (identical copy lives in the page, server/validate.js and Code.gs) ===== */
function vBad(message) { return { ok: false, message: message }; }

function vRunLen(str, test) {               // longest run of chars satisfying test()
  var best = 0, cur = 0;
  for (var i = 0; i < str.length; i++) { if (test(str.charAt(i), i)) { cur++; if (cur > best) best = cur; } else cur = 0; }
  return best;
}

function checkName(raw) {
  var n = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (n.length < 4 || n.length > 60) return vBad("Please enter your full name (first and last name).");
  if (!/^[\p{L}][\p{L}\p{M}.'\- ]*$/u.test(n)) return vBad("Names can only contain letters, spaces, dots, hyphens and apostrophes.");
  var words = n.split(" ");
  if (words.length < 2) return vBad("Please enter both your first and last name.");
  var longest = 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i].replace(/[^\p{L}]/gu, "");
    if (w.length > longest) longest = w.length;
  }
  if (longest < 2) return vBad("Please enter your full name, not just initials.");
  var BLOCK = { test: 1, testing: 1, tester: 1, asdf: 1, asdfgh: 1, qwerty: 1, fake: 1, abcd: 1, abc: 1, xyz: 1, xxx: 1,
                admin: 1, demo: 1, sample: 1, unknown: 1, anonymous: 1, lorem: 1, ipsum: 1, user: 1, username: 1,
                name: 1, firstname: 1, lastname: 1, nobody: 1, none: 1, null: 1, dummy: 1, random: 1, guest: 1 };
  var low = n.toLowerCase();
  if (low === "john doe" || low === "jane doe") return vBad("Please enter your real name.");
  for (var j = 0; j < words.length; j++) {
    var lw = words[j].toLowerCase().replace(/[^\p{L}]/gu, "");
    if (BLOCK[lw] === 1) return vBad("Please enter your real name.");
    if (/^(qwer|asdf|zxcv|wasd|hjkl|uiop|qazw)/.test(lw)) return vBad("Please enter your real name.");
    if (/(\p{L})\1{3,}/u.test(lw)) return vBad("Please enter your real name.");
    if (/^[a-z]+$/.test(lw)) {                      // Latin-script words only: real names have vowels and no long consonant runs
      if (lw.length >= 5 && !/[aeiouy]/.test(lw)) return vBad("Please enter your real name.");
      if (vRunLen(lw, function (c) { return "aeiouy".indexOf(c) < 0; }) >= 6) return vBad("Please enter your real name.");
    }
  }
  return { ok: true, value: n };
}

function checkEmail(raw, requireGmail) {
  var e = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return vBad("Please enter a valid email address.");
  var at = e.lastIndexOf("@"), local = e.slice(0, at), domain = e.slice(at + 1);
  if (requireGmail && domain !== "gmail.com") return vBad("Please use your Gmail address (ending in @gmail.com).");
  var canon = e;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    var base = local.split("+")[0];
    if (!/^[a-z0-9](?:[a-z0-9.]{4,28})[a-z0-9]$/.test(base) || base.indexOf("..") >= 0) return vBad("That Gmail address does not look valid.");
    var flat = base.replace(/\./g, "");
    if (/^(test|testing|tester|fake|asdf|asdfgh|qwerty|abcdef|abcd|admin|user|demo|sample|example|noreply|xyzxyz|none|null|dummy|random|guest|nobody|email|mail|gmail)\d*$/.test(flat)) return vBad("Please use your real Gmail address.");
    if (/(.)\1{4,}/.test(flat)) return vBad("Please use your real Gmail address.");
    canon = flat + "@gmail.com";
  }
  return { ok: true, value: e, canon: canon };
}

function vSequential(d) {                            // ascending / descending run of 8+ digits (12345678, 98765432)
  var up = 1, down = 1;
  for (var i = 1; i < d.length; i++) {
    var diff = d.charCodeAt(i) - d.charCodeAt(i - 1);
    up = diff === 1 ? up + 1 : 1; down = diff === -1 ? down + 1 : 1;
    if (up >= 8 || down >= 8) return true;
  }
  return false;
}

function checkPhone(raw) {
  var s = String(raw == null ? "" : raw).trim();
  if (!/^\+?[\d\s().\-]+$/.test(s)) return vBad("Use digits only, with an optional + country code.");
  var plus = s.charAt(0) === "+", d = s.replace(/\D/g, ""), national = d, cc = "";
  if (plus) {
    if (d.length < 8 || d.length > 15) return vBad("Please enter a valid phone number with country code.");
    if (d.indexOf("91") === 0 && d.length === 12) { cc = "91"; national = d.slice(2); }
  } else if (d.length === 12 && d.indexOf("91") === 0) { cc = "91"; national = d.slice(2); }
  else if (d.length === 11 && d.charAt(0) === "0") { cc = "91"; national = d.slice(1); }
  else if (d.length === 10) { cc = "91"; national = d; }
  else if (d.length < 8 || d.length > 15) return vBad("Please enter a valid phone number.");

  if (cc === "91" && !/^[6-9]\d{9}$/.test(national)) return vBad("Enter a valid 10-digit mobile number (it starts with 6, 7, 8 or 9).");

  var uniq = {}, count = 0;
  for (var i = 0; i < national.length; i++) { var c = national.charAt(i); if (!uniq[c]) { uniq[c] = 1; count++; } }
  var KNOWN = { "1234567890": 1, "0123456789": 1, "9876543210": 1, "0987654321": 1, "1234567": 1, "12345678": 1, "123456789": 1 };
  if (KNOWN[national] === 1 || count < 4 || /(\d)\1{5,}/.test(national) || vSequential(national) || /^(\d\d)\1{3,}/.test(national) || /^(\d{3})\1{2,}/.test(national)) {
    return vBad("That phone number does not look real. Please enter your own number.");
  }
  var pretty = cc === "91" ? "+91 " + national.slice(0, 5) + " " + national.slice(5) : (plus ? "+" : "") + d;
  return { ok: true, value: pretty, digits: d };
}
/* ===== END SHARED VALIDATOR ===== */
export { checkName, checkEmail, checkPhone };
