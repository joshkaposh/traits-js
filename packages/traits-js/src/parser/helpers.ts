export const timestamp = (label: string, then: number) => `${label}: ${((performance.now() - then) / 1000)}`;

export const format = (label: string, message: string, prefix: string, suffix: string) => `${prefix}${label}${suffix}${message}`

export const print = (label: string, message: string, padding?: number) => console.log(typeof padding === 'number' ? `${'-'.padStart(padding + 1, ' ')}${format(label, message, '', ': ')}` : `${format(label, message, '[ ', ' ]: ')}`);

export const getCode = (code: string, start: number, end: number) => code.slice(start, end);
