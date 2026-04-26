/**
 * content.js — Injects a subtle "⚡ Autofill" button on job application pages
 *
 * Supported platforms:
 *   - Naukri.com
 *   - IIMjobs.com
 *   - LinkedIn.com
 *
 * This does NOT auto-submit anything. It only adds a button.
 * User must click the button to trigger autofill.
 */

const AUTOFILL_ATTR = 'data-autofilled';
const PROFILE_KEY   = 'job_autofill_profile';
const BTN_ID        = 'job-autofill-btn';

// ── Detect which platform we're on ───────────────────────
function getPlatform() {
  const host = location.hostname;
  if (host.includes('naukri.com'))   return 'naukri';
  if (host.includes('iimjobs.com'))  return 'iimjobs';
  if (host.includes('linkedin.com')) return 'linkedin';
  return null;
}

// ── Check if this looks like an apply/form page ───────────
function isApplyPage() {
  const path = location.pathname.toLowerCase();
  const platform = getPlatform();

  if (platform === 'naukri') {
    // Naukri apply pages contain /apply/ or have application forms
    return path.includes('/apply') || !!document.querySelector('[class*="apply"], form[id*="apply"]');
  }
  if (platform === 'iimjobs') {
    return path.includes('/j/') && !!document.querySelector('form, input[type="text"]');
  }
  if (platform === 'linkedin') {
    return path.includes('/jobs/') && !!document.querySelector('.jobs-easy-apply-content, form');
  }
  return false;
}

// ── Normalize text for matching ───────────────────────────
function norm(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// ── Get label text for an input ───────────────────────────
function getLabel(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return norm(label.textContent);
  }
  const pLabel = input.closest('label');
  if (pLabel) return norm(pLabel.textContent);
  if (input.getAttribute('aria-label')) return norm(input.getAttribute('aria-label'));
  const prev = input.previousElementSibling;
  if (prev && prev.tagName !== 'INPUT') return norm(prev.textContent).slice(0, 60);
  return norm((input.parentElement || {}).textContent || '').slice(0, 60);
}

// ── Field matching logic ──────────────────────────────────
const MATCHERS = [
  {
    key: 'name',
    labels: ['full name', 'your name', 'name', 'candidate name'],
    attrs:  ['fullname', 'full_name', 'name', 'candidatename'],
    placeholders: ['full name', 'your name', 'enter name'],
  },
  {
    key: 'email',
    labels: ['email', 'email address', 'e-mail'],
    attrs:  ['email', 'emailid', 'email_id'],
    types:  ['email'],
  },
  {
    key: 'phone',
    labels: ['phone', 'mobile', 'contact number', 'mobile number'],
    attrs:  ['phone', 'mobile', 'contact', 'mobileno', 'phoneno'],
    types:  ['tel'],
  },
  {
    key: 'experience',
    labels: ['total experience', 'experience', 'years of experience'],
    attrs:  ['experience', 'totalexp', 'total_experience', 'exp'],
  },
  {
    key: 'currentCompany',
    labels: ['current company', 'present company', 'employer'],
    attrs:  ['currentcompany', 'current_company', 'employer', 'company'],
  },
  {
    key: 'currentRole',
    labels: ['current designation', 'designation', 'current role', 'job title'],
    attrs:  ['designation', 'jobtitle', 'job_title', 'currentrole'],
  },
  {
    key: 'currentCtc',
    labels: ['current ctc', 'current salary', 'annual ctc'],
    attrs:  ['currentctc', 'current_ctc', 'ctc'],
  },
  {
    key: 'expectedCtc',
    labels: ['expected ctc', 'expected salary', 'desired salary'],
    attrs:  ['expectedctc', 'expected_ctc', 'expectedsalary'],
  },
  {
    key: 'noticePeriod',
    labels: ['notice period', 'notice', 'available in'],
    attrs:  ['noticeperiod', 'notice_period', 'notice'],
  },
];

