import fhirService from './fhirService.js';

/**
 * Hospital service - works directly with FHIR Organization resources
 */

/**
 * Get hospital by FHIR ID
 */
export async function getHospital(organizationId) {
    try {
        return await fhirService.getOrganization(organizationId);
    } catch (error) {
        console.error('Error getting hospital:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Search hospitals by name
 */
export async function searchHospitalByName(name) {
    try {
        const result = await fhirService.searchOrganizations({ name });
        
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const hospitals = result.entries.map(entry => {
            const org = entry.resource;
            return {
                id: org.id,
                name: org.name,
                phone: org.telecom?.find(t => t.system === 'phone')?.value,
                email: org.telecom?.find(t => t.system === 'email')?.value,
                website: org.telecom?.find(t => t.system === 'url')?.value,
                address: org.address?.[0]?.text || ''
            };
        });

        return { success: true, hospitals, total: result.total };
    } catch (error) {
        console.error('Error searching hospitals:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Create a new hospital/organization
 */
export async function createHospital(hospitalData) {
    try {
        const fhirOrganization = {
            resourceType: 'Organization',
            active: true,
            type: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                    code: 'prov',
                    display: 'Healthcare Provider'
                }]
            }],
            name: hospitalData.name,
            telecom: []
        };

        // Add phone
        if (hospitalData.phone) {
            fhirOrganization.telecom.push({
                system: 'phone',
                value: hospitalData.phone,
                use: 'work'
            });
        }

        // Add email
        if (hospitalData.email) {
            fhirOrganization.telecom.push({
                system: 'email',
                value: hospitalData.email,
                use: 'work'
            });
        }

        // Add website
        if (hospitalData.website) {
            fhirOrganization.telecom.push({
                system: 'url',
                value: hospitalData.website,
                use: 'work'
            });
        }

        // Add address
        if (hospitalData.address) {
            fhirOrganization.address = [{
                use: 'work',
                type: 'physical',
                text: hospitalData.address
            }];
        }

        const result = await fhirService.createOrganization(fhirOrganization);
        return result;
    } catch (error) {
        console.error('Error creating hospital:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Update hospital information
 */
export async function updateHospital(organizationId, hospitalData) {
    try {
        // Get existing organization
        const getResult = await fhirService.getOrganization(organizationId);
        if (!getResult.success) {
            return { success: false, message: 'Organization not found' };
        }

        const organization = getResult.data;

        // Update name
        if (hospitalData.name) {
            organization.name = hospitalData.name;
        }

        // Update telecom
        if (hospitalData.phone || hospitalData.email || hospitalData.website) {
            organization.telecom = organization.telecom || [];
            
            if (hospitalData.phone) {
                const phoneIndex = organization.telecom.findIndex(t => t.system === 'phone');
                const phoneObj = { system: 'phone', value: hospitalData.phone, use: 'work' };
                if (phoneIndex >= 0) {
                    organization.telecom[phoneIndex] = phoneObj;
                } else {
                    organization.telecom.push(phoneObj);
                }
            }

            if (hospitalData.email) {
                const emailIndex = organization.telecom.findIndex(t => t.system === 'email');
                const emailObj = { system: 'email', value: hospitalData.email, use: 'work' };
                if (emailIndex >= 0) {
                    organization.telecom[emailIndex] = emailObj;
                } else {
                    organization.telecom.push(emailObj);
                }
            }

            if (hospitalData.website) {
                const urlIndex = organization.telecom.findIndex(t => t.system === 'url');
                const urlObj = { system: 'url', value: hospitalData.website, use: 'work' };
                if (urlIndex >= 0) {
                    organization.telecom[urlIndex] = urlObj;
                } else {
                    organization.telecom.push(urlObj);
                }
            }
        }

        // Update address
        if (hospitalData.address) {
            organization.address = [{
                use: 'work',
                type: 'physical',
                text: hospitalData.address
            }];
        }

        const result = await fhirService.updateOrganization(organizationId, organization);
        return result;
    } catch (error) {
        console.error('Error updating hospital:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all hospitals
 */
export async function getAllHospitals() {
    try {
        const result = await fhirService.searchOrganizations({ 
            type: 'prov' // Healthcare Provider
        });
        
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const hospitals = result.entries.map(entry => {
            const org = entry.resource;
            return {
                id: org.id,
                name: org.name,
                phone: org.telecom?.find(t => t.system === 'phone')?.value,
                email: org.telecom?.find(t => t.system === 'email')?.value,
                website: org.telecom?.find(t => t.system === 'url')?.value,
                address: org.address?.[0]?.text || ''
            };
        });

        return { success: true, hospitals, total: result.total };
    } catch (error) {
        console.error('Error getting all hospitals:', error);
        return { success: false, error: error.message };
    }
}

export default {
    getHospital,
    searchHospitalByName,
    createHospital,
    updateHospital,
    getAllHospitals
};