const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'coaching.db'));

// Initialize database tables
db.exec(`
  -- Users table for authentication
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    employee_id TEXT,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  -- Company settings table
  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT DEFAULT 'Academy',
    logo_url TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    disclaimer_text TEXT DEFAULT 'NOTICE TO EMPLOYEE (Per Philippine Labor Code & DOLE Guidelines):\n\nThis document serves as written notice of the specific acts or omissions for which disciplinary action is being considered (First Notice). You are hereby given the opportunity to explain your side and present evidence in your defense within five (5) calendar days from receipt of this notice.\n\nBy signing below, I acknowledge that:\n1. I have received this written notice specifying the grounds for the disciplinary action.\n2. I have been given the opportunity to explain my side (as required by the Two-Notice Rule).\n3. I understand that my signature acknowledges receipt only and does not necessarily indicate agreement with the contents.\n4. This document will be placed in my personnel file (201 file).\n5. I may submit a written explanation within 5 calendar days from receipt.\n\nFailure to sign does not invalidate this notice if delivery is witnessed.',
    default_followup_days INTEGER DEFAULT 30,
    email_notifications_enabled INTEGER DEFAULT 0,
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_user TEXT,
    smtp_password TEXT,
    smtp_from_email TEXT,
    notion_api_key TEXT,
    notion_database_id TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert default company settings
  INSERT OR IGNORE INTO company_settings (id) VALUES (1);

  -- Employees table (enhanced)
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    employee_number TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    position TEXT NOT NULL,
    department TEXT,
    hire_date TEXT NOT NULL,
    role_start_date TEXT,
    supervisor_id TEXT,
    status TEXT DEFAULT 'active',
    photo_url TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    union_member INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    notes TEXT,
    notion_id TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (supervisor_id) REFERENCES employees(id)
  );

  -- Coaching categories (based on ICAN Policy offense types)
  CREATE TABLE IF NOT EXISTS coaching_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert ICAN policy-based categories
  INSERT OR IGNORE INTO coaching_categories (id, name, description) VALUES
    ('cat_person', 'Offenses Against Person', 'Fighting, threats, intimidation, physical injury, harassment'),
    ('cat_property', 'Offenses Against Property', 'Theft, damage, misuse of company property or equipment'),
    ('cat_company', 'Offenses Against Company Interest', 'Falsification, fraud, conflict of interest, negligence'),
    ('cat_decency', 'Offenses Against Decency/Morality', 'Intoxication, inappropriate conduct, gambling, false statements'),
    ('cat_admin', 'Offenses Against Administration', 'Tardiness, AWOL, overbreak, failure to follow instructions'),
    ('cat_authority', 'Offenses Against Authority', 'Insubordination, refusing assignments, disrespect to superiors'),
    ('cat_teaching', 'Teaching & Classroom', 'Offenses related to classroom performance, lesson delivery, and student interaction'),
    ('cat_reports', 'Reports & Documentation', 'Failure to submit required reports, incomplete documentation, late submissions'),
    ('cat_attendance', 'Attendance & Punctuality', 'Tardiness, absences, leaving early, unauthorized breaks'),
    ('cat_professional', 'Professional Standards', 'Dress code violations, unprofessional conduct, poor work quality'),
    ('cat_safety', 'Safety & Welfare', 'Violations affecting student or staff safety and welfare'),
    ('cat_communication', 'Communication', 'Failure to communicate, unreachable, not responding to messages');

  -- Specific offenses table (linked to categories with severity)
  CREATE TABLE IF NOT EXISTS offense_types (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'minor',
    policy_reference TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES coaching_categories(id)
  );

  -- Insert specific offenses from ICAN Policy
  -- Offenses Against Person
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_person_1', 'cat_person', 'A-1', 'Crime against employer/supervisor', 'Commission of a crime or offense against employer or supervisor', 'grave', 'Section 1'),
    ('off_person_2', 'cat_person', 'A-2', 'Inflicting physical injury', 'Inflicting physical injury on any employee or person within or related to work', 'major', 'Section 2'),
    ('off_person_3', 'cat_person', 'A-3', 'Threat/intimidation/coercion', 'Any act of threat, intimidation or coercion against employees or obstructing work', 'major', 'Section 3'),
    ('off_person_4', 'cat_person', 'A-4', 'Fighting', 'Fighting or engaging in a fight within or outside company premises related to work', 'major', 'Section 4'),
    ('off_person_5', 'cat_person', 'A-5', 'Inciting/provoking fight', 'Inciting or provoking a fight where fight does not actually occur', 'minor', 'Section 5'),
    ('off_person_6', 'cat_person', 'A-6', 'Offensive remarks', 'Persistently telling offensive marks or indecent jokes', 'minor', 'Section 6'),
    ('off_person_7', 'cat_person', 'A-7', 'Immoral act/sexual harassment', 'Any immoral act including sexual harassment within company or activities', 'grave', 'Section 7');

  -- Offenses Against Property
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_prop_1', 'cat_property', 'B-1', 'Theft/robbery', 'Theft, robbery or appropriation of company/employee/client property', 'grave', 'Section 1'),
    ('off_prop_2', 'cat_property', 'B-2', 'Swindling/estafa', 'Swindling or malversation of company/employee/client funds', 'grave', 'Section 2'),
    ('off_prop_3', 'cat_property', 'B-3', 'Fraudulent orders', 'Obtaining supplies or materials on fraudulent orders', 'grave', 'Section 3'),
    ('off_prop_4', 'cat_property', 'B-4', 'Unauthorized substitution', 'Unauthorized substitution of company material with poorer quality', 'major', 'Section 4'),
    ('off_prop_5', 'cat_property', 'B-5', 'Property alteration/damage', 'Alteration or removal of property causing irreparable damage', 'grave', 'Section 5'),
    ('off_prop_6', 'cat_property', 'B-6', 'Unauthorized use of company resources', 'Using company time/material/equipment for personal gain', 'major', 'Section 6'),
    ('off_prop_7', 'cat_property', 'B-7', 'Failure to return property', 'Neglecting to remit money, return materials entrusted by company', 'minor', 'Section 7'),
    ('off_prop_8', 'cat_property', 'B-8', 'Willful destruction', 'Malicious or willful destruction of company property', 'major', 'Section 8');

  -- Offenses Against Company Interest
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_comp_1', 'cat_company', 'C-1', 'Falsification of personal records', 'Falsification or misrepresentation of personal records/data', 'grave', 'Section 1'),
    ('off_comp_2', 'cat_company', 'C-2', 'Falsification of company records', 'Falsification or unauthorized alteration of company records', 'grave', 'Section 2'),
    ('off_comp_3', 'cat_company', 'C-3', 'Expense fraud', 'Falsifying expense reports, receipts, invoices', 'grave', 'Section 3'),
    ('off_comp_4', 'cat_company', 'C-4', 'Kickbacks/bribery', 'Favoring suppliers in exchange for kickbacks or rebates', 'grave', 'Section 4'),
    ('off_comp_5', 'cat_company', 'C-5', 'Job-related bribery', 'Offering/accepting value in exchange for job or work assignment', 'grave', 'Section 5'),
    ('off_comp_6', 'cat_company', 'C-6', 'Unauthorized access', 'Giving company ID to unauthorized persons or assisting non-employees', 'grave', 'Section 6'),
    ('off_comp_7', 'cat_company', 'C-7', 'Loitering/leaving work', 'Loitering, wasting time, leaving work without permission', 'major', 'Section 7'),
    ('off_comp_8', 'cat_company', 'C-8', 'Malingering', 'Feigning illness to avoid work', 'major', 'Section 8'),
    ('off_comp_9', 'cat_company', 'C-9', 'Sleeping on duty', 'Sleeping during class time or while on duty', 'major', 'Section 9'),
    ('off_comp_10', 'cat_company', 'C-10', 'Failure to follow instructions', 'Failure to follow written/oral instructions due to negligence', 'minor', 'Section 10'),
    ('off_comp_11', 'cat_company', 'C-11', 'Influencing violations', 'Persuading others to violate company policies', 'major', 'Section 11');

  -- Offenses Against Decency/Morality
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_dec_1a', 'cat_decency', 'D-1a', 'Under influence of alcohol', 'Reporting for work under influence of alcohol', 'major', 'Section 1'),
    ('off_dec_1b', 'cat_decency', 'D-1b', 'Under influence of drugs', 'Reporting for work under influence of prohibited drugs', 'grave', 'Section 1'),
    ('off_dec_2', 'cat_decency', 'D-2', 'Bringing alcohol to premises', 'Drinking or bringing alcohol into company premises', 'major', 'Section 2'),
    ('off_dec_3', 'cat_decency', 'D-3', 'False/malicious statements', 'Making false, vicious or malicious statements about employees', 'major', 'Section 3'),
    ('off_dec_4', 'cat_decency', 'D-4', 'Libel/defamation/slander', 'Any act constituting offense against honor', 'major', 'Section 4'),
    ('off_dec_5', 'cat_decency', 'D-5', 'Scandalous conduct', 'Grossly scandalous or indecent conduct, profane language', 'minor', 'Section 5'),
    ('off_dec_6', 'cat_decency', 'D-6', 'Sexual harassment', 'Any acts of sexual harassment against co-employees', 'grave', 'Section 6'),
    ('off_dec_7', 'cat_decency', 'D-7', 'Crime against chastity', 'Committing crime against chastity or immoral acts', 'grave', 'Section 7'),
    ('off_dec_8', 'cat_decency', 'D-8', 'Gambling', 'Taking part in gambling, lottery, or games of chance', 'major', 'Section 8'),
    ('off_dec_9', 'cat_decency', 'D-9', 'Criminal conviction', 'Conviction of crime under Philippine law', 'major', 'Section 9');

  -- Offenses Against Administration (Attendance & Work Conduct)
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_adm_1', 'cat_admin', 'E-1', 'Habitual tardiness', '10+ instances or 120+ minutes total tardiness in one month', 'minor', 'Section 1'),
    ('off_adm_2', 'cat_admin', 'E-2', 'Overbreak', 'Taking breaks more than 15 minutes, 5+ instances or 30+ minutes total', 'minor', 'Section 2'),
    ('off_adm_3', 'cat_admin', 'E-3', 'AWOL', 'Absence without official leave (each day is separate offense)', 'minor', 'Section 3'),
    ('off_adm_4', 'cat_admin', 'E-4', 'Failure to return from leave', 'Not returning to work after leave expiration without approval', 'minor', 'Section 4'),
    ('off_adm_5', 'cat_admin', 'E-5', 'Failure to report for OT', 'Not reporting for scheduled overtime without justification', 'minor', 'Section 5'),
    ('off_adm_6', 'cat_admin', 'E-6', 'Time card fraud', 'Punching time card of another employee or having card punched while absent', 'major', 'Section 6'),
    ('off_adm_7', 'cat_admin', 'E-7', 'Failure to punch in/out', 'Failure to log time in biometrics', 'minor', 'Section 7'),
    ('off_adm_8', 'cat_admin', 'E-8', 'Derogatory postings', 'Posting derogatory articles or removing company information', 'minor', 'Section 8'),
    ('off_adm_9', 'cat_admin', 'E-9', 'Vandalism', 'Defacing company property, vandalism', 'major', 'Section 9'),
    ('off_adm_10', 'cat_admin', 'E-10', 'Featherbedding', 'Willfully slowing down or limiting work output', 'grave', 'Section 10'),
    ('off_adm_11', 'cat_admin', 'E-11', 'Unauthorized equipment use', 'Causing loss due to unauthorized use of machines/equipment', 'major', 'Section 11'),
    ('off_adm_12', 'cat_admin', 'E-12', 'Negligence causing loss', 'Causing loss due to negligence or unsatisfactory work', 'major', 'Section 12'),
    ('off_adm_13', 'cat_admin', 'E-13', 'Malicious statements about company', 'Making false statements about the company', 'major', 'Section 13'),
    ('off_adm_14', 'cat_admin', 'E-14', 'Unauthorized business', 'Selling or conducting private business during work hours', 'major', 'Section 14'),
    ('off_adm_15', 'cat_admin', 'E-15', 'Outside employment conflict', 'Holding position in competing business', 'major', 'Section 15'),
    -- Additional Attendance/Punctuality Offenses
    ('off_adm_16', 'cat_admin', 'E-16', 'Tardiness (1-15 minutes)', 'Late arrival to work by 1-15 minutes', 'minor', 'Attendance'),
    ('off_adm_17', 'cat_admin', 'E-17', 'Tardiness (16-30 minutes)', 'Late arrival to work by 16-30 minutes', 'minor', 'Attendance'),
    ('off_adm_18', 'cat_admin', 'E-18', 'Tardiness (31-60 minutes)', 'Late arrival to work by 31-60 minutes', 'minor', 'Attendance'),
    ('off_adm_19', 'cat_admin', 'E-19', 'Tardiness (over 1 hour)', 'Late arrival to work by more than 1 hour', 'major', 'Attendance'),
    ('off_adm_20', 'cat_admin', 'E-20', 'Early departure without permission', 'Leaving work before end of shift without authorization', 'minor', 'Attendance'),
    ('off_adm_21', 'cat_admin', 'E-21', 'Unexcused absence (1 day)', 'Single day unexcused absence from work', 'minor', 'Attendance'),
    ('off_adm_22', 'cat_admin', 'E-22', 'Unexcused absence (2-3 days)', 'Two to three consecutive days unexcused absence', 'major', 'Attendance'),
    ('off_adm_23', 'cat_admin', 'E-23', 'Unexcused absence (4+ days)', 'Four or more consecutive days unexcused absence', 'grave', 'Attendance'),
    ('off_adm_24', 'cat_admin', 'E-24', 'Late return from break', 'Returning late from scheduled break time', 'minor', 'Attendance'),
    ('off_adm_25', 'cat_admin', 'E-25', 'Extended lunch break', 'Taking longer lunch break than allowed', 'minor', 'Attendance'),
    ('off_adm_26', 'cat_admin', 'E-26', 'Unauthorized absence from workstation', 'Leaving assigned work area without permission', 'minor', 'Attendance'),
    ('off_adm_27', 'cat_admin', 'E-27', 'No call/no show', 'Failure to report to work without notification', 'major', 'Attendance'),
    ('off_adm_28', 'cat_admin', 'E-28', 'Pattern of Monday/Friday absences', 'Repeated absences on Mondays or Fridays', 'minor', 'Attendance'),
    ('off_adm_29', 'cat_admin', 'E-29', 'Late submission of leave request', 'Filing leave request after the leave was taken', 'minor', 'Attendance'),
    ('off_adm_30', 'cat_admin', 'E-30', 'Abuse of sick leave', 'Taking sick leave without valid medical reason', 'major', 'Attendance'),
    -- Additional Work Performance Offenses
    ('off_adm_31', 'cat_admin', 'E-31', 'Poor work quality', 'Consistently producing substandard or defective work', 'minor', 'Performance'),
    ('off_adm_32', 'cat_admin', 'E-32', 'Failure to meet deadlines', 'Not completing assigned tasks within required timeframe', 'minor', 'Performance'),
    ('off_adm_33', 'cat_admin', 'E-33', 'Inadequate preparation', 'Coming to work/class unprepared', 'minor', 'Performance'),
    ('off_adm_34', 'cat_admin', 'E-34', 'Failure to submit reports', 'Not submitting required reports or documentation on time', 'minor', 'Performance'),
    ('off_adm_35', 'cat_admin', 'E-35', 'Incomplete documentation', 'Failing to properly document work activities', 'minor', 'Performance'),
    ('off_adm_36', 'cat_admin', 'E-36', 'Careless work', 'Work performed without due care and attention', 'minor', 'Performance'),
    ('off_adm_37', 'cat_admin', 'E-37', 'Repeated errors', 'Making the same mistakes repeatedly despite coaching', 'minor', 'Performance'),
    ('off_adm_38', 'cat_admin', 'E-38', 'Failure to follow procedures', 'Not adhering to established work procedures', 'minor', 'Performance'),
    ('off_adm_39', 'cat_admin', 'E-39', 'Unsatisfactory job performance', 'Overall performance not meeting job requirements', 'minor', 'Performance'),
    ('off_adm_40', 'cat_admin', 'E-40', 'Failure to complete assigned tasks', 'Not finishing delegated work assignments', 'minor', 'Performance');

  -- Offenses Against Authority
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_auth_1', 'cat_authority', 'F-1', 'Refusing job assignment', 'Refusing to accept job assignments without justifiable reason', 'major', 'Section 1'),
    ('off_auth_2', 'cat_authority', 'F-2', 'Willful disobedience', 'Willful disobedience of lawful orders from company officers', 'grave', 'Section 2'),
    ('off_auth_3', 'cat_authority', 'F-3', 'Disrespect to authority', 'Any act of disrespect or disregard of authority', 'major', 'Section 3'),
    ('off_auth_4', 'cat_authority', 'F-4', 'Resistance/assault on authority', 'Resistance, threat, intimidation or assault against authority', 'major', 'Section 4'),
    ('off_auth_5', 'cat_authority', 'F-5', 'Other insubordination', 'Any other act constituting insubordination', 'major', 'Section 5'),
    -- Additional Authority/Conduct Offenses
    ('off_auth_6', 'cat_authority', 'F-6', 'Failure to attend meetings', 'Not attending required meetings without valid reason', 'minor', 'Conduct'),
    ('off_auth_7', 'cat_authority', 'F-7', 'Failure to respond to communications', 'Not responding to work emails/messages in timely manner', 'minor', 'Conduct'),
    ('off_auth_8', 'cat_authority', 'F-8', 'Argumentative behavior', 'Arguing with supervisors or coworkers in unprofessional manner', 'minor', 'Conduct'),
    ('off_auth_9', 'cat_authority', 'F-9', 'Negative attitude', 'Displaying negative attitude affecting team morale', 'minor', 'Conduct'),
    ('off_auth_10', 'cat_authority', 'F-10', 'Failure to cooperate', 'Refusing to cooperate with coworkers or team activities', 'minor', 'Conduct');

  -- Additional Category: Professionalism & Conduct (adding to cat_decency)
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_dec_10', 'cat_decency', 'D-10', 'Improper dress/uniform', 'Not wearing proper uniform or dress code violation', 'minor', 'Dress Code'),
    ('off_dec_11', 'cat_decency', 'D-11', 'Poor personal hygiene', 'Personal hygiene affecting workplace environment', 'minor', 'Conduct'),
    ('off_dec_12', 'cat_decency', 'D-12', 'Unprofessional appearance', 'Appearing unkempt or inappropriate for work', 'minor', 'Dress Code'),
    ('off_dec_13', 'cat_decency', 'D-13', 'Using profane language', 'Using inappropriate or vulgar language at work', 'minor', 'Conduct'),
    ('off_dec_14', 'cat_decency', 'D-14', 'Gossiping', 'Spreading rumors or gossip about coworkers', 'minor', 'Conduct'),
    ('off_dec_15', 'cat_decency', 'D-15', 'Disruptive behavior', 'Behavior that disrupts workplace operations', 'minor', 'Conduct'),
    ('off_dec_16', 'cat_decency', 'D-16', 'Horseplay', 'Engaging in horseplay or unsafe behavior', 'minor', 'Safety'),
    ('off_dec_17', 'cat_decency', 'D-17', 'Rude to customers/clients', 'Treating customers, students or clients rudely', 'major', 'Customer Service'),
    ('off_dec_18', 'cat_decency', 'D-18', 'Inappropriate social media use', 'Posting inappropriate work-related content on social media', 'minor', 'Conduct'),
    ('off_dec_19', 'cat_decency', 'D-19', 'Personal phone use during work', 'Excessive personal phone use during work hours', 'minor', 'Conduct'),
    ('off_dec_20', 'cat_decency', 'D-20', 'Inappropriate internet usage', 'Using company internet for non-work purposes', 'minor', 'Conduct');

  -- Additional Category: Safety Violations (adding to cat_company)
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_comp_12', 'cat_company', 'C-12', 'Safety rule violation', 'Violating established safety rules or procedures', 'major', 'Safety'),
    ('off_comp_13', 'cat_company', 'C-13', 'Failure to report accident', 'Not reporting workplace accident or injury', 'major', 'Safety'),
    ('off_comp_14', 'cat_company', 'C-14', 'Unsafe work practices', 'Engaging in unsafe work practices', 'major', 'Safety'),
    ('off_comp_15', 'cat_company', 'C-15', 'Not wearing safety equipment', 'Failure to wear required safety equipment', 'minor', 'Safety'),
    ('off_comp_16', 'cat_company', 'C-16', 'Unauthorized area access', 'Entering restricted areas without authorization', 'minor', 'Safety'),
    ('off_comp_17', 'cat_company', 'C-17', 'Smoking in prohibited areas', 'Smoking in non-designated areas', 'minor', 'Safety'),
    ('off_comp_18', 'cat_company', 'C-18', 'Food/drinks in work area', 'Eating or drinking in prohibited work areas', 'minor', 'Conduct'),
    ('off_comp_19', 'cat_company', 'C-19', 'Confidentiality breach', 'Disclosing confidential company information', 'major', 'Section 11'),
    ('off_comp_20', 'cat_company', 'C-20', 'Data privacy violation', 'Unauthorized access or sharing of personal data', 'major', 'Data Privacy'),
    ('off_comp_21', 'cat_company', 'C-21', 'Misuse of company vehicles', 'Using company vehicles for personal purposes', 'minor', 'Property'),
    ('off_comp_22', 'cat_company', 'C-22', 'Wasting company resources', 'Wasteful use of company supplies or materials', 'minor', 'Property');

  -- Additional: Teaching/Academic-specific offenses (for ICAN Academy)
  -- Classroom Attendance & Punctuality
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_1', 'cat_admin', 'T-1', 'Late for class (1-5 minutes)', 'Arriving 1-5 minutes late to scheduled class', 'minor', 'Teaching'),
    ('off_teach_1a', 'cat_admin', 'T-1a', 'Late for class (6-15 minutes)', 'Arriving 6-15 minutes late to scheduled class', 'minor', 'Teaching'),
    ('off_teach_1b', 'cat_admin', 'T-1b', 'Late for class (over 15 minutes)', 'Arriving more than 15 minutes late to scheduled class', 'major', 'Teaching'),
    ('off_teach_2', 'cat_admin', 'T-2', 'Cancelled class without notice', 'Cancelling class without prior notice to students/admin', 'major', 'Teaching'),
    ('off_teach_2a', 'cat_admin', 'T-2a', 'Cancelled class with late notice', 'Cancelling class with less than 24 hours notice', 'minor', 'Teaching'),
    ('off_teach_9', 'cat_admin', 'T-9', 'Early dismissal of class', 'Dismissing class before scheduled end time without approval', 'minor', 'Teaching'),
    ('off_teach_9a', 'cat_admin', 'T-9a', 'Early dismissal (more than 15 min)', 'Dismissing class more than 15 minutes early', 'major', 'Teaching'),
    ('off_teach_50', 'cat_admin', 'T-50', 'Left classroom unattended', 'Leaving students unsupervised during class time', 'major', 'Teaching'),
    ('off_teach_51', 'cat_admin', 'T-51', 'Extended personal breaks during class', 'Taking extended breaks during scheduled class time', 'minor', 'Teaching');

  -- Lesson Planning & Preparation
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_3', 'cat_admin', 'T-3', 'Unprepared lesson', 'Conducting class without proper lesson preparation', 'minor', 'Teaching'),
    ('off_teach_4', 'cat_admin', 'T-4', 'Incomplete lesson plan', 'Submitting incomplete or missing lesson plans', 'minor', 'Teaching'),
    ('off_teach_4a', 'cat_admin', 'T-4a', 'Late lesson plan submission', 'Submitting lesson plans after the required deadline', 'minor', 'Teaching'),
    ('off_teach_4b', 'cat_admin', 'T-4b', 'No lesson plan submitted', 'Failure to submit lesson plan entirely', 'major', 'Teaching'),
    ('off_teach_7', 'cat_admin', 'T-7', 'Failure to follow curriculum', 'Not following approved curriculum or syllabus', 'minor', 'Teaching'),
    ('off_teach_7a', 'cat_admin', 'T-7a', 'Teaching unapproved content', 'Teaching content not approved in curriculum', 'major', 'Teaching'),
    ('off_teach_52', 'cat_admin', 'T-52', 'Insufficient teaching materials', 'Not preparing adequate materials for class activities', 'minor', 'Teaching'),
    ('off_teach_53', 'cat_admin', 'T-53', 'Repetitive lesson content', 'Repeating same lesson without progression', 'minor', 'Teaching'),
    ('off_teach_54', 'cat_admin', 'T-54', 'Outdated teaching materials', 'Using outdated or obsolete teaching materials', 'minor', 'Teaching');

  -- Reports & Documentation
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_10', 'cat_admin', 'T-10', 'Failure to maintain attendance records', 'Not maintaining proper student attendance records', 'minor', 'Teaching'),
    ('off_teach_10a', 'cat_admin', 'T-10a', 'Inaccurate attendance records', 'Recording incorrect or falsified attendance', 'major', 'Teaching'),
    ('off_teach_55', 'cat_admin', 'T-55', 'Late daily report submission', 'Submitting daily class reports after deadline', 'minor', 'Teaching'),
    ('off_teach_56', 'cat_admin', 'T-56', 'Missing daily report', 'Failure to submit required daily class report', 'minor', 'Teaching'),
    ('off_teach_57', 'cat_admin', 'T-57', 'Late weekly report submission', 'Submitting weekly reports after deadline', 'minor', 'Teaching'),
    ('off_teach_58', 'cat_admin', 'T-58', 'Missing weekly report', 'Failure to submit required weekly report', 'major', 'Teaching'),
    ('off_teach_59', 'cat_admin', 'T-59', 'Late monthly report submission', 'Submitting monthly reports after deadline', 'minor', 'Teaching'),
    ('off_teach_60', 'cat_admin', 'T-60', 'Missing monthly report', 'Failure to submit required monthly report', 'major', 'Teaching'),
    ('off_teach_61', 'cat_admin', 'T-61', 'Incomplete student progress report', 'Submitting incomplete student progress documentation', 'minor', 'Teaching'),
    ('off_teach_62', 'cat_admin', 'T-62', 'Late incident report', 'Late submission of classroom incident report', 'minor', 'Teaching'),
    ('off_teach_63', 'cat_admin', 'T-63', 'Failure to report incident', 'Not reporting classroom incident that should be documented', 'major', 'Teaching');

  -- Grading & Assessment
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_5', 'cat_admin', 'T-5', 'Late grade submission', 'Submitting grades after required deadline', 'minor', 'Teaching'),
    ('off_teach_5a', 'cat_admin', 'T-5a', 'Missing grade submission', 'Failure to submit grades entirely', 'major', 'Teaching'),
    ('off_teach_64', 'cat_admin', 'T-64', 'Inaccurate grading', 'Errors in student grade calculation or recording', 'minor', 'Teaching'),
    ('off_teach_65', 'cat_admin', 'T-65', 'Inconsistent grading standards', 'Applying inconsistent grading criteria across students', 'minor', 'Teaching'),
    ('off_teach_66', 'cat_admin', 'T-66', 'Late assessment feedback', 'Not providing timely feedback on student work', 'minor', 'Teaching'),
    ('off_teach_67', 'cat_admin', 'T-67', 'Missing student evaluations', 'Failure to complete required student evaluations', 'minor', 'Teaching'),
    ('off_teach_68', 'cat_admin', 'T-68', 'Unfair assessment practices', 'Showing favoritism or bias in assessments', 'major', 'Teaching');

  -- Classroom Management & Student Interaction
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_6', 'cat_admin', 'T-6', 'Improper student interaction', 'Inappropriate communication or behavior with students', 'major', 'Teaching'),
    ('off_teach_8', 'cat_admin', 'T-8', 'Inadequate class supervision', 'Not properly supervising students during class', 'minor', 'Teaching'),
    ('off_teach_69', 'cat_admin', 'T-69', 'Poor classroom management', 'Inability to maintain order and discipline in classroom', 'minor', 'Teaching'),
    ('off_teach_70', 'cat_admin', 'T-70', 'Ignoring student misbehavior', 'Failing to address student misconduct appropriately', 'minor', 'Teaching'),
    ('off_teach_71', 'cat_admin', 'T-71', 'Excessive punishment', 'Imposing punishment disproportionate to offense', 'major', 'Teaching'),
    ('off_teach_72', 'cat_admin', 'T-72', 'Physical contact with student', 'Inappropriate physical contact with student', 'grave', 'Teaching'),
    ('off_teach_73', 'cat_admin', 'T-73', 'Verbal abuse of student', 'Using harsh, demeaning or abusive language with student', 'major', 'Teaching'),
    ('off_teach_74', 'cat_admin', 'T-74', 'Public embarrassment of student', 'Deliberately embarrassing student in front of class', 'major', 'Teaching'),
    ('off_teach_75', 'cat_admin', 'T-75', 'Favoritism toward students', 'Showing preferential treatment to certain students', 'minor', 'Teaching'),
    ('off_teach_76', 'cat_admin', 'T-76', 'Neglecting struggling students', 'Failing to provide support to students who need help', 'minor', 'Teaching'),
    ('off_teach_77', 'cat_admin', 'T-77', 'Improper parent communication', 'Inappropriate or unprofessional communication with parents', 'minor', 'Teaching'),
    ('off_teach_78', 'cat_admin', 'T-78', 'Failure to respond to parent inquiry', 'Not responding to parent questions within expected timeframe', 'minor', 'Teaching');

  -- Teaching Quality & Professional Standards
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_79', 'cat_admin', 'T-79', 'Ineffective teaching methods', 'Using teaching methods that fail to engage students', 'minor', 'Teaching'),
    ('off_teach_80', 'cat_admin', 'T-80', 'Failure to differentiate instruction', 'Not adapting teaching to different learning needs', 'minor', 'Teaching'),
    ('off_teach_81', 'cat_admin', 'T-81', 'Poor English pronunciation', 'Incorrect pronunciation affecting student learning', 'minor', 'Teaching'),
    ('off_teach_82', 'cat_admin', 'T-82', 'Teaching incorrect information', 'Providing incorrect or misleading information to students', 'major', 'Teaching'),
    ('off_teach_83', 'cat_admin', 'T-83', 'Using phone during class', 'Using personal mobile phone during instruction time', 'minor', 'Teaching'),
    ('off_teach_84', 'cat_admin', 'T-84', 'Off-topic discussions in class', 'Spending excessive time on non-lesson related topics', 'minor', 'Teaching'),
    ('off_teach_85', 'cat_admin', 'T-85', 'Showing movies without approval', 'Playing videos/movies not approved for curriculum', 'minor', 'Teaching'),
    ('off_teach_86', 'cat_admin', 'T-86', 'Sleeping during class', 'Teacher sleeping or appearing to sleep during class', 'major', 'Teaching'),
    ('off_teach_87', 'cat_admin', 'T-87', 'Eating during instruction', 'Eating meals during active instruction time', 'minor', 'Teaching');

  -- Materials & Resources
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_88', 'cat_admin', 'T-88', 'Lost teaching materials', 'Losing company-provided teaching materials or equipment', 'minor', 'Teaching'),
    ('off_teach_89', 'cat_admin', 'T-89', 'Damaged teaching materials', 'Damaging teaching materials through negligence', 'minor', 'Teaching'),
    ('off_teach_90', 'cat_admin', 'T-90', 'Unauthorized use of materials', 'Using materials from unauthorized sources in class', 'minor', 'Teaching'),
    ('off_teach_91', 'cat_admin', 'T-91', 'Failure to return materials', 'Not returning borrowed teaching materials', 'minor', 'Teaching'),
    ('off_teach_92', 'cat_admin', 'T-92', 'Improper classroom setup', 'Not preparing classroom environment before class', 'minor', 'Teaching'),
    ('off_teach_93', 'cat_admin', 'T-93', 'Leaving classroom disorganized', 'Not cleaning or organizing classroom after use', 'minor', 'Teaching');

  -- Meetings & Professional Development
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_94', 'cat_admin', 'T-94', 'Absent from staff meeting', 'Missing required staff or faculty meeting without excuse', 'minor', 'Teaching'),
    ('off_teach_95', 'cat_admin', 'T-95', 'Late to staff meeting', 'Arriving late to required staff or faculty meeting', 'minor', 'Teaching'),
    ('off_teach_96', 'cat_admin', 'T-96', 'Missing training session', 'Not attending required professional development training', 'minor', 'Teaching'),
    ('off_teach_97', 'cat_admin', 'T-97', 'Failure to implement training', 'Not applying skills learned in training to classroom', 'minor', 'Teaching'),
    ('off_teach_98', 'cat_admin', 'T-98', 'Missing demo class', 'Not attending required demonstration class', 'minor', 'Teaching'),
    ('off_teach_99', 'cat_admin', 'T-99', 'Unprepared for observation', 'Not being prepared for scheduled class observation', 'minor', 'Teaching');

  -- Student Safety & Welfare
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_100', 'cat_admin', 'T-100', 'Failure to ensure student safety', 'Not taking reasonable steps to ensure student safety', 'major', 'Teaching'),
    ('off_teach_101', 'cat_admin', 'T-101', 'Late reporting student injury', 'Delayed reporting of student injury or illness', 'major', 'Teaching'),
    ('off_teach_102', 'cat_admin', 'T-102', 'Failure to follow emergency procedures', 'Not following proper emergency or evacuation procedures', 'major', 'Teaching'),
    ('off_teach_103', 'cat_admin', 'T-103', 'Allowing dangerous activities', 'Permitting activities that could harm students', 'major', 'Teaching'),
    ('off_teach_104', 'cat_admin', 'T-104', 'Improper medication handling', 'Mishandling student medication or health needs', 'major', 'Teaching'),
    ('off_teach_105', 'cat_admin', 'T-105', 'Failure to report abuse suspicion', 'Not reporting suspected child abuse or neglect', 'grave', 'Teaching');

  -- Online/Remote Teaching (if applicable)
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_teach_106', 'cat_admin', 'T-106', 'Late to online class', 'Starting online/virtual class late', 'minor', 'Teaching'),
    ('off_teach_107', 'cat_admin', 'T-107', 'Technical unpreparedness', 'Not testing equipment before online class', 'minor', 'Teaching'),
    ('off_teach_108', 'cat_admin', 'T-108', 'Poor online class engagement', 'Not engaging students adequately in virtual setting', 'minor', 'Teaching'),
    ('off_teach_109', 'cat_admin', 'T-109', 'Inappropriate virtual background', 'Using unprofessional background in online class', 'minor', 'Teaching'),
    ('off_teach_110', 'cat_admin', 'T-110', 'Recording class without consent', 'Recording online class without proper consent', 'major', 'Teaching');

  -- Additional: Communication & Teamwork offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity, policy_reference) VALUES
    ('off_comm_1', 'cat_person', 'G-1', 'Poor communication', 'Failing to communicate important information to team', 'minor', 'Communication'),
    ('off_comm_2', 'cat_person', 'G-2', 'Withholding information', 'Deliberately withholding work-related information', 'minor', 'Communication'),
    ('off_comm_3', 'cat_person', 'G-3', 'Undermining coworkers', 'Actions that undermine coworkers or team efforts', 'minor', 'Teamwork'),
    ('off_comm_4', 'cat_person', 'G-4', 'Creating hostile environment', 'Contributing to hostile work environment', 'major', 'Conduct'),
    ('off_comm_5', 'cat_person', 'G-5', 'Bullying', 'Bullying behavior towards coworkers', 'major', 'Conduct'),
    ('off_comm_6', 'cat_person', 'G-6', 'Discrimination', 'Discriminatory behavior based on protected characteristics', 'grave', 'Conduct'),
    ('off_comm_7', 'cat_person', 'G-7', 'Spreading false information', 'Deliberately spreading misinformation at work', 'minor', 'Conduct'),
    ('off_comm_8', 'cat_person', 'G-8', 'Failure to report misconduct', 'Not reporting witnessed misconduct or violations', 'minor', 'Conduct');

  -- Attendance & Punctuality Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_tardiness_minor', 'cat_attendance', 'ATT-001', 'Tardiness (under 30 minutes)', 'Late arrival to work by less than 30 minutes', 'minor'),
    ('off_tardiness_major', 'cat_attendance', 'ATT-002', 'Tardiness (30 minutes or more)', 'Late arrival to work by 30 minutes or more', 'minor'),
    ('off_absent_no_notice', 'cat_attendance', 'ATT-003', 'Absent without notice', 'Employee fails to report to work without prior notice', 'major'),
    ('off_absent_no_call', 'cat_attendance', 'ATT-004', 'No call/no show', 'Employee absent without any communication', 'grave'),
    ('off_leave_early', 'cat_attendance', 'ATT-005', 'Leaving work early without permission', 'Employee leaves before end of shift without authorization', 'minor'),
    ('off_extended_break', 'cat_attendance', 'ATT-006', 'Extended break time', 'Employee exceeds allotted break duration', 'minor'),
    ('off_clock_violation', 'cat_attendance', 'ATT-007', 'Failure to clock in/out', 'Employee fails to properly record attendance', 'minor'),
    ('off_pattern_tardiness', 'cat_attendance', 'ATT-008', 'Pattern of tardiness', 'Repeated instances of late arrival', 'major'),
    ('off_unauthorized_absence', 'cat_attendance', 'ATT-009', 'Unauthorized absence', 'Employee absent without approved leave', 'major'),
    ('off_excessive_absences', 'cat_attendance', 'ATT-010', 'Excessive absences', 'Pattern of frequent absences affecting work', 'grave');

  -- Teaching & Classroom Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_unprepared_class', 'cat_teaching', 'TCH-001', 'Unprepared for class', 'Teacher arrives without lesson plan or materials', 'minor'),
    ('off_late_to_class', 'cat_teaching', 'TCH-002', 'Late to class', 'Teacher arrives late to scheduled class', 'minor'),
    ('off_early_dismissal', 'cat_teaching', 'TCH-003', 'Early class dismissal', 'Dismissing class before scheduled end time without authorization', 'minor'),
    ('off_no_lesson_plan', 'cat_teaching', 'TCH-004', 'No lesson plan', 'Failure to prepare required lesson plan', 'minor'),
    ('off_poor_delivery', 'cat_teaching', 'TCH-005', 'Poor lesson delivery', 'Ineffective teaching methods affecting student learning', 'minor'),
    ('off_skip_curriculum', 'cat_teaching', 'TCH-006', 'Skipping curriculum content', 'Failing to cover required curriculum topics', 'major'),
    ('off_inappropriate_content', 'cat_teaching', 'TCH-007', 'Inappropriate classroom content', 'Presenting content not suitable for students', 'grave'),
    ('off_neglect_students', 'cat_teaching', 'TCH-008', 'Neglecting student needs', 'Failing to address student questions or concerns', 'minor'),
    ('off_classroom_control', 'cat_teaching', 'TCH-009', 'Poor classroom management', 'Inability to maintain classroom discipline', 'minor'),
    ('off_cancel_no_notice', 'cat_teaching', 'TCH-010', 'Canceling class without notice', 'Canceling scheduled class without proper notification', 'major'),
    ('off_leave_class_unsupervised', 'cat_teaching', 'TCH-011', 'Leaving class unsupervised', 'Teacher leaves classroom with students unattended', 'grave'),
    ('off_no_daily_report', 'cat_teaching', 'TCH-012', 'Not sending daily report', 'Failure to submit required daily class report', 'minor');

  -- Reports & Documentation Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_late_report', 'cat_reports', 'RPT-001', 'Late report submission', 'Submitting required reports after deadline', 'minor'),
    ('off_incomplete_report', 'cat_reports', 'RPT-002', 'Incomplete documentation', 'Submitting reports with missing required information', 'minor'),
    ('off_no_report', 'cat_reports', 'RPT-003', 'Failure to submit report', 'Not submitting required reports at all', 'major'),
    ('off_inaccurate_report', 'cat_reports', 'RPT-004', 'Inaccurate reporting', 'Submitting reports with incorrect information', 'major'),
    ('off_late_grades', 'cat_reports', 'RPT-005', 'Late grade submission', 'Failing to submit student grades by deadline', 'major'),
    ('off_incomplete_records', 'cat_reports', 'RPT-006', 'Incomplete student records', 'Failing to maintain complete student documentation', 'minor'),
    ('off_missing_attendance', 'cat_reports', 'RPT-007', 'Missing attendance records', 'Failure to record student attendance', 'minor'),
    ('off_late_progress_report', 'cat_reports', 'RPT-008', 'Late progress reports', 'Submitting student progress reports after deadline', 'minor'),
    ('off_falsified_docs', 'cat_reports', 'RPT-009', 'Falsified documentation', 'Intentionally submitting false information in reports', 'grave'),
    ('off_lost_records', 'cat_reports', 'RPT-010', 'Lost or misplaced records', 'Losing important student or administrative records', 'major');

  -- Professional Standards Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_dress_code', 'cat_professional', 'PRO-001', 'Dress code violation', 'Not adhering to professional dress standards', 'minor'),
    ('off_grooming', 'cat_professional', 'PRO-002', 'Grooming standards violation', 'Not meeting professional grooming requirements', 'minor'),
    ('off_unprofessional_conduct', 'cat_professional', 'PRO-003', 'Unprofessional conduct', 'Behavior not befitting a professional educator', 'major'),
    ('off_poor_work_quality', 'cat_professional', 'PRO-004', 'Poor work quality', 'Consistently producing substandard work', 'minor'),
    ('off_negative_attitude', 'cat_professional', 'PRO-005', 'Negative attitude', 'Displaying negative attitude affecting workplace', 'minor'),
    ('off_gossip', 'cat_professional', 'PRO-006', 'Spreading gossip', 'Engaging in gossip about colleagues or students', 'minor'),
    ('off_conflict_coworker', 'cat_professional', 'PRO-007', 'Conflict with coworkers', 'Engaging in conflicts affecting workplace harmony', 'major'),
    ('off_inappropriate_relationship', 'cat_professional', 'PRO-008', 'Inappropriate relationships', 'Engaging in inappropriate relationships at workplace', 'grave'),
    ('off_social_media', 'cat_professional', 'PRO-009', 'Social media misconduct', 'Posting inappropriate content related to work', 'major'),
    ('off_confidentiality', 'cat_professional', 'PRO-010', 'Breach of confidentiality', 'Sharing confidential student or school information', 'grave');

  -- Safety & Welfare Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_safety_violation', 'cat_safety', 'SAF-001', 'Safety protocol violation', 'Not following established safety procedures', 'major'),
    ('off_endangering_students', 'cat_safety', 'SAF-002', 'Endangering student safety', 'Actions that put students at risk', 'grave'),
    ('off_emergency_failure', 'cat_safety', 'SAF-003', 'Failure in emergency procedures', 'Not following proper emergency protocols', 'major'),
    ('off_supervision_failure', 'cat_safety', 'SAF-004', 'Inadequate supervision', 'Failing to properly supervise students', 'major'),
    ('off_hazard_ignore', 'cat_safety', 'SAF-005', 'Ignoring safety hazards', 'Not reporting or addressing safety hazards', 'major'),
    ('off_first_aid_failure', 'cat_safety', 'SAF-006', 'Failure to provide first aid', 'Not responding appropriately to student injury/illness', 'major'),
    ('off_physical_discipline', 'cat_safety', 'SAF-007', 'Physical discipline', 'Using physical force on students', 'grave'),
    ('off_bullying_ignore', 'cat_safety', 'SAF-008', 'Ignoring student bullying', 'Failing to address student bullying incidents', 'major'),
    ('off_unsafe_environment', 'cat_safety', 'SAF-009', 'Maintaining unsafe environment', 'Classroom/area conditions posing safety risks', 'major'),
    ('off_student_welfare', 'cat_safety', 'SAF-010', 'Neglecting student welfare', 'Failing to address student welfare concerns', 'major');

  -- Communication Category offenses
  INSERT OR IGNORE INTO offense_types (id, category_id, code, name, description, severity) VALUES
    ('off_unreachable', 'cat_communication', 'COM-001', 'Unreachable during work hours', 'Cannot be contacted during work hours', 'minor'),
    ('off_no_response_msg', 'cat_communication', 'COM-002', 'Not responding to messages', 'Failing to respond to work-related messages', 'minor'),
    ('off_late_response', 'cat_communication', 'COM-003', 'Delayed response to communications', 'Taking excessive time to respond to inquiries', 'minor'),
    ('off_no_parent_comm', 'cat_communication', 'COM-004', 'Failure to communicate with parents', 'Not maintaining required parent communication', 'major'),
    ('off_missed_meeting', 'cat_communication', 'COM-005', 'Missing scheduled meetings', 'Not attending required meetings without notice', 'minor'),
    ('off_poor_email', 'cat_communication', 'COM-006', 'Unprofessional email communication', 'Sending inappropriate or unprofessional emails', 'minor'),
    ('off_withholding_info', 'cat_communication', 'COM-007', 'Withholding important information', 'Failing to share critical information with team', 'major'),
    ('off_miscommunication', 'cat_communication', 'COM-008', 'Miscommunication causing issues', 'Poor communication leading to problems', 'minor'),
    ('off_no_update', 'cat_communication', 'COM-009', 'Failure to provide updates', 'Not providing required status updates', 'minor'),
    ('off_ignore_instructions', 'cat_communication', 'COM-010', 'Ignoring communications from management', 'Deliberately ignoring messages from supervisors', 'major');

  -- Coaching records table (enhanced for Philippine Labor Law compliance)
  CREATE TABLE IF NOT EXISTS coaching_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    supervisor_id TEXT NOT NULL,
    coaching_type TEXT NOT NULL,
    category_id TEXT,
    offense_id TEXT,
    custom_offense_text TEXT,
    offense_severity TEXT DEFAULT 'minor',
    coaching_date TEXT NOT NULL,
    coaching_time TEXT,
    location TEXT,
    issue_description TEXT NOT NULL,
    prior_discussions TEXT,
    expected_improvement TEXT NOT NULL,
    improvement_timeline TEXT NOT NULL,
    follow_up_date TEXT,
    support_offered TEXT,
    consequences TEXT,
    -- Due Process Fields (Philippine Labor Law - Two-Notice Rule)
    employee_explanation TEXT,
    employee_comments TEXT,
    employee_acknowledged INTEGER DEFAULT 0,
    employee_refused_to_sign INTEGER DEFAULT 0,
    -- Administrative Conference Fields
    conference_held INTEGER DEFAULT 0,
    conference_date TEXT,
    conference_attendees TEXT,
    conference_summary TEXT,
    -- Signature Fields
    employee_signature TEXT,
    employee_signature_date TEXT,
    supervisor_signature TEXT,
    supervisor_signature_date TEXT,
    witness_name TEXT,
    witness_position TEXT,
    witness_signature TEXT,
    witness_signature_date TEXT,
    -- Notice Tracking (DOLE compliance)
    notice_served_date TEXT,
    notice_received_date TEXT,
    -- HR Review
    hr_reviewer_id TEXT,
    hr_reviewed_date TEXT,
    hr_comments TEXT,
    status TEXT DEFAULT 'draft',
    is_locked INTEGER DEFAULT 0,
    locked_at TEXT,
    locked_by TEXT,
    policy_references TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (supervisor_id) REFERENCES employees(id),
    FOREIGN KEY (category_id) REFERENCES coaching_categories(id),
    FOREIGN KEY (hr_reviewer_id) REFERENCES employees(id)
  );

  -- Attachments table
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    coaching_record_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    description TEXT,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coaching_record_id) REFERENCES coaching_records(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  -- Progress notes table (enhanced)
  CREATE TABLE IF NOT EXISTS progress_notes (
    id TEXT PRIMARY KEY,
    coaching_record_id TEXT NOT NULL,
    note_date TEXT NOT NULL,
    progress_status TEXT NOT NULL,
    notes TEXT NOT NULL,
    next_steps TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coaching_record_id) REFERENCES coaching_records(id),
    FOREIGN KEY (created_by) REFERENCES employees(id)
  );

  -- Notifications table
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read INTEGER DEFAULT 0,
    email_sent INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Email queue for sending notifications
  CREATE TABLE IF NOT EXISTS email_queue (
    id TEXT PRIMARY KEY,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Audit log for legal compliance
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    ip_address TEXT,
    user_agent TEXT,
    performed_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessions table for express-session
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired TEXT NOT NULL
  );
`);

