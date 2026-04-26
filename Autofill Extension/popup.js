// ─────────────────────────────────────────────────────────
// popup.js — Profile management + Resume parser + UI logic
// ─────────────────────────────────────────────────────────

const PROFILE_KEY = 'job_autofill_profile';

// ── Profile field IDs → storage keys ─────────────────────
const FIELDS = {
  pName:        'name',
  pEmail:       'email',
  pPhone:       'phone',
  pExp:         'experience',
  pCompany:     'currentCompany',
  pRole:        'currentRole',
  pCurrentCtc:  'currentCtc',
  pExpectedCtc: 'expectedCtc',
  pNotice:      'noticePeriod',
  pLinkedin:    'linkedin',
  pSkills:      'skills',
  pEducation:   'education',
};

// ── Resume parser ─────────────────────────────────────────
function parseResume(text) {
  const profile = {};

  // Email
  const emailM = text.match(/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}/);
  if (emailM) profile.email = emailM[0].toLowerCase();

  // Phone — Indian mobile (6-9 prefix, 10 digits), optional +91 or 0
  const phoneM = text.match(/(?:\+91[\s\-]?|0)?[6-9]\d{9}/);
  if (phoneM) {
    let p = phoneM[0].replace(/[\s\-]/g, '');
    if (!p.startsWith('+')) p = '+91' + p.replace(/^0?(91)?/, '').slice(-10);
    profile.phone = p;
  }

  // Name — first short line without special chars or keywords
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    const isName =
      !line.match(/@|\d{5,}|http|linkedin|github|address|email|phone|mobile|summary|objective|profile|resume|cv/i) &&
      line.split(/\s+/).length >= 2 &&
      line.split(/\s+/).length <= 5 &&
      line.length >= 4 && line.length <= 50;
    if (isName) { profile.name = line; break; }
  }

  // Total experience
  const expPatterns = [
    /(\d+(?:\.\d+)?)\s*\+?\s*years?\s+of\s+(?:total\s+)?(?:work\s+)?experience/i,
    /total\s+(?:work\s+)?experience[\s:–]+(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:yrs?|years?)\s+(?:total|overall|of\s+experience)/i,
    /experience[\s:–]+(\d+(?:\.\d+)?)\s*(?:yrs?|years?)/i,
  ];
  for (const p of expPatterns) {
    const m = text.match(p);
    if (m) { profile.experience = m[1]; break; }
  }

  // Current company
  const companyPatterns = [
    /(?:currently\s+(?:working\s+)?at|working\s+at|employed\s+at|present\s+company|current\s+(?:company|employer|organization))[\s:–]+([^\n|•,]+)/i,
    /(?:company|organization|employer)[\s:–]+([^\n|•,]+)/i,
  ];
  for (const p of companyPatterns) {
    const m = text.match(p);
    if (m) { profile.currentCompany = m[1].trim().slice(0, 60); break; }
  }

  // Current role / designation
  const rolePatterns = [
    /(?:current\s+)?(?:designation|role|position|title)[\s:–]+([^\n|•,]+)/i,
    /(?:working\s+as|currently\s+as)[\s:–]+([^\n|•,]+)/i,
  ];
  for (const p of rolePatterns) {
    const m = text.match(p);
    if (m) { profile.currentRole = m[1].trim().slice(0, 60); break; }
  }

  // Education — grab MBA/BTech line
  const eduPatterns = [
    /(?:MBA|PGDM|B\.?Tech|B\.?E\.?|M\.?Tech|B\.?Sc|M\.?Sc|Ph\.?D)[^\n]{5,60}/i,
  ];
  for (const p of eduPatterns) {
    const m = text.match(p);
    if (m) { profile.education = m[0].trim().replace(/\s+/g, ' '); break; }
  }

  // Skills — extract the skills section content
  const skillsM = text.match(/(?:^|\n)(?:key\s+)?skills?[\s:–]+(.+?)(?:\n\n|\n[A-Z][a-z]|$)/is);
  if (skillsM) {
    profile.skills = skillsM[1]
      .replace(/[\n•\-\|]/g, ',')
      .split(',').map(s => s.trim()).filter(s => s.length > 1)
      .slice(0, 15).join(', ');
  }

  // LinkedIn URL
  const liM = text.match(/(?:linkedin\.com\/in\/[\w\-]+)/i);
  if (liM) profile.linkedin = 'https://www.' + liM[0];

  // Notice period
  const noticeM = text.match(/(?:notice\s+period|available\s+in)[\s:–]+(\d+\s*(?:days?|weeks?|months?))/i);
  if (noticeM) profile.noticePeriod = noticeM[1].trim();

  // CTC
  const ctcM = text.match(/(?:current\s+ctc|ctc|salary)[\s:–]+(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|l\.?p\.?a|lakhs?)/i);
  if (ctcM) profile.currentCtc = ctcM[1];

  const expCtcM = text.match(/(?:expected\s+ctc|expected\s+salary)[\s:–]+(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|l\.?p\.?a|lakhs?)/i);
  if (expCtcM) profile.expectedCtc = expCtcM[1];

  return profile;
}

