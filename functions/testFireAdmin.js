
const admin = require("firebase-admin");
admin.initializeApp();

const FieldValue = require("firebase-admin").firestore.FieldValue;

console.log("✅ FieldValue:", FieldValue);
console.log("✅ serverTimestamp:", FieldValue.serverTimestamp);
