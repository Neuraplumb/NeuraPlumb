const functions = require("firebase-functions");
const admin = require("firebase-admin");
const BusBoy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

exports.uploadImage = functions.https.onRequest((req, res) => {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).send("");
  }

  res.set("Access-Control-Allow-Origin", "*");

  const busboy = new BusBoy({ headers: req.headers });
  let upload;
  const fields = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    const filepath = path.join(os.tmpdir(), filename);
    upload = { file: filepath, type: mimetype, name: filename };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on("field", (fieldname, val) => {
    fields[fieldname] = val;
  });

  busboy.on("finish", async () => {
    if (!upload || !fields.userId) {
      return res.status(400).send("Missing file or user ID");
    }

    const destination = `uploads/${fields.userId}/${upload.name}`;
    const metadata = {
      contentType: upload.type,
      metadata: {
        firebaseStorageDownloadTokens: uuidv4()
      }
    };

    try {
  // Upload the file to Firebase Storage
  await bucket.upload(upload.file, { destination, metadata });

  // Get the signed URL (to let browsers view the file)
  const file = bucket.file(destination);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2030"
  });

  // Fix the bad domain
  const fixedUrl = url.replace(
    "neuraplumb-temp.firebasestorage.app",
    "neuraplumb-temp.appspot.com"
  );

  // Generate a Firestore document
  const docRef = db.collection("uploads").doc();
  const mockScore = Math.floor(Math.random() * 5) + 1;

  await docRef.set({
    userId: fields.userId,
    fileName: upload.name,
    storagePath: destination,
    imageUrl: fixedUrl,         // ✅ Use the fixed link here
    timestamp: new Date(),
    mockScore: mockScore
  });

  // Respond to the client
  res.status(200).json({
    message: "Upload complete",
    file: destination,
    imageUrl: fixedUrl,         // ✅ And here
    firestoreDoc: docRef.id,
    score: mockScore
  });

} catch (err) {
  console.error("Upload failed:", err);
  res.status(500).json({ error: err.message });
}

  });

  busboy.end(req.rawBody);
});
