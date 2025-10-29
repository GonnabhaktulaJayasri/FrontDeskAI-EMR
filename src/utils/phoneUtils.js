/**
 * Phone number utility functions
 * Handles multiple country codes (+91 for India, +1 for US/Canada)
 */

/**
 * Normalize phone number to E.164 format
 * Supports both Indian (+91) and US/Canada (+1) numbers
 * 
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone in E.164 format (e.g., +918884180740 or +15551234567)
 */
export function normalizePhoneNumber(phone) {
    if (!phone) return '';

    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Already has country code
    if (phone.startsWith('+')) {
        return phone.replace(/\D/g, '').replace(/^/, '+');
    }

    // Determine country code based on length and pattern
    if (cleaned.length === 10) {
        // Could be US/Canada or Indian number without country code
        // Default to +91 (India) if starts with 6-9, otherwise +1 (US)
        const firstDigit = cleaned[0];
        if (firstDigit >= '6' && firstDigit <= '9') {
            return '+91' + cleaned;
        } else {
            return '+1' + cleaned;
        }
    } else if (cleaned.length === 11) {
        // Likely US number with leading 1
        if (cleaned.startsWith('1')) {
            return '+' + cleaned;
        }
        // Or Indian number starting with 91
        if (cleaned.startsWith('91')) {
            return '+' + cleaned;
        }
    } else if (cleaned.length === 12) {
        // Likely has country code already
        if (cleaned.startsWith('91')) {
            return '+' + cleaned;
        }
        if (cleaned.startsWith('1')) {
            return '+' + cleaned;
        }
    }

    // Default: add +91 (India) for numbers that look Indian
    if (cleaned.length === 10 && cleaned[0] >= '6') {
        return '+91' + cleaned;
    }

    // Default: add +1 (US) for other 10-digit numbers
    if (cleaned.length === 10) {
        return '+1' + cleaned;
    }

    // Fallback: return with + prefix
    return '+' + cleaned;
}

/**
 * Generate smart phone variations - prioritize international formats
 * Only checks +91 (India) or +1 (US) based on number characteristics
 */
export function generatePhoneVariations(phoneNumber) {
    const variations = [];

    // Remove all non-digit characters except leading +
    let cleaned = phoneNumber.trim();
    const hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/[^\d]/g, '');

    // If already has country code, use as-is
    if (hasPlus) {
        variations.push(phoneNumber.trim());
        return variations;
    }

    // Determine country code based on length and patterns
    if (cleaned.length === 10) {
        // 10 digits - could be Indian or US
        // For Medicover (Indian hospital), try +91 first
        variations.push(`+91${cleaned}`);
        variations.push(`+1${cleaned}`);
    } else if (cleaned.length === 11) {
        if (cleaned.startsWith('1')) {
            // US number with 1 prefix
            variations.push(`+${cleaned}`);
        } else {
            // Try as-is with +
            variations.push(`+${cleaned}`);
        }
    } else if (cleaned.length === 12) {
        if (cleaned.startsWith('91')) {
            // Indian number with 91 prefix
            variations.push(`+${cleaned}`);
        } else {
            // Try as-is with +
            variations.push(`+${cleaned}`);
        }
    } else {
        // Other lengths - try with + prefix
        variations.push(`+${cleaned}`);
    }

    return variations;
}
/**
 * Validate phone number format
 * Supports both Indian and US/Canada numbers
 * 
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid
 */
export function isValidPhoneNumber(phone) {
    if (!phone) return false;

    const cleaned = phone.replace(/\D/g, '');

    // Indian number patterns
    const indianPatterns = [
        /^\+?91[6-9]\d{9}$/, // +91XXXXXXXXXX (starts with 6-9)
        /^[6-9]\d{9}$/ // XXXXXXXXXX (10 digits starting with 6-9)
    ];

    // US/Canada number patterns
    const usPatterns = [
        /^\+?1[2-9]\d{9}$/, // +1XXXXXXXXXX
        /^[2-9]\d{9}$/ // XXXXXXXXXX (10 digits starting with 2-9)
    ];

    // Check against all patterns
    const allPatterns = [...indianPatterns, ...usPatterns];

    return allPatterns.some(pattern => {
        // Test against original format
        if (pattern.test(phone)) return true;
        // Test against cleaned format
        if (pattern.test(cleaned)) return true;
        // Test against cleaned with +
        if (pattern.test('+' + cleaned)) return true;
        return false;
    });
}

/**
 * Format phone number for display
 * 
 * @param {string} phone - Phone number
 * @param {string} style - Display style: 'international', 'national', 'compact'
 * @returns {string} - Formatted phone number
 */
export function formatPhoneNumber(phone, style = 'international') {
    if (!phone) return '';

    const normalized = normalizePhoneNumber(phone);
    const cleaned = normalized.replace(/\D/g, '');

    if (style === 'international') {
        // +91 888-418-0740 or +1 (555) 123-4567
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            return `+91 ${cleaned.substring(2, 5)}-${cleaned.substring(5, 8)}-${cleaned.substring(8)}`;
        } else if (cleaned.startsWith('1') && cleaned.length === 11) {
            return `+1 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
        }
    } else if (style === 'national') {
        // (888) 418-0740 or (555) 123-4567
        if (cleaned.startsWith('91') && cleaned.length === 12) {
            return `${cleaned.substring(2, 5)}-${cleaned.substring(5, 8)}-${cleaned.substring(8)}`;
        } else if (cleaned.startsWith('1') && cleaned.length === 11) {
            return `(${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7)}`;
        }
    } else if (style === 'compact') {
        // Just return normalized
        return normalized;
    }

    return normalized;
}

/**
 * Detect country from phone number
 * 
 * @param {string} phone - Phone number
 * @returns {string} - Country code ('IN', 'US', 'CA', or 'UNKNOWN')
 */
export function detectCountry(phone) {
    if (!phone) return 'UNKNOWN';

    const normalized = normalizePhoneNumber(phone);

    if (normalized.startsWith('+91')) {
        return 'IN'; // India
    } else if (normalized.startsWith('+1')) {
        // Could be US or Canada - both use +1
        return 'US'; // Default to US (can't distinguish without area code lookup)
    }

    return 'UNKNOWN';
}

/**
 * Compare two phone numbers for equality
 * Handles different formats
 * 
 * @param {string} phone1 - First phone number
 * @param {string} phone2 - Second phone number
 * @returns {boolean} - True if numbers are the same
 */
export function arePhoneNumbersEqual(phone1, phone2) {
    if (!phone1 || !phone2) return false;

    const normalized1 = normalizePhoneNumber(phone1);
    const normalized2 = normalizePhoneNumber(phone2);

    // Direct comparison
    if (normalized1 === normalized2) return true;

    // Generate variations and check for overlap
    const variations1 = new Set(generatePhoneVariations(phone1));
    const variations2 = new Set(generatePhoneVariations(phone2));

    for (const v1 of variations1) {
        if (variations2.has(v1)) return true;
    }

    return false;
}

export default {
    normalizePhoneNumber,
    generatePhoneVariations,
    isValidPhoneNumber,
    formatPhoneNumber,
    detectCountry,
    arePhoneNumbersEqual
};