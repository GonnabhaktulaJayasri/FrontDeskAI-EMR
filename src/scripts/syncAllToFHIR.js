// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function setupTestData() {
//     console.log('🏥 Starting Enhanced FHIR Test Data Setup...\n');

//     try {
//         // 1. CREATE DOCTORS/PRACTITIONERS
//         console.log('1️⃣ Creating Doctors...');

//         const doctors = [
//             {
//                 name: 'Dr. Sarah Johnson',
//                 specialty: 'Cardiology',
//                 phone: '+19491234567',
//                 email: 'sarah.johnson@orionwestmedical.com'
//             },
//             {
//                 name: 'Dr. Michael Chen',
//                 specialty: 'General Practice',
//                 phone: '+19491234568',
//                 email: 'michael.chen@orionwestmedical.com'
//             },
//             {
//                 name: 'Dr. Emily Rodriguez',
//                 specialty: 'Pediatrics',
//                 phone: '+19491234569',
//                 email: 'emily.rodriguez@orionwestmedical.com'
//             },
//             {
//                 name: 'Dr. James Wilson',
//                 specialty: 'Orthopedics',
//                 phone: '+19491234570',
//                 email: 'james.wilson@orionwestmedical.com'
//             },
//             {
//                 name: 'Dr. Lisa Anderson',
//                 specialty: 'Dermatology',
//                 phone: '+19491234571',
//                 email: 'lisa.anderson@orionwestmedical.com'
//             }
//         ];

//         const createdDoctors = [];

//         for (const doc of doctors) {
//             const nameParts = doc.name.split(' ');
//             const practitioner = {
//                 resourceType: 'Practitioner',
//                 active: true,
//                 name: [{
//                     use: 'official',
//                     family: nameParts[nameParts.length - 1],
//                     given: nameParts.slice(1, -1),
//                     prefix: [nameParts[0]]
//                 }],
//                 telecom: [
//                     {
//                         system: 'phone',
//                         value: doc.phone,
//                         use: 'work'
//                     },
//                     {
//                         system: 'email',
//                         value: doc.email,
//                         use: 'work'
//                     }
//                 ],
//                 qualification: [{
//                     code: {
//                         coding: [{
//                             system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
//                             code: 'MD',
//                             display: doc.specialty
//                         }],
//                         text: doc.specialty
//                     }
//                 }]
//             };

//             const result = await fhirService.createPractitioner(practitioner);
//             if (result.success) {
//                 createdDoctors.push({
//                     id: result.data.id,
//                     name: doc.name,
//                     specialty: doc.specialty
//                 });
//                 console.log(`✅ Created: ${doc.name} (${doc.specialty}) - ID: ${result.data.id}`);
//             } else {
//                 console.error(`❌ Failed to create ${doc.name}:`, result.error);
//             }
//         }
//         console.log('');

//         // 2. CREATE SCHEDULES FOR EACH DOCTOR
//         console.log('2️⃣ Creating Doctor Schedules...');

//         const createdSchedules = [];

//         // Helper function to get current week boundaries
//         const getWeekBoundaries = () => {
//             const now = new Date();
//             const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

//             // Get Monday of current week
//             const monday = new Date(now);
//             const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
//             monday.setDate(now.getDate() + daysToMonday);
//             monday.setHours(0, 0, 0, 0);

//             // Get Friday (end of work week)
//             const friday = new Date(monday);
//             friday.setDate(monday.getDate() + 4);
//             friday.setHours(23, 59, 59, 999);

//             return { monday, friday };
//         };

//         const { monday: weekStart, friday: weekEnd } = getWeekBoundaries();

//         for (const doctor of createdDoctors) {
//             const schedule = {
//                 resourceType: 'Schedule',
//                 active: true,
//                 serviceCategory: [{
//                     coding: [{
//                         system: 'http://terminology.hl7.org/CodeSystem/service-category',
//                         code: '17',
//                         display: 'General Practice'
//                     }]
//                 }],
//                 serviceType: [{
//                     coding: [{
//                         system: 'http://terminology.hl7.org/CodeSystem/service-type',
//                         code: '124',
//                         display: 'General Practice'
//                     }]
//                 }],
//                 specialty: [{
//                     coding: [{
//                         system: 'http://snomed.info/sct',
//                         code: '394814009',
//                         display: doctor.specialty
//                     }],
//                     text: doctor.specialty
//                 }],
//                 actor: [{
//                     reference: `Practitioner/${doctor.id}`,
//                     display: doctor.name
//                 }],
//                 planningHorizon: {
//                     start: weekStart.toISOString(),
//                     end: weekEnd.toISOString()
//                 },
//                 comment: `Current week schedule for ${doctor.name}`
//             };

//             const result = await fhirService.createSchedule(schedule);
//             if (result.success) {
//                 createdSchedules.push({
//                     scheduleId: result.data.id,
//                     doctorId: doctor.id,
//                     doctorName: doctor.name,
//                     specialty: doctor.specialty
//                 });
//                 console.log(`✅ Schedule created for ${doctor.name} - ID: ${result.data.id}`);
//             } else {
//                 console.error(`❌ Failed to create schedule for ${doctor.name}:`, result.error);
//             }
//         }
//         console.log('');

