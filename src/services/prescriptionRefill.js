import fhirService from './fhirService.js';
import { searchPatientByPhone } from './patient.js';
import { searchDoctorByName } from './doctors.js';

/**
 * Prescription Refill service - works directly with FHIR MedicationRequest resources
 */

/**
 * Process prescription refill from call assistant
 * This is the main function called by callAssistant.js
 */
export const processPrescriptionRefill = async (args) => {
    try {
        console.log('Processing prescription refill:', args);

        const {
            patient_phone,
            patient_fhir_id,
            medication_name,
            doctor_name,
            reason
        } = args;

        // Find patient
        let patientId = patient_fhir_id;

        if (!patientId && patient_phone) {
            const patientResult = await searchPatientByPhone(patient_phone);
            
            if (!patientResult.success || patientResult.total === 0) {
                return { 
                    success: false, 
                    message: 'Patient not found. Please verify the phone number.'
                };
            }

            patientId = patientResult.entries[0].resource.id;
        }

        if (!patientId) {
            return {
                success: false,
                message: 'Unable to identify patient. Please provide patient information.'
            };
        }

        // Find practitioner if doctor name provided
        let practitionerId = null;
        if (doctor_name) {
            const doctorResult = await searchDoctorByName(doctor_name);
            if (doctorResult.success && doctorResult.doctors.length > 0) {
                practitionerId = doctorResult.doctors[0].id;
            }
        }

        // Create MedicationRequest
        const fhirMedicationRequest = {
            resourceType: 'MedicationRequest',
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: {
                text: medication_name
            },
            subject: {
                reference: `Patient/${patientId}`
            },
            authoredOn: new Date().toISOString(),
            reasonCode: reason ? [{
                text: reason
            }] : undefined,
            dosageInstruction: [{
                text: 'As prescribed'
            }]
        };

        // Add requester if practitioner found
        if (practitionerId) {
            fhirMedicationRequest.requester = {
                reference: `Practitioner/${practitionerId}`,
                display: doctor_name
            };
        }

        const result = await fhirService.createMedicationRequest(fhirMedicationRequest);

        if (result.success) {
            return {
                success: true,
                message: `Prescription refill for ${medication_name} has been requested successfully. Your pharmacy will be notified.`,
                medicationRequestId: result.fhirId,
                patientId: patientId,
                medicationName: medication_name,
                data: result.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to process prescription refill. Please try again or contact the pharmacy.',
                error: result.error
            };
        }
    } catch (error) {
        console.error('Error processing prescription refill:', error);
        return {
            success: false,
            message: 'Error processing prescription refill',
            error: error.message
        };
    }
};

/**
 * Request a prescription refill
 */
export const requestPrescriptionRefill = async ({
    patient_phone,
    medication_name,
    doctor_name,
    reason
}) => {
    try {
        // Find patient
        const patientResult = await searchPatientByPhone(patient_phone);
        
        if (!patientResult.success || patientResult.total === 0) {
            return { 
                success: false, 
                message: 'Patient not found'
            };
        }

        const patientId = patientResult.entries[0].resource.id;

        // Find practitioner
        let practitionerId = null;
        if (doctor_name) {
            const doctorResult = await searchDoctorByName(doctor_name);
            if (doctorResult.success && doctorResult.doctors.length > 0) {
                practitionerId = doctorResult.doctors[0].id;
            }
        }

        // Create MedicationRequest
        const fhirMedicationRequest = {
            resourceType: 'MedicationRequest',
            status: 'active',
            intent: 'order',
            medicationCodeableConcept: {
                text: medication_name
            },
            subject: {
                reference: `Patient/${patientId}`
            },
            authoredOn: new Date().toISOString(),
            reasonCode: reason ? [{
                text: reason
            }] : undefined,
            dosageInstruction: [{
                text: 'As prescribed'
            }]
        };

        // Add requester if practitioner found
        if (practitionerId) {
            fhirMedicationRequest.requester = {
                reference: `Practitioner/${practitionerId}`,
                display: doctor_name
            };
        }

        const result = await fhirService.createMedicationRequest(fhirMedicationRequest);

        if (result.success) {
            return {
                success: true,
                message: `Prescription refill requested for ${medication_name}`,
                medicationRequestId: result.fhirId,
                data: result.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to request prescription refill',
                error: result.error
            };
        }
    } catch (error) {
        console.error('Error requesting prescription refill:', error);
        return {
            success: false,
            message: 'Error requesting prescription refill',
            error: error.message
        };
    }
};

