/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI} from '@google/genai';

const API_KEY_STORAGE_KEY = 'gemini_api_key';

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
async function generateContent(prompt: string, imageBytes: string) {
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
}

// --- DOM Elements ---
const upload = document.querySelector('#file-input') as HTMLInputElement;
const promptEl = document.querySelector('#prompt-input') as HTMLInputElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
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

// --- Event Listeners ---
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    base64data = await blobToBase64(file);
  }
});

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
  statusEl.innerText = 'Generating... This may take a few minutes.';
  video.style.display = 'none';

  generateButton.disabled = true;
  upload.disabled = true;
  promptEl.disabled = true;
  quotaErrorEl.style.display = 'none';

  try {
    await generateContent(prompt, base64data);
    statusEl.innerText = 'Done. Video downloaded.';
  } catch (e) {
    try {
      // Attempt to parse a structured error from the API
      const err = JSON.parse(e.message);
      const code = err.error.code;
      if (code === 429) {
        // Out of quota
        quotaErrorEl.style.display = 'block';
        statusEl.innerText = 'Quota limit reached.';
      } else if (code === 400) {
        // Often an invalid key or bad request
        statusEl.innerText =
          'Request failed. Please check your API key and prompt.';
        showApiKeyModal();
      } else {
        statusEl.innerText = err.error.message;
      }
    } catch (err) {
      // Fallback for other errors (e.g., "API key not found")
      statusEl.innerText = e.message;
      console.error('An error occurred:', e.message);
    }
  }

  generateButton.disabled = false;
  upload.disabled = false;
  promptEl.disabled = false;
}
