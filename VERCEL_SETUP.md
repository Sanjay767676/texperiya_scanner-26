# Vercel Environment Variables Setup

For deploying the Texperia Scanner authentication system to Vercel, you need to configure the following environment variables in the Vercel dashboard.

## Required Environment Variables

### 1. Database Configuration
```bash
DATABASE_URL=postgresql://neondb_owner:npg_kqKHzOt0Q9Nf@ep-twilight-river-a1pnmxm0-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### 2. Session Configuration
```bash
SESSION_SECRET=texperia-scanner-super-secure-session-key-2026
SESSION_MAX_AGE=2592000000
```

### 3. API Configuration
```bash
VITE_API_BASE_URL=https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net
TEXPERIA_API_BASE_URL=https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net
SCANNER_SECRET=TEX-2026-SECURE
```

### 4. Server Configuration
```bash
NODE_ENV=production
PORT=3000
```

## How to Set Environment Variables in Vercel

### Method 1: Vercel Dashboard
1. Go to your project in [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable with the following settings:
   - **Name**: Variable name (e.g., `DATABASE_URL`)
   - **Value**: Variable value (e.g., your Neon PostgreSQL connection string)
   - **Environments**: Select **Production**, **Preview**, and **Development**
4. Click **Save** for each variable

### Method 2: Vercel CLI
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Set each environment variable
vercel env add DATABASE_URL
vercel env add SESSION_SECRET
vercel env add SESSION_MAX_AGE
vercel env add VITE_API_BASE_URL
vercel env add TEXPERIA_API_BASE_URL
vercel env add SCANNER_SECRET
vercel env add NODE_ENV
vercel env add PORT
```

### Method 3: Environment Variables File
Create a `.env.production` file (DO NOT commit to git):
```bash
# Database
DATABASE_URL=postgresql://neondb_owner:npg_kqKHzOt0Q9Nf@ep-twilight-river-a1pnmxm0-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# Session
SESSION_SECRET=texperia-scanner-super-secure-session-key-2026
SESSION_MAX_AGE=2592000000

# API
VITE_API_BASE_URL=https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net
TEXPERIA_API_BASE_URL=https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net
SCANNER_SECRET=TEX-2026-SECURE

# Server
NODE_ENV=production
PORT=3000
```

## Important Notes

### Security Recommendations
1. **Change SESSION_SECRET**: Use a cryptographically secure random string in production
2. **Rotate Database Credentials**: Consider rotating Neon database credentials periodically
3. **Environment Separation**: Use different database instances for development/staging/production

### Database Setup
Before deploying, ensure your Neon database has:
1. ✅ Users table created (already done)
2. ✅ 100 users seeded (test1-test50, admin1-admin50)
3. ✅ All users have password: `snsct123`

### Vercel Configuration
Make sure your `vercel.json` is configured for full-stack deployment:
```json
{
  "functions": {
    "server/index.ts": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/server/index.ts"
    },
    {
      "source": "/(.*)",
      "destination": "/client/dist/$1"
    }
  ]
}
```

## Environment Variables Summary

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection | ✅ Yes |
| `SESSION_SECRET` | Session encryption key | ✅ Yes |
| `SESSION_MAX_AGE` | Session duration (30 days) | ⚠️ Optional |
| `VITE_API_BASE_URL` | Frontend API endpoint | ✅ Yes |
| `TEXPERIA_API_BASE_URL` | Backend API endpoint | ✅ Yes |
| `SCANNER_SECRET` | API authentication secret | ✅ Yes |
| `NODE_ENV` | Environment mode | ✅ Yes |
| `PORT` | Server port (Vercel auto-assigns) | ⚠️ Optional |

## Deployment Checklist

- [ ] All environment variables set in Vercel
- [ ] Neon database accessible from Vercel's regions
- [ ] Build scripts configured in `package.json`
- [ ] TypeScript compilation successful
- [ ] All dependencies installed
- [ ] CORS configured for production domain

## Testing After Deployment

1. Visit `https://your-app.vercel.app/api/health`
2. Test login with: `test1` / `snsct123`
3. Verify session persistence across refreshes
4. Check scanner functionality requires authentication