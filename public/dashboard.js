// frontend/dashboard.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🔐 Use your real Firebase config here:
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "neuraplumb-temp.firebaseapp.com",
  projectId: "neuraplumb-temp",
  storageBucket: "neuraplumb-temp.appspot.com",
  messagingSenderId: "XXXXXXXXXXX",
  appId: "1:XXXXXXXXXXX:web:XXXXXXXXXXX"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const jobList = document.getElementById("jobList");

async function loadJobs() {
  const uploadsQuery = query(collection(db, "uploads"), orderBy("timestamp", "desc"));
  const snapshot = await getDocs(uploadsQuery);
  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement("div");
    const safeImageUrl = (data.imageUrl || "").replace(
      "neuraplumb-temp.firebasestorage.app",
      "neuraplumb-temp.appspot.com"
);
  
div.innerHTML = `
  <hr>
  <p><strong>File:</strong> ${data.fileName}</p>
  ${renderScoreBadge(data.mockScore)}
  <p><strong>Timestamp:</strong> ${new Date(data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp).toLocaleString()}</p>
  <img src="${data.imageUrl}" alt="preview" width="300"/>
  <br/>
  <a href="vault.html?imgUrl=${encodeURIComponent(safeImageUrl)}&score=${encodeURIComponent(data.mockScore ?? '')}" target="_blank">
  <button style="margin-top: 10px;">Start TrustQuote</button>
</a>
`;
    jobList.appendChild(div);
  });
}

loadJobs();
function renderScoreBadge(score) {
  if (!score) {
    return `<span class="score-badge score-pending">Pending</span>`;
  }

  const labelMap = {
    1: "Emergency",
    2: "Needs Attention",
    3: "Standard",
    4: "Excellent",
    5: "Elite"
  };

  return `<span class="score-badge score-${score}">${score} – ${labelMap[score]}</span>`;
}

