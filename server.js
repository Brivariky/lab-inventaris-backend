require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = process.env.PORT || 3000;

// ======= Database Setup =======
if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL in environment variables');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// ======= Middleware =======
app.use(cors({
  origin: 'https://silabti.vercel.app',
  credentials: true
}));
app.use(express.json());

// ======= Utility Functions =======
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
  const result = await runQuery(sql, params);
  return result[0];
};

// ======= Routes =======

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    database: 'PostgreSQL',
    timestamp: new Date().toISOString()
  });
});

// Get all items
app.get('/items', async (req, res) => {
  try {
    const items = await runQuery('SELECT * FROM items ORDER BY created_at DESC');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create item with optional serials
app.post('/items', async (req, res) => {
  const { name, information, location, quantity } = req.body;
  if (!name || !location) return res.status(400).json({ error: 'Name and location are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = uuidv4();

    await client.query(
      `INSERT INTO items (id, name, information, location) VALUES ($1, $2, $3, $4)`,
      [id, name, information || '', location]
    );

    const createdSerials = [];
    if (quantity && quantity > 0) {
      for (let i = 0; i < quantity; i++) {
        const serialId = uuidv4();
        await client.query(
          `INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added)
           VALUES ($1, $2, '', '', 'good', $3)`,
          [serialId, id, new Date().toISOString()]
        );
        createdSerials.push(serialId);
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, id, createdSerials });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get item by ID
app.get('/items/:id', async (req, res) => {
  try {
    const item = await runQuerySingle('SELECT * FROM items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update item
app.put('/items/:id', async (req, res) => {
  const { name, information, location } = req.body;
  if (!name || !location) return res.status(400).json({ error: 'Name and location are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await runQuerySingle('SELECT id FROM items WHERE id = $1', [req.params.id]);
    if (!check) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    await client.query(
      `UPDATE items SET name = $1, information = $2, location = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [name, information, location, req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
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
    const check = await runQuerySingle('SELECT id FROM items WHERE id = $1', [req.params.id]);
    if (!check) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }

    await client.query('DELETE FROM inventory_codes WHERE item_id = $1', [req.params.id]);
    await client.query('DELETE FROM items WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get serial numbers
app.get('/serial-numbers', async (req, res) => {
  try {
    const serials = await runQuery(`
      SELECT ic.*, i.name AS item_name, i.location
      FROM inventory_codes ic
      LEFT JOIN items i ON ic.item_id = i.id
      ORDER BY ic.date_added DESC
    `);
    res.json(serials);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create serial number
app.post('/serial-numbers', async (req, res) => {
  const { itemId, serialNumber, specs, status, dateAdded } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId is required' });

  const client = await pool.connect();
  try {
    const id = uuidv4();
    await client.query(
      `INSERT INTO inventory_codes (id, item_id, kode_inventaris, spesifikasi, status, date_added)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        itemId,
        serialNumber || '',
        specs || '',
        status || 'good',
        dateAdded ? new Date(dateAdded).toISOString() : new Date().toISOString()
      ]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ======= Initialize Database (Optional) =======
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        information TEXT,
        location TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

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
      );
    `);

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
  } finally {
    client.release();
  }
}

// ======= Start Server =======
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
});

// ======= Graceful Shutdown =======
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await pool.end();
  process.exit(0);
});
