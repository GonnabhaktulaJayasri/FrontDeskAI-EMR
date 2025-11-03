import fhirService from './fhirService.js';
import fhirSearchService from './fhirSearchService.js';
import { searchPatientByPhone, createPatient } from './patient.js';
import { searchDoctorByName } from './doctors.js';
import { getPatientRelatedPersons, linkRelatedPerson } from './relatedPerson.js';

/**
 * Appointment service - works directly with FHIR Appointment resources
 */

/**
 * Load patient data including demographics and upcoming appointments
 */
export const loadPatientData = async (patientFhirId) => {
    try {
        console.log('Loading patient data for:', patientFhirId);

        // Get patient demographics
        const patientResult = await fhirService.getPatient(patientFhirId);
        if (!patientResult.success) {
            console.error('Failed to load patient:', patientResult.error);
            return null;
        }

        const patient = patientResult.data;
        const patientInfo = fhirSearchService.extractPatientInfo(patient);

        // Get upcoming appointments
        const now = new Date().toISOString();
        const appointmentsResult = await fhirService.searchAppointments({
            patient: patientFhirId,
            date: `ge${now}`,
            status: 'booked'
        });

        const upcomingAppointments = appointmentsResult.success ?
            appointmentsResult.entries.map(entry => {
                const appt = entry.resource;
                const practitionerRef = appt.participant?.find(p =>
                    p.actor?.reference?.startsWith('Practitioner/')
                );

                const dateTime = new Date(appt.start);
                return {
                    id: appt.id,
                    date: dateTime.toLocaleDateString(),
                    time: dateTime.toLocaleTimeString(),
                    doctor: practitionerRef?.actor?.display || 'Unknown',
                    reason: appt.description || appt.comment || 'General Consultation',
                    confirmationNumber: appt.id,
                    status: appt.status
                };
            }) : [];

        return {
            patientData: {
                ...patientInfo,
                fhirId: patientFhirId,
                totalVisits: appointmentsResult.total || 0
            },
            upcomingAppointments
        };
    } catch (error) {
        console.error('Error loading patient data:', error);
        return null;
    }
};

/**
 * Find appointments for a patient (used by callAssistant)
 */
export const findPatientAppointments = async (args) => {
    try {
        console.log('Finding appointments for:', args);

        let patientFhirId = args.patient_fhir_id;

        // If no FHIR ID, try to find by phone
        if (!patientFhirId && args.patient_phone) {
            const patientResult = await searchPatientByPhone(args.patient_phone);
            if (patientResult.success && patientResult.total > 0) {
                patientFhirId = patientResult.entries[0].resource.id;
            }
        }

        if (!patientFhirId) {
            return {
                success: false,
                message: 'Patient not found'
            };
        }

        const searchParams = { patient: patientFhirId };

        // Add status filter if provided
        if (args.status) {
            searchParams.status = args.status;
        }

        // Add date filter if provided
        if (args.date) {
            searchParams.date = args.date;
        }

        const result = await fhirService.searchAppointments(searchParams);

        if (!result.success) {
            return {
                success: false,
                message: 'Error searching appointments',
                error: result.error
            };
        }

        const appointments = result.entries.map(entry => {
            const appt = entry.resource;
            const dateTime = new Date(appt.start);
            const practitionerRef = appt.participant?.find(p =>
                p.actor?.reference?.startsWith('Practitioner/')
            );

            return {
                id: appt.id,
                date: dateTime.toLocaleDateString(),
                time: dateTime.toLocaleTimeString(),
                doctor: practitionerRef?.actor?.display || 'Unknown',
                reason: appt.description || 'General Consultation',
                status: appt.status,
                confirmationNumber: appt.id,
                start: appt.start,
                end: appt.end
            };
        });

        return {
            success: true,
            appointments,
            count: appointments.length,
            total: result.total
        };
    } catch (error) {
        console.error('Error finding appointments:', error);
        return {
            success: false,
            message: 'Error finding appointments',
            error: error.message
        };
    }
};

/**
 * Book a new appointment
 */