// ── Load / Save profile ───────────────────────────────────
function loadProfile(cb) {
  chrome.storage.local.get([PROFILE_KEY], (res) => cb(res[PROFILE_KEY] || {}));
}

function saveProfile(profile, cb) {
  chrome.storage.local.set({ [PROFILE_KEY]: profile }, cb);
}

// ── Fill profile form fields ──────────────────────────────
function renderProfile(profile) {
  for (const [elId, key] of Object.entries(FIELDS)) {
    const el = document.getElementById(elId);
    if (!el) continue;
    el.value = profile[key] || '';
    el.classList.toggle('auto', !!(profile[key]));
  }
}

// ── Profile preview in Autofill tab ──────────────────────
function renderPreview(profile) {
  const container = document.getElementById('profilePreview');
  const LABELS = {
    name: 'Name', email: 'Email', phone: 'Phone',
    experience: 'Experience (yrs)', currentCompany: 'Current Company',
    currentRole: 'Role', currentCtc: 'Current CTC', expectedCtc: 'Expected CTC',
    noticePeriod: 'Notice Period',
  };

  const rows = Object.entries(LABELS).map(([key, label]) => {
    const val = profile[key];
    return `
      <div class="field-row">
        <span class="field-key">${label}</span>
        <span class="field-val ${val ? '' : 'empty'}">${val || 'not set'}</span>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="autofill-section">
      <h3>Profile Summary</h3>
      <div class="field-list">${rows}</div>
    </div>`;
}

// ── Show status message ───────────────────────────────────
function showStatus(elId, msg, type = 'success') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = `status ${type} show`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

// ── Platform detection ────────────────────────────────────
function detectPlatform(url = '') {
  if (url.includes('naukri.com'))   return { name: 'Naukri',   active: true };
  if (url.includes('iimjobs.com'))  return { name: 'IIMjobs',  active: true };
  if (url.includes('linkedin.com')) return { name: 'LinkedIn', active: true };
  return { name: 'Not on a supported page', active: false };
}

// ── Tab switching ─────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── On load ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Detect current platform
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const platform = detectPlatform(url);
    document.getElementById('platformName').textContent = platform.active
      ? `Active on ${platform.name}` : platform.name;
    document.getElementById('platformDot').classList.toggle('active', platform.active);
    document.getElementById('btnAutofill').disabled = !platform.active;
  });

  // Load and render profile
  loadProfile((profile) => {
    renderProfile(profile);
    renderPreview(profile);
  });
});

// ── Save profile ──────────────────────────────────────────
document.getElementById('btnSaveProfile').addEventListener('click', () => {
  const profile = {};
  for (const [elId, key] of Object.entries(FIELDS)) {
    const el = document.getElementById(elId);
    if (el && el.value.trim()) profile[key] = el.value.trim();
  }
  saveProfile(profile, () => {
    renderPreview(profile);
    showStatus('profileStatus', '✅ Profile saved!', 'success');
  });
});

