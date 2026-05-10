import Location from "../models/Location.js";

/**
 * Detects the preferred language based on HTTP headers.
 * Usually defaults to 'bg' if 'bg' is present in Accept-Language, else 'en'.
 */
export const getLanguageFromHeaders = (headers) => {
  const acceptLang = headers["accept-language"] || "";
  return acceptLang.toLowerCase().includes("bg") ? "bg" : "en";
};

/**
 * Detects the preferred language based on a Business location.
 * Improved logic: finds the default location, or falls back to any location.
 * Checks for multiple country name variations.
 */
export const getLanguageFromBusiness = async (businessId) => {
  try {
    // 1. Try to find the default location first
    let location = await Location.findOne({ businessId, isDefault: true });
    
    // 2. If no default, just take any location belonging to this business
    if (!location) {
      location = await Location.findOne({ businessId });
    }

    if (location) {
      const country = (location.country || "").toLowerCase();
      // Check for common variations of Bulgaria
      if (country === "българия" || country === "bulgaria") {
        return "bg";
      }
    }
    
    // If we reach here, we assume English for international businesses
    // unless the business is clearly in Bulgaria.
    return "en";
  } catch (error) {
    console.error("Error detecting language from business:", error);
    return "bg"; // Safe fallback to Bulgarian on error
  }
};
