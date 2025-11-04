// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function checkDoctorsInfo() {
//     console.log('🔍 Checking Doctor Information in FHIR\n');
//     console.log('='.repeat(80));

//     const expectedDoctors = [
//         {
//             name: 'Dr. Sarah Johnson',
//             specialty: 'Cardiology',
//             phone: '+19491234567',
//             email: 'sarah.johnson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Michael Chen',
//             specialty: 'General Practice',
//             phone: '+19491234568',
//             email: 'michael.chen@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Emily Rodriguez',
//             specialty: 'Pediatrics',
//             phone: '+19491234569',
//             email: 'emily.rodriguez@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. James Wilson',
//             specialty: 'Orthopedics',
//             phone: '+19491234570',
//             email: 'james.wilson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Lisa Anderson',
//             specialty: 'Dermatology',
//             phone: '+19491234571',
//             email: 'lisa.anderson@orionwestmedical.com'
//         }
//     ];

//     try {
//         const results = [];

//         for (const expectedDoctor of expectedDoctors) {
//             console.log(`\n👨‍⚕️  Checking: ${expectedDoctor.name}`);
//             console.log('─'.repeat(80));

//             // Search for the doctor by name
//             const searchResult = await fhirService.searchPractitioners({
//                 name: expectedDoctor.name
//             });

//             if (!searchResult.success || searchResult.entries.length === 0) {
//                 console.log(`❌ NOT FOUND in FHIR`);
//                 results.push({
//                     name: expectedDoctor.name,
//                     found: false,
//                     expected: expectedDoctor
//                 });
//                 continue;
//             }

//             const practitioner = searchResult.entries[0].resource;
//             const practitionerId = practitioner.id;

//             console.log(`✅ Found in FHIR (ID: ${practitionerId})`);
//             console.log('\n📋 Current FHIR Data:');

//             // Extract current data
//             const name = practitioner.name?.[0];
//             const displayName = name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim();

//             // Check specialty (stored in qualification)
//             const specialty = practitioner.qualification?.[0]?.code?.coding?.[0]?.display || null;

//             // Check phone
//             const phone = practitioner.telecom?.find(t => t.system === 'phone')?.value || null;

//             // Check email
//             const email = practitioner.telecom?.find(t => t.system === 'email')?.value || null;

//             console.log(`   Name: ${displayName}`);
//             console.log(`   Specialty: ${specialty || '❌ MISSING'}`);
//             console.log(`   Phone: ${phone || '❌ MISSING'}`);
//             console.log(`   Email: ${email || '❌ MISSING'}`);

//             console.log('\n📋 Expected Data:');
//             console.log(`   Name: ${expectedDoctor.name}`);
//             console.log(`   Specialty: ${expectedDoctor.specialty}`);
//             console.log(`   Phone: ${expectedDoctor.phone}`);
//             console.log(`   Email: ${expectedDoctor.email}`);

//             // Check what's missing
//             const missing = [];
//             if (!specialty || specialty !== expectedDoctor.specialty) missing.push('Specialty');
//             if (!phone || phone !== expectedDoctor.phone) missing.push('Phone');
//             if (!email || email !== expectedDoctor.email) missing.push('Email');

//             if (missing.length > 0) {
//                 console.log(`\n⚠️  Missing/Incorrect: ${missing.join(', ')}`);
//             } else {
//                 console.log('\n✅ All data is correct!');
//             }

//             results.push({
//                 name: expectedDoctor.name,
//                 found: true,
//                 practitionerId,
//                 current: {
//                     name: displayName,
//                     specialty,
//                     phone,
//                     email
//                 },
//                 expected: expectedDoctor,
//                 missing,
//                 needsUpdate: missing.length > 0
//             });

//             // Show raw FHIR structure for debugging
//             console.log('\n🔧 Raw FHIR Structure:');
//             console.log('   qualification:', JSON.stringify(practitioner.qualification, null, 2) || 'null');
//             console.log('   telecom:', JSON.stringify(practitioner.telecom, null, 2) || 'null');
//         }

//         // Summary
//         console.log('\n\n' + '='.repeat(80));
//         console.log('📊 SUMMARY');
//         console.log('='.repeat(80));

//         const found = results.filter(r => r.found).length;
//         const needsUpdate = results.filter(r => r.needsUpdate).length;
//         const notFound = results.filter(r => !r.found).length;

//         console.log(`Total doctors checked: ${expectedDoctors.length}`);
//         console.log(`✅ Found in FHIR: ${found}`);
//         console.log(`⚠️  Need updates: ${needsUpdate}`);
//         console.log(`❌ Not found: ${notFound}`);

//         if (needsUpdate > 0) {
//             console.log('\n🔧 Doctors that need updates:');
//             results.filter(r => r.needsUpdate).forEach(r => {
//                 console.log(`   - ${r.name} (ID: ${r.practitionerId})`);
//                 console.log(`     Missing: ${r.missing.join(', ')}`);
//             });
//         }