function matchField(input) {
  const iName  = norm(input.name || '');
  const iId    = norm(input.id   || '');
  const iPhone = norm(input.placeholder || '');
  const iLabel = getLabel(input);
  const iType  = (input.type || 'text').toLowerCase();

  for (const m of MATCHERS) {
    if (m.types && m.types.includes(iType)) return m.key;
    for (const a of (m.attrs || [])) {
      if (iName === a || iId === a || iName.includes(a) || iId.includes(a)) return m.key;
    }
    for (const l of (m.labels || [])) {
      if (iLabel.includes(l)) return m.key;
    }
    for (const p of (m.placeholders || [])) {
      if (iPhone.includes(p)) return m.key;
    }
  }
  return null;
}

// ── Fill a single input ───────────────────────────────────
function fillInput(input, value) {
  if (!value || (input.value && input.value.trim())) return false;
  if (input.getAttribute(AUTOFILL_ATTR)) return false;

  // React-compatible value setting
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
             || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  if (desc && desc.set) {
    desc.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input',  { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur',   { bubbles: true }));

  input.setAttribute(AUTOFILL_ATTR, '1');
  input.style.outline = '2px solid #10b981';
  input.style.outlineOffset = '1px';
  return true;
}

// ── Main autofill function ────────────────────────────────
function autofillPage(profile) {
  const inputs = [...document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled]), textarea:not([disabled])'
  )].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  let filled = 0;
  for (const input of inputs) {
    const key = matchField(input);
    if (key && profile[key]) {
      if (fillInput(input, profile[key])) filled++;
    }
  }
  return filled;
}

// ── Create floating autofill button ──────────────────────
function injectButton(profile) {
  if (document.getElementById(BTN_ID)) return; // already injected

  const btn = document.createElement('div');
  btn.id = BTN_ID;
  btn.innerHTML = '⚡ Autofill';
  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '999999',
    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
    color: 'white',
    padding: '10px 18px',
    borderRadius: '24px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 20px rgba(79,70,229,0.4)',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    userSelect: 'none',
    transition: 'transform 0.15s, box-shadow 0.15s',
    letterSpacing: '0.3px',
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'translateY(-2px)';
    btn.style.boxShadow = '0 6px 24px rgba(79,70,229,0.5)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
    btn.style.boxShadow = '0 4px 20px rgba(79,70,229,0.4)';
  });

  btn.addEventListener('click', () => {
    // Reload profile fresh on click (in case user updated it)
    chrome.storage.local.get([PROFILE_KEY], (res) => {
      const p = res[PROFILE_KEY] || {};
      if (!Object.keys(p).length) {
        showToast('⚠️ No profile saved. Click the extension icon to set up your profile.', 'warn');
        return;
      }
      const count = autofillPage(p);
      if (count > 0) {
        showToast(`✅ Filled ${count} field${count > 1 ? 's' : ''}!`, 'success');
        btn.innerHTML = `✅ Filled ${count}`;
        setTimeout(() => { btn.innerHTML = '⚡ Autofill'; }, 3000);
      } else {
        showToast('ℹ️ No empty fields found to fill.', 'info');
      }
    });
  });

  document.body.appendChild(btn);
}

// ── Toast notification ────────────────────────────────────
function showToast(msg, type = 'success') {
  const existing = document.getElementById('autofill-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'autofill-toast';
  const colors = {
    success: '#10b981',
    warn:    '#f59e0b',
    info:    '#3b82f6',
    error:   '#ef4444',
  };

  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    zIndex: '999999',
    background: colors[type] || colors.success,
    color: 'white',
    padding: '10px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    maxWidth: '280px',
    lineHeight: '1.4',
    transition: 'opacity 0.3s',
  });
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Init ──────────────────────────────────────────────────
function init() {
  const platform = getPlatform();
  if (!platform) return;

  // Load profile from storage
  chrome.storage.local.get([PROFILE_KEY], (res) => {
    const profile = res[PROFILE_KEY] || {};
    // Inject button on any page that has a form
    const hasForm = !!document.querySelector('form, input[type="text"], input[type="email"]');
    if (hasForm) {
      injectButton(profile);
    }
  });
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-inject button on SPA navigation (Naukri/LinkedIn use client-side routing)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 1500); // wait for new page to render
  }
}).observe(document.body, { childList: true, subtree: true });
