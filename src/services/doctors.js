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
        console.log(`🔍 Checking availability for: ${doctor_name || practitioner_id}`);

        let practitionerId = practitioner_id;

        // If no practitioner ID, search by name
        if (!practitionerId && doctor_name) {
            const searchResult = await searchDoctorByName(doctor_name);
            if (!searchResult.success || searchResult.doctors.length === 0) {
                return {
                    available: false,
                    reason: 'Doctor not found',
                    message: `No doctor found with name "${doctor_name}"`
                };
            }
            practitionerId = searchResult.doctors[0].id;
            console.log(`✅ Found doctor: ${searchResult.doctors[0].name} (ID: ${practitionerId})`);
        }

        // Get doctor's schedules
        const scheduleResult = await fhirService.searchSchedules({
            actor: `Practitioner/${practitionerId}`
        });

        if (!scheduleResult.success || scheduleResult.total === 0) {
            return {
                available: false,
                reason: 'No schedule found',
                message: 'Doctor has no schedule configured in the system'
            };
        }

        console.log(`📅 Found ${scheduleResult.total} schedule(s) for doctor`);

        // Check slots for each schedule
        let allAvailableSlots = [];

        for (const scheduleEntry of scheduleResult.entries) {
            const schedule = scheduleEntry.resource;
            const scheduleId = schedule.id;

            // Build slot search parameters
            const slotSearchParams = {
                schedule: scheduleId,
                status: 'free'
            };

            // Filter by date if provided
            if (date) {
                slotSearchParams.start = `ge${date}T00:00:00Z`;
                // Note: 'end' parameter is not supported by HAPI FHIR, so we filter after fetch
            }

            // Search for available slots
            const slotsResult = await fhirService.searchSlots(slotSearchParams);

            if (slotsResult.success && slotsResult.entries) {
                const slots = slotsResult.entries
                    // ✅ Filter by date in code (since 'end' parameter not supported)
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

                console.log(`   📍 Schedule ${scheduleId}: ${slots.length} available slots`);
            }
        }

        // Get doctor information
        const doctorResult = await fhirService.getPractitioner(practitionerId);
        let doctorInfo = {
            id: practitionerId,
            name: doctor_name || 'Unknown'
        };

        if (doctorResult.success) {
            const prac = doctorResult.data;
            const name = prac.name?.[0];
            doctorInfo = {
                id: practitionerId,
                name: name?.text || `${name?.prefix?.[0] || ''} ${name?.given?.join(' ') || ''} ${name?.family || ''}`.trim(),
                specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 'General Practice',
                phone: prac.telecom?.find(t => t.system === 'phone')?.value || null,
                email: prac.telecom?.find(t => t.system === 'email')?.value || null
            };
        }

        // Sort slots by date/time
        allAvailableSlots.sort((a, b) => new Date(a.start) - new Date(b.start));

        const isAvailable = allAvailableSlots.length > 0;

        console.log(`${isAvailable ? '✅' : '❌'} Result: ${allAvailableSlots.length} available slots found\n`);

        return {
            available: isAvailable,
            doctor: doctorInfo,
            totalSlots: allAvailableSlots.length,
            slots: allAvailableSlots.slice(0, 20), // Return max 20 slots
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
                specialty: prac.qualification?.[0]?.code?.coding?.[0]?.display || 'General Practice',
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

        // Get all active practitioners
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

        // Sort by availability (available doctors first)
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
        // Get the slot
        const slotResult = await fhirService.getSlot(slotId);

        if (!slotResult.success) {
            return {
                success: false,
                message: 'Slot not found'
            };
        }

        const slot = slotResult.data;

        // Check if already booked
        if (slot.status !== 'free') {
            return {
                success: false,
                message: `Slot is not available (status: ${slot.status})`
            };
        }

        // Update slot to busy
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