# Slabs Inventory Frontend

Local React app for viewing and managing graded cards (slabs) inventory.

## Setup

1. **Environment** – `.env.local` is already configured with Supabase URL and anon key.

2. **Supabase Auth** – You need at least one user to sign in:
   - Option A: Use the "Don't have an account? Sign up" link on the login page.
   - Option B: Create a user in Supabase Dashboard → Authentication → Users.

3. **Email confirmation** – If Supabase requires email confirmation, check your inbox or disable it in Authentication → Providers → Email.

## Run

```bash
npm run dev
```

Open http://localhost:5173. Sign in to reach the Slabs Inventory page.

## Build

```bash
npm run build
```
