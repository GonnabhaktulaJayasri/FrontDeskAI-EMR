import fhirSearchService from './fhirSearchService.js';
import fhirService from './fhirService.js';

/**
 * Patient service - works directly with FHIR Patient resources
 */

/**
 * Update patient info from successful appointment booking
 */
export const updatePatientFromCall = async (fhirPatientId, appointmentData) => {
    try {
        // Get existing patient
        const result = await fhirService.getPatient(fhirPatientId);
        if (!result.success) {
            throw new Error('Patient not found');
        }

        const patient = result.data;

        // Update patient name if provided
        if (appointmentData.patient_name) {
            const nameParts = appointmentData.patient_name.split(' ');
            patient.name = [{
                use: 'official',
                family: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
                given: nameParts.slice(0, -1).length > 0 ? nameParts.slice(0, -1) : [nameParts[0]]
            }];
        }

        // Add extension for last appointment
        if (!patient.extension) {
            patient.extension = [];
        }

        // Update or add last appointment extension
        const lastApptExtIndex = patient.extension.findIndex(
            ext => ext.url === 'http://your-hospital.com/fhir/last-appointment'
        );

        const lastApptExt = {
            url: 'http://your-hospital.com/fhir/last-appointment',
            valueDateTime: new Date(`${appointmentData.date}T${appointmentData.time}:00`).toISOString()
        };

        if (lastApptExtIndex >= 0) {
            patient.extension[lastApptExtIndex] = lastApptExt;
        } else {
            patient.extension.push(lastApptExt);
        }

        // Add preferred doctor extension
        if (appointmentData.doctor_name) {
            const prefDocExtIndex = patient.extension.findIndex(
                ext => ext.url === 'http://your-hospital.com/fhir/preferred-doctor'
            );

            const prefDocExt = {
                url: 'http://your-hospital.com/fhir/preferred-doctor',
                valueString: appointmentData.doctor_name
            };

            if (prefDocExtIndex >= 0) {
                patient.extension[prefDocExtIndex] = prefDocExt;
            } else {
                patient.extension.push(prefDocExt);
            }
        }

        // Update patient in FHIR
        await fhirService.updatePatient(fhirPatientId, patient);
        console.log('Updated patient info from appointment booking');
        
        return { success: true };
    } catch (error) {
        console.error('Error updating patient from call:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Update patient information
 */
export const updatePatientInfo = async (fhirPatientId, info) => {
    try {
        // Get existing patient
        const result = await fhirService.getPatient(fhirPatientId);
        if (!result.success) {
            return { success: false, message: 'Patient not found' };
        }

        const patient = result.data;

        // Update name
        if (info.name) {
            const nameParts = info.name.split(' ');
            patient.name = [{
                use: 'official',
                family: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
                given: nameParts.slice(0, -1).length > 0 ? nameParts.slice(0, -1) : [nameParts[0]]
            }];
        }

        // Update age (calculate birthDate from age)
        if (info.age) {
            const currentYear = new Date().getFullYear();
            const birthYear = currentYear - parseInt(info.age);
            patient.birthDate = `${birthYear}-01-01`;
        }

        // Update gender
        if (info.gender) {
            patient.gender = info.gender.toLowerCase();
        }

        // Extensions
        if (!patient.extension) {
            patient.extension = [];
        }

        // Update preferred doctor
        if (info.preferred_doctor) {
            const prefDocExtIndex = patient.extension.findIndex(
                ext => ext.url === 'http://your-hospital.com/fhir/preferred-doctor'
            );

            const prefDocExt = {
                url: 'http://your-hospital.com/fhir/preferred-doctor',
                valueString: info.preferred_doctor
            };

            if (prefDocExtIndex >= 0) {
                patient.extension[prefDocExtIndex] = prefDocExt;
            } else {
                patient.extension.push(prefDocExt);
            }
        }

        // Update preferred time
        if (info.preferred_time) {
            const prefTimeExtIndex = patient.extension.findIndex(
                ext => ext.url === 'http://your-hospital.com/fhir/preferred-time'
            );

            const prefTimeExt = {
                url: 'http://your-hospital.com/fhir/preferred-time',
                valueString: info.preferred_time
            };

            if (prefTimeExtIndex >= 0) {
                patient.extension[prefTimeExtIndex] = prefTimeExt;
            } else {
                patient.extension.push(prefTimeExt);
            }
        }

        // Update patient in FHIR
        const updateResult = await fhirService.updatePatient(fhirPatientId, patient);
        
        if (updateResult.success) {
            return { success: true, message: 'Patient information updated successfully' };
        } else {
            return { success: false, message: 'Failed to update patient information' };
        }
    } catch (error) {
        console.error('Error updating patient info:', error);
        return { success: false, message: 'Failed to update patient information' };
    }
};

/**
 * Create a new patient in FHIR
 */
export const createPatient = async (patientData) => {
    try {
        const nameParts = patientData.name ? patientData.name.split(' ') : ['Unknown'];
        
        const fhirPatient = {
            resourceType: 'Patient',
            active: true,
            name: [{
                use: 'official',
                family: nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Not Provided',
                given: nameParts.slice(0, -1).length > 0 ? nameParts.slice(0, -1) : [nameParts[0]]
            }],
            telecom: []
        };

        // Add phone
        if (patientData.phone) {
            fhirPatient.telecom.push({
                system: 'phone',
                value: patientData.phone,
                use: 'mobile'
            });
        }

        // Add email
        if (patientData.email) {
            fhirPatient.telecom.push({
                system: 'email',
                value: patientData.email
            });
        }

        // Add birthDate
        if (patientData.age) {
            const currentYear = new Date().getFullYear();
            const birthYear = currentYear - parseInt(patientData.age);
            fhirPatient.birthDate = `${birthYear}-01-01`;
        } else if (patientData.dob) {
            fhirPatient.birthDate = new Date(patientData.dob).toISOString().split('T')[0];
        }

        // Add gender
        if (patientData.gender) {
            fhirPatient.gender = patientData.gender.toLowerCase();
        }

        const result = await fhirService.createPatient(fhirPatient);
        return result;
    } catch (error) {
        console.error('Error creating patient:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get patient by FHIR ID
 */
export const getPatient = async (fhirPatientId) => {
    try {
        return await fhirService.getPatient(fhirPatientId);
    } catch (error) {
        console.error('Error getting patient:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Search patients by phone number
 */
export const searchPatientByPhone = async (phone) => {
    try {
        return await fhirService.searchPatients({ telecom: phone });
    } catch (error) {
        console.error('Error searching patient by phone:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Search patients by name
 */
export const searchPatientByName = async (name) => {
    try {
        return await fhirService.searchPatients({ name: name });
    } catch (error) {
        console.error('Error searching patient by name:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Search patients by multiple criteria including date of birth
 */
export const searchPatientByDOB = async (firstName, lastName, dob) => {
    try {
        console.log(`Searching patient by DOB: ${firstName} ${lastName} born on ${dob}`);
        
        // FHIR search parameters
        const searchParams = {
            birthDate: dob  // FHIR standard parameter for date of birth
        };
        
        // Add name if provided
        if (firstName && lastName) {
            searchParams.name = `${firstName} ${lastName}`;
        } else if (firstName) {
            searchParams.given = firstName;
        } else if (lastName) {
            searchParams.family = lastName;
        }
        
        const result = await fhirService.searchPatients(searchParams);
        
        if (result.success && result.total > 0) {
            console.log(`Found ${result.total} patient(s) matching DOB search`);
            
            // If multiple results, try to narrow down by exact name match
            if (result.total > 1 && firstName && lastName) {
                const exactMatch = result.entries.find(entry => {
                    const patient = entry.resource;
                    const patientName = patient.name?.[0];
                    const givenMatch = patientName?.given?.some(g => 
                        g.toLowerCase() === firstName.toLowerCase()
                    );
                    const familyMatch = patientName?.family?.toLowerCase() === lastName.toLowerCase();
                    
                    return givenMatch && familyMatch;
                });
                
                if (exactMatch) {
                    console.log('Found exact name match in multiple results');
                    return {
                        success: true,
                        total: 1,
                        entries: [exactMatch]
                    };
                }
            }
        }
        
        return result;
    } catch (error) {
        console.error('Error searching patient by DOB:', error);
        return { 
            success: false, 
            error: error.message,
            total: 0,
            entries: []
        };
    }
};

/**
 * Check if a patient exists in the system
 * Searches by phone, then by name+DOB, then by DOB alone
 */
export const checkPatientExists = async (args, bookingType) => {
    try {
        console.log('Checking if patient exists:', args, 'Booking type:', bookingType);
        
        const { first_name, last_name, dob, phone, patient_phone } = args;
        
        // Determine which phone to search with
        const searchPhone = patient_phone || phone;
        
        // Validation
        if (!searchPhone && !first_name && !dob) {
            return {
                success: false,
                exists: false,
                message: 'Insufficient information to search for patient. Need at least phone, name, or date of birth.'
            };
        }
        
        let patientResult = null;
        let searchMethod = '';
        
        // ===== SEARCH STRATEGY 1: By Phone (Most Reliable) =====
        if (searchPhone) {
            console.log(`🔍 Searching by phone: ${searchPhone}`);
            patientResult = await searchPatientByPhone(searchPhone);
            searchMethod = 'phone';
            
            if (patientResult.success && patientResult.total > 0) {
                console.log(`✅ Found patient by phone number`);
            }
        }
        
        // ===== SEARCH STRATEGY 2: By Name + DOB =====
        if ((!patientResult || patientResult.total === 0) && first_name && dob) {
            console.log(`🔍 Searching by name and DOB: ${first_name} ${last_name || ''} (${dob})`);
            patientResult = await searchPatientByDOB(first_name, last_name, dob);
            searchMethod = 'name_and_dob';
            
            if (patientResult.success && patientResult.total > 0) {
                console.log(`✅ Found patient by name and date of birth`);
            }
        }
        
        // ===== SEARCH STRATEGY 3: By DOB Only =====
        if ((!patientResult || patientResult.total === 0) && dob && !first_name) {
            console.log(`🔍 Searching by DOB only: ${dob}`);
            patientResult = await fhirService.searchPatients({ birthdate: dob });
            searchMethod = 'dob_only';
            
            if (patientResult.success && patientResult.total > 0) {
                console.log(`✅ Found ${patientResult.total} patient(s) with date of birth ${dob}`);
                
                // Warn if multiple patients found
                if (patientResult.total > 1) {
                    console.log(`⚠️ Multiple patients found with same DOB - need more information to disambiguate`);
                }
            }
        }
        
        // ===== SEARCH STRATEGY 4: By Name Only (Least Reliable) =====
        if ((!patientResult || patientResult.total === 0) && first_name && !dob) {
            console.log(`🔍 Searching by name only: ${first_name} ${last_name || ''}`);
            const nameQuery = last_name ? `${first_name} ${last_name}` : first_name;
            patientResult = await searchPatientByName(nameQuery);
            searchMethod = 'name_only';
            
            if (patientResult.success && patientResult.total > 0) {
                console.log(`✅ Found ${patientResult.total} patient(s) by name`);
                
                if (patientResult.total > 1) {
                    console.log(`⚠️ Multiple patients found with same name - need DOB to confirm`);
                }
            }
        }
        
        // ===== PROCESS RESULTS =====
        if (patientResult && patientResult.success && patientResult.total > 0) {
            const patient = patientResult.entries[0].resource;
            const patientInfo = fhirSearchService.extractPatientInfo(patient);
            
            // Build detailed response
            const response = {
                success: true,
                exists: true,
                patient_found: true,
                patient_fhir_id: patient.id,
                patient_info: patientInfo,
                search_method: searchMethod,
                multiple_matches: patientResult.total > 1,
                total_matches: patientResult.total,
                message: patientResult.total === 1 
                    ? `Patient found: ${patientInfo.firstName} ${patientInfo.lastName} (Born: ${patientInfo.dob || 'N/A'})` 
                    : `Found ${patientResult.total} possible matches. Using: ${patientInfo.firstName} ${patientInfo.lastName}`,
                booking_type: bookingType
            };
            
            // Add action guidance based on booking type
            if (bookingType === 'self') {
                response.action_needed = 'Verify patient identity and proceed with booking';
            } else if (bookingType === 'family') {
                response.action_needed = 'Verify relationship and proceed with family member booking';
            } else if (bookingType === 'care_center') {
                response.action_needed = 'Verify care center authorization and proceed';
            }
            
            // Add warning if multiple matches
            if (patientResult.total > 1) {
                response.warning = 'Multiple patients matched search criteria. Please verify patient details.';
                response.verification_needed = true;
            }
            
            return response;
        }
        
        // ===== PATIENT NOT FOUND =====
        console.log('❌ Patient not found in system');
        
        const notFoundResponse = {
            success: true,
            exists: false,
            patient_found: false,
            search_attempted: searchMethod || 'multiple',
            searched_params: {
                phone: searchPhone || null,
                name: first_name && last_name ? `${first_name} ${last_name}` : first_name || null,
                dob: dob || null
            },
            booking_type: bookingType
        };
        
        // Customize message based on booking type
        if (bookingType === 'family') {
            notFoundResponse.message = `Family member ${first_name || ''} ${last_name || ''} not found in system. A new patient record will be created.`;
            notFoundResponse.action_needed = 'Collect complete patient information (name, DOB, phone) and create new record';
        } else if (bookingType === 'self') {
            notFoundResponse.message = 'You are not found in our system. A new patient record will be created for you.';
            notFoundResponse.action_needed = 'Collect complete patient information and create new record';
        } else {
            notFoundResponse.message = `Patient not found. Will create new patient record.`;
            notFoundResponse.action_needed = 'Collect complete patient information and create new record';
        }
        
        return notFoundResponse;
        
    } catch (error) {
        console.error('❌ Error checking patient exists:', error);
        return {
            success: false,
            exists: false,
            patient_found: false,
            message: 'Error checking patient existence in system',
            error: error.message,
            booking_type: bookingType
        };
    }
};