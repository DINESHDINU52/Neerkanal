/**
 * Nerkanal HRMS & ATS - Frontend Application Logic
 * Full Enterprise Module Controller & Autonomous AI Client
 */

// Global State
const state = {
  activeTab: 'dashboard',
  user: {
    id: 'emp-001',
    name: 'Alex Vance',
    email: 'superadmin@nerkanal.app',
    role: 'superadmin',
    title: 'Super Admin',
    token: null,
  },
  waterCount: 3,
  isPunchedIn: false,
  punchTime: null,
  selectedMood: 4,
  pendingApprovals: [
    { id: 'appr-101', type: 'Leave Request', requester: 'Kavitha R', details: 'Casual Leave (2 days: Oct 12 - Oct 13)', date: 'Today, 09:30 AM', status: 'Pending' },
    { id: 'appr-102', type: 'Travel Claim', requester: 'Deepak S', details: 'Client Visit to Bengaluru ($85.00)', date: 'Yesterday', status: 'Pending' },
    { id: 'appr-103', type: 'Job Requisition', requester: 'Sarah Jenkins', details: 'Senior React Engineer (2 openings)', date: 'Oct 06', status: 'Pending' },
  ],
  candidates: [
    { id: 'CAND-01', name: 'Arun Kumar', role: 'Full Stack Engineer', stage: 'Interview', match: '94%', videoScore: '88/100', rating: 4.8 },
    { id: 'CAND-02', name: 'Priya Sharma', role: 'Product Designer', stage: 'Offer Sent', match: '98%', videoScore: '92/100', rating: 4.9 },
    { id: 'CAND-03', name: 'Michael Chen', role: 'DevOps Architect', stage: 'Applied', match: '85%', videoScore: 'Pending', rating: 4.2 },
    { id: 'CAND-04', name: 'Divya Nair', role: 'Talent Specialist', stage: 'Screening', match: '91%', videoScore: '86/100', rating: 4.5 },
  ],
  leaves: [
    { type: 'Casual Leave', days: 2, dates: 'Oct 12 - Oct 13, 2026', reason: 'Family Function', status: 'Approved' },
    { type: 'Sick Leave', days: 1, dates: 'Sep 21, 2026', reason: 'Fever & Rest', status: 'Approved' },
    { type: 'Earned Leave', days: 4, dates: 'Aug 14 - Aug 17, 2026', reason: 'Vacation', status: 'Approved' },
  ],
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();
  setupEventListeners();
  // Auto login with default persona
  await loginPersona('superadmin@nerkanal.app', 'Super Admin');
  renderCurrentTab();
  updateApprovalsBadge();
});

// Clock Timer
function startLiveClock() {
  const clockEl = document.getElementById('live-clock');
  const update = () => {
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// Event Listeners
function setupEventListeners() {
  // Navigation tabs
  document.querySelectorAll('.app-sidebar .nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const tab = el.getAttribute('data-tab');
      if (tab) navigateTo(tab);
    });
  });
}

// Navigation Handler
function navigateTo(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.app-sidebar .nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabName);
  });
  renderCurrentTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Role Switcher / Authentication
async function switchPersona(email, title) {
  document.querySelectorAll('.role-btn').forEach(btn => {
    const isSelected = btn.innerText.toLowerCase().includes(title.toLowerCase().split(' ')[0]);
    btn.classList.toggle('active', isSelected);
  });

  await loginPersona(email, title);
  showToast(`Switched persona to ${title} (${email})`, 'info');
  renderCurrentTab();
}

async function loginPersona(email, title) {
  state.user.email = email;
  state.user.title = title;
  state.user.role = email.split('@')[0];

  const names = {
    'superadmin': 'Alex Vance (Admin)',
    'hrmanager': 'Sophia Martinez (HR)',
    'recruiter': 'Liam Gallagher (Talent)',
    'rm': 'Marcus Sterling (RM)',
    'employee': 'Kavitha Raman (Eng)',
    'candidate': 'Arun Kumar (Candidate)',
  };
  state.user.name = names[state.user.role] || email.split('@')[0];

  // Update Header UI
  const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('user-avatar').innerText = initials;
  document.getElementById('user-name-display').innerText = state.user.name;
  document.getElementById('user-role-display').innerText = title;

  // Attempt real JWT login from backend
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Nerkanal@123' }),
    });
    if (res.ok) {
      const data = await res.json();
      state.user.token = data.access_token || data.token;
      localStorage.setItem('nk_token', state.user.token);
    }
  } catch (e) {
    console.warn('Backend login fallback used', e);
  }
}

// Approvals Badge Counter
function updateApprovalsBadge() {
  const count = state.pendingApprovals.filter(a => a.status === 'Pending').length;
  document.getElementById('approval-badge').innerText = count;
  const sidebarCount = document.getElementById('sidebar-approvals-count');
  if (sidebarCount) sidebarCount.innerText = count;
}

// Dynamic View Rendering
function renderCurrentTab() {
  const container = document.getElementById('app-content');
  const tab = state.activeTab;

  switch (tab) {
    case 'dashboard':
      container.innerHTML = renderDashboardView();
      break;
    case 'approvals':
      container.innerHTML = renderApprovalsView();
      break;
    case 'candidate':
      container.innerHTML = renderCandidateView();
      break;
    case 'ats':
      container.innerHTML = renderAtsView();
      break;
    case 'onboarding':
      container.innerHTML = renderOnboardingView();
      break;
    case 'attendance':
      container.innerHTML = renderAttendanceView();
      break;
    case 'leaves':
      container.innerHTML = renderLeavesView();
      break;
    case 'payroll':
      container.innerHTML = renderPayrollView();
      break;
    case 'tracking':
      container.innerHTML = renderTrackingView();
      break;
    case 'performance':
      container.innerHTML = renderPerformanceView();
      break;
    case 'engagement':
      container.innerHTML = renderEngagementView();
      break;
    case 'training':
      container.innerHTML = renderTrainingView();
      break;
    case 'complaints':
      container.innerHTML = renderComplaintsView();
      break;
    case 'exit':
      container.innerHTML = renderExitView();
      break;
    case 'handbook':
      container.innerHTML = renderHandbookView();
      break;
    case 'settings':
      container.innerHTML = renderSettingsView();
      break;
    default:
      container.innerHTML = renderDashboardView();
  }
}

