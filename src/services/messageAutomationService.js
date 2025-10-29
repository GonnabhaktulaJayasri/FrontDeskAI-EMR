import cron from 'node-cron';
import fhirService from './fhirService.js';
import messageService from './messageService.js';
import callService from './callService.js';
import fhirSearchService from './fhirSearchService.js';
import 'dotenv/config';

/**
 * Message Automation Service - EMR/FHIR First Approach (FIXED)
 * Always fetches latest patient data from EMR before sending communications
 */
class MessageAutomationService {
    constructor() {
        this.isRunning = false;
        this.cronJobs = new Map();
        this.maxRetries = parseInt(process.env.REMINDER_MAX_RETRIES) || 3;
        this.retryIntervalMinutes = parseInt(process.env.REMINDER_RETRY_INTERVAL) || 30;
    }

    start() {
        if (this.isRunning) {
            console.log('Automated communication service is already running');
            return;
        }

        console.log('Starting automation service (EMR-first approach)...');

        // Check for reminders every 10 minutes
        const reminderInterval = process.env.REMINDER_CHECK_INTERVAL || '*/10 * * * *';
        this.cronJobs.set('reminders', cron.schedule(reminderInterval, async () => {
            await this.checkAndSendReminders();
        }, { scheduled: true, timezone: process.env.TIMEZONE || "America/New_York" }));

        // Check for follow-ups every 15 minutes
        const followUpInterval = process.env.FOLLOWUP_CHECK_INTERVAL || '*/15 * * * *';
        this.cronJobs.set('followups', cron.schedule(followUpInterval, async () => {
            await this.checkAndSendFollowUps();
        }, { scheduled: true, timezone: process.env.TIMEZONE || "America/New_York" }));

        // Monitor message conversations and handle escalations
        const monitoringInterval = '*/5 * * * *';
        this.cronJobs.set('monitoring', cron.schedule(monitoringInterval, async () => {
            await this.monitorConversations();
        }, { scheduled: true, timezone: process.env.TIMEZONE || "America/New_York" }));

        // Retry failed communications
        const retryInterval = '*/30 * * * *';
        this.cronJobs.set('retry', cron.schedule(retryInterval, async () => {
            await this.retryFailedCommunications();
        }, { scheduled: true, timezone: process.env.TIMEZONE || "America/New_York" }));

        this.isRunning = true;
    }

    stop() {
        if (!this.isRunning) return;

        console.log('Stopping communication service...');

        for (const [name, job] of this.cronJobs.entries()) {
            job.destroy();
        }

        this.cronJobs.clear();
        this.isRunning = false;
        console.log('Communication service stopped');
    }