// export const bookAppointment = async ({ 
//     patient_firstname, 
//     patient_lastname, 
//     patient_phone, 
//     patient_dob, 
//     patient_age, 
//     doctor_name, 
//     date, 
//     time, 
//     reason 
// }) => {
//     try {
//         // Step 1: Find or create patient
//         let patientResult = await searchPatientByPhone(patient_phone);
//         let patientId;

//         if (patientResult.success && patientResult.total > 0) {
//             patientId = patientResult.entries[0].resource.id;
//         } else {
//             // Create new patient
//             const newPatientResult = await createPatient({
//                 name: `${patient_firstname} ${patient_lastname}`,
//                 phone: patient_phone,
//                 dob: patient_dob,
//                 age: patient_age
//             });

//             if (!newPatientResult.success) {
//                 return { success: false, message: 'Failed to create patient' };
//             }

//             patientId = newPatientResult.fhirId;
//         }

//         // Step 2: Find practitioner
//         const doctorResult = await searchDoctorByName(doctor_name);

//         if (!doctorResult.success || doctorResult.doctors.length === 0) {
//             return { success: false, message: 'Doctor not found' };
//         }

//         const practitionerId = doctorResult.doctors[0].id;

//         // Step 3: Create appointment
//         const startDateTime = new Date(`${date}T${time}:00`);
//         const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); // 30 minutes default

//         const fhirAppointment = {
//             resourceType: 'Appointment',
//             status: 'booked',
//             description: reason,
//             start: startDateTime.toISOString(),
//             end: endDateTime.toISOString(),
//             participant: [
//                 {
//                     actor: {
//                         reference: `Patient/${patientId}`,
//                         display: `${patient_firstname} ${patient_lastname}`
//                     },
//                     required: 'required',
//                     status: 'accepted'
//                 },
//                 {
//                     actor: {
//                         reference: `Practitioner/${practitionerId}`,
//                         display: doctor_name
//                     },
//                     required: 'required',
//                     status: 'accepted'
//                 }
//             ]
//         };

//         const result = await fhirService.createAppointment(fhirAppointment);

//         if (result.success) {
//             return {
//                 success: true,
//                 message: `Appointment booked with ${doctor_name} on ${date} at ${time}`,
//                 appointmentId: result.fhirId,
//                 patientId: patientId,
//                 patientFhirId: patientId,
//                 confirmationNumber: result.fhirId,
//                 data: result.data
//             };
//         } else {
//             return {
//                 success: false,
//                 message: 'Failed to create appointment',
//                 error: result.error
//             };
//         }
//     } catch (error) {
//         console.error('Error booking appointment:', error);
//         return {
//             success: false,
//             message: 'Error booking appointment',
//             error: error.message
//         };
//     }
// };

