const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = new Database(path.join(__dirname, 'coaching.db'));

const NOTION_API_KEY = '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';
const NOTION_DATABASE_ID = '1abd37d6663080ae9307ddbee22c48b1';

async function fetchAllFromNotion() {
  let allResults = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        page_size: 100,
        start_cursor: startCursor
      })
    });

    const data = await response.json();
    allResults = allResults.concat(data.results || []);
    hasMore = data.has_more;
    startCursor = data.next_cursor;
  }

  return allResults;
}

function getTextValue(prop) {
  if (!prop) return '';
  if (prop.rich_text && prop.rich_text.length > 0) {
    return prop.rich_text.map(t => t.plain_text).join('');
  }
  if (prop.title && prop.title.length > 0) {
    return prop.title.map(t => t.plain_text).join('');
  }
  return '';
}

function getSelectValue(prop) {
  if (!prop || !prop.select) return '';
  return prop.select.name || '';
}

function getMultiSelectValue(prop) {
  if (!prop || !prop.multi_select) return '';
  return prop.multi_select.map(s => s.name).join(', ');
}

async function syncEmployees() {
  console.log('Fetching employees from Notion...');
  const results = await fetchAllFromNotion();
  console.log(`Found ${results.length} employees in Notion`);

  let created = 0, updated = 0, skipped = 0;

  const insertStmt = db.prepare(`
    INSERT INTO employees (id, employee_number, first_name, last_name, email, phone, position, department, hire_date, status, notion_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const updateStmt = db.prepare(`
    UPDATE employees SET first_name = ?, last_name = ?, email = ?, phone = ?, position = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE notion_id = ?
  `);

  const checkStmt = db.prepare('SELECT id FROM employees WHERE notion_id = ?');

  for (const page of results) {
    const props = page.properties;

    const firstName = getTextValue(props['First Name']) || getTextValue(props['Nickname']) || 'Unknown';
    const lastName = getTextValue(props['Last Name']) || '';
    const email = props['Email']?.email || '';
    const phone = props['Contact Number']?.phone_number || '';
    const position = getMultiSelectValue(props['Position']) || getMultiSelectValue(props['Designation']) || 'Teacher';
    const status = getSelectValue(props['Status'])?.toLowerCase() === 'active' ? 'active' : 'inactive';
    const teacherId = props['Teacher ID']?.unique_id;
    const employeeNumber = teacherId ? `${teacherId.prefix || 'ICN'}${teacherId.number}` : null;
    const notionId = page.id;

    // Check if exists
    const existing = checkStmt.get(notionId);

    if (existing) {
      updateStmt.run(firstName, lastName, email, phone, position, status, notionId);
      updated++;
    } else {
      const id = uuidv4();
      insertStmt.run(id, employeeNumber, firstName, lastName, email, phone, position, '', new Date().toISOString().split('T')[0], status, notionId);
      created++;
    }
  }

  console.log(`\nSync complete!`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Total: ${results.length}`);

  // Show count
  const count = db.prepare('SELECT COUNT(*) as count FROM employees').get();
  console.log(`\nTotal employees in database: ${count.count}`);
}

syncEmployees().catch(console.error);
