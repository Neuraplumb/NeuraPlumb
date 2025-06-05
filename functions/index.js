const functions = require("firebase-functions");
const admin = require("firebase-admin");
const BusBoy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// 🔧 GPT-4o Setup
const openai = new OpenAI({
  apiKey: functions.config().openai.key,
});

// ✅ NeuraPlumb – TrustQuote AI Function (with role-aware prompt and Firestore caching)
exports.explainQuote = functions.https.onCall(async (data, context) => {
  const { score, jobType, profile, docId } = data;

  console.log("🔍 TrustQuote input:", { score, jobType, profile, docId });

  if (!docId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing Firestore docId.");
  }

  const docRef = db.collection("vault").doc(docId);
  const docSnap = await docRef.get();

  // ✅ 1. Return cached explanation if it exists
  if (docSnap.exists && docSnap.data().trustQuote) {
    console.log("⚡️ Returning cached TrustQuote");
    return { explanation: docSnap.data().trustQuote };
  }

  // 🧠 2. Generate new explanation from GPT-4o
  let prompt = "";

  if (profile === "plumber" || profile === "premium") {
    prompt = `
You are NeuraPlumb AI, a field-trusted assistant built for licensed plumbers.

Job context:
- Score: ${score}
- Job Type: ${jobType}

Write a concise, pro-facing summary of expected job complexity. Skip homeowner language. Mention technical challenge, physical effort, or inspection difficulty if relevant. No sales talk.
`;
  } else {
    prompt = `
You are NeuraPlumb AI, a trusted diagnostic assistant.

Job context:
- Score: ${score}
- Job Type: ${jobType}

Write a one-paragraph explanation for a homeowner. Focus on expected labor, time, and why this score matters. Use helpful, friendly language. No jargon.
`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const explanation = response.choices?.[0]?.message?.content || "AI response missing or malformed.";

  // 💾 3. Save to Firestore
  await docRef.update({ trustQuote: explanation });

  console.log("✅ TrustQuote saved to Firestore");

  return { explanation };
});

// ✅ NeuraPlumb – Image Upload Endpoint
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
    try {
      if (!upload) throw new Error("Missing file upload.");

      const destination = `uploads/${Date.now()}-${upload.name}`;
      await bucket.upload(upload.file, {
        destination,
        metadata: {
          contentType: upload.type,
          metadata: {
            firebaseStorageDownloadTokens: uuidv4(),
          },
        },
      });

      const fixedUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media`;
      const mockScore = Math.floor(Math.random() * 5) + 1;

      const docRef = await db.collection("vault").add({
        fileName: upload.name,
        storagePath: destination,
        imageUrl: fixedUrl,
        timestamp: new Date(),
        mockScore,
      });

      res.status(200).json({
        message: "Upload complete",
        file: destination,
        imageUrl: fixedUrl,
        firestoreDoc: docRef.id,
        score: mockScore,
      });
    } catch (err) {
      console.error("Upload failed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  busboy.end(req.rawBody);
});