export const bookAppointment = async ({
    booking_type,
    patient_firstname,
    patient_lastname,
    patient_phone,
    patient_dob,
    patient_age,
    relationship,
    caller_phone,  // NEW: Add caller's phone
    doctor_name,
    date,
    time,
    reason
}) => {
    try {
        // Step 1: Find or create patient (existing code)
        let patientResult = await searchPatientByPhone(patient_phone);
        let patientId;

        if (patientResult.success && patientResult.total > 0) {
            patientId = patientResult.entries[0].resource.id;
        } else {
            const newPatientResult = await createPatient({
                name: `${patient_firstname} ${patient_lastname}`,
                phone: patient_phone,
                dob: patient_dob,
                age: patient_age
            });

            if (!newPatientResult.success) {
                return { success: false, message: 'Failed to create patient' };
            }

            patientId = newPatientResult.fhirId;
        }

        // *** NEW: Step 1.5 - Create RelatedPerson link for family bookings ***
        if (booking_type === 'family' && caller_phone && relationship) {
            // Find or create caller's patient record
            let callerPatientResult = await searchPatientByPhone(caller_phone);
            let callerPatientId;

            if (callerPatientResult.success && callerPatientResult.total > 0) {
                callerPatientId = callerPatientResult.entries[0].resource.id;
            }

            // Only create RelatedPerson if we have a caller patient record
            if (callerPatientId) {
                await linkRelatedPerson(
                    patientId,           // The family member patient
                    callerPatientId,     // The caller
                    relationship,        // e.g., "mother", "father"
                    caller_phone
                );
                console.log(`Created RelatedPerson link: ${relationship} relationship between ${callerPatientId} and ${patientId}`);
            }
        }

        // Step 2-3: Find practitioner and create appointment (existing code)
        console.log(`🔍 Searching for doctor: "${doctor_name}"`);

        // Strategy 1: Try original name first
        let doctorResult = await searchDoctorByName(doctor_name);

        // Strategy 2: If not found and name doesn't have "Dr.", try adding it
        if ((!doctorResult.success || doctorResult.doctors.length === 0) &&
            !doctor_name.toLowerCase().startsWith('dr')) {

            console.log(`   ⚠️  Not found with "${doctor_name}". Trying "Dr. ${doctor_name}"...`);
            doctorResult = await searchDoctorByName(`Dr. ${doctor_name}`);
        }

        // Strategy 3: If still not found, try just the last name
        if (!doctorResult.success || doctorResult.doctors.length === 0) {
            const nameParts = doctor_name.replace(/^dr\.?\s*/i, '').trim().split(/\s+/);
            if (nameParts.length > 1) {
                const lastName = nameParts[nameParts.length - 1];
                console.log(`   ⚠️  Still not found. Trying last name: "${lastName}"`);
                doctorResult = await searchDoctorByName(lastName);
            }
        }

        // Final check: If still not found, return helpful error
        if (!doctorResult.success || doctorResult.doctors.length === 0) {
            console.log(`   ❌ Doctor not found after all attempts: "${doctor_name}"`);
            return {
                success: false,
                message: `Doctor "${doctor_name}" not found. Please check the name or try: ${['Dr. Sarah Johnson', 'Dr. Michael Chen', 'Dr. Emily Rodriguez'].join(', ')
                    }`
            };
        }

        const practitionerId = doctorResult.doctors[0].id;
        const actualDoctorName = doctorResult.doctors[0].name;
        console.log(`   ✅ Found doctor: ${actualDoctorName} (ID: ${practitionerId})`);


        const startDateTime = new Date(`${date}T${time}:00`);
        const endDateTime = new Date(startDateTime.getTime() + 30 * 60000);

        const fhirAppointment = {
            resourceType: 'Appointment',
            status: 'booked',
            description: reason,
            start: startDateTime.toISOString(),
            end: endDateTime.toISOString(),
            participant: [
                {
                    actor: {
                        reference: `Patient/${patientId}`,
                        display: `${patient_firstname} ${patient_lastname}`
                    },
                    required: 'required',
                    status: 'accepted'
                },
                {
                    actor: {
                        reference: `Practitioner/${practitionerId}`,
                        display: doctor_name
                    },
                    required: 'required',
                    status: 'accepted'
                }
            ]
        };

        const result = await fhirService.createAppointment(fhirAppointment);

        if (result.success) {
            return {
                success: true,
                message: `Appointment booked for ${patient_firstname} ${patient_lastname} with ${doctor_name} on ${date} at ${time}`,
                appointmentId: result.fhirId,
                patientId: patientId,
                patientFhirId: patientId,
                confirmationNumber: result.fhirId,
                bookedFor: booking_type === 'family' ? `${patient_firstname} (${relationship})` : 'self',
                data: result.data
            };
        } else {
            return {
                success: false,
                message: result.error || 'Failed to create appointment'
            };
        }
    } catch (error) {
        console.error('Error booking appointment:', error);
        return {
            success: false,
            message: 'Error booking appointment',
            error: error.message
        };
    }
};

/**
 * Reschedule an appointment by details
 */
