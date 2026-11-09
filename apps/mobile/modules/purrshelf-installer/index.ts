import { requireOptionalNativeModule } from 'expo';

/** What happened to an install request (APP-11). */
export type InstallResult = 'installed' | 'prompted' | 'needsUser';

interface PurrshelfInstallerModule {
  /** True when Android will update the app without its confirmation screen. */
  canInstallWithoutPrompt(): boolean;
  /** Installs the APK at a file:// URI through a PackageInstaller session. */
  install(fileUri: string, allowPrompt: boolean): Promise<InstallResult>;
}

/** Null where the native module is not built in (tests, Expo Go). */
export const PurrshelfInstaller =
  requireOptionalNativeModule<PurrshelfInstallerModule>('PurrshelfInstaller');