//         if (notFound > 0) {
//             console.log('\n❌ Doctors not found in FHIR:');
//             results.filter(r => !r.found).forEach(r => {
//                 console.log(`   - ${r.name}`);
//             });
//         }

//         console.log('\n💡 Next Steps:');
//         if (needsUpdate > 0) {
//             console.log('   1. Run updateDoctorsInfo.js to add missing information');
//         }
//         if (notFound > 0) {
//             console.log('   2. Create missing doctors first, then update their info');
//         }
//         if (needsUpdate === 0 && notFound === 0) {
//             console.log('   ✅ All doctors have complete information!');
//         }

//         return results;

//     } catch (error) {
//         console.error('❌ Error:', error);
//         console.error(error.stack);
//     }
// }

// // Run the script
// checkDoctorsInfo();

// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function updateDoctorsInfo() {
//     console.log('🔧 Updating Doctor Information in FHIR\n');
//     console.log('='.repeat(80));

//     const doctorsToUpdate = [
//         {
//             name: 'Dr. Sarah Johnson',
//             specialty: 'Cardiology',
//             phone: '+19491234567',
//             email: 'sarah.johnson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Michael Chen',
//             specialty: 'General Practice',
//             phone: '+19491234568',
//             email: 'michael.chen@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Emily Rodriguez',
//             specialty: 'Pediatrics',
//             phone: '+19491234569',
//             email: 'emily.rodriguez@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. James Wilson',
//             specialty: 'Orthopedics',
//             phone: '+19491234570',
//             email: 'james.wilson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Lisa Anderson',
//             specialty: 'Dermatology',
//             phone: '+19491234571',
//             email: 'lisa.anderson@orionwestmedical.com'
//         }
//     ];

//     try {
//         const results = [];

//         for (const doctorInfo of doctorsToUpdate) {
//             console.log(`\n👨‍⚕️  Updating: ${doctorInfo.name}`);
//             console.log('─'.repeat(80));

//             // Search for the doctor by name
//             const searchResult = await fhirService.searchPractitioners({
//                 name: doctorInfo.name
//             });

//             if (!searchResult.success || searchResult.entries.length === 0) {
//                 console.log(`❌ NOT FOUND in FHIR - Cannot update`);
//                 console.log(`   💡 Tip: This doctor needs to be created first`);
//                 results.push({
//                     name: doctorInfo.name,
//                     success: false,
//                     error: 'Not found'
//                 });
//                 continue;
//             }

//             const practitioner = searchResult.entries[0].resource;
//             const practitionerId = practitioner.id;

//             console.log(`✅ Found (ID: ${practitionerId})`);
//             console.log('📝 Updating fields...');

//             // Update specialty (qualification field)
//             // Following FHIR R4 standard for Practitioner.qualification
//             practitioner.qualification = [
//                 {
//                     code: {
//                         coding: [
//                             {
//                                 system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
//                                 code: 'MD',
//                                 display: doctorInfo.specialty
//                             }
//                         ],
//                         text: doctorInfo.specialty
//                     }
//                 }
//             ];

//             // Update telecom (phone and email)
//             // Remove existing phone/email entries to avoid duplicates
//             if (!practitioner.telecom) {
//                 practitioner.telecom = [];
//             }

//             // Filter out old phone and email entries
//             practitioner.telecom = practitioner.telecom.filter(
//                 t => t.system !== 'phone' && t.system !== 'email'
//             );

//             // Add new phone
//             practitioner.telecom.push({
//                 system: 'phone',
//                 value: doctorInfo.phone,
//                 use: 'work'
//             });

//             // Add new email
//             practitioner.telecom.push({
//                 system: 'email',
//                 value: doctorInfo.email,
//                 use: 'work'
//             });

//             // Update the practitioner in FHIR
//             const updateResult = await fhirService.updatePractitioner(
//                 practitionerId,
//                 practitioner
//             );

//             if (updateResult.success) {
//                 console.log('✅ Updated successfully!');
//                 console.log(`   Specialty: ${doctorInfo.specialty}`);
//                 console.log(`   Phone: ${doctorInfo.phone}`);
//                 console.log(`   Email: ${doctorInfo.email}`);

//                 results.push({
//                     name: doctorInfo.name,
//                     practitionerId,
//                     success: true
//                 });
//             } else {
//                 console.log('❌ Update failed');
//                 console.log(`   Error: ${updateResult.error}`);

//                 results.push({
//                     name: doctorInfo.name,
//                     practitionerId,
//                     success: false,
//                     error: updateResult.error
//                 });
//             }
//         }

//         // Summary
//         console.log('\n\n' + '='.repeat(80));
//         console.log('📊 UPDATE SUMMARY');
//         console.log('='.repeat(80));

//         const successful = results.filter(r => r.success).length;
//         const failed = results.filter(r => !r.success).length;

