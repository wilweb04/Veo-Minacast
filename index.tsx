/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

const API_KEY_STORAGE_KEY = 'gemini_api_key';
const GENERATION_MESSAGES = [
  'Warming up the video engine...',
  'Storyboarding your prompt...',
  'Consulting with the digital muses...',
  'Rendering the first few frames...',
  'This is taking a moment, hang tight...',
  'Adding a touch of cinematic magic...',
  'Almost there, polishing the final cut...',
];

// --- Helper Functions ---
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- API Key Management ---
function getApiKey(): string | undefined {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? process.env.API_KEY;
}

function saveApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

// --- Video Generation ---
async function generateContent(prompt: string, imageBytes: string, onStatusUpdate: (message: string) => void) {
  const apiKey = getApiKey();
  if (!apiKey) {
    statusEl.innerText = 'Please add your Gemini API key in the settings.';
    showApiKeyModal();
    throw new Error('API key not found.');
  }

  const ai = new GoogleGenAI({apiKey});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png',
    };
  }

  let operation = await ai.models.generateVideos(config);
  
  let messageIndex = 0;
  const messageInterval = setInterval(() => {
    onStatusUpdate(GENERATION_MESSAGES[messageIndex % GENERATION_MESSAGES.length]);
    messageIndex++;
  }, 4000);

  try {
    while (!operation.done) {
      console.log('Waiting for completion');
      await delay(1000);
      operation = await ai.operations.getVideosOperation({operation});
    }

    const videos = operation.response?.generatedVideos;
    if (videos === undefined || videos.length === 0) {
      throw new Error('No videos generated');
    }

    // Use a for...of loop to correctly handle async/await and errors.
    let i = 0;
    for (const v of videos) {
      const url = decodeURIComponent(v.video.uri);
      // The API key must be appended to the download URL.
      const res = await fetch(`${url}&key=${apiKey}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Video download failed:', errorText);
        throw new Error(
          `Failed to download video: ${res.status} ${res.statusText}`,
        );
      }
      const blob = await res.blob();
      const objectURL = URL.createObjectURL(blob);
      downloadFile(objectURL, `video${i}.mp4`);
      video.src = objectURL;
      console.log('Downloaded video', `video${i}.mp4`);
      video.style.display = 'block';
      i++;
    }
  } finally {
    clearInterval(messageInterval);
  }
}

// --- DOM Elements ---
const upload = document.querySelector('#file-input') as HTMLInputElement;
const dropZone = document.querySelector('#drop-zone') as HTMLDivElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const imgEl = document.querySelector('#img') as HTMLImageElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
const buttonText = generateButton.querySelector('.button-text') as HTMLSpanElement;
const spinner = generateButton.querySelector('.spinner') as HTMLDivElement;
const settingsButton = document.querySelector('#settings-button') as HTMLButtonElement;
const apiKeyModal = document.querySelector('#api-key-modal') as HTMLDivElement;
const modalOverlay = document.querySelector('.modal-overlay') as HTMLDivElement;
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const saveKeyButton = document.querySelector('#save-key-button') as HTMLButtonElement;
const closeModalButton = document.querySelector('#close-modal-button') as HTMLButtonElement;
const showKeyModalButton = document.querySelector('#show-key-modal-button') as HTMLButtonElement;

let base64data = '';
let prompt = '';

// --- Modal Logic ---
function showApiKeyModal() {
  const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (savedKey) {
    apiKeyInput.value = savedKey;
  } else {
    apiKeyInput.value = '';
  }
  apiKeyModal.hidden = false;
}

function hideApiKeyModal() {
  apiKeyModal.hidden = true;
}

// --- Drag and Drop Logic ---
function handleFile(file: File) {
  if (file && file.type.startsWith('image/')) {
    dropZone.classList.add('has-file');
    const objectURL = URL.createObjectURL(file);
    imgEl.src = objectURL;
    blobToBase64(file).then(data => {
      base64data = data;
    });
  }
}

dropZone.addEventListener('click', () => upload.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});
upload.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    handleFile(file);
  }
});

// --- Event Listeners ---
promptEl.addEventListener('input', () => {
  prompt = promptEl.value;
});

generateButton.addEventListener('click', () => {
  generate();
});

settingsButton.addEventListener('click', showApiKeyModal);
showKeyModalButton.addEventListener('click', showApiKeyModal);
closeModalButton.addEventListener('click', hideApiKeyModal);
modalOverlay.addEventListener('click', hideApiKeyModal);

saveKeyButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    saveApiKey(key);
    hideApiKeyModal();
    statusEl.innerText = 'API Key saved. Ready to generate.';
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    hideApiKeyModal();
    statusEl.innerText = 'API Key removed.';
  }
});

// --- Main Generate Function ---
async function generate() {
  if (!prompt.trim()) {
    statusEl.innerText = 'Please enter a prompt.';
    return;
  }
  statusEl.innerText = 'Initializing...';
  video.style.display = 'none';

  generateButton.disabled = true;
  buttonText.innerText = "Generating...";
  spinner.hidden = false;
  upload.disabled = true;
  promptEl.disabled = true;
  quotaErrorEl.style.display = 'none';

  try {
    await generateContent(prompt, base64data, (message) => {
        statusEl.innerText = message;
    });
    statusEl.innerText = 'Done. Video downloaded.';
  } catch (e) {
    const message = e.message || 'An unknown error occurred.';
    console.error('An error occurred:', e);

    if (message.includes('429') || message.toLowerCase().includes('quota')) {
      quotaErrorEl.style.display = 'block';
      statusEl.innerText = 'Quota limit reached. Please try again later or add your own API key.';
    } else if (message.includes('400') || message.toLowerCase().includes('api key')) {
      statusEl.innerText = 'Request failed. Please check your API key and prompt, then try again.';
      showApiKeyModal();
    } else {
      statusEl.innerText = message;
    }
  }

  generateButton.disabled = false;
  buttonText.innerText = "Generate";
  spinner.hidden = true;
  upload.disabled = false;
  promptEl.disabled = false;
}