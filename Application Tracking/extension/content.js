/**
 * Content Script - Detects job application forms and provides auto-fill
 * Works on: Naukri.com, LinkedIn, IIMjobs
 */

const TRACKER_URL = 'http://localhost:3000';
let userInfo = null;

// Load user info from storage
chrome.runtime.sendMessage({ type: 'GET_USER_INFO' }, (info) => {
  userInfo = info;
});

// Listen for autofill trigger
document.addEventListener('JOB_TRACKER_AUTOFILL', () => {
  autoFillForm();
});

// Detect platform
function getPlatform() {
  const host = window.location.hostname;
  if (host.includes('naukri.com')) return 'naukri';
  if (host.includes('linkedin.com')) return 'linkedin';
  if (host.includes('iimjobs.com')) return 'iimjobs';
  return 'company_portal';
}

// Extract job details from current page
function extractJobDetails() {
  const platform = getPlatform();
  let title = '', company = '', location = '';

  if (platform === 'naukri') {
    title = document.querySelector('h1.jd-header-title, h1[class*="styles_jd-header"]')?.textContent?.trim() || '';
    company = document.querySelector('a.jd-header-comp-name, a[class*="styles_jd-header-comp"]')?.textContent?.trim() || '';
    location = document.querySelector('span.jd-header-loc-d, span[class*="location"]')?.textContent?.trim() || '';
  } else if (platform === 'linkedin') {
    title = document.querySelector('h1.jobs-unified-top-card__job-title, h1[class*="job-title"]')?.textContent?.trim() || '';
    company = document.querySelector('a.jobs-unified-top-card__company-name, a[class*="company-name"]')?.textContent?.trim() || '';
    location = document.querySelector('span.jobs-unified-top-card__bullet, span[class*="location"]')?.textContent?.trim() || '';
  } else if (platform === 'iimjobs') {
    title = document.querySelector('h1.jobTitle, h1[class*="title"]')?.textContent?.trim() || '';
    company = document.querySelector('.companyName, .company-name')?.textContent?.trim() || '';
    location = document.querySelector('.location, .loc')?.textContent?.trim() || '';
  } else {
    title = document.title.split(' - ')[0] || '';
    company = document.querySelector('meta[property="og:site_name"]')?.content || window.location.hostname;
  }

  return {
    jobTitle: title,
    company: company,
    location: location,
    url: window.location.href,
    platform: platform,
    description: document.querySelector('[class*="description"], .job-description')?.textContent?.trim()?.slice(0, 500) || '',
  };
}

// Auto-fill form fields
function autoFillForm() {
  if (!userInfo) {
    showToast('User info not loaded. Please check settings.', 'error');
    return;
  }

  const platform = getPlatform();
  let filled = 0;

  // Common field selectors
  const fieldMaps = {
    name: ['input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="name" i]', 'input[placeholder*="your name" i]'],
    email: ['input[type="email"]', 'input[name*="email" i]', 'input[id*="email" i]'],
    phone: ['input[type="tel"]', 'input[name*="phone" i]', 'input[name*="mobile" i]', 'input[id*="phone" i]', 'input[id*="mobile" i]'],
  };

  const values = {
    name: userInfo.name,
    email: userInfo.email,
    phone: userInfo.phone,
  };

  for (const [field, selectors] of Object.entries(fieldMaps)) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && !el.value && values[field]) {
        el.value = values[field];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        filled++;
        break;
      }
    }
  }

  if (filled > 0) {
    showToast(`✅ Auto-filled ${filled} field${filled > 1 ? 's' : ''}!`, 'success');
  } else {
    showToast('No fillable fields detected on this page.', 'info');
  }
}

// Show a small toast notification
function showToast(message, type = 'info') {
  const existing = document.getElementById('jt-toast');
  if (existing) existing.remove();

  const colors = { success: '#22c55e', error: '#ef4444', info: '#6366f1' };
  const toast = document.createElement('div');
  toast.id = 'jt-toast';
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 999999;
    background: ${colors[type] || colors.info}; color: white;
    padding: 10px 16px; border-radius: 8px; font-size: 14px;
    font-family: -apple-system, sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: opacity 0.3s; max-width: 300px;
  `;
  toast.textContent = '💼 Job Tracker: ' + message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Inject "Track Application" button near Apply buttons
function injectTrackButton() {
  const platform = getPlatform();

  // Don't inject on search/listing pages, only on job detail pages
  const isJobDetailPage = () => {
    if (platform === 'naukri') return window.location.pathname.includes('/job-listings/');
    if (platform === 'linkedin') return window.location.pathname.includes('/jobs/view/');
    if (platform === 'iimjobs') return window.location.pathname.includes('/j/');
    return false;
  };

  if (!isJobDetailPage()) return;

  // Check if already injected
  if (document.getElementById('jt-track-btn')) return;

  const applyButton = document.querySelector(
    'button[class*="apply"], a[class*="apply"], button[id*="apply"], .apply-button, button:contains("Apply")'
  );

  if (!applyButton?.parentNode) return;

  const container = document.createElement('div');
  container.style.cssText = 'display: inline-flex; gap: 8px; margin: 0 8px; vertical-align: middle;';

  const trackBtn = document.createElement('button');
  trackBtn.id = 'jt-track-btn';
  trackBtn.innerHTML = '💼 Track';
  trackBtn.style.cssText = `
    background: #6366f1; color: white; border: none; padding: 8px 16px;
    border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;
    transition: background 0.2s;
  `;
  trackBtn.onmouseover = () => trackBtn.style.background = '#4f46e5';
  trackBtn.onmouseout = () => trackBtn.style.background = '#6366f1';

  trackBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    trackBtn.textContent = '⏳ Tracking...';
    trackBtn.disabled = true;

    const jobDetails = extractJobDetails();
    const response = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: 'TRACK_APPLICATION', data: jobDetails }, resolve)
    );

    if (response?.success) {
      trackBtn.innerHTML = '✅ Tracked';
      trackBtn.style.background = '#22c55e';
      showToast('Application tracked in dashboard!', 'success');
    } else {
      trackBtn.textContent = 'Track';
      trackBtn.disabled = false;
      showToast(response?.error || 'Tracking failed', 'error');
    }
  });

  const fillBtn = document.createElement('button');
  fillBtn.innerHTML = '✏️ Fill';
  fillBtn.style.cssText = trackBtn.style.cssText.replace('#6366f1', '#8b5cf6');
  fillBtn.onmouseover = () => fillBtn.style.background = '#7c3aed';
  fillBtn.onmouseout = () => fillBtn.style.background = '#8b5cf6';
  fillBtn.addEventListener('click', (e) => { e.preventDefault(); autoFillForm(); });

  container.appendChild(trackBtn);
  container.appendChild(fillBtn);
  applyButton.parentNode.insertBefore(container, applyButton.nextSibling);
}

// Try to inject button after page loads
setTimeout(injectTrackButton, 2000);
// Also try on URL changes (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(injectTrackButton, 2000);
  }
}).observe(document, { subtree: true, childList: true });
