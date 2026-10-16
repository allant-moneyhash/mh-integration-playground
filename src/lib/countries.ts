// Countries for the customer form. The intent gets `country` as ISO 3166-1 alpha-2
// and `phone_number` in international (E.164) format, e.g. "+971501234567".
// Names come from the browser (Intl.DisplayNames), so only codes live here.

/** [ISO alpha-2, international dialling code without "+"] */
const RAW: [string, string][] = [
  ['AE', '971'], ['SA', '966'], ['EG', '20'], ['KW', '965'], ['QA', '974'], ['BH', '973'], ['OM', '968'], ['JO', '962'],
  ['AF', '93'], ['AL', '355'], ['DZ', '213'], ['AS', '1684'], ['AD', '376'], ['AO', '244'], ['AI', '1264'], ['AG', '1268'],
  ['AR', '54'], ['AM', '374'], ['AW', '297'], ['AU', '61'], ['AT', '43'], ['AZ', '994'], ['BS', '1242'], ['BD', '880'],
  ['BB', '1246'], ['BY', '375'], ['BE', '32'], ['BZ', '501'], ['BJ', '229'], ['BM', '1441'], ['BT', '975'], ['BO', '591'],
  ['BA', '387'], ['BW', '267'], ['BR', '55'], ['VG', '1284'], ['BN', '673'], ['BG', '359'], ['BF', '226'], ['BI', '257'],
  ['KH', '855'], ['CM', '237'], ['CA', '1'], ['CV', '238'], ['KY', '1345'], ['CF', '236'], ['TD', '235'], ['CL', '56'],
  ['CN', '86'], ['CO', '57'], ['KM', '269'], ['CG', '242'], ['CD', '243'], ['CK', '682'], ['CR', '506'], ['CI', '225'],
  ['HR', '385'], ['CU', '53'], ['CW', '599'], ['CY', '357'], ['CZ', '420'], ['DK', '45'], ['DJ', '253'], ['DM', '1767'],
  ['DO', '1809'], ['EC', '593'], ['SV', '503'], ['GQ', '240'], ['ER', '291'], ['EE', '372'], ['SZ', '268'], ['ET', '251'],
  ['FO', '298'], ['FJ', '679'], ['FI', '358'], ['FR', '33'], ['GF', '594'], ['PF', '689'], ['GA', '241'], ['GM', '220'],
  ['GE', '995'], ['DE', '49'], ['GH', '233'], ['GI', '350'], ['GR', '30'], ['GL', '299'], ['GD', '1473'], ['GP', '590'],
  ['GU', '1671'], ['GT', '502'], ['GG', '44'], ['GN', '224'], ['GW', '245'], ['GY', '592'], ['HT', '509'], ['HN', '504'],
  ['HK', '852'], ['HU', '36'], ['IS', '354'], ['IN', '91'], ['ID', '62'], ['IR', '98'], ['IQ', '964'], ['IE', '353'],
  ['IM', '44'], ['IL', '972'], ['IT', '39'], ['JM', '1876'], ['JP', '81'], ['JE', '44'], ['KZ', '7'], ['KE', '254'],
  ['KI', '686'], ['XK', '383'], ['KG', '996'], ['LA', '856'], ['LV', '371'], ['LB', '961'], ['LS', '266'], ['LR', '231'],
  ['LY', '218'], ['LI', '423'], ['LT', '370'], ['LU', '352'], ['MO', '853'], ['MG', '261'], ['MW', '265'], ['MY', '60'],
  ['MV', '960'], ['ML', '223'], ['MT', '356'], ['MH', '692'], ['MQ', '596'], ['MR', '222'], ['MU', '230'], ['YT', '262'],
  ['MX', '52'], ['FM', '691'], ['MD', '373'], ['MC', '377'], ['MN', '976'], ['ME', '382'], ['MS', '1664'], ['MA', '212'],
  ['MZ', '258'], ['MM', '95'], ['NA', '264'], ['NR', '674'], ['NP', '977'], ['NL', '31'], ['NC', '687'], ['NZ', '64'],
  ['NI', '505'], ['NE', '227'], ['NG', '234'], ['KP', '850'], ['MK', '389'], ['MP', '1670'], ['NO', '47'], ['PK', '92'],
  ['PW', '680'], ['PS', '970'], ['PA', '507'], ['PG', '675'], ['PY', '595'], ['PE', '51'], ['PH', '63'], ['PL', '48'],
  ['PT', '351'], ['PR', '1787'], ['RE', '262'], ['RO', '40'], ['RU', '7'], ['RW', '250'], ['KN', '1869'], ['LC', '1758'],
  ['VC', '1784'], ['WS', '685'], ['SM', '378'], ['ST', '239'], ['SN', '221'], ['RS', '381'], ['SC', '248'], ['SL', '232'],
  ['SG', '65'], ['SX', '1721'], ['SK', '421'], ['SI', '386'], ['SB', '677'], ['SO', '252'], ['ZA', '27'], ['KR', '82'],
  ['SS', '211'], ['ES', '34'], ['LK', '94'], ['SD', '249'], ['SR', '597'], ['SE', '46'], ['CH', '41'], ['SY', '963'],
  ['TW', '886'], ['TJ', '992'], ['TZ', '255'], ['TH', '66'], ['TL', '670'], ['TG', '228'], ['TO', '676'], ['TT', '1868'],
  ['TN', '216'], ['TR', '90'], ['TM', '993'], ['TC', '1649'], ['TV', '688'], ['UG', '256'], ['UA', '380'], ['GB', '44'],
  ['US', '1'], ['UY', '598'], ['UZ', '998'], ['VU', '678'], ['VA', '39'], ['VE', '58'], ['VN', '84'], ['VI', '1340'],
  ['YE', '967'], ['ZM', '260'], ['ZW', '263'],
];

