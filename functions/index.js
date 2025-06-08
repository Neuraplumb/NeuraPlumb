const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Busboy = require("busboy");

admin.initializeApp();

const app = express();

app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).send("");
  next();
});

app.post('/', async (req, res) => {
  const busboy = Busboy({ headers: req.headers });
  const buffers = [];
  let filename = '';
  let mimetype = '';
  let jobType = 'unknown';

  busboy.on('file', (fieldname, file, _filename, _encoding, _mimetype) => {
    filename = _filename;
    mimetype = _mimetype;

    file.on('data', (data) => {
      buffers.push(data);
    });

    file.on('end', () => {
      console.log('📦 File received:', filename, mimetype);
    });
  });

  busboy.on('field', (fieldname, val) => {
    if (fieldname === 'jobType') jobType = val;
    console.log('📝 Field:', fieldname, '=', val);
  });

  busboy.on('finish', async () => {
    try {
      if (!filename || buffers.length === 0) {
        console.error('❌ No file found in request');
        return res.status(400).send('No file uploaded.');
      }

      const finalBuffer = Buffer.concat(buffers);
      const bucket = admin.storage().bucket("neuraplumb-temp.appspot.com");
      const storageName = `uploads/${uuidv4()}_${filename}`;
      const fileUpload = bucket.file(storageName);

      await fileUpload.save(finalBuffer, {
        metadata: {
          contentType: mimetype,
          metadata: { jobType },
        },
      });

      console.log('✅ Upload successful:', storageName);
      res.status(200).send({ message: 'Upload successful', filename: storageName });
    } catch (err) {
      console.error('🔥 Upload failed:', err.message);
      res.status(500).send('Upload failed');
    }
  });

  req.pipe(busboy);
});

exports.uploadImage = functions.https.onRequest({ region: 'us-central1' }, app);

// --- NEW Signed URL function ---
exports.getUploadUrl = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    const bucket = admin.storage().bucket('neuraplumb-temp.appspot.com');
    const uuid = uuidv4();
    const file = bucket.file(`uploads/${uuid}_${filename}`);

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000,
      contentType: contentType,
    });

    console.log('🔐 Signed URL:', url);

    res.status(200).json({ url });
  } catch (err) {
    console.error('🔥 Signed URL generation failed:', err);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// --- explainQuote (unchanged) ---
exports.explainQuote = require("firebase-functions").https.onCall(async (data, context) => {
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
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return { explanation: response.choices[0].message.content };
  } catch (err) {
    console.error("AI call failed:", err);
    throw new (require("firebase-functions")).https.HttpsError("internal", "AI error");
  }
});
