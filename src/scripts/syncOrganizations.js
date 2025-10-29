import fhirService from '../services/fhirService.js';
import 'dotenv/config';
/**
 * Setup Hospital/Organization Data in FHIR
 * Creates hospitals with departments, contact info, and complete organizational structure
 * UPDATED: Includes identifier fields for searchability and validation
 */

async function setupOrganizations() {
    console.log('🏥 Setting Up Hospital/Organization Data in FHIR...\n');

    try {
        // ========================================
        // 1. CREATE MAIN HOSPITAL
        // ========================================
        console.log('1️⃣ Creating Main Hospital - Orion West Medical Center...');

        const mainHospital = {
            resourceType: 'Organization',
            active: true,
            
            // ✅ IDENTIFIERS - Enable searching by phone, email, NPI, etc.
            identifier: [
                {
                    // Twilio phone identifier - enables search by phone
                    system: 'http://hospital-system/twilio-phone',
                    value: '+19499971087',
                    use: 'official'
                },
                {
                    // Email identifier - for authentication
                    system: 'http://hospital-system/email',
                    value: 'info@orionwestmedical.com',
                    use: 'official'
                },
                {
                    // National Provider Identifier (NPI) - for healthcare facilities
                    system: 'http://hl7.org/fhir/sid/us-npi',
                    value: '1234567890',
                    use: 'official'
                },
                {
                    // Tax ID / EIN
                    system: 'urn:oid:2.16.840.1.113883.4.4',
                    value: '12-3456789',
                    use: 'official'
                }
            ],
            
            type: [{
                coding: [{
                    system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                    code: 'prov',
                    display: 'Healthcare Provider'
                }],
                text: 'Hospital'
            }],
            
            name: 'Orion West Medical Center',
            alias: ['OSW', 'Orion West', 'Orion West Hospital'],
            
            telecom: [
                {
                    system: 'phone',
                    value: '+19499971087',
                    use: 'work',
                    rank: 1  // Primary phone
                },
                {
                    system: 'phone',
                    value: '+18001234567',
                    use: 'work',
                    rank: 2  // Secondary/toll-free
                },
                {
                    system: 'email',
                    value: 'info@orionwestmedical.com',
                    use: 'work'
                },
                {
                    system: 'url',
                    value: 'https://www.orionwestmedical.com',
                    use: 'work'
                }
            ],
            
            address: [{
                use: 'work',
                type: 'both',
                text: '1771 East Flamingo Rd, Las Vegas, Nevada 89119',
                line: ['1771 East Flamingo Rd', 'Suite 100'],
                city: 'Las Vegas',
                state: 'Nevada',
                postalCode: '89119',  // Fixed: Vegas zip code
                country: 'USA'
            }],
            
            contact: [{
                purpose: {
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/contactentity-type',
                        code: 'ADMIN',
                        display: 'Administrative'
                    }]
                },
                name: {
                    text: 'Hospital Administration'
                },
                telecom: [
                    {
                        system: 'phone',
                        value: '+19499971087'
                    },
                    {
                        system: 'email',
                        value: 'admin@orionwestmedical.com'
                    }
                ]
            }],
            
            // ✅ EXTENSIONS - Store custom data like business hours
            extension: [
                {
                    url: 'http://hospital-system/weekday-hours',
                    valueString: '8:00 AM - 8:00 PM'
                },
                {
                    url: 'http://hospital-system/weekend-hours',
                    valueString: '9:00 AM - 5:00 PM'
                },
                {
                    url: 'http://hospital-system/emergency-hours',
                    valueString: '24/7'
                },
                {
                    url: 'http://hospital-system/timezone',
                    valueString: 'America/Los_Angeles'
                },
                {
                    url: 'http://hospital-system/accepts-new-patients',
                    valueBoolean: true
                },
                {
                    url: 'http://hospital-system/password-hash',
                    valueString: ''  // Will be set during signup
                }
            ]
        };

        const mainHospitalResult = await fhirService.createOrganization(mainHospital);

        if (!mainHospitalResult.success) {
            console.error('❌ Failed to create main hospital:', mainHospitalResult.error);
            return;
        }

        const mainHospitalId = mainHospitalResult.data.id;
        console.log(`✅ Main Hospital Created: ${mainHospitalId}`);
        console.log(`   Name: Orion West Medical Center`);
        console.log(`   Phone: +19499971087`);
        console.log(`   NPI: 1234567890`);
        console.log(`   Address: 1771 East Flamingo Rd, Las Vegas, Nevada`);
        console.log(`   Website: https://www.orionwestmedical.com\n`);

        // ========================================
        // 2. CREATE DEPARTMENTS
        // ========================================
        console.log('2️⃣ Creating Hospital Departments...');

        const departments = [
            {
                name: 'Emergency Department',
                alias: ['ER', 'Emergency Room', 'A&E'],
                type: 'dept',
                phone: '+19499971088',
                email: 'emergency@orionwestmedical.com',
                description: '24/7 Emergency Services',
                hours: '24/7',
                specialtyCode: 'EM',  // Emergency Medicine
                acceptsWalkIn: true
            },
            {
                name: 'Cardiology Department',
                alias: ['Cardiology', 'Heart Center'],
                type: 'dept',
                phone: '+19499971089',
                email: 'cardiology@orionwestmedical.com',
                description: 'Heart and cardiovascular care',
                hours: 'Mon-Fri 8:00 AM - 5:00 PM',
                specialtyCode: 'C',  // Cardiology
                acceptsWalkIn: false
            },
            {
                name: 'Pediatrics Department',
                alias: ['Pediatrics', 'Children\'s Health'],
                type: 'dept',
                phone: '+19499971090',
                email: 'pediatrics@orionwestmedical.com',
                description: 'Children\'s healthcare services',
                hours: 'Mon-Fri 8:00 AM - 6:00 PM',
                specialtyCode: 'PD',  // Pediatrics
                acceptsWalkIn: true
            },
            {
                name: 'Orthopedics Department',
                alias: ['Orthopedics', 'Ortho'],
                type: 'dept',
                phone: '+19499971091',
                email: 'orthopedics@orionwestmedical.com',
                description: 'Bone, joint, and musculoskeletal care',
                hours: 'Mon-Fri 8:00 AM - 5:00 PM',
                specialtyCode: 'OR',  // Orthopedics
                acceptsWalkIn: false
            },
            {
                name: 'General Practice',
                alias: ['General Practice', 'Family Medicine', 'Primary Care'],
                type: 'dept',
                phone: '+19499971092',
                email: 'generalmed@orionwestmedical.com',
                description: 'Primary care and family medicine',
                hours: 'Mon-Fri 7:00 AM - 7:00 PM',
                specialtyCode: 'FM',  // Family Medicine
                acceptsWalkIn: true
            },
            {
                name: 'Radiology Department',
                alias: ['Radiology', 'Imaging', 'X-Ray'],
                type: 'dept',
                phone: '+19499971093',
                email: 'radiology@orionwestmedical.com',
                description: 'Medical imaging services (X-ray, CT, MRI, Ultrasound)',
                hours: 'Mon-Fri 7:00 AM - 9:00 PM, Sat-Sun 8:00 AM - 4:00 PM',
                specialtyCode: 'DR',  // Diagnostic Radiology
                acceptsWalkIn: false
            },
            {
                name: 'Laboratory Services',
                alias: ['Lab', 'Laboratory', 'Path Lab'],
                type: 'dept',
                phone: '+19499971094',
                email: 'lab@orionwestmedical.com',
                description: 'Medical testing and diagnostics',
                hours: '24/7',
                specialtyCode: 'LP',  // Laboratory Pathology
                acceptsWalkIn: true
            },
            {
                name: 'Pharmacy',
                alias: ['Pharmacy', 'Dispensary'],
                type: 'dept',
                phone: '+19499971095',
                email: 'pharmacy@orionwestmedical.com',
                description: 'Prescription and medication services',
                hours: 'Mon-Fri 7:00 AM - 9:00 PM, Sat-Sun 9:00 AM - 6:00 PM',
                specialtyCode: 'PH',  // Pharmacy
                acceptsWalkIn: true
            },
            {
                name: 'Surgery Department',
                alias: ['Surgery', 'Surgical Services'],
                type: 'dept',
                phone: '+19499971096',
                email: 'surgery@orionwestmedical.com',
                description: 'Surgical procedures and operating rooms',
                hours: '24/7',
                specialtyCode: 'GS',  // General Surgery
                acceptsWalkIn: false
            },
            {
                name: 'Maternity Ward',
                alias: ['Maternity', 'Labor & Delivery', 'OB/GYN'],
                type: 'dept',
                phone: '+19499971097',
                email: 'maternity@orionwestmedical.com',
                description: 'Obstetrics and gynecology services',
                hours: '24/7',
                specialtyCode: 'OB',  // Obstetrics & Gynecology
                acceptsWalkIn: false
            }
        ];

        const createdDepartments = [];

        for (const dept of departments) {
            const department = {
                resourceType: 'Organization',
                active: true,
                
                // ✅ IDENTIFIERS for departments
                identifier: [
                    {
                        // Department phone identifier
                        system: 'http://hospital-system/department-phone',
                        value: dept.phone,
                        use: 'official'
                    },
                    {
                        // Department email
                        system: 'http://hospital-system/department-email',
                        value: dept.email,
                        use: 'official'
                    },
                    {
                        // Department code
                        system: 'http://hospital-system/department-code',
                        value: dept.specialtyCode,
                        use: 'official'
                    }
                ],
                
                type: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                        code: 'dept',
                        display: 'Hospital Department'
                    }],
                    text: 'Department'
                }],
                
                name: dept.name,
                alias: dept.alias,
                
                partOf: {
                    reference: `Organization/${mainHospitalId}`,
                    display: 'Orion West Medical Center'
                },
                
                telecom: [
                    {
                        system: 'phone',
                        value: dept.phone,
                        use: 'work'
                    },
                    {
                        system: 'email',
                        value: dept.email,
                        use: 'work'
                    }
                ],
                
                // Address inherited from parent but can be different building/floor
                address: [{
                    use: 'work',
                    type: 'physical',
                    text: '1771 East Flamingo Rd, Las Vegas, Nevada 89119',
                    line: ['1771 East Flamingo Rd', `${dept.name} - Floor 2`],
                    city: 'Las Vegas',
                    state: 'Nevada',
                    postalCode: '89119',
                    country: 'USA'
                }],
                
                contact: [{
                    purpose: {
                        coding: [{
                            system: 'http://terminology.hl7.org/CodeSystem/contactentity-type',
                            code: 'ADMIN',
                            display: 'Administrative'
                        }]
                    },
                    name: {
                        text: `${dept.name} Administration`
                    },
                    telecom: [{
                        system: 'phone',
                        value: dept.phone
                    }]
                }],
                
                // ✅ EXTENSIONS for department-specific data
                extension: [
                    {
                        url: 'http://hospital-system/hours',
                        valueString: dept.hours
                    },
                    {
                        url: 'http://hospital-system/specialty-code',
                        valueString: dept.specialtyCode
                    },
                    {
                        url: 'http://hospital-system/accepts-walk-in',
                        valueBoolean: dept.acceptsWalkIn
                    },
                    {
                        url: 'http://hospital-system/description',
                        valueString: dept.description
                    }
                ]
            };

            const result = await fhirService.createOrganization(department);

            if (result.success) {
                createdDepartments.push({
                    id: result.data.id,
                    name: dept.name,
                    phone: dept.phone,
                    hours: dept.hours,
                    specialtyCode: dept.specialtyCode,
                    acceptsWalkIn: dept.acceptsWalkIn
                });
                console.log(`✅ Created: ${dept.name} - ID: ${result.data.id}`);
                console.log(`   Phone: ${dept.phone}`);
                console.log(`   Specialty: ${dept.specialtyCode}`);
                console.log(`   Hours: ${dept.hours}`);
                console.log(`   Walk-in: ${dept.acceptsWalkIn ? 'Yes' : 'No'}`);
            } else {
                console.error(`❌ Failed to create ${dept.name}:`, result.error);
            }
        }
        console.log('');

        // ========================================
        // 3. CREATE SATELLITE LOCATIONS
        // ========================================
        console.log('3️⃣ Creating Satellite Locations...');

        const satelliteLocations = [
            {
                name: 'Orion West Medical Center - Downtown Clinic',
                type: 'clinic',
                phone: '+19499971100',
                email: 'downtown@orionwestmedical.com',
                address: {
                    line: ['456 Main Street'],
                    city: 'Las Vegas',
                    state: 'Nevada',
                    postalCode: '89101'
                },
                hours: 'Mon-Fri 8:00 AM - 6:00 PM'
            },
            {
                name: 'Orion West Medical Center - Westside Medical Center',
                type: 'clinic',
                phone: '+19499971101',
                email: 'westside@orionwestmedical.com',
                address: {
                    line: ['789 West Boulevard'],
                    city: 'Las Vegas',
                    state: 'Nevada',
                    postalCode: '89102'
                },
                hours: 'Mon-Fri 7:00 AM - 7:00 PM, Sat 9:00 AM - 3:00 PM'
            },
            {
                name: 'Orion West Medical Center - Urgent Care Center',
                type: 'urgent-care',
                phone: '+19499971102',
                email: 'urgentcare@orionwestmedical.com',
                address: {
                    line: ['321 Emergency Lane'],
                    city: 'Las Vegas',
                    state: 'Nevada',
                    postalCode: '89103'
                },
                hours: '24/7'
            }
        ];

        const createdLocations = [];

        for (const location of satelliteLocations) {
            const org = {
                resourceType: 'Organization',
                active: true,
                
                // ✅ IDENTIFIERS for satellite locations
                identifier: [
                    {
                        system: 'http://hospital-system/location-phone',
                        value: location.phone,
                        use: 'official'
                    },
                    {
                        system: 'http://hospital-system/location-email',
                        value: location.email,
                        use: 'official'
                    }
                ],
                
                type: [{
                    coding: [{
                        system: 'http://terminology.hl7.org/CodeSystem/organization-type',
                        code: 'prov',
                        display: 'Healthcare Provider'
                    }],
                    text: location.type === 'urgent-care' ? 'Urgent Care' : 'Satellite Clinic'
                }],
                
                name: location.name,
                
                partOf: {
                    reference: `Organization/${mainHospitalId}`,
                    display: 'Orion West Medical Center'
                },
                
                telecom: [
                    {
                        system: 'phone',
                        value: location.phone,
                        use: 'work'
                    },
                    {
                        system: 'email',
                        value: location.email,
                        use: 'work'
                    }
                ],
                
                address: [location.address],
                
                // ✅ EXTENSIONS for location data
                extension: [
                    {
                        url: 'http://hospital-system/hours',
                        valueString: location.hours
                    },
                    {
                        url: 'http://hospital-system/location-type',
                        valueString: location.type
                    }
                ]
            };

            const result = await fhirService.createOrganization(org);

            if (result.success) {
                createdLocations.push({
                    id: result.data.id,
                    name: location.name,
                    phone: location.phone
                });
                console.log(`✅ Created: ${location.name}`);
                console.log(`   Phone: ${location.phone}`);
                console.log(`   Hours: ${location.hours}`);
                console.log(`   Address: ${location.address.line[0]}, ${location.address.city}`);
            } else {
                console.error(`❌ Failed to create ${location.name}:`, result.error);
            }
        }
        console.log('');

        // ========================================
        // SUMMARY
        // ========================================
        console.log('📊 Organization Setup Summary:');
        console.log('================================');
        console.log(`✅ Main Hospital: ${mainHospitalId}`);
        console.log(`   Name: Orion West Medical Center`);
        console.log(`   Phone: +19499971087`);
        console.log(`   NPI: 1234567890`);
        console.log(`   Departments: ${createdDepartments.length}`);
        console.log(`   Satellite Locations: ${createdLocations.length}`);
        console.log('');

        console.log('📋 Departments Created:');
        createdDepartments.forEach((dept, index) => {
            console.log(`   ${index + 1}. ${dept.name}`);
            console.log(`      Phone: ${dept.phone}`);
            console.log(`      Specialty: ${dept.specialtyCode}`);
            console.log(`      Walk-in: ${dept.acceptsWalkIn ? 'Yes' : 'No'}`);
        });
        console.log('');

        console.log('📍 Satellite Locations:');
        createdLocations.forEach((loc, index) => {
            console.log(`   ${index + 1}. ${loc.name}`);
            console.log(`      ID: ${loc.id}`);
            console.log(`      Phone: ${loc.phone}`);
        });
        console.log('');

        console.log('🎉 Organization setup complete!');
        console.log('');
        console.log('💡 Quick Reference:');
        console.log(`   Main Hospital ID: ${mainHospitalId}`);
        console.log(`   Main Phone: +19499971087`);
        console.log(`   Emergency: +19499971088`);
        console.log(`   General Practice: +19499971092`);
        console.log('');
        console.log('🔍 Search Examples:');
        console.log(`   By Phone: searchOrganizations({ identifier: "http://hospital-system/twilio-phone|+19499971087" })`);
        console.log(`   By Email: searchOrganizations({ identifier: "http://hospital-system/email|info@orionwestmedical.com" })`);
        console.log(`   By NPI: searchOrganizations({ identifier: "http://hl7.org/fhir/sid/us-npi|1234567890" })`);
        console.log('');

        return {
            success: true,
            mainHospitalId,
            departments: createdDepartments,
            locations: createdLocations
        };

    } catch (error) {
        console.error('❌ Organization setup failed:', error);
        console.error(error.stack);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    setupOrganizations()
        .then(result => {
            if (result.success) {
                console.log('✅ Setup completed successfully!');
                process.exit(0);
            } else {
                console.error('❌ Setup failed');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Unexpected error:', error);
            process.exit(1);
        });
}
setupOrganizations();