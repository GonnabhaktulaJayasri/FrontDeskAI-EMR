import twilio from 'twilio';
import fhirService from './fhirService.js';

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH;

if (!accountSid || !authToken) {
    console.error('TWILIO_SID and TWILIO_AUTH must be set in environment variables');
}

const client = twilio(accountSid, authToken);

export const provisionPhoneNumber = async (hospitalName) => {
    try {
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured');
        }

        // Search for numbers with Voice, SMS, AND MMS capabilities
        const availableNumbers = await client.availablePhoneNumbers('US')
            .local
            .list({
                smsEnabled: true,
                mmsEnabled: true,
                voiceEnabled: true,
                faxEnabled: true,
                limit: 5
            });

        if (availableNumbers.length === 0) {
            console.log('No numbers with all capabilities, trying without fax...');
            const fallbackNumbers = await client.availablePhoneNumbers('US')
                .local
                .list({
                    smsEnabled: true,
                    mmsEnabled: true,
                    voiceEnabled: true,
                    limit: 5
                });

            if (fallbackNumbers.length === 0) {
                throw new Error('No available phone numbers');
            }

            console.warn('Found numbers without fax capability');
            availableNumbers.push(...fallbackNumbers);
        }

        // Purchase the number with Voice webhook only
        const purchasedNumber = await client.incomingPhoneNumbers
            .create({
                phoneNumber: availableNumbers[0].phoneNumber,
                friendlyName: `Hospital - ${hospitalName}`,
                voiceUrl: `${process.env.BASE_URL}/api/calls/inbound`,
                voiceMethod: 'POST',
                statusCallback: `${process.env.BASE_URL}/api/calls/status`,
                statusCallbackMethod: 'POST',
            });

        // Add number to Messaging Service for Conversations
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

        if (messagingServiceSid) {
            try {
                await client.messaging.v1
                    .services(messagingServiceSid)
                    .phoneNumbers
                    .create({ phoneNumberSid: purchasedNumber.sid });
            } catch (msgError) {
                console.log('Number can still receive calls, but messages need manual configuration');
            }
        } else {
            console.warn('TWILIO_MESSAGING_SERVICE_SID not set - messages need manual configuration');
        }

        return {
            phoneNumber: purchasedNumber.phoneNumber,
            sid: purchasedNumber.sid
        };

    } catch (error) {
        console.error('Twilio provisioning error:', error);
        throw new Error(`Failed to provision phone number: ${error.message}`);
    }
};

export const releasePhoneNumber = async (phoneSid) => {
    try {
        if (!accountSid || !authToken) {
            throw new Error('Twilio credentials not configured');
        }

        await client.incomingPhoneNumbers(phoneSid).remove();
        console.log(`Released Twilio number: ${phoneSid}`);
        return true;
    } catch (error) {
        console.error('Error releasing phone number:', error);
        throw error;
    }
};

export const checkTwilioNumberAvailability = async (phoneNumber) => {
    try {
        // Search for organization with this phone number in FHIR
        const searchResult = await fhirService.searchOrganizations({
            telecom: phoneNumber
        });
        
        return !searchResult.success || searchResult.total === 0;
    } catch (error) {
        console.error('Error checking Twilio number availability:', error);
        return false;
    }
};