/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';

interface User {
  id: number;
  name: string;
  email: string;
  created_at: number; // JS timestamp as REAL
  last_login: number; // JS timestamp as REAL
  profile_updated: number; // JS timestamp as REAL
}

interface Order {
  id: number;
  user_id: number;
  product_name: string;
  amount: number;
  order_date: number; // JS timestamp as REAL
  shipped_date?: number; // JS timestamp as REAL (nullable)
  delivered_date?: number; // JS timestamp as REAL (nullable)
}

interface Event {
  id: number;
  name: string;
  description: string;
  start_time: number; // JS timestamp as REAL
  end_time: number; // JS timestamp as REAL
  created_at: number; // JS timestamp as REAL
}

// Generate sample data with JavaScript timestamps
function generateSampleData() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;
  const oneMonth = 30 * oneDay;
  const oneYear = 365 * oneDay;

  // Generate users with various timestamps
  const users: User[] = [
    {
      id: 1,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      created_at: now - oneYear + Math.random() * oneMonth, // Random within last year
      last_login: now - Math.random() * oneWeek, // Random within last week
      profile_updated: now - Math.random() * oneMonth // Random within last month
    },
    {
      id: 2,
      name: 'Bob Smith',
      email: 'bob@example.com',
      created_at: now - 6 * oneMonth + Math.random() * oneMonth,
      last_login: now - Math.random() * 3 * oneDay,
      profile_updated: now - Math.random() * 2 * oneWeek
    },
    {
      id: 3,
      name: 'Carol Davis',
      email: 'carol@example.com',
      created_at: now - 2 * oneYear + Math.random() * oneMonth,
      last_login: now - Math.random() * oneDay,
      profile_updated: now - Math.random() * 3 * oneDay
    },
    {
      id: 4,
      name: 'David Wilson',
      email: 'david@example.com',
      created_at: now - 3 * oneMonth + Math.random() * oneWeek,
      last_login: now - Math.random() * 12 * 60 * 60 * 1000, // Within last 12 hours
      profile_updated: now - Math.random() * oneWeek
    },
    {
      id: 5,
      name: 'Eve Brown',
      email: 'eve@example.com',
      created_at: now - 8 * oneMonth + Math.random() * oneMonth,
      last_login: now - Math.random() * 2 * oneDay,
      profile_updated: now - Math.random() * 4 * oneDay
    }
  ];

  // Generate orders with timestamps
  const orders: Order[] = [
    {
      id: 1,
      user_id: 1,
      product_name: 'Laptop Pro',
      amount: 1299.99,
      order_date: now - 2 * oneWeek + Math.random() * oneDay,
      shipped_date: now - oneWeek + Math.random() * oneDay,
      delivered_date: now - 3 * oneDay + Math.random() * oneDay
    },
    {
      id: 2,
      user_id: 2,
      product_name: 'Wireless Mouse',
      amount: 29.99,
      order_date: now - 5 * oneDay + Math.random() * oneDay,
      shipped_date: now - 3 * oneDay + Math.random() * oneDay,
      delivered_date: now - oneDay + Math.random() * 12 * 60 * 60 * 1000
    },
    {
      id: 3,
      user_id: 1,
      product_name: 'USB-C Cable',
      amount: 19.99,
      order_date: now - 3 * oneDay + Math.random() * oneDay,
      shipped_date: now - oneDay + Math.random() * oneDay,
      delivered_date: undefined // Not delivered yet
    },
    {
      id: 4,
      user_id: 3,
      product_name: 'Mechanical Keyboard',
      amount: 149.99,
      order_date: now - 10 * oneDay + Math.random() * oneDay,
      shipped_date: now - 7 * oneDay + Math.random() * oneDay,
      delivered_date: now - 2 * oneDay + Math.random() * oneDay
    },
    {
      id: 5,
      user_id: 4,
      product_name: 'Monitor 27"',
      amount: 399.99,
      order_date: now - oneDay + Math.random() * 12 * 60 * 60 * 1000,
      shipped_date: undefined, // Not shipped yet
      delivered_date: undefined
    }
  ];

  // Generate events with timestamps
  const events: Event[] = [
    {
      id: 1,
      name: 'Product Launch',
      description: 'Launch of new product line',
      start_time: now + 2 * oneWeek + Math.random() * oneDay, // Future event
      end_time: now + 2 * oneWeek + 4 * 60 * 60 * 1000 + Math.random() * oneDay, // 4 hours later
      created_at: now - oneMonth + Math.random() * oneWeek
    },
    {
      id: 2,
      name: 'Team Meeting',
      description: 'Weekly team standup',
      start_time: now + 2 * oneDay + 9 * 60 * 60 * 1000, // Tomorrow at 9 AM
      end_time: now + 2 * oneDay + 10 * 60 * 60 * 1000, // Tomorrow at 10 AM
      created_at: now - oneWeek + Math.random() * oneDay
    },
    {
      id: 3,
      name: 'Conference',
      description: 'Annual tech conference',
      start_time: now + 3 * oneMonth + Math.random() * oneWeek,
      end_time: now + 3 * oneMonth + 3 * oneDay + Math.random() * oneWeek,
      created_at: now - 2 * oneMonth + Math.random() * oneWeek
    }
  ];

  return { users, orders, events };
}

