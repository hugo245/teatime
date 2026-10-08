import { isInterest, type InterestId } from './interests.js';

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

const BLOCKED_WORDS = [
  'fuck',
  'fucking',
  'shit',
  'cunt',
  'bitch',
  'whore',
  'slut',
  'pussy',
  'porn',
  'nude',
  'nudes',
  'naked',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'kanker',
  'hoer',
  'tering',
  'godverdomme',
  'klootzak',
  'neuken',
];

const blockedPattern = new RegExp(`(^|[^\\p{L}])(${BLOCKED_WORDS.join('|')})(?=$|[^\\p{L}])`, 'iu');
const linkPattern = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|nl|uk|io|me|info|biz)\b)/i;
const phonePattern = /(\+?\d[\d\s().-]{7,}\d)/;
const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function containsBlockedWords(text: string): boolean {
  return blockedPattern.test(text);
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseName(value: unknown): string {
  const name = cleanText(value);
  if (name.length < 1) throw new ValidationError('name', 'Please enter your first name.');
  if (name.length > 30) throw new ValidationError('name', 'Your name can be at most 30 letters.');
  if (!/^[\p{L}\p{M}' .-]+$/u.test(name)) {
    throw new ValidationError('name', 'Please use only letters in your name.');
  }
  if (containsBlockedWords(name)) throw new ValidationError('name', 'Please choose a different name.');
  return name;
}

export function parseLocation(value: unknown): string {
  const location = cleanText(value);
  if (location.length > 40) throw new ValidationError('location', 'Please keep this shorter.');
  if (location && !/^[\p{L}\p{M}\p{N}' .,()-]+$/u.test(location)) {
    throw new ValidationError('location', 'Please use only letters and numbers.');
  }
  if (containsBlockedWords(location)) throw new ValidationError('location', 'Please write something different.');
  return location;
}

export function parseAbout(value: unknown): string {
  const about = cleanText(value);
  if (about.length > 200) throw new ValidationError('about', 'Please keep this under 200 letters.');
  if (containsBlockedWords(about)) throw new ValidationError('about', 'Please write something different.');
  if (linkPattern.test(about) || emailPattern.test(about) || phonePattern.test(about)) {
    throw new ValidationError('about', 'For your safety, please do not share links, emails or phone numbers.');
  }
  return about;
}

export function parseInterests(value: unknown): InterestId[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('interests', 'Interests must be a list.');
  const result: InterestId[] = [];
  for (const item of value) {
    if (isInterest(item) && !result.includes(item)) result.push(item);
  }
  return result.slice(0, 8);
}

export function parseDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null;
}

export const REPORT_REASONS = ['rude', 'inappropriate', 'money', 'fake', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function parseReportReason(value: unknown): ReportReason {
  if (typeof value === 'string' && (REPORT_REASONS as readonly string[]).includes(value)) {
    return value as ReportReason;
  }
  throw new ValidationError('reason', 'Please choose a reason.');
}

export function parseJpeg(value: unknown): Uint8Array {
  if (typeof value !== 'string') throw new ValidationError('photo', 'Photo is missing.');
  const base64 = value.replace(/^data:image\/jpeg;base64,/, '');
  let data: Uint8Array;
  try {
    data = Uint8Array.from(atob(base64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  } catch {
    throw new ValidationError('photo', 'Photo is missing.');
  }
  if (data.length < 100) throw new ValidationError('photo', 'Photo is missing.');
  if (data.length > 600 * 1024) throw new ValidationError('photo', 'Photo is too large.');
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new ValidationError('photo', 'Photo must be a JPEG image.');
  return data;
}

export const LANGUAGE_CODES = ['en', 'nl', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'sv', 'da', 'no', 'fi', 'tr', 'el', 'ar', 'zh', 'hi', 'ja', 'ru', 'uk'];

export function parseLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && LANGUAGE_CODES.includes(item) && !result.includes(item)) result.push(item);
  }
  return result.slice(0, 6);
}

export function parseBirthYear(value: unknown): number {
  const year = Number(value);
  const now = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < now - 110 || year > now) {
    throw new ValidationError('birthYear', 'Please enter the year you were born.');
  }
  if (now - year < 18) throw new ValidationError('birthYear', 'TeaTime is only for adults.');
  return year;
}

export function checkAgeEstimate(claimedAge: number, estimatedAge: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(estimatedAge) || estimatedAge <= 0 || estimatedAge > 120) {
    return { ok: false, reason: 'We could not see your face clearly. Please try again in good light.' };
  }
  const below = claimedAge >= 55 ? 18 : 12;
  const above = 12;
  if (estimatedAge < 16) return { ok: false, reason: 'TeaTime is only for adults.' };
  if (estimatedAge < claimedAge - below || estimatedAge > claimedAge + above) {
    return { ok: false, reason: 'The age you entered does not match your photo. Please check the year you were born and try again in good light.' };
  }
  return { ok: true };
}

export function parseMessageText(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('text', 'Please type a message.');
  const text = value
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) throw new ValidationError('text', 'Please type a message.');
  if (text.length > 1000) throw new ValidationError('text', 'Please keep your message under 1000 letters.');
  if (containsBlockedWords(text)) throw new ValidationError('text', 'Please write something different.');
  return text;
}

export function parseEventInput(body: Record<string, unknown>) {
  const text = (value: unknown, field: string, max: number, required = false) => {
    const result = cleanText(value);
    if (required && !result) throw new ValidationError(field, `Please fill in the ${field}.`);
    if (result.length > max) throw new ValidationError(field, `Please keep the ${field} under ${max} letters.`);
    return result;
  };
  const time = (value: unknown, field: string) => {
    if (value === undefined || value === null || value === '') return null;
    const ms = typeof value === 'number' ? value : Date.parse(String(value));
    if (!Number.isFinite(ms)) throw new ValidationError(field, `Please give a valid ${field}.`);
    return ms;
  };
  const startsAt = time(body.startsAt, 'start time');
  if (startsAt === null) throw new ValidationError('startsAt', 'Please give a valid start time.');
  return {
    title: text(body.title, 'title', 80, true),
    description: text(body.description, 'description', 1000),
    location: text(body.location, 'location', 120),
    startsAt,
    endsAt: time(body.endsAt, 'end time'),
  };
}
