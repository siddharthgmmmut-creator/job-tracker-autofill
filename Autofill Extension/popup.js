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
          let msg = `✅ Filled ${result.filled} field(s)!`;
          if (result.missing?.length) msg += ` · Please provide: ${result.missing.join(', ')}`;
          showStatus('autofillStatus', msg, 'success');
        } else if (result.skipped > 0) {
          showStatus('autofillStatus', `ℹ️ ${result.skipped} field(s) already filled — skipped.`, 'info');
        } else if (result.missing?.length) {
          showStatus('autofillStatus', `⚠️ Please provide in profile: ${result.missing.join(', ')}`, 'warn');
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

  // ── Canonical MATCHERS with display names for multi-question answers ──
  const MATCHERS = [
    {
      key: 'name', displayName: 'Full Name',
      labels:       ['full name', 'your name', 'name', 'candidate name', 'applicant name', 'first name'],
      attrs:        ['fullname', 'full_name', 'name', 'candidatename', 'applicantname', 'your-name', 'firstname'],
      placeholders: ['full name', 'your name', 'enter name'],
      types:        [],
    },
    {
      key: 'email', displayName: 'Email',
      labels:       ['email', 'email address', 'e-mail', 'mail id', 'email id'],
      attrs:        ['email', 'emailid', 'email_id', 'emailaddress', 'mail'],
      placeholders: ['email', 'your email', 'enter email'],
      types:        ['email'],
    },
    {
      key: 'phone', displayName: 'Phone',
      labels:       ['phone', 'mobile', 'contact number', 'phone number', 'mobile number', 'contact', 'cell'],
      attrs:        ['phone', 'mobile', 'contact', 'mobileno', 'phoneno', 'phone_number', 'mobile_number', 'cell'],
      placeholders: ['phone', 'mobile', 'contact number', 'enter phone'],
      types:        ['tel'],
    },
    {
      key: 'experience', displayName: 'Total Experience',
      labels:       ['total experience', 'experience', 'years of experience', 'work experience',
                     'relevant experience', 'years', 'total work experience', 'overall experience', 'yoe'],
      attrs:        ['experience', 'totalexp', 'total_experience', 'workyears', 'exp', 'yoe', 'totalyears'],
      placeholders: ['experience', 'years', 'total experience', 'yrs'],
      types:        [],
    },
    {
      key: 'currentCompany', displayName: 'Current Company',
      labels:       ['current company', 'present company', 'employer', 'current employer',
                     'organization', 'current organization', 'working at', 'present employer'],
      attrs:        ['currentcompany', 'current_company', 'presentcompany', 'employer', 'company', 'organisation'],
      placeholders: ['current company', 'employer', 'company name', 'organization'],
      types:        [],
    },
    {
      key: 'currentRole', displayName: 'Current Role',
      labels:       ['current designation', 'current role', 'current title', 'designation',
                     'job title', 'position', 'current position', 'present designation', 'profile'],
      attrs:        ['designation', 'jobtitle', 'job_title', 'currentrole', 'title', 'position'],
      placeholders: ['designation', 'job title', 'current role', 'position'],
      types:        [],
    },
    {
      key: 'currentCtc', displayName: 'Current CTC',
      labels:       ['current ctc', 'current salary', 'ctc', 'annual ctc', 'current compensation',
                     'present ctc', 'present salary', 'current annual salary', 'fixed ctc'],
      attrs:        ['currentctc', 'current_ctc', 'ctc', 'currentsalary', 'currentcompensation', 'fixedctc'],
      placeholders: ['current ctc', 'current salary', 'annual ctc'],
      types:        [],
    },
    {
      key: 'expectedCtc', displayName: 'Expected CTC',
      labels:       ['expected ctc', 'expected salary', 'desired salary', 'salary expectation',
                     'expected compensation', 'expected package', 'target ctc', 'salary expectation'],
      attrs:        ['expectedctc', 'expected_ctc', 'expectedsalary', 'desiredsalary', 'targetctc', 'expectedpackage'],
      placeholders: ['expected ctc', 'expected salary', 'desired salary'],
      types:        [],
    },
    {
      key: 'noticePeriod', displayName: 'Notice Period',
      labels:       ['notice period', 'notice', 'serving notice', 'available in', 'availability',
                     'joining time', 'when can you join', 'earliest joining', 'last working day',
                     'joining date', 'available from', 'how soon'],
      attrs:        ['noticeperiod', 'notice_period', 'notice', 'availability', 'joiningtime', 'joiningdate'],
      placeholders: ['notice period', 'days', 'available in', 'joining', 'how soon'],
      types:        [],
    },
    {
      key: 'linkedin', displayName: 'LinkedIn URL',
      labels:       ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin link', 'linkedin id'],
      attrs:        ['linkedin', 'linkedinurl', 'linkedin_url', 'linkedinprofile'],
      placeholders: ['linkedin', 'linkedin url', 'linkedin.com', 'linkedin profile'],
      types:        [],
    },
    {
      key: 'skills', displayName: 'Skills',
      labels:       ['skills', 'key skills', 'technical skills', 'areas of expertise',
                     'core skills', 'competencies', 'expertise', 'proficiency'],
      attrs:        ['skills', 'keyskills', 'key_skills', 'technicalskills', 'expertise', 'competencies'],
      placeholders: ['skills', 'key skills', 'your skills', 'enter skills'],
      types:        [],
    },
    {
      key: 'education', displayName: 'Education',
      labels:       ['education', 'qualification', 'highest qualification', 'academic qualification',
                     'degree', 'educational qualification'],
      attrs:        ['education', 'qualification', 'degree', 'highestqualification'],
      placeholders: ['education', 'qualification', 'degree'],
      types:        [],
    },
  ];

  // Cities to auto-respond "Yes" for relocation questions
  const PREFERRED_CITIES = [
    'mumbai', 'pune', 'delhi', 'gurgaon', 'noida', 'bangalore',
    'hyderabad', 'chennai', 'kolkata', 'ahmedabad',
  ];

  // ── Normalize: lowercase, remove punctuation ──────────────────
  function norm(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  // ── Get best label text for an input ─────────────────────────
  function getLabel(input) {
    if (input.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (lbl) return norm(lbl.textContent);
      } catch {}
    }
    const parentLbl = input.closest('label');
    if (parentLbl) return norm(parentLbl.textContent);
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return norm(ariaLabel);
    const ariaLabelledBy = input.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const el = document.getElementById(ariaLabelledBy);
      if (el) return norm(el.textContent);
    }
    const prev = input.previousElementSibling;
    if (prev && !['INPUT','SELECT','TEXTAREA','BUTTON'].includes(prev.tagName)) {
      return norm(prev.textContent).slice(0, 100);
    }
    // Fallback: parent text minus input value
    const parent = input.parentElement;
    if (parent) return norm((parent.textContent || '').replace(input.value || '', '')).slice(0, 100);
    return '';
  }

  // ── Check if input is asking about relocation ────────────────
  function checkRelocation(label) {
    const relocKw = ['relocat', 'willing to move', 'open to move', 'comfortable moving',
                     'willing to work', 'open to work', 'comfortable with location'];
    if (relocKw.some(k => label.includes(k))) return 'Yes';
    // If the question mentions a specific city we prefer → "Yes"
    if (PREFERRED_CITIES.some(city => label.includes(city))) return 'Yes';
    return null;
  }

  // ── Detect ALL matching MATCHERS for an input ────────────────
  function detectMatches(input) {
    const label = getLabel(input);
    const place = norm(input.placeholder || '');
    const name  = norm(input.name  || '');
    const id    = norm(input.id    || '');
    const type  = (input.type || 'text').toLowerCase();

    const found = [];
    for (const m of MATCHERS) {
      let hit = false;

      // High-confidence type match (email / tel)
      if (!hit && m.types.length && m.types.includes(type)) hit = true;

      // Attr / id exact or contains match
      if (!hit && m.attrs) {
        for (const a of m.attrs) {
          if (name === a || id === a || name.includes(a) || id.includes(a)) { hit = true; break; }
        }
      }

      // Semantic label match (case-insensitive, punctuation-stripped)
      if (!hit && m.labels) {
        for (const l of m.labels) {
          if (label.includes(l)) { hit = true; break; }
        }
      }

      // Placeholder match
      if (!hit && m.placeholders) {
        for (const p of m.placeholders) {
          if (place.includes(p)) { hit = true; break; }
        }
      }

      if (hit) found.push(m);
    }
    return { label, found };
  }

  // ── React/Vue compatible fill ─────────────────────────────────
  function fillInput(input, value) {
    if (!value) return false;
    if (input.getAttribute(AUTOFILL_ATTR)) return false;
    if (input.value && input.value.trim()) return false;

    const proto = (input.tagName === 'TEXTAREA')
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;

    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur',   { bubbles: true }));

    input.setAttribute(AUTOFILL_ATTR, '1');
    input.style.outline = '2px solid #10b981';
    input.style.outlineOffset = '1px';
    return true;
  }

  // ── Gather all visible inputs ─────────────────────────────────
  const inputs = [...document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]),' +
    'textarea:not([disabled])'
  )].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  let filled = 0;
  let skipped = 0;
  const missing = [];  // profile keys the user hasn't set

  for (const input of inputs) {
    const label = getLabel(input);

    // ── Step 1: Relocation check ────────────────────────────────
    const relocAnswer = checkRelocation(label);
    if (relocAnswer) {
      if (input.value && input.value.trim()) { skipped++; continue; }
      if (fillInput(input, relocAnswer)) filled++;
      continue;
    }

    // ── Step 2: Semantic field detection ────────────────────────
    const { found } = detectMatches(input);
    if (found.length === 0) continue; // no match — skip silently

    if (found.length === 1) {
      // ── Single field ────────────────────────────────────────
      const key   = found[0].key;
      const value = profile[key];
      if (!value) { missing.push(found[0].displayName); continue; }
      if (input.value && input.value.trim()) { skipped++; continue; }
      if (fillInput(input, value)) filled++;

    } else {
      // ── Multi-question: "Current CTC / Expected CTC?" ────────
      // Combine all answers into one response string
      const parts = found
        .filter(m => profile[m.key])
        .map(m => `${m.displayName}: ${profile[m.key]}`);

      const missingParts = found
        .filter(m => !profile[m.key])
        .map(m => m.displayName);

      if (missingParts.length) missing.push(...missingParts);

      if (parts.length > 0) {
        if (input.value && input.value.trim()) { skipped++; continue; }
        if (fillInput(input, parts.join(' | '))) filled++;
      }
    }
  }

  // Log any unresolved fields for debugging
  if (missing.length > 0) {
    console.warn('[Autofill] Missing profile fields:', [...new Set(missing)].join(', '));
  }

  return { filled, skipped, missing: [...new Set(missing)] };
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
