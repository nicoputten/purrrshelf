/** Injected everywhere time matters, so tests can move it. */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
