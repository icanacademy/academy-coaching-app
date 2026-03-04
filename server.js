const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const nodemailer = require('nodemailer');
const db = require('./database');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 2006;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Middleware
app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'academy-coaching-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static('public'));

// ============ AUTH MIDDLEWARE ============

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Helper: Check if user can view employee's coaching records
function canViewEmployee(user, employeeId) {
  if (['admin', 'hr'].includes(user.role)) return true;
  if (user.role === 'supervisor') {
    // Check if employee is under this supervisor
    const emp = db.prepare('SELECT supervisor_id FROM employees WHERE id = ?').get(employeeId);
    return emp && emp.supervisor_id === user.employee_id;
  }
  // Employee can only view their own
  return user.employee_id === employeeId;
}

// ============ AUTH ROUTES ============

// Simple password for quick access
const SIMPLE_PASSWORD = '14421442';

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    // Check for simple password login (password-only)
    if (password === SIMPLE_PASSWORD && (!username || username === '')) {
      // Login as admin with simple password
      const adminUser = db.prepare(`
        SELECT u.*, e.first_name, e.last_name
        FROM users u
        LEFT JOIN employees e ON u.employee_id = e.id
        WHERE u.role = 'admin' AND u.is_active = 1
        LIMIT 1
      `).get();

      if (adminUser) {
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(adminUser.id);
        req.session.user = {
          id: adminUser.id,
          username: adminUser.username,
          email: adminUser.email,
          role: adminUser.role,
          employee_id: adminUser.employee_id,
          name: adminUser.first_name ? `${adminUser.first_name} ${adminUser.last_name}` : adminUser.username
        };
        logAudit(req, 'users', adminUser.id, 'LOGIN', null, { method: 'simple_password' });
        return res.json({ success: true, user: req.session.user });
      }
    }

    // Standard username/password login
    const user = db.prepare(`
      SELECT u.*, e.first_name, e.last_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      WHERE u.username = ? AND u.is_active = 1
    `).get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      name: user.first_name ? `${user.first_name} ${user.last_name}` : user.username
    };

    logAudit(req, 'users', user.id, 'LOGIN', null, { username });

    res.json({
      success: true,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.session.user) {
    logAudit(req, 'users', req.session.user.id, 'LOGOUT', null, null);
  }
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

app.put('/api/auth/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.user.id);

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newHash, req.session.user.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ USER MANAGEMENT ROUTES ============

app.get('/api/users', requireRole('admin'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.role, u.employee_id, u.is_active, u.last_login, u.created_at,
             e.first_name || ' ' || e.last_name as employee_name
      FROM users u
      LEFT JOIN employees e ON u.employee_id = e.id
      ORDER BY u.username
    `).all();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', requireRole('admin'), (req, res) => {
  try {
    const { username, password, email, role, employee_id } = req.body;

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, email, role, employee_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username, passwordHash, email, role, employee_id || null);

    logAudit(req, 'users', id, 'CREATE', null, { username, email, role });

    res.status(201).json({ id, username, email, role });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', requireRole('admin'), (req, res) => {
  try {
    const { username, email, role, employee_id, is_active } = req.body;

    const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

    db.prepare(`
      UPDATE users SET username = ?, email = ?, role = ?, employee_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(username, email, role, employee_id || null, is_active ? 1 : 0, req.params.id);

    logAudit(req, 'users', req.params.id, 'UPDATE', oldUser, req.body);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:id/reset-password', requireRole('admin'), (req, res) => {
  try {
    const { newPassword } = req.body;
    const passwordHash = bcrypt.hashSync(newPassword, 10);

    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(passwordHash, req.params.id);

    logAudit(req, 'users', req.params.id, 'PASSWORD_RESET', null, null);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COMPANY SETTINGS ROUTES ============

app.get('/api/settings', (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    // Don't expose SMTP password
    if (settings) {
      settings.smtp_password = settings.smtp_password ? '********' : null;
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', requireRole('admin'), (req, res) => {
  try {
    const {
      company_name, logo_url, address, phone, email, disclaimer_text,
      default_followup_days, email_notifications_enabled,
      smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email
    } = req.body;

    const oldSettings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();

    // Only update SMTP password if it's not the masked value
    const actualSmtpPassword = smtp_password === '********' ? oldSettings.smtp_password : smtp_password;

    db.prepare(`
      UPDATE company_settings SET
        company_name = ?, logo_url = ?, address = ?, phone = ?, email = ?,
        disclaimer_text = ?, default_followup_days = ?, email_notifications_enabled = ?,
        smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_password = ?, smtp_from_email = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      company_name, logo_url, address, phone, email, disclaimer_text,
      default_followup_days, email_notifications_enabled ? 1 : 0,
      smtp_host, smtp_port, smtp_user, actualSmtpPassword, smtp_from_email
    );

    logAudit(req, 'company_settings', '1', 'UPDATE', oldSettings, req.body);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload company logo
app.post('/api/settings/logo', requireRole('admin'), upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const logoUrl = `/uploads/${req.file.filename}`;
    db.prepare('UPDATE company_settings SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(logoUrl);

    res.json({ logo_url: logoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COACHING CATEGORIES ============

app.get('/api/categories', requireAuth, (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM coaching_categories WHERE is_active = 1 ORDER BY name').all();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', requireRole('admin'), (req, res) => {
  try {
    const { name, description } = req.body;
    const id = `cat_${uuidv4().substring(0, 8)}`;

    db.prepare('INSERT INTO coaching_categories (id, name, description) VALUES (?, ?, ?)')
      .run(id, name, description);

    res.status(201).json({ id, name, description });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ OFFENSE TYPES (ICAN Policy) ============

// Get all offense types
app.get('/api/offenses', requireAuth, (req, res) => {
  try {
    const { category_id } = req.query;
    let query = `
      SELECT o.*, c.name as category_name
      FROM offense_types o
      LEFT JOIN coaching_categories c ON o.category_id = c.id
      WHERE o.is_active = 1
    `;
    const params = [];

    if (category_id) {
      query += ' AND o.category_id = ?';
      params.push(category_id);
    }

    query += ' ORDER BY o.category_id, o.code';
    const offenses = db.prepare(query).all(...params);
    res.json(offenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get offense by ID
app.get('/api/offenses/:id', requireAuth, (req, res) => {
  try {
    const offense = db.prepare(`
      SELECT o.*, c.name as category_name
      FROM offense_types o
      LEFT JOIN coaching_categories c ON o.category_id = c.id
      WHERE o.id = ?
    `).get(req.params.id);

    if (!offense) {
      return res.status(404).json({ error: 'Offense not found' });
    }
    res.json(offense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get warning level progression based on offense severity
app.get('/api/offense-progression', requireAuth, (req, res) => {
  try {
    const { severity, current_level } = req.query;

    // ICAN Policy progression rules:
    // Minor: Verbal → Written → Final Written → Suspension → Termination
    // Major: Written → Final Written → Suspension → Termination
    // Grave: Final Written → Suspension → Termination

    const progressions = {
      minor: ['verbal_warning', 'written_warning', 'final_warning', 'suspension', 'termination'],
      major: ['written_warning', 'final_warning', 'suspension', 'termination'],
      grave: ['final_warning', 'suspension', 'termination']
    };

    const currentProgression = progressions[severity] || progressions.minor;
    let nextLevel = currentProgression[0]; // Default to first level

    if (current_level) {
      const currentIndex = currentProgression.indexOf(current_level);
      if (currentIndex >= 0 && currentIndex < currentProgression.length - 1) {
        nextLevel = currentProgression[currentIndex + 1];
      } else if (currentIndex === currentProgression.length - 1) {
        nextLevel = current_level; // Already at max
      }
    }

    res.json({
      severity,
      progression: currentProgression,
      suggestedLevel: nextLevel,
      currentLevel: current_level || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ EMPLOYEE ROUTES ============

app.get('/api/employees', requireAuth, (req, res) => {
  try {
    const { search, status } = req.query;
    let query = `
      SELECT e.*,
             s.first_name || ' ' || s.last_name as supervisor_name,
             (SELECT COUNT(*) FROM coaching_records WHERE employee_id = e.id) as coaching_count
      FROM employees e
      LEFT JOIN employees s ON e.supervisor_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.employee_number LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    // Role-based filtering
    if (req.session.user.role === 'supervisor') {
      query += ' AND (e.supervisor_id = ? OR e.id = ?)';
      params.push(req.session.user.employee_id, req.session.user.employee_id);
    } else if (req.session.user.role === 'employee') {
      query += ' AND e.id = ?';
      params.push(req.session.user.employee_id);
    }

    query += ' ORDER BY e.first_name COLLATE NOCASE, e.last_name COLLATE NOCASE';

    const employees = db.prepare(query).all(...params);
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ NOTION SYNC ROUTES ============

// Sync employees from Notion
app.post('/api/employees/sync-notion', requireRole('admin', 'hr'), async (req, res) => {
  try {
    // Get Notion credentials from settings or request body
    const settings = db.prepare('SELECT notion_api_key, notion_database_id FROM company_settings WHERE id = 1').get() || {};
    const body = req.body || {};

    const apiKey = body.api_key || settings.notion_api_key;
    const databaseId = body.database_id || settings.notion_database_id;

    if (!apiKey || !databaseId) {
      return res.status(400).json({ error: 'Notion API key and database ID are required. Configure in Settings or provide in request.' });
    }

    // Fetch all pages from Notion database
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          page_size: 100,
          start_cursor: startCursor
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json({ error: `Notion API error: ${error.message || 'Unknown error'}` });
      }

      const data = await response.json();
      allResults = allResults.concat(data.results);
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    // Helper function to extract text from Notion property
    const getText = (prop) => {
      if (!prop) return null;
      if (prop.type === 'title' && prop.title) {
        return prop.title.map(t => t.plain_text).join('') || null;
      }
      if (prop.type === 'rich_text' && prop.rich_text) {
        return prop.rich_text.map(t => t.plain_text).join('') || null;
      }
      if (prop.type === 'email') return prop.email || null;
      if (prop.type === 'phone_number') return prop.phone_number || null;
      if (prop.type === 'select' && prop.select) return prop.select.name || null;
      if (prop.type === 'multi_select' && prop.multi_select) {
        return prop.multi_select.map(s => s.name).join(', ') || null;
      }
      if (prop.type === 'unique_id' && prop.unique_id) {
        return `${prop.unique_id.prefix || ''}${prop.unique_id.number}`;
      }
      return null;
    };

    // Map Notion status to app status
    const mapStatus = (notionStatus) => {
      if (!notionStatus) return 'active';
      const status = notionStatus.toLowerCase();
      if (status === 'active') return 'active';
      if (status === 'inactive' || status === 'break') return 'inactive';
      return 'active';
    };

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const page of allResults) {
      const props = page.properties;

      // Extract data from Notion
      const firstName = getText(props['First Name']) || getText(props['Nickname']) || 'Unknown';
      const lastName = getText(props['Last Name']) || '';
      const email = getText(props['Email']);
      const phone = getText(props['Contact Number']);
      const position = getText(props['Designation']) || getText(props['Position']) || 'Teacher';
      const department = getText(props['Major']) || 'Teaching';
      const status = mapStatus(getText(props['Status']));
      const employeeNumber = getText(props['Teacher ID']);
      const notionId = page.id;

      // Skip if no meaningful name
      if (!firstName && !lastName) {
        skipped++;
        continue;
      }

      // Check if employee already exists (by notion_id or email)
      let existing = db.prepare('SELECT id FROM employees WHERE notion_id = ?').get(notionId);
      if (!existing && email) {
        existing = db.prepare('SELECT id FROM employees WHERE email = ?').get(email);
      }

      if (existing) {
        // Update existing employee
        db.prepare(`
          UPDATE employees SET
            first_name = ?, last_name = ?, email = ?, phone = ?,
            position = ?, department = ?, status = ?, employee_number = ?,
            notion_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(firstName, lastName, email, phone, position, department, status, employeeNumber, notionId, existing.id);
        updated++;
      } else {
        // Create new employee
        const id = uuidv4();
        const today = new Date().toISOString().split('T')[0];

        db.prepare(`
          INSERT INTO employees (id, employee_number, first_name, last_name, email, phone, position, department, hire_date, status, notion_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, employeeNumber, firstName, lastName, email, phone, position, department, today, status, notionId);
        created++;
      }
    }

    // Log the sync action
    db.prepare(`
      INSERT INTO audit_log (id, user_id, table_name, record_id, action, new_values, performed_at)
      VALUES (?, ?, 'employees', 'notion_sync', 'sync', ?, CURRENT_TIMESTAMP)
    `).run(uuidv4(), req.session.user.id, JSON.stringify({ created, updated, skipped, total: allResults.length }));

    res.json({
      success: true,
      message: `Notion sync completed`,
      stats: {
        total: allResults.length,
        created,
        updated,
        skipped
      }
    });
  } catch (error) {
    console.error('Notion sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save Notion settings
app.put('/api/settings/notion', requireRole('admin'), (req, res) => {
  try {
    const { notion_api_key, notion_database_id } = req.body;

    db.prepare(`
      UPDATE company_settings SET
        notion_api_key = COALESCE(?, notion_api_key),
        notion_database_id = COALESCE(?, notion_database_id),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(notion_api_key, notion_database_id);

    res.json({ success: true, message: 'Notion settings saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Notion settings
app.get('/api/settings/notion', requireRole('admin'), (req, res) => {
  try {
    const settings = db.prepare('SELECT notion_api_key, notion_database_id FROM company_settings WHERE id = 1').get();
    res.json({
      notion_api_key: settings.notion_api_key ? '***configured***' : null,
      notion_database_id: settings.notion_database_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees/:id', requireAuth, (req, res) => {
  try {
    const employee = db.prepare(`
      SELECT e.*,
             s.first_name || ' ' || s.last_name as supervisor_name
      FROM employees e
      LEFT JOIN employees s ON e.supervisor_id = s.id
      WHERE e.id = ?
    `).get(req.params.id);

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check permissions
    if (!canViewEmployee(req.session.user, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/employees', requireRole('admin', 'hr'), (req, res) => {
  try {
    const id = uuidv4();
    const {
      employee_number, first_name, last_name, email, phone, position, department,
      hire_date, role_start_date, supervisor_id, status, emergency_contact_name,
      emergency_contact_phone, union_member, notes
    } = req.body;

    db.prepare(`
      INSERT INTO employees (
        id, employee_number, first_name, last_name, email, phone, position, department,
        hire_date, role_start_date, supervisor_id, status, emergency_contact_name,
        emergency_contact_phone, union_member, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, employee_number, first_name, last_name, email, phone, position, department,
      hire_date, role_start_date, supervisor_id || null, status || 'active',
      emergency_contact_name, emergency_contact_phone, union_member ? 1 : 0, notes
    );

    logAudit(req, 'employees', id, 'CREATE', null, req.body);

    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/employees/:id', requireRole('admin', 'hr'), (req, res) => {
  try {
    const oldEmployee = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);

    const {
      employee_number, first_name, last_name, email, phone, position, department,
      hire_date, role_start_date, supervisor_id, status, emergency_contact_name,
      emergency_contact_phone, union_member, notes
    } = req.body;

    db.prepare(`
      UPDATE employees SET
        employee_number = ?, first_name = ?, last_name = ?, email = ?, phone = ?,
        position = ?, department = ?, hire_date = ?, role_start_date = ?,
        supervisor_id = ?, status = ?, emergency_contact_name = ?,
        emergency_contact_phone = ?, union_member = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      employee_number, first_name, last_name, email, phone, position, department,
      hire_date, role_start_date, supervisor_id || null, status,
      emergency_contact_name, emergency_contact_phone, union_member ? 1 : 0, notes,
      req.params.id
    );

    logAudit(req, 'employees', req.params.id, 'UPDATE', oldEmployee, req.body);

    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/supervisors', requireAuth, (req, res) => {
  try {
    const supervisors = db.prepare(`
      SELECT id, first_name, last_name, position, department, is_admin
      FROM employees
      WHERE status = 'active'
      ORDER BY is_admin DESC, first_name COLLATE NOCASE, last_name COLLATE NOCASE
    `).all();
    res.json(supervisors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ COACHING RECORD ROUTES ============

app.get('/api/coaching', requireAuth, (req, res) => {
  try {
    const { employee_id, status, type, category, severity, search, date_from, date_to } = req.query;

    let query = `
      SELECT c.*,
             e.first_name || ' ' || e.last_name as employee_name,
             e.position as employee_position,
             e.employee_number,
             s.first_name || ' ' || s.last_name as supervisor_name,
             cat.name as category_name
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      JOIN employees s ON c.supervisor_id = s.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based filtering
    if (req.session.user.role === 'supervisor') {
      query += ' AND (c.supervisor_id = ? OR e.supervisor_id = ?)';
      params.push(req.session.user.employee_id, req.session.user.employee_id);
    } else if (req.session.user.role === 'employee') {
      query += ' AND c.employee_id = ?';
      params.push(req.session.user.employee_id);
    }

    if (employee_id) {
      query += ' AND c.employee_id = ?';
      params.push(employee_id);
    }

    if (status) {
      query += ' AND c.status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND c.coaching_type = ?';
      params.push(type);
    }

    if (category) {
      query += ' AND c.category_id = ?';
      params.push(category);
    }

    if (severity) {
      query += ' AND c.severity = ?';
      params.push(severity);
    }

    if (search) {
      query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR c.issue_description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (date_from) {
      query += ' AND c.coaching_date >= ?';
      params.push(date_from);
    }

    if (date_to) {
      query += ' AND c.coaching_date <= ?';
      params.push(date_to);
    }

    query += ' ORDER BY c.coaching_date DESC';

    const records = db.prepare(query).all(...params);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/coaching/:id', requireAuth, (req, res) => {
  try {
    const record = db.prepare(`
      SELECT c.*,
             e.first_name || ' ' || e.last_name as employee_name,
             e.position as employee_position,
             e.department as employee_department,
             e.hire_date as employee_hire_date,
             e.employee_number,
             e.union_member as employee_union_member,
             s.first_name || ' ' || s.last_name as supervisor_name,
             s.position as supervisor_position,
             cat.name as category_name,
             hr.first_name || ' ' || hr.last_name as hr_reviewer_name
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      JOIN employees s ON c.supervisor_id = s.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      LEFT JOIN employees hr ON c.hr_reviewer_id = hr.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Coaching record not found' });
    }

    // Check permissions
    if (!canViewEmployee(req.session.user, record.employee_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get progress notes
    record.progress_notes = db.prepare(`
      SELECT pn.*,
             e.first_name || ' ' || e.last_name as created_by_name
      FROM progress_notes pn
      JOIN employees e ON pn.created_by = e.id
      WHERE pn.coaching_record_id = ?
      ORDER BY pn.note_date DESC
    `).all(req.params.id);

    // Get attachments
    record.attachments = db.prepare(`
      SELECT a.*, u.username as uploaded_by_name
      FROM attachments a
      JOIN users u ON a.uploaded_by = u.id
      WHERE a.coaching_record_id = ?
      ORDER BY a.uploaded_at DESC
    `).all(req.params.id);

    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/coaching', requireRole('admin', 'hr', 'supervisor'), (req, res) => {
  try {
    const id = uuidv4();
    const {
      employee_id, supervisor_id, coaching_type, category_id, offense_id, custom_offense_text, offense_severity,
      coaching_date, coaching_time, location, issue_description, prior_discussions,
      expected_improvement, improvement_timeline, follow_up_date, support_offered,
      consequences, employee_comments, witness_name, policy_references, status,
      supervisor_signature, employee_signature, witness_signature
    } = req.body;

    // Supervisors can only create records for their team
    if (req.session.user.role === 'supervisor') {
      const emp = db.prepare('SELECT supervisor_id FROM employees WHERE id = ?').get(employee_id);
      if (!emp || emp.supervisor_id !== req.session.user.employee_id) {
        return res.status(403).json({ error: 'You can only create coaching records for your team members' });
      }
    }

    db.prepare(`
      INSERT INTO coaching_records (
        id, employee_id, supervisor_id, coaching_type, category_id, offense_id, custom_offense_text, offense_severity,
        coaching_date, coaching_time, location, issue_description, prior_discussions,
        expected_improvement, improvement_timeline, follow_up_date, support_offered,
        consequences, employee_comments, witness_name, policy_references, status,
        supervisor_signature, supervisor_signature_date,
        employee_signature, employee_signature_date,
        witness_signature, witness_signature_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, employee_id, supervisor_id, coaching_type, category_id || null,
      offense_id === 'other' ? null : offense_id || null,
      custom_offense_text || null,
      offense_severity || 'minor',
      coaching_date, coaching_time, location, issue_description, prior_discussions,
      expected_improvement, improvement_timeline, follow_up_date, support_offered,
      consequences, employee_comments, witness_name, policy_references, status || 'draft',
      supervisor_signature || null, supervisor_signature ? new Date().toISOString() : null,
      employee_signature || null, employee_signature ? new Date().toISOString() : null,
      witness_signature || null, witness_signature ? new Date().toISOString() : null
    );

    logAudit(req, 'coaching_records', id, 'CREATE', null, req.body);

    // Create notification for HR if it's a written warning or higher
    if (['written', 'final'].includes(coaching_type)) {
      createNotificationForRole('hr', 'New Coaching Record', `A ${coaching_type} warning has been issued and requires review.`, `/coaching/${id}`);
    }

    res.status(201).json({ id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/coaching/:id', requireRole('admin', 'hr', 'supervisor'), (req, res) => {
  try {
    const oldRecord = db.prepare('SELECT * FROM coaching_records WHERE id = ?').get(req.params.id);

    if (!oldRecord) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Check if record is locked
    if (oldRecord.is_locked) {
      return res.status(403).json({ error: 'This record is locked and cannot be modified' });
    }

    // Allow status changes (open <-> closed) for any non-locked record
    const isStatusChangeOnly = Object.keys(req.body).length === 1 && req.body.status;
    if (!isStatusChangeOnly && oldRecord.status === 'closed') {
      return res.status(403).json({ error: 'Closed records cannot be edited. Reopen the record first.' });
    }

    const {
      coaching_type, category_id, offense_id, custom_offense_text, offense_severity,
      coaching_date, coaching_time, location,
      issue_description, prior_discussions, expected_improvement, improvement_timeline,
      follow_up_date, support_offered, consequences, employee_comments, witness_name,
      policy_references, status
    } = req.body;

    db.prepare(`
      UPDATE coaching_records SET
        coaching_type = ?, category_id = ?, offense_id = ?, custom_offense_text = ?, offense_severity = ?,
        coaching_date = ?, coaching_time = ?, location = ?, issue_description = ?, prior_discussions = ?,
        expected_improvement = ?, improvement_timeline = ?, follow_up_date = ?,
        support_offered = ?, consequences = ?, employee_comments = ?, witness_name = ?,
        policy_references = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      coaching_type, category_id,
      offense_id === 'other' ? null : offense_id || null,
      custom_offense_text || null,
      offense_severity || 'minor',
      coaching_date, coaching_time, location,
      issue_description, prior_discussions, expected_improvement, improvement_timeline,
      follow_up_date, support_offered, consequences, employee_comments, witness_name,
      policy_references, status, req.params.id
    );

    logAudit(req, 'coaching_records', req.params.id, 'UPDATE', oldRecord, req.body);

    res.json({ id: req.params.id, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Digital signature endpoint
app.post('/api/coaching/:id/sign', requireAuth, (req, res) => {
  try {
    const { signature_type, signature_data } = req.body; // signature_data is base64 image
    const record = db.prepare('SELECT * FROM coaching_records WHERE id = ?').get(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    if (record.is_locked) {
      return res.status(403).json({ error: 'Record is locked' });
    }

    // Check if signature data is provided
    if (!signature_data) {
      return res.status(400).json({ error: 'Signature data is required' });
    }

    let updateField, dateField;
    if (signature_type === 'employee') {
      updateField = 'employee_signature';
      dateField = 'employee_signature_date';
      // Employee can only sign their own records (unless admin)
      if (req.session.user.role !== 'admin' && req.session.user.employee_id !== record.employee_id) {
        return res.status(403).json({ error: 'You can only sign your own coaching records' });
      }
    } else if (signature_type === 'supervisor') {
      updateField = 'supervisor_signature';
      dateField = 'supervisor_signature_date';
      // Supervisor can only sign their own records (unless admin)
      if (req.session.user.role !== 'admin' && req.session.user.employee_id !== record.supervisor_id) {
        return res.status(403).json({ error: 'You can only sign records you supervised' });
      }
    } else if (signature_type === 'witness') {
      updateField = 'witness_signature';
      dateField = 'witness_signature_date';
    } else {
      return res.status(400).json({ error: 'Invalid signature type' });
    }

    db.prepare(`
      UPDATE coaching_records SET
        ${updateField} = ?,
        ${dateField} = CURRENT_TIMESTAMP,
        employee_acknowledged = CASE WHEN ? = 'employee' THEN 1 ELSE employee_acknowledged END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(signature_data, signature_type, req.params.id);

    logAudit(req, 'coaching_records', req.params.id, 'SIGN', { type: signature_type }, { signed: true });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Employee refused to sign
app.post('/api/coaching/:id/refuse-sign', requireAuth, (req, res) => {
  try {
    const record = db.prepare('SELECT * FROM coaching_records WHERE id = ?').get(req.params.id);

    if (req.session.user.employee_id !== record.employee_id) {
      return res.status(403).json({ error: 'You can only refuse your own coaching records' });
    }

    db.prepare(`
      UPDATE coaching_records SET
        employee_refused_to_sign = 1,
        employee_signature_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    logAudit(req, 'coaching_records', req.params.id, 'REFUSE_SIGN', null, null);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HR Review
app.post('/api/coaching/:id/hr-review', requireRole('admin', 'hr'), (req, res) => {
  try {
    const { comments, approved } = req.body;

    db.prepare(`
      UPDATE coaching_records SET
        hr_reviewer_id = ?,
        hr_reviewed_date = CURRENT_TIMESTAMP,
        hr_comments = ?,
        status = CASE WHEN ? THEN 'open' ELSE 'rejected' END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.session.user.employee_id, comments, approved ? 1 : 0, req.params.id);

    logAudit(req, 'coaching_records', req.params.id, 'HR_REVIEW', null, { approved, comments });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lock coaching record
app.post('/api/coaching/:id/lock', requireRole('admin', 'hr'), (req, res) => {
  try {
    db.prepare(`
      UPDATE coaching_records SET
        is_locked = 1,
        locked_at = CURRENT_TIMESTAMP,
        locked_by = ?,
        status = 'closed'
      WHERE id = ?
    `).run(req.session.user.id, req.params.id);

    logAudit(req, 'coaching_records', req.params.id, 'LOCK', null, null);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add progress note
app.post('/api/coaching/:id/progress', requireRole('admin', 'hr', 'supervisor'), (req, res) => {
  try {
    const noteId = uuidv4();
    const { note_date, progress_status, notes, next_steps, created_by } = req.body;

    const record = db.prepare('SELECT * FROM coaching_records WHERE id = ?').get(req.params.id);
    if (record.is_locked) {
      return res.status(403).json({ error: 'Cannot add notes to locked records' });
    }

    db.prepare(`
      INSERT INTO progress_notes (id, coaching_record_id, note_date, progress_status, notes, next_steps, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, req.params.id, note_date, progress_status, notes, next_steps, created_by);

    // Update coaching record status if resolved
    if (progress_status === 'resolved') {
      db.prepare(`UPDATE coaching_records SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(req.params.id);
    }

    logAudit(req, 'progress_notes', noteId, 'CREATE', null, req.body);

    res.status(201).json({ id: noteId, ...req.body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ATTACHMENT ROUTES ============

app.post('/api/coaching/:id/attachments', requireRole('admin', 'hr', 'supervisor'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const id = uuidv4();
    const { description } = req.body;

    db.prepare(`
      INSERT INTO attachments (id, coaching_record_id, filename, original_name, mime_type, file_size, description, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.params.id, req.file.filename, req.file.originalname,
      req.file.mimetype, req.file.size, description || null, req.session.user.id
    );

    res.status(201).json({
      id,
      filename: req.file.filename,
      original_name: req.file.originalname,
      url: `/uploads/${req.file.filename}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/attachments/:id', requireRole('admin', 'hr'), (req, res) => {
  try {
    const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete file from disk
    const fs = require('fs');
    const filePath = path.join(__dirname, 'uploads', attachment.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ NOTIFICATION ROUTES ============

app.get('/api/notifications', requireAuth, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.session.user.id);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(req.session.user.id);
    res.json({ count: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.session.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notifications/read-all', requireAuth, (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?')
      .run(req.session.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ DASHBOARD / REPORTS ============

app.get('/api/dashboard', requireAuth, (req, res) => {
  try {
    let employeeFilter = '';
    const params = [];

    if (req.session.user.role === 'supervisor') {
      employeeFilter = 'AND (c.supervisor_id = ? OR e.supervisor_id = ?)';
      params.push(req.session.user.employee_id, req.session.user.employee_id);
    } else if (req.session.user.role === 'employee') {
      employeeFilter = 'AND c.employee_id = ?';
      params.push(req.session.user.employee_id);
    }

    const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'active'").get();

    const openCoachings = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status IN ('open', 'draft') ${employeeFilter}
    `).get(...params);

    const upcomingFollowUps = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'open' AND c.follow_up_date <= date('now', '+7 days') AND c.follow_up_date >= date('now')
      ${employeeFilter}
    `).get(...params);

    const overdueFollowUps = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'open' AND c.follow_up_date < date('now')
      ${employeeFilter}
    `).get(...params);

    const pendingSignatures = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'open' AND c.employee_acknowledged = 0 AND c.employee_refused_to_sign = 0
      ${employeeFilter}
    `).get(...params);

    const coachingByType = db.prepare(`
      SELECT c.coaching_type, COUNT(*) as count
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE 1=1 ${employeeFilter}
      GROUP BY c.coaching_type
    `).all(...params);

    const coachingByCategory = db.prepare(`
      SELECT cat.name as category, COUNT(*) as count
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      WHERE c.category_id IS NOT NULL ${employeeFilter}
      GROUP BY c.category_id
    `).all(...params);

    const recentCoachings = db.prepare(`
      SELECT c.id, c.coaching_type, c.coaching_date, c.status, c.severity,
             e.first_name || ' ' || e.last_name as employee_name,
             cat.name as category_name
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      WHERE 1=1 ${employeeFilter}
      ORDER BY c.created_at DESC
      LIMIT 10
    `).all(...params);

    const followUpsDue = db.prepare(`
      SELECT c.id, c.coaching_type, c.follow_up_date, c.status,
             e.first_name || ' ' || e.last_name as employee_name,
             CASE WHEN c.follow_up_date < date('now') THEN 1 ELSE 0 END as is_overdue
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'open' AND c.follow_up_date IS NOT NULL ${employeeFilter}
      ORDER BY c.follow_up_date ASC
      LIMIT 10
    `).all(...params);

    // Pending HR reviews (for admin/hr only)
    let pendingHrReviews = 0;
    if (['admin', 'hr'].includes(req.session.user.role)) {
      pendingHrReviews = db.prepare(`
        SELECT COUNT(*) as count FROM coaching_records
        WHERE status = 'pending_review' AND hr_reviewed_date IS NULL
      `).get().count;
    }

    // Coachings this month
    const coachingsThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE strftime('%Y-%m', c.coaching_date) = strftime('%Y-%m', 'now') ${employeeFilter}
    `).get(...params);

    // Closed coachings
    const closedCoachings = db.prepare(`
      SELECT COUNT(*) as count FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      WHERE c.status = 'closed' ${employeeFilter}
    `).get(...params);

    res.json({
      totalEmployees: totalEmployees.count,
      openCoachings: openCoachings.count,
      upcomingFollowUps: upcomingFollowUps.count,
      overdueFollowUps: overdueFollowUps.count,
      pendingSignatures: pendingSignatures.count,
      pendingHRReview: pendingHrReviews,
      coachingsThisMonth: coachingsThisMonth.count,
      closedCoachings: closedCoachings.count,
      coachingByType,
      coachingByCategory,
      recentCoachings,
      followUpsDue
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees/:id/timeline', requireAuth, (req, res) => {
  try {
    if (!canViewEmployee(req.session.user, req.params.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const records = db.prepare(`
      SELECT c.*,
             s.first_name || ' ' || s.last_name as supervisor_name,
             cat.name as category_name
      FROM coaching_records c
      JOIN employees s ON c.supervisor_id = s.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      WHERE c.employee_id = ?
      ORDER BY c.coaching_date DESC
    `).all(req.params.id);

    for (const record of records) {
      record.progress_notes = db.prepare(`
        SELECT * FROM progress_notes
        WHERE coaching_record_id = ?
        ORDER BY note_date DESC
      `).all(record.id);
    }

    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reports
app.get('/api/reports/coaching-summary', requireRole('admin', 'hr'), (req, res) => {
  try {
    const { date_from, date_to } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (date_from) {
      whereClause += ' AND c.coaching_date >= ?';
      params.push(date_from);
    }
    if (date_to) {
      whereClause += ' AND c.coaching_date <= ?';
      params.push(date_to);
    }

    // By warning level
    const byLevel = db.prepare(`
      SELECT c.coaching_type as level, COUNT(*) as count
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      ${whereClause}
      GROUP BY c.coaching_type
      ORDER BY
        CASE c.coaching_type
          WHEN 'verbal_1' THEN 1
          WHEN 'verbal_2' THEN 2
          WHEN 'written' THEN 3
          WHEN 'final' THEN 4
          WHEN 'performance_improvement' THEN 5
          ELSE 6
        END
    `).all(...params);

    const byMonth = db.prepare(`
      SELECT strftime('%Y-%m', c.coaching_date) as month, COUNT(*) as count
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      ${whereClause}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 12
    `).all(...params);

    const byCategory = db.prepare(`
      SELECT cat.name as category, COUNT(*) as count
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      ${whereClause} AND c.category_id IS NOT NULL
      GROUP BY c.category_id
      ORDER BY count DESC
    `).all(...params);

    res.json({ byLevel, byMonth, byCategory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export coaching records
app.get('/api/reports/export', requireRole('admin', 'hr'), (req, res) => {
  try {
    const records = db.prepare(`
      SELECT
        c.coaching_date,
        e.employee_number,
        e.first_name || ' ' || e.last_name as employee_name,
        e.position,
        c.coaching_type as warning_level,
        cat.name as category,
        c.severity,
        c.issue_description,
        c.expected_improvement,
        c.improvement_timeline,
        c.follow_up_date,
        s.first_name || ' ' || s.last_name as supervisor_name,
        c.status,
        CASE WHEN c.employee_acknowledged THEN 'Yes' WHEN c.employee_refused_to_sign THEN 'Refused' ELSE 'Pending' END as acknowledged
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      JOIN employees s ON c.supervisor_id = s.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      ORDER BY c.coaching_date DESC
    `).all();

    // Convert to CSV
    if (records.length === 0) {
      return res.status(404).json({ error: 'No records to export' });
    }

    const headers = Object.keys(records[0]);
    let csv = headers.join(',') + '\n';

    for (const record of records) {
      const row = headers.map(h => {
        const value = record[h] || '';
        // Escape quotes and wrap in quotes if contains comma
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=coaching-records-export.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PDF GENERATION ============

app.get('/api/coaching/:id/pdf', requireAuth, async (req, res) => {
  try {
    const record = db.prepare(`
      SELECT c.*,
             e.first_name || ' ' || e.last_name as employee_name,
             e.position as employee_position,
             e.department as employee_department,
             e.hire_date as employee_hire_date,
             e.employee_number,
             s.first_name || ' ' || s.last_name as supervisor_name,
             s.position as supervisor_position,
             cat.name as category_name
      FROM coaching_records c
      JOIN employees e ON c.employee_id = e.id
      JOIN employees s ON c.supervisor_id = s.id
      LEFT JOIN coaching_categories cat ON c.category_id = cat.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!record) {
      return res.status(404).json({ error: 'Coaching record not found' });
    }

    // Check permissions
    if (!canViewEmployee(req.session.user, record.employee_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    const html = generateCoachingFormHTML(record, settings);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      printBackground: true
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=coaching-form-${record.id}.pdf`);
    res.send(pdf);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ AUDIT LOG ============

app.get('/api/audit-log', requireRole('admin'), (req, res) => {
  try {
    const { table_name, record_id, limit = 100 } = req.query;

    let query = `
      SELECT a.*, u.username
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (table_name) {
      query += ' AND a.table_name = ?';
      params.push(table_name);
    }

    if (record_id) {
      query += ' AND a.record_id = ?';
      params.push(record_id);
    }

    query += ' ORDER BY a.performed_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const logs = db.prepare(query).all(...params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ HELPER FUNCTIONS ============

function logAudit(req, tableName, recordId, action, oldValues, newValues) {
  const id = uuidv4();
  const userId = req.session?.user?.id || null;
  const ipAddress = req.ip || req.connection?.remoteAddress;
  const userAgent = req.get('User-Agent');

  db.prepare(`
    INSERT INTO audit_log (id, user_id, table_name, record_id, action, old_values, new_values, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, tableName, recordId, action, JSON.stringify(oldValues), JSON.stringify(newValues), ipAddress, userAgent);
}

function createNotificationForRole(role, title, message, link) {
  const users = db.prepare('SELECT id FROM users WHERE role = ? AND is_active = 1').all(role);
  const id = uuidv4();

  for (const user of users) {
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, link)
      VALUES (?, ?, 'system', ?, ?, ?)
    `).run(`${id}-${user.id}`, user.id, title, message, link);
  }
}

function generateCoachingFormHTML(record, settings) {
  const coachingTypeLabels = {
    'verbal_1': '1st Verbal Warning',
    'verbal_2': '2nd Verbal Warning',
    'written': 'Written Warning',
    'final': 'Final Written Warning',
    'performance_improvement': 'Performance Improvement Plan'
  };

  const severityLabels = {
    'minor': 'Minor',
    'moderate': 'Moderate',
    'major': 'Major',
    'severe': 'Severe'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.25; color: #333; }
    .container { max-width: 8in; margin: 0 auto; padding: 8px 12px; }
    .header { text-align: center; margin-bottom: 8px; border-bottom: 2px solid #333; padding-bottom: 6px; }
    .company-name { font-size: 12pt; font-weight: bold; margin-bottom: 2px; }
    .header h1 { font-size: 11pt; margin-bottom: 2px; }
    .header h2 { font-size: 9pt; font-weight: normal; color: #666; }
    .form-section { margin-bottom: 6px; }
    .form-section h3 { background: #f0f0f0; padding: 3px 6px; margin-bottom: 4px; font-size: 9pt; border-left: 3px solid #333; }
    .form-row { display: flex; margin-bottom: 3px; }
    .form-label { font-weight: bold; width: 110px; flex-shrink: 0; font-size: 8pt; }
    .form-value { flex: 1; border-bottom: 1px solid #ccc; padding-bottom: 1px; min-height: 12px; font-size: 8pt; }
    .form-textarea { border: 1px solid #ccc; padding: 3px 5px; min-height: 30px; margin-top: 2px; white-space: pre-wrap; font-size: 8pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .checkbox-row { display: flex; align-items: center; margin: 4px 0; font-size: 8pt; }
    .checkbox { width: 10px; height: 10px; border: 1px solid #333; margin-right: 5px; display: flex; align-items: center; justify-content: center; font-size: 8pt; }
    .checkbox.checked::after { content: "X"; font-weight: bold; }
    .signature-section { margin-top: 8px; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; }
    .signature-block { }
    .signature-line { border-bottom: 1px solid #333; height: 35px; margin-bottom: 2px; position: relative; }
    .signature-line img { max-height: 32px; max-width: 100%; position: absolute; bottom: 1px; }
    .signature-label { font-size: 7pt; color: #666; }
    .disclaimer { margin-top: 6px; padding: 5px; background: #f9f9f9; border: 1px solid #ddd; font-size: 7pt; line-height: 1.2; }
    .footer { margin-top: 6px; text-align: center; font-size: 7pt; color: #666; border-top: 1px solid #ccc; padding-top: 4px; }
    .warning-type { display: inline-block; padding: 2px 8px; background: #333; color: white; font-weight: bold; margin: 4px 0; font-size: 8pt; }
    .severity { display: inline-block; padding: 1px 6px; margin-left: 8px; font-size: 7pt; border-radius: 2px; }
    .severity.minor { background: #d4edda; color: #155724; }
    .severity.moderate { background: #fff3cd; color: #856404; }
    .severity.major { background: #f8d7da; color: #721c24; }
    .severity.severe { background: #721c24; color: white; }
    .category-badge { display: inline-block; padding: 1px 6px; background: #e9ecef; border-radius: 2px; font-size: 7pt; margin-left: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-name">${settings?.company_name || 'ICAN Academy'}</div>
      <h1>EMPLOYEE COACHING FORM</h1>
      <h2>Confidential Personnel Document</h2>
      <div class="warning-type">${coachingTypeLabels[record.coaching_type] || record.coaching_type}</div>
      ${record.severity ? `<span class="severity ${record.severity}">${severityLabels[record.severity] || record.severity}</span>` : ''}
      ${record.category_name ? `<span class="category-badge">${record.category_name}</span>` : ''}
    </div>

    <div class="form-section">
      <h3>Employee Information</h3>
      <div class="info-grid">
        <div>
          <div class="form-row">
            <span class="form-label">Employee Name:</span>
            <span class="form-value">${record.employee_name}</span>
          </div>
          <div class="form-row">
            <span class="form-label">Employee ID:</span>
            <span class="form-value">${record.employee_number || 'N/A'}</span>
          </div>
          <div class="form-row">
            <span class="form-label">Position:</span>
            <span class="form-value">${record.employee_position || ''}</span>
          </div>
        </div>
        <div>
          <div class="form-row">
            <span class="form-label">Hire Date:</span>
            <span class="form-value">${record.employee_hire_date || ''}</span>
          </div>
          <div class="form-row">
            <span class="form-label">Coach:</span>
            <span class="form-value">${record.supervisor_name}</span>
          </div>
        </div>
      </div>
      <div class="form-row" style="margin-top: 8px;">
        <span class="form-label">Coaching Date:</span>
        <span class="form-value">${record.coaching_date}${record.coaching_time ? ' at ' + record.coaching_time : ''}${record.location ? ' - ' + record.location : ''}</span>
      </div>
    </div>

    <div class="form-section">
      <h3>Issue / Behavior Being Addressed</h3>
      <div class="form-textarea">${record.issue_description}</div>
    </div>

    ${record.prior_discussions ? `
    <div class="form-section">
      <h3>Prior Discussions Referenced</h3>
      <div class="form-textarea">${record.prior_discussions}</div>
    </div>
    ` : ''}

    <div class="form-section">
      <h3>Expected Improvement & Timeline</h3>
      <div class="form-textarea">${record.expected_improvement}</div>
      <div class="info-grid" style="margin-top: 4px;">
        <div class="form-row">
          <span class="form-label">Timeline:</span>
          <span class="form-value">${record.improvement_timeline}</span>
        </div>
        <div class="form-row">
          <span class="form-label">Follow-up:</span>
          <span class="form-value">${record.follow_up_date || 'TBD'}</span>
        </div>
      </div>
    </div>

    ${record.support_offered ? `
    <div class="form-section">
      <h3>Support / Resources Offered</h3>
      <div class="form-textarea">${record.support_offered}</div>
    </div>
    ` : ''}

    ${record.consequences ? `
    <div class="form-section">
      <h3>Consequences if Not Improved</h3>
      <div class="form-textarea">${record.consequences}</div>
    </div>
    ` : ''}

    ${record.policy_references ? `
    <div class="form-section">
      <h3>Policy References</h3>
      <div class="form-textarea">${record.policy_references}</div>
    </div>
    ` : ''}

    <div class="form-section">
      <h3>Employee Comments / Response</h3>
      <div class="form-textarea">${record.employee_comments || '(No comments provided)'}</div>
    </div>

    <div class="disclaimer">
      <strong>ACKNOWLEDGMENT:</strong> ${settings?.disclaimer_text || 'By signing below, I acknowledge that I have received and reviewed this coaching document. My signature does not necessarily indicate agreement with its contents, only that I have been informed of the concerns described above and understand the expectations for improvement. I understand that this document will be placed in my personnel file. I have been given the opportunity to provide comments.'}
    </div>

    <div class="signature-section">
      <div style="display: flex; gap: 15px; margin-bottom: 4px;">
        <div class="checkbox-row" style="margin: 0;">
          <div class="checkbox ${record.employee_acknowledged ? 'checked' : ''}"></div>
          <span>Employee acknowledges receipt</span>
        </div>
        <div class="checkbox-row" style="margin: 0;">
          <div class="checkbox ${record.employee_refused_to_sign ? 'checked' : ''}"></div>
          <span>Employee refused to sign</span>
        </div>
      </div>

      <div class="signature-grid" style="grid-template-columns: ${record.witness_name ? '1fr 1fr 1fr' : '1fr 1fr'};">
        <div class="signature-block">
          <div class="signature-line">
            ${record.employee_signature ? `<img src="${record.employee_signature}" alt="Employee Signature">` : ''}
          </div>
          <div class="signature-label">Employee Signature - ${record.employee_signature_date || '________'}</div>
        </div>
        <div class="signature-block">
          <div class="signature-line">
            ${record.supervisor_signature ? `<img src="${record.supervisor_signature}" alt="Supervisor Signature">` : ''}
          </div>
          <div class="signature-label">Supervisor Signature - ${record.supervisor_signature_date || '________'}</div>
        </div>
        ${record.witness_name ? `
        <div class="signature-block">
          <div class="signature-line">
            ${record.witness_signature ? `<img src="${record.witness_signature}" alt="Witness Signature">` : ''}
          </div>
          <div class="signature-label">Witness: ${record.witness_name} - ${record.witness_signature_date || '________'}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="footer">
      Document ID: ${record.id}<br>
      Generated: ${new Date().toLocaleString()}<br>
      ${settings?.company_name || 'ICAN Academy'} - Confidential Personnel Record
    </div>
  </div>
</body>
</html>
  `;
}

// Email sending function (for future use)
async function sendEmail(to, subject, body) {
  const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();

  if (!settings.email_notifications_enabled || !settings.smtp_host) {
    console.log('Email notifications disabled or not configured');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: settings.smtp_port,
      secure: settings.smtp_port === 465,
      auth: {
        user: settings.smtp_user,
        pass: settings.smtp_password
      }
    });

    await transporter.sendMail({
      from: settings.smtp_from_email,
      to,
      subject,
      html: body
    });

    return true;
  } catch (error) {
    console.error('Email send error:', error);
    return false;
  }
}

// Get employee's coaching summary (existing issues by category)
app.get('/api/employees/:id/coaching-summary', requireAuth, (req, res) => {
  try {
    const employeeId = req.params.id;

    // Get employee name
    const employee = db.prepare('SELECT first_name, last_name FROM employees WHERE id = ?').get(employeeId);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Get all coaching records for this employee, grouped by category
    const records = db.prepare(`
      SELECT
        c.category_id,
        cc.name as category_name,
        c.coaching_type,
        c.coaching_date,
        c.status
      FROM coaching_records c
      LEFT JOIN coaching_categories cc ON c.category_id = cc.id
      WHERE c.employee_id = ? AND c.category_id IS NOT NULL
      ORDER BY c.coaching_date DESC
    `).all(employeeId);

    // Group by category and find the highest level for each
    const levels = ['verbal_1', 'verbal_2', 'written', 'final', 'performance_improvement'];
    const categoryMap = {};

    records.forEach(record => {
      if (!categoryMap[record.category_id]) {
        categoryMap[record.category_id] = {
          category_id: record.category_id,
          category_name: record.category_name,
          currentLevel: record.coaching_type,
          lastDate: record.coaching_date,
          count: 1
        };
      } else {
        categoryMap[record.category_id].count++;
        // Check if this is a higher level
        const currentIndex = levels.indexOf(categoryMap[record.category_id].currentLevel);
        const newIndex = levels.indexOf(record.coaching_type);
        if (newIndex > currentIndex) {
          categoryMap[record.category_id].currentLevel = record.coaching_type;
        }
      }
    });

    // Calculate next level for each category
    const existingIssues = Object.values(categoryMap).map(issue => {
      const currentIndex = levels.indexOf(issue.currentLevel);
      let nextLevel = 'verbal_1';
      if (currentIndex >= 0 && currentIndex < levels.length - 1) {
        nextLevel = levels[currentIndex + 1];
      } else if (currentIndex === levels.length - 1) {
        nextLevel = 'performance_improvement';
      }
      return {
        ...issue,
        nextLevel
      };
    });

    res.json({
      employeeName: `${employee.first_name} ${employee.last_name}`,
      existingIssues
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get suggested coaching level based on employee's history for a category
app.get('/api/coaching/suggest-level', requireAuth, (req, res) => {
  const { employee_id, category_id } = req.query;

  if (!employee_id || !category_id) {
    return res.json({ suggestedLevel: 'verbal_1', history: [] });
  }

  // Get all previous coachings for this employee in this category (not resolved/closed)
  const history = db.prepare(`
    SELECT coaching_type, status, coaching_date, cc.name as category_name
    FROM coaching_records cr
    LEFT JOIN coaching_categories cc ON cr.category_id = cc.id
    WHERE cr.employee_id = ? AND cr.category_id = ?
    ORDER BY cr.coaching_date DESC
  `).all(employee_id, category_id);

  // Determine suggested level based on progression
  // Progression: verbal_1 -> verbal_2 -> written -> final -> performance_improvement
  const levels = ['verbal_1', 'verbal_2', 'written', 'final', 'performance_improvement'];

  let highestLevel = -1;
  history.forEach(record => {
    const levelIndex = levels.indexOf(record.coaching_type);
    if (levelIndex > highestLevel) {
      highestLevel = levelIndex;
    }
  });

  // Suggest next level (or stay at performance_improvement if already there)
  let suggestedLevel = 'verbal_1';
  if (highestLevel >= 0 && highestLevel < levels.length - 1) {
    suggestedLevel = levels[highestLevel + 1];
  } else if (highestLevel === levels.length - 1) {
    suggestedLevel = 'performance_improvement';
  }

  res.json({
    suggestedLevel,
    history: history.map(h => ({
      type: h.coaching_type,
      status: h.status,
      date: h.coaching_date,
      category: h.category_name
    })),
    previousCount: history.length
  });
});

// Analytics API
app.get('/api/analytics', requireAuth, (req, res) => {
  const { days = 'all' } = req.query;

  let dateFilter = '';
  if (days !== 'all') {
    dateFilter = `AND c.coaching_date >= date('now', '-${parseInt(days)} days')`;
  }

  // Total coachings
  const totalResult = db.prepare(`
    SELECT COUNT(*) as total FROM coaching_records c WHERE 1=1 ${dateFilter}
  `).get();

  // Open cases
  const openResult = db.prepare(`
    SELECT COUNT(*) as count FROM coaching_records c WHERE c.status = 'open' ${dateFilter}
  `).get();

  // Resolved cases
  const resolvedResult = db.prepare(`
    SELECT COUNT(*) as count FROM coaching_records c WHERE c.status = 'closed' ${dateFilter}
  `).get();

  // Average resolution time (in days)
  const avgTimeResult = db.prepare(`
    SELECT AVG(julianday(c.updated_at) - julianday(c.coaching_date)) as avg_days
    FROM coaching_records c
    WHERE c.status = 'closed' ${dateFilter}
  `).get();

  // By category
  const byCategory = db.prepare(`
    SELECT cc.name as category, COUNT(*) as count
    FROM coaching_records c
    LEFT JOIN coaching_categories cc ON c.category_id = cc.id
    WHERE 1=1 ${dateFilter}
    GROUP BY c.category_id
    ORDER BY count DESC
  `).all();

  // By warning level
  const byLevel = db.prepare(`
    SELECT c.coaching_type as level, COUNT(*) as count
    FROM coaching_records c
    WHERE 1=1 ${dateFilter}
    GROUP BY c.coaching_type
    ORDER BY
      CASE c.coaching_type
        WHEN 'verbal_1' THEN 1
        WHEN 'verbal_2' THEN 2
        WHEN 'written' THEN 3
        WHEN 'final' THEN 4
        WHEN 'performance_improvement' THEN 5
        ELSE 6
      END
  `).all();

  // Monthly trend (last 12 months)
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', c.coaching_date) as month, COUNT(*) as count
    FROM coaching_records c
    WHERE c.coaching_date >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', c.coaching_date)
    ORDER BY month ASC
  `).all();

  // Top coached employees
  const topEmployees = db.prepare(`
    SELECT e.first_name || ' ' || e.last_name as name, COUNT(*) as count
    FROM coaching_records c
    JOIN employees e ON c.employee_id = e.id
    WHERE 1=1 ${dateFilter}
    GROUP BY c.employee_id
    ORDER BY count DESC
    LIMIT 10
  `).all();

  res.json({
    total: totalResult.total,
    open: openResult.count,
    resolved: resolvedResult.count,
    avgResolutionDays: avgTimeResult.avg_days ? Math.round(avgTimeResult.avg_days) : null,
    byCategory,
    byLevel,
    monthlyTrend,
    topEmployees
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Academy Coaching App running at http://localhost:${PORT}`);
  console.log('Default admin login: username=admin, password=admin123');
});
