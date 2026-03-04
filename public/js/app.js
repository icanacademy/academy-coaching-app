// API Base URL
const API = '';

// Debounce timer for search
let searchDebounceTimer = null;

function debounceSearch(callback) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    callback();
  }, 300);
}

// Current state
let currentUser = null;
let currentCoachingId = null;
let currentEmployeeId = null;
let categories = [];
let signaturePad = null;
let signatureType = null;

// Labels
const coachingTypeLabels = {
  'verbal_1': '1st Verbal Warning',
  'verbal_2': '2nd Verbal Warning',
  'written': 'Written Warning',
  'final': 'Final Written Warning',
  'performance_improvement': 'Performance Improvement Plan'
};

const progressStatusLabels = {
  'improved': 'Improved',
  'no_change': 'No Change',
  'declined': 'Declined',
  'resolved': 'Resolved'
};

const severityLabels = {
  'minor': 'Minor',
  'moderate': 'Moderate',
  'serious': 'Serious',
  'severe': 'Severe'
};

const roleLabels = {
  'admin': 'Administrator',
  'hr': 'HR Manager',
  'supervisor': 'Coach',
  'employee': 'Employee'
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

async function checkAuth() {
  try {
    const response = await fetch(`${API}/api/auth/me`, {
      credentials: 'include'
    });

    if (response.ok) {
      currentUser = await response.json();
      showMainApp();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function showMainApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';

  // Set user info in sidebar
  document.getElementById('user-display-name').textContent = currentUser.username;
  document.getElementById('user-role').textContent = roleLabels[currentUser.role] || currentUser.role;

  // Show/hide menu items based on role
  updateMenuVisibility();

  // Initialize app
  initNavigation();
  loadCategories();
  loadDashboard();
  startNotificationPolling();
}

function updateMenuVisibility() {
  const role = currentUser.role;

  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowedRoles = el.dataset.roles.split(',');
    if (allowedRoles.includes(role)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

// ============ LOGIN/LOGOUT ============
async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  errorEl.textContent = '';

  try {
    const response = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      currentUser = data.user;
      showMainApp();
    } else {
      errorEl.textContent = data.error || 'Login failed';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorEl.textContent = 'Connection error. Please try again.';
  }
}

async function logout() {
  try {
    await fetch(`${API}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  currentUser = null;
  showLogin();
  document.getElementById('login-form').reset();
}

// ============ NAVIGATION ============
function initNavigation() {
  document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      if (page) {
        showPage(page);
        document.querySelectorAll('.nav-menu a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  });
}

function showPage(pageName) {
  document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
  const targetPage = document.getElementById(`${pageName}-page`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  // Load data for specific pages
  switch(pageName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'employees':
      loadEmployees();
      break;
    case 'coaching':
      loadCoachingRecords();
      break;
    case 'new-coaching':
      setupNewCoachingForm();
      break;
    case 'reports':
      setupReports();
      break;
    case 'users':
      loadUsers();
      break;
    case 'settings':
      loadSettings();
      break;
    case 'analytics':
      loadAnalytics();
      break;
  }
}

// ============ CATEGORIES ============
async function loadCategories() {
  try {
    const response = await fetch(`${API}/api/categories`, {
      credentials: 'include'
    });
    if (response.ok) {
      categories = await response.json();
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// ============ DASHBOARD ============
async function loadDashboard() {
  try {
    const response = await fetch(`${API}/api/dashboard`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        showLogin();
        return;
      }
      throw new Error('Failed to load dashboard');
    }

    const data = await response.json();

    document.getElementById('stat-employees').textContent = data.totalEmployees || 0;
    document.getElementById('stat-open').textContent = data.openCoachings || 0;
    document.getElementById('stat-followups').textContent = data.upcomingFollowUps || 0;
    document.getElementById('stat-pending-review').textContent = data.pendingHRReview || 0;
    document.getElementById('stat-this-month').textContent = data.coachingsThisMonth || 0;
    document.getElementById('stat-closed').textContent = data.closedCoachings || 0;

    // Recent coachings
    const recentHtml = data.recentCoachings && data.recentCoachings.length > 0
      ? data.recentCoachings.map(c => `
          <div class="dashboard-item">
            <div class="dashboard-item-info">
              <h4>${c.employee_name}</h4>
              <p>${coachingTypeLabels[c.coaching_type] || c.coaching_type} - ${formatDate(c.coaching_date)}</p>
            </div>
            <span class="badge badge-${c.status}">${c.status}</span>
          </div>
        `).join('')
      : '<div class="empty-state"><p>No recent coaching records</p></div>';

    document.getElementById('recent-coachings').innerHTML = recentHtml;

    // Upcoming follow-ups
    const followupsHtml = data.followUpsDue && data.followUpsDue.length > 0
      ? data.followUpsDue.map(c => `
          <div class="dashboard-item">
            <div class="dashboard-item-info">
              <h4>${c.employee_name}</h4>
              <p>Follow-up: ${formatDate(c.follow_up_date)}</p>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="viewCoachingDetail('${c.id}')">View</button>
          </div>
        `).join('')
      : '<div class="empty-state"><p>No upcoming follow-ups</p></div>';

    document.getElementById('upcoming-followups').innerHTML = followupsHtml;
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

// ============ EMPLOYEES ============
async function loadEmployees() {
  try {
    const search = document.getElementById('employee-search')?.value || '';
    const status = document.getElementById('employee-status-filter')?.value || '';

    let url = `${API}/api/employees?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${encodeURIComponent(status)}&`;

    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 401) {
        showLogin();
        return;
      }
      throw new Error('Failed to load employees');
    }

    const employees = await response.json();

    const tbody = document.getElementById('employees-table-body');
    tbody.innerHTML = employees.length > 0
      ? employees.map(emp => `
          <tr>
            <td>${emp.employee_number || '-'}</td>
            <td><strong>${emp.first_name} ${emp.last_name}</strong>${emp.is_admin ? ' <span class="badge badge-info" style="font-size:10px;">Admin</span>' : ''}</td>
            <td>${emp.position}</td>
            <td>-</td>
            <td>${emp.supervisor_name || '-'}</td>
            <td>${emp.coaching_count || 0}</td>
            <td><span class="badge badge-${emp.status}">${emp.status}</span></td>
            <td class="actions">
              <button class="btn btn-sm btn-secondary" onclick="viewEmployeeTimeline('${emp.id}')">Timeline</button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="8" class="empty-state"><p>No employees found</p></td></tr>';
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}


async function loadSupervisors(selectId) {
  try {
    const response = await fetch(`${API}/api/supervisors`, { credentials: 'include' });
    if (response.ok) {
      const supervisors = await response.json();
      const select = document.getElementById(selectId);
      if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">None / Select</option>' +
          supervisors.map(s => {
            const adminTag = s.is_admin ? ' (Admin)' : '';
            return `<option value="${s.id}">${s.first_name} ${s.last_name}${adminTag} - ${s.position}</option>`;
          }).join('');
        if (current) select.value = current;
      }
    }
  } catch (error) {
    console.error('Error loading supervisors:', error);
  }
}

async function loadEmployeesForSelect(selectId) {
  try {
    const response = await fetch(`${API}/api/employees?status=active`, { credentials: 'include' });
    if (response.ok) {
      const employees = await response.json();
      const select = document.getElementById(selectId);
      if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">Select Employee</option>' +
          employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name} - ${e.position}</option>`).join('');
        if (current) select.value = current;
      }
    }
  } catch (error) {
    console.error('Error loading employees:', error);
  }
}

function showEmployeeModal(employeeId = null) {
  document.getElementById('employee-modal').classList.add('active');
  document.getElementById('employee-modal-title').textContent = employeeId ? 'Edit Employee' : 'Add Employee';
  document.getElementById('employee-form').reset();
  document.getElementById('employee-id').value = employeeId || '';

  loadSupervisors('emp-supervisor');

  if (employeeId) {
    loadEmployeeForEdit(employeeId);
  }
}

async function loadEmployeeForEdit(id) {
  try {
    const response = await fetch(`${API}/api/employees/${id}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load employee');

    const emp = await response.json();

    document.getElementById('emp-first-name').value = emp.first_name || '';
    document.getElementById('emp-last-name').value = emp.last_name || '';
    document.getElementById('emp-employee-number').value = emp.employee_number || '';
    document.getElementById('emp-email').value = emp.email || '';
    document.getElementById('emp-phone').value = emp.phone || '';
    document.getElementById('emp-position').value = emp.position || '';
    document.getElementById('emp-hire-date').value = emp.hire_date || '';
    document.getElementById('emp-role-start-date').value = emp.role_start_date || '';
    document.getElementById('emp-supervisor').value = emp.supervisor_id || '';
    document.getElementById('emp-status').value = emp.status || 'active';
    document.getElementById('emp-union-member').checked = emp.union_member === 1;
    document.getElementById('emp-emergency-name').value = emp.emergency_contact_name || '';
    document.getElementById('emp-emergency-phone').value = emp.emergency_contact_phone || '';
    document.getElementById('emp-notes').value = emp.notes || '';
  } catch (error) {
    console.error('Error loading employee:', error);
    alert('Error loading employee data');
  }
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').classList.remove('active');
}

async function submitEmployeeForm(e) {
  e.preventDefault();

  const id = document.getElementById('employee-id').value;
  const data = {
    first_name: document.getElementById('emp-first-name').value,
    last_name: document.getElementById('emp-last-name').value,
    employee_number: document.getElementById('emp-employee-number').value || null,
    email: document.getElementById('emp-email').value || null,
    phone: document.getElementById('emp-phone').value || null,
    position: document.getElementById('emp-position').value,
    hire_date: document.getElementById('emp-hire-date').value,
    role_start_date: document.getElementById('emp-role-start-date').value || null,
    supervisor_id: document.getElementById('emp-supervisor').value || null,
    status: document.getElementById('emp-status').value,
    union_member: document.getElementById('emp-union-member').checked ? 1 : 0,
    emergency_contact_name: document.getElementById('emp-emergency-name').value || null,
    emergency_contact_phone: document.getElementById('emp-emergency-phone').value || null,
    notes: document.getElementById('emp-notes').value || null
  };

  try {
    const url = id ? `${API}/api/employees/${id}` : `${API}/api/employees`;
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeEmployeeModal();
      loadEmployees();
      showToast(id ? 'Employee updated successfully!' : 'Employee added successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error saving employee:', error);
    showToast('Error saving employee', 'error');
  }
}

function editEmployee(id) {
  showEmployeeModal(id);
}

function filterEmployees() {
  loadEmployees();
}

// ============ COACHING RECORDS ============
async function loadCoachingRecords() {
  try {
    const status = document.getElementById('filter-status')?.value || '';
    const type = document.getElementById('filter-type')?.value || '';
    const category = document.getElementById('filter-category')?.value || '';
    const severity = document.getElementById('filter-severity')?.value || '';
    const search = document.getElementById('coaching-search')?.value || '';
    const dateFrom = document.getElementById('filter-date-from')?.value || '';
    const dateTo = document.getElementById('filter-date-to')?.value || '';

    let url = `${API}/api/coaching?`;
    if (status) url += `status=${encodeURIComponent(status)}&`;
    if (type) url += `type=${encodeURIComponent(type)}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (severity) url += `severity=${encodeURIComponent(severity)}&`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (dateFrom) url += `dateFrom=${encodeURIComponent(dateFrom)}&`;
    if (dateTo) url += `dateTo=${encodeURIComponent(dateTo)}&`;

    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 401) {
        showLogin();
        return;
      }
      throw new Error('Failed to load coaching records');
    }

    const records = await response.json();

    // Populate category filter
    const categorySelect = document.getElementById('filter-category');
    if (categorySelect && categories.length > 0) {
      const current = categorySelect.value;
      categorySelect.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      categorySelect.value = current;
    }

    const tbody = document.getElementById('coaching-table-body');
    tbody.innerHTML = records.length > 0
      ? records.map(r => `
          <tr>
            <td>${formatDate(r.coaching_date)}</td>
            <td><strong>${r.employee_name}</strong><br><small>${r.employee_position || ''}</small></td>
            <td><span class="badge badge-level badge-${getTypeBadgeClass(r.coaching_type)}">${coachingTypeLabels[r.coaching_type] || r.coaching_type}</span></td>
            <td>${r.category_name || '-'}</td>
            <td>${r.supervisor_name}</td>
            <td><span class="badge badge-${r.status}">${r.status}</span></td>
            <td class="actions">
              <button class="btn btn-sm btn-secondary" onclick="viewCoachingDetail('${r.id}')">View</button>
              <button class="btn btn-sm btn-secondary" onclick="downloadPDF('${r.id}')">PDF</button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state"><p>No coaching records found</p></td></tr>';
  } catch (error) {
    console.error('Error loading coaching records:', error);
  }
}

function getTypeBadgeClass(type) {
  const classes = {
    'verbal_1': 'verbal',
    'verbal_2': 'verbal',
    'written': 'written',
    'final': 'final',
    'performance_improvement': 'pip'
  };
  return classes[type] || 'verbal';
}

function filterCoachingRecords() {
  loadCoachingRecords();
}

// ============ NEW COACHING FORM ============
async function setupNewCoachingForm() {
  const today = new Date().toISOString().split('T')[0];
  const coachingDateEl = document.getElementById('coaching-date');
  if (coachingDateEl) coachingDateEl.value = today;

  // Load employees
  try {
    const response = await fetch(`${API}/api/employees?status=active`, { credentials: 'include' });
    if (response.ok) {
      const employees = await response.json();
      const select = document.getElementById('coaching-employee');
      if (select) {
        select.innerHTML = '<option value="">Select Employee</option>' +
          employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name} - ${e.position}</option>`).join('');
      }
    }
  } catch (error) {
    console.error('Error loading employees:', error);
  }

  // Load supervisors
  await loadSupervisors('coaching-supervisor');

  // Set current user as supervisor if they are one
  if (currentUser && (currentUser.role === 'supervisor' || currentUser.role === 'admin')) {
    const supervisorSelect = document.getElementById('coaching-supervisor');
    if (supervisorSelect && currentUser.employee_id) {
      supervisorSelect.value = currentUser.employee_id;
    }
  }

  // Load categories
  const categorySelect = document.getElementById('coaching-category');
  if (categorySelect && categories.length > 0) {
    categorySelect.innerHTML = '<option value="">Select Category</option>' +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  // Add event listeners for auto-suggesting coaching level
  const employeeSelect = document.getElementById('coaching-employee');
  if (employeeSelect) {
    employeeSelect.addEventListener('change', onEmployeeSelected);
  }
  if (categorySelect) {
    categorySelect.addEventListener('change', () => onCategorySelected());
  }

  // Add offense selection listener
  const offenseSelect = document.getElementById('coaching-offense');
  if (offenseSelect) {
    offenseSelect.addEventListener('change', onOffenseSelected);
  }
}

// When category is selected, load offenses for that category
// Policy reference mapping based on ICAN Company Policy 2023
const POLICY_REFERENCES = {
  'cat_person': `OFFENSES AGAINST PERSON (Code of Conduct Section A)

ICAN Language Center advocates peace and harmony between individuals. The following behaviors are prohibited:
• Section 1: Crime against employer/supervisor (GRAVE)
• Section 2: Inflicting physical injury (MAJOR)
• Section 3: Threat, intimidation or coercion (MAJOR)
• Section 4: Fighting within/outside premises related to work (MAJOR)
• Section 5: Inciting or provoking a fight (MINOR)
• Section 6: Telling offensive remarks (MINOR)
• Section 7: Immoral act/sexual harassment (GRAVE)

Reference: ICAN Company Policy 2023, Appendix A - Code of Conduct`,

  'cat_property': `OFFENSES AGAINST PROPERTY (Code of Conduct Section B)

Honesty and integrity are virtues ICAN strongly adheres to:
• Section 1: Theft/robbery of company/employee/client property (GRAVE)
• Section 2: Swindling/malversation of funds (GRAVE)
• Section 3: Obtaining supplies on fraudulent orders (GRAVE)
• Section 4: Unauthorized substitution of materials (MAJOR)
• Section 5: Property alteration/removal causing damage (GRAVE/MAJOR)
• Section 6: Using company resources for personal gain (MAJOR)
• Section 7: Failure to return property/money (MINOR)
• Section 8: Willful destruction of property (MAJOR)

Reference: ICAN Company Policy 2023, Appendix A - Code of Conduct`,

  'cat_company': `OFFENSES AGAINST COMPANY INTEREST (Code of Conduct Section C)

Employees must manifest honesty, concern, and loyalty:
• Section 1: Falsification of personal records (GRAVE)
• Section 2: Falsification of company records (GRAVE)
• Section 3: Expense fraud (GRAVE)
• Section 4: Kickbacks/bribery (GRAVE)
• Section 5: Job-related bribery (GRAVE)
• Section 6: Giving ID to unauthorized persons (GRAVE)
• Section 7: Loitering/leaving work without permission (MAJOR)
• Section 8: Malingering/feigning illness (MAJOR)
• Section 9: Sleeping during class/duty (MAJOR)
• Section 10: Failure to follow instructions (MINOR)
• Section 11: Inducing others to violate policies (MAJOR)

Reference: ICAN Company Policy 2023, Appendix A - Code of Conduct`,

  'cat_decency': `OFFENSES AGAINST DECENCY/MORALITY (Code of Conduct Section D)

ICAN upholds virtues of dignity, honor, modesty, and decency:
• Section 1: Under influence of alcohol (MAJOR) / drugs (GRAVE)
• Section 2: Bringing alcohol/drugs to premises (MAJOR/GRAVE)
• Section 3: False/malicious statements about employees (MAJOR)
• Section 4: Libel/defamation/slander (MAJOR)
• Section 5: Scandalous conduct/profane language (MINOR)
• Section 6: Sexual harassment (GRAVE)
• Section 7: Crime against chastity (GRAVE)
• Section 8: Gambling on premises (MAJOR)
• Section 9: Criminal conviction (MAJOR)

Reference: ICAN Company Policy 2023, Appendix A - Code of Conduct`,

  'cat_admin': `OFFENSES AGAINST ADMINISTRATION (Code of Conduct Section E)

Practice of Order, Self-discipline, and Industriousness required:
• Section 1: Habitual Tardiness - 10+ instances or 120+ min/month (MINOR)
• Section 2: Overbreak - >15min breaks, 5+ times or 30+ min/month (MINOR)
• Section 3: AWOL - Each day is separate offense (MAJOR)
• Section 4: Failure to return from leave (MINOR)
• Section 5: Failure to report for OT (MINOR)
• Section 6: Time card fraud (MAJOR)
• Section 7: Failure to punch in/out (MINOR)
• Section 8: Derogatory postings (MINOR)
• Section 9: Vandalism (MAJOR)
• Section 10: Featherbedding/slowing work (GRAVE)
• Section 11-15: Various work conduct violations (MAJOR)

Reference: ICAN Company Policy 2023, Section VI & Appendix A`,

  'cat_authority': `OFFENSES AGAINST AUTHORITY - INSUBORDINATION (Code of Conduct Section F)

Proper behavior towards established authorities required:
• Section 1: Refusing job assignments without reason (MAJOR)
• Section 2: Willful disobedience of lawful orders (GRAVE)
• Section 3: Disrespect/disregard of authority (MAJOR)
• Section 4: Resistance/threat/assault against authority (MAJOR)
• Section 5: Other acts of insubordination (MAJOR)

Reference: ICAN Company Policy 2023, Appendix A - Code of Conduct`,

  'cat_attendance': `ATTENDANCE & PUNCTUALITY (Company Policy Section VI)

Time Keeping Requirements:
• Employees must properly log time using designated machine
• Missing start/end times = considered absences
• Tardiness: Any time-in after designated start time
• Undertime: Any time-out before designated end time

Notification Requirements:
• Instructors: Notify Academic Coordinator 30 min before schedule
• Non-Instructors: Notify Management 30 min before schedule
• Absences: Notify 1-2 hours before schedule with endorsement

Habitual Tardiness: 10+ instances OR 120+ minutes total in one month (MINOR)

Reference: ICAN Company Policy 2023, Section VI - Attendance`,

  'cat_teaching': `TEACHING & CLASSROOM (Teacher's Handbook)

Conducting Classes Requirements:
• Always speak English, communicate properly with respect
• Wear appropriate and decent attire
• Adhere to assigned material and course outline
• Keep non-class conversations to minimum
• Mobile device use for personal purposes PROHIBITED
• Cannot leave classes unsupervised without Head Teacher consent

Documentation Requirements:
• Accomplish Instructor's Notebook daily
• Weekly tests every Monday - must be signed by parents/guardians
• Submit all quizzes/test papers 3 days before student's last day
• Fill out Student Report Cards and Narrative Reports

Reference: ICAN Company Policy 2023, Appendix C - Teacher's Handbook`,

  'cat_reports': `REPORTS & DOCUMENTATION (Teacher's Handbook)

Required Documentation:
• Instructor's Notebook - updated daily, synchronized with student notebook
• Weekly Tests - given every Monday, filed every Wednesday
• Daily Quizzes - required for vocabulary classes
• Student Reports - collated 3 working days before student's last day
• Student Report Card and Narrative Report

Failure to submit proper documentation = MINOR offense with reprimands/warnings

Reference: ICAN Company Policy 2023, Appendix C - Teacher's Handbook`,

  'cat_professional': `PROFESSIONAL STANDARDS (Code of Conduct & Teacher's Handbook)

Professional Conduct Requirements:
• Appropriate and decent attire at all times
• Proper personal hygiene and grooming
• Respectful communication - no foul language
• Maintain confidentiality of student/company information
• No personal business during work hours

Attire Guidelines (ask yourself):
1. Does my clothing show respect toward myself and others?
2. Will I be confident to face students and parents?
3. Is it proper to represent the academy in this attire?

Reference: ICAN Company Policy 2023, Section V & Teacher's Handbook`,

  'cat_safety': `SAFETY & WELFARE (Company Policy Section IX)

Prohibited Items:
• Weapons (balisong, knives, sharp objects) - GRAVE offense
• Alcoholic beverages - MAJOR to GRAVE offense
• Prohibited drugs - Immediate termination
• Cigarettes/vaporizers inside premises

Drug-Free Workplace Policy (RA 9165):
• Random, For-Cause, and Post-Accident testing
• Positive result = administrative action per Labor Code
• Any drug-related offense = subject to RA 9165

Emergency Procedures:
• BC team: Head Teacher and HR Head
• Follow NDRRMC and Red Cross guidelines
• Notify management of situation during calamities

Reference: ICAN Company Policy 2023, Section IX - Occupational Health & Safety`,

  'cat_communication': `COMMUNICATION (Company Policy Section X)

Open Door Policy:
• Transparent and flexible communication required
• Employees free to speak openly to Management
• Unauthorized closed-door meetings discouraged

Communication Channels:
• HR Head, Head Teacher, and Coordinators available for:
  - Counsel or feedback
  - Questions on policies
  - Complaints and concerns
  - Dispute resolution
  - Suggestions

• Employees should ask for appointment in advance for significant matters
• Communicate with immediate supervisor for issues

Reference: ICAN Company Policy 2023, Section X - Open Door Policy`
};

async function onCategorySelected(overrideCategoryId = null, selectedOffenseId = null) {
  const categoryId = overrideCategoryId || document.getElementById('coaching-category')?.value;
  const offenseSelect = document.getElementById('coaching-offense');
  const coachingTypeSelect = document.getElementById('coaching-type');
  const severityNotice = document.getElementById('offense-severity-notice');
  const customOffenseGroup = document.getElementById('custom-offense-group');
  const customSeverityGroup = document.getElementById('custom-severity-group');
  const policyReference = document.getElementById('policy-reference');

  // Reset offense (but not coaching type when editing)
  if (offenseSelect) offenseSelect.innerHTML = '<option value="">Select Offense</option>';
  // Only reset coaching type when not editing
  if (coachingTypeSelect && !selectedOffenseId) coachingTypeSelect.value = '';
  if (severityNotice) severityNotice.innerHTML = '';

  // Only clear policy reference if not editing (no selectedOffenseId provided)
  if (policyReference && !selectedOffenseId) {
    policyReference.value = '';
  }

  // Hide custom fields
  if (customOffenseGroup) customOffenseGroup.style.display = 'none';
  if (customSeverityGroup) customSeverityGroup.style.display = 'none';

  if (!categoryId) return;

  // Auto-populate policy reference based on category (only if not editing)
  if (policyReference && POLICY_REFERENCES[categoryId] && !selectedOffenseId) {
    policyReference.value = POLICY_REFERENCES[categoryId];
  }

  try {
    console.log('Loading offenses for category:', categoryId);
    const response = await fetch(`${API}/api/offenses?category_id=${categoryId}`, { credentials: 'include' });
    console.log('Response status:', response.status);
    if (response.ok) {
      const offenses = await response.json();
      console.log('Loaded offenses:', offenses.length, offenses.slice(0, 2));
      if (offenseSelect) {
        offenseSelect.innerHTML = '<option value="">Select Offense</option>' +
          offenses.map(o => {
            const severityBadge = o.severity === 'grave' ? '🔴' : o.severity === 'major' ? '🟠' : '🟡';
            return `<option value="${o.id}" data-severity="${o.severity}">${o.code} - ${o.name} ${severityBadge}</option>`;
          }).join('') +
          '<option value="other" data-severity="minor">📝 Other (specify custom offense)</option>';

        // If editing, set the selected offense
        if (selectedOffenseId) {
          offenseSelect.value = selectedOffenseId;
        }
      }
    }
  } catch (error) {
    console.error('Error loading offenses:', error);
  }

  // Also check coaching history (only when not in edit mode to avoid issues)
  if (!selectedOffenseId) {
    checkAndSuggestLevel();
  }
}

// When offense is selected, show severity and set appropriate warning levels
async function onOffenseSelected() {
  const offenseSelect = document.getElementById('coaching-offense');
  const coachingTypeSelect = document.getElementById('coaching-type');
  const severityNotice = document.getElementById('offense-severity-notice');
  const employeeId = document.getElementById('coaching-employee').value;
  const customOffenseGroup = document.getElementById('custom-offense-group');
  const customSeverityGroup = document.getElementById('custom-severity-group');
  const customOffenseText = document.getElementById('custom-offense-text');
  const customSeveritySelect = document.getElementById('custom-offense-severity');

  if (!offenseSelect || !offenseSelect.value) {
    if (severityNotice) severityNotice.innerHTML = '';
    if (customOffenseGroup) customOffenseGroup.style.display = 'none';
    if (customSeverityGroup) customSeverityGroup.style.display = 'none';
    return;
  }

  const isCustom = offenseSelect.value === 'other';

  // Show/hide custom offense fields
  if (customOffenseGroup) customOffenseGroup.style.display = isCustom ? 'block' : 'none';
  if (customSeverityGroup) customSeverityGroup.style.display = isCustom ? 'block' : 'none';
  if (customOffenseText) customOffenseText.required = isCustom;

  // Get severity - from selected option or custom severity selector
  let severity;
  if (isCustom) {
    severity = customSeveritySelect ? customSeveritySelect.value : 'minor';
    // Add event listener to custom severity dropdown (only once)
    if (customSeveritySelect && !customSeveritySelect.dataset.listenerAdded) {
      customSeveritySelect.addEventListener('change', onOffenseSelected);
      customSeveritySelect.dataset.listenerAdded = 'true';
    }
  } else {
    const selectedOption = offenseSelect.options[offenseSelect.selectedIndex];
    severity = selectedOption.dataset.severity;
  }

  // Progression rules from ICAN Policy
  const progressions = {
    minor: ['verbal_warning', 'written_warning', 'final_warning', 'suspension', 'termination'],
    major: ['written_warning', 'final_warning', 'suspension', 'termination'],
    grave: ['final_warning', 'suspension', 'termination']
  };

  const levelLabels = {
    'verbal_warning': 'Verbal Warning',
    'written_warning': 'Written Warning',
    'final_warning': 'Final Written Warning',
    'suspension': 'Suspension',
    'termination': 'Termination'
  };

  const severityLabels = {
    'minor': 'Minor Offense',
    'major': 'Major Offense',
    'grave': 'Grave Offense'
  };

  const severityColors = {
    'minor': '#fef3c7',
    'major': '#fed7aa',
    'grave': '#fecaca'
  };

  const progression = progressions[severity] || progressions.minor;

  // Update the warning level dropdown to only show valid options for this severity
  if (coachingTypeSelect) {
    coachingTypeSelect.innerHTML = '<option value="">Select Warning Level</option>' +
      progression.map(level => `<option value="${level}">${levelLabels[level]}</option>`).join('');

    // Default to first level
    coachingTypeSelect.value = progression[0];
  }

  // Show severity notice
  if (severityNotice) {
    const progressionText = progression.map(p => levelLabels[p]).join(' → ');
    severityNotice.innerHTML = `
      <div class="severity-notice" style="background: ${severityColors[severity]}; border-radius: 8px; padding: 12px; margin: 10px 0;">
        <strong>${severityLabels[severity]}</strong><br>
        <span style="font-size: 12px; color: #666;">Progression: ${progressionText}</span>
      </div>
    `;
  }

  // If we have an employee selected, check their history for this offense type
  if (employeeId) {
    await checkEmployeeOffenseHistory(employeeId, severity);
  }
}

// Check employee's history for specific offense severity
async function checkEmployeeOffenseHistory(employeeId, severity) {
  const categoryId = document.getElementById('coaching-category').value;
  const coachingTypeSelect = document.getElementById('coaching-type');

  if (!categoryId) return;

  try {
    const response = await fetch(`${API}/api/coaching/suggest-level?employee_id=${employeeId}&category_id=${categoryId}`, {
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();

      if (data.previousCount > 0 && coachingTypeSelect) {
        // Map old coaching types to new ones
        const typeMapping = {
          'verbal_1': 'verbal_warning',
          'verbal_2': 'written_warning',
          'written': 'written_warning',
          'final': 'final_warning',
          'performance_improvement': 'termination'
        };

        // Get the progression for this severity
        const progressions = {
          minor: ['verbal_warning', 'written_warning', 'final_warning', 'suspension', 'termination'],
          major: ['written_warning', 'final_warning', 'suspension', 'termination'],
          grave: ['final_warning', 'suspension', 'termination']
        };

        const progression = progressions[severity] || progressions.minor;
        const mappedLevel = typeMapping[data.suggestedLevel] || 'verbal_warning';

        // Find the next level in the severity progression
        const currentIndex = progression.indexOf(mappedLevel);
        if (currentIndex >= 0) {
          // If the employee already had this level, suggest the next
          const nextIndex = Math.min(currentIndex, progression.length - 1);
          coachingTypeSelect.value = progression[nextIndex];
        } else {
          // Suggest the appropriate starting level for this severity
          coachingTypeSelect.value = progression[0];
        }

        showToast(`Employee has ${data.previousCount} prior record(s) in this category`, 'info');
      }
    }
  } catch (error) {
    console.error('Error checking employee history:', error);
  }
}

// Load employee's coaching history when selected
async function onEmployeeSelected() {
  const employeeId = document.getElementById('coaching-employee').value;
  const historyNotice = document.getElementById('coaching-history-notice');
  const categorySelect = document.getElementById('coaching-category');
  const coachingTypeSelect = document.getElementById('coaching-type');

  // Reset fields
  if (categorySelect) categorySelect.value = '';
  if (coachingTypeSelect) coachingTypeSelect.value = '';

  if (!employeeId) {
    if (historyNotice) historyNotice.innerHTML = '';
    return;
  }

  try {
    // Fetch employee's full coaching history
    const response = await fetch(`${API}/api/employees/${employeeId}/coaching-summary`, {
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();

      if (historyNotice) {
        if (data.existingIssues && data.existingIssues.length > 0) {
          let html = `<div class="history-alert">
            <strong>${data.employeeName}'s Active/Recent Coaching Issues:</strong>
            <p style="margin: 8px 0 12px; font-size: 13px;">Select an existing issue to escalate, or choose "New Issue" to start fresh.</p>
            <div class="existing-issues">`;

          data.existingIssues.forEach(issue => {
            const levelLabels = {
              'verbal_1': '1st Verbal',
              'verbal_2': '2nd Verbal',
              'written': 'Written',
              'final': 'Final',
              'performance_improvement': 'PIP'
            };
            const nextLevelLabels = {
              'verbal_1': '1st Verbal Warning',
              'verbal_2': '2nd Verbal Warning',
              'written': 'Written Warning',
              'final': 'Final Written Warning',
              'performance_improvement': 'Performance Improvement Plan'
            };

            html += `
              <div class="existing-issue-card" onclick="selectExistingIssue('${issue.category_id}', '${issue.nextLevel}')">
                <div class="issue-category">${issue.category_name}</div>
                <div class="issue-current">Current: ${levelLabels[issue.currentLevel]} (${formatDate(issue.lastDate)})</div>
                <div class="issue-next">Next Step: <strong>${nextLevelLabels[issue.nextLevel]}</strong></div>
              </div>`;
          });

          html += `
              <div class="existing-issue-card new-issue" onclick="selectNewIssue()">
                <div class="issue-category">+ New Issue</div>
                <div class="issue-current">Start a new coaching for a different category</div>
              </div>
            </div>
          </div>`;

          historyNotice.innerHTML = html;
        } else {
          historyNotice.innerHTML = `<div class="history-alert history-clean">
            <strong>No prior coaching records for ${data.employeeName}.</strong><br>
            This will be their first coaching record. Select a category below.
          </div>`;
          // Default to verbal_1 for new employees
          if (coachingTypeSelect) coachingTypeSelect.value = 'verbal_1';
        }
      }
    }
  } catch (error) {
    console.error('Error loading employee coaching history:', error);
  }
}

// Select an existing issue to escalate
function selectExistingIssue(categoryId, nextLevel) {
  const categorySelect = document.getElementById('coaching-category');
  const coachingTypeSelect = document.getElementById('coaching-type');

  if (categorySelect) categorySelect.value = categoryId;
  if (coachingTypeSelect) coachingTypeSelect.value = nextLevel;

  // Highlight the selected card
  document.querySelectorAll('.existing-issue-card').forEach(card => card.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  // Show confirmation
  showToast('Category and warning level auto-selected', 'success');
}

// Select new issue option
function selectNewIssue() {
  const categorySelect = document.getElementById('coaching-category');
  const coachingTypeSelect = document.getElementById('coaching-type');

  if (categorySelect) categorySelect.value = '';
  if (coachingTypeSelect) coachingTypeSelect.value = 'verbal_1';

  // Highlight the selected card
  document.querySelectorAll('.existing-issue-card').forEach(card => card.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  showToast('Starting new issue - select a category', 'info');
}

// Auto-suggest coaching level based on employee history for category (backup for manual category selection)
async function checkAndSuggestLevel() {
  const employeeId = document.getElementById('coaching-employee').value;
  const categoryId = document.getElementById('coaching-category').value;
  const coachingTypeSelect = document.getElementById('coaching-type');

  if (!employeeId || !categoryId) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/coaching/suggest-level?employee_id=${employeeId}&category_id=${categoryId}`, {
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();

      // Auto-select the suggested level
      if (coachingTypeSelect) {
        coachingTypeSelect.value = data.suggestedLevel;
      }
    }
  } catch (error) {
    console.error('Error checking coaching history:', error);
  }
}

async function submitCoachingForm(e) {
  e.preventDefault();

  const editId = document.getElementById('coaching-edit-id').value;
  const isEditing = !!editId;

  // Get offense information
  const offenseId = document.getElementById('coaching-offense')?.value || null;
  const isCustomOffense = offenseId === 'other';
  const customOffenseText = isCustomOffense ? document.getElementById('custom-offense-text')?.value || null : null;
  const customSeverity = isCustomOffense ? document.getElementById('custom-offense-severity')?.value || 'minor' : null;

  // Get severity from selected offense or custom
  let offenseSeverity = 'minor';
  if (isCustomOffense) {
    offenseSeverity = customSeverity;
  } else if (offenseId) {
    const offenseSelect = document.getElementById('coaching-offense');
    const selectedOption = offenseSelect.options[offenseSelect.selectedIndex];
    offenseSeverity = selectedOption?.dataset?.severity || 'minor';
  }

  const data = {
    employee_id: document.getElementById('coaching-employee').value,
    supervisor_id: document.getElementById('coaching-supervisor').value,
    coaching_type: document.getElementById('coaching-type').value,
    category_id: document.getElementById('coaching-category').value || null,
    offense_id: offenseId,
    custom_offense_text: customOffenseText,
    offense_severity: offenseSeverity,
    coaching_date: document.getElementById('coaching-date').value,
    coaching_time: document.getElementById('coaching-time')?.value || null,
    location: document.getElementById('coaching-location')?.value || null,
    issue_description: document.getElementById('issue-description').value,
    prior_discussions: document.getElementById('prior-discussions').value || null,
    expected_improvement: document.getElementById('expected-improvement').value,
    improvement_timeline: document.getElementById('improvement-timeline').value,
    follow_up_date: document.getElementById('follow-up-date').value || null,
    support_offered: document.getElementById('support-offered').value || null,
    consequences: document.getElementById('consequences').value || null,
    // Due Process fields (Philippine Labor Law compliance)
    employee_explanation: document.getElementById('employee-explanation')?.value || null,
    employee_comments: document.getElementById('employee-comments').value || null,
    // Administrative Conference fields
    conference_held: document.getElementById('conference-held')?.checked ? 1 : 0,
    conference_date: document.getElementById('conference-date')?.value || null,
    conference_attendees: document.getElementById('conference-attendees')?.value || null,
    conference_summary: document.getElementById('conference-summary')?.value || null,
    // Witness fields
    witness_name: document.getElementById('witness-name').value || null,
    witness_position: document.getElementById('witness-position')?.value || null,
    employee_refused_to_sign: document.getElementById('employee-refused-sign')?.checked ? 1 : 0,
    policy_references: document.getElementById('policy-reference')?.value || null,
    status: 'open',
    // Signatures from form
    supervisor_signature: document.getElementById('form-supervisor-signature')?.value || null,
    employee_signature: document.getElementById('form-employee-signature')?.value || null,
    witness_signature: document.getElementById('form-witness-signature')?.value || null
  };

  // Validation
  if (!data.employee_id) {
    showToast('Please select an employee', 'error');
    return;
  }
  if (!data.supervisor_id) {
    showToast('Please select a supervisor', 'error');
    return;
  }
  if (isCustomOffense && !customOffenseText) {
    showToast('Please describe the custom offense', 'error');
    return;
  }

  try {
    const url = isEditing ? `${API}/api/coaching/${editId}` : `${API}/api/coaching`;
    const method = isEditing ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      showToast(isEditing ? 'Coaching record updated successfully!' : 'Coaching record created successfully!', 'success');
      resetCoachingForm();
      viewCoachingDetail(result.id || editId);
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error saving coaching record:', error);
    showToast('Error saving coaching record', 'error');
  }
}

// Edit existing coaching record (only if draft)
async function editCoachingRecord(id) {
  try {
    const response = await fetch(`${API}/api/coaching/${id}`, { credentials: 'include' });
    if (!response.ok) {
      showToast('Error loading coaching record', 'error');
      return;
    }

    const record = await response.json();

    // Only allow editing drafts
    if (record.status !== 'draft') {
      showToast('Only draft records can be edited', 'error');
      return;
    }

    // Set edit ID
    document.getElementById('coaching-edit-id').value = id;

    // Update form title and button
    document.getElementById('coaching-form-title').textContent = 'Edit Coaching Record (Draft)';
    document.getElementById('coaching-submit-btn').textContent = 'Update Coaching Record';
    document.getElementById('coaching-cancel-edit-btn').style.display = 'inline-block';

    // Load employees and supervisors first
    await Promise.all([
      loadEmployeesForSelect('coaching-employee'),
      loadSupervisors('coaching-supervisor'),
      loadCategories()
    ]);

    // Populate form fields
    const setFieldValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };

    setFieldValue('coaching-employee', record.employee_id);
    setFieldValue('coaching-supervisor', record.supervisor_id);
    setFieldValue('coaching-category', record.category_id);

    // Load offenses for the category and set the selected offense
    if (record.category_id) {
      await onCategorySelected(record.category_id, record.offense_id);
    }

    // Set coaching type AFTER onCategorySelected (which may reset it)
    setFieldValue('coaching-type', record.coaching_type);
    setFieldValue('coaching-severity', record.severity || 'moderate');
    setFieldValue('coaching-date', record.coaching_date);
    setFieldValue('coaching-time', record.coaching_time);
    setFieldValue('coaching-location', record.location);
    setFieldValue('issue-description', record.issue_description);
    setFieldValue('prior-discussions', record.prior_discussions);
    setFieldValue('expected-improvement', record.expected_improvement);
    setFieldValue('improvement-timeline', record.improvement_timeline);
    setFieldValue('follow-up-date', record.follow_up_date);
    setFieldValue('support-offered', record.support_offered);
    setFieldValue('consequences', record.consequences);
    setFieldValue('employee-comments', record.employee_comments);
    setFieldValue('witness-name', record.witness_name);
    setFieldValue('policy-reference', record.policy_references);
    setFieldValue('coaching-status', record.status || 'draft');

    // Load existing signatures if present
    resetFormSignatures(); // Clear first
    if (record.supervisor_signature) {
      setFormSignature('supervisor', record.supervisor_signature);
    }
    if (record.employee_signature) {
      setFormSignature('employee', record.employee_signature);
    }
    if (record.witness_signature) {
      setFormSignature('witness', record.witness_signature);
    }

    // Show the form page
    showPage('new-coaching');
  } catch (error) {
    console.error('Error loading coaching record for edit:', error);
    showToast('Error loading coaching record', 'error');
  }
}

// Cancel editing and reset form
function cancelCoachingEdit() {
  resetCoachingForm();
  showPage('coaching');
}

// Reset coaching form to create mode
function resetCoachingForm() {
  document.getElementById('coaching-form').reset();
  document.getElementById('coaching-edit-id').value = '';
  document.getElementById('coaching-form-title').textContent = 'New Coaching Record';
  document.getElementById('coaching-submit-btn').textContent = 'Create Coaching Record';
  document.getElementById('coaching-cancel-edit-btn').style.display = 'none';
  const historyNotice = document.getElementById('coaching-history-notice');
  if (historyNotice) historyNotice.innerHTML = '';
  const severityNotice = document.getElementById('offense-severity-notice');
  if (severityNotice) severityNotice.innerHTML = '';
  const policyRef = document.getElementById('policy-reference');
  if (policyRef) policyRef.value = '';
  // Reset offense dropdown
  const offenseSelect = document.getElementById('coaching-offense');
  if (offenseSelect) offenseSelect.innerHTML = '<option value="">Select Category First</option>';
  // Reset form signatures
  resetFormSignatures();
}

// ============ COACHING DETAIL ============
async function viewCoachingDetail(id) {
  currentCoachingId = id;

  try {
    const response = await fetch(`${API}/api/coaching/${id}`, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 401) {
        showLogin();
        return;
      }
      throw new Error('Failed to load coaching record');
    }

    const record = await response.json();

    const categoryName = record.category_name || (categories.find(c => c.id === record.category_id)?.name) || '-';

    const html = `
      <div class="detail-container">
        <div class="detail-header">
          <div>
            <h3>${coachingTypeLabels[record.coaching_type] || record.coaching_type}</h3>
            <p>${record.employee_name} - ${formatDate(record.coaching_date)}</p>
          </div>
          <div class="detail-badges">
            <span class="badge badge-${record.status}">${record.status}</span>
            ${record.severity ? `<span class="badge badge-severity-${record.severity}">${severityLabels[record.severity]}</span>` : ''}
            ${record.is_locked ? '<span class="badge badge-locked">Locked</span>' : ''}
          </div>
        </div>

        <div class="detail-body">
          <div class="detail-grid">
            <div class="detail-section">
              <h4>Employee</h4>
              <p><strong>${record.employee_name}</strong><br>
              ${record.employee_position || ''}<br>
              Hire Date: ${formatDate(record.employee_hire_date)}</p>
            </div>
            <div class="detail-section">
              <h4>Coach</h4>
              <p><strong>${record.supervisor_name}</strong><br>
              ${record.supervisor_position || ''}</p>
            </div>
            <div class="detail-section">
              <h4>Details</h4>
              <p>Category: ${categoryName}<br>
              ${record.location ? `Location: ${record.location}<br>` : ''}
              ${record.coaching_time ? `Time: ${record.coaching_time}<br>` : ''}
              </p>
            </div>
            <div class="detail-section">
              <h4>Timeline</h4>
              <p>Improvement Period: ${record.improvement_timeline}<br>
              Follow-up: ${record.follow_up_date ? formatDate(record.follow_up_date) : 'Not scheduled'}</p>
            </div>
          </div>

          <div class="detail-section">
            <h4>Issue / Behavior Being Addressed</h4>
            <p>${escapeHtml(record.issue_description)}</p>
          </div>

          ${record.prior_discussions ? `
          <div class="detail-section">
            <h4>Prior Discussions Referenced</h4>
            <p>${escapeHtml(record.prior_discussions)}</p>
          </div>
          ` : ''}

          <div class="detail-section">
            <h4>Expected Improvement</h4>
            <p>${escapeHtml(record.expected_improvement)}</p>
          </div>

          ${record.support_offered ? `
          <div class="detail-section">
            <h4>Support / Resources Offered</h4>
            <p>${escapeHtml(record.support_offered)}</p>
          </div>
          ` : ''}

          ${record.consequences ? `
          <div class="detail-section">
            <h4>Consequences if Not Improved</h4>
            <p>${escapeHtml(record.consequences)}</p>
          </div>
          ` : ''}

          ${record.policy_references ? `
          <div class="detail-section">
            <h4>Policy References</h4>
            <p>${escapeHtml(record.policy_references)}</p>
          </div>
          ` : ''}

          <div class="detail-section">
            <h4>Employee Comments / Response</h4>
            <p>${record.employee_comments ? escapeHtml(record.employee_comments) : '(No comments provided)'}</p>
          </div>

          <!-- Signatures Section -->
          <div class="signatures-section">
            <h3>Signatures & Acknowledgment</h3>
            <div class="signature-grid">
              <div class="signature-box ${record.supervisor_signature ? 'signed' : 'pending'}">
                <h4>Supervisor Signature</h4>
                ${record.supervisor_signature
                  ? `<img src="${record.supervisor_signature}" alt="Supervisor Signature" class="signature-image">
                     <p class="signature-date">Signed: ${formatDateTime(record.supervisor_signature_date)}</p>`
                  : `<p class="signature-pending">Pending</p>
                     ${canSign(record, 'supervisor') ? `<button class="btn btn-primary btn-sm" onclick="openSignatureModal('${record.id}', 'supervisor')">Sign</button>` : ''}`
                }
              </div>

              <div class="signature-box ${record.employee_signature ? 'signed' : record.employee_refused_to_sign ? 'refused' : 'pending'}">
                <h4>Employee Acknowledgment</h4>
                ${record.employee_signature
                  ? `<img src="${record.employee_signature}" alt="Employee Signature" class="signature-image">
                     <p class="signature-date">Signed: ${formatDateTime(record.employee_signature_date)}</p>`
                  : record.employee_refused_to_sign
                    ? `<p class="signature-refused">Employee Refused to Sign</p>`
                    : `<p class="signature-pending">Pending</p>
                       ${canSign(record, 'employee') ? `
                         <button class="btn btn-primary btn-sm" onclick="openSignatureModal('${record.id}', 'employee')">Sign</button>
                         <button class="btn btn-danger btn-sm" onclick="refuseToSign('${record.id}')">Refuse to Sign</button>
                       ` : ''}`
                }
              </div>

              ${record.witness_name ? `
              <div class="signature-box ${record.witness_signature ? 'signed' : 'pending'}">
                <h4>Witness: ${escapeHtml(record.witness_name)}</h4>
                ${record.witness_signature
                  ? `<img src="${record.witness_signature}" alt="Witness Signature" class="signature-image">
                     <p class="signature-date">Signed: ${formatDateTime(record.witness_signature_date)}</p>`
                  : `<p class="signature-pending">Pending</p>
                     ${canSign(record, 'witness') ? `<button class="btn btn-primary btn-sm" onclick="openSignatureModal('${record.id}', 'witness')">Sign</button>` : ''}`
                }
              </div>
              ` : ''}
            </div>
          </div>

          <!-- HR Review Section -->
          ${(currentUser.role === 'admin' || currentUser.role === 'hr') ? `
          <div class="hr-review-section">
            <h3>HR Review</h3>
            ${record.hr_reviewed_date
              ? `<div class="hr-reviewed">
                   <p><strong>Reviewed by:</strong> ${record.hr_reviewer_name || 'HR'}</p>
                   <p><strong>Date:</strong> ${formatDateTime(record.hr_reviewed_date)}</p>
                   ${record.hr_comments ? `<p><strong>Comments:</strong> ${escapeHtml(record.hr_comments)}</p>` : ''}
                 </div>`
              : `<div class="hr-pending">
                   <p>This record has not been reviewed by HR yet.</p>
                   <textarea id="hr-comments" placeholder="HR comments (optional)" rows="3"></textarea>
                   <button class="btn btn-primary" onclick="submitHRReview('${record.id}')">Mark as Reviewed</button>
                 </div>`
            }
          </div>
          ` : ''}

          <!-- Attachments Section -->
          <div class="attachments-section">
            <div class="section-header">
              <h3>Attachments</h3>
              ${!record.is_locked ? `<button class="btn btn-primary btn-sm" onclick="showAttachmentModal('${record.id}')">Add Attachment</button>` : ''}
            </div>
            <div class="attachments-list">
              ${record.attachments && record.attachments.length > 0
                ? record.attachments.map(att => `
                    <div class="attachment-item">
                      <span class="attachment-icon">📎</span>
                      <div class="attachment-info">
                        <a href="${API}/api/attachments/${att.id}/download" target="_blank">${escapeHtml(att.original_name)}</a>
                        <small>${formatFileSize(att.file_size)} - ${formatDate(att.uploaded_at)}</small>
                        ${att.description ? `<p class="attachment-desc">${escapeHtml(att.description)}</p>` : ''}
                      </div>
                      ${!record.is_locked ? `<button class="btn btn-danger btn-sm" onclick="deleteAttachment('${att.id}')">Delete</button>` : ''}
                    </div>
                  `).join('')
                : '<p class="no-attachments">No attachments</p>'
              }
            </div>
          </div>

          <!-- Progress Notes Section -->
          <div class="progress-notes">
            <div class="section-header">
              <h3>Progress Notes</h3>
              ${record.status === 'open' && !record.is_locked ? `<button class="btn btn-primary btn-sm" onclick="showProgressModal('${record.id}')">Add Progress Note</button>` : ''}
            </div>
            ${record.progress_notes && record.progress_notes.length > 0
              ? record.progress_notes.map(note => `
                  <div class="progress-note-item ${note.progress_status}">
                    <div class="progress-note-header">
                      <span class="date">${formatDate(note.note_date)}</span>
                      <span class="badge badge-progress-${note.progress_status}">${progressStatusLabels[note.progress_status]}</span>
                    </div>
                    <p>${escapeHtml(note.notes)}</p>
                    ${note.next_steps ? `<p><strong>Next Steps:</strong> ${escapeHtml(note.next_steps)}</p>` : ''}
                    <small>Recorded by: ${note.created_by_name}</small>
                  </div>
                `).join('')
              : '<p class="no-notes">No progress notes yet.</p>'
            }
          </div>
        </div>

        <div class="detail-actions">
          ${record.status === 'open' && !record.is_locked ? `
            <button class="btn btn-primary" onclick="editCoachingRecord('${record.id}')">Edit Record</button>
            <button class="btn btn-success" onclick="closeRecord('${record.id}')">Mark as Closed</button>
          ` : ''}
          ${record.status === 'closed' && !record.is_locked ? `
            <button class="btn btn-warning" onclick="reopenRecord('${record.id}')">Reopen Record</button>
          ` : ''}
          <button class="btn btn-secondary" onclick="downloadPDF('${record.id}')">Download PDF</button>
          <button class="btn btn-secondary" onclick="showPage('coaching')">Back to List</button>
        </div>
      </div>
    `;

    document.getElementById('coaching-detail-content').innerHTML = html;
    showPage('coaching-detail');
  } catch (error) {
    console.error('Error loading coaching detail:', error);
    showToast('Error loading coaching record', 'error');
  }
}

function canSign(record, type) {
  if (record.is_locked) return false;

  // Admins can sign anything for testing/demo
  if (currentUser.role === 'admin') return true;

  switch(type) {
    case 'supervisor':
      return currentUser.employee_id === record.supervisor_id;
    case 'employee':
      return currentUser.employee_id === record.employee_id;
    case 'witness':
      return currentUser.role === 'supervisor' || currentUser.role === 'hr';
    default:
      return false;
  }
}

// ============ FORM SIGNATURE FUNCTIONS ============
let formSignatureType = null;

function openFormSignature(type) {
  formSignatureType = type;
  const typeLabel = type === 'supervisor' ? 'Supervisor/Coach' : type === 'employee' ? 'Employee' : 'Witness';

  document.getElementById('signature-modal').classList.add('active');
  document.getElementById('signature-title').textContent = `${typeLabel} Signature`;

  // Set a flag to indicate this is for the form, not for saving to existing record
  window.isFormSignature = true;

  setTimeout(() => {
    initSignaturePad();
  }, 100);
}

function clearFormSignature(type) {
  document.getElementById(`form-${type}-signature`).value = '';
  document.getElementById(`form-${type}-signature-display`).innerHTML =
    `<p class="signature-pending">Click to sign${type === 'witness' ? ' (if applicable)' : ''}</p>`;
  document.getElementById(`form-${type}-signature-box`).classList.remove('signed');
  document.getElementById(`clear-${type}-sig`).style.display = 'none';
}

function setFormSignature(type, signatureData) {
  document.getElementById(`form-${type}-signature`).value = signatureData;
  document.getElementById(`form-${type}-signature-display`).innerHTML =
    `<img src="${signatureData}" alt="${type} Signature" class="signature-image" style="max-height: 80px;">`;
  document.getElementById(`form-${type}-signature-box`).classList.add('signed');
  document.getElementById(`clear-${type}-sig`).style.display = 'inline-block';
}

function resetFormSignatures() {
  ['supervisor', 'employee', 'witness'].forEach(type => {
    clearFormSignature(type);
  });
}

// ============ SIGNATURE MODAL ============
let signatureCanvasInitialized = false;

function openSignatureModal(coachingId, type) {
  currentCoachingId = coachingId;
  signatureType = type;

  const typeLabel = type === 'supervisor' ? 'Coach' : type === 'employee' ? 'Employee' : 'Witness';

  document.getElementById('signature-modal').classList.add('active');
  document.getElementById('signature-title').textContent = `${typeLabel} Signature`;

  // Initialize signature pad after modal is visible
  setTimeout(() => {
    initSignaturePad();
  }, 100);
}

function closeSignatureModal() {
  document.getElementById('signature-modal').classList.remove('active');
  if (signaturePad) {
    signaturePad.clear();
  }
}

function initSignaturePad() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) {
    console.error('Signature canvas not found');
    return;
  }

  // Get visible container size
  const container = canvas.parentElement;
  const containerWidth = container.clientWidth || 500;

  // Set canvas size
  canvas.width = Math.max(containerWidth - 40, 300);
  canvas.height = 200;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Drawing state
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  signaturePad = {
    clear: () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    isEmpty: () => {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] !== 255 || imageData.data[i+1] !== 255 || imageData.data[i+2] !== 255) {
          return false;
        }
      }
      return true;
    },
    toDataURL: () => canvas.toDataURL('image/png')
  };

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
  }

  function stopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
  }

  // Remove old event listeners by cloning the canvas
  const newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);

  // Re-get context for new canvas
  const newCtx = newCanvas.getContext('2d');
  newCtx.fillStyle = 'white';
  newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);

  // Update signaturePad to use new canvas
  signaturePad = {
    clear: () => {
      newCtx.fillStyle = 'white';
      newCtx.fillRect(0, 0, newCanvas.width, newCanvas.height);
    },
    isEmpty: () => {
      const imageData = newCtx.getImageData(0, 0, newCanvas.width, newCanvas.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i] !== 255 || imageData.data[i+1] !== 255 || imageData.data[i+2] !== 255) {
          return false;
        }
      }
      return true;
    },
    toDataURL: () => newCanvas.toDataURL('image/png')
  };

  // Add event listeners to new canvas
  function getNewPos(e) {
    const rect = newCanvas.getBoundingClientRect();
    const scaleX = newCanvas.width / rect.width;
    const scaleY = newCanvas.height / rect.height;

    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function newStartDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getNewPos(e);
    lastX = pos.x;
    lastY = pos.y;
  }

  function newDraw(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getNewPos(e);

    newCtx.beginPath();
    newCtx.moveTo(lastX, lastY);
    newCtx.lineTo(pos.x, pos.y);
    newCtx.strokeStyle = '#000';
    newCtx.lineWidth = 2;
    newCtx.lineCap = 'round';
    newCtx.lineJoin = 'round';
    newCtx.stroke();

    lastX = pos.x;
    lastY = pos.y;
  }

  function newStopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
  }

  // Mouse events
  newCanvas.addEventListener('mousedown', newStartDrawing);
  newCanvas.addEventListener('mousemove', newDraw);
  newCanvas.addEventListener('mouseup', newStopDrawing);
  newCanvas.addEventListener('mouseleave', newStopDrawing);

  // Touch events
  newCanvas.addEventListener('touchstart', newStartDrawing, { passive: false });
  newCanvas.addEventListener('touchmove', newDraw, { passive: false });
  newCanvas.addEventListener('touchend', newStopDrawing);
  newCanvas.addEventListener('touchcancel', newStopDrawing);
}

function clearSignature() {
  if (signaturePad) {
    signaturePad.clear();
  }
}

async function submitSignature() {
  if (!signaturePad || signaturePad.isEmpty()) {
    showToast('Please provide your signature', 'error');
    return;
  }

  const signatureData = signaturePad.toDataURL();

  // Check if this is a form signature (creating/editing) or detail page signature
  if (window.isFormSignature && formSignatureType) {
    // Form signature - store in hidden field
    setFormSignature(formSignatureType, signatureData);
    closeSignatureModal();
    window.isFormSignature = false;
    formSignatureType = null;
    showToast('Signature captured!', 'success');
    return;
  }

  // Detail page signature - save to API
  try {
    const response = await fetch(`${API}/api/coaching/${currentCoachingId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        signature_type: signatureType,
        signature_data: signatureData
      })
    });

    if (response.ok) {
      closeSignatureModal();
      viewCoachingDetail(currentCoachingId);
      showToast('Signature saved successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error saving signature:', error);
    showToast('Error saving signature', 'error');
  }
}

async function refuseToSign(coachingId) {
  if (!confirm('Are you sure the employee refuses to sign? This will be documented.')) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/coaching/${coachingId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        signature_type: 'employee',
        refused: true
      })
    });

    if (response.ok) {
      viewCoachingDetail(coachingId);
      showToast('Refusal documented', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error documenting refusal', 'error');
  }
}

// ============ HR REVIEW ============
async function submitHRReview(coachingId) {
  const comments = document.getElementById('hr-comments')?.value || '';

  try {
    const response = await fetch(`${API}/api/coaching/${coachingId}/hr-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ comments })
    });

    if (response.ok) {
      viewCoachingDetail(coachingId);
      showToast('HR review submitted', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error submitting HR review', 'error');
  }
}

// ============ LOCK RECORD ============
async function lockRecord(coachingId) {
  if (!confirm('Are you sure you want to lock this record? This cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/coaching/${coachingId}/lock`, {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      viewCoachingDetail(coachingId);
      showToast('Record locked successfully', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error locking record', 'error');
  }
}

async function closeRecord(coachingId) {
  if (!confirm('Are you sure you want to close this record?')) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/coaching/${coachingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'closed' })
    });

    if (response.ok) {
      viewCoachingDetail(coachingId);
      showToast('Record closed successfully', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error closing record', 'error');
  }
}

async function reopenRecord(coachingId) {
  if (!confirm('Are you sure you want to reopen this record?')) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/coaching/${coachingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'open' })
    });

    if (response.ok) {
      viewCoachingDetail(coachingId);
      showToast('Record reopened successfully', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error reopening record', 'error');
  }
}

// ============ ATTACHMENTS ============
function showAttachmentModal(coachingId) {
  currentCoachingId = coachingId;
  document.getElementById('attachment-modal').classList.add('active');
  document.getElementById('attachment-form').reset();
}

function closeAttachmentModal() {
  document.getElementById('attachment-modal').classList.remove('active');
}

async function submitAttachment(e) {
  e.preventDefault();

  const fileInput = document.getElementById('attachment-file');
  const description = document.getElementById('attachment-description').value;

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a file', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('description', description);

  try {
    const response = await fetch(`${API}/api/coaching/${currentCoachingId}/attachments`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (response.ok) {
      closeAttachmentModal();
      viewCoachingDetail(currentCoachingId);
      showToast('Attachment uploaded successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error uploading attachment:', error);
    showToast('Error uploading attachment', 'error');
  }
}

async function deleteAttachment(attachmentId) {
  if (!confirm('Are you sure you want to delete this attachment?')) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/attachments/${attachmentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (response.ok) {
      viewCoachingDetail(currentCoachingId);
      showToast('Attachment deleted', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error deleting attachment', 'error');
  }
}

// ============ PROGRESS NOTES ============
function showProgressModal(coachingId) {
  currentCoachingId = coachingId;
  document.getElementById('progress-modal').classList.add('active');
  document.getElementById('progress-form').reset();
  document.getElementById('progress-date').value = new Date().toISOString().split('T')[0];
}

function closeProgressModal() {
  document.getElementById('progress-modal').classList.remove('active');
}

async function submitProgressNote(e) {
  e.preventDefault();

  const data = {
    note_date: document.getElementById('progress-date').value,
    progress_status: document.getElementById('progress-status').value,
    notes: document.getElementById('progress-notes').value,
    next_steps: document.getElementById('progress-next-steps')?.value || null
  };

  try {
    const response = await fetch(`${API}/api/coaching/${currentCoachingId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeProgressModal();
      viewCoachingDetail(currentCoachingId);
      showToast('Progress note added successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error adding progress note:', error);
    showToast('Error adding progress note', 'error');
  }
}

// ============ EMPLOYEE TIMELINE ============
async function viewEmployeeTimeline(employeeId) {
  currentEmployeeId = employeeId;

  try {
    const [employeeRes, timelineRes] = await Promise.all([
      fetch(`${API}/api/employees/${employeeId}`, { credentials: 'include' }),
      fetch(`${API}/api/employees/${employeeId}/timeline`, { credentials: 'include' })
    ]);

    if (!employeeRes.ok || !timelineRes.ok) {
      throw new Error('Failed to load timeline');
    }

    const employee = await employeeRes.json();
    const timeline = await timelineRes.json();

    let html = `
      <div class="employee-info-card">
        <h3>${employee.first_name} ${employee.last_name}</h3>
        <p>${employee.position || ''}</p>
        <p>Employee #: ${employee.employee_number || '-'} | Hire Date: ${formatDate(employee.hire_date)} | Status: <span class="badge badge-${employee.status}">${employee.status}</span></p>
      </div>
    `;

    if (timeline.length > 0) {
      html += '<div class="timeline">';
      timeline.forEach(record => {
        html += `
          <div class="timeline-item ${record.coaching_type}">
            <div class="timeline-header">
              <div>
                <h4>${coachingTypeLabels[record.coaching_type] || record.coaching_type}</h4>
                <span class="badge badge-${record.status}">${record.status}</span>
                ${record.severity ? `<span class="badge badge-severity-${record.severity}">${severityLabels[record.severity]}</span>` : ''}
              </div>
              <span class="date">${formatDate(record.coaching_date)}</span>
            </div>
            <div class="timeline-body">
              <p><strong>Issue:</strong> ${truncateText(record.issue_description, 200)}</p>
              <p><strong>Supervisor:</strong> ${record.supervisor_name}</p>
              ${record.progress_notes && record.progress_notes.length > 0 ?
                `<p><strong>Latest Progress:</strong> ${progressStatusLabels[record.progress_notes[0].progress_status]} (${formatDate(record.progress_notes[0].note_date)})</p>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="viewCoachingDetail('${record.id}')" style="margin-top: 8px;">View Details</button>
            </div>
          </div>
        `;
      });
      html += '</div>';
    } else {
      html += '<div class="empty-state"><p>No coaching records for this employee.</p></div>';
    }

    document.getElementById('timeline-content').innerHTML = html;
    showPage('timeline');
  } catch (error) {
    console.error('Error loading timeline:', error);
    showToast('Error loading employee timeline', 'error');
  }
}

// ============ REPORTS ============
function setupReports() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  document.getElementById('report-date-from').value = thirtyDaysAgo.toISOString().split('T')[0];
  document.getElementById('report-date-to').value = today.toISOString().split('T')[0];
}

async function generateReport(reportType) {
  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo = document.getElementById('report-date-to').value;

  if (!dateFrom || !dateTo) {
    showToast('Please select date range', 'error');
    return;
  }

  try {
    const response = await fetch(`${API}/api/reports/${reportType}?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to generate report');
    }

    const data = await response.json();
    displayReport(reportType, data, dateFrom, dateTo);
  } catch (error) {
    console.error('Error generating report:', error);
    showToast('Error generating report', 'error');
  }
}

function displayReport(type, data, dateFrom, dateTo) {
  const container = document.getElementById('report-results');
  let html = `<h3>Report: ${formatDate(dateFrom)} - ${formatDate(dateTo)}</h3>`;

  switch(type) {
    case 'summary':
      html += `
        <div class="report-summary">
          <div class="report-stat"><h4>${data.total || 0}</h4><p>Total Records</p></div>
          <div class="report-stat"><h4>${data.open || 0}</h4><p>Open</p></div>
          <div class="report-stat"><h4>${data.closed || 0}</h4><p>Closed</p></div>
          <div class="report-stat"><h4>${data.pending_review || 0}</h4><p>Pending Review</p></div>
        </div>
        <h4>By Type</h4>
        <table class="report-table">
          <tr><th>Type</th><th>Count</th></tr>
          ${(data.by_type || []).map(r => `<tr><td>${coachingTypeLabels[r.coaching_type] || r.coaching_type}</td><td>${r.count}</td></tr>`).join('')}
        </table>
        <h4>By Category</h4>
        <table class="report-table">
          <tr><th>Category</th><th>Count</th></tr>
          ${(data.by_category || []).map(r => `<tr><td>${r.category_name || 'Uncategorized'}</td><td>${r.count}</td></tr>`).join('')}
        </table>
      `;
      break;

    case 'by-employee':
      html += `
        <table class="report-table">
          <tr><th>Employee</th><th>Position</th><th>Total</th><th>Open</th><th>Closed</th></tr>
          ${(data || []).map(r => `
            <tr>
              <td>${r.employee_name}</td>
              <td>${r.position || '-'}</td>
              <td>${r.total}</td>
              <td>${r.open}</td>
              <td>${r.closed}</td>
            </tr>
          `).join('')}
        </table>
      `;
      break;

    case 'by-supervisor':
      html += `
        <table class="report-table">
          <tr><th>Supervisor</th><th>Position</th><th>Total Records</th></tr>
          ${(data || []).map(r => `
            <tr>
              <td>${r.supervisor_name}</td>
              <td>${r.position || '-'}</td>
              <td>${r.total}</td>
            </tr>
          `).join('')}
        </table>
      `;
      break;

    case 'by-level':
      const levelLabels = {
        'verbal_1': '1st Verbal Warning',
        'verbal_2': '2nd Verbal Warning',
        'written': 'Written Warning',
        'final': 'Final Warning',
        'performance_improvement': 'PIP'
      };
      html += `
        <table class="report-table">
          <tr><th>Warning Level</th><th>Total Records</th></tr>
          ${(data || []).map(r => `
            <tr>
              <td>${levelLabels[r.level] || r.level}</td>
              <td>${r.count}</td>
            </tr>
          `).join('')}
        </table>
      `;
      break;
  }

  container.innerHTML = html;
}

async function exportCSV() {
  const dateFrom = document.getElementById('report-date-from').value;
  const dateTo = document.getElementById('report-date-to').value;

  window.open(`${API}/api/reports/export?dateFrom=${dateFrom}&dateTo=${dateTo}`, '_blank');
}

// ============ ANALYTICS ============
async function loadAnalytics() {
  const period = document.getElementById('analytics-period').value;

  try {
    const response = await fetch(`${API}/api/analytics?days=${period}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load analytics');
    }

    const data = await response.json();
    renderAnalytics(data);
  } catch (error) {
    console.error('Error loading analytics:', error);
    showToast('Error loading analytics', 'error');
  }
}

function renderAnalytics(data) {
  // Summary cards
  document.getElementById('analytics-total').textContent = data.total || 0;
  document.getElementById('analytics-open').textContent = data.open || 0;
  document.getElementById('analytics-resolved').textContent = data.resolved || 0;
  document.getElementById('analytics-avg-time').textContent =
    data.avgResolutionDays ? `${data.avgResolutionDays} days` : '-';

  // By Category chart
  renderBarChart('analytics-by-category', data.byCategory, 'category');

  // By Warning Level chart
  renderLevelChart('analytics-by-level', data.byLevel);

  // Monthly trend
  renderTrendChart('analytics-trend', data.monthlyTrend);

  // Top employees
  renderTopEmployees('analytics-top-employees', data.topEmployees);
}

function renderBarChart(containerId, data, labelField) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">No data available</p>';
    return;
  }

  const maxCount = Math.max(...data.map(d => d.count));

  let html = '';
  data.forEach(item => {
    const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
    const label = item[labelField] || 'Unknown';
    html += `
      <div class="analytics-bar">
        <div class="analytics-bar-label">${label}</div>
        <div class="analytics-bar-track">
          <div class="analytics-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="analytics-bar-value">${item.count}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderLevelChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">No data available</p>';
    return;
  }

  const levelLabels = {
    'verbal_1': '1st Verbal Warning',
    'verbal_2': '2nd Verbal Warning',
    'written': 'Written Warning',
    'final': 'Final Written Warning',
    'performance_improvement': 'Performance Improvement Plan'
  };

  const maxCount = Math.max(...data.map(d => d.count));

  let html = '';
  data.forEach(item => {
    const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
    const label = levelLabels[item.level] || item.level;
    html += `
      <div class="analytics-bar">
        <div class="analytics-bar-label">${label}</div>
        <div class="analytics-bar-track">
          <div class="analytics-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="analytics-bar-value">${item.count}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderTrendChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">No data available</p>';
    return;
  }

  const maxCount = Math.max(...data.map(d => d.count));

  let barsHtml = '';
  let labelsHtml = '';

  data.forEach(item => {
    const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
    const monthLabel = item.month.substring(5); // Get MM part
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const displayMonth = monthNames[parseInt(monthLabel)] || monthLabel;

    barsHtml += `
      <div class="analytics-trend-bar" style="height: ${Math.max(percentage, 5)}%" title="${item.month}: ${item.count}"></div>
    `;
    labelsHtml += `<div class="analytics-trend-label">${displayMonth}</div>`;
  });

  container.innerHTML = `
    <div class="analytics-trend-row">${barsHtml}</div>
    <div style="display: flex; justify-content: space-between;">${labelsHtml}</div>
  `;
}

function renderTopEmployees(containerId, data) {
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-muted">No data available</p>';
    return;
  }

  let html = '';
  data.forEach(item => {
    html += `
      <div class="analytics-list-item">
        <span class="analytics-list-name">${item.name}</span>
        <span class="analytics-list-count">${item.count}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ============ USER MANAGEMENT ============
async function loadUsers() {
  try {
    const response = await fetch(`${API}/api/users`, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 403) {
        showToast('Access denied', 'error');
        return;
      }
      throw new Error('Failed to load users');
    }

    const users = await response.json();

    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = users.length > 0
      ? users.map(u => `
          <tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.email}</td>
            <td><span class="badge badge-role-${u.role}">${roleLabels[u.role] || u.role}</span></td>
            <td>${u.employee_name || '-'}</td>
            <td><span class="badge badge-${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
            <td>${u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
            <td class="actions">
              <button class="btn btn-sm btn-secondary" onclick="editUser('${u.id}')">Edit</button>
              ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="toggleUserStatus('${u.id}', ${u.is_active ? 0 : 1})">${u.is_active ? 'Deactivate' : 'Activate'}</button>` : ''}
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state"><p>No users found</p></td></tr>';
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function showUserModal(userId = null) {
  document.getElementById('user-modal').classList.add('active');
  document.getElementById('user-modal-title').textContent = userId ? 'Edit User' : 'Add User';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = userId || '';
  document.getElementById('user-password').required = !userId;
  document.getElementById('password-help').style.display = userId ? 'block' : 'none';

  loadEmployeesForUserLink();

  if (userId) {
    loadUserForEdit(userId);
  }
}

async function loadEmployeesForUserLink() {
  try {
    const response = await fetch(`${API}/api/employees`, { credentials: 'include' });
    if (response.ok) {
      const employees = await response.json();
      const select = document.getElementById('user-employee');
      if (select) {
        select.innerHTML = '<option value="">No linked employee</option>' +
          employees.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name} - ${e.position}</option>`).join('');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

async function loadUserForEdit(id) {
  try {
    const response = await fetch(`${API}/api/users/${id}`, { credentials: 'include' });
    if (!response.ok) throw new Error('Failed to load user');

    const user = await response.json();

    document.getElementById('user-username').value = user.username;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-employee').value = user.employee_id || '';
  } catch (error) {
    console.error('Error:', error);
    showToast('Error loading user', 'error');
  }
}

function closeUserModal() {
  document.getElementById('user-modal').classList.remove('active');
}

async function submitUserForm(e) {
  e.preventDefault();

  const id = document.getElementById('user-id').value;
  const data = {
    username: document.getElementById('user-username').value,
    email: document.getElementById('user-email').value,
    role: document.getElementById('user-role').value,
    employee_id: document.getElementById('user-employee').value || null
  };

  const password = document.getElementById('user-password').value;
  if (password) {
    data.password = password;
  }

  try {
    const url = id ? `${API}/api/users/${id}` : `${API}/api/users`;
    const method = id ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      closeUserModal();
      loadUsers();
      showToast(id ? 'User updated successfully!' : 'User created successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error saving user', 'error');
  }
}

function editUser(id) {
  showUserModal(id);
}

async function toggleUserStatus(userId, newStatus) {
  const action = newStatus ? 'activate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${action} this user?`)) {
    return;
  }

  try {
    const response = await fetch(`${API}/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ is_active: newStatus })
    });

    if (response.ok) {
      loadUsers();
      showToast(`User ${action}d successfully`, 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error updating user', 'error');
  }
}

// ============ SETTINGS ============
async function loadSettings() {
  try {
    const response = await fetch(`${API}/api/settings`, { credentials: 'include' });

    if (!response.ok) {
      throw new Error('Failed to load settings');
    }

    const settings = await response.json();

    document.getElementById('company-name').value = settings.company_name || '';
    document.getElementById('company-address').value = settings.address || '';
    document.getElementById('company-phone').value = settings.phone || '';
    document.getElementById('company-email').value = settings.email || '';
    document.getElementById('disclaimer-text').value = settings.disclaimer_text || '';
    document.getElementById('default-followup-days').value = settings.default_followup_days || 30;

    document.getElementById('email-notifications').checked = settings.email_notifications_enabled === 1;
    document.getElementById('smtp-host').value = settings.smtp_host || '';
    document.getElementById('smtp-port').value = settings.smtp_port || 587;
    document.getElementById('smtp-user').value = settings.smtp_user || '';
    document.getElementById('smtp-from').value = settings.smtp_from_email || '';

    if (settings.logo_url) {
      document.getElementById('current-logo').innerHTML = `<img src="${settings.logo_url}" alt="Company Logo" style="max-height: 60px;">`;
    }

    // Also load Notion settings
    loadNotionSettings();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

async function saveCompanySettings(e) {
  e.preventDefault();

  const data = {
    company_name: document.getElementById('company-name').value,
    address: document.getElementById('company-address').value,
    phone: document.getElementById('company-phone').value,
    email: document.getElementById('company-email').value,
    disclaimer_text: document.getElementById('disclaimer-text').value,
    default_followup_days: parseInt(document.getElementById('default-followup-days').value) || 30
  };

  try {
    const response = await fetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      showToast('Settings saved successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error saving settings', 'error');
  }
}

async function uploadLogo() {
  const fileInput = document.getElementById('logo-upload');
  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a logo file', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('logo', fileInput.files[0]);

  try {
    const response = await fetch(`${API}/api/settings/logo`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (response.ok) {
      loadSettings();
      showToast('Logo uploaded successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error uploading logo', 'error');
  }
}

async function saveEmailSettings(e) {
  e.preventDefault();

  const data = {
    email_notifications_enabled: document.getElementById('email-notifications').checked ? 1 : 0,
    smtp_host: document.getElementById('smtp-host').value,
    smtp_port: parseInt(document.getElementById('smtp-port').value) || 587,
    smtp_user: document.getElementById('smtp-user').value,
    smtp_from_email: document.getElementById('smtp-from').value
  };

  const password = document.getElementById('smtp-password').value;
  if (password) {
    data.smtp_password = password;
  }

  try {
    const response = await fetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (response.ok) {
      showToast('Email settings saved successfully!', 'success');
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error saving email settings', 'error');
  }
}

async function testEmailConnection() {
  try {
    const response = await fetch(`${API}/api/settings/test-email`, {
      method: 'POST',
      credentials: 'include'
    });

    const result = await response.json();

    if (response.ok) {
      showToast('Email connection successful!', 'success');
    } else {
      showToast('Email test failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error testing email connection', 'error');
  }
}

// ============ NOTION INTEGRATION ============

async function loadNotionSettings() {
  try {
    const response = await fetch(`${API}/api/settings/notion`, { credentials: 'include' });
    if (response.ok) {
      const settings = await response.json();
      const apiKeyInput = document.getElementById('setting-notion-api-key');
      const dbIdInput = document.getElementById('setting-notion-database-id');

      if (apiKeyInput && settings.notion_api_key) {
        apiKeyInput.placeholder = 'API key configured (enter new to change)';
      }
      if (dbIdInput && settings.notion_database_id) {
        dbIdInput.value = settings.notion_database_id;
      }
    }
  } catch (error) {
    console.error('Error loading Notion settings:', error);
  }
}

async function saveNotionSettings() {
  const apiKey = document.getElementById('setting-notion-api-key').value;
  const databaseId = document.getElementById('setting-notion-database-id').value;

  if (!apiKey && !databaseId) {
    showToast('Please enter at least one Notion setting', 'error');
    return;
  }

  try {
    const response = await fetch(`${API}/api/settings/notion`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        notion_api_key: apiKey || undefined,
        notion_database_id: databaseId || undefined
      })
    });

    if (response.ok) {
      showToast('Notion settings saved successfully!', 'success');
      document.getElementById('setting-notion-api-key').value = '';
      document.getElementById('setting-notion-api-key').placeholder = 'API key configured (enter new to change)';
    } else {
      const error = await response.json();
      showToast('Error: ' + error.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error saving Notion settings', 'error');
  }
}

async function testNotionConnection() {
  const apiKey = document.getElementById('setting-notion-api-key').value;
  const databaseId = document.getElementById('setting-notion-database-id').value;

  showToast('Testing Notion connection...', 'info');

  try {
    const response = await fetch(`${API}/api/employees/sync-notion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        api_key: apiKey || undefined,
        database_id: databaseId || undefined
      })
    });

    const result = await response.json();

    if (response.ok) {
      showToast(`Connection successful! Found ${result.stats.total} records in Notion.`, 'success');
    } else {
      showToast('Connection failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error testing Notion connection', 'error');
  }
}

async function syncFromNotion() {
  if (!confirm('This will sync employees from your Notion database. New employees will be created, existing ones will be updated. Continue?')) {
    return;
  }

  showToast('Syncing from Notion...', 'info');

  try {
    const response = await fetch(`${API}/api/employees/sync-notion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });

    const result = await response.json();

    if (response.ok) {
      showToast(`Sync completed! Created: ${result.stats.created}, Updated: ${result.stats.updated}, Skipped: ${result.stats.skipped}`, 'success');
      loadEmployees();
    } else {
      showToast('Sync failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Error syncing from Notion', 'error');
  }
}

// ============ NOTIFICATIONS ============
let notificationInterval = null;

function startNotificationPolling() {
  loadNotifications();
  notificationInterval = setInterval(loadNotifications, 60000); // Every minute
}

async function loadNotifications() {
  try {
    const response = await fetch(`${API}/api/notifications?unread=true`, { credentials: 'include' });

    if (!response.ok) return;

    const notifications = await response.json();

    const badge = document.getElementById('notification-count');
    const dropdown = document.getElementById('notification-dropdown');

    if (notifications.length > 0) {
      badge.textContent = notifications.length;
      badge.style.display = 'flex';

      dropdown.innerHTML = notifications.slice(0, 10).map(n => `
        <div class="notification-item ${n.is_read ? 'read' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.link || ''}')">
          <div class="notification-title">${escapeHtml(n.title)}</div>
          <div class="notification-message">${escapeHtml(n.message)}</div>
          <div class="notification-time">${formatDateTime(n.created_at)}</div>
        </div>
      `).join('') + `
        <div class="notification-footer">
          <a href="#" onclick="markAllNotificationsRead(); return false;">Mark all as read</a>
        </div>
      `;
    } else {
      badge.style.display = 'none';
      dropdown.innerHTML = '<div class="notification-empty">No new notifications</div>';
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

function toggleNotifications() {
  const dropdown = document.getElementById('notification-dropdown');
  dropdown.classList.toggle('show');
}

async function handleNotificationClick(notificationId, link) {
  try {
    await fetch(`${API}/api/notifications/${notificationId}/read`, {
      method: 'POST',
      credentials: 'include'
    });

    if (link) {
      // Parse the link and navigate
      if (link.startsWith('/coaching/')) {
        const id = link.replace('/coaching/', '');
        viewCoachingDetail(id);
      }
    }

    loadNotifications();
  } catch (error) {
    console.error('Error:', error);
  }

  toggleNotifications();
}

async function markAllNotificationsRead() {
  try {
    await fetch(`${API}/api/notifications/read-all`, {
      method: 'POST',
      credentials: 'include'
    });

    loadNotifications();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Close notifications when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notification-dropdown');
  const bell = document.querySelector('.notification-bell');

  if (dropdown && bell && !dropdown.contains(e.target) && !bell.contains(e.target)) {
    dropdown.classList.remove('show');
  }
});

// ============ PDF DOWNLOAD ============
function downloadPDF(id) {
  window.open(`${API}/api/coaching/${id}/pdf`, '_blank');
}

// ============ UTILITY FUNCTIONS ============
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.style.cssText = `
    background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Add toast animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);