export const rescheduleAppointmentByDetails = async (rescheduleData) => {
    try {
        const {
            patient_name,
            patient_phone,
            original_doctor,
            original_date,
            original_time,
            new_date,
            new_time
        } = rescheduleData;

        // Find patient
        const patientResult = await searchPatientByPhone(patient_phone);

        if (!patientResult.success || patientResult.total === 0) {
            return {
                success: false,
                message: `Patient "${patient_name}" not found. Please verify the name and phone number.`
            };
        }

        const patientId = patientResult.entries[0].resource.id;

        // Find doctor
        const doctorResult = await searchDoctorByName(original_doctor);

        if (!doctorResult.success || doctorResult.doctors.length === 0) {
            return {
                success: false,
                message: `Doctor "${original_doctor}" not found. Please verify the doctor's name.`
            };
        }

        const practitionerId = doctorResult.doctors[0].id;

        // Search for the original appointment
        const originalDateTime = new Date(`${original_date}T${original_time}:00`);

        const searchResult = await fhirService.searchAppointments({
            patient: patientId,
            practitioner: practitionerId,
            date: originalDateTime.toISOString().split('T')[0]
        });

        if (!searchResult.success || searchResult.total === 0) {
            return {
                success: false,
                message: `No appointment found for ${patient_name} with ${original_doctor} on ${original_date} at ${original_time}`
            };
        }

        // Get the appointment to reschedule
        const appointment = searchResult.entries[0].resource;
        const appointmentId = appointment.id;

        // Update appointment with new date/time
        const newStartDateTime = new Date(`${new_date}T${new_time}:00`);
        const newEndDateTime = new Date(newStartDateTime.getTime() + 30 * 60000);

        appointment.start = newStartDateTime.toISOString();
        appointment.end = newEndDateTime.toISOString();
        appointment.status = 'booked';

        const updateResult = await fhirService.updateAppointment(appointmentId, appointment);

        if (updateResult.success) {
            return {
                success: true,
                message: `Appointment rescheduled to ${new_date} at ${new_time}`,
                appointmentId: appointmentId,
                newDate: new_date,
                newTime: new_time,
                data: updateResult.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to reschedule appointment',
                error: updateResult.error
            };
        }
    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        return {
            success: false,
            message: 'Error rescheduling appointment',
            error: error.message
        };
    }
};

/**
 * Reschedule appointment by ID
 */
export const rescheduleAppointment = async (appointmentId, new_date, new_time) => {
    try {
        // Get existing appointment
        const getResult = await fhirService.getAppointment(appointmentId);

        if (!getResult.success) {
            return { success: false, message: 'Appointment not found' };
        }

        const appointment = getResult.data;

        // Update date/time
        const newStartDateTime = new Date(`${new_date}T${new_time}:00`);
        const newEndDateTime = new Date(newStartDateTime.getTime() + 30 * 60000);

        appointment.start = newStartDateTime.toISOString();
        appointment.end = newEndDateTime.toISOString();
        appointment.status = 'booked';

        const updateResult = await fhirService.updateAppointment(appointmentId, appointment);

        if (updateResult.success) {
            return {
                success: true,
                message: `Appointment rescheduled to ${new_date} at ${new_time}`,
                data: updateResult.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to reschedule appointment',
                error: updateResult.error
            };
        }
    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        return {
            success: false,
            message: 'Error rescheduling appointment',
            error: error.message
        };
    }
};

/**
 * Cancel an appointment by ID
 */
export const cancelAppointment = async (appointmentId) => {
    try {
        // Get existing appointment
        const getResult = await fhirService.getAppointment(appointmentId);

        if (!getResult.success) {
            return { success: false, message: 'Appointment not found' };
        }

        const appointment = getResult.data;
        appointment.status = 'cancelled';

        const updateResult = await fhirService.updateAppointment(appointmentId, appointment);

        if (updateResult.success) {
            return {
                success: true,
                message: 'Appointment cancelled successfully',
                data: updateResult.data
            };
        } else {
            return {
                success: false,
                message: 'Failed to cancel appointment',
                error: updateResult.error
            };
        }
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        return {
            success: false,
            message: 'Error cancelling appointment',
            error: error.message
        };
    }
};

/**
 * Cancel appointment by details
 */
