import fhirService from "../services/fhirService.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { isEmailValid, isPasswordValid, isNameValid, isUSPhoneValid, isPhoneValid } from "../utils/validators.js";
import { convertToObjectId } from "../utils/helpers.js";

// NOTE: Authentication data (passwords, tokens, sessions) should be stored separately
// from FHIR as FHIR doesn't handle authentication. Consider using a separate auth database
// or JWT storage mechanism. This example shows FHIR integration for hospital/organization data.

export const signup = async (req, res) => {
    try {
        const { name, email, password, phonenumber, hospitalAddress, hospitalWebsite, weekdayHours, weekendHours } = req.body;

        // Backend validation
        if (!name || !email || !password || !phonenumber || !hospitalAddress || !hospitalWebsite || !weekdayHours || !weekendHours)
            return res.status(400).json({ message: "All fields are required" });

        if (!isNameValid(name))
            return res.status(400).json({ message: "Hospital name must be at least 2 letters and contain only letters and spaces" });

        if (!isEmailValid(email))
            return res.status(400).json({ message: "Invalid email address" });

        if (!isPasswordValid(password))
            return res.status(400).json({ message: "Password must be at least 8 characters, include uppercase, lowercase, number, and special character" });

        if (!isUSPhoneValid(phonenumber))
            return res.status(400).json({ message: "Please enter a valid phone number" });

        // Search for existing organization by email in FHIR
        const existingResult = await fhirService.searchOrganizations({ 
            identifier: email 
        });
        
        if (existingResult.success && existingResult.total > 0) {
            return res.status(400).json({ message: "Hospital already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create FHIR Organization resource
        const fhirOrganization = {
            resourceType: 'Organization',
            active: true,
            name: name,
            identifier: [{
                use: 'official',
                system: 'http://hospital-system/email',
                value: email
            }],
            telecom: [
                {
                    system: 'phone',
                    value: phonenumber,
                    use: 'work'
                },
                {
                    system: 'email',
                    value: email
                },
                {
                    system: 'url',
                    value: hospitalWebsite
                }
            ],
            address: [{
                use: 'work',
                text: hospitalAddress
            }],
            extension: [
                {
                    url: 'http://hospital-system/weekday-hours',
                    valueString: weekdayHours
                },
                {
                    url: 'http://hospital-system/weekend-hours',
                    valueString: weekendHours
                },
                {
                    url: 'http://hospital-system/password-hash',
                    valueString: hashedPassword
                },
                {
                    url: 'http://hospital-system/saas-id',
                    valueString: '' // Will be set after creation
                }
            ]
        };

        const createResult = await fhirService.createOrganization(fhirOrganization);

        if (!createResult.success) {
            return res.status(500).json({ 
                message: "Failed to create hospital",
                error: createResult.error 
            });
        }

        // Update with saasId = fhirId
        const hospital = createResult.data;
        hospital.extension = hospital.extension || [];
        const saasIdExt = hospital.extension.find(ext => ext.url === 'http://hospital-system/saas-id');
        if (saasIdExt) {
            saasIdExt.valueString = hospital.id;
        }
        
        await fhirService.updateOrganization(hospital.id, hospital);

        res.json({ 
            message: "Signup successful", 
            hospital: {
                id: hospital.id,
                name: hospital.name,
                email: email
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and password are required" });

        if (!isEmailValid(email))
            return res.status(400).json({ message: "Invalid email address" });

        // Search for organization by email
        const searchResult = await fhirService.searchOrganizations({ 
            identifier: email 
        });

        if (!searchResult.success || searchResult.total === 0) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const hospital = searchResult.entries[0].resource;
        
        // Get password hash from extensions
        const passwordExt = hospital.extension?.find(ext => 
            ext.url === 'http://hospital-system/password-hash'
        );
        
        if (!passwordExt) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, passwordExt.valueString);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid credentials" });

        const token = jwt.sign({ id: hospital.id }, process.env.JWT_SECRET, { expiresIn: "2d" });

        res.json({ 
            token, 
            hospital: {
                id: hospital.id,
                name: hospital.name,
                email: email
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

export const logout = async (req, res) => {
    try {
        const auth = req.hospital;

        const getResult = await fhirService.getOrganization(auth.id || auth._id);

        if (!getResult.success) {
            return res.status(400).json({
                status: false,
                message: "Invalid or expired token",
            });
        }

        const hospital = getResult.data;

        // Add logout timestamp to extensions
        if (!hospital.extension) {
            hospital.extension = [];
        }

        const logoutExtIndex = hospital.extension.findIndex(ext => 
            ext.url === 'http://hospital-system/logout-at'
        );

        const logoutExt = {
            url: 'http://hospital-system/logout-at',
            valueDateTime: new Date().toISOString()
        };

        if (logoutExtIndex >= 0) {
            hospital.extension[logoutExtIndex] = logoutExt;
        } else {
            hospital.extension.push(logoutExt);
        }

        await fhirService.updateOrganization(hospital.id, hospital);

        return res.json({
            status: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({
            status: false,
            message: "Something went wrong",
        });
    }
};