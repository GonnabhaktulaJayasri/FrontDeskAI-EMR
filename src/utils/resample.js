// utils/resample.js

/**
 * Resample PCM16 audio data from one sample rate to another.
 * @param {Int16Array} input - PCM16 audio
 * @param {number} inputRate - Input sample rate (Hz)
 * @param {number} targetRate - Target sample rate (Hz)
 */
export function resample(input, inputRate, targetRate) {
    if (inputRate === targetRate) return input;

    const ratio = targetRate / inputRate;
    const newLength = Math.round(input.length * ratio);
    const output = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const srcIndex = i / ratio;
        const index0 = Math.floor(srcIndex);
        const index1 = Math.min(index0 + 1, input.length - 1);
        const frac = srcIndex - index0;

        output[i] = (1 - frac) * input[index0] + frac * input[index1];
    }

    return output;
}

export const resampleTo16k = (pcm16, inputRate = 8000) =>
    resample(pcm16, inputRate, 16000);

export const resampleTo8k = (pcm16, inputRate = 16000) =>
    resample(pcm16, inputRate, 8000);