async function createSampleDatabase() {
  const dbPath = path.join(__dirname, '..', 'exampleFiles', 'sample_timestamps.db');
  
  // Remove existing database if it exists
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);

  try {
    console.log('Creating sample database with JavaScript timestamps as REAL values...');

    // Create users table
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME NOT NULL,
        last_login DATETIME NOT NULL,
        profile_updated DATETIME NOT NULL
      )
    `);

    // Create orders table
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        amount REAL NOT NULL,
        order_date DATETIME NOT NULL,
        shipped_date DATETIME,
        delivered_date DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create events table
    db.exec(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        created_at DATETIME NOT NULL
      )
    `);

    // Create a table with mixed timestamp formats for testing
    db.exec(`
      CREATE TABLE timestamp_test (
        id INTEGER PRIMARY KEY,
        js_timestamp REAL,
        unix_timestamp INTEGER,
        iso_string TEXT,
        description TEXT
      )
    `);

    // Generate and insert sample data
    const { users, orders, events } = generateSampleData();

    // Insert users
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, created_at, last_login, profile_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const user of users) {
      insertUser.run(user.id, user.name, user.email, user.created_at, user.last_login, user.profile_updated);
    }

    // Insert orders
    const insertOrder = db.prepare(`
      INSERT INTO orders (id, user_id, product_name, amount, order_date, shipped_date, delivered_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const order of orders) {
      insertOrder.run(order.id, order.user_id, order.product_name, order.amount, order.order_date, order.shipped_date || null, order.delivered_date || null);
    }

    // Insert events
    const insertEvent = db.prepare(`
      INSERT INTO events (id, name, description, start_time, end_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const event of events) {
      insertEvent.run(event.id, event.name, event.description, event.start_time, event.end_time, event.created_at);
    }

    // Insert mixed timestamp test data
    const now = Date.now();
    const testData = [
      {
        id: 1,
        js_timestamp: now,
        unix_timestamp: Math.floor(now / 1000),
        iso_string: new Date(now).toISOString(),
        description: 'Current timestamp in multiple formats'
      },
      {
        id: 2,
        js_timestamp: now - 86400000, // 1 day ago
        unix_timestamp: Math.floor((now - 86400000) / 1000),
        iso_string: new Date(now - 86400000).toISOString(),
        description: 'One day ago'
      },
      {
        id: 3,
        js_timestamp: now + 86400000, // 1 day from now
        unix_timestamp: Math.floor((now + 86400000) / 1000),
        iso_string: new Date(now + 86400000).toISOString(),
        description: 'One day from now'
      }
    ];

    const insertTest = db.prepare(`
      INSERT INTO timestamp_test (id, js_timestamp, unix_timestamp, iso_string, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const test of testData) {
      insertTest.run(test.id, test.js_timestamp, test.unix_timestamp, test.iso_string, test.description);
    }

    // Create some views to demonstrate timestamp usage
    db.exec(`
      CREATE VIEW recent_users AS
      SELECT 
        id,
        name,
        email,
        created_at,
        last_login,
        profile_updated,
        datetime(created_at/1000, 'unixepoch') as created_at_readable,
        datetime(last_login/1000, 'unixepoch') as last_login_readable,
        datetime(profile_updated/1000, 'unixepoch') as profile_updated_readable
      FROM users
      WHERE last_login > ${now - 7 * 24 * 60 * 60 * 1000}
    `);

    db.exec(`
      CREATE VIEW order_summary AS
      SELECT 
        o.id,
        u.name as customer_name,
        o.product_name,
        o.amount,
        o.order_date,
        o.shipped_date,
        o.delivered_date,
        datetime(o.order_date/1000, 'unixepoch') as order_date_readable,
        datetime(o.shipped_date/1000, 'unixepoch') as shipped_date_readable,
        datetime(o.delivered_date/1000, 'unixepoch') as delivered_date_readable,
        CASE 
          WHEN o.delivered_date IS NOT NULL THEN 'Delivered'
          WHEN o.shipped_date IS NOT NULL THEN 'Shipped'
          ELSE 'Processing'
        END as status
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `);

    console.log(`✅ Database created successfully at: ${dbPath}`);
    console.log(`📊 Created tables: users, orders, events, timestamp_test`);
    console.log(`👥 Inserted ${users.length} users`);
    console.log(`📦 Inserted ${orders.length} orders`);
    console.log(`📅 Inserted ${events.length} events`);
    console.log(`🧪 Inserted ${testData.length} timestamp test records`);
    console.log(`📋 Created views: recent_users, order_summary`);

    // Display some sample data
    console.log('\n📋 Sample data preview:');
    console.log('Users with JavaScript timestamps as REAL values:');
    const userSample = db.prepare("SELECT id, name, created_at, last_login FROM users LIMIT 3").all();
    console.log(userSample);

  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run the script
if (require.main === module) {
  createSampleDatabase()
    .then(() => {
      console.log('\n🎉 Sample database creation completed!');
      console.log('The database contains JavaScript timestamps stored as REAL values.');
      console.log('You can open this database in SQLite Viewer to see how timestamps are handled.');
    })
    .catch((error) => {
      console.error('Failed to create sample database:', error);
      process.exit(1);
    });
}

export { createSampleDatabase };