//         console.log(`Total doctors: ${doctorsToUpdate.length}`);
//         console.log(`✅ Successfully updated: ${successful}`);
//         console.log(`❌ Failed: ${failed}`);

//         if (successful > 0) {
//             console.log('\n✅ Successfully updated doctors:');
//             results.filter(r => r.success).forEach(r => {
//                 console.log(`   - ${r.name} (ID: ${r.practitionerId})`);
//             });
//         }

//         if (failed > 0) {
//             console.log('\n❌ Failed updates:');
//             results.filter(r => !r.success).forEach(r => {
//                 console.log(`   - ${r.name}: ${r.error}`);
//             });
//         }

//         // Verify the updates
//         if (successful > 0) {
//             console.log('\n\n🔍 Verifying updates...\n');
//             console.log('─'.repeat(80));

//             for (const result of results.filter(r => r.success)) {
//                 const verifyResult = await fhirService.getPractitioner(result.practitionerId);

//                 if (verifyResult.success) {
//                     const prac = verifyResult.data;
//                     const specialty = prac.qualification?.[0]?.code?.coding?.[0]?.display;
//                     const phone = prac.telecom?.find(t => t.system === 'phone')?.value;
//                     const email = prac.telecom?.find(t => t.system === 'email')?.value;

//                     console.log(`✅ ${result.name}:`);
//                     console.log(`   Specialty: ${specialty || '❌ Missing'}`);
//                     console.log(`   Phone: ${phone || '❌ Missing'}`);
//                     console.log(`   Email: ${email || '❌ Missing'}`);
//                 }
//             }
//         }

//         console.log('\n' + '='.repeat(80));
//         console.log('✨ UPDATE COMPLETE!');
//         console.log('='.repeat(80));

//     } catch (error) {
//         console.error('❌ Error:', error);
//         console.error(error.stack);
//     }
// }

// // Run the script
// updateDoctorsInfo();

// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function createDoctorsIfMissing() {
//     console.log('🏥 Creating Missing Doctors with Complete Information\n');
//     console.log('='.repeat(80));

//     const doctorsToCreate = [
//         {
//             name: 'Dr. Sarah Johnson',
//             specialty: 'Cardiology',
//             phone: '+19491234567',
//             email: 'sarah.johnson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Michael Chen',
//             specialty: 'General Practice',
//             phone: '+19491234568',
//             email: 'michael.chen@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Emily Rodriguez',
//             specialty: 'Pediatrics',
//             phone: '+19491234569',
//             email: 'emily.rodriguez@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. James Wilson',
//             specialty: 'Orthopedics',
//             phone: '+19491234570',
//             email: 'james.wilson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Lisa Anderson',
//             specialty: 'Dermatology',
//             phone: '+19491234571',
//             email: 'lisa.anderson@orionwestmedical.com'
//         }
//     ];

//     try {
//         const results = [];

//         for (const doctorInfo of doctorsToCreate) {
//             console.log(`\n👨‍⚕️  Checking: ${doctorInfo.name}`);
//             console.log('─'.repeat(80));

//             // Check if doctor already exists
//             const searchResult = await fhirService.searchPractitioners({
//                 name: doctorInfo.name
//             });

//             if (searchResult.success && searchResult.entries.length > 0) {
//                 const existingId = searchResult.entries[0].resource.id;
//                 console.log(`ℹ️  Already exists (ID: ${existingId})`);
//                 console.log('   Skipping creation. Use updateDoctorsInfo.js to update if needed.');
                
//                 results.push({
//                     name: doctorInfo.name,
//                     status: 'exists',
//                     practitionerId: existingId
//                 });
//                 continue;
//             }

//             // Parse the name
//             const nameParts = doctorInfo.name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
//             const firstName = nameParts[0];
//             const lastName = nameParts.slice(1).join(' ') || nameParts[0];

//             console.log('🆕 Creating new doctor...');

//             // Create FHIR Practitioner resource with all fields
//             const practitioner = {
//                 resourceType: 'Practitioner',
//                 active: true,
//                 name: [
//                     {
//                         use: 'official',
//                         family: lastName,
//                         given: [firstName],
//                         prefix: ['Dr.'],
//                         text: doctorInfo.name
//                     }
//                 ],
//                 // Specialty in qualification field
//                 qualification: [
//                     {
//                         code: {
//                             coding: [
//                                 {
//                                     system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
//                                     code: 'MD',
//                                     display: doctorInfo.specialty
//                                 }
//                             ],
//                             text: doctorInfo.specialty
//                         }
//                     }
//                 ],
//                 // Phone and email in telecom field
//                 telecom: [
//                     {
//                         system: 'phone',
//                         value: doctorInfo.phone,
//                         use: 'work'
//                     },
//                     {
//                         system: 'email',
//                         value: doctorInfo.email,
//                         use: 'work'
//                     }
//                 ]
//             };

