import jwt from "jsonwebtoken";
import fhirService from "../services/fhirService.js";

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get organization from FHIR
    const result = await fhirService.getOrganization(decoded.id);
    
    if (!result.success) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const hospital = result.data;
    
    // Remove password from response
    if (hospital.extension) {
      hospital.extension = hospital.extension.filter(ext => 
        ext.url !== 'http://hospital-system/password-hash'
      );
    }

    req.hospital = hospital;
    
    next();
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    res.status(401).json({ message: "Invalid token" });
  }
};

export default authMiddleware;