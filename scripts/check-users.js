import 'dotenv/config';
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../shared/schema.js";

async function checkDatabaseUsers() {
  console.log("🔍 Checking Neon Database Users...\n");

  try {
    // Direct database connection
    const client = postgres(process.env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    const db = drizzle(client, { schema: { users } });
    
    // Get all users from database
    const allUsers = await db.select().from(users);
    
    console.log(`📊 Total users found: ${allUsers.length}`);
    
    // Check test users (test1 to test50)
    const testUsers = [];
    const missingTestUsers = [];
    
    for (let i = 1; i <= 50; i++) {
      const username = `test${i}`;
      const user = allUsers.find(u => u.username === username);
      if (user) {
        testUsers.push(username);
      } else {
        missingTestUsers.push(username);
      }
    }
    
    // Check admin users (admin1 to admin50)
    const adminUsers = [];
    const missingAdminUsers = [];
    
    for (let i = 1; i <= 50; i++) {
      const username = `admin${i}`;
      const user = allUsers.find(u => u.username === username);
      if (user) {
        adminUsers.push(username);
      } else {
        missingAdminUsers.push(username);
      }
    }
    
    console.log(`\n👥 Test Users Status:`);
    console.log(`   ✅ Found: ${testUsers.length}/50`);
    if (missingTestUsers.length > 0) {
      console.log(`   ❌ Missing: ${missingTestUsers.length} users`);
      console.log(`   Missing users: ${missingTestUsers.join(', ')}`);
    }
    
    console.log(`\n👑 Admin Users Status:`);
    console.log(`   ✅ Found: ${adminUsers.length}/50`);
    if (missingAdminUsers.length > 0) {
      console.log(`   ❌ Missing: ${missingAdminUsers.length} users`);
      console.log(`   Missing users: ${missingAdminUsers.join(', ')}`);
    }
    
    console.log(`\n📋 Summary:`);
    console.log(`   Total Expected: 100`);
    console.log(`   Total Found: ${allUsers.length}`);
    console.log(`   Test Users: ${testUsers.length}/50`);
    console.log(`   Admin Users: ${adminUsers.length}/50`);
    console.log(`   Missing: ${missingTestUsers.length + missingAdminUsers.length}`);
    
    if (missingTestUsers.length > 0 || missingAdminUsers.length > 0) {
      console.log(`\n⚠️  Some users are missing and need to be created!`);
      return false;
    } else {
      console.log(`\n✅ All 100 users are present in the database!`);
      
      // Test a sample user's password
      console.log(`\n🔐 Testing sample user password...`);
      const bcrypt = await import('bcrypt');
      const sampleUser = allUsers.find(u => u.username === 'test1');
      if (sampleUser) {
        const isValidPassword = await bcrypt.default.compare('snsct123', sampleUser.password);
        console.log(`   Password test for 'test1': ${isValidPassword ? '✅ Valid' : '❌ Invalid'}`);
      }
      
      return true;
    }
    
  } catch (error) {
    console.log(`❌ Error checking database: ${error.message}`);
    return false;
  }
}

checkDatabaseUsers();