//             // Create the practitioner in FHIR
//             const createResult = await fhirService.createPractitioner(practitioner);

//             if (createResult.success) {
//                 console.log('✅ Created successfully!');
//                 console.log(`   ID: ${createResult.fhirId}`);
//                 console.log(`   Name: ${doctorInfo.name}`);
//                 console.log(`   Specialty: ${doctorInfo.specialty}`);
//                 console.log(`   Phone: ${doctorInfo.phone}`);
//                 console.log(`   Email: ${doctorInfo.email}`);

//                 results.push({
//                     name: doctorInfo.name,
//                     status: 'created',
//                     practitionerId: createResult.fhirId
//                 });
//             } else {
//                 console.log('❌ Creation failed');
//                 console.log(`   Error: ${createResult.error}`);

//                 results.push({
//                     name: doctorInfo.name,
//                     status: 'failed',
//                     error: createResult.error
//                 });
//             }
//         }

//         // Summary
//         console.log('\n\n' + '='.repeat(80));
//         console.log('📊 CREATION SUMMARY');
//         console.log('='.repeat(80));

//         const created = results.filter(r => r.status === 'created').length;
//         const exists = results.filter(r => r.status === 'exists').length;
//         const failed = results.filter(r => r.status === 'failed').length;

//         console.log(`Total doctors: ${doctorsToCreate.length}`);
//         console.log(`🆕 Newly created: ${created}`);
//         console.log(`ℹ️  Already existed: ${exists}`);
//         console.log(`❌ Failed: ${failed}`);

//         if (created > 0) {
//             console.log('\n✅ Newly created doctors:');
//             results.filter(r => r.status === 'created').forEach(r => {
//                 console.log(`   - ${r.name} (ID: ${r.practitionerId})`);
//             });
//         }

//         if (exists > 0) {
//             console.log('\nℹ️  Doctors that already existed:');
//             results.filter(r => r.status === 'exists').forEach(r => {
//                 console.log(`   - ${r.name} (ID: ${r.practitionerId})`);
//             });
//         }

//         if (failed > 0) {
//             console.log('\n❌ Failed creations:');
//             results.filter(r => r.status === 'failed').forEach(r => {
//                 console.log(`   - ${r.name}: ${r.error}`);
//             });
//         }

//         console.log('\n' + '='.repeat(80));
//         console.log('💡 NEXT STEPS:');
//         console.log('='.repeat(80));
        
//         if (created > 0 || exists > 0) {
//             console.log('1. Run checkDoctorsInfo.js to verify all information is correct');
//             console.log('2. If needed, run updateDoctorsInfo.js to fix any missing fields');
//             console.log('3. Use findDoctorsAndSchedules.js to see their schedule IDs');
//             console.log('4. Run addSlotsMultipleDoctors.js to add appointment slots');
//         }

//         console.log('\n' + '='.repeat(80));
//         console.log('✨ COMPLETE!');
//         console.log('='.repeat(80));

//     } catch (error) {
//         console.error('❌ Error:', error);
//         console.error(error.stack);
//     }
// }

// // Run the script
// createDoctorsIfMissing();

// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function manageSpecificDoctors() {
//     console.log('🏥 Managing Specific Doctors - Find, Clean, and Schedule Check\n');
//     console.log('='.repeat(80));

//     const targetDoctors = [
//         {
//             name: 'Dr. Sarah Johnson',
//             specialty: 'Cardiology',
//             phone: '+19491234567',
//             email: 'sarah.johnson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Michael Chen',
//             specialty: 'General Practice',
//             phone: '+19491234568',
//             email: 'michael.chen@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Emily Rodriguez',
//             specialty: 'Pediatrics',
//             phone: '+19491234569',
//             email: 'emily.rodriguez@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. James Wilson',
//             specialty: 'Orthopedics',
//             phone: '+19491234570',
//             email: 'james.wilson@orionwestmedical.com'
//         },
//         {
//             name: 'Dr. Lisa Anderson',
//             specialty: 'Dermatology',
//             phone: '+19491234571',
//             email: 'lisa.anderson@orionwestmedical.com'
//         }
//     ];

//     try {
//         const results = [];
//         let totalDeleted = 0;

//         console.log('📋 Target Doctors:');
//         targetDoctors.forEach((d, i) => {
//             console.log(`   ${i + 1}. ${d.name} - ${d.specialty}`);
//         });
//         console.log('\n' + '='.repeat(80));

//         // Process each doctor
//         for (const targetDoctor of targetDoctors) {
//             console.log(`\n\n${'═'.repeat(80)}`);
//             console.log(`👨‍⚕️  PROCESSING: ${targetDoctor.name.toUpperCase()}`);
//             console.log('═'.repeat(80));

//             // Step 1: Search for this doctor (may find duplicates)
//             console.log('\n🔍 Step 1: Searching for doctor...');
            
//             const searchResult = await fhirService.searchPractitioners({
//                 name: targetDoctor.name
//             });

