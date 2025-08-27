const axios = require('axios');

/**
 * Process License Plate Recognition
 */
const processLPR = async (imageUrl) => {
  try {
    // Mock LPR service - replace with actual service
    const mockLPR = process.env.NODE_ENV === 'development';
    
    if (mockLPR) {
      return mockLPRProcessing(imageUrl);
    }

    // Real LPR API integration
    const lprApiUrl = process.env.LPR_API_URL;
    const lprApiKey = process.env.LPR_API_KEY;

    if (!lprApiUrl) {
      throw new Error('LPR API URL not configured');
    }

    const response = await axios.post(lprApiUrl, {
      image_url: imageUrl,
      regions: ['in'], // India
      camera_id: 'default'
    }, {
      headers: {
        'Authorization': `Token ${lprApiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    if (!response.data.success) {
      throw new Error('LPR processing failed');
    }

    const results = response.data.results;
    if (!results || results.length === 0) {
      return {
        success: false,
        error: 'No license plate detected',
        data: null
      };
    }

    const bestResult = results[0];
    const alternateReadings = results.slice(1).map(r => ({
      text: r.plate.toUpperCase(),
      confidence: r.confidence
    }));

    return {
      success: true,
      data: {
        licensePlate: bestResult.plate.toUpperCase(),
        confidence: bestResult.confidence,
        alternateReadings,
        processingTime: response.data.processing_time,
        region: bestResult.region?.code || 'IN',
        boundingBox: bestResult.box,
        vehicleType: bestResult.vehicle?.type || 'unknown'
      }
    };

  } catch (error) {
    console.error('LPR processing error:', error);
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        error: 'LPR service unavailable',
        data: null
      };
    }

    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'LPR service rate limit exceeded',
        data: null
      };
    }

    return {
      success: false,
      error: error.message || 'LPR processing failed',
      data: null
    };
  }
};

/**
 * Mock LPR processing for development
 */
const mockLPRProcessing = (imageUrl) => {
  // Generate mock license plate numbers
  const mockPlates = [
    'KA01AB1234',
    'MH02CD5678',
    'DL03EF9012',
    'TN04GH3456',
    'AP05IJ7890',
    'KL06KL1234',
    'WB07MN5678'
  ];

  const randomPlate = mockPlates[Math.floor(Math.random() * mockPlates.length)];
  const confidence = Math.random() * 0.3 + 0.7; // 0.7 to 1.0

  // Generate alternate readings
  const alternateReadings = [];
  for (let i = 0; i < Math.floor(Math.random() * 3); i++) {
    const alternatePlate = generateAlternatePlate(randomPlate);
    alternateReadings.push({
      text: alternatePlate,
      confidence: Math.random() * 0.4 + 0.3 // 0.3 to 0.7
    });
  }

  return {
    success: true,
    data: {
      licensePlate: randomPlate,
      confidence: parseFloat(confidence.toFixed(3)),
      alternateReadings,
      processingTime: Math.random() * 2000 + 500, // 500-2500ms
      region: 'IN',
      boundingBox: {
        x: Math.floor(Math.random() * 100) + 50,
        y: Math.floor(Math.random() * 100) + 50,
        width: Math.floor(Math.random() * 200) + 150,
        height: Math.floor(Math.random() * 50) + 50
      },
      vehicleType: ['car', 'suv', 'motorcycle', 'truck'][Math.floor(Math.random() * 4)]
    }
  };
};

/**
 * Generate alternate plate reading (simulate OCR errors)
 */
const generateAlternatePlate = (originalPlate) => {
  const confusableChars = {
    '0': ['O', 'D'],
    'O': ['0', 'Q'],
    '1': ['I', 'L'],
    'I': ['1', 'L'],
    'L': ['1', 'I'],
    '8': ['B'],
    'B': ['8'],
    '5': ['S'],
    'S': ['5'],
    'G': ['6'],
    '6': ['G']
  };

  let alternatePlate = originalPlate;
  const numChanges = Math.floor(Math.random() * 2) + 1; // 1-2 changes

  for (let i = 0; i < numChanges; i++) {
    const randomIndex = Math.floor(Math.random() * alternatePlate.length);
    const originalChar = alternatePlate[randomIndex];
    
    if (confusableChars[originalChar]) {
      const alternatives = confusableChars[originalChar];
      const newChar = alternatives[Math.floor(Math.random() * alternatives.length)];
      alternatePlate = alternatePlate.substring(0, randomIndex) + 
                     newChar + 
                     alternatePlate.substring(randomIndex + 1);
    }
  }

  return alternatePlate;
};

/**
 * Batch process multiple images
 */
const batchProcessLPR = async (imageUrls) => {
  const results = [];
  const maxConcurrent = 5; // Process max 5 images concurrently

  for (let i = 0; i < imageUrls.length; i += maxConcurrent) {
    const batch = imageUrls.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(async (imageUrl, index) => {
      try {
        const result = await processLPR(imageUrl);
        return {
          index: i + index,
          imageUrl,
          ...result
        };
      } catch (error) {
        return {
          index: i + index,
          imageUrl,
          success: false,
          error: error.message,
          data: null
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
};

/**
 * Validate license plate format
 */
const validateLicensePlate = (licensePlate, country = 'IN') => {
  const formats = {
    'IN': {
      // Indian license plate formats
      patterns: [
        /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/, // Standard: XX##XX####
        /^[A-Z]{2}\d{2}[A-Z]{3}\d{4}$/, // New format: XX##XXX####
      ],
      description: 'Indian license plate (XX##XX#### or XX##XXX####)'
    },
    'US': {
      patterns: [
        /^[A-Z0-9]{2,8}$/ // US varies by state
      ],
      description: 'US license plate format'
    }
  };

  const countryFormats = formats[country.toUpperCase()];
  if (!countryFormats) {
    return { valid: false, error: 'Unsupported country format' };
  }

  const normalizedPlate = licensePlate.toUpperCase().replace(/\s+/g, '');
  const isValid = countryFormats.patterns.some(pattern => 
    pattern.test(normalizedPlate)
  );

  return {
    valid: isValid,
    normalized: normalizedPlate,
    format: countryFormats.description,
    ...(isValid ? {} : { error: `Invalid format. Expected: ${countryFormats.description}` })
  };
};

/**
 * Get similar license plates (fuzzy matching)
 */
const findSimilarPlates = (targetPlate, candidatePlates, threshold = 0.8) => {
  const similarities = candidatePlates.map(candidate => ({
    plate: candidate,
    similarity: calculateStringSimilarity(targetPlate, candidate.licensePlate || candidate)
  }));

  return similarities
    .filter(s => s.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
};

/**
 * Calculate string similarity (Jaro-Winkler distance)
 */
const calculateStringSimilarity = (s1, s2) => {
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0 || len2 === 0) return 0.0;
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  if (matchWindow < 0) return 0.0;
  
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / len1 + matches / len2 + 
                (matches - transpositions / 2) / matches) / 3;
  
  // Calculate common prefix length (up to 4 characters)
  let prefix = 0;
  for (let i = 0; i < Math.min(len1, len2, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  
  return jaro + 0.1 * prefix * (1 - jaro);
};

/**
 * Clean and normalize license plate text
 */
const normalizeLicensePlate = (rawText) => {
  if (!rawText) return null;
  
  // Remove common OCR artifacts and normalize
  let cleaned = rawText
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Remove non-alphanumeric
    .replace(/O/g, '0') // Common confusion: O -> 0
    .replace(/I/g, '1'); // Common confusion: I -> 1
  
  // Apply common corrections based on position
  // First two characters are usually letters in Indian plates
  if (cleaned.length >= 2) {
    cleaned = cleaned.substring(0, 2).replace(/[0-9]/g, match => {
      const letterMap = { '0': 'O', '1': 'I', '5': 'S', '8': 'B' };
      return letterMap[match] || match;
    }) + cleaned.substring(2);
  }
  
  return cleaned;
};

module.exports = {
  processLPR,
  batchProcessLPR,
  validateLicensePlate,
  findSimilarPlates,
  calculateStringSimilarity,
  normalizeLicensePlate
};