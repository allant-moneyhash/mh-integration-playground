// Sample billing/shipping details per country, so changing the country fills a
// consistent address and phone number, and per-country phone validation (Google's
// libphonenumber metadata) so a bad number is caught before MoneyHash sees it.
import {
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/mobile/examples';
import { countryByCode } from './countries';

type Address = {
  address: string;
  city: string;
  state: string;
  postal_code: string;
};

/** Realistic test addresses per market. */
const SAMPLES: Record<string, Address> = {
  AE: {
    address: 'Sheikh Zayed Road',
    city: 'Dubai',
    state: 'Dubai',
    postal_code: '00000',
  },
  SA: {
    address: 'King Fahd Road',
    city: 'Riyadh',
    state: 'Riyadh',
    postal_code: '12271',
  },
  EG: {
    address: '26 July Street',
    city: 'Cairo',
    state: 'Cairo',
    postal_code: '11511',
  },
  KW: {
    address: 'Gulf Road',
    city: 'Kuwait City',
    state: 'Al Asimah',
    postal_code: '13001',
  },
  QA: {
    address: 'Corniche Street',
    city: 'Doha',
    state: 'Doha',
    postal_code: '00000',
  },
  BH: {
    address: 'Road 1702',
    city: 'Manama',
    state: 'Capital',
    postal_code: '317',
  },
  OM: {
    address: 'Sultan Qaboos Street',
    city: 'Muscat',
    state: 'Muscat',
    postal_code: '100',
  },
  JO: {
    address: 'Zahran Street',
    city: 'Amman',
    state: 'Amman',
    postal_code: '11181',
  },
  LB: {
    address: 'Hamra Street',
    city: 'Beirut',
    state: 'Beirut',
    postal_code: '1103',
  },
  MA: {
    address: 'Boulevard Mohammed V',
    city: 'Casablanca',
    state: 'Casablanca-Settat',
    postal_code: '20000',
  },
  TR: {
    address: 'Istiklal Caddesi',
    city: 'Istanbul',
    state: 'Istanbul',
    postal_code: '34430',
  },
  PK: {
    address: 'Shahrah-e-Faisal',
    city: 'Karachi',
    state: 'Sindh',
    postal_code: '75350',
  },
  IN: {
    address: 'MG Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
  },
  ZA: {
    address: 'Long Street',
    city: 'Cape Town',
    state: 'Western Cape',
    postal_code: '8001',
  },
  NG: {
    address: 'Broad Street',
    city: 'Lagos',
    state: 'Lagos',
    postal_code: '101231',
  },
  KE: {
    address: 'Kenyatta Avenue',
    city: 'Nairobi',
    state: 'Nairobi',
    postal_code: '00100',
  },
  GB: {
    address: '10 Baker Street',
    city: 'London',
    state: 'England',
    postal_code: 'NW1 6XE',
  },
  IE: {
    address: 'Grafton Street',
    city: 'Dublin',
    state: 'Dublin',
    postal_code: 'D02 X285',
  },
  US: {
    address: '350 5th Avenue',
    city: 'New York',
    state: 'NY',
    postal_code: '10118',
  },
  CA: {
    address: '100 Queen Street W',
    city: 'Toronto',
    state: 'ON',
    postal_code: 'M5H 2N2',
  },
  DE: {
    address: 'Friedrichstrasse 43',
    city: 'Berlin',
    state: 'Berlin',
    postal_code: '10117',
  },
  FR: {
    address: '10 Rue de Rivoli',
    city: 'Paris',
    state: 'Ile-de-France',
    postal_code: '75004',
  },
};

/** A valid mobile number for the country, in international format. */
export function examplePhone(code: string): string {
  try {
    return (
      getExampleNumber(code.toUpperCase() as CountryCode, examples)?.number ??
      ''
    );
  } catch {
    return '';
  }
}

/**
 * The fields to replace when the country changes: a sample address for it (or the
 * country name as the city when we have none) and a valid example phone number.
 */
export function detailsForCountry(code: string): Address & {
  phone_number: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
} {
  const sample = SAMPLES[code.toUpperCase()];
  const name = countryByCode(code)?.name ?? code;
  const address = sample ?? {
    address: 'Main Street 1',
    city: name,
    state: name,
    postal_code: '00000',
  };
  return {
    ...address,
    street: address.address,
    building: '12',
    floor: '1',
    apartment: '4',
    phone_number: examplePhone(code),
  };
}

/** Why a phone number is not valid (null when it is), checked against the country's numbering plan. */
export function phoneProblem(e164: string): string | null {
  if (!e164) return 'Enter a phone number.';
  try {
    if (isValidPhoneNumber(e164)) return null;
    const parsed = parsePhoneNumberFromString(e164);
    const country = parsed?.country
      ? countryByCode(parsed.country)?.name
      : undefined;
    const sample = parsed?.country ? examplePhone(parsed.country) : '';
    return `Not a valid ${country ?? ''} number${sample ? ` (e.g. ${sample})` : ''}.`.replace(
      '  ',
      ' ',
    );
  } catch {
    return 'Not a valid phone number.';
  }
}
