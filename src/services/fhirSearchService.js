import fhirService from './fhirService.js';
import { generatePhoneVariations, normalizePhoneNumber } from '../utils/phoneUtils.js';

/**
 * FHIR Search Service - Pure FHIR operations for searching and retrieving EMR data
 */
class FHIRSearchService {

    /**
     * Search for patient by phone number in FHIR server
     * Tries multiple phone formats to find existing patients
     */
    async findPatientByPhone(phoneNumber) {
        try {
            // Generate phone variations to handle different formats
            const phoneVariations = generatePhoneVariations(phoneNumber);
         
            // Try each phone variation
            for (const phoneVariation of phoneVariations) {
                const fhirSearchResult = await fhirService.searchPatients({
                    telecom: phoneVariation
                });

                if (fhirSearchResult.success && fhirSearchResult.total > 0) {
                
                    const fhirPatient = fhirSearchResult.entries[0].resource;

                    return {
                        success: true,
                        source: 'fhir',
                        patient: fhirPatient,
                        patientId: fhirPatient.id,
                        matchedPhone: phoneVariation
                    };
                }
            }

            console.log(`❌ Patient not found in FHIR with any phone format`);
            return {
                success: false,
                message: 'Patient not found'
            };

        } catch (error) {
            console.error('❌ Error in findPatientByPhone:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Search for patient by name in FHIR server
     */
    async findPatientByName(patientName) {
        try {
            console.log(`🔍 Searching FHIR for patient: ${patientName}`);

            const fhirSearchResult = await fhirService.searchPatients({
                name: patientName
            });

            if (!fhirSearchResult.success || fhirSearchResult.total === 0) {
                console.log(`❌ Patient not found in FHIR`);
                return {
                    success: false,
                    message: 'Patient not found'
                };
            }

            const fhirPatient = fhirSearchResult.entries[0].resource;
            console.log(`✅ Patient found in FHIR: ${fhirPatient.id}`);

            return {
                success: true,
                source: 'fhir',
                patient: fhirPatient,
                patientId: fhirPatient.id
            };

        } catch (error) {
            console.error('❌ Error finding patient by name:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Search for practitioner by name
     */
    async findPractitionerByName(practitionerName) {
        try {
            console.log(`🔍 Searching FHIR for practitioner: ${practitionerName}`);

            const fhirSearchResult = await fhirService.searchPractitioners({
                name: practitionerName
            });

            if (!fhirSearchResult.success || fhirSearchResult.total === 0) {
                console.log(`❌ Practitioner not found in FHIR`);
                return {
                    success: false,
                    message: 'Practitioner not found'
                };
            }

            const fhirPractitioner = fhirSearchResult.entries[0].resource;
            console.log(`✅ Practitioner found in FHIR: ${fhirPractitioner.id}`);

            return {
                success: true,
                source: 'fhir',
                practitioner: fhirPractitioner,
                practitionerId: fhirPractitioner.id
            };

        } catch (error) {
            console.error('❌ Error finding practitioner:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Search for practitioner by specialty
     */
    async findPractitionersBySpecialty(specialty) {
        try {
            console.log(`🔍 Searching FHIR for practitioners with specialty: ${specialty}`);

            // Get all practitioners
            const fhirSearchResult = await fhirService.searchPractitioners({});

            if (!fhirSearchResult.success || fhirSearchResult.total === 0) {
                return {
                    success: false,
                    message: 'No practitioners found'
                };
            }

            // Filter by specialty
            const matchingPractitioners = fhirSearchResult.entries
                .map(entry => entry.resource)
                .filter(prac => {
                    const qualifications = prac.qualification || [];
                    return qualifications.some(qual => {
                        const display = qual.code?.coding?.[0]?.display || '';
                        return display.toLowerCase().includes(specialty.toLowerCase());
                    });
                });

            if (matchingPractitioners.length === 0) {
                return {
                    success: false,
                    message: `No practitioners found with specialty: ${specialty}`
                };
            }

            console.log(`✅ Found ${matchingPractitioners.length} practitioners with specialty: ${specialty}`);

            return {
                success: true,
                source: 'fhir',
                practitioners: matchingPractitioners,
                total: matchingPractitioners.length
            };

        } catch (error) {
            console.error('❌ Error finding practitioners by specialty:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find appointments for a patient
     */
    async findPatientAppointments(patientId, options = {}) {
        try {
            console.log(`🔍 Searching appointments for patient: ${patientId}`);

            const searchParams = { patient: patientId };

            if (options.status) {
                searchParams.status = options.status;
            }

            if (options.date) {
                searchParams.date = options.date;
            }

            const result = await fhirService.searchAppointments(searchParams);

            if (!result.success) {
                return {
                    success: false,
                    error: result.error
                };
            }

            console.log(`✅ Found ${result.total} appointments`);

            return {
                success: true,
                appointments: result.entries.map(entry => entry.resource),
                total: result.total
            };

        } catch (error) {
            console.error('❌ Error finding patient appointments:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find appointments for a practitioner
     */
    async findPractitionerAppointments(practitionerId, options = {}) {
        try {
            console.log(`🔍 Searching appointments for practitioner: ${practitionerId}`);

            const searchParams = { practitioner: practitionerId };

            if (options.date) {
                searchParams.date = options.date;
            }

            const result = await fhirService.searchAppointments(searchParams);

            if (!result.success) {
                return {
                    success: false,
                    error: result.error
                };
            }

            console.log(`✅ Found ${result.total} appointments`);

            return {
                success: true,
                appointments: result.entries.map(entry => entry.resource),
                total: result.total
            };

        } catch (error) {
            console.error('❌ Error finding practitioner appointments:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Find patient's medication requests
     */
    async findPatientMedications(patientId, options = {}) {
        try {
            console.log(`🔍 Searching medications for patient: ${patientId}`);

            const searchParams = { patient: patientId };

            if (options.status) {
                searchParams.status = options.status;
            }

            const result = await fhirService.searchMedicationRequests(searchParams);

            if (!result.success) {
                return {
                    success: false,
                    error: result.error
                };
            }

            console.log(`✅ Found ${result.total} medication requests`);

            return {
                success: true,
                medications: result.entries.map(entry => entry.resource),
                total: result.total
            };

        } catch (error) {
            console.error('❌ Error finding patient medications:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Search for organization by name
     */
    async findOrganizationByName(organizationName) {
        try {
            console.log(`🔍 Searching FHIR for organization: ${organizationName}`);

            const fhirSearchResult = await fhirService.searchOrganizations({
                name: organizationName
            });

            if (!fhirSearchResult.success || fhirSearchResult.total === 0) {
                console.log(`❌ Organization not found in FHIR`);
                return {
                    success: false,
                    message: 'Organization not found'
                };
            }

            const fhirOrganization = fhirSearchResult.entries[0].resource;
            console.log(`✅ Organization found in FHIR: ${fhirOrganization.id}`);

            return {
                success: true,
                source: 'fhir',
                organization: fhirOrganization,
                organizationId: fhirOrganization.id
            };

        } catch (error) {
            console.error('❌ Error finding organization:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get patient's complete medical record
     */
    async getPatientMedicalRecord(patientId) {
        try {
            console.log(`🔍 Fetching complete medical record for patient: ${patientId}`);

            // Get patient demographics
            const patientResult = await fhirService.getPatient(patientId);
            if (!patientResult.success) {
                return { success: false, error: 'Patient not found' };
            }

            // Get appointments
            const appointmentsResult = await this.findPatientAppointments(patientId);

            // Get medications
            const medicationsResult = await this.findPatientMedications(patientId);

            console.log(`✅ Fetched complete medical record for patient: ${patientId}`);

            return {
                success: true,
                patient: patientResult.data,
                appointments: appointmentsResult.success ? appointmentsResult.appointments : [],
                medications: medicationsResult.success ? medicationsResult.medications : []
            };

        } catch (error) {
            console.error('❌ Error fetching patient medical record:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract patient information from FHIR Patient resource
     */
    extractPatientInfo(fhirPatient) {
        const name = fhirPatient.name?.[0] || {};
        const telecom = fhirPatient.telecom || [];

        const phoneObj = telecom.find(t => t.system === 'phone');
        let phone = phoneObj?.value || '';
        if (phone) {
            phone = normalizePhoneNumber(phone);
        }

        const emailObj = telecom.find(t => t.system === 'email');
        const email = emailObj?.value || '';

        const fullName = name.text || `${name.given?.join(' ') || ''} ${name.family || ''}`.trim();

        let age = null;
        if (fhirPatient.birthDate) {
            const birthDate = new Date(fhirPatient.birthDate);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
        }

        return {
            id: fhirPatient.id,
            name: fullName,
            firstName: name.given?.[0] || '',
            lastName: name.family || '',
            phone: phone,
            email: email,
            birthDate: fhirPatient.birthDate,
            age: age,
            gender: fhirPatient.gender
        };
    }

    /**
     * Extract practitioner information from FHIR Practitioner resource
     */
    extractPractitionerInfo(fhirPractitioner) {
        const name = fhirPractitioner.name?.[0] || {};
        const telecom = fhirPractitioner.telecom || [];

        const phoneObj = telecom.find(t => t.system === 'phone');
        let phone = phoneObj?.value || '';
        if (phone) {
            phone = normalizePhoneNumber(phone);
        }

        const emailObj = telecom.find(t => t.system === 'email');
        const email = emailObj?.value || '';

        const fullName = name.text || `${name.given?.join(' ') || ''} ${name.family || ''}`.trim();
        const specialty = fhirPractitioner.qualification?.[0]?.code?.coding?.[0]?.display || '';

        return {
            id: fhirPractitioner.id,
            name: fullName,
            phone: phone,
            email: email,
            specialty: specialty
        };
    }
    /**
     * Find organization by Twilio phone number
     * Uses identifier-based search which is supported by FHIR servers
     * Organizations should have an identifier like:
     * { system: 'http://hospital-system/twilio-phone', value: '+19499971087' }
     */
    async findOrganizationByTwilioPhone(phoneNumber) {
        try {
            console.log(`🔍 Searching for organization with Twilio phone: ${phoneNumber}`);

            // Search using identifier (supported by most FHIR servers)
            const fhirSearchResult = await fhirService.searchOrganizations({
                identifier: `http://hospital-system/twilio-phone|${phoneNumber}`
            });

            if (fhirSearchResult.success && fhirSearchResult.total > 0) {
                const organization = fhirSearchResult.entries[0].resource;
                console.log(`✅ Organization found: ${organization.name || organization.id}`);

                return {
                    success: true,
                    source: 'fhir',
                    organization: organization,
                    organizationId: organization.id
                };
            }

            console.log(`❌ Organization not found with Twilio phone: ${phoneNumber}`);
            return {
                success: false,
                message: 'Organization not found'
            };

        } catch (error) {
            console.error('❌ Error finding organization by Twilio phone:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract organization/hospital information from FHIR Organization resource
     */
    extractOrganizationInfo(fhirOrganization) {
        const telecom = fhirOrganization.telecom || [];

        // Find phone numbers
        const phoneObj = telecom.find(t => t.system === 'phone' && t.use === 'work');
        const phone = phoneObj?.value || '';

        // Find Twilio phone from identifier
        const twilioPhoneIdentifier = fhirOrganization.identifier?.find(id =>
            id.system === 'http://hospital-system/twilio-phone'
        );
        const twilioPhone = twilioPhoneIdentifier?.value || phone;

        // Find email
        const emailObj = telecom.find(t => t.system === 'email');
        const email = emailObj?.value || '';

        // Find website
        const websiteObj = telecom.find(t => t.system === 'url');
        const website = websiteObj?.value || '';

        // Get address
        const address = fhirOrganization.address?.[0]?.text || '';

        // Get hours from extensions if available
        const weekdayHoursExt = fhirOrganization.extension?.find(ext =>
            ext.url === 'http://hospital-system/weekday-hours'
        );
        const weekendHoursExt = fhirOrganization.extension?.find(ext =>
            ext.url === 'http://hospital-system/weekend-hours'
        );

        return {
            id: fhirOrganization.id,
            name: fhirOrganization.name || 'Unknown Organization',
            phone: phone,
            twilioPhone: twilioPhone,
            email: email,
            address: address,
            website: website,
            weekdayHours: weekdayHoursExt?.valueString || "8:00 AM - 8:00 PM",
            weekendHours: weekendHoursExt?.valueString || "9:00 AM - 5:00 PM",
            active: fhirOrganization.active !== false
        };
    }
}

export default new FHIRSearchService();