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

// ✅ NeuraPlumb – TrustQuote AI Function (with role-aware prompt)
exports.explainQuote = functions.https.onCall(async (data, context) => {
  const { score, jobType, profile } = data;

  // Log input before OpenAI request
  console.log("🔍 TrustQuote input received:", { score, jobType, profile });

  // Role-aware prompt logic
  let prompt = "";

  if (profile === "plumber") {
    prompt = `
You are NeuraPlumb AI, a field-trusted assistant built for licensed plumbers.

Job context:
- Score: ${score}
- Job Type: ${jobType}

Write a concise, pro-facing summary of expected job complexity. Skip homeowner language. Mention technical challenge, physical effort, or inspection difficulty if relevant. No sales talk.
`;
  } else {
    prompt = `
You are NeuraPlumb AI, a field-trusted diagnostic assistant.

Job context:
- Score: ${score}
- Job Type: ${jobType}

Explain the expected labor complexity and price range clearly for a homeowner. Use one paragraph. Be helpful, not robotic.
`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  // Log response before returning
  console.log("✅ GPT-4o response:", response);

  return {
    explanation: response.choices?.[0]?.message?.content || "AI response missing or malformed.",
  };
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

