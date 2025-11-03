// import fhirService from './fhirService.js';

// /**
//  * Enhanced Doctor Availability Checker
//  * Checks both Schedule and Slot resources in FHIR EMR
//  */

// /**
//  * Check if doctor is available for a specific date/time
//  */
// export async function checkDoctorAvailability({
//     doctor_name,
//     practitioner_id,
//     date,
//     time,
//     specialty
// }) {
//     try {
//         console.log(`🔍 Checking availability for: ${doctor_name || practitioner_id}`);

//         let practitionerId = practitioner_id;

//         // If no practitioner ID, search by name with improved matching
//         if (!practitionerId && doctor_name) {
//             // Normalize the input name for better matching
//             const normalizedInput = doctor_name.toLowerCase()
//                 .replace(/^dr\.?\s*/i, '') // Remove "Dr." prefix
//                 .trim();

//             // First attempt: search with the name as provided
//             let searchResult = await searchDoctorByName(doctor_name);
            
//             // If not found, try with "Dr." prefix
//             if (!searchResult.success || searchResult.doctors.length === 0) {
//                 console.log(`⚠️ No results for "${doctor_name}", trying with "Dr." prefix...`);
//                 searchResult = await searchDoctorByName(`Dr. ${doctor_name}`);
//             }
            
//             // If still not found, try partial matching
//             if (!searchResult.success || searchResult.doctors.length === 0) {
//                 console.log(`⚠️ No results for "Dr. ${doctor_name}", trying partial match...`);
//                 // Try searching with just the last name
//                 const nameParts = normalizedInput.split(/\s+/);
//                 if (nameParts.length > 1) {
//                     const lastName = nameParts[nameParts.length - 1];
//                     searchResult = await searchDoctorByName(lastName);
//                 }
//             }
            
//             // If still no results, return error
//             if (!searchResult.success || searchResult.doctors.length === 0) {
//                 return {
//                     available: false,
//                     reason: 'Doctor not found',
//                     message: `No doctor found with name "${doctor_name}". Please check the spelling or try the full name.`
//                 };
//             }

//             // If multiple matches found, find the best match
//             let bestMatch = searchResult.doctors[0];
            
//             if (searchResult.doctors.length > 1) {
//                 console.log(`📋 Found ${searchResult.doctors.length} potential matches, selecting best match...`);
                
//                 // Try to find exact or closest match
//                 for (const doctor of searchResult.doctors) {
//                     const doctorNameNormalized = doctor.name.toLowerCase()
//                         .replace(/^dr\.?\s*/i, '')
//                         .trim();
                    
//                     // Exact match (ignoring "Dr." prefix)
//                     if (doctorNameNormalized === normalizedInput) {
//                         bestMatch = doctor;
//                         console.log(`✅ Exact match found: ${doctor.name}`);
//                         break;
//                     }
                    
//                     // Close match (contains the search term)
//                     if (doctorNameNormalized.includes(normalizedInput)) {
//                         bestMatch = doctor;
//                     }
//                 }
                
//                 // Log all matches for debugging
//                 console.log('   Available matches:');
//                 searchResult.doctors.forEach(d => {
//                     console.log(`   - ${d.name} (ID: ${d.id})`);
//                 });
//             }
            
//             practitionerId = bestMatch.id;
//             console.log(`✅ Selected doctor: ${bestMatch.name} (ID: ${practitionerId})`);
//         }

//         // Get doctor's schedules
//         const scheduleResult = await fhirService.searchSchedules({
//             actor: `Practitioner/${practitionerId}`
//         });

//         if (!scheduleResult.success || scheduleResult.total === 0) {
//             return {
//                 available: false,
//                 reason: 'No schedule found',
//                 message: 'Doctor has no schedule configured in the system'
//             };
//         }

//         console.log(`📅 Found ${scheduleResult.total} schedule(s) for doctor`);

//         // Check slots for each schedule
//         let allAvailableSlots = [];