//             if (!searchResult.success || searchResult.entries.length === 0) {
//                 console.log(`❌ NOT FOUND in FHIR`);
//                 console.log(`   💡 This doctor needs to be created first.`);
//                 console.log(`   Run: node scripts/createDoctorsIfMissing.js`);
                
//                 results.push({
//                     name: targetDoctor.name,
//                     found: false,
//                     status: 'not_found'
//                 });
//                 continue;
//             }

//             const instances = searchResult.entries.map(entry => {
//                 const prac = entry.resource;
//                 return {
//                     id: prac.id,
//                     resource: prac,
//                     lastUpdated: prac.meta?.lastUpdated || null,
//                     versionId: prac.meta?.versionId || null
//                 };
//             });

//             console.log(`✅ Found ${instances.length} instance(s)`);

//             // Step 2: Identify newest and old versions
//             if (instances.length === 1) {
//                 console.log('✅ No duplicates found - single instance');
//             } else {
//                 console.log(`⚠️  ${instances.length} duplicates found!`);
//             }

//             // Sort by date or ID (newest first)
//             instances.sort((a, b) => {
//                 if (a.lastUpdated && b.lastUpdated) {
//                     return new Date(b.lastUpdated) - new Date(a.lastUpdated);
//                 }
//                 return parseInt(b.id) - parseInt(a.id);
//             });

//             const newest = instances[0];
//             const oldOnes = instances.slice(1);

//             console.log('\n📊 Instances:');
//             console.log(`   🆕 NEWEST (Keeping): ${newest.id}`);
//             console.log(`      Last Updated: ${newest.lastUpdated || 'Unknown'}`);
            
//             const newestSpecialty = newest.resource.qualification?.[0]?.code?.coding?.[0]?.display;
//             const newestPhone = newest.resource.telecom?.find(t => t.system === 'phone')?.value;
//             const newestEmail = newest.resource.telecom?.find(t => t.system === 'email')?.value;
            
//             console.log(`      Specialty: ${newestSpecialty || '❌ Not set'}`);
//             console.log(`      Phone: ${newestPhone || '❌ Not set'}`);
//             console.log(`      Email: ${newestEmail || '❌ Not set'}`);

//             if (oldOnes.length > 0) {
//                 console.log(`\n   🗑️  OLD VERSIONS (Will delete): ${oldOnes.length}`);
//                 oldOnes.forEach((old, index) => {
//                     console.log(`      ${index + 1}. ID: ${old.id}`);
//                     console.log(`         Last Updated: ${old.lastUpdated || 'Unknown'}`);
//                 });
//             }

//             // Step 3: Delete old versions
//             if (oldOnes.length > 0) {
//                 console.log('\n🗑️  Step 2: Deleting old versions...');
                
//                 for (const oldDoctor of oldOnes) {
//                     console.log(`\n   Deleting ID: ${oldDoctor.id}...`);
                    
//                     // Check for schedules
//                     const schedules = await fhirService.searchSchedules({
//                         actor: `Practitioner/${oldDoctor.id}`
//                     });

//                     if (schedules.success && schedules.entries.length > 0) {
//                         console.log(`      ⚠️  Has ${schedules.entries.length} schedule(s) - deleting them first`);
                        
//                         for (const scheduleEntry of schedules.entries) {
//                             const scheduleId = scheduleEntry.resource.id;
//                             console.log(`         Deleting schedule: ${scheduleId}...`);
//                             await fhirService.deleteSchedule(scheduleId);
//                         }
//                     }

//                     // Delete the practitioner
//                     const deleteResult = await fhirService.deletePractitioner(oldDoctor.id);

//                     if (deleteResult.success) {
//                         console.log(`      ✅ Deleted successfully`);
//                         totalDeleted++;
//                     } else {
//                         console.log(`      ❌ Failed: ${deleteResult.error}`);
//                     }
//                 }
//             } else {
//                 console.log('\n✅ Step 2: No old versions to delete');
//             }

//             // Step 4: Find schedules for the latest version
//             console.log('\n📅 Step 3: Finding schedules for latest version...');
            
//             const schedules = await fhirService.searchSchedules({
//                 actor: `Practitioner/${newest.id}`
//             });

//             const scheduleList = [];

//             if (schedules.success && schedules.entries.length > 0) {
//                 console.log(`   ✅ Found ${schedules.entries.length} schedule(s):`);
                
//                 for (const scheduleEntry of schedules.entries) {
//                     const schedule = scheduleEntry.resource;
//                     const scheduleId = schedule.id;
//                     const serviceType = schedule.serviceType?.[0]?.coding?.[0]?.display || 'General';
                    
//                     // Count slots
//                     const slots = await fhirService.searchSlots({
//                         schedule: scheduleId,
//                         status: 'free'
//                     });

//                     const slotCount = slots.total || 0;

