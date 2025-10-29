import fhirService from '../services/fhirService.js';
import 'dotenv/config';

/**
 * Comprehensive Cleanup Script
 * 
 * DELETES:
 * 1. Organization: "Orion West Medical Center" (and similar variations)
 * 2. Doctors: Sarah Johnson, Michael Chen, Emily Rodriguez, James Wilson, Lisa Anderson
 * 3. Duplicate patients (keeps only the 3 latest)
 * 
 * KEEPS:
 * - Jayasri (ID: 51229278) - Phone: +18884180740
 * - Deekshitha (ID: 51229281) - Phone: +15404924023
 * - Susmitha (ID: 51229284) - Phone: +917989338432
 */

async function comprehensiveCleanup() {
    console.log('🧹 Starting Comprehensive Cleanup...\n');
    console.log('⚠️  This will delete:');
    console.log('   - Orion West Medical Center organization');
    console.log('   - All doctors (Sarah Johnson, Michael Chen, etc.)');
    console.log('   - All related schedules and slots');
    console.log('   - Duplicate patients');
    console.log('');
    console.log('Press Ctrl+C within 3 seconds to cancel...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    let stats = {
        organizationsDeleted: 0,
        doctorsDeleted: 0,
        schedulesDeleted: 0,
        slotsDeleted: 0,
        appointmentsDeleted: 0,
        patientsDeleted: 0
    };

    try {
        // ========================================
        // 1. DELETE APPOINTMENTS FIRST (DEPENDENCIES)
        // ========================================
        console.log('1️⃣ Deleting Appointments...');
        try {
            const appointments = await fhirService.searchAppointments({});
            if (appointments.success && appointments.entries && appointments.entries.length > 0) {
                for (const entry of appointments.entries) {
                    const result = await fhirService.deleteAppointment(entry.resource.id);
                    if (result.success) {
                        stats.appointmentsDeleted++;
                    }
                }
                console.log(`   ✅ Deleted ${stats.appointmentsDeleted} appointments\n`);
            } else {
                console.log('   ℹ️  No appointments found\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}\n`);
        }

        // ========================================
        // 2. DELETE SLOTS
        // ========================================
        console.log('2️⃣ Deleting Slots...');
        try {
            const slots = await fhirService.searchSlots({});
            if (slots.success && slots.entries && slots.entries.length > 0) {
                console.log(`   Found ${slots.entries.length} slots...`);
                for (const entry of slots.entries) {
                    const result = await fhirService.deleteSlot(entry.resource.id);
                    if (result.success) {
                        stats.slotsDeleted++;
                        if (stats.slotsDeleted % 50 === 0) {
                            console.log(`      🔄 Deleted ${stats.slotsDeleted} slots...`);
                        }
                    }
                }
                console.log(`   ✅ Deleted ${stats.slotsDeleted} slots\n`);
            } else {
                console.log('   ℹ️  No slots found\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}\n`);
        }

        // ========================================
        // 3. DELETE SCHEDULES
        // ========================================
        console.log('3️⃣ Deleting Schedules...');
        try {
            const schedules = await fhirService.searchSchedules({});
            if (schedules.success && schedules.entries && schedules.entries.length > 0) {
                for (const entry of schedules.entries) {
                    const result = await fhirService.deleteSchedule(entry.resource.id);
                    if (result.success) {
                        stats.schedulesDeleted++;
                        console.log(`   ✅ Deleted schedule: ${entry.resource.id}`);
                    }
                }
                console.log(`   ✅ Deleted ${stats.schedulesDeleted} schedules\n`);
            } else {
                console.log('   ℹ️  No schedules found\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}\n`);
        }

        // ========================================
        // 4. DELETE DOCTORS (PRACTITIONERS)
        // ========================================
        console.log('4️⃣ Deleting Doctors...');
        const doctorNames = [
            'Dr. Sarah Johnson',
            'Dr. Michael Chen', 
            'Dr. Emily Rodriguez',
            'Dr. James Wilson',
            'Dr. Lisa Anderson'
        ];

        try {
            const practitioners = await fhirService.searchPractitioners({});
            if (practitioners.success && practitioners.entries && practitioners.entries.length > 0) {
                for (const entry of practitioners.entries) {
                    const practitioner = entry.resource;
                    const name = practitioner.name?.[0];
                    const fullName = name ? 
                        `${name.prefix?.join(' ') || ''} ${name.given?.join(' ') || ''} ${name.family || ''}`.trim() : 
                        'Unknown';

                    // Check if this doctor matches any of the names to delete
                    const shouldDelete = doctorNames.some(docName => 
                        fullName.toLowerCase().includes(docName.toLowerCase())
                    );

                    if (shouldDelete) {
                        console.log(`   ❌ Deleting: ${fullName} (ID: ${practitioner.id})`);
                        const result = await fhirService.deletePractitioner(practitioner.id);
                        if (result.success) {
                            stats.doctorsDeleted++;
                            console.log(`      ✅ Deleted successfully`);
                        } else {
                            console.log(`      ⚠️  Failed: ${result.error}`);
                        }
                    } else {
                        console.log(`   ℹ️  Skipping: ${fullName} (not in delete list)`);
                    }
                }
                console.log(`   ✅ Deleted ${stats.doctorsDeleted} doctors\n`);
            } else {
                console.log('   ℹ️  No practitioners found\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}\n`);
        }

        // ========================================
        // 5. DELETE DUPLICATE PATIENTS (KEEP ONLY 3)
        // ========================================
        console.log('5️⃣ Cleaning Up Duplicate Patients...');
        const patientsToKeep = [
            { id: '51234952', firstName: 'Jayasri', phone: '+18884180740' },
            { id: '51234954', firstName: 'Deekshitha', phone: '+15404924023' },
            { id: '51234956', firstName: 'Susmitha', phone: '+917989338432' }
        ];

        const keepIds = new Set(patientsToKeep.map(p => p.id));

        console.log('   ✅ Will KEEP these patients:');
        patientsToKeep.forEach(p => {
            console.log(`      - ${p.name} (ID: ${p.id}) - ${p.phone}`);
        });
        console.log('');

        // Check each phone number for duplicates
        for (const keepPatient of patientsToKeep) {
            console.log(`   📱 Checking phone: ${keepPatient.phone} (${keepPatient.name})`);

            const result = await fhirService.searchPatients({ telecom: keepPatient.phone });

            if (!result.success || !result.entries || result.entries.length === 0) {
                console.log(`      ℹ️  No patients found with this number`);
                continue;
            }

            console.log(`      Found ${result.entries.length} patient(s) with this number`);

            for (const entry of result.entries) {
                const patient = entry.resource;
                const patientId = patient.id;
                const name = patient.name?.[0];
                const fullName = name ? 
                    `${name.given?.join(' ') || ''} ${name.family || ''}`.trim() : 
                    'Unknown';

                if (keepIds.has(patientId)) {
                    console.log(`      ✅ KEEPING: ${fullName} (ID: ${patientId})`);
                } else {
                    console.log(`      ❌ DELETING: ${fullName} (ID: ${patientId})`);
                    const deleteResult = await fhirService.deletePatient(patientId);
                    if (deleteResult.success) {
                        stats.patientsDeleted++;
                        console.log(`         ✅ Deleted successfully`);
                    } else {
                        console.log(`         ⚠️  Failed: ${deleteResult.error}`);
                    }
                }
            }
        }
        console.log(`   ✅ Deleted ${stats.patientsDeleted} duplicate patients\n`);

        // ========================================
        // 6. DELETE ORION WEST MEDICAL ORGANIZATION
        // ========================================
        console.log('6️⃣ Deleting Orion West Medical Organization...');
        try {
            const organizations = await fhirService.searchOrganizations({});
            if (organizations.success && organizations.entries && organizations.entries.length > 0) {
                for (const entry of organizations.entries) {
                    const org = entry.resource;
                    const orgName = org.name || '';

                    // Check if this is Orion West Medical or similar
                    if (orgName.toLowerCase().includes('orion') || 
                        orgName.toLowerCase().includes('west') ||
                        orgName.toLowerCase().includes('orion west medical')) {
                        
                        console.log(`   ❌ Deleting: ${orgName} (ID: ${org.id})`);
                        const result = await fhirService.deleteOrganization(org.id);
                        if (result.success) {
                            stats.organizationsDeleted++;
                            console.log(`      ✅ Deleted successfully`);
                        } else {
                            console.log(`      ⚠️  Failed: ${result.error}`);
                        }
                    } else {
                        console.log(`   ℹ️  Skipping: ${orgName} (not Orion West)`);
                    }
                }
                console.log(`   ✅ Deleted ${stats.organizationsDeleted} organization(s)\n`);
            } else {
                console.log('   ℹ️  No organizations found\n');
            }
        } catch (error) {
            console.log(`   ⚠️  Error: ${error.message}\n`);
        }

        // ========================================
        // FINAL SUMMARY
        // ========================================
        console.log('='.repeat(60));
        console.log('🎉 CLEANUP COMPLETE!');
        console.log('='.repeat(60));
        console.log('📊 Deletion Summary:');
        console.log(`   🗑️  Organizations: ${stats.organizationsDeleted}`);
        console.log(`   🗑️  Doctors: ${stats.doctorsDeleted}`);
        console.log(`   🗑️  Schedules: ${stats.schedulesDeleted}`);
        console.log(`   🗑️  Slots: ${stats.slotsDeleted}`);
        console.log(`   🗑️  Appointments: ${stats.appointmentsDeleted}`);
        console.log(`   🗑️  Duplicate Patients: ${stats.patientsDeleted}`);
        console.log('');
        console.log('✅ Remaining Data:');
        console.log('   📋 3 Patients:');
        patientsToKeep.forEach((p, i) => {
            console.log(`      ${i + 1}. ${p.name} - ${p.phone} (ID: ${p.id})`);
        });
        console.log('');
        console.log('💡 Your FHIR server is now clean!');
        console.log('   Run setupTestDataEnhanced.js to create fresh data');
        console.log('='.repeat(60));

        // ========================================
        // VERIFICATION
        // ========================================
        console.log('\n🔍 Verifying cleanup...\n');
        
        // Verify patients
        for (const keepPatient of patientsToKeep) {
            const verifyResult = await fhirService.searchPatients({ telecom: keepPatient.phone });
            const count = verifyResult.entries?.length || 0;
            const status = count === 1 ? '✅' : '⚠️';
            console.log(`   ${status} ${keepPatient.name} (${keepPatient.phone}): ${count} patient(s)`);
        }

        // Verify doctors deleted
        const doctorsRemaining = await fhirService.searchPractitioners({});
        const docCount = doctorsRemaining.entries?.length || 0;
        console.log(`   ${docCount === 0 ? '✅' : '⚠️'} Doctors remaining: ${docCount}`);

        // Verify organization deleted
        const orgsRemaining = await fhirService.searchOrganizations({});
        const orgCount = orgsRemaining.entries?.filter(e => 
            (e.resource.name || '').toLowerCase().includes('orion')
        ).length || 0;
        console.log(`   ${orgCount === 0 ? '✅' : '⚠️'} Orion West organizations remaining: ${orgCount}`);

        console.log('');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        console.error(error.stack);
    }
}

// Run the cleanup
comprehensiveCleanup();