//         // 3. CREATE COMPREHENSIVE APPOINTMENT SLOTS
//         console.log('3️⃣ Creating Comprehensive Appointment Slots...');
//         console.log(`   📅 Week Range: ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}`);
//         console.log('   ⏰ Hours: 8:00 AM - 6:00 PM (excluding 12:00 PM - 1:00 PM lunch)');
//         console.log('   📊 Slot Duration: 30 minutes');
//         console.log('');

//         let totalSlots = 0;
//         const slotsByDoctor = {};
//         const slotsByDay = {};

//         for (const schedule of createdSchedules) {
//             slotsByDoctor[schedule.doctorName] = 0;
//             console.log(`   👨‍⚕️ Creating slots for ${schedule.doctorName} (${schedule.specialty})...`);

//             // Iterate through each day of the current week
//             const currentDate = new Date(weekStart);

//             while (currentDate <= weekEnd) {
//                 const dayOfWeek = currentDate.getDay();
//                 const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
//                 const dateKey = currentDate.toLocaleDateString();

//                 // Only weekdays (Monday-Friday)
//                 if (dayOfWeek >= 1 && dayOfWeek <= 5) {
//                     let daySlotsCount = 0;

//                     // Create slots from 8 AM to 6 PM with 30-minute intervals
//                     // Morning: 8:00 AM - 12:00 PM (8 slots)
//                     // Lunch break: 12:00 PM - 1:00 PM (NO SLOTS)
//                     // Afternoon: 1:00 PM - 6:00 PM (10 slots)
//                     // Total: 18 slots per day per doctor

//                     for (let hour = 8; hour < 18; hour++) {
//                         // Skip lunch hour (12 PM to 1 PM)
//                         if (hour === 12) continue;

//                         // Create two 30-minute slots per hour
//                         for (let minutes = 0; minutes < 60; minutes += 30) {
//                             const startTime = new Date(currentDate);
//                             startTime.setHours(hour, minutes, 0, 0);

//                             const endTime = new Date(startTime);
//                             endTime.setMinutes(startTime.getMinutes() + 30);

//                             // Skip if slot is in the past
//                             const now = new Date();
//                             if (startTime < now) {
//                                 continue;
//                             }

//                             const slot = {
//                                 resourceType: 'Slot',
//                                 schedule: {
//                                     reference: `Schedule/${schedule.scheduleId}`
//                                 },
//                                 status: 'free', // Options: free, busy, busy-unavailable, busy-tentative
//                                 start: startTime.toISOString(),
//                                 end: endTime.toISOString(),
//                                 comment: `Available appointment slot with ${schedule.doctorName}`,
//                                 serviceType: [{
//                                     coding: [{
//                                         system: 'http://terminology.hl7.org/CodeSystem/service-type',
//                                         code: '124',
//                                         display: schedule.specialty
//                                     }],
//                                     text: schedule.specialty
//                                 }],
//                                 extension: [{
//                                     url: 'http://hospital-system/slot-info',
//                                     valueString: JSON.stringify({
//                                         doctorName: schedule.doctorName,
//                                         specialty: schedule.specialty,
//                                         timeSlot: `${hour}:${minutes.toString().padStart(2, '0')}`
//                                     })
//                                 }]
//                             };

//                             const result = await fhirService.createSlot(slot);
//                             if (result.success) {
//                                 totalSlots++;
//                                 daySlotsCount++;
//                                 slotsByDoctor[schedule.doctorName]++;

//                                 if (!slotsByDay[dateKey]) {
//                                     slotsByDay[dateKey] = 0;
//                                 }
//                                 slotsByDay[dateKey]++;
//                             } else {
//                                 console.error(`      ❌ Failed to create slot at ${startTime.toLocaleString()}: ${result.error}`);
//                             }
//                         }
//                     }

//                     console.log(`      ✅ ${dayName} ${dateKey}: ${daySlotsCount} slots created`);
//                 } else {
//                     console.log(`      ⏭️  Skipping ${dayName} ${dateKey} (weekend)`);
//                 }

//                 // Move to next day
//                 currentDate.setDate(currentDate.getDate() + 1);
//             }

//             console.log(`      📊 Total for ${schedule.doctorName}: ${slotsByDoctor[schedule.doctorName]} slots`);
//             console.log('');
//         }

//         console.log(`✅ TOTAL SLOTS CREATED: ${totalSlots}`);
//         console.log('');

//         // 4. DETAILED STATISTICS
//         console.log('📊 DETAILED STATISTICS:');
//         console.log('='.repeat(60));

//         console.log('\n📋 Slots per Doctor:');
//         Object.entries(slotsByDoctor).forEach(([doctor, count]) => {
//             console.log(`   ${doctor}: ${count} slots`);
//         });

//         console.log('\n📅 Slots per Day:');
//         Object.entries(slotsByDay).forEach(([date, count]) => {
//             console.log(`   ${date}: ${count} slots (${createdSchedules.length} doctors × ${count / createdSchedules.length} slots each)`);
//         });

