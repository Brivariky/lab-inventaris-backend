const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

const DATA_FILE = './data.json';

// Helper: baca/tulis data
function readData() {
  if (!fs.existsSync(DATA_FILE)) return { items: [], serialNumbers: [] };
  return JSON.parse(fs.readFileSync(DATA_FILE));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET semua barang
app.get('/items', (req, res) => {
  const data = readData();
  res.json(data.items);
});

// POST tambah barang
app.post('/items', (req, res) => {
  const data = readData();
  const newItem = { ...req.body, id: Date.now().toString() };
  data.items.push(newItem);
  writeData(data);
  res.status(201).json(newItem);
});

// GET semua serial numbers
app.get('/serial-numbers', (req, res) => {
  const data = readData();
  res.json(data.serialNumbers || []);
});

// POST tambah serial number
app.post('/serial-numbers', (req, res) => {
  const data = readData();
  const newSerial = { ...req.body, id: Date.now().toString() };
  data.serialNumbers.push(newSerial);
  writeData(data);
  res.status(201).json(newSerial);
});

// PUT update serial number
app.put('/serial-numbers/:id', (req, res) => {
  const data = readData();
  const idx = data.serialNumbers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Serial number not found' });
  data.serialNumbers[idx] = { ...data.serialNumbers[idx], ...req.body };
  writeData(data);
  res.json(data.serialNumbers[idx]);
});

// DELETE serial number
app.delete('/serial-numbers/:id', (req, res) => {
  const data = readData();
  const idx = data.serialNumbers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Serial number not found' });
  const deleted = data.serialNumbers.splice(idx, 1);
  writeData(data);
  res.json(deleted[0]);
});

// PUT update barang
app.put('/items/:id', (req, res) => {
  const data = readData();
  const idx = data.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  data.items[idx] = { ...data.items[idx], ...req.body };
  writeData(data);
  res.json(data.items[idx]);
});

// DELETE barang
app.delete('/items/:id', (req, res) => {
  const data = readData();
  const idx = data.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  const deleted = data.items.splice(idx, 1);
  // Hapus juga serialNumbers yang terkait item ini
  data.serialNumbers = data.serialNumbers.filter(s => s.itemId !== req.params.id);
  writeData(data);
  res.json(deleted[0]);
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));