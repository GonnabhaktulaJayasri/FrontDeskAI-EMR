import axios from 'axios';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import sdk from 'microsoft-cognitiveservices-speech-sdk';
import 'dotenv/config';

// Get current directory (ES modules compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TRANSCRIPTION_SERVICE = process.env.TRANSCRIPTION_SERVICE || 'whisper';
const TEMP_AUDIO_DIR = process.env.TRANSCRIPTION_TEMP_DIR || path.join(process.cwd(), 'user_responses');
const KEEP_TEMP_FILES = process.env.KEEP_TRANSCRIPTION_FILES === 'true'; // Set to 'true' for debugging

/**
 * Ensure temp directory exists
 */
async function ensureTempDir() {
    try {
        await fs.access(TEMP_AUDIO_DIR);
    } catch {
        await fs.mkdir(TEMP_AUDIO_DIR, { recursive: true });
    }
}

/**
 * Main transcription function
 */
export async function transcribeAudio(audioBuffer, format = 'mulaw') {
    try {
        if (TRANSCRIPTION_SERVICE === 'azure') {
            return await transcribeWithAzure(audioBuffer, format);
        } else {
            return await transcribeWithWhisper(audioBuffer, format);
        }
    } catch (error) {
        console.error('Transcription error:', error);
        return {
            success: false,
            error: error.message,
            text: ''
        };
    }
}

/**
 * Transcribe using OpenAI Whisper (Windows compatible)
 */
async function transcribeWithWhisper(audioBuffer, format = 'mulaw') {
    let tempFilePath = null;
    
    try {
        // Ensure directory exists
        await ensureTempDir();
        
        const wavBuffer = format === 'mulaw' 
            ? createWavFromMulaw(audioBuffer)
            : audioBuffer;

        // Create temp file path in user_responses folder
        const timestamp = Date.now();
        const uniqueId = uuidv4().split('-')[0]; // Use short ID
        const fileName = `transcription_${timestamp}_${uniqueId}.wav`;
        tempFilePath = path.join(TEMP_AUDIO_DIR, fileName);
        
        // Write file
        await fs.writeFile(tempFilePath, wavBuffer);
        
        // Verify file exists
        const stats = await fs.stat(tempFilePath);

        // Create form data
        const formData = new FormData();
        const fileStream = fsSync.createReadStream(tempFilePath);
        
        formData.append('file', fileStream, {
            filename: fileName,
            contentType: 'audio/wav',
            knownLength: stats.size
        });
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('response_format', 'json');

        // Call Whisper API
        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 30000 // 30 second timeout
            }
        );

        console.log('Whisper transcription:', response.data.text);

        return {
            success: true,
            text: response.data.text,
            service: 'whisper',
            audioFile: KEEP_TEMP_FILES ? tempFilePath : null
        };

    } catch (error) {
        console.error('Whisper error:', error.response?.data || error.message);
        throw error;
    } finally {
        // Clean up temp file unless we're keeping them for debugging
        // if (tempFilePath && !KEEP_TEMP_FILES) {
        //     try {
        //         await fs.unlink(tempFilePath);
        //         console.log('Temp transcription file deleted');
        //     } catch (err) {
        //         console.error('Error deleting temp file:', err.message);
        //     }
        // } else if (tempFilePath && KEEP_TEMP_FILES) {
        //     console.log('Kept transcription file for debugging:', tempFilePath);
        // }
    }
}

/**
 * Transcribe using Azure Speech Services
 */
