package app.purrshelf.installer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream

private const val ACTION_STATUS = "app.purrshelf.installer.STATUS"

/**
 * Installs an app update through a PackageInstaller session (APP-11, ADR 0031).
 *
 * Once Purrshelf installed itself this way, Android 12+ lets later updates skip
 * the confirmation screen (USER_ACTION_NOT_REQUIRED), and Android 14+ lets the
 * app claim update ownership. When Android still wants a confirmation, the
 * system screen is shown if the app is allowed to prompt.
 */
class PurrshelfInstallerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PurrshelfInstaller")

    /** True when Android will update the app without asking (we are its installer of record). */
    Function("canInstallWithoutPrompt") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function false
      val pm = context.packageManager
      val source = pm.getInstallSourceInfo(context.packageName)
      val installer = source.installingPackageName
      val owner = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        source.updateOwnerPackageName
      } else {
        null
      }
      installer == context.packageName || owner == context.packageName
    }

    /**
     * Installs the APK at `fileUri`. Resolves "installed" or "prompted" (the
     * system screen was shown), or "needsUser" when Android wants a
     * confirmation and `allowPrompt` is false.
     */
    AsyncFunction("install") { fileUri: String, allowPrompt: Boolean, promise: Promise ->
      val path = Uri.parse(fileUri).path ?: fileUri
      val apk = File(path)
      if (!apk.isFile) {
        promise.reject(CodedException("ERR_NO_APK", "No APK at $path", null))
        return@AsyncFunction
      }
      try {
        install(apk, allowPrompt, promise)
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_INSTALL", e.message ?: "install failed", e))
      }
    }
  }

  private fun install(apk: File, allowPrompt: Boolean, promise: Promise) {
    val installer = context.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(context.packageName)
      setSize(apk.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        setRequestUpdateOwnership(true)
      }
    }
    val sessionId = installer.createSession(params)
    installer.openSession(sessionId).use { session ->
      FileInputStream(apk).use { input ->
        session.openWrite("purrshelf.apk", 0, apk.length()).use { output ->
          input.copyTo(output)
          session.fsync(output)
        }
      }

      val action = "$ACTION_STATUS.$sessionId"
      val receiver = object : BroadcastReceiver() {
        /** The promise settles once; later broadcasts (after a prompt) only clean up. */
        private var settled = false

        private fun resolve(value: String) {
          if (!settled) promise.resolve(value)
          settled = true
        }

        private fun reject(message: String) {
          if (!settled) promise.reject(CodedException("ERR_INSTALL", message, null))
          settled = true
        }

        override fun onReceive(ctx: Context, intent: Intent) {
          val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
          when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
              if (!allowPrompt) {
                // Not now: drop this session; the app tries again when it is open.
                try {
                  installer.abandonSession(sessionId)
                } catch (_: Exception) {
                  // Android finishes or drops it on its own.
                }
                done(ctx, this)
                resolve("needsUser")
                return
              }
              @Suppress("DEPRECATION")
              val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
              if (confirm == null) {
                done(ctx, this)
                reject("Android sent no confirmation screen")
                return
              }
              confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              ctx.startActivity(confirm)
              // The final status arrives as another broadcast; keep listening.
              resolve("prompted")
            }
            PackageInstaller.STATUS_SUCCESS -> {
              done(ctx, this)
              resolve("installed")
            }
            else -> {
              done(ctx, this)
              val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "status $status"
              reject(message)
            }
          }
        }
      }
      ContextCompat.registerReceiver(
        context,
        receiver,
        IntentFilter(action),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
      } else {
        PendingIntent.FLAG_UPDATE_CURRENT
      }
      val callback = PendingIntent.getBroadcast(
        context,
        sessionId,
        Intent(action).setPackage(context.packageName),
        flags,
      )
      session.commit(callback.intentSender)
    }
  }

  private fun done(ctx: Context, receiver: BroadcastReceiver) {
    try {
      ctx.unregisterReceiver(receiver)
    } catch (_: IllegalArgumentException) {
      // Already unregistered.
    }
  }
}
