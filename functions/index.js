const functions = require("firebase-functions");
const { setGlobalOptions } = functions;

// Limit concurrency/cost
setGlobalOptions({ maxInstances: 10 });

// Import Express app with all API routes
const app = require("./api");

// Export HTTPS function named "api" to match firebase.json rewrites
exports.api = functions.https.onRequest(app);