//         console.log('\n📈 Averages:');
//         console.log(`   Average slots per doctor: ${Math.round(totalSlots / createdSchedules.length)}`);
//         console.log(`   Average slots per day: ${Math.round(Object.values(slotsByDay).reduce((a, b) => a + b, 0) / Object.keys(slotsByDay).length)}`);
//         console.log(`   Expected slots per doctor per day: 18 (8 AM-12 PM: 8 slots, 1 PM-6 PM: 10 slots)`);
//         console.log('');

//         // 5. CREATE SAMPLE PATIENTS
//         console.log('4️⃣ Creating Sample Patients...');

//         const patients = [
//             {
//                 firstName: 'Jayasri',
//                 lastName: 'K',
//                 phone: '+18884180740',
//                 email: 'jayasri@email.com',
//                 dob: '2003-07-14',
//                 gender: 'female'
//             },
//             {
//                 firstName: 'Deekshitha',
//                 lastName: 'D',
//                 phone: '+15404924023',
//                 email: 'deekshitha@email.com',
//                 dob: '2003-05-08',
//                 gender: 'female'
//             },
//             {
//                 firstName: 'Susmitha',
//                 lastName: 'G',
//                 phone: '+917989338432',
//                 email: 'susmitha@email.com',
//                 dob: '2002-01-26',
//                 gender: 'female'
//             }
//         ];

//         const createdPatients = [];

//         for (const pt of patients) {
//             const patient = {
//                 resourceType: 'Patient',
//                 active: true,
//                 name: [{
//                     use: 'official',
//                     family: [pt.lastName],
//                     given: pt.firstName
//                 }],
//                 telecom: [
//                     {
//                         system: 'phone',
//                         value: pt.phone,
//                         use: 'mobile'
//                     },
//                     {
//                         system: 'email',
//                         value: pt.email,
//                         use: 'home'
//                     }
//                 ],
//                 gender: pt.gender,
//                 birthDate: pt.dob
//             };

//             const result = await fhirService.createPatient(patient);
//             if (result.success) {
//                 createdPatients.push({
//                     id: result.data.id,
//                     name: pt.firstName,
//                     phone: pt.phone
//                 });
//                 console.log(`✅ Created patient: ${pt.firstName} - ID: ${result.data.id}`);
//             } else {
//                 console.error(`❌ Failed to create patient ${pt.firstName}:`, result.error);
//             }
//         }
//         console.log('');

//         // 6. CREATE SAMPLE APPOINTMENTS
//         console.log('5️⃣ Creating Sample Appointments...');

//         if (createdPatients.length > 0 && createdDoctors.length > 0) {
//             // Create appointment for tomorrow at 10:00 AM
//             const tomorrow = new Date();
//             tomorrow.setDate(tomorrow.getDate() + 1);
//             tomorrow.setHours(10, 0, 0, 0);

//             // Skip if tomorrow is weekend
//             const tomorrowDay = tomorrow.getDay();
//             if (tomorrowDay >= 1 && tomorrowDay <= 5) {
//                 const appointment = {
//                     resourceType: 'Appointment',
//                     status: 'booked',
//                     description: 'Annual checkup',
//                     start: tomorrow.toISOString(),
//                     end: new Date(tomorrow.getTime() + 30 * 60000).toISOString(),
//                     participant: [
//                         {
//                             actor: {
//                                 reference: `Patient/${createdPatients[0].id}`,
//                                 display: createdPatients[0].name
//                             },
//                             required: 'required',
//                             status: 'accepted'
//                         },
//                         {
//                             actor: {
//                                 reference: `Practitioner/${createdDoctors[0].id}`,
//                                 display: createdDoctors[0].name
//                             },
//                             required: 'required',
//                             status: 'accepted'
//                         }
//                     ]
//                 };

//                 const result = await fhirService.createAppointment(appointment);
//                 if (result.success) {
//                     console.log(`✅ Sample appointment created: ${result.data.id}`);
//                     console.log(`   Patient: ${createdPatients[0].name}`);
//                     console.log(`   Doctor: ${createdDoctors[0].name}`);
//                     console.log(`   Time: ${tomorrow.toLocaleString()}`);
//                 } else {
//                     console.error(`❌ Failed to create sample appointment: ${result.error}`);
//                 }
//             } else {
//                 console.log('⏭️  Skipping sample appointment (tomorrow is weekend)');
//             }
//         }
//         console.log('');

//         // FINAL SUMMARY
//         console.log('='.repeat(60));
//         console.log('🎉 SETUP COMPLETE!');
//         console.log('='.repeat(60));
//         console.log(`✅ Doctors Created: ${createdDoctors.length}`);
//         console.log(`✅ Schedules Created: ${createdSchedules.length}`);
//         console.log(`✅ Slots Created: ${totalSlots}`);
//         console.log(`✅ Patients Created: ${createdPatients.length}`);
//         console.log('');

//         // Print doctor IDs for reference
//         console.log('📋 DOCTOR REFERENCE LIST:');
//         console.log('-'.repeat(60));
//         createdDoctors.forEach((doc, index) => {
//             console.log(`${index + 1}. ${doc.name} (${doc.specialty})`);
//             console.log(`   ID: ${doc.id}`);
//             console.log(`   Slots: ${slotsByDoctor[doc.name] || 0}`);
//         });
//         console.log('');

