import fhirService from "./fhirService.js";
import { outboundCall } from "./callController.js";

export const getAppointments = async (req, res) => {
    try {
        const { patient_id, doctor_id, upcoming } = req.query;

        const searchParams = {};
        if (patient_id) searchParams.patient = patient_id;
        if (doctor_id) searchParams.actor = doctor_id;

        // Filter upcoming or past appointments
        const now = new Date().toISOString();
        if (upcoming !== "false") {
            searchParams.date = `ge${now}`; // future
        } else {
            searchParams.date = `lt${now}`; // past
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