export type Country = { code: string; name: string; dial: string; flag: string };

const flag = (code: string) => String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));

let names: Intl.DisplayNames | null = null;
function nameOf(code: string) {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The MENA markets first (most demos), then A–Z. */
const PINNED = ['AE', 'SA', 'EG', 'KW', 'QA', 'BH', 'OM', 'JO'];

export const COUNTRIES: Country[] = RAW.map(([code, dial]) => ({ code, dial, name: nameOf(code), flag: flag(code) })).sort((a, b) => {
  const pa = PINNED.indexOf(a.code);
  const pb = PINNED.indexOf(b.code);
  if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
  return a.name.localeCompare(b.name);
});
export const PINNED_COUNT = PINNED.length;

export const countryByCode = (code: string) => COUNTRIES.find(c => c.code === code.toUpperCase());

/**
 * Split "+971501234567" into a country and the national number. Longest dialling
 * code wins; when several countries share it (+1, +7, +44), `prefer` decides.
 */
export function splitPhone(e164: string, prefer?: string): { country: Country | undefined; national: string } {
  const digits = e164.replace(/\D/g, '');
  const hits = COUNTRIES.filter(c => digits.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length);
  const best = hits.filter(c => c.dial === hits[0]?.dial);
  const country = best.find(c => c.code === prefer) ?? best.find(c => c.code === 'US' || c.code === 'GB' || c.code === 'RU') ?? best[0];
  return { country, national: country ? digits.slice(country.dial.length) : digits };
}

/** Italy, Vatican and San Marino keep the leading 0 in international numbers. */
const KEEPS_ZERO = ['IT', 'VA', 'SM'];

/** E.164 for the intent: "+" + dialling code + national number without its trunk 0. */
export function joinPhone(country: Country, national: string) {
  const digits = national.replace(/\D/g, '');
  return `+${country.dial}${KEEPS_ZERO.includes(country.code) ? digits : digits.replace(/^0+/, '')}`;
}
