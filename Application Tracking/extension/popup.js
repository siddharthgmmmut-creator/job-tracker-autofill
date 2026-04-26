const TRACKER_URL = 'http://localhost:3000';

let currentTab = null;
let jobDetails = null;

async function init() {
  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  // Load user info
  const userInfo = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_USER_INFO' }, resolve)
  );

  document.getElementById('user-name').textContent = userInfo?.name || 'Siddharth';
  document.getElementById('user-email').textContent = userInfo?.email || 'siddharthgmmmut@gmail.com';

  // Check if tracker is running
  checkTrackerStatus();

  // Detect if we're on a job page
  detectJobPage();

  // Set up button handlers
  document.getElementById('btn-fill').addEventListener('click', handleFill);
  document.getElementById('btn-track').addEventListener('click', handleTrack);
  document.getElementById('btn-dashboard').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
    window.close();
  });
  document.getElementById('btn-referrals').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_REFERRALS', jobId: null });
    window.close();
  });
}

async function checkTrackerStatus() {
  const dot = document.getElementById('status-dot');
  try {
    const res = await fetch(`${TRACKER_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.classList.remove('offline');
      dot.title = 'Tracker: Online ✅';
    } else {
      throw new Error();
    }
  } catch {
    dot.classList.add('offline');
    dot.title = 'Tracker: Offline ❌ (start with npm start)';
  }
}

function detectJobPage() {
  if (!currentTab) return;
  const url = currentTab.url || '';
  const host = new URL(url).hostname;

  let platform = null;
  let isJobPage = false;

  if (host.includes('naukri.com') && url.includes('/job-listings/')) {
    platform = 'naukri'; isJobPage = true;
  } else if (host.includes('linkedin.com') && url.includes('/jobs/view/')) {
    platform = 'linkedin'; isJobPage = true;
  } else if (host.includes('iimjobs.com') && url.includes('/j/')) {
    platform = 'iimjobs'; isJobPage = true;
  }

  if (isJobPage) {
    // Extract job details from the page
    chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: extractJobDetailsFromPage,
    }, (results) => {
      if (results?.[0]?.result) {
        jobDetails = results[0].result;
        document.getElementById('job-panel').style.display = 'block';
        document.getElementById('job-title').textContent = jobDetails.jobTitle || 'Job Role';
        document.getElementById('job-company').textContent = jobDetails.company || 'Company';
        document.getElementById('page-info').textContent = `Job page detected · ${platform}`;
      }
    });
  } else {
    document.getElementById('page-info').textContent = platform
      ? `${platform.charAt(0).toUpperCase() + platform.slice(1)} • Not a job page`
      : 'Navigate to a job page';
  }
}

function extractJobDetailsFromPage() {
  const host = window.location.hostname;
  let title = '', company = '', location = '';

  if (host.includes('naukri.com')) {
    title = document.querySelector('h1.jd-header-title, h1[class*="styles_jd-header"]')?.textContent?.trim() || document.title.split(' - ')[0] || '';
    company = document.querySelector('a.jd-header-comp-name, a[class*="comp-name"]')?.textContent?.trim() || '';
    location = document.querySelector('span.jd-header-loc-d')?.textContent?.trim() || '';
  } else if (host.includes('linkedin.com')) {
    title = document.querySelector('h1.jobs-unified-top-card__job-title, h1[class*="job-title"]')?.textContent?.trim() || '';
    company = document.querySelector('a.jobs-unified-top-card__company-name')?.textContent?.trim() || '';
    location = document.querySelector('span.jobs-unified-top-card__bullet')?.textContent?.trim() || '';
  } else if (host.includes('iimjobs.com')) {
    title = document.querySelector('h1.jobTitle')?.textContent?.trim() || document.title.split(' - ')[0] || '';
    company = document.querySelector('.companyName, .company-name')?.textContent?.trim() || '';
    location = document.querySelector('.location, .loc')?.textContent?.trim() || '';
  }

  return {
    jobTitle: title || document.title.split(' - ')[0] || 'Unknown Role',
    company: company || window.location.hostname,
    location: location || '',
    url: window.location.href,
    platform: host.includes('naukri') ? 'naukri' : host.includes('linkedin') ? 'linkedin' : 'iimjobs',
  };
}

async function handleFill() {
  const btn = document.getElementById('btn-fill');
  btn.disabled = true;
  btn.textContent = '⏳ Filling...';

  try {
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: () => document.dispatchEvent(new CustomEvent('JOB_TRACKER_AUTOFILL')),
    });
    showStatus('Form auto-filled!', 'success');
  } catch (err) {
    showStatus('Could not fill form on this page.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✏️ Auto-Fill Form';
  }
}

async function handleTrack() {
  const btn = document.getElementById('btn-track');

  if (!jobDetails) {
    // Try to extract from current page
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: extractJobDetailsFromPage,
    }).catch(() => null);

    if (results?.[0]?.result) {
      jobDetails = results[0].result;
    } else {
      showStatus('Navigate to a specific job page to track it.', 'info');
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = '⏳ Tracking...';

  const response = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'TRACK_APPLICATION', data: jobDetails }, resolve)
  );

  if (response?.success) {
    btn.textContent = '✅ Tracked!';
    btn.classList.add('tracked');
    showStatus(`Tracked: ${jobDetails.company} — ${jobDetails.jobTitle}`, 'success');
  } else {
    btn.disabled = false;
    btn.textContent = '✅ Track Application';
    showStatus(response?.error?.includes('already exists') ? 'Already tracked!' : (response?.error || 'Tracking failed'), 'error');
  }
}

function showStatus(message, type) {
  const el = document.getElementById('status-msg');
  el.textContent = message;
  el.className = 'status-msg ' + type;
  setTimeout(() => { el.className = 'status-msg'; el.textContent = ''; }, 4000);
}

document.addEventListener('DOMContentLoaded', init);
