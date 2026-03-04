import 'dotenv/config';
import bcrypt from "bcrypt";
import { db, users } from "./db";
import { eq } from "drizzle-orm";

const DEFAULT_PASSWORD = "snsct123";
const SALT_ROUNDS = 10;

async function seedUsers() {
  try {
    console.log("Starting user seeding process...");
    
    // Hash the password once since all users have the same password
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);
    
    const usersToCreate = [];
    
    // Create test users (test1 to test50)
    for (let i = 1; i <= 50; i++) {
      usersToCreate.push({
        username: `test${i}`,
        password: hashedPassword
      });
    }
    
    // Create admin users (admin1 to admin50)
    for (let i = 1; i <= 50; i++) {
      usersToCreate.push({
        username: `admin${i}`,
        password: hashedPassword
      });
    }
    
    console.log(`Prepared ${usersToCreate.length} users for insertion`);
    
    // Insert users in batches to avoid overwhelming the database
    const batchSize = 10;
    let insertedCount = 0;
    
    for (let i = 0; i < usersToCreate.length; i += batchSize) {
      const batch = usersToCreate.slice(i, i + batchSize);
      
      for (const user of batch) {
        try {
          // Check if user already exists
          const existingUser = await db
            .select()
            .from(users)
            .where(eq(users.username, user.username))
            .limit(1);
            
          if (existingUser.length === 0) {
            await db.insert(users).values(user);
            insertedCount++;
            console.log(`✓ Created user: ${user.username}`);
          } else {
            console.log(`- User already exists: ${user.username}`);
          }
        } catch (error: any) {
          if (error.code === '23505') { // Unique constraint violation
            console.log(`- User already exists: ${user.username}`);
          } else {
            console.error(`Error creating user ${user.username}:`, error.message);
          }
        }
      }
    }
    
    console.log(`\nSeeding completed!`);
    console.log(`Total users created: ${insertedCount}`);
    console.log(`Password for all users: ${DEFAULT_PASSWORD}`);
    
    // Verify total user count
    const totalUsers = await db.select().from(users);
    console.log(`Total users in database: ${totalUsers.length}`);
    
  } catch (error) {
    console.error("Error during seeding:", error);
    throw error;
  }
}

// Export for use in other scripts
export { seedUsers };

// Run seeding directly
seedUsers()
  .then(() => {
    console.log("Seeding process completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seeding process failed:", error);
    process.exit(1);
  });