    /**
     * Check and send appointment reminders
     * ✅ Always fetches fresh patient data from EMR
     */
    async checkAndSendReminders() {
        try {
            console.log('Checking for appointment reminders...');

            const now = new Date();
            const oneDayFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));
            const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));

            // Process 24-hour reminders
            await this.processReminders(now, oneDayFromNow, '24_hour');

            // Process 1-hour reminders  
            await this.processReminders(now, oneHourFromNow, '1_hour');

            console.log('Reminder check completed');
        } catch (error) {
            console.error('Error in reminder check:', error);
        }
    }

    /**
     * Process reminders with EMR data refresh
     * FIXED: Proper FHIR date range handling
     */
    async processReminders(startTime, endTime, reminderType) {
        try {
            // FIXED: Use only 'ge' (greater than or equal) for FHIR date search
            // Then filter in-memory for the upper bound
            // This avoids the HAPI-1882 error with multiple date parameters
            const searchParams = {
                date: `ge${startTime.toISOString().split('T')[0]}`,
                status: 'booked,pending,arrived',
                _count: 100
            };

            console.log(`Searching appointments with params:`, searchParams);

            const appointmentResult = await fhirService.searchAppointments(searchParams);

            if (!appointmentResult.success) {
                console.error(`Error searching appointments:`, appointmentResult.error);
                console.log(`No appointments found for ${reminderType} reminders`);
                return;
            }

            if (appointmentResult.total === 0) {
                console.log(`No appointments found for ${reminderType} reminders`);
                return;
            }

            // Filter appointments to only include those within our time range
            const appointments = appointmentResult.entries
                .map(entry => entry.resource)
                .filter(apt => {
                    if (!apt.start) return false;
                    const apptDate = new Date(apt.start);
                    const isInRange = apptDate >= startTime && apptDate <= endTime;
                    return isInRange;
                });
            
            if (appointments.length === 0) {
                console.log(`No appointments found for ${reminderType} reminders`);
                return;
            }

            console.log(`Found ${appointments.length} appointments for ${reminderType} reminders`);

            for (const appointment of appointments) {
                try {
                    // Get reminder settings from appointment extensions
                    const reminderExt = appointment.extension?.find(ext => 
                        ext.url === `http://hospital-system/reminder-${reminderType}`
                    );

                    if (!reminderExt) {
                        continue;
                    }

                    const reminderSettings = JSON.parse(reminderExt.valueString || '{}');
                    
                    if (!reminderSettings.enabled || 
                        reminderSettings.status !== 'not_sent' || 
                        (reminderSettings.attemptCount || 0) >= this.maxRetries) {
                        continue;
                    }

                    // Get patient reference
                    const patientRef = appointment.participant?.find(p => 
                        p.actor?.reference?.startsWith('Patient/')
                    )?.actor?.reference;

                    if (!patientRef) {
                        console.log(`Appointment ${appointment.id} has no patient`);
                        continue;
                    }

                    const patientId = patientRef.replace('Patient/', '');

                    // ✅ STEP 1: Get fresh patient data from EMR/FHIR
                    console.log(`📡 Fetching patient from EMR for appointment ${appointment.id}`);

                    const patientResult = await fhirService.getPatient(patientId);
                    if (!patientResult.success) {
                        console.log(`❌ Could not fetch patient from EMR for appointment ${appointment.id}`);
                        continue;
                    }

                    const emrPatient = patientResult.data;
                    const patientPhone = emrPatient.telecom?.find(t => t.system === 'phone')?.value;

                    if (!patientPhone) {
                        console.log(`Skipping appointment ${appointment.id} - no patient phone in EMR`);
                        continue;
                    }

                    console.log(`✅ Using EMR data for patient ${emrPatient.id} (source: FHIR)`);

                    // ✅ STEP 2: Determine communication method using EMR patient preferences
                    const method = this.determineReminderMethod(appointment, reminderType, emrPatient);

                    console.log(`Processing ${reminderType} reminder for appointment ${appointment.id} via ${method}`);

                    // ✅ STEP 3: Send communication using EMR patient data
                    if (method === 'call') {
                        await this.triggerReminderCall(appointment, reminderType, emrPatient);
                    } else {
                        await this.triggerReminderMessage(appointment, reminderType, method, emrPatient);
                    }

                    // Brief delay to prevent overwhelming Twilio
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`Error processing reminder for appointment ${appointment.id}:`, error);
                    continue;
                }
            }
        } catch (error) {
            console.error(`Error processing ${reminderType} reminders:`, error);
        }
    }

    /**
     * Determine reminder method using EMR patient data
     */
    determineReminderMethod(appointment, reminderType, emrPatient) {
        // Get reminder settings from appointment extensions
        const reminderExt = appointment.extension?.find(ext => 
            ext.url === `http://hospital-system/reminder-${reminderType}`
        );
        
        const reminderSettings = reminderExt ? JSON.parse(reminderExt.valueString || '{}') : {};

        // Priority order: appointment setting > patient preference > default (sms)
        if (reminderSettings.method) {
            return reminderSettings.method;
        }

        // Check EMR patient communication preferences from extension
        const commPrefExt = emrPatient.extension?.find(ext => 
            ext.url === 'http://hospital.com/fhir/StructureDefinition/communication-preferences'
        );

        if (commPrefExt?.valueCodeableConcept?.coding?.[0]?.code) {
            return commPrefExt.valueCodeableConcept.coding[0].code;
        }

        // Default to SMS
        return 'sms';
    }

    /**
     * Trigger reminder message using EMR patient data
     */
    async triggerReminderMessage(appointment, reminderType, method, emrPatient) {
        try {
            const patientPhone = emrPatient.telecom?.find(t => t.system === 'phone')?.value;
            
            // Get organization reference
            const orgRef = appointment.participant?.find(p => 
                p.actor?.reference?.startsWith('Organization/')
            )?.actor?.reference;

            const orgId = orgRef ? orgRef.replace('Organization/', '') : null;

            if (!orgId) {
                console.log(`Appointment ${appointment.id} has no organization`);
                return;
            }

            const result = await messageService.startMessageConversation(
                appointment.id,
                reminderType,
                method,
                orgId
            );

            // Update reminder status in appointment extension
            if (result.success) {
                await this.updateReminderStatus(appointment.id, reminderType, 'sent', result.messageSid);
            } else {
                await this.updateReminderStatus(appointment.id, reminderType, 'failed');
            }

            return result;

        } catch (error) {
            console.error('Error triggering reminder message:', error);
            await this.updateReminderStatus(appointment.id, reminderType, 'failed');
            throw error;
        }
    }

    /**
     * Trigger reminder call using EMR patient data
     */
    async triggerReminderCall(appointment, reminderType, emrPatient) {
        try {
            const patientPhone = emrPatient.telecom?.find(t => t.system === 'phone')?.value;

            // Get organization reference
            const orgRef = appointment.participant?.find(p => 
                p.actor?.reference?.startsWith('Organization/')
            )?.actor?.reference;

            const orgId = orgRef ? orgRef.replace('Organization/', '') : null;

            const result = await callService.makeOutboundCall({
                phoneNumber: patientPhone,
                patientId: emrPatient.id,
                hospitalId: orgId,
                appointmentId: appointment.id,
                callType: 'appointment_reminder',
                priority: reminderType === '1_hour' ? 'high' : 'normal',
                reason: `${reminderType} appointment reminder`
            });

            // Update reminder status
            if (result.success) {
                await this.updateReminderStatus(appointment.id, reminderType, 'sent', result.call?.sid);
            } else {
                await this.updateReminderStatus(appointment.id, reminderType, 'failed');
            }

            return result;

        } catch (error) {
            console.error('Error triggering reminder call:', error);
            await this.updateReminderStatus(appointment.id, reminderType, 'failed');
            throw error;
        }
    }

    /**
     * Update reminder status in appointment extension
     */
    async updateReminderStatus(appointmentId, reminderType, status, communicationId = null) {
        try {
            const apptResult = await fhirService.getAppointment(appointmentId);
            if (!apptResult.success) return;

            const appointment = apptResult.data;
            appointment.extension = appointment.extension || [];

            // Find or create reminder extension
            let reminderExt = appointment.extension.find(ext => 
                ext.url === `http://hospital-system/reminder-${reminderType}`
            );

            if (!reminderExt) {
                reminderExt = {
                    url: `http://hospital-system/reminder-${reminderType}`,
                    valueString: '{}'
                };
                appointment.extension.push(reminderExt);
            }

            const reminderSettings = JSON.parse(reminderExt.valueString || '{}');
            reminderSettings.status = status;
            reminderSettings.lastAttemptAt = new Date().toISOString();
            reminderSettings.attemptCount = (reminderSettings.attemptCount || 0) + 1;
            
            if (communicationId) {
                reminderSettings.communicationId = communicationId;
            }

            reminderExt.valueString = JSON.stringify(reminderSettings);

            await fhirService.updateAppointment(appointmentId, appointment);
            console.log(`Updated reminder status for appointment ${appointmentId}: ${status}`);

        } catch (error) {
            console.error('Error updating reminder status:', error);
        }
    }

    /**
     * Check and send follow-ups
     * FIXED: Proper FHIR date range handling
     */
    async checkAndSendFollowUps() {
        try {
            console.log('Checking for follow-ups...');

            const now = new Date();
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

            // FIXED: Use only 'le' (less than or equal) for FHIR date search
            const searchParams = {
                date: `le${now.toISOString().split('T')[0]}`,
                status: 'fulfilled,arrived',
                _count: 100
            };

            console.log(`Searching follow-ups with params:`, searchParams);

            const appointmentResult = await fhirService.searchAppointments(searchParams);

            if (!appointmentResult.success) {
                console.error(`Error searching appointments:`, appointmentResult.error);
                console.log(`No appointments found for follow-ups`);
                return;
            }

            if (appointmentResult.total === 0) {
                console.log('No appointments found for follow-ups');
                return;
            }

            // Filter appointments completed in the last 24 hours
            const appointments = appointmentResult.entries
                .map(entry => entry.resource)
                .filter(apt => {
                    if (!apt.start) return false;
                    const apptDate = new Date(apt.start);
                    return apptDate >= yesterday && apptDate <= now;
                });

            if (appointments.length === 0) {
                console.log('No appointments found for follow-ups');
                return;
            }

            console.log(`Found ${appointments.length} appointments for follow-ups`);

            for (const appointment of appointments) {
                try {
                    // Check if follow-up already sent
                    const followUpExt = appointment.extension?.find(ext => 
                        ext.url === 'http://hospital-system/follow-up'
                    );

                    if (followUpExt) {
                        const followUpSettings = JSON.parse(followUpExt.valueString || '{}');
                        if (followUpSettings.status === 'sent') {
                            continue; // Skip if already sent
                        }
                    }

                    // Get patient
                    const patientRef = appointment.participant?.find(p => 
                        p.actor?.reference?.startsWith('Patient/')
                    )?.actor?.reference;

                    if (!patientRef) continue;

                    const patientId = patientRef.replace('Patient/', '');
                    const patientResult = await fhirService.getPatient(patientId);
                    if (!patientResult.success) continue;

                    const emrPatient = patientResult.data;
                    const patientPhone = emrPatient.telecom?.find(t => t.system === 'phone')?.value;

                    if (!patientPhone) continue;

                    // Get organization
                    const orgRef = appointment.participant?.find(p => 
                        p.actor?.reference?.startsWith('Organization/')
                    )?.actor?.reference;

                    const orgId = orgRef ? orgRef.replace('Organization/', '') : null;
                    if (!orgId) continue;

                    console.log(`Processing follow-up for appointment ${appointment.id}`);

                    const method = this.determineReminderMethod(appointment, 'follow_up', emrPatient);

                    const result = await messageService.startMessageConversation(
                        appointment.id,
                        'follow_up',
                        method,
                        orgId
                    );

                    if (result.success) {
                        await this.updateFollowUpStatus(appointment.id, 'sent', result.messageSid);
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`Error processing follow-up for appointment ${appointment.id}:`, error);
                }
            }

            console.log('Follow-up check completed');

        } catch (error) {
            console.error('Error in follow-up check:', error);
        }
    }

    /**
     * Update follow-up status
     */
    async updateFollowUpStatus(appointmentId, status, communicationId = null) {
        try {
            const apptResult = await fhirService.getAppointment(appointmentId);
            if (!apptResult.success) return;

            const appointment = apptResult.data;
            appointment.extension = appointment.extension || [];

            let followUpExt = appointment.extension.find(ext => 
                ext.url === 'http://hospital-system/follow-up'
            );

            if (!followUpExt) {
                followUpExt = {
                    url: 'http://hospital-system/follow-up',
                    valueString: '{}'
                };
                appointment.extension.push(followUpExt);
            }

            const followUpSettings = JSON.parse(followUpExt.valueString || '{}');
            followUpSettings.status = status;
            followUpSettings.sentAt = new Date().toISOString();
            
            if (communicationId) {
                followUpSettings.communicationId = communicationId;
            }

            followUpExt.valueString = JSON.stringify(followUpSettings);

            await fhirService.updateAppointment(appointmentId, appointment);

        } catch (error) {
            console.error('Error updating follow-up status:', error);
        }
    }

    /**
     * Monitor message conversations
     */
    async monitorConversations() {
        console.log('Monitoring conversations...');
        // Implementation for monitoring active conversations
        // This would check for unanswered messages, escalations, etc.
    }

    /**
     * Retry failed communications
     * FIXED: Proper FHIR date range handling
     */
    async retryFailedCommunications() {
        try {
            console.log('Retrying failed communications...');

            const now = new Date();
            const retryWindow = new Date(now.getTime() - (this.retryIntervalMinutes * 60 * 1000));

            // FIXED: Use only 'ge' for FHIR date search
            const searchParams = {
                date: `ge${retryWindow.toISOString().split('T')[0]}`,
                _count: 50
            };

            const appointmentResult = await fhirService.searchAppointments(searchParams);

            if (!appointmentResult.success || appointmentResult.total === 0) {
                console.log('Found 0 appointments with failed communications');
                return;
            }

            // Filter for appointments with failed communications
            const failedAppointments = appointmentResult.entries
                .map(entry => entry.resource)
                .filter(apt => {
                    const hasFailedReminder = apt.extension?.some(ext => {
                        if (!ext.url?.includes('reminder-')) return false;
                        const settings = JSON.parse(ext.valueString || '{}');
                        return settings.status === 'failed' && 
                               (settings.attemptCount || 0) < this.maxRetries;
                    });
                    return hasFailedReminder;
                });

            console.log(`Found ${failedAppointments.length} appointments with failed communications`);

            for (const appointment of failedAppointments) {
                // Retry logic here
                console.log(`Retrying communication for appointment ${appointment.id}`);
            }

        } catch (error) {
            console.error('Error retrying failed communications:', error);
        }
    }
}

const automationService = new MessageAutomationService();
export default automationService;