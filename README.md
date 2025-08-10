# Lab Inventory Backend

A Node.js backend for managing laboratory inventory with SQLite database.

## Features

- ✅ postgreSQL database (no external database setup required)
- ✅ CRUD operations for inventory items
- ✅ CRUD operations for serial numbers
- ✅ Automatic ID generation
- ✅ Data persistence
- ✅ CORS enabled for frontend integration
- ✅ Health check endpoint
- ✅ Sample data import

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Database

```bash
npm run init-db
```

This will:
- Create the SQLite database file (`inventory.db`)
- Create the required tables
- Import sample data from `data.json`

### 3. Start the Server

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
- `GET /health` - Check server status

### Items Management
- `GET /items` - Get all items
- `GET /items/:id` - Get specific item
- `POST /items` - Create new item
- `PUT /items/:id` - Update item
- `DELETE /items/:id` - Delete item

### Serial Numbers Management
- `GET /serial-numbers` - Get all serial numbers
- `GET /serial-numbers/:id` - Get specific serial number
- `POST /serial-numbers` - Create new serial number
- `PUT /serial-numbers/:id` - Update serial number
- `DELETE /serial-numbers/:id` - Delete serial number

### Additional Endpoints
- `GET /items-with-counts` - Get items with serial number counts

## Database Schema

### Items Table
```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  information TEXT,
  location TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Inventory Codes Table
```sql
CREATE TABLE inventory_codes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  kode_inventaris TEXT,
  spesifikasi TEXT,
  status TEXT DEFAULT 'good',
  date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
);
```

## API Request Examples

### Create Item
```bash
curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PC Desktop",
    "information": "Lenovo ThinkCentre",
    "location": "Lab Komputer 1"
  }'
```

### Create Serial Number
```bash
curl -X POST http://localhost:3000/serial-numbers \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "item-id-here",
    "serialNumber": "SN123456789",
    "specs": "Intel i5, 8GB RAM, 256GB SSD",
    "status": "good"
  }'
```

## Deployment

### Local Development
1. Clone the repository
2. Run `npm install`
3. Run `npm run init-db`
4. Run `npm run dev`

### OnRender Deployment
1. Connect your GitHub repository to OnRender
2. Set build command: `npm install`
3. Set start command: `npm start`
4. The database will be created automatically on first run

### Environment Variables
- `PORT` - Server port (default: 3000)

## File Structure

```
lab-inventaris-backend/
├── server.js          # Main server file
├── init-database.js   # Database initialization
├── data.json          # Sample data
├── inventory.db       # SQLite database (created automatically)
├── package.json       # Dependencies and scripts
└── README.md         # This file
```

## Troubleshooting

### Database Issues
- If you get database errors, delete `inventory.db` and run `npm run init-db` again
- Make sure you have write permissions in the directory

### Port Issues
- If port 3000 is in use, set `PORT` environment variable to another port
- Example: `PORT=3001 npm start`

### CORS Issues
- The server has CORS enabled for all origins
- If you need specific origins, modify the CORS configuration in `server.js`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC License 