//         // Print patient IDs for reference
//         console.log('📋 PATIENT REFERENCE LIST:');
//         console.log('-'.repeat(60));
//         createdPatients.forEach((pt, index) => {
//             console.log(`${index + 1}. ${pt.name}`);
//             console.log(`   Phone: ${pt.phone}`);
//             console.log(`   ID: ${pt.id}`);
//         });
//         console.log('');

//         console.log('💡 TIP: Use these doctor names in your appointment booking:');
//         createdDoctors.forEach(doc => {
//             console.log(`   - ${doc.name.replace('Dr. ', '')}`);
//         });
//         console.log('');

//     } catch (error) {
//         console.error('❌ Setup failed:', error);
//         console.error(error.stack);
//     }
// }

// // Run the setup
// setupTestData();

// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function comprehensiveCleanup() {
//     console.log('🧹 Starting Comprehensive Cleanup...\n');
//     console.log('⚠️  This will delete:');
//     console.log('   - Orion West Medical Center organization');
//     console.log('   - All doctors (Sarah Johnson, Michael Chen, etc.)');
//     console.log('   - All related schedules and slots');
//     console.log('   - Duplicate patients');
//     console.log('');
//     console.log('Press Ctrl+C within 3 seconds to cancel...\n');

//     await new Promise(resolve => setTimeout(resolve, 3000));

//     let stats = {
//         organizationsDeleted: 0,
//         doctorsDeleted: 0,
//         schedulesDeleted: 0,
//         slotsDeleted: 0,
//         appointmentsDeleted: 0,
//         patientsDeleted: 0
//     };

//     try {
//         // ========================================
//         // 1. DELETE APPOINTMENTS FIRST (DEPENDENCIES)
//         // ========================================
//         console.log('1️⃣ Deleting Appointments...');
//         try {
//             const appointments = await fhirService.searchAppointments({});
//             if (appointments.success && appointments.entries && appointments.entries.length > 0) {
//                 for (const entry of appointments.entries) {
//                     const result = await fhirService.deleteAppointment(entry.resource.id);
//                     if (result.success) {
//                         stats.appointmentsDeleted++;
//                     }
//                 }
//                 console.log(`   ✅ Deleted ${stats.appointmentsDeleted} appointments\n`);
//             } else {
//                 console.log('   ℹ️  No appointments found\n');
//             }
//         } catch (error) {
//             console.log(`   ⚠️  Error: ${error.message}\n`);
//         }

//         // ========================================
//         // 2. DELETE SLOTS
//         // ========================================
//         console.log('2️⃣ Deleting Slots...');
//         try {
//             const slots = await fhirService.searchSlots({});
//             if (slots.success && slots.entries && slots.entries.length > 0) {
//                 console.log(`   Found ${slots.entries.length} slots...`);
//                 for (const entry of slots.entries) {
//                     const result = await fhirService.deleteSlot(entry.resource.id);
//                     if (result.success) {
//                         stats.slotsDeleted++;
//                         if (stats.slotsDeleted % 50 === 0) {
//                             console.log(`      🔄 Deleted ${stats.slotsDeleted} slots...`);
//                         }
//                     }
//                 }
//                 console.log(`   ✅ Deleted ${stats.slotsDeleted} slots\n`);
//             } else {
//                 console.log('   ℹ️  No slots found\n');
//             }
//         } catch (error) {
//             console.log(`   ⚠️  Error: ${error.message}\n`);
//         }

//         // ========================================
//         // 3. DELETE SCHEDULES
//         // ========================================
//         console.log('3️⃣ Deleting Schedules...');
//         try {
//             const schedules = await fhirService.searchSchedules({});
//             if (schedules.success && schedules.entries && schedules.entries.length > 0) {
//                 for (const entry of schedules.entries) {
//                     const result = await fhirService.deleteSchedule(entry.resource.id);
//                     if (result.success) {
//                         stats.schedulesDeleted++;
//                         console.log(`   ✅ Deleted schedule: ${entry.resource.id}`);
//                     }
//                 }
//                 console.log(`   ✅ Deleted ${stats.schedulesDeleted} schedules\n`);
//             } else {
//                 console.log('   ℹ️  No schedules found\n');
//             }
//         } catch (error) {
//             console.log(`   ⚠️  Error: ${error.message}\n`);
//         }

//         // ========================================
//         // 4. DELETE DOCTORS (PRACTITIONERS)
//         // ========================================
//         console.log('4️⃣ Deleting Doctors...');
//         const doctorNames = [
//             'Dr. Sarah Johnson',
//             'Dr. Michael Chen', 
//             'Dr. Emily Rodriguez',
//             'Dr. James Wilson',
//             'Dr. Lisa Anderson'
//         ];

//         try {
//             const practitioners = await fhirService.searchPractitioners({});
//             if (practitioners.success && practitioners.entries && practitioners.entries.length > 0) {
//                 for (const entry of practitioners.entries) {
//                     const practitioner = entry.resource;
//                     const name = practitioner.name?.[0];
//                     const fullName = name ? 
//                         `${name.prefix?.join(' ') || ''} ${name.given?.join(' ') || ''} ${name.family || ''}`.trim() : 
//                         'Unknown';

