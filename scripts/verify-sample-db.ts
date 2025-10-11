/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import * as path from 'path';

async function verifySampleDatabase() {
  const dbPath = path.join(__dirname, '..', 'exampleFiles', 'sample_timestamps.db');
  
  if (!Bun.file(dbPath).exists()) {
    console.error('Database file not found. Please run create-sample-db.ts first.');
    return;
  }

  const db = new Database(dbPath);

  try {
    console.log('🔍 Verifying sample database contents...\n');

    // Show table structure
    console.log('📋 Tables in database:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log(tables.map(t => `  - ${t.name}`).join('\n'));

    // Show views
    console.log('\n📊 Views in database:');
    const views = db.prepare("SELECT name FROM sqlite_master WHERE type='view'").all();
    console.log(views.map(v => `  - ${v.name}`).join('\n'));

    // Show users with timestamps
    console.log('\n👥 Users with JavaScript timestamps (REAL values):');
    const users = db.prepare(`
      SELECT 
        id, 
        name, 
        created_at, 
        last_login,
        datetime(created_at/1000, 'unixepoch') as created_at_readable,
        datetime(last_login/1000, 'unixepoch') as last_login_readable
      FROM users 
      ORDER BY id
    `).all();
    
    users.forEach(user => {
      console.log(`  ${user.id}. ${user.name}`);
      console.log(`     Created: ${user.created_at} (${user.created_at_readable})`);
      console.log(`     Last Login: ${user.last_login} (${user.last_login_readable})`);
    });

    // Show orders with timestamps
    console.log('\n📦 Orders with JavaScript timestamps (REAL values):');
    const orders = db.prepare(`
      SELECT 
        o.id,
        u.name as customer,
        o.product_name,
        o.amount,
        o.order_date,
        o.shipped_date,
        o.delivered_date,
        datetime(o.order_date/1000, 'unixepoch') as order_date_readable
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.id
    `).all();
    
    orders.forEach(order => {
      console.log(`  ${order.id}. ${order.customer} - ${order.product_name} ($${order.amount})`);
      console.log(`     Order Date: ${order.order_date} (${order.order_date_readable})`);
      if (order.shipped_date) {
        console.log(`     Shipped: ${order.shipped_date}`);
      }
      if (order.delivered_date) {
        console.log(`     Delivered: ${order.delivered_date}`);
      }
    });

    // Show timestamp test data
    console.log('\n🧪 Timestamp test data (mixed formats):');
    const testData = db.prepare(`
      SELECT 
        id,
        js_timestamp,
        unix_timestamp,
        iso_string,
        description,
        datetime(js_timestamp/1000, 'unixepoch') as js_readable
      FROM timestamp_test
      ORDER BY id
    `).all();
    
    testData.forEach(test => {
      console.log(`  ${test.id}. ${test.description}`);
      console.log(`     JS Timestamp (REAL): ${test.js_timestamp}`);
      console.log(`     Unix Timestamp (INT): ${test.unix_timestamp}`);
      console.log(`     ISO String: ${test.iso_string}`);
      console.log(`     JS Readable: ${test.js_readable}`);
    });

    // Show recent users view
    console.log('\n📊 Recent users view (last 7 days):');
    const recentUsers = db.prepare("SELECT * FROM recent_users").all();
    if (recentUsers.length > 0) {
      recentUsers.forEach(user => {
        console.log(`  ${user.name} - Last login: ${user.last_login_readable}`);
      });
    } else {
      console.log('  No recent users found');
    }

    // Show order summary view
    console.log('\n📊 Order summary view:');
    const orderSummary = db.prepare("SELECT * FROM order_summary ORDER BY id").all();
    orderSummary.forEach(order => {
      console.log(`  ${order.id}. ${order.customer_name} - ${order.product_name} (${order.status})`);
      console.log(`     Order: ${order.order_date_readable}`);
      if (order.shipped_date_readable) {
        console.log(`     Shipped: ${order.shipped_date_readable}`);
      }
      if (order.delivered_date_readable) {
        console.log(`     Delivered: ${order.delivered_date_readable}`);
      }
    });

    console.log('\n✅ Database verification completed!');
    console.log('💡 Notice how JavaScript timestamps are stored as REAL values (with decimal places)');
    console.log('💡 This allows for sub-millisecond precision in timestamp storage');

  } catch (error) {
    console.error('Error verifying database:', error);
    throw error;
  } finally {
    db.close();
  }
}

// Run the script
if (require.main === module) {
  verifySampleDatabase()
    .then(() => {
      console.log('\n🎉 Database verification completed!');
    })
    .catch((error) => {
      console.error('Failed to verify database:', error);
      process.exit(1);
    });
}

export { verifySampleDatabase };