//         for (const scheduleEntry of scheduleResult.entries) {
//             const schedule = scheduleEntry.resource;
//             const scheduleId = schedule.id;

//             // Build slot search parameters
//             const slotSearchParams = {
//                 schedule: scheduleId,
//                 status: 'free'
//             };

//             // Filter by date if provided
//             if (date) {
//                 slotSearchParams.start = `ge${date}T00:00:00Z`;
//                 // Note: 'end' parameter is not supported by HAPI FHIR, so we filter after fetch
//             }

//             // Search for available slots
//             const slotsResult = await fhirService.searchSlots(slotSearchParams);

//             if (slotsResult.success && slotsResult.entries) {
//                 const slots = slotsResult.entries
//                     // ✅ Filter by date in code (since 'end' parameter not supported)
//                     .filter(entry => {
//                         if (date && entry.resource.start) {
//                             const slotDate = entry.resource.start.split('T')[0];
//                             return slotDate === date;
//                         }
//                         return true;
//                     })
//                     .map(entry => {
//                         const slot = entry.resource;
//                         const startDate = new Date(slot.start);

//                         return {
//                             slotId: slot.id,
//                             date: startDate.toLocaleDateString('en-US'),
//                             time: startDate.toLocaleTimeString('en-US', {
//                                 hour: '2-digit',
//                                 minute: '2-digit'
//                             }),
//                             start: slot.start,
//                             end: slot.end,
//                             status: slot.status,
//                             scheduleId: scheduleId
//                         };
//                     });

//                 // Filter by time if provided
//                 if (time) {
//                     const filteredSlots = slots.filter(slot => {
//                         const slotTime = slot.time.toLowerCase().replace(/\s/g, '');
//                         const requestedTime = time.toLowerCase().replace(/\s/g, '');
//                         return slotTime.includes(requestedTime);
//                     });
//                     allAvailableSlots.push(...filteredSlots);
//                 } else {
//                     allAvailableSlots.push(...slots);
//                 }

//                 console.log(`   📍 Schedule ${scheduleId}: ${slots.length} available slots`);
//             }
//         }

//         // Get doctor information
//         const doctorResult = await fhirService.getPractitioner(practitionerId);
//         let doctorInfo = {
//             id: practitionerId,
//             name: doctor_name || 'Unknown'
//         };

//         if (doctorResult.success) {
//             const prac = doctorResult.data;
//             const name = prac.name?.[0];
//             doctorInfo = {
//                 id: practitionerId,
//                 name: name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim(),
//                 specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 'General Practice',
//                 phone: prac.telecom?.find(t => t.system === 'phone')?.value || null,
//                 email: prac.telecom?.find(t => t.system === 'email')?.value || null
//             };
//         }

//         // Sort slots by date/time
//         allAvailableSlots.sort((a, b) => new Date(a.start) - new Date(b.start));

//         const isAvailable = allAvailableSlots.length > 0;

//         console.log(`${isAvailable ? '✅' : '❌'} Result: ${allAvailableSlots.length} available slots found\n`);

//         return {
//             available: isAvailable,
//             doctor: doctorInfo,
//             totalSlots: allAvailableSlots.length,
//             slots: allAvailableSlots.slice(0, 20), // Return max 20 slots
//             message: isAvailable ?
//                 `${doctorInfo.name} has ${allAvailableSlots.length} available slot(s)` :
//                 `${doctorInfo.name} has no available slots for the requested time`
//         };

//     } catch (error) {
//         console.error('❌ Error checking doctor availability:', error);
//         return {
//             available: false,
//             reason: 'System error',
//             message: 'Error checking availability',
//             error: error.message
//         };
//     }
// }

// /**
//  * Search for doctor by name
//  */
// export async function searchDoctorByName(doctorName) {
//     try {
//         const result = await fhirService.searchPractitioners({
//             name: doctorName
//         });