//                     // Check if this doctor matches any of the names to delete
//                     const shouldDelete = doctorNames.some(docName => 
//                         fullName.toLowerCase().includes(docName.toLowerCase())
//                     );

//                     if (shouldDelete) {
//                         console.log(`   ❌ Deleting: ${fullName} (ID: ${practitioner.id})`);
//                         const result = await fhirService.deletePractitioner(practitioner.id);
//                         if (result.success) {
//                             stats.doctorsDeleted++;
//                             console.log(`      ✅ Deleted successfully`);
//                         } else {
//                             console.log(`      ⚠️  Failed: ${result.error}`);
//                         }
//                     } else {
//                         console.log(`   ℹ️  Skipping: ${fullName} (not in delete list)`);
//                     }
//                 }
//                 console.log(`   ✅ Deleted ${stats.doctorsDeleted} doctors\n`);
//             } else {
//                 console.log('   ℹ️  No practitioners found\n');
//             }
//         } catch (error) {
//             console.log(`   ⚠️  Error: ${error.message}\n`);
//         }

//         // ========================================
//         // 5. DELETE DUPLICATE PATIENTS (KEEP ONLY 3)
//         // ========================================
//         console.log('5️⃣ Cleaning Up Duplicate Patients...');
//         const patientsToKeep = [
//             { id: '51234952', firstName: 'Jayasri', phone: '+18884180740' },
//             { id: '51234954', firstName: 'Deekshitha', phone: '+15404924023' },
//             { id: '51234956', firstName: 'Susmitha', phone: '+917989338432' }
//         ];

//         const keepIds = new Set(patientsToKeep.map(p => p.id));

//         console.log('   ✅ Will KEEP these patients:');
//         patientsToKeep.forEach(p => {
//             console.log(`      - ${p.name} (ID: ${p.id}) - ${p.phone}`);
//         });
//         console.log('');

//         // Check each phone number for duplicates
//         for (const keepPatient of patientsToKeep) {
//             console.log(`   📱 Checking phone: ${keepPatient.phone} (${keepPatient.name})`);

//             const result = await fhirService.searchPatients({ telecom: keepPatient.phone });

//             if (!result.success || !result.entries || result.entries.length === 0) {
//                 console.log(`      ℹ️  No patients found with this number`);
//                 continue;
//             }

//             console.log(`      Found ${result.entries.length} patient(s) with this number`);

//             for (const entry of result.entries) {
//                 const patient = entry.resource;
//                 const patientId = patient.id;
//                 const name = patient.name?.[0];
//                 const fullName = name ? 
//                     `${name.given?.join(' ') || ''} ${name.family || ''}`.trim() : 
//                     'Unknown';

//                 if (keepIds.has(patientId)) {
//                     console.log(`      ✅ KEEPING: ${fullName} (ID: ${patientId})`);
//                 } else {
//                     console.log(`      ❌ DELETING: ${fullName} (ID: ${patientId})`);
//                     const deleteResult = await fhirService.deletePatient(patientId);
//                     if (deleteResult.success) {
//                         stats.patientsDeleted++;
//                         console.log(`         ✅ Deleted successfully`);
//                     } else {
//                         console.log(`         ⚠️  Failed: ${deleteResult.error}`);
//                     }
//                 }
//             }
//         }
//         console.log(`   ✅ Deleted ${stats.patientsDeleted} duplicate patients\n`);

//         // ========================================
//         // 6. DELETE ORION WEST MEDICAL ORGANIZATION
//         // ========================================
//         console.log('6️⃣ Deleting Orion West Medical Organization...');
//         try {
//             const organizations = await fhirService.searchOrganizations({});
//             if (organizations.success && organizations.entries && organizations.entries.length > 0) {
//                 for (const entry of organizations.entries) {
//                     const org = entry.resource;
//                     const orgName = org.name || '';

//                     // Check if this is Orion West Medical or similar
//                     if (orgName.toLowerCase().includes('orion') || 
//                         orgName.toLowerCase().includes('west') ||
//                         orgName.toLowerCase().includes('orion west medical')) {

//                         console.log(`   ❌ Deleting: ${orgName} (ID: ${org.id})`);
//                         const result = await fhirService.deleteOrganization(org.id);
//                         if (result.success) {
//                             stats.organizationsDeleted++;
//                             console.log(`      ✅ Deleted successfully`);
//                         } else {
//                             console.log(`      ⚠️  Failed: ${result.error}`);
//                         }
//                     } else {
//                         console.log(`   ℹ️  Skipping: ${orgName} (not Orion West)`);
//                     }
//                 }
//                 console.log(`   ✅ Deleted ${stats.organizationsDeleted} organization(s)\n`);
//             } else {
//                 console.log('   ℹ️  No organizations found\n');
//             }
//         } catch (error) {
//             console.log(`   ⚠️  Error: ${error.message}\n`);
//         }

