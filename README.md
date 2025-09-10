# Park Vision Pro

A modern React + TypeScript (Vite) frontend with a Node.js/Express backend for smart parking solutions, including newsletters, real-time AI call demo, and admin tooling.

## Monorepo Layout
- Frontend: Vite React app under `src/`, configured with Tailwind and shadcn/ui
- Backend: Express server in `backend/`
- Hosting: Firebase Hosting (frontend), optional backend hosting where you prefer

## Prerequisites
- Node.js 18+
- npm or bun (project includes bun.lockb but works with npm)
- For backend features:
  - MongoDB Atlas connection (MONGODB_URI)
  - SMTP creds for email (optional)

## Frontend — Development
1. Install deps
   ```bash
   npm install
   ```
2. Start dev server
   ```bash
   npm run dev
   ```
   Vite runs on http://localhost:5173

## Backend — Development
1. Go to backend and install deps
   ```bash
   cd backend
   npm install
   ```
2. Create `.env` in `backend/` (copy from `.env.example`) and set values like:
   ```ini
   PORT=3002
   MONGODB_URI=<your mongo uri>
   MONGODB_DB=vay_parking_system
   ENABLE_AMI=false
   ```
3. Start server
   ```bash
   npm start
   ```
   Server runs on http://localhost:3002

## Useful Scripts
- Root
  - `npm run dev` — start frontend
  - `npm run build` — production build
  - `npm run preview` — preview built frontend
- Backend
  - `npm start` — start Express server
  - `node test-email.js` — basic email test (requires SMTP env)
  - `node test-firebase-connection.cjs` — Firebase connection test

## Notes
- Assets are served for emails/previews from `/assets` via the backend.
- Socket.IO is enabled in the backend for real-time call status updates.
- Newsletter subscribers and articles are stored in MongoDB if configured.

## License
Proprietary. All rights reserved.vayacces control systems 