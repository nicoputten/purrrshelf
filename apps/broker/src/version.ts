/** Set at image build time (see Dockerfile); falls back for local runs. */
export const VERSION = process.env.BROKER_VERSION ?? '0.0.0-dev';
