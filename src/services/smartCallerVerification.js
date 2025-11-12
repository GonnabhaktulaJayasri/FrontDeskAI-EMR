import fhirSearchService from './fhirSearchService.js';
import { getPatientRelatedPersons } from './relatedPerson.js';
import { normalizePhoneNumber } from './utils/phoneUtils.js';

/**
 * Enhanced caller verification with name matching
 * First checks phone number, then verifies by asking caller's name
 */
export const verifyCallerByName = async (callerPhone, callerProvidedName) => {
    try {
        const normalizedCallerPhone = normalizePhoneNumber(callerPhone);
        
        // Step 1: Look up patient by phone number
        const patientResult = await fhirSearchService.findPatientByPhone(normalizedCallerPhone);
        
        if (!patientResult.success) {
            // Phone not in system - new caller
            return {
                success: true,
                verified: false,
                callerType: 'new_caller',
                nameMatches: false,
                patientFound: false,
                message: 'Phone number not found in system',
                callerName: callerProvidedName,
                needsRegistration: true
            };
        }
        
        // Step 2: Extract patient info from FHIR
        const patientData = fhirSearchService.extractPatientInfo(patientResult.patient);
        const patientFhirId = patientResult.patientId;
        const patientFullName = `${patientData.firstName} ${patientData.lastName}`.toLowerCase();
        const callerNameLower = callerProvidedName.toLowerCase().trim();
        
        // Step 3: Compare names (flexible matching)
        const nameMatches = isNameMatch(callerNameLower, patientData.firstName, patientData.lastName);
        
        if (nameMatches) {
            // SCENARIO 1: Names match - caller IS the patient
            return {
                success: true,
                verified: true,
                callerType: 'patient',
                nameMatches: true,
                patientFound: true,
                patientFhirId: patientFhirId,
                patientData: patientData,
                callerName: callerProvidedName,
                callerIsPatient: true,
                message: `Verified: ${patientData.firstName} ${patientData.lastName}`,
                bookingMode: 'self' // Automatically use self-booking mode
            };
        } else {
            // SCENARIO 2: Names don't match - someone calling on behalf of patient
            return {
                success: true,
                verified: false, // Need to verify relationship
                callerType: 'family_or_caregiver',
                nameMatches: false,
                patientFound: true,
                patientFhirId: patientFhirId,
                patientData: patientData,
                callerName: callerProvidedName,
                callerIsPatient: false,
                message: `Caller "${callerProvidedName}" is calling from ${patientData.firstName} ${patientData.lastName}'s phone`,
                needsRelationshipVerification: true,
                bookingMode: 'family' // Automatically use family booking mode
            };
        }
        
    } catch (error) {
        console.error('Error verifying caller by name:', error);
        return {
            success: false,
            verified: false,
            error: error.message,
            message: 'Error during verification'
        };
    }
};

/**
 * Verify relationship after name mismatch
 * Confirms the caller has authorization to access patient info
 */
export const verifyRelationship = async (callerName, callerPhone, patientFhirId, relationship) => {
    try {
        // Check if this relationship already exists in FHIR
        const relatedPersons = await getPatientRelatedPersons(patientFhirId);
        
        let existingRelationship = null;
        if (relatedPersons.success && relatedPersons.relatedPersons) {
            // Check if caller's phone matches any related person
            existingRelationship = relatedPersons.relatedPersons.find(rp => 
                normalizePhoneNumber(rp.phone) === normalizePhoneNumber(callerPhone)
            );
        }
        
        if (existingRelationship) {
            // Relationship already exists
            return {
                success: true,
                verified: true,
                relationshipExists: true,
                relationship: existingRelationship.relationship,
                callerName: callerName,
                message: `Verified: ${callerName} is ${existingRelationship.relationship}`,
                requiresCreation: false
            };
        } else {
            // New relationship - needs to be created
            return {
                success: true,
                verified: true,
                relationshipExists: false,
                relationship: relationship,
                callerName: callerName,
                message: `New relationship: ${callerName} is ${relationship}`,
                requiresCreation: true,
                shouldCreateRelatedPerson: true
            };
        }
        
    } catch (error) {
        console.error('Error verifying relationship:', error);
        return {
            success: false,
            verified: false,
            error: error.message
        };
    }
};

