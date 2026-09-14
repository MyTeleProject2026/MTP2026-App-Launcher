package com.mytele.mtp2026.launcher;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 2026;
    private static final int FILE_CHOOSER_REQUEST = 2027;
    private static final String NOTIFICATION_CHANNEL_ID = "mtp2026_general";
    private static final String INSTALL_STATUS_ACTION = "com.mytele.mtp2026.INSTALL_STATUS";
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private final Set<String> allowedHosts = new HashSet<>();
    private final Set<String> trustedMtpHosts = new HashSet<>(Arrays.asList(
            "mtp2026-app-launcher.onrender.com",
            "mtp2026-app-launcher-backend.onrender.com",
            "www.vexastore.2bd.net",
            "vexastore.2bd.net",
            "vexaaccount-management.onrender.com"
    ));
    private BroadcastReceiver installReceiver;

    private static final int IMMERSIVE_FLAGS =
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri start = Uri.parse(BuildConfig.WEB_APP_URL);
        allowedHosts.addAll(Arrays.asList(BuildConfig.ALLOWED_HOSTS.split(",")));
        allowedHosts.addAll(trustedMtpHosts);
        if (start.getHost() != null) allowedHosts.add(start.getHost().toLowerCase());
        applyImmersive(true);
        createNotificationChannel();
        requestNotificationPermissionIfNeeded();
        registerInstallReceiver();

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(7,16,24));

        if ("owner".equals(BuildConfig.EDITION)) {
            LinearLayout bar = new LinearLayout(this);
            bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(28, 18, 20, 18); bar.setBackgroundColor(Color.rgb(7,16,24));
            TextView title = new TextView(this); title.setText("VexaAccount Owner Control Center"); title.setTextColor(Color.WHITE); title.setTextSize(18); title.setTypeface(null, 1);
            bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            Button refresh = new Button(this); refresh.setText("Refresh"); refresh.setOnClickListener(v -> webView.reload());
            bar.addView(refresh, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        webView = new WebView(this);
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setSupportMultipleWindows(false); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.addJavascriptInterface(new NativeBridge(), "MTP2026Native");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent;
                try { intent = params.createIntent(); }
                catch (Exception error) {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                try { startActivityForResult(intent, FILE_CHOOSER_REQUEST); }
                catch (Exception error) { fileChooserCallback = null; callback.onReceiveValue(null); }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return route(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return route(Uri.parse(url)); }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectVexaStoreInstaller(view, url);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { super.onReceivedError(view, request, error); }
        });
        webView.loadUrl(BuildConfig.WEB_APP_URL);
    }

    private void injectVexaStoreInstaller(WebView view, String url) {
        try {
            Uri uri = Uri.parse(url);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            if (!host.equals("www.vexastore.2bd.net") && !host.equals("vexastore.2bd.net")) return;
            String js = "(function(){if(window.__MTP2026_APK_BRIDGE__)return;window.__MTP2026_APK_BRIDGE__=1;document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(!a)return;var u=a.href||'';if(/\\.apk(?:[?#].*)?$/i.test(u)&&window.MTP2026Native&&window.MTP2026Native.installApkFromUrl){e.preventDefault();e.stopPropagation();window.MTP2026Native.installApkFromUrl(u,'');}},true);})();";
            view.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) return;
        ValueCallback<Uri[]> callback = fileChooserCallback;
        fileChooserCallback = null;
        if (callback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        callback.onReceiveValue(result);
    }

    private void applyImmersive(boolean enabled) { getWindow().getDecorView().setSystemUiVisibility(enabled ? IMMERSIVE_FLAGS : View.SYSTEM_UI_FLAG_VISIBLE); }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(NOTIFICATION_CHANNEL_ID, "MTP2026", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("MTP2026 launcher notifications");
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
    }

    private boolean postNotification(String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) { runOnUiThread(this::requestNotificationPermissionIfNeeded); return false; }
        NotificationManager manager = getSystemService(NotificationManager.class); if (manager == null) return false;
        Intent launchIntent = new Intent(this, MainActivity.class); launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 2026, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new android.app.Notification.Builder(this, NOTIFICATION_CHANNEL_ID) : new android.app.Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title == null || title.isEmpty() ? "MTP2026" : title).setContentText(body == null ? "" : body).setAutoCancel(true).setContentIntent(pending);
        manager.notify((int)(System.currentTimeMillis() & 0x7fffffff), builder.build());
        return true;
    }

    private void registerInstallReceiver() {
        installReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                if (status == PackageInstaller.STATUS_SUCCESS) postNotification("VexaStore", "Application installed successfully. It is now available in MTP2026 Device OS.");
                else postNotification("VexaStore installation", message == null ? "Installation failed." : message);
            }
        };
        IntentFilter filter = new IntentFilter(INSTALL_STATUS_ACTION);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(installReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(installReceiver, filter);
    }

    private boolean isTrustedWebHost(Uri uri) {
        String host = uri == null ? null : uri.getHost();
        return host != null && trustedMtpHosts.contains(host.toLowerCase());
    }

    private boolean isApkUrl(Uri uri) {
        String path = uri == null ? "" : String.valueOf(uri.getPath());
        return path.toLowerCase().endsWith(".apk");
    }

    private void installApkFromUrl(String rawUrl, String packageName) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return;
        final Uri uri;
        try { uri = Uri.parse(rawUrl); } catch (Exception error) { postNotification("VexaStore", "Invalid APK URL."); return; }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !isTrustedWebHost(uri)) { postNotification("VexaStore", "APK installation is restricted to a trusted VexaStore HTTPS source."); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                startActivity(settings);
            } catch (Exception ignored) {}
            postNotification("VexaStore", "Allow MTP2026 to install applications, then tap Install again.");
            return;
        }
        postNotification("VexaStore", "Downloading application package…");
        new Thread(() -> {
            PackageInstaller installer = getPackageManager().getPackageInstaller();
            PackageInstaller.Session session = null;
            try {
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setInstallReason(PackageManager.INSTALL_REASON_USER);
                if (Build.VERSION.SDK_INT >= 31 && packageName != null && !packageName.trim().isEmpty()) params.setAppPackageName(packageName.trim());
                int sessionId = installer.createSession(params);
                session = installer.openSession(sessionId);
                HttpURLConnection connection = (HttpURLConnection) new URL(uri.toString()).openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(60000); connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "MTP2026-VexaStore/1.0");
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new IllegalStateException("APK download failed (HTTP " + code + ")");
                long expected = connection.getContentLengthLong();
                try (InputStream input = connection.getInputStream(); OutputStream output = session.openWrite("base.apk", 0, expected > 0 ? expected : -1)) {
                    byte[] buffer = new byte[64 * 1024]; int read; long total = 0;
                    while ((read = input.read(buffer)) != -1) { output.write(buffer, 0, read); total += read; if (total % (1024 * 1024) < read) postNotification("VexaStore", "Downloading application… " + (total / 1048576) + " MB"); }
                    output.flush(); session.fsync(output);
                } finally { connection.disconnect(); }
                Intent statusIntent = new Intent(INSTALL_STATUS_ACTION); statusIntent.setPackage(getPackageName());
                PendingIntent pending = PendingIntent.getBroadcast(this, sessionId, statusIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                session.commit(pending.getIntentSender());
                postNotification("VexaStore", "Package downloaded. Android Package Installer is completing the installation.");
            } catch (Exception error) {
                if (session != null) try { session.abandon(); } catch (Exception ignored) {}
                postNotification("VexaStore installation", error.getMessage() == null ? "Installation failed." : error.getMessage());
            } finally { if (session != null) try { session.close(); } catch (Exception ignored) {} }
        }).start();
    }

    private final class NativeBridge {
        @JavascriptInterface public void setDeviceMode(String mode) {
            runOnUiThread(() -> {
                if ("gaming".equals(mode)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                else if ("android".equals(mode) || "ios".equals(mode)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                else setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                applyImmersive(true);
            });
        }
        @JavascriptInterface public String getCapabilities() { return "{\"native\":true,\"orientation\":true,\"fullscreen\":true,\"filesystem\":false,\"notifications\":true,\"clipboard\":true,\"externalApps\":true,\"gamepad\":true,\"filePicker\":true,\"apkInstaller\":true,\"packageInstaller\":true}"; }
        @JavascriptInterface public String getArm64BootStatus() {
            String[] abis = Build.SUPPORTED_ABIS == null ? new String[0] : Build.SUPPORTED_ABIS; boolean arm64 = false;
            for (String abi : abis) if ("arm64-v8a".equalsIgnoreCase(abi) || "aarch64".equalsIgnoreCase(abi)) { arm64 = true; break; }
            String architecture = System.getProperty("os.arch", "unknown"); String abi = abis.length == 0 ? "unknown" : abis[0]; String state = arm64 ? "native-arm64-ready" : "unsupported-host";
            return "{\"state\":\"" + state + "\",\"host\":\"android\",\"architecture\":\"" + jsonSafe(architecture) + "\",\"hostAbi\":\"" + jsonSafe(abi) + "\",\"physicalOsBoot\":false,\"kernelControl\":false}";
        }
        private String jsonSafe(String value) { return value == null ? "unknown" : value.replace("\\", "\\\\").replace("\"", "\\\""); }
        @JavascriptInterface public boolean notify(String title, String body) { return postNotification(title, body); }
        @JavascriptInterface public void enterFullscreen() { runOnUiThread(() -> applyImmersive(true)); }
        @JavascriptInterface public void exitFullscreen() { runOnUiThread(() -> applyImmersive(false)); }
        @JavascriptInterface public void openExternal(String url) {
            try {
                Uri uri = Uri.parse(url);
                if (isTrustedWebHost(uri)) runOnUiThread(() -> webView.loadUrl(uri.toString()));
                else startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) {}
        }
        @JavascriptInterface public void installApkFromUrl(String url, String packageName) { installApkFromUrl(url, packageName); }
    }

    private boolean route(Uri uri) {
        String scheme = uri.getScheme(), host = uri.getHost();
        if (isApkUrl(uri) && isTrustedWebHost(uri)) { installApkFromUrl(uri.toString(), ""); return true; }
        if ("https".equalsIgnoreCase(scheme) && host != null && allowedHosts.contains(host.toLowerCase())) return false;
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) { startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true; }
        return true;
    }
    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() {
        if (installReceiver != null) { try { unregisterReceiver(installReceiver); } catch (Exception ignored) {} installReceiver = null; }
        if (fileChooserCallback != null) { fileChooserCallback.onReceiveValue(null); fileChooserCallback = null; }
        if (webView != null) { webView.loadUrl("about:blank"); webView.stopLoading(); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
