import fhirService from './fhirService.js';

/**
 * Call Log service - uses FHIR Encounter resources for call tracking
 * Encounter represents a contact between a patient and healthcare provider
 */

/**
 * Create a call log (Encounter)
 */
export const createCallLog = async (callData) => {
    try {
        const fhirEncounter = {
            resourceType: 'Encounter',
            status: callData.status || 'in-progress',
            class: {
                system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
                code: 'VR', // Virtual encounter
                display: 'virtual'
            },
            type: [{
                text: callData.callType || 'Phone Call'
            }],
            subject: callData.patientId ? {
                reference: `Patient/${callData.patientId}`
            } : undefined,
            period: {
                start: callData.startTime || new Date().toISOString()
            },
            extension: []
        };

        // Add call-specific extensions
        if (callData.phoneNumber) {
            fhirEncounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-phone',
                valueString: callData.phoneNumber
            });
        }

        if (callData.callSid) {
            fhirEncounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-sid',
                valueString: callData.callSid
            });
        }

        if (callData.direction) {
            fhirEncounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-direction',
                valueString: callData.direction // 'inbound' or 'outbound'
            });
        }

        if (callData.purpose) {
            fhirEncounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-purpose',
                valueString: callData.purpose
            });
        }

        const result = await fhirService.createEncounter(fhirEncounter);
        return result;
    } catch (error) {
        console.error('Error creating call log:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Update call log
 */
export const updateCallLog = async (encounterId, updates) => {
    try {
        // Get existing encounter
        const getResult = await fhirService.getEncounter(encounterId);
        if (!getResult.success) {
            return { success: false, message: 'Call log not found' };
        }

        const encounter = getResult.data;

        // Update status
        if (updates.status) {
            encounter.status = updates.status;
        }

        // Update end time
        if (updates.endTime) {
            encounter.period.end = updates.endTime;
        }

        // Add transcript
        if (updates.transcript) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-transcript',
                valueString: typeof updates.transcript === 'string'
                    ? updates.transcript
                    : JSON.stringify(updates.transcript)
            });
        }

        // Add action taken
        if (updates.actionTaken) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/action-taken',
                valueString: updates.actionTaken
            });
        }

        // Add transfer information
        if (updates.transferReason) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/transfer-reason',
                valueString: updates.transferReason
            });
        }

        if (updates.transferDepartment) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/transfer-department',
                valueString: updates.transferDepartment
            });
        }

        if (updates.transferredAt) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/transferred-at',
                valueDateTime: updates.transferredAt
            });
        }

        // Add notes
        if (updates.notes) {
            if (!encounter.extension) {
                encounter.extension = [];
            }

            encounter.extension.push({
                url: 'http://your-hospital.com/fhir/call-notes',
                valueString: updates.notes
            });
        }

        const result = await fhirService.updateEncounter(encounterId, encounter);
        return result;
    } catch (error) {
        console.error('Error updating call log:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get call log by ID
 */
export const getCallLog = async (encounterId) => {
    try {
        return await fhirService.getEncounter(encounterId);
    } catch (error) {
        console.error('Error getting call log:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get call logs for a patient
 */
export const getPatientCallLogs = async (patientId) => {
    try {
        const result = await fhirService.searchEncounters({
            patient: patientId,
            class: 'VR' // Virtual encounters (calls)
        });

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const callLogs = result.entries.map(entry => {
            const encounter = entry.resource;

            // Extract extensions
            const phoneExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-phone'
            );
            const callSidExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-sid'
            );
            const directionExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-direction'
            );
            const transcriptExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-transcript'
            );

            return {
                id: encounter.id,
                status: encounter.status,
                callType: encounter.type?.[0]?.text,
                phoneNumber: phoneExt?.valueString,
                callSid: callSidExt?.valueString,
                direction: directionExt?.valueString,
                startTime: encounter.period?.start,
                endTime: encounter.period?.end,
                transcript: transcriptExt?.valueString,
                patientId: encounter.subject?.reference?.split('/')[1]
            };
        });

        return { success: true, callLogs, total: result.total };
    } catch (error) {
        console.error('Error getting patient call logs:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Finalize call log (mark as finished)
 */
export const finalizeCallLog = async (encounterId, finalData = {}) => {
    try {
        const updates = {
            status: 'finished',
            endTime: new Date().toISOString(),
            ...finalData
        };

        return await updateCallLog(encounterId, updates);
    } catch (error) {
        console.error('Error finalizing call log:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Search call logs with filters
 */
export const searchCallLogs = async (filters = {}) => {
    try {
        const searchParams = {
            class: 'VR' // Virtual encounters only
        };

        if (filters.patient) {
            searchParams.patient = filters.patient;
        }

        if (filters.date) {
            searchParams.date = filters.date;
        }

        if (filters.status) {
            searchParams.status = filters.status;
        }

        const result = await fhirService.searchEncounters(searchParams);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const callLogs = result.entries.map(entry => {
            const encounter = entry.resource;

            const phoneExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-phone'
            );
            const directionExt = encounter.extension?.find(
                ext => ext.url === 'http://your-hospital.com/fhir/call-direction'
            );

            return {
                id: encounter.id,
                status: encounter.status,
                callType: encounter.type?.[0]?.text,
                phoneNumber: phoneExt?.valueString,
                direction: directionExt?.valueString,
                startTime: encounter.period?.start,
                endTime: encounter.period?.end,
                patientId: encounter.subject?.reference?.split('/')[1]
            };
        });

        return { success: true, callLogs, total: result.total };
    } catch (error) {
        console.error('Error searching call logs:', error);
        return { success: false, error: error.message };
    }
};

export default {
    createCallLog,
    updateCallLog,
    getCallLog,
    getPatientCallLogs,
    finalizeCallLog,
    searchCallLogs
};