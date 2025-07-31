require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://inventory_db_0i38_user:NyyWex9bKcOGwXDyLZnZXFZbU0q1T0A5@dpg-d25kuoqli9vc73feo5lg-a/inventory_db_0i38',
  ssl: {
    rejectUnauthorized: false
  }
});

// Add error handler for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Database connected successfully at:', res.rows[0].now);
  }
});

console.log('Initializing database...');

// Initialize database asynchronously
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        information TEXT,
        location TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Items table created successfully');

    // Create inventory_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_codes (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        kode_inventaris TEXT,
        spesifikasi TEXT,
        status TEXT DEFAULT 'good',
        date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
      )
    `);
    console.log('Inventory codes table created successfully');

    // Check if data exists and import if empty
    const result = await client.query('SELECT COUNT(*) as count FROM items');
    if (result.rows[0].count === '0') {
      console.log('Database is empty, importing sample data...');
      await importSampleData();
    } else {
      console.log(`Database has ${result.rows[0].count} items, skipping import`);
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
};

// Function to import sample data
async function importSampleData() {
  const client = await pool.connect();
  try {
    const sampleData = require('./data.json');
    
    // Insert items
    for (const item of sampleData.items) {
      await client.query(
        'INSERT INTO items (id, name, information, location) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
        [item.id, item.name, item.information, item.location]
      );
    }
    console.log(`Imported ${sampleData.items.length} items`);

    // Insert serial numbers
    for (const serial of sampleData.serialNumbers) {
      const dateAdded = serial.dateAdded ? new Date(serial.dateAdded).toISOString() : new Date().toISOString();
      await client.query(
        'INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
        [serial.id, serial.itemId, serial.serialNumber, serial.specs, serial.status, dateAdded]
      );
    }
    console.log(`Imported ${sampleData.serialNumbers.length} serial numbers`);
    
    console.log('Sample data import completed!');
  } catch (err) {
    console.error('Error importing sample data:', err);
  } finally {
    client.release();
  }
}

// Middleware
app.use(cors({
  origin: 'https://silabti.vercel.app',
  credentials: true
}));

// Enhanced JSON parsing middleware
app.use(express.json({
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch(e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, {
    body: req.body,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    }
  });
  next();
});

// Helper function to run database queries
const runQuery = async (sql, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
};

const runQuerySingle = async (sql, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows[0];
  } finally {
    client.release();
  }
};

const runQueryInsert = async (sql, params = []) => {
  const client = await pool.connect();
  try {
    console.log('Executing query:', {
      sql,
      params,
      timestamp: new Date().toISOString()
    });
    
    const result = await client.query(sql, params);
    
    if (!result) {
      console.error('Query returned no result');
      throw new Error('Query failed to execute');
    }
    
    console.log('Query result:', {
      rowCount: result.rowCount,
      command: result.command,
      timestamp: new Date().toISOString()
    });
    
    return { 
      changes: result.rowCount, 
      success: true,
      command: result.command
    };
  } catch (error) {
    console.error('Database query error:', {
      error: error.message,
      detail: error.detail,
      hint: error.hint,
      code: error.code,
      position: error.position,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
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
    const item = await runQuerySingle('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (err) {
    console.error('Error fetching item:', err);
    res.status(500).json({ error: err.message });
  }
});

// Note: POST, PUT, and DELETE endpoints have been removed

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
      WHERE ic.id = $1
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

// Note: POST, PUT, and DELETE endpoints for serial numbers have been removed

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

// Test database endpoint
app.get('/test-db', async (req, res) => {
  try {
    const itemsCount = await runQuerySingle('SELECT COUNT(*) as count FROM items');
    const serialsCount = await runQuerySingle('SELECT COUNT(*) as count FROM inventory_codes');
    
    res.json({
      status: 'Database OK',
      itemsCount: itemsCount.count,
      serialsCount: serialsCount.count,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      status: 'Database Error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  try {
    await pool.end();
    console.log('Database connection closed.');
  } catch (err) {
    console.error('Error closing database:', err.message);
  }
  process.exit(0);
});