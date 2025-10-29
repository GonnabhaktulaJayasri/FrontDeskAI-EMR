import fhirService from './fhirService.js';

/**
 * Create a relationship between a patient and related person
 */
export const linkRelatedPerson = async (patientId, relatedPersonId, relationship, phone) => {
    try {
        const relatedPerson = {
            resourceType: 'RelatedPerson',
            active: true,
            patient: {
                reference: `Patient/${patientId}`,
                display: `Patient/${patientId}`
            },
            relationship: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
                    code: mapRelationshipCode(relationship),
                    display: relationship
                }]
            }],
            telecom: [{
                system: 'phone',
                value: phone,
                use: 'mobile'
            }]
        };

        return await fhirService.createRelatedPerson(relatedPerson);
    } catch (error) {
        console.error('Error linking related person:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get all related persons for a patient
 */
export const getPatientRelatedPersons = async (patientId) => {
    try {
        const result = await fhirService.searchRelatedPersons({
            patient: patientId
        });

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const relatedPersons = result.entries.map(entry => {
            const rp = entry.resource;
            return {
                id: rp.id,
                name: rp.name?.[0]?.text || 'Unknown',
                relationship: rp.relationship?.[0]?.coding?.[0]?.display || 'Unknown',
                phone: rp.telecom?.find(t => t.system === 'phone')?.value || null,
                active: rp.active
            };
        });

        return { success: true, relatedPersons };
    } catch (error) {
        console.error('Error getting related persons:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Map relationship string to FHIR code
 */
const mapRelationshipCode = (relationship) => {
    const mapping = {
        'self': 'ONESELF',
        'parent': 'PRN',
        'mother': 'MTH',
        'father': 'FTH',
        'child': 'CHILD',
        'son': 'SON',
        'daughter': 'DAU',
        'spouse': 'SPS',
        'husband': 'HUSB',
        'wife': 'WIFE',
        'sibling': 'SIB',
        'brother': 'BRO',
        'sister': 'SIS',
        'caregiver': 'GUARD',
        'guardian': 'GUARD',
        'friend': 'FRND',
        'other': 'O'
    };

    return mapping[relationship.toLowerCase()] || 'O';
};

export default {
    linkRelatedPerson,
    getPatientRelatedPersons
};