async function transcribeWithAzure(audioBuffer, format = 'mulaw') {
    return new Promise(async (resolve, reject) => {
        try {
            const speechConfig = sdk.SpeechConfig.fromSubscription(
                process.env.AZURE_SPEECH_KEY,
                process.env.AZURE_SPEECH_REGION
            );

            speechConfig.speechRecognitionLanguage = 'en-US';

            // Convert to PCM16
            const pcm16Buffer = format === 'mulaw' 
                ? ulawToPcm16(audioBuffer)
                : audioBuffer;

            // Create audio stream
            const pushStream = sdk.AudioInputStream.createPushStream(
                sdk.AudioStreamFormat.getWaveFormatPCM(8000, 16, 1)
            );

            pushStream.write(pcm16Buffer);
            pushStream.close();

            const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
            const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

            let transcribedText = '';

            recognizer.recognized = (s, e) => {
                if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
                    transcribedText = e.result.text;
                }
            };

            recognizer.canceled = (s, e) => {
                console.error('Azure canceled:', e.errorDetails);
                recognizer.close();
                reject(new Error(e.errorDetails));
            };

            recognizer.sessionStopped = (s, e) => {
                recognizer.close();
                resolve({
                    success: true,
                    text: transcribedText,
                    service: 'azure'
                });
            };

            recognizer.recognizeOnceAsync(
                result => {
                    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                        resolve({
                            success: true,
                            text: result.text,
                            service: 'azure'
                        });
                    } else {
                        reject(new Error('No speech recognized'));
                    }
                    recognizer.close();
                },
                error => {
                    recognizer.close();
                    reject(error);
                }
            );

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Create WAV file from mulaw audio (manual WAV header creation)
 * This is more reliable than using the 'wav' package
 */
function createWavFromMulaw(mulawBuffer) {
    // Convert mulaw to PCM16
    const pcm16Buffer = ulawToPcm16(mulawBuffer);
    
    // WAV file parameters
    const numChannels = 1;
    const sampleRate = 8000;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = pcm16Buffer.length;
    
    // Create WAV header (44 bytes)
    const header = Buffer.alloc(44);
    
    // RIFF chunk descriptor
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    
    // fmt sub-chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Sub-chunk size
    header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    
    // data sub-chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    
    // Combine header and data
    return Buffer.concat([header, pcm16Buffer]);
}

/**
 * Convert μ-law to PCM16
 */
function ulawToPcm16(ulawBuffer) {
    const pcm16Buffer = Buffer.alloc(ulawBuffer.length * 2);

    const ulawTable = [
        -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
        -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
        -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
        -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
        -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
        -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
        -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
        -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
        -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
        -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
        -876, -844, -812, -780, -748, -716, -684, -652,
        -620, -588, -556, -524, -492, -460, -428, -396,
        -372, -356, -340, -324, -308, -292, -276, -260,
        -244, -228, -212, -196, -180, -164, -148, -132,
        -120, -112, -104, -96, -88, -80, -72, -64,
        -56, -48, -40, -32, -24, -16, -8, 0,
        32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
        23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
        15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
        11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
        7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
        5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
        3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
        2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
        1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
        1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
        876, 844, 812, 780, 748, 716, 684, 652,
        620, 588, 556, 524, 492, 460, 428, 396,
        372, 356, 340, 324, 308, 292, 276, 260,
        244, 228, 212, 196, 180, 164, 148, 132,
        120, 112, 104, 96, 88, 80, 72, 64,
        56, 48, 40, 32, 24, 16, 8, 0
    ];

    for (let i = 0; i < ulawBuffer.length; i++) {
        const sample = ulawTable[ulawBuffer[i]];
        pcm16Buffer.writeInt16LE(sample, i * 2);
    }

    return pcm16Buffer;
}

/**
 * Audio buffer manager for accumulating chunks
 */
export class AudioBufferManager {
    constructor(minDuration = 1000) {
        this.chunks = [];
        this.startTime = null;
        this.minDuration = minDuration;
    }

    addChunk(audioData) {
        if (!this.startTime) {
            this.startTime = Date.now();
        }
        this.chunks.push(audioData);
    }

    hasEnoughAudio() {
        if (!this.startTime) return false;
        const duration = Date.now() - this.startTime;
        return duration >= this.minDuration && this.chunks.length > 0;
    }

    getBuffer() {
        if (this.chunks.length === 0) return null;
        return Buffer.concat(this.chunks);
    }

    clear() {
        this.chunks = [];
        this.startTime = null;
    }

    getSize() {
        return this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    }

    getDuration() {
        if (!this.startTime) return 0;
        return Date.now() - this.startTime;
    }
}

/**
 * Test function to verify transcription is working
 */
export async function testTranscription() {
    console.log('Testing transcription service...');
    console.log('Service:', TRANSCRIPTION_SERVICE);
    console.log('Temp directory:', TEMP_AUDIO_DIR);
    console.log('OpenAI Key:', process.env.OPENAI_API_KEY ? 'Set ✓' : 'NOT SET ✗');
    
    // Ensure directory exists
    await ensureTempDir();
    
    // Create a simple test audio buffer (silence)
    const testBuffer = Buffer.alloc(8000); // 1 second of silence
    
    try {
        const result = await transcribeAudio(testBuffer, 'mulaw');
        console.log('Test result:', result);
        return result;
    } catch (error) {
        console.error('Test failed:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Clean up old transcription files (optional maintenance)
 */
export async function cleanupOldTranscriptions(maxAgeHours = 24) {
    try {
        await ensureTempDir();
        const files = await fs.readdir(TEMP_AUDIO_DIR);
        const now = Date.now();
        const maxAge = maxAgeHours * 60 * 60 * 1000;
        
        let deletedCount = 0;
        
        for (const file of files) {
            if (file.startsWith('transcription_') && file.endsWith('.wav')) {
                const filePath = path.join(TEMP_AUDIO_DIR, file);
                const stats = await fs.stat(filePath);
                const age = now - stats.mtimeMs;
                
                if (age > maxAge) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }
        }
        
        console.log(`Cleaned up ${deletedCount} old transcription files`);
        return { success: true, deletedCount };
    } catch (error) {
        console.error('Error cleaning up transcriptions:', error);
        return { success: false, error: error.message };
    }
}