export const cancelAppointmentByDetails = async (cancelData) => {
    try {
        const { patient_phone, doctor_name, date, time } = cancelData;

        // Find patient
        const patientResult = await searchPatientByPhone(patient_phone);

        if (!patientResult.success || patientResult.total === 0) {
            return {
                success: false,
                message: 'Patient not found'
            };
        }

        const patientId = patientResult.entries[0].resource.id;

        // Find doctor if provided
        let practitionerId = null;
        if (doctor_name) {
            const doctorResult = await searchDoctorByName(doctor_name);

            if (!doctorResult.success || doctorResult.doctors.length === 0) {
                return {
                    success: false,
                    message: 'Doctor not found'
                };
            }
            practitionerId = doctorResult.doctors[0].id;
        }

        // Search for the appointment
        const searchParams = { patient: patientId };

        if (practitionerId) {
            searchParams.practitioner = practitionerId;
        }

        if (date) {
            const appointmentDateTime = new Date(`${date}T${time || '00:00'}:00`);
            searchParams.date = appointmentDateTime.toISOString().split('T')[0];
        }

        const searchResult = await fhirService.searchAppointments(searchParams);

        if (!searchResult.success || searchResult.total === 0) {
            return {
                success: false,
                message: 'No matching appointment found'
            };
        }

        // Cancel the appointment
        const appointment = searchResult.entries[0].resource;
        return await cancelAppointment(appointment.id);

    } catch (error) {
        console.error('Error cancelling appointment by details:', error);
        return {
            success: false,
            message: 'Error cancelling appointment',
            error: error.message
        };
    }
};

/**
 * Get appointment by ID
 */
