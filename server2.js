require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const winston = require('winston');

const app = express();

// Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// CORS Config for Frontend
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Supabase Init
let supabase;
try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error('Supabase credentials are missing in environment variables');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  logger.info('Supabase client initialized successfully');
} catch (error) {
  logger.error('Initialization error', { error: error.message });
  process.exit(1);
}

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: !!supabase,
    timestamp: new Date().toISOString()
  });
});

// Disease Search Logic
async function searchDiseases(query) {
  try {
    const { data: nameResults, error: nameError } = await supabase
      .from('diseases')
      .select('*')
      .ilike('"Disease Name"', `%${query}%`)
      .limit(5);
    if (nameError) throw nameError;
    if (nameResults.length > 0) return nameResults;

    const { data: symptomResults, error: symptomError } = await supabase
      .from('diseases')
      .select('*')
      .ilike('Symptoms', `%${query}%`)
      .limit(5);
    if (symptomError) throw symptomError;
    if (symptomResults.length > 0) return symptomResults;

    const { data: causeResults, error: causeError } = await supabase
      .from('diseases')
      .select('*')
      .ilike('Causes', `%${query}%`)
      .limit(5);
    if (causeError) throw causeError;
    return causeResults;
  } catch (error) {
    logger.error('Disease search error', { error: error.message });
    throw error;
  }
}

// Chat-style Disease Query
// Add this to your server.js, right after the CORS setup
app.options('*', cors()); // Enable preflight for all routes

// Update your disease-query endpoint to include better error handling
// Update your disease-query endpoint to return more structured data
app.post('/api/disease-query', async (req, res) => {
  try {
    if (!req.body?.query || typeof req.body.query !== 'string') {
      return res.status(400).json({ 
        success: false,
        message: 'Please enter a valid question.'
      });
    }

    const query = req.body.query.trim();
    const results = await searchDiseases(query);

    if (!results || results.length === 0) {
      return res.status(200).json({
        success: false,
        message: "🤖 I couldn't find any matching diseases. Try different symptoms."
      });
    }

    const disease = results[0];
    return res.json({
      success: true,
      data: {
        name: disease['Disease Name'] || 'Unknown Disease',
        symptoms: disease.Symptoms ? disease.Symptoms.split(';') : ['Not specified'],
        treatments: disease['Treatment Options'] ? disease['Treatment Options'].split(';') : ['Not specified'],
        medicines: disease['Medicine Options'] ? disease['Medicine Options'].split(';') : ['Not specified']
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Oops! Something went wrong.'
    });
  }
});
// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server ready at http://localhost:${PORT}`);
});