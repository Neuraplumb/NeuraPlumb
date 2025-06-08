const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

admin.initializeApp({
  storageBucket: "neuraplumb-temp.appspot.com",
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

const app = express();
const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

app.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const jobType = req.body.jobType;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filename = `${uuidv4()}-${file.originalname}`;
    const tempFilePath = file.path;

    await bucket.upload(tempFilePath, {
      destination: filename,
      metadata: { contentType: file.mimetype },
    });

    await db.collection("uploads").add({
      timestamp: Date.now(),
      jobType,
      filename,
    });

    res.status(200).json({ message: "Upload complete" });
  } catch (err) {
    console.error("Upload failed:", err.stack || err.message || err);
    res.status(500).json({ error: "Upload failed" });
  }
});

exports.uploadImage = functions.https.onRequest(app);

exports.explainQuote = functions.https.onCall(async (data, context) => {
  const { score, jobType, profile } = data;
  const prompt = `
You are NeuraPlumb AI, a field-trusted diagnostic assistant.

Job context:
- Score: ${score}
- Job Type: ${jobType}
- Profile: ${profile}

Explain the expected labor complexity and price range clearly for a homeowner. Use one paragraph. Be helpful, not robotic.
`;

  const { OpenAI } = require("openai");
  const openai = new OpenAI({ apiKey: functions.config().openai.key });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return { explanation: response.choices[0].message.content };
  } catch (err) {
    console.error("AI call failed:", err);
    throw new functions.https.HttpsError("internal", "AI error");
  }
});