//         if (!result.success) {
//             return {
//                 success: false,
//                 error: result.error
//             };
//         }

//         const doctors = result.entries.map(entry => {
//             const prac = entry.resource;
//             const name = prac.name?.[0];

//             return {
//                 id: prac.id,
//                 name: name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim(),
//                 specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 'General Practice',
//                 phone: prac.telecom?.find(t => t.system === 'phone')?.value,
//                 email: prac.telecom?.find(t => t.system === 'email')?.value,
//                 active: prac.active !== false
//             };
//         });

//         return {
//             success: true,
//             doctors,
//             total: doctors.length
//         };
//     } catch (error) {
//         console.error('Error searching for doctor:', error);
//         return {
//             success: false,
//             error: error.message
//         };
//     }
// }

// /**
//  * Get all available doctors with their next available slots
//  */
// export async function getAllAvailableDoctors(date = null) {
//     try {
//         console.log('🔍 Getting all available doctors...');

//         // Get all active practitioners
//         const result = await fhirService.searchPractitioners({
//             active: true
//         });

//         if (!result.success || result.total === 0) {
//             return {
//                 success: false,
//                 message: 'No doctors found in the system'
//             };
//         }

//         const availabilityPromises = result.entries.map(async (entry) => {
//             const prac = entry.resource;
//             const availabilityResult = await checkDoctorAvailability({
//                 practitioner_id: prac.id,
//                 date: date
//             });

//             return {
//                 ...availabilityResult.doctor,
//                 available: availabilityResult.available,
//                 nextAvailableSlot: availabilityResult.slots?.[0] || null,
//                 totalSlots: availabilityResult.totalSlots || 0
//             };
//         });

//         const doctors = await Promise.all(availabilityPromises);

//         // Sort by availability (available doctors first)
//         doctors.sort((a, b) => {
//             if (a.available === b.available) return 0;
//             return a.available ? -1 : 1;
//         });

//         console.log(`✅ Found ${doctors.length} doctors, ${doctors.filter(d => d.available).length} available\n`);

//         return {
//             success: true,
//             doctors,
//             total: doctors.length,
//             available: doctors.filter(d => d.available).length
//         };
//     } catch (error) {
//         console.error('Error getting available doctors:', error);
//         return {
//             success: false,
//             error: error.message
//         };
//     }
// }

// /**
//  * Book a slot (mark it as busy)
//  */
// export async function bookSlot(slotId) {
//     try {
//         // Get the slot
//         const slotResult = await fhirService.getSlot(slotId);

//         if (!slotResult.success) {
//             return {
//                 success: false,
//                 message: 'Slot not found'
//             };
//         }

//         const slot = slotResult.data;

//         // Check if already booked
//         if (slot.status !== 'free') {
//             return {
//                 success: false,
//                 message: `Slot is not available (status: ${slot.status})`
//             };
//         }

//         // Update slot to busy
//         slot.status = 'busy';

//         const updateResult = await fhirService.updateSlot(slotId, slot);

//         if (updateResult.success) {
//             return {
//                 success: true,
//                 message: 'Slot booked successfully',
//                 slot: {
//                     id: slotId,
//                     start: slot.start,
//                     end: slot.end,
//                     status: 'busy'
//                 }
//             };
//         } else {
//             return {
//                 success: false,
//                 message: 'Failed to book slot',
//                 error: updateResult.error
//             };
//         }
//     } catch (error) {
//         console.error('Error booking slot:', error);
//         return {
//             success: false,
//             error: error.message
//         };
//     }
// }

// export default {
//     checkDoctorAvailability,
//     searchDoctorByName,
//     getAllAvailableDoctors,
//     bookSlot
// };
import fhirService from './fhirService.js';

/**
 * Enhanced Doctor Availability Checker
 * Checks both Schedule and Slot resources in FHIR EMR
 */

/**
 * Check if doctor is available for a specific date/time
 */
