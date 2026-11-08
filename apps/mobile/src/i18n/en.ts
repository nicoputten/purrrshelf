/** English strings. Dutch (nl.ts) must have exactly the same keys; a test checks it. */
export const en = {
  app: { name: 'Purrshelf' },
  common: {
    continue: 'Continue',
    cancel: 'Cancel',
    checking: 'Checking…',
    comingSoon: 'Coming soon',
  },
  onboarding: {
    serverTitle: 'Where does your shelf live?',
    serverIntro: 'Enter the address of your Purrshelf server. You only do this once.',
    serverLabel: 'Server address',
    serverPlaceholder: 'https://…',
    connect: 'Connect',
    loginTitle: 'Welcome back',
    loginIntro: 'Log in with your own account.',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    login: 'Log in',
    changeServer: 'Change',
    connectedTo: 'Connected to {{server}}',
  },
  tabs: {
    search: 'Search',
    library: 'Library',
    requests: 'Requests',
    settings: 'Settings',
  },
  home: {
    heading: 'What are we reading next?',
    hello: 'Hi {{name}}!',
    placeholder: 'Searching for books arrives in the next update.',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    account: 'Account',
    followPhone: 'Follow phone',
    english: 'English',
    dutch: 'Nederlands',
    dark: 'Dark',
    light: 'Light',
    loggedInAs: 'Logged in as {{name}}',
    server: 'Server: {{server}}',
    logout: 'Log out',
  },
  errors: {
    required: 'Fill this in',
    invalidUrl: 'That is not a valid address. It starts with https:// or http://',
    unreachable: 'Can’t reach the server. Check the address and your connection.',
    notPurrshelf: 'That address answers, but it is not a Purrshelf server.',
    VALIDATION_ERROR: 'Something in the form is not right.',
    UNAUTHORIZED: 'Please log in again.',
    INVALID_CREDENTIALS: 'Wrong username or password.',
    ACCOUNT_LOCKED: 'Too many tries. Wait {{minutes}} min and try again.',
    INVALID_REFRESH_TOKEN: 'Your session has ended. Please log in again.',
    RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
    NOT_FOUND: 'Not found.',
    METADATA_UNAVAILABLE: 'Book search is down for a moment. Try again soon.',
    INTERNAL_ERROR: 'The server had a problem. Try again later.',
    unknown: 'Something went wrong. Try again.',
  },
};

/** Same shape as `en`, every leaf a string. */
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Translations = Shape<typeof en>;
