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
// List all items with serial count
app.get('/items', async (req, res) => {
  try {
    const items = await runQuery(`
      SELECT 
        i.*, 
        COUNT(ic.id) AS jumlah,
        COUNT(CASE WHEN ic.status = 'good' THEN 1 END) AS baik,
        COUNT(CASE WHEN ic.status = 'broken' THEN 1 END) AS rusak
      FROM items i
      LEFT JOIN inventory_codes ic ON ic.item_id = i.id
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `);
    res.json(items);
  } catch (err) {
    console.error('Error fetching items with counts:', err);
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

// Add new item
app.post('/items', async (req, res) => {
  let client;
  
  try {
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    
    // Validate the request body exists
    if (!req.body) {
      console.log('No request body received');
      return res.status(400).json({ error: 'Request body is required' });
    }
    
    const { name, information, location, quantity } = req.body;
    
    // Detailed validation logging
    console.log('Parsed values:', {
      name: name || 'undefined',
      information: information || 'undefined',
      location: location || 'undefined',
      quantity: quantity || 'undefined'
    });
    
    if (!name || !location) {
      console.log('Validation failed:', { name, location });
      return res.status(400).json({ 
        error: 'Name and location are required',
        receivedValues: { name, location }
      });
    }

    // Connect to database
    client = await pool.connect();
    console.log('Database connected successfully');
    
    await client.query('BEGIN');
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    console.log('Inserting new item:', { id, name, information, location, timestamp });
    
    // Insert the item with explicit timestamps
    await client.query(
      'INSERT INTO items (id, name, information, location) VALUES ($1, $2, $3, $4)',
      [id, name, information || '', location]
    );
    
    // If quantity is specified, create serial numbers
    if (quantity && quantity > 0) {
      console.log(`Creating ${quantity} serial numbers for item ${id}`);
      for (let i = 0; i < quantity; i++) {
        const serialId = uuidv4();
        await client.query(
          'INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status) VALUES ($1, $2, $3, $4, $5)',
          [serialId, id, '', '', 'good']
        );
      }
    }
    
    // Get the created item with its serial numbers
    const itemResult = await client.query('SELECT * FROM items WHERE id = $1', [id]);
    
    if (!itemResult.rows[0]) {
      await client.query('ROLLBACK');
      throw new Error('Failed to create item');
    }
    
    const newItem = itemResult.rows[0];
    let serialNumbers = [];
    
    // If serial numbers were created, fetch them
    if (quantity && quantity > 0) {
      const serialsResult = await client.query(`
        SELECT ic.*, i.name as item_name, i.location 
        FROM inventory_codes ic 
        LEFT JOIN items i ON ic.item_id = i.id 
        WHERE ic.item_id = $1
        ORDER BY ic.created_at ASC
      `, [id]);
      
      serialNumbers = serialsResult.rows;
      
      if (serialNumbers.length !== quantity) {
        await client.query('ROLLBACK');
        throw new Error('Failed to create all serial numbers');
      }
    }
    
    await client.query('COMMIT');
    
    console.log('Item and serial numbers created successfully:', {
      item: newItem,
      serialNumbers: serialNumbers
    });
    
    res.status(201).json({
      ...newItem,
      serialNumbers,
      success: true,
      message: 'Item created successfully'
    });
  } catch (err) {
    console.error('Detailed error:', {
      message: err.message,
      stack: err.stack,
      detail: err.detail,
      hint: err.hint,
      code: err.code,
      where: err.where,
      position: err.position,
      file: err.file,
      line: err.line
    });
    
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('Transaction rolled back successfully');
      } catch (rollbackErr) {
        console.error('Error during rollback:', {
          message: rollbackErr.message,
          stack: rollbackErr.stack
        });
      }
    }
    
    res.status(500).json({ 
      error: err.message,
      detail: err.detail,
      hint: err.hint,
      code: err.code
    });
  } finally {
    if (client) {
      try {
        await client.release();
      } catch (releaseErr) {
        console.error('Error releasing client:', releaseErr);
      }
    }
  }
});

// Update item
app.put('/items/:id', async (req, res) => {
  const { name, information, location } = req.body;
  
  if (!name || !location) {
    return res.status(400).json({ error: 'Name and location are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // First check if the item exists
    const itemExists = await client.query('SELECT id FROM items WHERE id = $1', [req.params.id]);
    if (itemExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    await client.query(
      'UPDATE items SET name = $1, information = $2, location = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [name, information, location, req.params.id]
    );
    
    const result = await client.query('SELECT * FROM items WHERE id = $1', [req.params.id]);
    const updatedItem = result.rows[0];
    
    await client.query('COMMIT');
    res.json({ ...updatedItem, success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating item:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Delete item
app.delete('/items/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // First check if the item exists
    const itemExists = await client.query('SELECT id FROM items WHERE id = $1', [req.params.id]);
    if (itemExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    // Delete related inventory codes
    await client.query('DELETE FROM inventory_codes WHERE item_id = $1', [req.params.id]);
    
    // Then delete the item
    const result = await client.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    
    await client.query('COMMIT');
    res.json({ message: 'Item deleted successfully', success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting item:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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

// Add serial number
app.post('/serial-numbers', async (req, res) => {
  console.log('Received serial number request:', req.body);
  
  const { itemId, serialNumber, specs, status, dateAdded } = req.body;
  
  if (!itemId) {
    console.log('Missing itemId in request');
    return res.status(400).json({ 
      error: 'Item ID is required',
      receivedData: req.body
    });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Check if item exists
    const itemResult = await client.query('SELECT * FROM items WHERE id = $1', [itemId]);
    if (itemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      console.log('Item not found:', itemId);
      return res.status(404).json({ error: 'Item not found', itemId });
    }

    const id = uuidv4();
    console.log('Creating serial number:', { id, itemId, serialNumber, specs, status, dateAdded });

    // Insert new serial number with proper date handling
    await client.query(
      'INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        id,
        itemId,
        serialNumber || '',
        specs || '',
        status || 'good',
        dateAdded ? new Date(dateAdded).toISOString() : new Date().toISOString()
      ]
    );
    
    // Get the newly created serial number with item details
    const result = await client.query(`
      SELECT 
        ic.*,
        i.name as item_name,
        i.location,
        i.information as item_information
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      WHERE ic.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Failed to retrieve created serial number');
    }

    const newSerialNumber = result.rows[0];
    
    await client.query('COMMIT');
    console.log('Serial number created successfully:', newSerialNumber);
    
    res.status(201).json({
      ...newSerialNumber,
      success: true,
      message: 'Serial number created successfully'
    });
  } catch (err) {
    console.error('Detailed serial number error:', err);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Error during rollback:', rollbackErr);
      }
    }
    res.status(500).json({ 
      error: err.message,
      detail: err.detail,
      hint: err.hint,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (client) {
      try {
        await client.release();
      } catch (releaseErr) {
        console.error('Error releasing client:', releaseErr);
      }
    }
  }
});

// Update serial number
app.put('/serial-numbers/:id', async (req, res) => {
  const { serialNumber, specs, status } = req.body;

  try {
    const result = await runQueryInsert(
      'UPDATE inventory_codes SET kode_inventaris = $1, spesifikasi = $2, status = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [serialNumber || '', specs || '', status || 'good', req.params.id]
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Serial number not found' });
    }
    
    const updatedSerialNumber = await runQuerySingle(`
      SELECT ic.*, i.name as item_name, i.location 
      FROM inventory_codes ic 
      LEFT JOIN items i ON ic.item_id = i.id 
      WHERE ic.id = $1
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
    const result = await runQueryInsert('DELETE FROM inventory_codes WHERE id = $1', [req.params.id]);
    
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