export async function checkDoctorAvailability({
    doctor_name,
    practitioner_id,
    date,
    time,
    specialty
}) {
    try {
        console.log(`🔍 Checking availability for: ${doctor_name || specialty || practitioner_id}`);

        let practitionerIds = [];

        // Case 1: Practitioner ID provided directly
        if (practitioner_id) {
            practitionerIds = [practitioner_id];
        }
        // Case 2: Doctor name provided - search by name
        else if (doctor_name) {
            const normalizedInput = doctor_name.toLowerCase()
                .replace(/^dr\.?\s*/i, '')
                .trim();

            let searchResult = await searchDoctorByName(doctor_name);
            
            if (!searchResult.success || searchResult.doctors.length === 0) {
                console.log(`⚠️  No results for "${doctor_name}", trying with "Dr." prefix...`);
                searchResult = await searchDoctorByName(`Dr. ${doctor_name}`);
            }
            
            if (!searchResult.success || searchResult.doctors.length === 0) {
                console.log(`⚠️  No results for "Dr. ${doctor_name}", trying partial match...`);
                const nameParts = normalizedInput.split(/\s+/);
                if (nameParts.length > 1) {
                    const lastName = nameParts[nameParts.length - 1];
                    searchResult = await searchDoctorByName(lastName);
                }
            }
            
            if (!searchResult.success || searchResult.doctors.length === 0) {
                return {
                    available: false,
                    reason: 'Doctor not found',
                    message: `No doctor found with name "${doctor_name}". Please check the spelling or try the full name.`
                };
            }

            let bestMatch = searchResult.doctors[0];
            
            if (searchResult.doctors.length > 1) {
                console.log(`📋 Found ${searchResult.doctors.length} potential matches, selecting best match...`);
                
                for (const doctor of searchResult.doctors) {
                    const doctorNameNormalized = doctor.name.toLowerCase()
                        .replace(/^dr\.?\s*/i, '')
                        .trim();
                    
                    if (doctorNameNormalized === normalizedInput) {
                        bestMatch = doctor;
                        console.log(`✅ Exact match found: ${doctor.name}`);
                        break;
                    }
                    
                    if (doctorNameNormalized.includes(normalizedInput)) {
                        bestMatch = doctor;
                    }
                }
                
                console.log('   Available matches:');
                searchResult.doctors.forEach(d => {
                    console.log(`   - ${d.name} (ID: ${d.id})`);
                });
            }
            
            practitionerIds = [bestMatch.id];
            console.log(`✅ Selected doctor: ${bestMatch.name} (ID: ${practitionerIds[0]})`);
        }
        // Case 3: Only specialty provided - search all doctors with that specialty
        else if (specialty) {
            console.log(`🔍 Searching for all doctors with specialty: ${specialty}`);
            
            // Search for practitioners with the given specialty
            const practitionersResult = await fhirService.searchPractitioners({
                active: true
            });

            if (!practitionersResult.success || practitionersResult.total === 0) {
                return {
                    available: false,
                    reason: 'No doctors found',
                    message: 'No active doctors found in the system'
                };
            }

            // Filter by specialty
            const matchingDoctors = practitionersResult.entries.filter(entry => {
                const prac = entry.resource;
                const doctorSpecialty = prac.qualification?.[0]?.code?.coding?.[0]?.display || 
                                       prac.qualification?.[0]?.code?.text || '';
                
                // Case-insensitive partial match
                return doctorSpecialty.toLowerCase().includes(specialty.toLowerCase()) ||
                       specialty.toLowerCase().includes(doctorSpecialty.toLowerCase());
            });

            if (matchingDoctors.length === 0) {
                return {
                    available: false,
                    reason: 'No doctors with specialty found',
                    message: `No doctors found with specialty: ${specialty}. Please try a different specialty or ask for available specialties.`
                };
            }

            practitionerIds = matchingDoctors.map(entry => entry.resource.id);
            console.log(`✅ Found ${practitionerIds.length} doctor(s) with specialty: ${specialty}`);
        }
        else {
            return {
                available: false,
                reason: 'Insufficient information',
                message: 'Please provide either a doctor name or specialty to check availability'
            };
        }

        // Now check availability for all matching practitioners
        let allAvailableSlots = [];
        let doctorsInfo = [];

        for (const practitionerId of practitionerIds) {
            // Get doctor's schedules
            const scheduleResult = await fhirService.searchSchedules({
                actor: `Practitioner/${practitionerId}`
            });

            if (!scheduleResult.success || scheduleResult.total === 0) {
                continue; // Skip this doctor if no schedule
            }

            console.log(`📅 Found ${scheduleResult.total} schedule(s) for doctor ${practitionerId}`);

            // Check slots for each schedule
            for (const scheduleEntry of scheduleResult.entries) {
                const schedule = scheduleEntry.resource;
                const scheduleId = schedule.id;

                const slotSearchParams = {
                    schedule: scheduleId,
                    status: 'free'
                };

                if (date) {
                    slotSearchParams.start = `ge${date}T00:00:00Z`;
                }

                const slotsResult = await fhirService.searchSlots(slotSearchParams);

                if (slotsResult.success && slotsResult.entries) {
                    const slots = slotsResult.entries
                        .filter(entry => {
                            if (date && entry.resource.start) {
                                const slotDate = entry.resource.start.split('T')[0];
                                return slotDate === date;
                            }
                            return true;
                        })
                        .map(entry => {
                            const slot = entry.resource;
                            const startDate = new Date(slot.start);

                            return {
                                slotId: slot.id,
                                practitionerId: practitionerId,
                                date: startDate.toLocaleDateString('en-US'),
                                time: startDate.toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                }),
                                start: slot.start,
                                end: slot.end,
                                status: slot.status,
                                scheduleId: scheduleId
                            };
                        });

                    // Filter by time if provided
                    if (time) {
                        const filteredSlots = slots.filter(slot => {
                            const slotTime = slot.time.toLowerCase().replace(/\s/g, '');
                            const requestedTime = time.toLowerCase().replace(/\s/g, '');
                            return slotTime.includes(requestedTime);
                        });
                        allAvailableSlots.push(...filteredSlots);
                    } else {
                        allAvailableSlots.push(...slots);
                    }

                    console.log(`   🔍 Schedule ${scheduleId}: ${slots.length} available slots`);
                }
            }

            // Get doctor information
            const doctorResult = await fhirService.getPractitioner(practitionerId);
            if (doctorResult.success) {
                const prac = doctorResult.data;
                const name = prac.name?.[0];
                const doctorInfo = {
                    id: practitionerId,
                    name: name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim(),
                    specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 
                              prac.qualification?.[0]?.code?.text || 'General Practice',
                    phone: prac.telecom?.find(t => t.system === 'phone')?.value || null,
                    email: prac.telecom?.find(t => t.system === 'email')?.value || null,
                    availableSlots: allAvailableSlots.filter(s => s.practitionerId === practitionerId).length
                };
                doctorsInfo.push(doctorInfo);
            }
        }

        // Sort slots by date/time
        allAvailableSlots.sort((a, b) => new Date(a.start) - new Date(b.start));

        const isAvailable = allAvailableSlots.length > 0;

        console.log(`${isAvailable ? '✅' : '❌'} Result: ${allAvailableSlots.length} available slots found\n`);

        // If searching by specialty, return info about all matching doctors
        if (specialty && !doctor_name) {
            return {
                available: isAvailable,
                doctors: doctorsInfo,
                totalSlots: allAvailableSlots.length,
                slots: allAvailableSlots.slice(0, 20),
                message: isAvailable ?
                    `Found ${doctorsInfo.length} doctor(s) with specialty "${specialty}" having ${allAvailableSlots.length} available slot(s)` :
                    `Found ${doctorsInfo.length} doctor(s) with specialty "${specialty}" but no available slots for the requested time`
            };
        }

        // For single doctor search, return single doctor info
        const doctorInfo = doctorsInfo[0] || {
            id: practitionerIds[0],
            name: doctor_name || 'Unknown',
            specialty: specialty || 'Unknown'
        };

        return {
            available: isAvailable,
            doctor: doctorInfo,
            totalSlots: allAvailableSlots.length,
            slots: allAvailableSlots.slice(0, 20),
            message: isAvailable ?
                `${doctorInfo.name} has ${allAvailableSlots.length} available slot(s)` :
                `${doctorInfo.name} has no available slots for the requested time`
        };

    } catch (error) {
        console.error('❌ Error checking doctor availability:', error);
        return {
            available: false,
            reason: 'System error',
            message: 'Error checking availability',
            error: error.message
        };
    }
}

