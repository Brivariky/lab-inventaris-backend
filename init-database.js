const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database file in the same directory
const dbPath = path.join(__dirname, 'inventory.db');
const db = new sqlite3.Database(dbPath);

console.log('Initializing database...');

// Create tables
db.serialize(() => {
  // Create items table
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      information TEXT,
      location TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating items table:', err);
    } else {
      console.log('Items table created successfully');
    }
  });

  // Create inventory_codes table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_codes (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      kode_inventaris TEXT,
      spesifikasi TEXT,
      status TEXT DEFAULT 'good',
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Error creating inventory_codes table:', err);
    } else {
      console.log('Inventory codes table created successfully');
    }
  });

  // Insert sample data from data.json
  const sampleData = require('./data.json');
  
  // Insert items
  const insertItem = db.prepare('INSERT OR IGNORE INTO items (id, name, information, location) VALUES (?, ?, ?, ?)');
  sampleData.items.forEach(item => {
    insertItem.run(item.id, item.name, item.information, item.location);
  });
  insertItem.finalize();
  console.log(`Inserted ${sampleData.items.length} items`);

  // Insert serial numbers
  const insertSerial = db.prepare('INSERT OR IGNORE INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added) VALUES (?, ?, ?, ?, ?, ?)');
  sampleData.serialNumbers.forEach(serial => {
    const dateAdded = serial.dateAdded ? new Date(serial.dateAdded).toISOString() : new Date().toISOString();
    insertSerial.run(serial.id, serial.itemId, serial.serialNumber, serial.specs, serial.status, dateAdded);
  });
  insertSerial.finalize();
  console.log(`Inserted ${sampleData.serialNumbers.length} serial numbers`);

  console.log('Database initialization completed!');
  console.log(`Database file created at: ${dbPath}`);
});

db.close(); 