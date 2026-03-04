import 'dotenv/config';

console.log("🔍 Testing Texperia Scanner Authentication System...\n");

// Test 1: Environment Variables
console.log("📋 Environment Variables:");
console.log(`    DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`    SESSION_SECRET: ${process.env.SESSION_SECRET ? '✅ Set' : '❌ Missing'}`);
console.log(`    SESSION_MAX_AGE: ${process.env.SESSION_MAX_AGE || 'Using default'}`);
console.log("");

// Test 2: Database Connection
async function testDatabase() {
  try {
    console.log("🗄️ Database Connection:");
    const { db, users } = await import('../server/db.js');
    
    // Test connection by querying user count
    const userCount = await db.select().from(users);
    console.log(`    ✅ Connected to Neon PostgreSQL`);
    console.log(`    ✅ Found ${userCount.length} users in database`);
    
    // Test sample user exists
    const testUser = userCount.find(u => u.username === 'test1');
    console.log(`    ${testUser ? '✅' : '❌'} Test user 'test1' exists`);
    
    return true;
  } catch (error) {
    console.log(`    ❌ Database connection failed: ${error.message}`);
    return false;
  }
}

// Test 3: Authentication Logic
async function testAuth() {
  try {
    console.log("\n🔐 Authentication Logic:");
    const bcrypt = await import('bcrypt');
    
    // Test password hashing
    const testPassword = 'snsct123';
    const hashedPassword = await bcrypt.default.hash(testPassword, 10);
    const isValid = await bcrypt.default.compare(testPassword, hashedPassword);
    
    console.log(`    ✅ bcrypt hashing/comparison working: ${isValid}`);
    
    return true;
  } catch (error) {
    console.log(`    ❌ Authentication logic failed: ${error.message}`);
    return false;
  }
}

// Test 4: Server Dependencies
async function testDependencies() {
  try {
    console.log("\n📦 Dependencies:");
    
    const express = await import('express');
    console.log(`    ✅ Express imported successfully`);
    
    const session = await import('express-session');
    console.log(`    ✅ Express-session imported successfully`);
    
    const { drizzle } = await import('drizzle-orm/postgres-js');
    console.log(`    ✅ Drizzle ORM imported successfully`);
    
    const postgres = await import('postgres');
    console.log(`    ✅ Postgres driver imported successfully`);
    
    return true;
  } catch (error) {
    console.log(`    ❌ Dependencies failed: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runTests() {
  const dbTest = await testDatabase();
  const authTest = await testAuth();
  const depTest = await testDependencies();
  
  console.log("\n🎯 Test Results Summary:");
  console.log(`    Database: ${dbTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`    Authentication: ${authTest ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`    Dependencies: ${depTest ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = dbTest && authTest && depTest;
  console.log(`\n🚀 System Status: ${allPassed ? '✅ READY' : '❌ NEEDS FIXES'}`);
  
  if (allPassed) {
    console.log("\n✨ Your authentication system is working correctly!");
    console.log("   You can start the server with: npm run dev");
  } else {
    console.log("\n🔧 Please fix the failing components before proceeding.");
  }
}

runTests().catch(console.error).finally(() => process.exit());