// ── Parse resume ──────────────────────────────────────────
document.getElementById('btnParse').addEventListener('click', () => {
  const text = document.getElementById('resumeText').value.trim();
  if (!text || text.length < 50) {
    showStatus('parseStatus', '⚠️ Please paste your resume text first.', 'error');
    return;
  }

  const extracted = parseResume(text);
  const count = Object.keys(extracted).length;

  if (count === 0) {
    showStatus('parseStatus', '❌ Could not extract any details. Check your resume format.', 'error');
    return;
  }

  // Merge with existing profile (don't overwrite manually set values)
  loadProfile((existing) => {
    const merged = { ...extracted, ...existing }; // existing takes priority

    // But for empty fields, use extracted
    for (const [key, val] of Object.entries(extracted)) {
      if (!existing[key]) merged[key] = val;
    }

    saveProfile(merged, () => {
      renderProfile(merged);
      renderPreview(merged);
      // Switch to profile tab to show results
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="profile"]').classList.add('active');
      document.getElementById('tab-profile').classList.add('active');
      showStatus('profileStatus', `✅ Extracted ${count} fields! Review and save.`, 'success');
    });
  });
});

// ── Autofill current page ─────────────────────────────────
document.getElementById('btnAutofill').addEventListener('click', () => {
  loadProfile((profile) => {
    if (!Object.keys(profile).length) {
      showStatus('autofillStatus', '⚠️ No profile saved. Go to "My Profile" tab first.', 'error');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: triggerAutofill,
        args: [profile],
      }, (results) => {
        const result = results?.[0]?.result || {};
        if (result.filled > 0) {
          showStatus('autofillStatus', `✅ Filled ${result.filled} field(s)!`, 'success');
        } else if (result.skipped > 0) {
          showStatus('autofillStatus', `ℹ️ ${result.skipped} field(s) already filled — skipped.`, 'info');
        } else {
          showStatus('autofillStatus', '⚠️ No fillable fields found on this page.', 'error');
        }
      });
    });
  });
});

// ── Clear filled fields ───────────────────────────────────
document.getElementById('btnClear').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: clearAutofilled,
    }, () => showStatus('autofillStatus', '✅ Cleared autofilled values.', 'info'));
  });
});

// ─────────────────────────────────────────────────────────
// Functions injected into page via scripting.executeScript
// (Must be self-contained — no closure references)
// ─────────────────────────────────────────────────────────

