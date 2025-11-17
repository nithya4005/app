require('dotenv').config();
const express = require('express');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use built-in fetch (available in Node.js 18+)
const fetch = globalThis.fetch;

const app = express();
const port = process.env.PORT || 3001;

// Initialize Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY environment variable is not set. Please set it to use the image generation feature.');
} else {
  console.log('API Key loaded. First 10 chars:', apiKey.substring(0, 10) + '...');
  console.log('API Key length:', apiKey.length);
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper endpoint to list available models
app.get('/api/list-models', async (req, res) => {
  try {
    if (!genAI || !apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured',
        keyLoaded: !!apiKey
      });
    }

    // Use the fetch API to call the ListModels endpoint directly
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to list models');
    }

    res.json({ 
      success: true,
      models: data.models || [],
      totalModels: data.models?.length || 0
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to list models',
      message: error.message,
      keyLoaded: !!apiKey
    });
  }
});

// Helper endpoint to test API key (for debugging)
app.get('/api/test-key', async (req, res) => {
  try {
    if (!genAI || !apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured',
        keyLoaded: !!apiKey,
        keyLength: apiKey ? apiKey.length : 0
      });
    }

    // Try different model names that might work
    const modelNames = [
      'gemini-2.5-flash-image-preview',  // Try image model first
      'gemini',  // Try just "gemini"
      'gemini-pro',
      'gemini-1.0-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.0-flash-exp'
    ];

    let lastError = null;
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName
        });

        const result = await model.generateContent('Say hello');
        const response = await result.response;
        const text = response.text();

        return res.json({ 
          success: true,
          message: 'API key is working!',
          workingModel: modelName,
          testResponse: text,
          keyLoaded: true,
          keyPreview: apiKey.substring(0, 10) + '...'
        });
      } catch (error) {
        lastError = error;
        // Continue to next model
        continue;
      }
    }

    // If we get here, no model worked
    throw lastError || new Error('No working models found');

  } catch (error) {
    res.status(500).json({ 
      error: 'API key test failed',
      message: error.message,
      status: error.status,
      details: error.errorDetails || 'No additional details',
      keyLoaded: !!apiKey,
      suggestion: 'Try visiting /api/list-models to see available models'
    });
  }
});