// Create indexes for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_coaching_employee ON coaching_records(employee_id);
  CREATE INDEX IF NOT EXISTS idx_coaching_supervisor ON coaching_records(supervisor_id);
  CREATE INDEX IF NOT EXISTS idx_coaching_date ON coaching_records(coaching_date);
  CREATE INDEX IF NOT EXISTS idx_coaching_follow_up ON coaching_records(follow_up_date);
  CREATE INDEX IF NOT EXISTS idx_coaching_status ON coaching_records(status);
  CREATE INDEX IF NOT EXISTS idx_coaching_category ON coaching_records(category_id);
  CREATE INDEX IF NOT EXISTS idx_progress_coaching ON progress_notes(coaching_record_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_coaching ON attachments(coaching_record_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_users_employee ON users(employee_id);
  CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(table_name, record_id);
`);

// Migration: Add is_admin column if it doesn't exist
try {
  db.exec(`ALTER TABLE employees ADD COLUMN is_admin INTEGER DEFAULT 0`);
  console.log('Added is_admin column to employees table');
} catch (e) {
  // Column already exists
}

// Migration: Add custom_offense_text column if it doesn't exist
try {
  db.exec(`ALTER TABLE coaching_records ADD COLUMN custom_offense_text TEXT`);
  console.log('Added custom_offense_text column to coaching_records table');
} catch (e) {
  // Column already exists
}

// Add admin team members if they don't exist
const { v4: uuidv4 } = require('uuid');
const adminMembers = [
  { first_name: 'Gemma', last_name: 'Termulo', position: 'Administrator', employee_number: 'ADM001' },
  { first_name: 'Steven', last_name: 'You', position: 'Administrator', employee_number: 'ADM002' },
  { first_name: 'Bruce', last_name: 'Lee', position: 'Administrator', employee_number: 'ADM003' }
];

adminMembers.forEach(admin => {
  const exists = db.prepare('SELECT id FROM employees WHERE first_name = ? AND last_name = ?').get(admin.first_name, admin.last_name);
  if (!exists) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO employees (id, employee_number, first_name, last_name, position, hire_date, status, is_admin)
      VALUES (?, ?, ?, ?, ?, date('now'), 'active', 1)
    `).run(id, admin.employee_number, admin.first_name, admin.last_name, admin.position);
    console.log(`Added admin: ${admin.first_name} ${admin.last_name}`);
  } else {
    // Update existing to be admin
    db.prepare('UPDATE employees SET is_admin = 1 WHERE id = ?').run(exists.id);
  }
});

// Also mark employees with "Administrator" in their position as admins
db.prepare(`UPDATE employees SET is_admin = 1 WHERE position LIKE '%Administrator%'`).run();
console.log('Marked employees with Administrator in position as admins');

// Check if admin user exists, if not create one
const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
if (adminExists.count === 0) {
  const { v4: uuidv4 } = require('uuid');
  const adminId = uuidv4();
  const passwordHash = bcrypt.hashSync('admin123', 10);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, email, role, is_active)
    VALUES (?, 'admin', ?, 'admin@academy.com', 'admin', 1)
  `).run(adminId, passwordHash);

  console.log('Default admin user created: username=admin, password=admin123');
}

module.exports = db;
