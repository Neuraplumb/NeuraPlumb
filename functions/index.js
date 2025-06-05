process.env.FUNCTIONS_EMULATOR = false;

// What does this function do?  
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Busboy } = require("busboy"); // ✅ FIXED IMPORT
const path = require("path");
const os = require("os");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");

// 🔥 Explicit log on module load
console.log("🔥 uploadImage function loaded with Busboy version:", require("busboy/package.json").version);

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

  const docRef = db.collection("quotes").doc(docId);
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

// ✅ NeuraPlumb – Image Upload Endpoint (with preserveExternalRequestBody)
exports.uploadImage = functions
  .runWith({ memory: '256MB' })
  .region('us-west1')
  .https.onRequest(
    {
      timeoutSeconds: 60,
      cors: true,
      preserveExternalRequestBody: true
    },
    (req, res) => {
      // 🚀 Explicit log on handler invocation
      console.log("🚀 uploadImage function invoked at", new Date().toISOString());

      if (req.method === "OPTIONS") {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Methods", "POST");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        return res.status(204).send("");
      }

      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");

      const busboy = new Busboy({ headers: req.headers }); // ✅ FIXED USAGE
      let upload;
      const fields = {};

      busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
        console.log("📦 File received:", filename);
        const filepath = path.join(os.tmpdir(), filename);
        upload = { file: filepath, type: mimetype, name: filename };
        file.pipe(fs.createWriteStream(filepath));
      });

      busboy.on("field", (fieldname, val) => {
        fields[fieldname] = val;
      });

      busboy.on("finish", async () => {
        try {
          // ✅ Add upload guard here
          if (!upload?.file || !upload?.name) {
            throw new Error("Upload metadata is missing");
          }

          const destination = `uploads/${Date.now()}-${upload.name}`;
          console.log("🧠 Upload path:", destination);

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

          const docId = `${Date.now()}`;
          await db.collection("evaluations").doc(docId).set({
            fileName: upload.name,
            storagePath: destination,
            imageUrl: fixedUrl,
            timestamp: new Date(),
            mockScore,
          });

          res.set("Access-Control-Allow-Origin", "*");
          res.set("Access-Control-Allow-Headers", "Content-Type");
          res.set("Access-Control-Allow-Methods", "POST");
          return res.status(200).json({
          // Add Firestore write to log jobType and imageURL wtf
          await db.collection("uploads").add({
  jobType: "testJobType",
  imageUrl: fixedUrl,
  timestamp: new Date(),
});
            message: "Upload complete",
            file: destination,
            imageUrl: fixedUrl,
            firestoreDoc: docId,
            score: mockScore,
          });
        } catch (err) {
          console.error("🚨 Upload failed inside busboy finish:", err);
          res.set("Access-Control-Allow-Origin", "*");
          res.set("Access-Control-Allow-Headers", "Content-Type");
          res.set("Access-Control-Allow-Methods", "POST");
          return res.status(500).json({
            error: "🔥 Upload failed",
            details: err.message,
          });
        }
      });

      // Debug and guard for rawBody
      console.log("🧪 typeof req.rawBody =", typeof req.rawBody);
      console.log("🧪 is Buffer:", Buffer.isBuffer(req.rawBody));
      console.log("🧪 headers:", req.headers["content-type"]);
      console.log("🧪 length:", req.rawBody?.length);

      if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
        console.error("❌ FATAL: rawBody missing or invalid – cannot proceed.");
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Allow-Methods", "POST");
        return res.status(500).json({
          error: "Upload failed",
          details: "req.rawBody is undefined or not a Buffer. Firebase is dropping the body.",
        });
      }

      try {
        busboy.end(req.rawBody);
      } catch (outerErr) {
        console.error("🔥 Crash inside busboy.end:", outerErr);
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Allow-Methods", "POST");
        return res.status(500).json({
          error: "🔥 Pipeline failed before processing file",
          details: outerErr.message,
        });
      }
    }
  );