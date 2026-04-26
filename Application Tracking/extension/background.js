// Background service worker for Job Application Assistant

const TRACKER_URL = 'http://localhost:3000';

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill-form') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: triggerAutofill,
        });
      }
    });
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRACK_APPLICATION') {
    trackApplication(message.data).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true; // async
  }

  if (message.type === 'GET_USER_INFO') {
    chrome.storage.local.get(['userInfo'], (result) => {
      sendResponse(result.userInfo || getDefaultUserInfo());
    });
    return true;
  }

  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: TRACKER_URL });
    sendResponse({ success: true });
  }

  if (message.type === 'OPEN_REFERRALS') {
    const jobId = message.jobId;
    chrome.tabs.create({ url: `${TRACKER_URL}/referrals${jobId ? '?job_id=' + jobId : ''}` });
    sendResponse({ success: true });
  }
});

async function trackApplication(data) {
  try {
    // First, find or create the job
    const jobRes = await fetch(`${TRACKER_URL}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.jobTitle || 'Unknown Role',
        company: data.company || 'Unknown Company',
        location: data.location || '',
        job_url: data.url,
        platform: data.platform || 'manual',
        description: data.description || '',
      }),
    });

    let jobId;
    const jobData = await jobRes.json();

    if (jobRes.status === 409) {
      // Job already exists
      jobId = jobData.existing_id;
    } else if (jobData.success) {
      jobId = jobData.data.id;
    } else {
      throw new Error('Failed to create job');
    }

    // Create application
    const appRes = await fetch(`${TRACKER_URL}/api/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId }),
    });

    const appData = await appRes.json();
    if (!appData.success && !appData.error?.includes('already exists')) {
      throw new Error(appData.error);
    }

    return { success: true, jobId, message: 'Application tracked!' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDefaultUserInfo() {
  return {
    name: 'Siddharth',
    email: 'siddharthgmmmut@gmail.com',
    phone: '+91-8765627606',
    linkedin: 'https://linkedin.com/in/siddharth',
    cvPath: '',
  };
}

function triggerAutofill() {
  // This function runs in the page context
  document.dispatchEvent(new CustomEvent('JOB_TRACKER_AUTOFILL'));
}