function triggerAutofill(profile) {
  const AUTOFILL_ATTR = 'data-autofilled';

  // Field detection patterns
  const MATCHERS = [
    {
      key: 'name',
      labels:   ['full name', 'your name', 'name', 'candidate name', 'applicant name'],
      attrs:    ['fullname', 'full_name', 'name', 'candidatename', 'applicantname', 'your-name'],
      placeholders: ['full name', 'your name', 'enter name', 'name'],
      types:    ['text'],
    },
    {
      key: 'email',
      labels:   ['email', 'email address', 'e-mail', 'mail id'],
      attrs:    ['email', 'emailid', 'email_id', 'emailaddress', 'mail'],
      placeholders: ['email', 'your email', 'enter email'],
      types:    ['email'],
    },
    {
      key: 'phone',
      labels:   ['phone', 'mobile', 'contact number', 'phone number', 'mobile number', 'contact'],
      attrs:    ['phone', 'mobile', 'contact', 'mobileno', 'phoneno', 'phone_number', 'mobile_number'],
      placeholders: ['phone', 'mobile', 'contact number', 'enter phone'],
      types:    ['tel'],
    },
    {
      key: 'experience',
      labels:   ['total experience', 'experience', 'years of experience', 'work experience', 'relevant experience'],
      attrs:    ['experience', 'totalexp', 'total_experience', 'workyears', 'exp', 'yoe'],
      placeholders: ['experience', 'years', 'total experience'],
    },
    {
      key: 'currentCompany',
      labels:   ['current company', 'present company', 'employer', 'current employer', 'organization'],
      attrs:    ['currentcompany', 'current_company', 'presentcompany', 'employer', 'company'],
      placeholders: ['current company', 'employer', 'company name'],
    },
    {
      key: 'currentRole',
      labels:   ['current designation', 'current role', 'current title', 'designation', 'job title'],
      attrs:    ['designation', 'jobtitle', 'job_title', 'currentrole', 'title'],
      placeholders: ['designation', 'job title', 'current role'],
    },
    {
      key: 'currentCtc',
      labels:   ['current ctc', 'current salary', 'ctc', 'annual ctc'],
      attrs:    ['currentctc', 'current_ctc', 'ctc', 'currentsalary'],
      placeholders: ['current ctc', 'current salary'],
    },
    {
      key: 'expectedCtc',
      labels:   ['expected ctc', 'expected salary', 'desired salary', 'salary expectation'],
      attrs:    ['expectedctc', 'expected_ctc', 'expectedsalary', 'desiresalary'],
      placeholders: ['expected ctc', 'expected salary'],
    },
    {
      key: 'noticePeriod',
      labels:   ['notice period', 'notice', 'serving notice', 'available in'],
      attrs:    ['noticeperiod', 'notice_period', 'notice'],
      placeholders: ['notice period', 'days'],
    },
    {
      key: 'linkedin',
      labels:   ['linkedin', 'linkedin url', 'linkedin profile'],
      attrs:    ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedinprofile'],
      placeholders: ['linkedin', 'linkedin url', 'linkedin.com'],
    },
    {
      key: 'skills',
      labels:   ['skills', 'key skills', 'technical skills', 'areas of expertise'],
      attrs:    ['skills', 'keyskills', 'key_skills', 'technicalskills'],
      placeholders: ['skills', 'key skills'],
    },
  ];

  function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  function getFieldLabel(input) {
    // Try explicit label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return normalize(label.textContent);
    }
    // Try parent label
    const parentLabel = input.closest('label');
    if (parentLabel) return normalize(parentLabel.textContent);
    // Try aria-label
    if (input.getAttribute('aria-label')) return normalize(input.getAttribute('aria-label'));
    // Try previous sibling text
    const prev = input.previousElementSibling;
    if (prev) return normalize(prev.textContent);
    // Try parent's text excluding input value
    const parent = input.parentElement;
    if (parent) {
      const text = normalize(parent.textContent.replace(input.value, ''));
      return text.slice(0, 50);
    }
    return '';
  }

  function matchField(input) {
    const inputName  = normalize(input.name || '');
    const inputId    = normalize(input.id || '');
    const inputPlace = normalize(input.placeholder || '');
    const inputLabel = getFieldLabel(input);
    const inputType  = (input.type || 'text').toLowerCase();

    for (const matcher of MATCHERS) {
      // Match by type (email/tel — high confidence)
      if (matcher.types && matcher.types.includes(inputType)) return matcher.key;

      // Match by attribute name/id
      if (matcher.attrs) {
        for (const attr of matcher.attrs) {
          if (inputName === attr || inputId === attr) return matcher.key;
          if (inputName.includes(attr) || inputId.includes(attr)) return matcher.key;
        }
      }

      // Match by label text
      if (matcher.labels) {
        for (const lbl of matcher.labels) {
          if (inputLabel.includes(lbl)) return matcher.key;
        }
      }

      // Match by placeholder
      if (matcher.placeholders) {
        for (const ph of matcher.placeholders) {
          if (inputPlace.includes(ph)) return matcher.key;
        }
      }
    }

    return null;
  }

  function fillInput(input, value) {
    if (!value) return false;
    // Don't overwrite if already filled
    if (input.value && input.value.trim().length > 0) return false;
    // Don't fill if already autofilled by us
    if (input.getAttribute(AUTOFILL_ATTR)) return false;

    // Set value using native setter (React/Vue compatible)
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    // Trigger events so React/Vue state updates
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur',   { bubbles: true }));

    input.setAttribute(AUTOFILL_ATTR, '1');
    input.style.borderColor = '#10b981'; // green tint
    return true;
  }

  // Find all visible inputs and textareas
  const inputs = [...document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]), textarea:not([disabled])'
  )].filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0; // visible only
  });

  let filled = 0;
  let skipped = 0;

  for (const input of inputs) {
    const fieldKey = matchField(input);
    if (!fieldKey) continue;

    const value = profile[fieldKey];
    if (!value) continue;

    if (input.value && input.value.trim()) {
      skipped++;
    } else if (fillInput(input, value)) {
      filled++;
    }
  }

  return { filled, skipped };
}

function clearAutofilled() {
  document.querySelectorAll('[data-autofilled="1"]').forEach(el => {
    el.value = '';
    el.removeAttribute('data-autofilled');
    el.style.borderColor = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