/* =========================================================================
   VIEW TEMPLATES
========================================================================= */

function renderDashboardView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Executive Workplace Control Center</h2>
        <p>Live health metrics, autonomous workforce intelligence, and quick actions</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-secondary" onclick="exportReport()"><i class="fa-solid fa-download"></i> Export BI Report</button>
        <button class="btn btn-primary" onclick="openApplyLeaveModal()"><i class="fa-solid fa-plus"></i> Quick Leave Request</button>
      </div>
    </div>

    <!-- Quick Stat KPI Cards -->
    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-users" style="color:var(--primary);"></i> Total Headcount</span>
          <span class="badge badge-success">+14% QoQ</span>
        </div>
        <div class="card-stat">128</div>
        <div class="stat-trend up"><i class="fa-solid fa-arrow-trend-up"></i> 6 new joined this month</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-fingerprint" style="color:var(--success);"></i> Daily Attendance</span>
          <span class="badge badge-success">96.8%</span>
        </div>
        <div class="card-stat">124 / 128</div>
        <div class="stat-trend neutral"><i class="fa-solid fa-clock"></i> 3 On Leave · 1 Remote</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-briefcase" style="color:var(--info);"></i> Active Requisitions</span>
          <span class="badge badge-info">12 Open</span>
        </div>
        <div class="card-stat">84</div>
        <div class="stat-trend up"><i class="fa-solid fa-user-check"></i> 84 Applicants in ATS Pipeline</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-bolt" style="color:var(--purple);"></i> AI Jarvis Actions</span>
          <span class="badge badge-warning">Autonomous</span>
        </div>
        <div class="card-stat">342</div>
        <div class="stat-trend up"><i class="fa-solid fa-robot"></i> 98% inquiries resolved instantly</div>
      </div>
    </div>

    <!-- Dual Column Overview -->
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px;">
      <!-- Left: Real-time Attendance & Mood Punch Station -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-stopwatch" style="color:var(--primary);"></i> Daily Time & Mood Punch Station</span>
          <span class="status-pill">${state.isPunchedIn ? 'Checked In' : 'Checked Out'}</span>
        </div>
        
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(6,17,44,0.6); border-radius: 12px; margin-bottom: 20px;">
          <div>
            <div style="font-size: 13px; color: var(--text-muted);">Current Status</div>
            <div style="font-size: 20px; font-weight: 700; color: #fff; margin-top: 4px;">
              ${state.isPunchedIn ? `Active since ${state.punchTime}` : 'Not Checked In Today'}
            </div>
          </div>
          <button class="btn ${state.isPunchedIn ? 'btn-danger' : 'btn-primary'}" onclick="togglePunch()">
            <i class="fa-solid ${state.isPunchedIn ? 'fa-right-from-bracket' : 'fa-fingerprint'}"></i>
            ${state.isPunchedIn ? 'Punch Out & End Shift' : 'Punch In with GPS'}
          </button>
        </div>

        <div style="margin-bottom: 16px;">
          <label class="form-label">How are you feeling today? (Mood Bot)</label>
          <div style="display: flex; gap: 12px; margin-top: 8px;">
            ${[
              { val: 1, emoji: '😫', label: 'Exhausted' },
              { val: 2, emoji: '🙁', label: 'Low' },
              { val: 3, emoji: '😐', label: 'Okay' },
              { val: 4, emoji: '😊', label: 'Energetic' },
              { val: 5, emoji: '🚀', label: 'Super Charged' },
            ].map(m => `
              <button onclick="selectMood(${m.val})" class="btn btn-secondary" style="flex:1; flex-direction:column; padding:12px 6px; ${state.selectedMood === m.val ? 'border-color:var(--primary); background:rgba(245,158,11,0.15);' : ''}">
                <span style="font-size: 22px;">${m.emoji}</span>
                <span style="font-size: 11px; margin-top: 4px; color: var(--text-muted);">${m.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Right: AI Sentiment & Wellness Widget -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-heart-pulse" style="color:var(--danger);"></i> Workplace Wellness</span>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
            <span>Team Happiness Index</span>
            <span style="color: var(--success); font-weight: 700;">88% (High)</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: 88%;"></div>
          </div>
        </div>

        <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 3px solid var(--primary); margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 600; color: #fff;">💡 Daily AI Tip</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
            "Take a 5-minute hydration walk after meetings to reduce screen fatigue."
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding-top: 10px; border-top: 1px solid var(--border);">
          <span style="font-size: 13px; color: var(--text-muted);">Water Glasses Logged:</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="logWater(-1)">-</button>
            <span style="font-weight: 700; color: var(--primary);" id="water-count-display">${state.waterCount} / 8</span>
            <button class="btn btn-secondary btn-sm" onclick="logWater(1)">+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending Action Items Table -->
    <div class="table-container">
      <div style="padding: 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 16px; color: #fff;"><i class="fa-solid fa-bell" style="color:var(--warning);"></i> Pending Approvals Requiring Immediate Action</h3>
        <button class="btn btn-secondary btn-sm" onclick="navigateTo('approvals')">View All in Hub</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Requester</th>
            <th>Details</th>
            <th>Requested At</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.pendingApprovals.map(item => `
            <tr>
              <td><span class="badge badge-info">${item.type}</span></td>
              <td><strong>${item.requester}</strong></td>
              <td>${item.details}</td>
              <td>${item.date}</td>
              <td><span class="badge ${item.status === 'Pending' ? 'badge-warning' : 'badge-success'}">${item.status}</span></td>
              <td>
                ${item.status === 'Pending' ? `
                  <button class="btn btn-success btn-sm" onclick="approveItem('${item.id}')">Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectItem('${item.id}')">Reject</button>
                ` : `<span style="color:var(--text-muted); font-size:12px;">Completed</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderApprovalsView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Multi-Level Approvals Hub</h2>
        <p>Centralized authorization queue for Leaves, Expense Claims, Requisitions, and Clearances</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-success" onclick="approveAllPending()"><i class="fa-solid fa-check-double"></i> 1-Click Approve All</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Req ID</th>
            <th>Category</th>
            <th>Initiator</th>
            <th>Description & Justification</th>
            <th>Submitted</th>
            <th>Status</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          ${state.pendingApprovals.map(item => `
            <tr>
              <td style="font-family:monospace; color:var(--primary); font-weight:700;">#${item.id}</td>
              <td><span class="badge badge-info">${item.type}</span></td>
              <td><strong>${item.requester}</strong></td>
              <td>${item.details}</td>
              <td>${item.date}</td>
              <td><span class="badge ${item.status === 'Pending' ? 'badge-warning' : 'badge-success'}">${item.status}</span></td>
              <td>
                ${item.status === 'Pending' ? `
                  <div style="display:flex; gap:6px;">
                    <button class="btn btn-success btn-sm" onclick="approveItem('${item.id}')"><i class="fa-solid fa-check"></i> Approve</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectItem('${item.id}')"><i class="fa-solid fa-xmark"></i> Reject</button>
                  </div>
                ` : `<span style="color:var(--text-dim);">Processed</span>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCandidateView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Autonomous Candidate Portal & AI Mock Room</h2>
        <p>Interactive candidate experience with asynchronous video pitch and AI interview simulator</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="openCandidateApplyModal()"><i class="fa-solid fa-upload"></i> Apply for Open Role</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
      <!-- AI Mock Interview Simulator Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-video" style="color:var(--primary);"></i> AI Video Pitch & Mock Interview Simulator</span>
          <span class="badge badge-warning">AI Powered</span>
        </div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          Practice answering typical system architecture and leadership questions. Jarvis analyzes facial confidence, speech clarity, and technical relevance.
        </p>

        <div style="background: #000; height: 180px; border-radius: 12px; display: flex; flex-direction:column; align-items:center; justify-content:center; border: 1px dashed var(--border); margin-bottom: 16px;">
          <i class="fa-solid fa-camera" style="font-size: 32px; color: var(--primary); margin-bottom: 8px;"></i>
          <span style="font-size: 13px; color: #fff;">Webcam Ready</span>
          <span style="font-size: 11px; color: var(--text-dim);">Audio / Video Mesh Configured</span>
        </div>

        <div style="display: flex; gap: 10px;">
          <button class="btn btn-primary" style="flex:1;" onclick="startMockInterview()">
            <i class="fa-solid fa-play"></i> Start 60-Sec Pitch
          </button>
          <a href="/meet/interview-room-101" target="_blank" class="btn btn-secondary" style="flex:1;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Live Mesh Room
          </a>
        </div>
      </div>

      <!-- Candidate Evaluation Metrics -->
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-brain" style="color:var(--success);"></i> Live AI Assessment Score</span>
          <span class="badge badge-success">Candidate: Arun Kumar</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
              <span>Technical Domain Alignment</span>
              <span style="font-weight:700; color:var(--primary);">94%</span>
            </div>
            <div class="progress-bar-container"><div class="progress-bar-fill" style="width:94%;"></div></div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
              <span>Confidence & Speech Delivery</span>
              <span style="font-weight:700; color:var(--success);">88%</span>
            </div>
            <div class="progress-bar-container"><div class="progress-bar-fill" style="width:88%;"></div></div>
          </div>

          <div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
              <span>Cultural & Values Resonance</span>
              <span style="font-weight:700; color:var(--info);">91%</span>
            </div>
            <div class="progress-bar-container"><div class="progress-bar-fill" style="width:91%;"></div></div>
          </div>

          <div style="padding:10px 14px; background:rgba(16,185,129,0.1); border-radius:8px; border:1px solid rgba(16,185,129,0.2); font-size:12px; color:var(--success);">
            <i class="fa-solid fa-circle-check"></i> Jarvis Recommendation: High potential candidate for Senior Fullstack Engineer. Proceed to Offer stage.
          </div>
        </div>
      </div>
    </div>

    <!-- Active Open Requisitions for Candidates -->
    <div class="table-container">
      <div style="padding: 16px; border-bottom: 1px solid var(--border);">
        <h3 style="font-size: 16px; color: #fff;">Featured Career Opportunities</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>Role Title</th>
            <th>Department</th>
            <th>Location</th>
            <th>Type</th>
            <th>CTC Bracket</th>
            <th>Apply</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Lead Full Stack Engineer (React / NestJS)</strong></td>
            <td>Engineering</td>
            <td>Hybrid · Bangalore</td>
            <td><span class="badge badge-info">Full-time</span></td>
            <td>₹28L - ₹36L</td>
            <td><button class="btn btn-primary btn-sm" onclick="showToast('Application drafted for Lead Engineer', 'success')">1-Click Apply</button></td>
          </tr>
          <tr>
            <td><strong>Principal Product Designer</strong></td>
            <td>Design</td>
            <td>Remote</td>
            <td><span class="badge badge-info">Full-time</span></td>
            <td>₹24L - ₹32L</td>
            <td><button class="btn btn-primary btn-sm" onclick="showToast('Application drafted for Product Designer', 'success')">1-Click Apply</button></td>
          </tr>
          <tr>
            <td><strong>Autonomous AI & NLP Scientist</strong></td>
            <td>R&D</td>
            <td>Bangalore HQ</td>
            <td><span class="badge badge-info">Full-time</span></td>
            <td>₹35L - ₹48L</td>
            <td><button class="btn btn-primary btn-sm" onclick="showToast('Application drafted for AI Scientist', 'success')">1-Click Apply</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderAtsView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Recruiter ATS & Talent Pipeline</h2>
        <p>End-to-end recruitment funnel from sourcing to automated offer generation</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="openNewCandidateModal()"><i class="fa-solid fa-user-plus"></i> Add Candidate</button>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Candidate ID</th>
            <th>Candidate Name</th>
            <th>Applied Position</th>
            <th>Pipeline Stage</th>
            <th>AI Match</th>
            <th>Video Score</th>
            <th>Recruiter Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.candidates.map(c => `
            <tr>
              <td style="font-family:monospace; color:var(--primary); font-weight:700;">${c.id}</td>
              <td><strong>${c.name}</strong></td>
              <td>${c.role}</td>
              <td><span class="badge badge-warning">${c.stage}</span></td>
              <td><span class="badge badge-success">${c.match}</span></td>
              <td>${c.videoScore}</td>
              <td>
                <div style="display:flex; gap:6px;">
                  <a href="/meet/interview-${c.id.toLowerCase()}" target="_blank" class="btn btn-secondary btn-sm" title="Launch Interview Video">
                    <i class="fa-solid fa-video"></i>
                  </a>
                  <button class="btn btn-primary btn-sm" onclick="generateOfferLetter('${c.name}', '${c.role}')">
                    <i class="fa-solid fa-file-contract"></i> Offer
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderOnboardingView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Autonomous Onboarding & Document Verification</h2>
        <p>Zero-friction employee intake with digital KYC, equipment provisioning, and buddy setup</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('Welcome kit dispatched via logistics integration', 'success')">
          <i class="fa-solid fa-box"></i> Dispatch Welcome Kit
        </button>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">1. Digital KYC & Identity</span>
          <span class="badge badge-success">Completed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">PAN, Aadhaar/Passport, and Bank details verified via API.</p>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:100%;"></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">2. IT Hardware & Access</span>
          <span class="badge badge-success">Completed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">MacBook Pro M3 Max provisioned with Okta & GitHub SSO.</p>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:100%;"></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">3. Policy E-Signatures</span>
          <span class="badge badge-warning">2 / 3 Signed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">NDA signed. Awaiting Employee Handbook acknowledgement.</p>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:66%;"></div></div>
      </div>
    </div>
  `;
}

function renderAttendanceView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Attendance, Shift & Geofenced Time Clock</h2>
        <p>Biometric and mobile GPS time logging with autonomous regularizations</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-secondary" onclick="showToast('Attendance report exported', 'info')"><i class="fa-solid fa-file-excel"></i> Export Timesheet</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-location-dot" style="color:var(--primary);"></i> Geofenced Terminal</span>
          <span class="status-pill">${state.isPunchedIn ? 'Logged In' : 'Logged Out'}</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom: 16px;">
          Recognized office perimeter: <strong>Bangalore HQ (12.9716° N, 77.5946° E)</strong> within 200m radius.
        </p>
        <button class="btn ${state.isPunchedIn ? 'btn-danger' : 'btn-primary'}" style="width:100%; padding:14px;" onclick="togglePunch()">
          <i class="fa-solid ${state.isPunchedIn ? 'fa-right-from-bracket' : 'fa-fingerprint'}"></i>
          ${state.isPunchedIn ? 'Punch Out Shift' : 'Punch In with Geolocation'}
        </button>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-calendar-check" style="color:var(--success);"></i> Monthly Summary</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; text-align:center;">
          <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px;">
            <div style="font-size:24px; font-weight:700; color:var(--success);">21</div>
            <div style="font-size:11px; color:var(--text-muted);">Days Present</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px;">
            <div style="font-size:24px; font-weight:700; color:var(--warning);">1</div>
            <div style="font-size:11px; color:var(--text-muted);">Late Punch</div>
          </div>
          <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px;">
            <div style="font-size:24px; font-weight:700; color:var(--info);">2</div>
            <div style="font-size:11px; color:var(--text-muted);">Leaves Taken</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderLeavesView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Leave Balances & Absence Requests</h2>
        <p>Automated leave entitlements, real-time balances, and multi-approver hierarchy</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="openApplyLeaveModal()"><i class="fa-solid fa-plus"></i> Apply for Leave</button>
      </div>
    </div>

    <!-- Balance Summary -->
    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Casual Leave (CL)</span>
          <span class="badge badge-info">Annual</span>
        </div>
        <div class="card-stat">8 / 12</div>
        <div style="font-size:12px; color:var(--text-muted);">4 days utilized this calendar year</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Sick Leave (SL)</span>
          <span class="badge badge-warning">Medical</span>
        </div>
        <div class="card-stat">6 / 8</div>
        <div style="font-size:12px; color:var(--text-muted);">2 days utilized</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Earned Leave (EL)</span>
          <span class="badge badge-success">Encashable</span>
        </div>
        <div class="card-stat">14 / 18</div>
        <div style="font-size:12px; color:var(--text-muted);">Carried forward from previous cycle</div>
      </div>
    </div>

    <div class="table-container">
      <div style="padding: 16px; border-bottom: 1px solid var(--border);">
        <h3 style="font-size: 16px; color: #fff;">My Leave History</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Duration</th>
            <th>Dates</th>
            <th>Reason</th>
            <th>Approval Status</th>
          </tr>
        </thead>
        <tbody>
          ${state.leaves.map(l => `
            <tr>
              <td><strong>${l.type}</strong></td>
              <td>${l.days} Days</td>
              <td>${l.dates}</td>
              <td>${l.reason}</td>
              <td><span class="badge badge-success">${l.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderPayrollView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Automated Payroll & Salary Slips</h2>
        <p>1-click payroll processing, statutory deductions (PF/ESI/TDS), and instant payslips</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('October payslip downloaded', 'success')"><i class="fa-solid fa-file-pdf"></i> Download Latest Payslip</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 24px;">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-receipt" style="color:var(--primary);"></i> Current Month Earnings Statement</span>
          <span class="badge badge-success">Paid · Oct 2026</span>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div>
            <h4 style="font-size: 13px; color: var(--success); margin-bottom: 10px;">Earnings (+)</h4>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Basic Salary</span> <span>₹90,000</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>House Rent Allowance (HRA)</span> <span>₹45,000</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Special Allowance</span> <span>₹35,000</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; font-weight:700; color:#fff;">
              <span>Gross Earnings</span> <span>₹1,70,000</span>
            </div>
          </div>

          <div>
            <h4 style="font-size: 13px; color: var(--danger); margin-bottom: 10px;">Deductions (-)</h4>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Provident Fund (PF)</span> <span>₹10,800</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Professional Tax</span> <span>₹200</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span>Income Tax (TDS)</span> <span>₹14,000</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:13px; padding:6px 0; font-weight:700; color:var(--danger);">
              <span>Total Deductions</span> <span>₹25,000</span>
            </div>
          </div>
        </div>

        <div style="padding:16px; background:rgba(245,158,11,0.1); border-radius:12px; display:flex; justify-content:space-between; align-items:center; border:1px solid rgba(245,158,11,0.3);">
          <div>
            <div style="font-size:12px; color:var(--text-muted); text-transform:uppercase;">Net Take Home Pay</div>
            <div style="font-size:28px; font-weight:800; color:#fff; font-family:'Outfit';">₹1,45,000</div>
          </div>
          <span class="badge badge-success" style="font-size:12px;">Disbursed via Direct Bank ACH</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Tax Regime & Declarations</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Active Selection: <strong>New Tax Regime (FY 2026-27)</strong> with maximum standard deduction.</p>
        <button class="btn btn-secondary" style="width:100%;" onclick="showToast('80C/80D Proof declaration window open', 'info')">
          <i class="fa-solid fa-cloud-arrow-up"></i> Upload Investment Proofs
        </button>
      </div>
    </div>
  `;
}

function renderTrackingView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Field Tracking & Conveyance Reimbursement</h2>
        <p>Live route tracing for sales & field staff with automated mileage calculation</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="openExpenseClaimModal()"><i class="fa-solid fa-receipt"></i> Submit Expense Claim</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-car-side" style="color:var(--primary);"></i> Active Field Trip</span>
          <span class="badge badge-success">GPS Active</span>
        </div>
        <div style="background:rgba(6,17,44,0.6); padding:20px; border-radius:12px; text-align:center; margin-bottom:16px;">
          <div style="font-size:40px; font-weight:800; color:var(--primary); font-family:'Outfit';">42.6 km</div>
          <div style="font-size:12px; color:var(--text-muted);">Logged Today (Estimated Reimbursement: ₹426)</div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-success" style="flex:1;" onclick="showToast('GPS Route recording started', 'success')"><i class="fa-solid fa-play"></i> Start Route</button>
          <button class="btn btn-danger" style="flex:1;" onclick="showToast('Route saved and claim draft created', 'info')"><i class="fa-solid fa-stop"></i> Stop & Submit</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Recent Travel Claims</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px;">
            <div>
              <div style="font-weight:600; font-size:13px;">Client Visit - Whitefield</div>
              <div style="font-size:11px; color:var(--text-muted);">Oct 05, 2026 · 28 km</div>
            </div>
            <span class="badge badge-success">₹280 Paid</span>
          </div>
          <div style="display:flex; justify-content:space-between; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px;">
            <div>
              <div style="font-weight:600; font-size:13px;">Airport Client Pickup</div>
              <div style="font-size:11px; color:var(--text-muted);">Sep 29, 2026 · 65 km</div>
            </div>
            <span class="badge badge-success">₹650 Paid</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPerformanceView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Continuous Performance & 360° OKRs</h2>
        <p>Goal alignment, quarterly milestones, and autonomous peer feedback cycles</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('OKR check-in saved', 'success')"><i class="fa-solid fa-plus"></i> New Objective</button>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Q4 Objective 1</span>
          <span class="badge badge-success">On Track</span>
        </div>
        <p style="font-size:13px; color:#fff; font-weight:600;">Deploy NestJS Modular Micro-architecture</p>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:95%;"></div></div>
        <div style="font-size:11px; color:var(--text-muted);">Key Result: 0 compilation errors & 100% modular isolation.</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Q4 Objective 2</span>
          <span class="badge badge-warning">In Progress</span>
        </div>
        <p style="font-size:13px; color:#fff; font-weight:600;">Autonomous Talent Sourcing Automation</p>
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width:70%;"></div></div>
        <div style="font-size:11px; color:var(--text-muted);">Key Result: Sourcing speed reduced from 14 days to 48 hrs.</div>
      </div>
    </div>
  `;
}

function renderEngagementView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Social Culture, Wellness & Horoscope</h2>
        <p>Gamified engagement, celebration hub, water reminders, and ergonomic balance</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('Kudos shoutout broadcasted to team channel!', 'success')"><i class="fa-solid fa-hand-holding-heart"></i> Send Kudos</button>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-star-and-crescent" style="color:var(--primary);"></i> Daily Work Horoscope</span>
          <span class="badge badge-warning">Libra / Oct 8</span>
        </div>
        <p style="font-size:13px; color:#fff; line-height:1.5;">
          "High focus and strategic breakthroughs dominate your workday today. Collaboration with cross-functional teams will yield stellar results."
        </p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-cake-candles" style="color:var(--danger);"></i> Birthday Cheers</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
          <div class="avatar" style="background:#e11d48;">SM</div>
          <div>
            <div style="font-weight:600; font-size:13px;">Sophia Martinez (HR Manager)</div>
            <div style="font-size:11px; color:var(--text-muted);">Celebrating today! 🎂</div>
          </div>
          <button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="showToast('Birthday wish sent to Sophia!', 'success')">🎉 Cheer</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title"><i class="fa-solid fa-glass-water" style="color:var(--info);"></i> Hydration Tracker</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px;">
          <span style="font-size:13px; color:var(--text-muted);">Daily Goal: 8 Glasses</span>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="logWater(-1)">-</button>
            <span style="font-size:18px; font-weight:700; color:var(--primary);">${state.waterCount} / 8</span>
            <button class="btn btn-secondary btn-sm" onclick="logWater(1)">+</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTrainingView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Training, LMS & Skill Gap Matrix</h2>
        <p>Continuous education, compliance modules (POSH), and collaborative brainstorming</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('New course enrollment initiated', 'success')"><i class="fa-solid fa-graduation-cap"></i> Browse LMS Catalog</button>
      </div>
    </div>

    <div class="table-container">
      <div style="padding:16px; border-bottom:1px solid var(--border);">
        <h3 style="font-size:16px; color:#fff;">Mandatory Compliance & Skill Tracks</h3>
      </div>
      <table>
        <thead>
          <tr>
            <th>Course Name</th>
            <th>Type</th>
            <th>Due Date</th>
            <th>Progress</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Annual POSH Prevention & Workplace Ethics</strong></td>
            <td><span class="badge badge-danger">Statutory</span></td>
            <td>Oct 31, 2026</td>
            <td><span class="badge badge-success">Completed (100%)</span></td>
            <td><button class="btn btn-secondary btn-sm" onclick="showToast('Certificate verified', 'info')">View Certificate</button></td>
          </tr>
          <tr>
            <td><strong>Autonomous AI Security & OWASP Top 10</strong></td>
            <td><span class="badge badge-info">Technical</span></td>
            <td>Nov 15, 2026</td>
            <td><span class="badge badge-warning">In Progress (60%)</span></td>
            <td><button class="btn btn-primary btn-sm" onclick="showToast('Resuming course module', 'info')">Resume</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderComplaintsView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>100% Anonymous Whistleblower & Grievance Desk</h2>
        <p>Encrypted, zero-trace reporting channel directly to the independent ethics committee</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-danger" onclick="openComplaintModal()"><i class="fa-solid fa-shield-halved"></i> File Confidential Grievance</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-header">
        <span class="card-title"><i class="fa-solid fa-lock" style="color:var(--success);"></i> Anti-Retaliation & Privacy Guarantee</span>
      </div>
      <p style="font-size:13px; color:var(--text-muted); line-height:1.5;">
        Your identity is cryptographically separated from this submission. No IP address, user tokens, or device telemetry are stored with whistleblower tickets. You receive a random tracking token to follow investigation progress.
      </p>
    </div>

    <div class="table-container">
      <div style="padding:16px; border-bottom:1px solid var(--border);">
        <h3 style="font-size:16px; color:#fff;">Track Grievance By Token</h3>
      </div>
      <div style="padding:20px; display:flex; gap:12px;">
        <input type="text" class="form-control" placeholder="Enter confidential tracking token (e.g. WB-9402)" style="max-width:360px;">
        <button class="btn btn-secondary" onclick="showToast('Token verified. Status: In Review by Ethics Council', 'info')">Track Progress</button>
      </div>
    </div>
  `;
}

function renderExitView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Exit Management & Full and Final (FNF) Settlement</h2>
        <p>Resignation workflow, departmental clearances, handover, and automated severance</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-secondary" onclick="showToast('Resignation policy document opened', 'info')"><i class="fa-solid fa-file-lines"></i> Resignation Guidelines</button>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">IT Asset Clearance</span>
          <span class="badge badge-success">Approved</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">Laptop, monitor, and security badge returned.</p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Finance & Travel Clearance</span>
          <span class="badge badge-success">Approved</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">Zero outstanding travel advances or corporate card dues.</p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">FNF Settlement Calculation</span>
          <span class="badge badge-info">Processed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">Gratuity, encashed leaves, and final month salary computed.</p>
      </div>
    </div>
  `;
}

function renderHandbookView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Company Policies & Digital Handbook</h2>
        <p>Statutory workplace regulations with verifiable cryptographic e-signatures</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('All current policies acknowledged with digital stamp', 'success')">
          <i class="fa-solid fa-signature"></i> E-Sign Acknowledgement
        </button>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Code of Business Conduct</span>
          <span class="badge badge-success">Signed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">Covers insider trading, confidentiality, conflict of interest, and anti-corruption.</p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Remote & Hybrid Work Protocol</span>
          <span class="badge badge-success">Signed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">VPN connectivity requirements, data protection, and core collaboration hours.</p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Equal Opportunity & POSH</span>
          <span class="badge badge-success">Signed</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted);">Zero tolerance for workplace discrimination or sexual harassment.</p>
      </div>
    </div>
  `;
}

function renderSettingsView() {
  return `
    <div class="page-header">
      <div class="page-title">
        <h2>Organization Configuration & Subscription Tier</h2>
        <p>Global multi-tenant tenant controls, custom fields, and plan management</p>
      </div>
      <div class="header-toolbar">
        <button class="btn btn-primary" onclick="showToast('Settings saved successfully', 'success')"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Company Profile</span>
        </div>
        <div class="form-group">
          <label class="form-label">Legal Entity Name</label>
          <input type="text" class="form-control" value="Nerkanal Global Technologies Pvt. Ltd.">
        </div>
        <div class="form-group">
          <label class="form-label">Corporate Email Domain</label>
          <input type="text" class="form-control" value="@nerkanal.app">
        </div>
        <div class="form-group">
          <label class="form-label">Primary HQ Timezone</label>
          <select class="form-control">
            <option selected>Asia/Kolkata (IST - UTC+05:30)</option>
            <option>America/New_York (EST)</option>
            <option>Europe/London (GMT)</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">SaaS Subscription Tier</span>
          <span class="badge badge-warning">Enterprise Unlimited</span>
        </div>
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
          Includes unlimited candidate video interviews, AI Jarvis copilot tokens, multi-level approvals, and WebRTC mesh meetings.
        </p>
        <div style="padding:16px; background:rgba(6,17,44,0.6); border-radius:12px; margin-bottom:16px;">
          <div style="font-size:12px; color:var(--text-muted);">Next Renewal Date</div>
          <div style="font-size:16px; font-weight:700; color:#fff;">October 08, 2027 (Annual Pre-paid)</div>
        </div>
        <button class="btn btn-secondary" onclick="showToast('Invoice downloaded', 'info')"><i class="fa-solid fa-download"></i> Download Tax Invoice</button>
      </div>
    </div>
  `;
}

/* =========================================================================
   INTERACTIONS & MODALS
========================================================================= */

function togglePunch() {
  state.isPunchedIn = !state.isPunchedIn;
  if (state.isPunchedIn) {
    const now = new Date();
    state.punchTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    showToast(`Punched IN at ${state.punchTime} (GPS Verified)`, 'success');
  } else {
    showToast('Punched OUT successfully. Have a great evening!', 'info');
  }
  renderCurrentTab();
}

function selectMood(val) {
  state.selectedMood = val;
  const messages = {
    1: 'Taking note. Consider scheduling a break or speaking with your manager.',
    2: 'Hang in there! We are here to support you.',
    3: 'Steady pace wins the day.',
    4: 'Awesome energy! Keep crushing your goals.',
    5: 'Super charged mode unlocked! You are unstoppable today! 🚀',
  };
  showToast(messages[val] || 'Mood recorded', 'info');
  renderCurrentTab();
}

function logWater(delta) {
  state.waterCount = Math.max(0, Math.min(8, state.waterCount + delta));
  const el = document.getElementById('water-count-display');
  if (el) el.innerText = `${state.waterCount} / 8`;
  if (state.waterCount === 8) {
    showToast('🎉 Daily hydration target accomplished! Excellent work!', 'success');
  }
}

function approveItem(id) {
  const item = state.pendingApprovals.find(a => a.id === id);
  if (item) {
    item.status = 'Approved';
    showToast(`Approved ${item.type} for ${item.requester}`, 'success');
    updateApprovalsBadge();
    renderCurrentTab();
  }
}

function rejectItem(id) {
  const item = state.pendingApprovals.find(a => a.id === id);
  if (item) {
    item.status = 'Rejected';
    showToast(`Rejected ${item.type} for ${item.requester}`, 'error');
    updateApprovalsBadge();
    renderCurrentTab();
  }
}

function approveAllPending() {
  state.pendingApprovals.forEach(a => a.status = 'Approved');
  showToast('All pending items authorized with 1-click!', 'success');
  updateApprovalsBadge();
  renderCurrentTab();
}

function openApplyLeaveModal() {
  openModal('Apply for Leave', `
    <div class="form-group">
      <label class="form-label">Leave Type</label>
      <select class="form-control" id="modal-leave-type">
        <option>Casual Leave (CL)</option>
        <option>Sick Leave (SL)</option>
        <option>Earned Leave (EL)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Start Date</label>
      <input type="date" class="form-control" id="modal-leave-start" value="2026-10-15">
    </div>
    <div class="form-group">
      <label class="form-label">End Date</label>
      <input type="date" class="form-control" id="modal-leave-end" value="2026-10-16">
    </div>
    <div class="form-group">
      <label class="form-label">Reason</label>
      <textarea class="form-control" rows="3" id="modal-leave-reason" placeholder="State reason for absence..."></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitLeaveFromModal()">Submit Request</button>
  `);
}

function submitLeaveFromModal() {
  const type = document.getElementById('modal-leave-type').value;
  const start = document.getElementById('modal-leave-start').value;
  const reason = document.getElementById('modal-leave-reason').value || 'Personal commitment';

  state.leaves.unshift({
    type,
    days: 2,
    dates: `${start}`,
    reason,
    status: 'Pending',
  });

  closeModal();
  showToast('Leave request submitted to Reporting Manager', 'success');
  renderCurrentTab();
}

function openApprovalsModal() {
  navigateTo('approvals');
}

function openCandidateApplyModal() {
  openModal('Submit Candidate Profile', `
    <div class="form-group">
      <label class="form-label">Full Name</label>
      <input type="text" class="form-control" placeholder="Jane Doe">
    </div>
    <div class="form-group">
      <label class="form-label">Target Role</label>
      <input type="text" class="form-control" value="Lead Full Stack Engineer">
    </div>
    <div class="form-group">
      <label class="form-label">Upload Resume (PDF / DOCX)</label>
      <input type="file" class="form-control">
    </div>
    <div class="form-group">
      <label class="form-label">LinkedIn / GitHub Profile</label>
      <input type="text" class="form-control" placeholder="https://github.com/...">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="closeModal(); showToast('Profile submitted. AI screening initiated.', 'success');">Submit Application</button>
  `);
}

function openNewCandidateModal() {
  openModal('Add Candidate to Pipeline', `
    <div class="form-group">
      <label class="form-label">Candidate Name</label>
      <input type="text" class="form-control" id="new-cand-name" placeholder="Johnathan Doe">
    </div>
    <div class="form-group">
      <label class="form-label">Position</label>
      <input type="text" class="form-control" id="new-cand-role" value="Senior Backend Engineer">
    </div>
    <div class="form-group">
      <label class="form-label">Stage</label>
      <select class="form-control" id="new-cand-stage">
        <option>Applied</option>
        <option>Screening</option>
        <option>Interview</option>
        <option>Offer Sent</option>
      </select>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitNewCandidate()">Add Candidate</button>
  `);
}

function submitNewCandidate() {
  const name = document.getElementById('new-cand-name').value || 'New Applicant';
  const role = document.getElementById('new-cand-role').value || 'Engineer';
  const stage = document.getElementById('new-cand-stage').value || 'Applied';

  state.candidates.push({
    id: `CAND-0${state.candidates.length + 1}`,
    name,
    role,
    stage,
    match: '90%',
    videoScore: 'Pending',
    rating: 4.5,
  });

  closeModal();
  showToast(`Added ${name} to ATS pipeline`, 'success');
  renderCurrentTab();
}

function generateOfferLetter(name, role) {
  openModal(`Generate Offer Letter: ${name}`, `
    <p style="font-size:13px; color:var(--text-muted); margin-bottom:14px;">
      Autonomous offer letter template prepared with standard non-compete and IP clauses.
    </p>
    <div class="form-group">
      <label class="form-label">Designation</label>
      <input type="text" class="form-control" value="${role}">
    </div>
    <div class="form-group">
      <label class="form-label">Annual CTC (INR)</label>
      <input type="text" class="form-control" value="₹32,00,000">
    </div>
    <div class="form-group">
      <label class="form-label">Joining Date</label>
      <input type="date" class="form-control" value="2026-11-01">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="closeModal(); showToast('Offer letter dispatched via DocuSign to ${name}!', 'success');">Send Official Offer</button>
  `);
}

function openExpenseClaimModal() {
  openModal('Submit Conveyance Expense Claim', `
    <div class="form-group">
      <label class="form-label">Trip Purpose</label>
      <input type="text" class="form-control" placeholder="Client on-site meeting">
    </div>
    <div class="form-group">
      <label class="form-label">Distance Travelled (KM)</label>
      <input type="number" class="form-control" value="35">
    </div>
    <div class="form-group">
      <label class="form-label">Claim Amount (INR)</label>
      <input type="text" class="form-control" value="₹350">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="closeModal(); showToast('Expense claim routed to Manager for approval', 'success');">Submit Claim</button>
  `);
}

function openComplaintModal() {
  openModal('File Anonymous Grievance', `
    <p style="font-size:12px; color:var(--danger); margin-bottom:12px;">
      <i class="fa-solid fa-lock"></i> Zero metadata stored. This report is 100% confidential.
    </p>
    <div class="form-group">
      <label class="form-label">Incident Category</label>
      <select class="form-control">
        <option>POSH / Workplace Harassment</option>
        <option>Financial Misconduct / Fraud</option>
        <option>Ethics & Discrimination</option>
        <option>Other Operational Concerns</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Detailed Description</label>
      <textarea class="form-control" rows="4" placeholder="Detail the occurrence, dates, and locations..."></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="closeModal(); showToast('Encrypted grievance filed. Tracking Token: WB-8391', 'success');">Submit Anonymously</button>
  `);
}

function startMockInterview() {
  showToast('Starting 60-second AI pitch evaluation...', 'info');
  setTimeout(() => {
    showToast('Pitch recorded! AI Confidence score: 92/100', 'success');
  }, 2500);
}

function exportReport() {
  showToast('Compiling comprehensive executive BI report in PDF format...', 'info');
  setTimeout(() => {
    showToast('BI Report successfully generated and downloaded.', 'success');
  }, 1200);
}

function showUserProfileModal() {
  openModal('User Profile', `
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
      <div class="avatar" style="width:60px; height:60px; font-size:24px;">${document.getElementById('user-avatar').innerText}</div>
      <div>
        <h3 style="color:#fff; font-size:18px;">${state.user.name}</h3>
        <p style="color:var(--primary); font-size:13px; font-weight:600;">${state.user.title}</p>
        <p style="color:var(--text-muted); font-size:12px;">${state.user.email}</p>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.03); padding:12px; border-radius:8px;">
      <div style="font-size:12px; color:var(--text-muted);">Access Token</div>
      <div style="font-family:monospace; font-size:11px; color:#fff; word-break:break-all; margin-top:4px;">
        ${state.user.token ? state.user.token.substring(0, 32) + '...' : 'Demo Session Token'}
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
  `);
}

/* =========================================================================
   GENERIC MODAL UTILITY
========================================================================= */

function openModal(title, bodyHtml, footerHtml = '') {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '<button class="btn btn-secondary" onclick="closeModal()">Close</button>';
  document.getElementById('app-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('app-modal').classList.remove('open');
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'app-modal') {
    closeModal();
  }
}

/* =========================================================================
   JARVIS AI COPILOT
========================================================================= */

function toggleJarvis() {
  const panel = document.getElementById('jarvis-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    document.getElementById('jarvis-input').focus();
  }
}

function askJarvisPrompt(text) {
  document.getElementById('jarvis-input').value = text;
  sendJarvisMessage();
}

async function sendJarvisMessage() {
  const input = document.getElementById('jarvis-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  appendJarvisMessage(text, 'user');

  // AI Thinking indicator
  const typingId = appendJarvisMessage('Thinking...', 'bot');

  try {
    const res = await fetch('/jarvis/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.user.token ? { 'Authorization': `Bearer ${state.user.token}` } : {}),
      },
      body: JSON.stringify({ message: text }),
    });

    if (res.ok) {
      const data = await res.json();
      removeJarvisMessage(typingId);
      appendJarvisMessage(data.reply || data.response || JSON.stringify(data), 'bot');
      return;
    }
  } catch (e) {
    // Fallback to local intelligent responses
  }

  removeJarvisMessage(typingId);
  const smartReply = generateLocalJarvisReply(text);
  appendJarvisMessage(smartReply, 'bot');
}

function generateLocalJarvisReply(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('leave') && p.includes('balance')) {
    return 'Your current leave balances are: 8 Casual Leaves (CL), 6 Sick Leaves (SL), and 14 Earned Leaves (EL). Would you like me to draft a leave application?';
  }
  if (p.includes('leave') && (p.includes('who') || p.includes('today'))) {
    return 'Today, 3 team members are on approved leave: Deepak S (Sick Leave), Meera K (Casual Leave), and Vikram P (Comp-Off). Total workplace attendance stands at 96.8%.';
  }
  if (p.includes('posh')) {
    return 'Under the POSH Act 2013 and Nerkanal Company Guidelines, all reports are handled by an independent Internal Complaints Committee (ICC) with guaranteed anti-retaliation protection and 90-day resolution timeline.';
  }
  if (p.includes('offer')) {
    return 'Offer letter template for Lead Engineer prepared: Base INR 32,00,000, 4-year ESOP vesting schedule, 30 days joining bonus clause. Would you like me to dispatch it?';
  }
  if (p.includes('salary') || p.includes('payroll')) {
    return 'Your net take-home salary for this month is ₹1,45,000 disbursed on the 1st of the month. Form 16 and TDS certificates are accessible in the Payroll tab.';
  }
  return `Understood. I have logged this request regarding "${prompt}". As your autonomous HR assistant, I can adjust workflows, generate documents, or query SQLite state immediately.`;
}

function appendJarvisMessage(text, sender) {
  const container = document.getElementById('jarvis-messages');
  const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
  const div = document.createElement('div');
  div.id = id;
  div.className = `jarvis-bubble ${sender}`;
  div.innerText = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeJarvisMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/* =========================================================================
   TOAST NOTIFICATION ENGINE
========================================================================= */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    info: 'fa-circle-info',
  };
  const icon = icons[type] || 'fa-bell';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