//         // ========================================
//         // FINAL SUMMARY
//         // ========================================
//         console.log('='.repeat(60));
//         console.log('🎉 CLEANUP COMPLETE!');
//         console.log('='.repeat(60));
//         console.log('📊 Deletion Summary:');
//         console.log(`   🗑️  Organizations: ${stats.organizationsDeleted}`);
//         console.log(`   🗑️  Doctors: ${stats.doctorsDeleted}`);
//         console.log(`   🗑️  Schedules: ${stats.schedulesDeleted}`);
//         console.log(`   🗑️  Slots: ${stats.slotsDeleted}`);
//         console.log(`   🗑️  Appointments: ${stats.appointmentsDeleted}`);
//         console.log(`   🗑️  Duplicate Patients: ${stats.patientsDeleted}`);
//         console.log('');
//         console.log('✅ Remaining Data:');
//         console.log('   📋 3 Patients:');
//         patientsToKeep.forEach((p, i) => {
//             console.log(`      ${i + 1}. ${p.name} - ${p.phone} (ID: ${p.id})`);
//         });
//         console.log('');
//         console.log('💡 Your FHIR server is now clean!');
//         console.log('   Run setupTestDataEnhanced.js to create fresh data');
//         console.log('='.repeat(60));

//         // ========================================
//         // VERIFICATION
//         // ========================================
//         console.log('\n🔍 Verifying cleanup...\n');

//         // Verify patients
//         for (const keepPatient of patientsToKeep) {
//             const verifyResult = await fhirService.searchPatients({ telecom: keepPatient.phone });
//             const count = verifyResult.entries?.length || 0;
//             const status = count === 1 ? '✅' : '⚠️';
//             console.log(`   ${status} ${keepPatient.name} (${keepPatient.phone}): ${count} patient(s)`);
//         }

//         // Verify doctors deleted
//         const doctorsRemaining = await fhirService.searchPractitioners({});
//         const docCount = doctorsRemaining.entries?.length || 0;
//         console.log(`   ${docCount === 0 ? '✅' : '⚠️'} Doctors remaining: ${docCount}`);

//         // Verify organization deleted
//         const orgsRemaining = await fhirService.searchOrganizations({});
//         const orgCount = orgsRemaining.entries?.filter(e => 
//             (e.resource.name || '').toLowerCase().includes('orion')
//         ).length || 0;
//         console.log(`   ${orgCount === 0 ? '✅' : '⚠️'} Orion West organizations remaining: ${orgCount}`);

//         console.log('');

//     } catch (error) {
//         console.error('❌ Cleanup failed:', error);
//         console.error(error.stack);
//     }
// }

// // Run the cleanup
// comprehensiveCleanup();


// import fhirService from '../services/fhirService.js';
// import 'dotenv/config';

// async function addSlotsTomorrow() {
//     console.log('🗓️  Adding Slots for Dr. Sarah Johnson - Tomorrow\n');

//     const DOCTOR_ID = '50157606';
//     const SCHEDULE_ID = '50157984';

//     // Get tomorrow's date
//     const tomorrow = new Date();
//     tomorrow.setDate(tomorrow.getDate() + 1);
//     const dateStr = tomorrow.toISOString().split('T')[0];

//     console.log(`📅 Date: ${dateStr} (Tomorrow)`);
//     console.log(`👨‍⚕️  Doctor: Dr. Sarah Johnson (ID: ${DOCTOR_ID})`);
//     console.log(`📋 Schedule: ${SCHEDULE_ID}\n`);

//     const slots = [];
//     let slotsCreated = 0;

//     // Define time slots (9 AM to 5 PM, 30-minute slots)
//     const timeSlots = [
//         '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
//         '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
//         '15:00', '15:30', '16:00', '16:30', '17:00'
//     ];

//     console.log('🕐 Creating slots from 9:00 AM to 5:00 PM (30-minute intervals)\n');

//     try {
//         for (const time of timeSlots) {
//             const [hours, minutes] = time.split(':');

//             // Create start time
//             const start = new Date(`${dateStr}T${time}:00Z`);

//             // Create end time (30 minutes later)
//             const end = new Date(start);
//             end.setMinutes(end.getMinutes() + 30);

//             // Create FHIR Slot resource
//             const slot = {
//                 resourceType: 'Slot',
//                 schedule: {
//                     reference: `Schedule/${SCHEDULE_ID}`
//                 },
//                 status: 'free',
//                 start: start.toISOString(),
//                 end: end.toISOString(),
//                 comment: `Available appointment slot for Dr. James Wilson`
//             };

//             // Create the slot in FHIR
//             const result = await fhirService.createSlot(slot);

//             if (result.success) {
//                 slotsCreated++;
//                 const displayTime = start.toLocaleTimeString('en-US', {
//                     hour: '2-digit',
//                     minute: '2-digit',
//                     hour12: true
//                 });
//                 console.log(`✅ Slot created: ${displayTime} - ${result.fhirId}`);
//             } else {
//                 console.log(`❌ Failed to create slot at ${time}: ${result.error}`);
//             }
//         }

//         console.log('\n' + '='.repeat(60));
//         console.log('🎉 SLOTS CREATED!');
//         console.log('='.repeat(60));
//         console.log(`📊 Total Slots Created: ${slotsCreated} out of ${timeSlots.length}`);
//         console.log(`📅 Date: ${dateStr}`);
//         console.log(`👨‍⚕️  Doctor: Dr. Sarah Johnson`);
//         console.log(`⏰ Time Range: 9:00 AM - 5:00 PM`);
//         console.log(`⏱️  Duration: 30 minutes per slot`);
//         console.log('='.repeat(60));

