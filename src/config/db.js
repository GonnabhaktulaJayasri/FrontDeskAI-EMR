import 'dotenv/config';
import fhirService from '../services/fhirService.js';

/**
 * Database initialization - No MongoDB, only FHIR/EMR
 */
const initializeEMR = async () => {
    try {
        // Test FHIR connection by searching for a test resource
        const testResult = await fhirService.searchPatients({ _count: 1 });
        
        if (testResult.success) {
            console.log('FHIR/EMR connection established successfully');
            return true;
        } else {
            console.error('FHIR/EMR connection test failed:', testResult.error);
            return false;
        }
    } catch (error) {
        console.error('Error initializing FHIR/EMR:', error.message);
        return false;
    }
};

/**
 * Legacy connectDB function for backward compatibility
 * Now connects to FHIR instead of MongoDB
 */
const connectDB = async () => {
    return await initializeEMR();
};

export default connectDB;
export { initializeEMR };