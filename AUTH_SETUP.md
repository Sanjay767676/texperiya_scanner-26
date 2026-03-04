# Authentication Setup for Texperia Scanner

This guide explains how to set up the user authentication system for the Texperia Scanner application.

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

1. **Set up PostgreSQL database** (if you haven't already):
   - Install PostgreSQL on your system
   - Create a database named `texperia_scanner`
   - Update the `DATABASE_URL` in your `.env` file

2. **Configure Environment Variables**:
   Update your `.env` file with your database connection string:
   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/texperia_scanner
   SESSION_SECRET=your-super-secure-secret-key-change-this-in-production
   ```

3. **Run Database Migrations**:
   ```bash
   npm run db:push
   ```

### 3. Seed User Database

After setting up the database, populate it with 100 test users:

```bash
npm run seed:users
```

This will create:
- **50 test users**: `test1`, `test2`, ..., `test50`
- **50 admin users**: `admin1`, `admin2`, ..., `admin50`
- **Password for all users**: `snsct123`

### 4. Start the Application

```bash
npm run dev
```

## Login Credentials

Once the setup is complete, you can log in with any of these accounts:

### Test Users
- **Usernames**: `test1`, `test2`, `test3`, ..., `test50`
- **Password**: `snsct123`

### Admin Users  
- **Usernames**: `admin1`, `admin2`, `admin3`, ..., `admin50`
- **Password**: `snsct123`

## Features

### 🔐 Authentication System
- **Secure Login**: Username/password authentication with bcrypt hashing
- **Session Management**: Express sessions with secure cookies
- **Auto-logout**: Sessions persist across browser sessions
- **Protected Routes**: Scanner API endpoints require authentication

### 🎨 User Interface
- **Modern Login Screen**: Clean, responsive design with Tailwind CSS
- **Password Visibility Toggle**: Eye icon to show/hide password
- **Loading States**: Visual feedback during login process
- **Error Handling**: Clear error messages for failed login attempts
- **User Information**: Username display in top-right corner when logged in

### 🏗️ Architecture
- **Frontend**: React with TypeScript, Tailwind CSS, Radix UI components
- **Backend**: Express.js with session middleware
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: bcrypt for password hashing, express-session for session management

### 🛡️ Security Features
- **Password Hashing**: All passwords stored as bcrypt hashes (salt rounds: 10)
- **Session Security**: HTTP-only cookies, secure session management
- **Protected API Routes**: All scanner endpoints require valid authentication
- **Input Validation**: Server-side validation of login credentials

## API Endpoints

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout  
- `GET /api/auth/me` - Get current user session

### Protected Scanner Endpoints
- `POST /api/scan` - Scanner functionality (requires authentication)
- `POST /api/lunch` - Lunch scanning (requires authentication)

## Troubleshooting

### Database Connection Issues
1. Ensure PostgreSQL is running
2. Verify database credentials in `.env` file
3. Check if the database `texperia_scanner` exists

### User Creation Issues
- If users already exist, the seeding script will skip them
- Check the console output for detailed seeding results
- Verify database connectivity before running seed script

### Login Issues
1. Ensure users have been seeded successfully
2. Check that the password is exactly `snsct123`
3. Verify session configuration in server setup

## Development Notes

- The authentication context (`useAuth`) manages user state across the application
- Login component automatically redirects to scanner after successful authentication
- The main App component shows login screen for unauthenticated users
- User session persists across browser refreshes
- Logout clears session and redirects to login screen

## File Structure

```
├── server/
│   ├── auth.ts           # Authentication routes and middleware
│   ├── db.ts            # Database connection setup
│   ├── seedUsers.ts     # User seeding script
│   └── index.ts         # Express server with session middleware
├── client/src/
│   ├── components/
│   │   └── Login.tsx    # Login form component
│   ├── hooks/
│   │   └── useAuth.tsx  # Authentication context and hooks
│   └── App.tsx          # Main app with auth routing
├── shared/
│   └── schema.ts        # Database schema definitions
└── migrations/
    └── 0001_create_users.sql  # Database migration
```