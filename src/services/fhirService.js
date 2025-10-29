import axios from 'axios';
import 'dotenv/config';

const FHIR_BASE_URL = process.env.FHIR_BASE_URL || 'https://hapi.fhir.org/baseR4';

/**
 * FHIR Service - Pure FHIR operations without MongoDB
 * Updated with cascade delete support
 */
class FHIRService {
    constructor() {
        this.baseURL = FHIR_BASE_URL;
        this.axios = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/fhir+json',
                'Accept': 'application/fhir+json'
            }
        });
    }

    // ==================== PATIENT OPERATIONS ====================

    /**
     * Create Patient in FHIR server
     */
    async createPatient(fhirPatient) {
        try {
            const response = await this.axios.post('/Patient', fhirPatient);

            console.log('✅ Patient created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR patient:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Patient in FHIR server
     */
    async updatePatient(fhirId, fhirPatient) {
        try {
            fhirPatient.id = fhirId;
            const response = await this.axios.put(`/Patient/${fhirId}`, fhirPatient);

            console.log('✅ Patient updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR patient:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Patient from FHIR server
     */
    async getPatient(fhirId) {
        try {
            const response = await this.axios.get(`/Patient/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR patient:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Patients in FHIR server
     */
    async searchPatients(searchParams) {
        try {
            const response = await this.axios.get('/Patient', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR patients:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Patient from FHIR server with cascade delete
     */
    async deletePatient(fhirId) {
        try {
            await this.axios.delete(`/Patient/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Patient deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Patient deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR patient:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== PRACTITIONER OPERATIONS ====================

    /**
     * Create Practitioner in FHIR server
     */
    async createPractitioner(fhirPractitioner) {
        try {
            const response = await this.axios.post('/Practitioner', fhirPractitioner);

            console.log('✅ Practitioner created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR practitioner:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Practitioner in FHIR server
     */
    async updatePractitioner(fhirId, fhirPractitioner) {
        try {
            fhirPractitioner.id = fhirId;
            const response = await this.axios.put(`/Practitioner/${fhirId}`, fhirPractitioner);

            console.log('✅ Practitioner updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR practitioner:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Practitioner from FHIR server
     */
    async getPractitioner(fhirId) {
        try {
            const response = await this.axios.get(`/Practitioner/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR practitioner:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Practitioners in FHIR server
     */
    async searchPractitioners(searchParams) {
        try {
            const response = await this.axios.get('/Practitioner', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR practitioners:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Practitioner from FHIR server with cascade delete
     */
    async deletePractitioner(fhirId) {
        try {
            await this.axios.delete(`/Practitioner/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Practitioner deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Practitioner deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR practitioner:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== APPOINTMENT OPERATIONS ====================

    /**
     * Create Appointment in FHIR server
     */
    async createAppointment(fhirAppointment) {
        try {
            const response = await this.axios.post('/Appointment', fhirAppointment);

            console.log('✅ Appointment created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR appointment:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Appointment in FHIR server
     */
    async updateAppointment(fhirId, fhirAppointment) {
        try {
            fhirAppointment.id = fhirId;
            const response = await this.axios.put(`/Appointment/${fhirId}`, fhirAppointment);

            console.log('✅ Appointment updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR appointment:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Appointment from FHIR server
     */
    async getAppointment(fhirId) {
        try {
            const response = await this.axios.get(`/Appointment/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR appointment:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Appointments in FHIR server
     */
    async searchAppointments(searchParams) {
        try {
            const response = await this.axios.get('/Appointment', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR appointments:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Appointment from FHIR server with cascade delete
     */
    async deleteAppointment(fhirId) {
        try {
            await this.axios.delete(`/Appointment/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Appointment deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Appointment deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR appointment:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== MEDICATION REQUEST OPERATIONS ====================

    /**
     * Create MedicationRequest in FHIR server
     */
    async createMedicationRequest(fhirMedicationRequest) {
        try {
            const response = await this.axios.post('/MedicationRequest', fhirMedicationRequest);

            console.log('✅ MedicationRequest created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR MedicationRequest:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update MedicationRequest in FHIR server
     */
    async updateMedicationRequest(fhirId, fhirMedicationRequest) {
        try {
            fhirMedicationRequest.id = fhirId;
            const response = await this.axios.put(`/MedicationRequest/${fhirId}`, fhirMedicationRequest);

            console.log('✅ MedicationRequest updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR MedicationRequest:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get MedicationRequest from FHIR server
     */
    async getMedicationRequest(fhirId) {
        try {
            const response = await this.axios.get(`/MedicationRequest/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR MedicationRequest:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search MedicationRequests in FHIR server
     */
    async searchMedicationRequests(searchParams) {
        try {
            const response = await this.axios.get('/MedicationRequest', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR MedicationRequests:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== ORGANIZATION OPERATIONS ====================

    /**
     * Create Organization in FHIR server
     */
    async createOrganization(fhirOrganization) {
        try {
            const response = await this.axios.post('/Organization', fhirOrganization);

            console.log('✅ Organization created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR organization:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Organization in FHIR server
     */
    async updateOrganization(fhirId, fhirOrganization) {
        try {
            fhirOrganization.id = fhirId;
            const response = await this.axios.put(`/Organization/${fhirId}`, fhirOrganization);

            console.log('✅ Organization updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR organization:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Organization from FHIR server
     */
    async getOrganization(fhirId) {
        try {
            const response = await this.axios.get(`/Organization/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR organization:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Organizations in FHIR server
     */
    async searchOrganizations(searchParams) {
        try {
            const response = await this.axios.get('/Organization', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR organizations:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Organization from FHIR server with cascade delete
     */
    async deleteOrganization(fhirId) {
        try {
            await this.axios.delete(`/Organization/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Organization deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Organization deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR organization:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== PRACTITIONER ROLE OPERATIONS ====================

    /**
     * Search PractitionerRole in FHIR server
     */
    async searchPractitionerRoles(searchParams) {
        try {
            const response = await this.axios.get('/PractitionerRole', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR practitioner roles:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== SLOT OPERATIONS ====================

    /**
     * Create Slot in FHIR server
     */
    async createSlot(fhirSlot) {
        try {
            const response = await this.axios.post('/Slot', fhirSlot);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR slot:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Slot from FHIR server
     */
    async getSlot(slotId) {
        try {
            const response = await this.axios.get(`/Slot/${slotId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error getting FHIR slot:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Slot in FHIR server
     */
    async updateSlot(slotId, fhirSlot) {
        try {
            const response = await this.axios.put(`/Slot/${slotId}`, fhirSlot);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR slot:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Slots in FHIR server
     */
    async searchSlots(searchParams) {
        try {
            const response = await this.axios.get('/Slot', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR slots:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Slot from FHIR server with cascade delete
     */
    async deleteSlot(fhirId) {
        try {
            await this.axios.delete(`/Slot/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Slot deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Slot deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR slot:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== SCHEDULE OPERATIONS ====================

    /**
     * Create Schedule in FHIR server
     */
    async createSchedule(fhirSchedule) {
        try {
            const response = await this.axios.post('/Schedule', fhirSchedule);

            console.log('✅ Schedule created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR schedule:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Schedule from FHIR server
     */
    async getSchedule(scheduleId) {
        try {
            const response = await this.axios.get(`/Schedule/${scheduleId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error getting FHIR schedule:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Schedule in FHIR server
     */
    async updateSchedule(scheduleId, fhirSchedule) {
        try {
            const response = await this.axios.put(`/Schedule/${scheduleId}`, fhirSchedule);

            console.log('✅ Schedule updated in FHIR server:', scheduleId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR schedule:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Schedules in FHIR server
     */
    async searchSchedules(searchParams) {
        try {
            const response = await this.axios.get('/Schedule', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR schedules:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Schedule from FHIR server with cascade delete
     */
    async deleteSchedule(fhirId) {
        try {
            await this.axios.delete(`/Schedule/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Schedule deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Schedule deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR schedule:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== ENCOUNTER OPERATIONS ====================

    /**
     * Create Encounter in FHIR server
     */
    async createEncounter(fhirEncounter) {
        try {
            const response = await this.axios.post('/Encounter', fhirEncounter);

            console.log('✅ Encounter created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR encounter:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Encounter in FHIR server
     */
    async updateEncounter(fhirId, fhirEncounter) {
        try {
            fhirEncounter.id = fhirId;
            const response = await this.axios.put(`/Encounter/${fhirId}`, fhirEncounter);

            console.log('✅ Encounter updated in FHIR server:', fhirId);

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR encounter:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Encounter from FHIR server
     */
    async getEncounter(fhirId) {
        try {
            const response = await this.axios.get(`/Encounter/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR encounter:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Encounters in FHIR server
     */
    async searchEncounters(searchParams) {
        try {
            const response = await this.axios.get('/Encounter', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR encounters:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== COMMUNICATION OPERATIONS ====================
    // Added for Call Logs and Messaging Support

    /**
     * Create Communication in FHIR server
     * Used for: Call logs, Messages, SMS, WhatsApp communications
     */
    async createCommunication(fhirCommunication) {
        try {
            const response = await this.axios.post('/Communication', fhirCommunication);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR communication:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Update Communication in FHIR server
     */
    async updateCommunication(fhirId, fhirCommunication) {
        try {
            fhirCommunication.id = fhirId;
            const response = await this.axios.put(`/Communication/${fhirId}`, fhirCommunication);
            
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error updating FHIR communication:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Get Communication from FHIR server
     */
    async getCommunication(fhirId) {
        try {
            const response = await this.axios.get(`/Communication/${fhirId}`);
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error fetching FHIR communication:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search Communications in FHIR server
     * Common search parameters:
     * - subject: Patient reference (e.g., "Patient/123")
     * - sent: Date sent (e.g., "ge2024-01-01")
     * - received: Date received
     * - category: Communication category
     * - medium: Communication medium (e.g., phone, email, sms)
     * - status: Communication status (preparation, in-progress, completed, etc.)
     * - based-on: Reference to related resource (e.g., Appointment)
     * - sender: Reference to sender
     * - recipient: Reference to recipient
     */
    async searchCommunications(searchParams) {
        try {
            const response = await this.axios.get('/Communication', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR communications:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete Communication from FHIR server with cascade delete
     */
    async deleteCommunication(fhirId) {
        try {
            await this.axios.delete(`/Communication/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ Communication deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'Communication deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR communication:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== RELATED PERSON OPERATIONS ====================

    /**
     * Create RelatedPerson in FHIR server
     */
    async createRelatedPerson(fhirRelatedPerson) {
        try {
            const response = await this.axios.post('/RelatedPerson', fhirRelatedPerson);

            console.log('✅ RelatedPerson created in FHIR server:', response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error('❌ Error creating FHIR RelatedPerson:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Search RelatedPersons in FHIR server
     */
    async searchRelatedPersons(searchParams) {
        try {
            const response = await this.axios.get('/RelatedPerson', { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error('❌ Error searching FHIR RelatedPersons:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Delete RelatedPerson from FHIR server with cascade delete
     */
    async deleteRelatedPerson(fhirId) {
        try {
            await this.axios.delete(`/RelatedPerson/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log('✅ RelatedPerson deleted from FHIR server:', fhirId);

            return {
                success: true,
                message: 'RelatedPerson deleted successfully'
            };
        } catch (error) {
            console.error('❌ Error deleting FHIR RelatedPerson:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    // ==================== GENERIC OPERATIONS ====================

    /**
     * Generic create resource method
     */
    async createResource(fhirResource) {
        try {
            const resourceType = fhirResource.resourceType;
            const response = await this.axios.post(`/${resourceType}`, fhirResource);

            console.log(`✅ ${resourceType} created in FHIR server:`, response.data.id);

            return {
                success: true,
                fhirId: response.data.id,
                data: response.data
            };
        } catch (error) {
            console.error(`❌ Error creating FHIR ${fhirResource.resourceType}:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Generic search resources method
     */
    async searchResources(resourceType, searchParams) {
        try {
            const response = await this.axios.get(`/${resourceType}`, { params: searchParams });
            return {
                success: true,
                data: response.data,
                total: response.data.total,
                entries: response.data.entry || []
            };
        } catch (error) {
            console.error(`❌ Error searching FHIR ${resourceType}:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Generic delete resource method with cascade delete support
     */
    async deleteResource(resourceType, fhirId) {
        try {
            await this.axios.delete(`/${resourceType}/${fhirId}`, {
                params: { _cascade: 'delete' }
            });

            console.log(`✅ ${resourceType} deleted from FHIR server:`, fhirId);

            return {
                success: true,
                message: `${resourceType} deleted successfully`
            };
        } catch (error) {
            console.error(`❌ Error deleting FHIR ${resourceType}:`, error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }
}

export default new FHIRService();