export const getAppointment = async (appointmentId) => {
    try {
        return await fhirService.getAppointment(appointmentId);
    } catch (error) {
        console.error('Error getting appointment:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get patient's appointments
 */
export const getPatientAppointments = async (patientId, status = null) => {
    try {
        const searchParams = { patient: patientId };
        if (status) {
            searchParams.status = status;
        }

        const result = await fhirService.searchAppointments(searchParams);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const appointments = result.entries.map(entry => {
            const appt = entry.resource;
            const doctor = appt.participant.find(p => p.actor.reference?.startsWith('Practitioner/'));

            return {
                id: appt.id,
                date: appt.start?.split('T')[0],
                time: appt.start?.split('T')[1]?.substring(0, 5),
                doctor: doctor?.actor?.display || 'Unknown',
                reason: appt.description,
                status: appt.status,
                start: appt.start,
                end: appt.end
            };
        });

        return { success: true, appointments, total: result.total };
    } catch (error) {
        console.error('Error getting patient appointments:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get doctor's appointments
 */
export const getDoctorAppointments = async (practitionerId, date = null) => {
    try {
        const searchParams = { practitioner: practitionerId };
        if (date) {
            searchParams.date = date;
        }

        const result = await fhirService.searchAppointments(searchParams);

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const appointments = result.entries.map(entry => {
            const appt = entry.resource;
            const patient = appt.participant.find(p => p.actor.reference?.startsWith('Patient/'));

            return {
                id: appt.id,
                date: appt.start?.split('T')[0],
                time: appt.start?.split('T')[1]?.substring(0, 5),
                patient: patient?.actor?.display || 'Unknown',
                reason: appt.description,
                status: appt.status,
                start: appt.start,
                end: appt.end
            };
        });

        return { success: true, appointments, total: result.total };
    } catch (error) {
        console.error('Error getting doctor appointments:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get upcoming appointments
 */
export const getUpcomingAppointments = async (patientId) => {
    try {
        const now = new Date().toISOString();

        const result = await fhirService.searchAppointments({
            patient: patientId,
            date: `ge${now.split('T')[0]}`,
            status: 'booked'
        });

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const appointments = result.entries
            .map(entry => {
                const appt = entry.resource;
                const doctor = appt.participant.find(p => p.actor.reference?.startsWith('Practitioner/'));

                return {
                    id: appt.id,
                    date: appt.start?.split('T')[0],
                    time: appt.start?.split('T')[1]?.substring(0, 5),
                    doctor: doctor?.actor?.display || 'Unknown',
                    reason: appt.description,
                    status: appt.status,
                    start: appt.start,
                    end: appt.end
                };
            })
            .filter(appt => new Date(appt.start) >= new Date())
            .sort((a, b) => new Date(a.start) - new Date(b.start));

        return { success: true, appointments, total: appointments.length };
    } catch (error) {
        console.error('Error getting upcoming appointments:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get appointments (REST API endpoint handler)
 */
export const getAppointments = async (req, res) => {
    try {
        const { patient_id, doctor_id, upcoming } = req.query;

        const searchParams = {};
        if (patient_id) searchParams.patient = patient_id;
        if (doctor_id) searchParams.actor = doctor_id;

        // Filter upcoming or past appointments
        const now = new Date().toISOString();
        if (upcoming !== "false") {
            searchParams.date = `ge${now}`;
        } else {
            searchParams.date = `lt${now}`;
        }

        const result = await fhirService.searchAppointments(searchParams);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: "Error fetching appointments",
                error: result.error
            });
        }

        const appointments = result.entries.map(entry => {
            const appt = entry.resource;
            const patientRef = appt.participant?.find(p => p.actor?.reference?.startsWith('Patient/'));
            const practitionerRef = appt.participant?.find(p => p.actor?.reference?.startsWith('Practitioner/'));

            return {
                appointmentId: appt.id,
                patient: patientRef?.actor?.reference || null,
                doctor: practitionerRef?.actor?.reference || null,
                dateTime: appt.start,
                status: appt.status,
                reason: appt.description || appt.comment,
            };
        });

        res.status(200).json({
            success: true,
            count: appointments.length,
            appointments: appointments
        });
    } catch (error) {
        console.error("Error fetching appointments:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching appointments",
            error: error.message
        });
    }
};

/**
 * Get all appointments for a caller's family members
 */
export const getFamilyAppointments = async (callerPhone) => {
    try {
        // Step 1: Find caller's patient record
        const callerResult = await searchPatientByPhone(callerPhone);

        if (!callerResult.success || callerResult.total === 0) {
            return {
                success: false,
                message: 'Caller not found',
                appointments: []
            };
        }

        const callerPatientId = callerResult.entries[0].resource.id;

        // Step 2: Get all RelatedPerson records for this caller
        const relatedResult = await getPatientRelatedPersons(callerPatientId);

        if (!relatedResult.success || relatedResult.relatedPersons.length === 0) {
            return {
                success: true,
                message: 'No family members found',
                appointments: []
            };
        }

        // Step 3: Get appointments for each family member
        const allAppointments = [];

        for (const relatedPerson of relatedResult.relatedPersons) {
            // Extract patient ID from RelatedPerson.patient.reference
            // Format is typically "Patient/123"
            const patientRef = relatedPerson.patient?.reference;
            if (!patientRef) continue;

            const familyMemberPatientId = patientRef.split('/')[1];

            // Get upcoming appointments for this family member
            const appointmentsResult = await getUpcomingAppointments(familyMemberPatientId);

            if (appointmentsResult.success && appointmentsResult.appointments.length > 0) {
                appointmentsResult.appointments.forEach(apt => {
                    allAppointments.push({
                        ...apt,
                        familyMemberName: relatedPerson.name,
                        relationship: relatedPerson.relationship
                    });
                });
            }
        }

        // Sort by date
        allAppointments.sort((a, b) => new Date(a.start) - new Date(b.start));

        return {
            success: true,
            appointments: allAppointments,
            total: allAppointments.length,
            message: `Found ${allAppointments.length} appointment${allAppointments.length !== 1 ? 's' : ''} for family members`
        };

    } catch (error) {
        console.error('Error getting family appointments:', error);
        return {
            success: false,
            message: 'Error retrieving family appointments',
            error: error.message,
            appointments: []
        };
    }
};


export default {
    loadPatientData,
    findPatientAppointments,
    bookAppointment,
    rescheduleAppointment,
    rescheduleAppointmentByDetails,
    cancelAppointment,
    cancelAppointmentByDetails,
    getAppointment,
    getPatientAppointments,
    getDoctorAppointments,
    getUpcomingAppointments,
    getAppointments,
    getFamilyAppointments
};