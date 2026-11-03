import { registerDecorator, type ValidationOptions } from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** "+92 300 1234567" or "03001234567" (read as Pakistani) -> "+923001234567"; null if it isn't a real number. */
export function normalisePhone(raw: string): string | null {
  const p = parsePhoneNumberFromString(String(raw ?? '').trim(), 'PK');
  return p?.isValid() ? p.number : null;
}

export function IsPhone(options?: ValidationOptions) {
  return (target: object, propertyName: string) => registerDecorator({
    name: 'isPhone', target: target.constructor, propertyName,
    options: { message: 'Please enter a valid mobile number, including the country code.', ...options },
    validator: { validate: (v: unknown) => typeof v === 'string' && normalisePhone(v) !== null },
  });
}