/**
 * Get prescription by ID
 */
export const getPrescription = async (medicationRequestId) => {
    try {
        return await fhirService.getMedicationRequest(medicationRequestId);
    } catch (error) {
        console.error('Error getting prescription:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get patient's prescriptions
 */
export const getPatientPrescriptions = async (patientId, status = null) => {
    try {
        const searchParams = { patient: patientId };
        if (status) {
            searchParams.status = status;
        }

        const result = await fhirService.searchMedicationRequests(searchParams);
        
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const prescriptions = result.entries.map(entry => {
            const medReq = entry.resource;
            
            return {
                id: medReq.id,
                medication: medReq.medicationCodeableConcept?.text || 
                           medReq.medicationCodeableConcept?.coding?.[0]?.display || 
                           'Unknown',
                status: medReq.status,
                authoredOn: medReq.authoredOn,
                prescriber: medReq.requester?.display || 'Unknown',
                dosage: medReq.dosageInstruction?.[0]?.text || 'As prescribed',
                reason: medReq.reasonCode?.[0]?.text || ''
            };
        });

        return { success: true, prescriptions, total: result.total };
    } catch (error) {
        console.error('Error getting patient prescriptions:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Update prescription status
 */
export const updatePrescriptionStatus = async (medicationRequestId, status) => {
    try {
        // Get existing medication request
        const getResult = await fhirService.getMedicationRequest(medicationRequestId);
        
        if (!getResult.success) {
            return { success: false, message: 'Prescription not found' };
        }

        const medReq = getResult.data;
        medReq.status = status;

        const updateResult = await fhirService.updateMedicationRequest(medicationRequestId, medReq);

        if (updateResult.success) {
            return {
                success: true,
                message: `Prescription status updated to ${status}`,
                data: updateResult.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to update prescription status',
                error: updateResult.error
            };
        }
    } catch (error) {
        console.error('Error updating prescription status:', error);
        return {
            success: false,
            message: 'Error updating prescription status',
            error: error.message
        };
    }
};

/**
 * Cancel prescription
 */
export const cancelPrescription = async (medicationRequestId) => {
    try {
        return await updatePrescriptionStatus(medicationRequestId, 'cancelled');
    } catch (error) {
        console.error('Error cancelling prescription:', error);
        return {
            success: false,
            message: 'Error cancelling prescription',
            error: error.message
        };
    }
};

/**
 * Complete prescription (mark as dispensed)
 */
export const completePrescription = async (medicationRequestId) => {
    try {
        return await updatePrescriptionStatus(medicationRequestId, 'completed');
    } catch (error) {
        console.error('Error completing prescription:', error);
        return {
            success: false,
            message: 'Error completing prescription',
            error: error.message
        };
    }
};

/**
 * Search for active prescriptions by medication name
 */
export const searchActivePrescriptions = async (patientId, medicationName) => {
    try {
        const result = await fhirService.searchMedicationRequests({
            patient: patientId,
            status: 'active'
        });
        
        if (!result.success) {
            return { success: false, error: result.error };
        }

        // Filter by medication name
        const filteredPrescriptions = result.entries
            .map(entry => entry.resource)
            .filter(medReq => {
                const medName = medReq.medicationCodeableConcept?.text || 
                              medReq.medicationCodeableConcept?.coding?.[0]?.display || '';
                return medName.toLowerCase().includes(medicationName.toLowerCase());
            })
            .map(medReq => ({
                id: medReq.id,
                medication: medReq.medicationCodeableConcept?.text || 
                           medReq.medicationCodeableConcept?.coding?.[0]?.display || 
                           'Unknown',
                status: medReq.status,
                authoredOn: medReq.authoredOn,
                prescriber: medReq.requester?.display || 'Unknown',
                dosage: medReq.dosageInstruction?.[0]?.text || 'As prescribed'
            }));

        return { 
            success: true, 
            prescriptions: filteredPrescriptions, 
            total: filteredPrescriptions.length 
        };
    } catch (error) {
        console.error('Error searching active prescriptions:', error);
        return { success: false, error: error.message };
    }
};

export default {
    processPrescriptionRefill,
    requestPrescriptionRefill,
    getPrescription,
    getPatientPrescriptions,
    updatePrescriptionStatus,
    cancelPrescription,
    completePrescription,
    searchActivePrescriptions
};