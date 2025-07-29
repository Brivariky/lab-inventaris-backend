require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Database setup
const dbPath = path.join(__dirname, 'inventory.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    // Initialize database if tables don't exist
    initializeDatabase();
  }
});

// Function to initialize database
function initializeDatabase() {
  console.log('Initializing database...');
  
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

  // Import sample data if tables are empty
  db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
    if (err) {
      console.error('Error checking items count:', err);
    } else if (row.count === 0) {
      console.log('Importing sample data...');
      importSampleData();
    }
  });
}

// Function to import sample data
function importSampleData() {
  try {
    const sampleData = require('./data.json');
    
    // Insert items
    const insertItem = db.prepare('INSERT OR IGNORE INTO items (id, name, information, location) VALUES (?, ?, ?, ?)');
    sampleData.items.forEach(item => {
      insertItem.run(item.id, item.name, item.information, item.location);
    });
    insertItem.finalize();
    console.log(`Imported ${sampleData.items.length} items`);

    // Insert serial numbers
    const insertSerial = db.prepare('INSERT OR IGNORE INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added) VALUES (?, ?, ?, ?, ?, ?)');
    sampleData.serialNumbers.forEach(serial => {
      const dateAdded = serial.dateAdded ? new Date(serial.dateAdded).toISOString() : new Date().toISOString();
      insertSerial.run(serial.id, serial.itemId, serial.serialNumber, serial.specs, serial.status, dateAdded);
    });
    insertSerial.finalize();
    console.log(`Imported ${sampleData.serialNumbers.length} serial numbers`);
    
    console.log('Sample data import completed!');
  } catch (err) {
    console.error('Error importing sample data:', err);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to run database queries
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

const runQuerySingle = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const runQueryInsert = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
};

// --- INVENTORY ITEMS CRUD ---

// List all items
app.get('/items', async (req, res) => {
  try {
    const items = await runQuery('SELECT * FROM items ORDER BY created_at DESC');
    res.json(items);
  } catch (err) {
    console.error('Error fetching items:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single item
app.get('/items/:id', async (req, res) => {
  try {
    const item = await runQuerySingle('SELECT * FROM items WHERE id = ?', [req.params.id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    console.error('Error fetching item:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add new item
app.post('/items', async (req, res) => {
  const { name, information, location } = req.body;
  
  if (!name || !location) {
    return res.status(400).json({ error: 'Name and location are required' });
  }

  try {
    const id = uuidv4();
    const result = await runQueryInsert(
      'INSERT INTO items (id, name, information, location) VALUES (?, ?, ?, ?)',
      [id, name, information, location]
    );
    
    const newItem = await runQuerySingle('SELECT * FROM items WHERE id = ?', [id]);
    res.status(201).json(newItem);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update item
app.put('/items/:id', async (req, res) => {
  const { name, information, location } = req.body;
  
  if (!name || !location) {
    return res.status(400).json({ error: 'Name and location are required' });
  }

  try {
    const result = await runQueryInsert(
      'UPDATE items SET name = ?, information = ?, location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, information, location, req.params.id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const updatedItem = await runQuerySingle('SELECT * FROM items WHERE id = ?', [req.params.id]);
    res.json(updatedItem);
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete item
app.delete('/items/:id', async (req, res) => {
  try {
    // First delete related inventory codes
    await runQueryInsert('DELETE FROM inventory_codes WHERE item_id = ?', [req.params.id]);
    
    // Then delete the item
    const result = await runQueryInsert('DELETE FROM items WHERE id = ?', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- SERIAL NUMBERS CRUD ---

// List all serial numbers
app.get('/serial-numbers', async (req, res) => {
  try {
    const serialNumbers = await runQuery(`
      SELECT ic.*, i.name as item_name, i.location 
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      ORDER BY ic.date_added DESC
    `);
    res.json(serialNumbers);
  } catch (err) {
    console.error('Error fetching serial numbers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get serial number by id
app.get('/serial-numbers/:id', async (req, res) => {
  try {
    const serialNumber = await runQuerySingle(`
      SELECT ic.*, i.name as item_name, i.location 
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      WHERE ic.id = ?
    `, [req.params.id]);
    
    if (!serialNumber) {
      return res.status(404).json({ error: 'Serial number not found' });
    }
    
    res.json(serialNumber);
  } catch (err) {
    console.error('Error fetching serial number:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add serial number
app.post('/serial-numbers', async (req, res) => {
  const { itemId, serialNumber, specs, status } = req.body;
  
  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required' });
  }

  try {
    // Check if item exists
    const item = await runQuerySingle('SELECT * FROM items WHERE id = ?', [itemId]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const id = uuidv4();
    const result = await runQueryInsert(
      'INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status) VALUES (?, ?, ?, ?, ?)',
      [id, itemId, serialNumber || '', specs || '', status || 'good']
    );
    
    const newSerialNumber = await runQuerySingle(`
      SELECT ic.*, i.name as item_name, i.location 
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      WHERE ic.id = ?
    `, [id]);
    
    res.status(201).json(newSerialNumber);
  } catch (err) {
    console.error('Error creating serial number:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update serial number
app.put('/serial-numbers/:id', async (req, res) => {
  const { serialNumber, specs, status } = req.body;

  try {
    const result = await runQueryInsert(
      'UPDATE inventory_codes SET kode_inventaris = ?, spesifikasi = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [serialNumber || '', specs || '', status || 'good', req.params.id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Serial number not found' });
    }
    
    const updatedSerialNumber = await runQuerySingle(`
      SELECT ic.*, i.name as item_name, i.location 
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      WHERE ic.id = ?
    `, [req.params.id]);
    
    res.json(updatedSerialNumber);
  } catch (err) {
    console.error('Error updating serial number:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete serial number
app.delete('/serial-numbers/:id', async (req, res) => {
  try {
    const result = await runQueryInsert('DELETE FROM inventory_codes WHERE id = ?', [req.params.id]);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Serial number not found' });
    }
    
    res.json({ message: 'Serial number deleted successfully' });
  } catch (err) {
    console.error('Error deleting serial number:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get items with their serial numbers count
app.get('/items-with-counts', async (req, res) => {
  try {
    const items = await runQuery(`
      SELECT i.*, COUNT(ic.id) as serial_count 
      FROM items i 
      LEFT JOIN inventory_codes ic ON i.id = ic.item_id 
      GROUP BY i.id 
      ORDER BY i.created_at DESC
    `);
    res.json(items);
  } catch (err) {
    console.error('Error fetching items with counts:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'SQLite',
    version: '1.0.0'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});