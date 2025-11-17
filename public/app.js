const form = document.getElementById('imageForm');
const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generateBtn');
const resultContainer = document.getElementById('result');
const generatedImage = document.getElementById('generatedImage');
const promptDisplay = document.getElementById('promptDisplay');
const errorMessage = document.getElementById('error');
const closeBtn = document.getElementById('closeBtn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const prompt = promptInput.value.trim();
    
    if (!prompt) {
        showError('Please enter a prompt');
        return;
    }

    // Hide previous results and errors
    resultContainer.style.display = 'none';
    errorMessage.style.display = 'none';

    // Show loading state
    generateBtn.disabled = true;
    generateBtn.querySelector('.btn-text').style.display = 'none';
    generateBtn.querySelector('.btn-loader').style.display = 'inline';

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate image');
        }

        // Display the generated image
        if (data.image) {
            // Handle both URL strings and base64 data
            if (typeof data.image === 'string') {
                generatedImage.src = data.image;
            } else if (data.image.url) {
                generatedImage.src = data.image.url;
            } else if (data.image.data) {
                generatedImage.src = `data:image/png;base64,${data.image.data}`;
            }
            
            promptDisplay.textContent = data.prompt || prompt;
            resultContainer.style.display = 'block';
        } else {
            throw new Error('No image data received');
        }

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An error occurred while generating the image');
    } finally {
        // Reset button state
        generateBtn.disabled = false;
        generateBtn.querySelector('.btn-text').style.display = 'inline';
        generateBtn.querySelector('.btn-loader').style.display = 'none';
    }
});

closeBtn.addEventListener('click', () => {
    resultContainer.style.display = 'none';
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

