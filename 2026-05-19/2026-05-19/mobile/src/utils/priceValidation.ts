/**
 * Price Validation Utility
 * Supports decimal values like 101.50, 50.34, etc.
 * Restricts invalid formats like 50.6.7, 60.50.7_1
 */

export interface PriceValidationResult {
  isValid: boolean;
  errorMessage?: string;
  formattedValue?: string;
}

/**
 * Validates price input and returns formatted result
 * @param input - Raw input string
 * @returns Validation result with formatted value if valid
 */
export function validatePriceInput(input: string): PriceValidationResult {
  // Empty input is valid
  if (!input || input.trim() === '') {
    return { isValid: true, formattedValue: '' };
  }

  // Remove any non-digit characters except decimal point
  const cleanInput = input.replace(/[^0-9.]/g, '');
  
  // Check for multiple decimal points
  const decimalCount = (cleanInput.match(/\./g) || []).length;
  if (decimalCount > 1) {
    return { 
      isValid: false, 
      errorMessage: 'Invalid price format. Please enter a valid price like 101.50 or 50.34' 
    };
  }

  // Split into integer and decimal parts
  const parts = cleanInput.split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = parts[1] || '';

  // Validate integer part (max 6 digits for reasonable price limits)
  if (integerPart.length > 6) {
    return { 
      isValid: false, 
      errorMessage: 'Price is too high. Maximum allowed is 999999.99' 
    };
  }

  // Validate decimal part (max 2 digits for currency)
  if (decimalPart.length > 2) {
    return { 
      isValid: false, 
      errorMessage: 'Invalid price format. Maximum 2 decimal places allowed' 
    };
  }

  // Check for invalid characters in decimal part
  if (decimalPart && !/^\d+$/.test(decimalPart)) {
    return { 
      isValid: false, 
      errorMessage: 'Invalid price format. Only numbers and decimal point allowed' 
    };
  }

  // Format the price properly
  let formattedValue = cleanInput;

  // Remove leading zeros but keep at least one digit
  if (integerPart.length > 1) {
    formattedValue = integerPart.replace(/^0+/, '') + (decimalPart ? '.' + decimalPart : '');
  } else if (integerPart === '0' && decimalPart) {
    formattedValue = '0.' + decimalPart;
  } else {
    formattedValue = integerPart + (decimalPart ? '.' + decimalPart : '');
  }

  // Preserve a trailing "." the rep just typed so they can keep typing
  // the fractional digits. Previously a number like "12" + "." was
  // formatted back to "12" because the formatter rebuilt from the int
  // and decimal parts and dropped the orphan dot. That made it
  // impossible to enter prices like 12.50 — the keyboard's dot tap
  // appeared to do nothing.
  if (cleanInput.endsWith('.') && !formattedValue.endsWith('.')) {
    formattedValue = formattedValue + '.';
  }

  // Final validation - ensure it's a reasonable price
  const numericValue = parseFloat(formattedValue);
  if (isNaN(numericValue) || numericValue < 0) {
    return { 
      isValid: false, 
      errorMessage: 'Please enter a valid positive price' 
    };
  }

  if (numericValue > 999999.99) {
    return { 
      isValid: false, 
      errorMessage: 'Price is too high. Maximum allowed is 999999.99' 
    };
  }

  return { 
    isValid: true, 
    formattedValue: formattedValue 
  };
}

/**
 * Validates price input in real-time for TextInput
 * @param input - Current input value
 * @param previousValue - Previous input value
 * @returns Formatted value or previous value if invalid
 */
export function formatPriceInput(input: string, previousValue: string): string {
  const validation = validatePriceInput(input);
  
  if (validation.isValid) {
    return validation.formattedValue || input;
  }
  
  // If invalid, return previous value to maintain UI consistency
  return previousValue;
}

import { Alert } from 'react-native';

/**
 * Shows alert for invalid price input
 * @param validation - Validation result
 */
export function showPriceValidationError(validation: PriceValidationResult): void {
  if (!validation.isValid && validation.errorMessage) {
    Alert.alert('Invalid Price Entry', validation.errorMessage);
  }
}

/**
 * Common price validation patterns for different use cases
 */
export const PRICE_PATTERNS = {
  // Valid: 101.50, 50.34, 50.3, 60.50, 100, 1000.99
  VALID: /^\d{1,6}(\.\d{1,2})?$/,
  
  // Invalid: 50.6.7, 60.50.7_1, 101.50.50, abc.123
  INVALID_MULTIPLE_DECIMALS: /\..*\.|\..*_/,
  INVALID_TOO_MANY_DECIMALS: /\.\d{3,}/,
  INVALID_SPECIAL_CHARS: /[^0-9.]/,
};
