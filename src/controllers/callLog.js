import fhirService from "./fhirService.js";

// NOTE: This implementation requires Communication resource support in fhirService
// Add the following methods to fhirService.js:
// - createCommunication(fhirCommunication)
// - searchCommunications(searchParams)

export const getCallLogs = async (req, res) => {
    try {
        const { patient_id, fromDate, toDate, actionTaken, page = 1, limit = 10 } = req.query;

        const searchParams = {};
        
        // Patient filter
        if (patient_id) {
            searchParams.subject = `Patient/${patient_id}`;
        }

        // Date range filter
        if (fromDate) {
            searchParams['sent'] = `ge${new Date(fromDate).toISOString()}`;
        }
        if (toDate) {
            searchParams['sent'] = searchParams['sent'] 
                ? `${searchParams['sent']}&le${new Date(toDate).toISOString()}`
                : `le${new Date(toDate).toISOString()}`;
        }

        // Category filter for action taken (stored in category)
        if (actionTaken) {
            searchParams.category = actionTaken;
        }

        // Pagination
        searchParams._count = limit;
        searchParams._offset = (parseInt(page) - 1) * parseInt(limit);

        // Search for Communication resources (representing call logs)
        const result = await fhirService.searchCommunications(searchParams);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: "Error fetching call logs",
                error: result.error
            });
        }

        const callLogs = result.entries.map(entry => {
            const comm = entry.resource;
            const patientRef = comm.subject?.reference;
            
            return {
                id: comm.id,
                patient: patientRef,
                callSid: comm.identifier?.[0]?.value,
                from: comm.sender?.reference,
                to: comm.recipient?.[0]?.reference,
                type: comm.medium?.[0]?.coding?.[0]?.code,
                startTime: comm.sent,
                endTime: comm.received,
                duration: this.calculateDuration(comm.sent, comm.received),
                transcript: comm.payload?.[0]?.contentString,
                actionTaken: comm.category?.[0]?.coding?.[0]?.code,
                entities: comm.note?.map(note => note.text),
                intent: comm.reasonCode?.[0]?.text,
                createdAt: comm.meta?.lastUpdated,
                updatedAt: comm.meta?.lastUpdated,
            };
        });

        res.status(200).json({
            success: true,
            totalCount: result.total,
            page: parseInt(page),
            totalPages: Math.ceil(result.total / parseInt(limit)),
            callLogs: callLogs,
        });
    } catch (error) {
        console.error("Error fetching call logs:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching call logs",
            error: error.message
        });
    }
};

function calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.floor((end - start) / 1000); // duration in seconds
}