/**
 * Smart name matching - handles various formats
 */
const isNameMatch = (callerName, patientFirstName, patientLastName) => {
    const caller = callerName.toLowerCase().trim();
    const firstName = patientFirstName?.toLowerCase().trim() || '';
    const lastName = patientLastName?.toLowerCase().trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    
    // Exact match
    if (caller === fullName || caller === firstName || caller === `${firstName} ${lastName}`) {
        return true;
    }
    
    // First name only match
    if (caller === firstName) {
        return true;
    }
    
    // Last name only match
    if (caller === lastName) {
        return true;
    }
    
    // Contains first name and last name
    if (caller.includes(firstName) && caller.includes(lastName)) {
        return true;
    }
    
    // Handle nicknames and variations (could be expanded)
    const callerParts = caller.split(/\s+/);
    const firstNameMatch = callerParts.some(part => part === firstName);
    const lastNameMatch = callerParts.some(part => part === lastName);
    
    if (firstNameMatch || lastNameMatch) {
        return true;
    }
    
    return false;
};

/**
 * Create caller context with smart booking mode
 */
export const createCallerContext = (verificationResult, relationship = null) => {
    const context = {
        verified: verificationResult.verified,
        callerName: verificationResult.callerName,
        callerIsPatient: verificationResult.callerIsPatient,
        patientFhirId: verificationResult.patientFhirId,
        patientData: verificationResult.patientData,
        bookingMode: verificationResult.bookingMode, // 'self' or 'family'
        relationship: relationship || (verificationResult.callerIsPatient ? 'self' : null)
    };
    
    return context;
};

/**
 * Get smart greeting message based on verification
 */
export const getSmartGreeting = (verificationResult, hospitalName) => {
    if (verificationResult.callerIsPatient) {
        // Caller IS the patient
        return {
            greeting: `Hello ${verificationResult.patientData.firstName}! Thank you for calling ${hospitalName}. How can I help you today?`,
            mode: 'patient_mode',
            instructions: 'Caller is the patient. Use "you" and "your" when referring to appointments and information.'
        };
    } else if (verificationResult.nameMatches === false && verificationResult.patientFound) {
        // Someone calling FROM patient's phone
        return {
            greeting: `Hello ${verificationResult.callerName}! I see you're calling from ${verificationResult.patientData.firstName}'s phone. What is your relationship to ${verificationResult.patientData.firstName}?`,
            mode: 'family_mode',
            instructions: `Caller is calling on behalf of ${verificationResult.patientData.firstName}. After confirming relationship, use "their/them" when referring to patient, or patient's name.`
        };
    } else {
        // New caller
        return {
            greeting: `Hello ${verificationResult.callerName}! Thank you for calling ${hospitalName}. How can I help you today?`,
            mode: 'new_caller_mode',
            instructions: 'New caller. Collect information and assist with registration if needed.'
        };
    }
};

/**
 * Smart booking helper - determines booking parameters automatically
 */
export const prepareSmartBooking = (callerContext, appointmentDetails) => {
    if (callerContext.bookingMode === 'self') {
        // Booking for themselves
        return {
            booking_type: 'self',
            caller_phone: callerContext.patientData.phone,
            patient_fhir_id: callerContext.patientFhirId,
            // Use existing patient data
            use_existing_patient: true,
            confirmation_message: `I'm booking your appointment with ${appointmentDetails.doctor_name}`
        };
    } else if (callerContext.bookingMode === 'family') {
        // Booking for family member (the patient whose phone they're using)
        return {
            booking_type: 'family',
            caller_phone: callerContext.patientData.phone, // The phone number
            patient_fhir_id: callerContext.patientFhirId, // Book for THIS patient
            patient_firstname: callerContext.patientData.firstName,
            patient_lastname: callerContext.patientData.lastName,
            patient_phone: callerContext.patientData.phone,
            patient_dob: callerContext.patientData.dob,
            relationship: callerContext.relationship,
            // Use existing patient data
            use_existing_patient: true,
            confirmation_message: `I'm booking an appointment for ${callerContext.patientData.firstName} with ${appointmentDetails.doctor_name}`
        };
    }
};

export default {
    verifyCallerByName,
    verifyRelationship,
    createCallerContext,
    getSmartGreeting,
    prepareSmartBooking
};