//                     console.log(`\n      Schedule ID: ${scheduleId}`);
//                     console.log(`         Service Type: ${serviceType}`);
//                     console.log(`         Available Slots: ${slotCount}`);

//                     scheduleList.push({
//                         scheduleId,
//                         serviceType,
//                         slotCount
//                     });
//                 }
//             } else {
//                 console.log('   ⚠️  No schedules found for this doctor');
//                 console.log('   💡 You may need to create a schedule for this doctor');
//             }

//             // Store result
//             results.push({
//                 name: targetDoctor.name,
//                 found: true,
//                 status: oldOnes.length > 0 ? 'cleaned' : 'clean',
//                 doctorId: newest.id,
//                 deletedCount: oldOnes.length,
//                 specialty: newestSpecialty || null,
//                 phone: newestPhone || null,
//                 email: newestEmail || null,
//                 schedules: scheduleList,
//                 expectedInfo: targetDoctor
//             });

//             console.log('\n✅ Processing complete for this doctor');
//         }

//         // Final Summary
//         console.log('\n\n' + '═'.repeat(80));
//         console.log('📊 FINAL SUMMARY');
//         console.log('═'.repeat(80));

//         const found = results.filter(r => r.found).length;
//         const notFound = results.filter(r => !r.found).length;
//         const hadDuplicates = results.filter(r => r.deletedCount > 0).length;
//         const withSchedules = results.filter(r => r.schedules?.length > 0).length;

//         console.log(`\nTotal target doctors: ${targetDoctors.length}`);
//         console.log(`✅ Found: ${found}`);
//         console.log(`❌ Not found: ${notFound}`);
//         console.log(`🗑️  Had duplicates: ${hadDuplicates}`);
//         console.log(`📅 With schedules: ${withSchedules}`);
//         console.log(`🗑️  Total old versions deleted: ${totalDeleted}`);

//         // List doctors with complete info
//         console.log('\n\n' + '═'.repeat(80));
//         console.log('✅ LATEST DOCTORS AND THEIR SCHEDULES');
//         console.log('═'.repeat(80));

//         results.filter(r => r.found).forEach((result, index) => {
//             console.log(`\n${index + 1}. ${result.name}`);
//             console.log(`   Doctor ID: ${result.doctorId}`);
//             console.log(`   Status: ${result.status === 'cleaned' ? '🗑️  Cleaned (deleted duplicates)' : '✅ Clean (no duplicates)'}`);
//             console.log(`   Specialty: ${result.specialty || '❌ Not set'}`);
//             console.log(`   Phone: ${result.phone || '❌ Not set'}`);
//             console.log(`   Email: ${result.email || '❌ Not set'}`);
            
//             if (result.schedules && result.schedules.length > 0) {
//                 console.log(`   Schedules:`);
//                 result.schedules.forEach((sched, i) => {
//                     console.log(`      ${i + 1}. Schedule ID: ${sched.scheduleId}`);
//                     console.log(`         Slots: ${sched.slotCount}`);
//                 });
//             } else {
//                 console.log(`   Schedules: ❌ None found`);
//             }
//         });

//         // Not found doctors
//         if (notFound > 0) {
//             console.log('\n\n❌ DOCTORS NOT FOUND IN FHIR:');
//             results.filter(r => !r.found).forEach(r => {
//                 console.log(`   - ${r.name}`);
//             });
//         }

//         // Code snippet for next steps
//         console.log('\n\n' + '═'.repeat(80));
//         console.log('💡 USE THIS IN addSlotsMultipleDoctors.js:');
//         console.log('═'.repeat(80));
//         console.log('\nconst doctors = [');
        
//         results
//             .filter(r => r.found && r.schedules?.length > 0)
//             .forEach(r => {
//                 const schedule = r.schedules[0];
//                 console.log(`    {`);
//                 console.log(`        doctorId: '${r.doctorId}',`);
//                 console.log(`        scheduleId: '${schedule.scheduleId}',`);
//                 console.log(`        name: '${r.name}',`);
//                 console.log(`        specialty: '${r.specialty || 'Not set'}',`);
//                 console.log(`        phone: '${r.phone || 'Not set'}',`);
//                 console.log(`        email: '${r.email || 'Not set'}'`);
//                 console.log(`    },`);
//             });
//         console.log('];\n');

//         // Issues to fix
//         const issues = [];
        
//         // Check for missing info
//         const missingInfo = results.filter(r => 
//             r.found && (!r.specialty || !r.phone || !r.email)
//         );
//         if (missingInfo.length > 0) {
//             issues.push('missing_info');
//         }

//         // Check for missing schedules
//         const noSchedules = results.filter(r => 
//             r.found && (!r.schedules || r.schedules.length === 0)
//         );
//         if (noSchedules.length > 0) {
//             issues.push('missing_schedules');
//         }

//         if (issues.length > 0) {
//             console.log('\n' + '═'.repeat(80));
//             console.log('⚠️  ISSUES FOUND - ACTION REQUIRED');
//             console.log('═'.repeat(80));

