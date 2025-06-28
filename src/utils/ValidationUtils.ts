export class ValidationUtils {
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isNonEmptyString(value: string): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  static isPositiveNumber(value: number): boolean {
    return typeof value === "number" && value > 0;
  }

  static isValidCoordinates(lat: number, lng: number): boolean {
    return (
      this.isPositiveNumber(lat) &&
      this.isPositiveNumber(lng) &&
      lat <= 90 &&
      lat >= -90 &&
      lng <= 180 &&
      lng >= -180
    );
  }
}