// Helper endpoint to list available models (for debugging)
app.get('/api/models', async (req, res) => {
  try {
    if (!genAI || !apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured' 
      });
    }

    // Try to get available models by testing each one
    const modelNames = [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro',
      'gemini-1.0-pro',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest'
    ];

    const availableModels = [];
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        // Just getting the model doesn't verify it, but we'll catch errors in the generate endpoint
        availableModels.push({ name: modelName, status: 'testing' });
      } catch (error) {
        // Model not available
      }
    }

    res.json({ 
      message: 'Test models in /api/generate endpoint',
      modelsToTry: modelNames,
      availableModels: availableModels.length > 0 ? availableModels : 'No models tested yet'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Image generation endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Prompt is required' 
      });
    }

    if (!genAI || !apiKey) {
      return res.status(500).json({ 
        error: 'Gemini API key not configured. Please set GEMINI_API_KEY environment variable.' 
      });
    }

    // Use Gemini Flash 2.5 (NanoBanana) for image generation
    // Try Flash 2.5 image model first, then fallback to other models
    const modelNames = [
      'gemini-2.5-flash-image-preview',  // Flash 2.5 image generation model (NanoBanana) - primary
      'gemini-2.0-flash-exp',  // Flash 2.5 (NanoBanana) - fallback
      'gemini-2.5-flash-image', // Alternative name
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-pro'
    ];

    let lastError = null;
    let response = null;
    let successfulModel = null;
    let quotaError = null;

    // Try each model until one works (with retry for quota errors)
    for (const modelName of modelNames) {
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              temperature: 1,
            }
          });

          // Request image generation using Gemini Flash 2.5
          // Use a prompt that requests image generation
          const imageGenerationPrompt = `Generate an image: ${prompt}`;
          const result = await model.generateContent(imageGenerationPrompt);
          response = result.response;
          
          // If we got a response, break out of the loop
          if (response) {
            successfulModel = modelName;
            console.log(`Successfully used model: ${modelName}`);
            break;
          }
        } catch (error) {
          // Handle quota/rate limit errors with retry
          if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('Quota')) {
            if (!quotaError) quotaError = error;
            
            if (retryCount < maxRetries) {
              // Extract retry delay from error if available
              const retryDelay = 5; // Default 5 seconds
              console.log(`Model ${modelName} quota exceeded. Retrying in ${retryDelay} seconds... (attempt ${retryCount + 1}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
              retryCount++;
              continue;
            } else {
              console.log(`Model ${modelName} quota exceeded after retries, trying next model...`);
              lastError = error;
              break; // Exit retry loop, try next model
            }
          }
          
          // If it's a 404 (model not found), try the next model
          if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('Not Found')) {
            lastError = error;
            break; // Exit retry loop, try next model
          }
          
          // For 400 errors (bad request), continue to next model
          if (error.status === 400) {
            lastError = error;
            break; // Exit retry loop, try next model
          }
          
          // For other errors, log and try next model
          console.log(`Error with model ${modelName}:`, error.message?.substring(0, 100));
          lastError = error;
          break; // Exit retry loop, try next model
        }
      }
      
      // If we got a successful response, break out of model loop
      if (response) {
        break;
      }
    }

    // If we only got quota errors, return that specific error
    if (!response && quotaError && !lastError) {
      throw quotaError;
    }

    if (!response) {
      throw lastError || new Error('No available model found. Please check your API key and available models.');
    }

    // Check if response contains image data
    const candidates = response.candidates || [];
    if (candidates.length === 0) {
      throw new Error('No response from Gemini API');
    }

    const candidate = candidates[0];
    const content = candidate.content;
    const parts = content.parts || [];

    // Look for image in the response
    let imageData = null;
    for (const part of parts) {
      if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
        imageData = part.inlineData.data;
        break;
      }
    }

    // If no image data found, check if we got text instead
    // Note: Standard Gemini models generate text, not images directly
    if (!imageData) {
      const text = response.text();
      
      // If the response contains text, Gemini returned a description instead of an image
      // This might happen if the model doesn't support direct image generation
      return res.status(501).json({ 
        error: 'Model does not support direct image generation',
        message: 'The selected Gemini model returned text instead of an image. Gemini Flash 2.5 (NanoBanana) may require a different API endpoint or method for image generation, or may not be available on your current plan.',
        response: text.substring(0, 500), // First 500 chars of response
        suggestion: 'Please check if Gemini Flash 2.5 has image generation capabilities on your API plan, or consider using a dedicated image generation API.'
      });
    }

    // Determine MIME type (default to png)
    const mimeType = parts.find(p => p.inlineData?.mimeType)?.inlineData?.mimeType || 'image/png';

    // Return the image as base64
    res.json({
      success: true,
      image: `data:${mimeType};base64,${imageData}`,
      prompt: prompt
    });

  } catch (error) {
    console.error('Error generating image:', error);
    
    // Handle model not found errors
    if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('Not Found')) {
      return res.status(404).json({ 
        error: 'Model not found',
        message: 'The requested Gemini model is not available. Tried multiple models but none were found.',
        suggestion: 'Please check your API key permissions and available models. Visit /api/models for debugging info.',
        details: error.message
      });
    }

    // Handle quota/rate limit errors specifically
    if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('Quota')) {
      const retryAfter = error.errorDetails?.find(d => d['@type']?.includes('RetryInfo'))?.retryDelay || '16';
      return res.status(429).json({ 
        error: 'API quota exceeded',
        message: 'You have exceeded your current quota. Please wait a moment and try again.',
        retryAfter: `${retryAfter} seconds`,
        details: error.message
      });
    }

    // Handle authentication errors
    if (error.status === 401 || error.message?.includes('API key')) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'Please check your GEMINI_API_KEY environment variable.'
      });
    }

    // General error
    res.status(500).json({ 
      error: 'Failed to generate image',
      message: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please kill the process using this port or change the PORT in .env`);
    console.error('To kill the process, run: Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force');
    process.exit(1);
  } else {
    throw err;
  }
});