/**
 * Search for doctor by name
 */
export async function searchDoctorByName(doctorName) {
    try {
        const result = await fhirService.searchPractitioners({
            name: doctorName
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error
            };
        }

        const doctors = result.entries.map(entry => {
            const prac = entry.resource;
            const name = prac.name?.[0];

            return {
                id: prac.id,
                name: name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim(),
                specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 
                          prac.qualification?.[0]?.code?.text || 'General Practice',
                phone: prac.telecom?.find(t => t.system === 'phone')?.value,
                email: prac.telecom?.find(t => t.system === 'email')?.value,
                active: prac.active !== false
            };
        });

        return {
            success: true,
            doctors,
            total: doctors.length
        };
    } catch (error) {
        console.error('Error searching for doctor:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get all available doctors with their next available slots
 */
export async function getAllAvailableDoctors(date = null) {
    try {
        console.log('🔍 Getting all available doctors...');

        const result = await fhirService.searchPractitioners({
            active: true
        });

        if (!result.success || result.total === 0) {
            return {
                success: false,
                message: 'No doctors found in the system'
            };
        }

        const availabilityPromises = result.entries.map(async (entry) => {
            const prac = entry.resource;
            const availabilityResult = await checkDoctorAvailability({
                practitioner_id: prac.id,
                date: date
            });

            return {
                ...availabilityResult.doctor,
                available: availabilityResult.available,
                nextAvailableSlot: availabilityResult.slots?.[0] || null,
                totalSlots: availabilityResult.totalSlots || 0
            };
        });

        const doctors = await Promise.all(availabilityPromises);

        doctors.sort((a, b) => {
            if (a.available === b.available) return 0;
            return a.available ? -1 : 1;
        });

        console.log(`✅ Found ${doctors.length} doctors, ${doctors.filter(d => d.available).length} available\n`);

        return {
            success: true,
            doctors,
            total: doctors.length,
            available: doctors.filter(d => d.available).length
        };
    } catch (error) {
        console.error('Error getting available doctors:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Book a slot (mark it as busy)
 */
export async function bookSlot(slotId) {
    try {
        const slotResult = await fhirService.getSlot(slotId);

        if (!slotResult.success) {
            return {
                success: false,
                message: 'Slot not found'
            };
        }

        const slot = slotResult.data;

        if (slot.status !== 'free') {
            return {
                success: false,
                message: `Slot is not available (status: ${slot.status})`
            };
        }

        slot.status = 'busy';

        const updateResult = await fhirService.updateSlot(slotId, slot);

        if (updateResult.success) {
            return {
                success: true,
                message: 'Slot booked successfully',
                slot: {
                    id: slotId,
                    start: slot.start,
                    end: slot.end,
                    status: 'busy'
                }
            };
        } else {
            return {
                success: false,
                message: 'Failed to book slot',
                error: updateResult.error
            };
        }
    } catch (error) {
        console.error('Error booking slot:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

export default {
    checkDoctorAvailability,
    searchDoctorByName,
    getAllAvailableDoctors,
    bookSlot
};