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

export function parseJpeg(value: unknown): Buffer {
  if (typeof value !== 'string') throw new ValidationError('photo', 'Photo is missing.');
  const base64 = value.replace(/^data:image\/jpeg;base64,/, '');
  const data = Buffer.from(base64, 'base64');
  if (data.length < 100) throw new ValidationError('photo', 'Photo is missing.');
  if (data.length > 600 * 1024) throw new ValidationError('photo', 'Photo is too large.');
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new ValidationError('photo', 'Photo must be a JPEG image.');
  return data;
}
