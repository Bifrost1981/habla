// Feste Sätze, die außerhalb der Lektionen vorgelesen werden (werden mit vertont).
export const VOICE_SAMPLE = 'Hola, ¿qué tal? Me llamo Lucía.';
export const RATE_SAMPLE = 'Un café con leche, por favor.';
export const SHORT_SAMPLE = 'Hola, ¿qué tal?';
export const RESULT_HEADLINES = ['¡Excelente!', '¡Muy bien!', '¡Bien hecho!'] as const;

export const FIXED_PHRASES: string[] = [VOICE_SAMPLE, RATE_SAMPLE, SHORT_SAMPLE, ...RESULT_HEADLINES];