//             if (missingInfo.length > 0) {
//                 console.log('\n📝 Doctors with incomplete information:');
//                 missingInfo.forEach(r => {
//                     console.log(`   - ${r.name} (ID: ${r.doctorId})`);
//                     if (!r.specialty) console.log('      Missing: Specialty');
//                     if (!r.phone) console.log('      Missing: Phone');
//                     if (!r.email) console.log('      Missing: Email');
//                 });
//                 console.log('\n   🔧 Fix: Run updateDoctorsInfo.js');
//             }

//             if (noSchedules.length > 0) {
//                 console.log('\n📅 Doctors without schedules:');
//                 noSchedules.forEach(r => {
//                     console.log(`   - ${r.name} (ID: ${r.doctorId})`);
//                 });
//                 console.log('\n   🔧 Fix: Create schedules for these doctors');
//             }
//         }

//         if (notFound > 0) {
//             console.log('\n❌ Doctors not in FHIR:');
//             results.filter(r => !r.found).forEach(r => {
//                 console.log(`   - ${r.name}`);
//             });
//             console.log('\n   🔧 Fix: Run createDoctorsIfMissing.js');
//         }

//         // Next steps
//         console.log('\n\n' + '═'.repeat(80));
//         console.log('🎯 NEXT STEPS');
//         console.log('═'.repeat(80));

//         const steps = [];
//         let stepNum = 1;

//         if (notFound > 0) {
//             console.log(`${stepNum}. Create missing doctors: node scripts/createDoctorsIfMissing.js`);
//             stepNum++;
//         }

//         if (missingInfo.length > 0) {
//             console.log(`${stepNum}. Update doctor info: node scripts/updateDoctorsInfo.js`);
//             stepNum++;
//         }

//         if (noSchedules.length > 0) {
//             console.log(`${stepNum}. Create schedules for doctors without them`);
//             stepNum++;
//         }

//         const readyForSlots = results.filter(r => 
//             r.found && r.schedules?.length > 0
//         ).length;

//         if (readyForSlots > 0) {
//             console.log(`${stepNum}. Add appointment slots: node scripts/addSlotsMultipleDoctors.js`);
//         }

//         if (issues.length === 0 && notFound === 0) {
//             console.log('✅ All doctors are ready!');
//             console.log('   Run: node scripts/addSlotsMultipleDoctors.js');
//         }

//         console.log('\n' + '═'.repeat(80));
//         console.log('✨ PROCESS COMPLETE!');
//         console.log('═'.repeat(80));

//         return results;

//     } catch (error) {
//         console.error('❌ Error:', error);
//         console.error(error.stack);
//     }
// }

// // Run the script
// manageSpecificDoctors();

import fhirService from '../services/fhirService.js';
import 'dotenv/config';

