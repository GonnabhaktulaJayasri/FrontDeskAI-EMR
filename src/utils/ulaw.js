export const ulawToPcm16 = (ulawBuffer) => {
    const pcm16Buffer = Buffer.alloc(ulawBuffer.length * 2);
    
    // μ-law decompression table for faster lookup
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

export const pcm16ToUlaw = (pcm16Buffer) => {
    const ulawBuffer = Buffer.alloc(pcm16Buffer.length / 2);
    
    for (let i = 0; i < pcm16Buffer.length; i += 2) {
        const sample = pcm16Buffer.readInt16LE(i);
        ulawBuffer[i / 2] = linearToUlaw(sample);
    }
    
    return ulawBuffer;
}

function linearToUlaw(sample) {
    const SIGN_BIT = 0x80;
    const QUANT_MASK = 0xF;
    const NSEGS = 8;
    const SEG_SHIFT = 4;
    const SEG_MASK = 0x70;
    const BIAS = 0x84;
    
    const seg_end = [0x1F, 0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF];
    
    let sign, seg, uval;
    
    sign = (sample >> 8) & SIGN_BIT;
    if (sign) sample = -sample;
    if (sample > 0x1FFF) sample = 0x1FFF;
    
    sample += BIAS;
    
    seg = 0;
    for (let i = 0; i < NSEGS; i++) {
        if (sample <= seg_end[i]) {
            seg = i;
            break;
        }
    }
    
    if (seg >= NSEGS) return (0x7F ^ SIGN_BIT);
    
    uval = (seg << SEG_SHIFT) | ((sample >> (seg + 3)) & QUANT_MASK);
    return ((uval ^ 0xFF) | sign) & 0xFF;
}