//         // Verify the slots
//         console.log('\n🔍 Verifying slots...\n');
//         const verifySlots = await fhirService.searchSlots({
//             schedule: SCHEDULE_ID,
//             start: `ge${dateStr}T00:00:00Z`
//         });

//         const tomorrowSlots = verifySlots.entries?.filter(entry => {
//             const slotDate = entry.resource.start.split('T')[0];
//             return slotDate === dateStr;
//         }) || [];

//         console.log(`✅ Verified: ${tomorrowSlots.length} slots exist for tomorrow (${dateStr})`);
//         console.log(`   - ${tomorrowSlots.filter(e => e.resource.status === 'free').length} free slots`);
//         console.log(`   - ${tomorrowSlots.filter(e => e.resource.status === 'busy').length} busy slots`);

//     } catch (error) {
//         console.error('❌ Error creating slots:', error);
//         console.error(error.stack);
//     }
// }

// // Run the script
// addSlotsTomorrow();


import fhirService from '../services/fhirService.js';
import 'dotenv/config';
const PATIENT_ID = '51526060';

async function deletePatientTargeted() {
    console.log('🎯 TARGETED PATIENT DELETION\n');
    console.log(`Patient ID: ${PATIENT_ID}`);
    console.log('Focusing on Communication resources that are blocking deletion\n');
    console.log('Press Ctrl+C within 3 seconds to cancel...\n');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const stats = {
        communicationsDeleted: 0,
        communicationsFailed: 0,
        otherResourcesDeleted: 0,
        patientDeleted: false
    };

    const patientReference = `Patient/${PATIENT_ID}`;

    try {
        // ========================================
        // 1. GET PATIENT INFO
        // ========================================
        console.log('📋 Step 1: Verifying patient...\n');
        const patientResult = await fhirService.getPatient(PATIENT_ID);
        
        if (!patientResult.success) {
            console.log(`❌ Patient ${PATIENT_ID} not found!`);
            return;
        }

        const patient = patientResult.data;
        const patientName = patient.name?.[0];
        const fullName = patientName ? 
            `${patientName.given?.join(' ') || ''} ${patientName.family || ''}`.trim() : 
            'Unknown';
        
        console.log(`✅ Patient: ${fullName}\n`);

        // ========================================
        // 2. DELETE ALL COMMUNICATIONS
        // ========================================
        console.log('📋 Step 2: Finding and deleting ALL Communications...\n');
        
        // Search using multiple parameters to catch all Communications
        const communicationSearches = [
            { param: 'subject', value: patientReference, desc: 'subject' },
            { param: 'patient', value: patientReference, desc: 'patient' },
            { param: 'sender', value: patientReference, desc: 'sender' },
            { param: 'recipient', value: patientReference, desc: 'recipient' }
        ];

        const allCommunications = new Map(); // To avoid duplicates

        for (const search of communicationSearches) {
            console.log(`🔍 Searching Communications by ${search.desc}...`);
            
            try {
                const searchParams = {};
                searchParams[search.param] = search.value;
                
                const result = await fhirService.searchCommunications(searchParams);

                if (result.success && result.entries && result.entries.length > 0) {
                    console.log(`   Found ${result.entries.length} Communication(s)`);
                    
                    result.entries.forEach(entry => {
                        const commId = entry.resource.id;
                        if (!allCommunications.has(commId)) {
                            allCommunications.set(commId, entry.resource);
                        }
                    });
                } else {
                    console.log(`   No Communications found`);
                }
            } catch (error) {
                console.log(`   ⚠️  Search error: ${error.message}`);
            }
        }

        console.log(`\n📊 Total unique Communications found: ${allCommunications.size}\n`);

        if (allCommunications.size > 0) {
            console.log('🗑️  Deleting Communications...\n');
            
            let count = 0;
            for (const [commId, comm] of allCommunications) {
                count++;
                const category = comm.category?.[0]?.coding?.[0]?.display || 'Unknown';
                const status = comm.status || 'unknown';
                
                console.log(`   [${count}/${allCommunications.size}] Deleting Communication/${commId}`);
                console.log(`       Type: ${category}, Status: ${status}`);
                
                try {
                    const result = await fhirService.deleteCommunication(commId);
                    if (result.success) {
                        stats.communicationsDeleted++;
                        console.log(`       ✅ Deleted\n`);
                    } else {
                        stats.communicationsFailed++;
                        console.log(`       ❌ Failed: ${result.error}\n`);
                    }
                } catch (error) {
                    stats.communicationsFailed++;
                    console.log(`       ❌ Failed: ${error.message}\n`);
                }
            }
            
            console.log(`✅ Deleted ${stats.communicationsDeleted} Communication(s)`);
            if (stats.communicationsFailed > 0) {
                console.log(`⚠️  Failed to delete ${stats.communicationsFailed} Communication(s)\n`);
            }
        }

        // ========================================
        // 3. DELETE OTHER RESOURCES
        // ========================================
        console.log('\n📋 Step 3: Checking for other resources...\n');

        const otherResources = [
            { type: 'Appointment', param: 'patient' },
            { type: 'Encounter', param: 'subject' },
            { type: 'MedicationRequest', param: 'subject' },
            { type: 'Observation', param: 'subject' },
            { type: 'DiagnosticReport', param: 'subject' },
            { type: 'AllergyIntolerance', param: 'patient' },
            { type: 'Condition', param: 'subject' },
            { type: 'Procedure', param: 'subject' },
            { type: 'CarePlan', param: 'subject' },
            { type: 'Immunization', param: 'patient' },
            { type: 'RelatedPerson', param: 'patient' }
        ];

        for (const resource of otherResources) {
            try {
                const searchParams = {};
                searchParams[resource.param] = patientReference;
                
                const result = await fhirService.searchResources(resource.type, searchParams);

                if (result.success && result.entries && result.entries.length > 0) {
                    console.log(`🗑️  Found ${result.entries.length} ${resource.type}(s), deleting...`);
                    
                    for (const entry of result.entries) {
                        const resourceId = entry.resource.id;
                        try {
                            await fhirService.axios.delete(`/${resource.type}/${resourceId}`);
                            stats.otherResourcesDeleted++;
                            console.log(`   ✅ Deleted ${resource.type}/${resourceId}`);
                        } catch (error) {
                            console.log(`   ❌ Failed to delete ${resource.type}/${resourceId}`);
                        }
                    }
                }
            } catch (error) {
                // Resource type not found or search failed
            }
        }

        if (stats.otherResourcesDeleted > 0) {
            console.log(`\n✅ Deleted ${stats.otherResourcesDeleted} other resource(s)\n`);
        } else {
            console.log(`✅ No other resources found\n`);
        }

        // ========================================
        // 4. ATTEMPT PATIENT DELETION
        // ========================================
        console.log('📋 Step 4: Attempting patient deletion...\n');
        console.log(`🗑️  Deleting Patient/${PATIENT_ID} (${fullName})`);
        
        try {
            await fhirService.axios.delete(`/Patient/${PATIENT_ID}`);
            stats.patientDeleted = true;
            console.log(`   ✅ Patient deleted successfully!\n`);
        } catch (error) {
            const errorMsg = error.response?.data?.issue?.[0]?.diagnostics || error.message;
            console.log(`   ❌ Failed: ${errorMsg}\n`);
            
            // If still failing, show which resources are still blocking
            if (errorMsg.includes('reference')) {
                console.log('   🔍 Checking for remaining references...\n');
                
                // Extract resource type from error message
                const match = errorMsg.match(/resource (\w+)\/(\d+)/);
                if (match) {
                    const blockingType = match[1];
                    const blockingId = match[2];
                    console.log(`   ⚠️  Blocking resource: ${blockingType}/${blockingId}`);
                    
                    // Try to get details about the blocking resource
                    try {
                        const blockingResource = await fhirService.axios.get(`/${blockingType}/${blockingId}`);
                        console.log(`   📄 Resource details:`);
                        console.log(JSON.stringify(blockingResource.data, null, 2));
                    } catch (e) {
                        console.log(`   ⚠️  Could not retrieve blocking resource details`);
                    }
                }
            }
        }

        // ========================================
        // 5. FINAL VERIFICATION
        // ========================================
        console.log('\n' + '='.repeat(70));
        console.log('📊 DELETION SUMMARY');
        console.log('='.repeat(70));
        console.log(`Patient: ${fullName} (ID: ${PATIENT_ID})\n`);
        console.log(`✅ Communications deleted:    ${stats.communicationsDeleted}`);
        if (stats.communicationsFailed > 0) {
            console.log(`❌ Communications failed:     ${stats.communicationsFailed}`);
        }
        console.log(`✅ Other resources deleted:   ${stats.otherResourcesDeleted}`);
        console.log(`${stats.patientDeleted ? '✅' : '❌'} Patient deleted:          ${stats.patientDeleted ? 'YES' : 'NO'}`);
        console.log('='.repeat(70));

        console.log('\n🔍 Final Verification...\n');

        const verifyResult = await fhirService.getPatient(PATIENT_ID);
        if (!verifyResult.success) {
            console.log(`✅✅✅ SUCCESS! Patient ${PATIENT_ID} has been completely deleted! ✅✅✅\n`);
        } else {
            console.log(`⚠️  Patient ${PATIENT_ID} still exists\n`);
            
            // Do one final check for Communications
            const finalCommCheck = await fhirService.searchCommunications({ subject: patientReference });
            if (finalCommCheck.success && finalCommCheck.entries && finalCommCheck.entries.length > 0) {
                console.log(`⚠️  WARNING: ${finalCommCheck.entries.length} Communication(s) still exist!`);
                console.log(`   This might be due to server-side caching or indexing delays.`);
                console.log(`   Try running the script again in a few seconds.\n`);
            }
        }

    } catch (error) {
        console.error('\n❌ CRITICAL ERROR:', error.message);
        console.error(error.stack);
    }
}

// Run the targeted deletion
deletePatientTargeted();