async function setupAll5Doctors() {

    // Doctors with schedules already
    const readyDoctors = [
        {
            doctorId: '51701683',
            scheduleId: '51701697',
            name: 'Dr. Sarah Johnson',
            specialty: 'Cardiology',
            phone: '+19491234567',
            email: 'sarah.johnson@orionwestmedical.com'
        },
        {
            doctorId: '50157604',
            scheduleId: '50157735',
            name: 'Dr. Michael Chen',
            specialty: 'General Practice',
            phone: '+19491234568',
            email: 'michael.chen@orionwestmedical.com'
        },
        {
            doctorId: '50157605',
            scheduleId: '50157860',
            name: 'Dr. Emily Rodriguez',
            specialty: 'Pediatrics',
            phone: '+19491234569',
            email: 'emily.rodriguez@orionwestmedical.com'
        },
        {
            doctorId: '50157606',
            scheduleId: '50157984',
            name: 'Dr. James Wilson',
            specialty: 'Orthopedics',
            phone: '+19491234570',
            email: 'james.wilson@orionwestmedical.com'
        }
    ];

    // Doctor needing schedule
    const doctorNeedingSchedule = {
        doctorId: '51709356',
        name: 'Dr. Lisa Anderson',
        specialty: 'Dermatology',
        phone: '+19491234571',
        email: 'lisa.anderson@orionwestmedical.com'
    };

    try {
        // Check if schedule already exists
        const existingSchedules = await fhirService.searchSchedules({
            actor: `Practitioner/${doctorNeedingSchedule.doctorId}`
        });

        let andersonScheduleId;

        if (existingSchedules.success && existingSchedules.entries.length > 0) {
            andersonScheduleId = existingSchedules.entries[0].resource.id;
            console.log(`ℹ️  Schedule already exists: ${andersonScheduleId}`);
            console.log('   Using existing schedule\n');
        } else {
            console.log('Creating new schedule...');

            const schedule = {
                resourceType: 'Schedule',
                active: true,
                actor: [
                    {
                        reference: `Practitioner/${doctorNeedingSchedule.doctorId}`,
                        display: doctorNeedingSchedule.name
                    }
                ],
                serviceType: [
                    {
                        coding: [
                            {
                                system: 'http://terminology.hl7.org/CodeSystem/service-type',
                                code: '124',
                                display: 'General Practice'
                            }
                        ],
                        text: 'General Practice'
                    }
                ],
                specialty: [
                    {
                        coding: [
                            {
                                system: 'http://snomed.info/sct',
                                code: '394582007',
                                display: doctorNeedingSchedule.specialty
                            }
                        ],
                        text: doctorNeedingSchedule.specialty
                    }
                ],
                comment: `Schedule for ${doctorNeedingSchedule.name} - ${doctorNeedingSchedule.specialty}`
            };

            const createResult = await fhirService.createSchedule(schedule);

            if (!createResult.success) {
                console.log('❌ Failed to create schedule');
                console.log(`   Error: ${createResult.error}`);
                console.log('\n⚠️  Cannot proceed without schedule for Dr. Anderson');
                return;
            }

            andersonScheduleId = createResult.fhirId;
            console.log(`✅ Schedule created: ${andersonScheduleId}\n`);
        }

        // Add Dr. Anderson to the doctors list
        const allDoctors = [
            ...readyDoctors,
            {
                ...doctorNeedingSchedule,
                scheduleId: andersonScheduleId
            }
        ];

        const startDate = new Date('2025-11-03');
        const endDate = new Date('2025-11-08');
        
        const timeSlots = [
            '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
            '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
            '15:00', '15:30', '16:00', '16:30', '17:00'
        ];

        let grandTotalSlots = 0;
        const doctorStats = [];

        // Loop through each doctor
        for (const doctor of allDoctors) {
            console.log(`\n\n${'═'.repeat(80)}`);
            console.log(`👨‍⚕️  DOCTOR: ${doctor.name.toUpperCase()}`);
            console.log(`   Doctor ID: ${doctor.doctorId}`);
            console.log(`   Schedule ID: ${doctor.scheduleId}`);
            console.log('═'.repeat(80));

            let doctorTotalSlots = 0;
            const slotsByDay = {};

            // Loop through each day
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
                
                console.log(`\n📆 ${dayName}, ${dateStr}`);
                console.log('─'.repeat(80));
                
                let daySlotsCreated = 0;

                for (const time of timeSlots) {
                    const start = new Date(`${dateStr}T${time}:00Z`);
                    const end = new Date(start);
                    end.setMinutes(end.getMinutes() + 30);

                    const slot = {
                        resourceType: 'Slot',
                        schedule: {
                            reference: `Schedule/${doctor.scheduleId}`
                        },
                        status: 'free',
                        start: start.toISOString(),
                        end: end.toISOString(),
                        comment: `Available appointment slot for ${doctor.name}`
                    };

                    const result = await fhirService.createSlot(slot);

                    if (result.success) {
                        daySlotsCreated++;
                        doctorTotalSlots++;
                        grandTotalSlots++;
                        
                        const displayTime = start.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        });
                        console.log(`  ✅ ${displayTime} - ${result.fhirId}`);
                    } else {
                        console.log(`  ❌ Failed at ${time}: ${result.error}`);
                    }
                }

                slotsByDay[dateStr] = daySlotsCreated;
                console.log(`  📊 Day Total: ${daySlotsCreated} slots created`);

                currentDate.setDate(currentDate.getDate() + 1);
            }

            console.log('\n' + '─'.repeat(80));
            console.log(`✅ Doctor Summary: ${doctor.name}`);
            console.log('─'.repeat(80));
            console.log(`Total Slots Created: ${doctorTotalSlots}`);
            console.log('\nBreakdown by day:');
            for (const [date, count] of Object.entries(slotsByDay)) {
                const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
                console.log(`  • ${dayName} (${date}): ${count} slots`);
            }

            doctorStats.push({
                name: doctor.name,
                totalSlots: doctorTotalSlots,
                slotsByDay
            });
        }

        doctorStats.forEach((stat, index) => {
            console.log(`${index + 1}. ${stat.name}: ${stat.totalSlots} slots`);
        });

        for (const doctor of allDoctors) {
            const verifySlots = await fhirService.searchSlots({
                schedule: doctor.scheduleId,
                start: `ge2025-11-03T00:00:00Z`
            });

            const weekSlots = verifySlots.entries?.filter(entry => {
                const slotDate = entry.resource.start.split('T')[0];
                return slotDate >= '2025-11-03' && slotDate <= '2025-11-08';
            }) || [];

            console.log(`✅ ${doctor.name}:`);
            console.log(`   Total slots in FHIR: ${weekSlots.length}`);
            console.log(`   - ${weekSlots.filter(e => e.resource.status === 'free').length} free slots`);
            console.log(`   - ${weekSlots.filter(e => e.resource.status === 'busy').length} busy slots\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
    }
}

setupAll5Doctors();