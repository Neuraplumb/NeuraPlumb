import React, { useState } from 'react';

export default function Home() {
  const [score, setScore] = useState(null);
  const [jobType, setJobType] = useState('');
  const [scope, setScope] = useState('');
  const [file, setFile] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const mockScore = Math.floor(Math.random() * 5) + 1;
    setScore(mockScore);
  };

  return (
    <div style={{ fontFamily: 'Arial', padding: '2rem', maxWidth: '600px', margin: 'auto' }}>
      <h1>NeuraPlumb Scoring Tool</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Upload Photo:</label><br />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label>Job Type:</label><br />
          <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
            <option value="">Select Job Type</option>
            <option value="water_heater">Water Heater</option>
            <option value="sewer">Sewer</option>
            <option value="repipe">Copper Repipe</option>
            <option value="drain">Drain Repair</option>
          </select>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <label>Scope of Work:</label><br />
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Select Scope</option>
            <option value="full_install">Full Install</option>
            <option value="repair_only">Repair Only</option>
            <option value="replacement">Replacement</option>
          </select>
        </div>
        <button style={{ marginTop: '1.5rem', padding: '0.5rem 1rem' }} type="submit">Get NeuraScore</button>
      </form>

      {score && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Your NeuraScore: <span style={{ color: 'blue' }}>{score}/5</span></h2>
          <p>This is a mock score for testing. AI-based scoring coming soon.</p>
        </div>
      )}
    </div>
  );
}
