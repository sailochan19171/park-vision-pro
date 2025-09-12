---
description: Repository Information Overview
alwaysApply: true
---

# Park Vision Pro Information

## Summary
A modern React + TypeScript application built with Vite for smart parking solutions. The project includes a frontend React application and a Node.js/Express backend, with features like newsletters, real-time AI call demo, and admin tooling.

## Structure
- **src/**: Frontend React application with TypeScript
- **backend/**: Express server for backend functionality
- **functions/**: Firebase Cloud Functions
- **public/**: Static assets and public files
- **.firebase/**: Firebase deployment configuration
- **dist/**: Build output directory

## Language & Runtime
**Frontend Language**: TypeScript/JavaScript (React)
**Backend Language**: JavaScript (Node.js)
**Frontend Version**: React 18.3.1
**Backend Version**: Node.js 16+ (required by engine specification)
**Functions Version**: Node.js 22 (required by engine specification)
**Build System**: Vite 5.4.1
**Package Manager**: npm/bun (supports both)

## Dependencies

### Frontend Dependencies
**Main Dependencies**:
- React 18.3.1 with React Router 6.26.2
- Tailwind CSS for styling
- shadcn/ui components (Radix UI)
- Socket.IO client for real-time communication
- Leaflet for maps
- React Hook Form with Zod for form validation

**Development Dependencies**:
- TypeScript 5.5.3
- ESLint 9.9.0
- Vite 5.4.1
- TailwindCSS 3.4.11

### Backend Dependencies
**Main Dependencies**:
- Express 4.18.2
- MongoDB 6.19.0
- Socket.IO 4.8.1
- Nodemailer for email functionality
- Firebase Admin SDK
- OpenAI SDK for AI features
- Twilio for SMS/WhatsApp

**Development Dependencies**:
- Nodemon 3.0.2

## Build & Installation

### Frontend
```bash
npm install
npm run dev    # Development server on port 8000
npm run build  # Production build
npm run preview  # Preview production build
```

### Backend
```bash
cd backend
npm install
npm start    # Start server on port 3002 (configurable)
```

### Firebase Functions
```bash
cd functions
npm install
npm run serve  # Local emulation
npm run deploy # Deploy to Firebase
```

## Docker
No Docker configuration found in the repository.

## Testing
No formal testing framework configuration found, but there are several test scripts:
- Backend: `npm test` runs `test-email.js`
- Various test scripts in the root directory for testing different functionalities:
  - `test-firebase-connection.cjs`
  - `test-email.js`
  - `test-sms.js`
  - `test-whatsapp.js`
  - `test-call.js`

## Deployment
The application is configured for Firebase Hosting:
- Frontend is deployed to Firebase Hosting from the `dist` directory
- API routes are handled by Firebase Functions
- Backend can be deployed separately (not specified in configuration)

## Database
MongoDB is used as the database:
- Connection string configured via environment variable `MONGODB_URI`
- Default database name: `vay_parking_system`
- Stores newsletter subscribers and articles

## External Services
- Firebase for hosting and authentication
- MongoDB Atlas for database
- SMTP service for email functionality
- Twilio for SMS/WhatsApp messaging
- OpenAI for AI features