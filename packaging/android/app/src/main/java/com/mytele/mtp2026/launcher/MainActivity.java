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
import android.content.res.AssetManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.zip.GZIPInputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
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
            "api-vexastore.onrender.com",
            "api-vexaaccount.onrender.com",
            "vexaaccount-management.onrender.com",
            "mtp2026-desktopos.onrender.com"
    ));
    private BroadcastReceiver installReceiver;
    private static final String DESKTOP_GUEST_ASSET = "desktop-guest/mtp2026-desktop-arm64-guest.tar.gz";
    private static final String DESKTOP_GUEST_META_ASSET = "desktop-guest/guest-profile.json";
    private static final String DESKTOP_GUEST_ASSET_ROOT = "desktop-guest";
    private static final String DESKTOP_GUEST_PREFS = "mtp2026_guest";

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
        if ("desktop".equals(BuildConfig.EDITION)) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        }
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
        if ("desktop".equals(BuildConfig.EDITION)) ensureBundledDesktopGuestImported();
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

    private void extractDesktopGuestArchive(File archive, File destinationRoot) throws Exception {
        if (!destinationRoot.exists() && !destinationRoot.mkdirs()) throw new IOException("Cannot create Desktop guest storage");
        try (InputStream raw = new FileInputStream(archive); InputStream gzip = new GZIPInputStream(raw)) {
            byte[] header = new byte[512];
            while (readTarBlock(gzip, header)) {
                boolean empty = true;
                for (byte value : header) if (value != 0) { empty = false; break; }
                if (empty) break;
                String name = tarString(header, 0, 100);
                String prefix = tarString(header, 345, 155);
                if (!prefix.isEmpty()) name = prefix + "/" + name;
                long size = tarOctal(header, 124, 12);
                int type = header[156] & 0xff;
                if (name.isEmpty() || name.startsWith("/") || name.contains("\\") || name.matches("^[A-Za-z]:.*")) {
                    skipTarBytes(gzip, size + ((512 - (size % 512)) % 512));
                    continue;
                }
                File target = new File(destinationRoot, name);
                String rootPath = destinationRoot.getCanonicalPath() + File.separator;
                String targetPath = target.getCanonicalPath();
                if (!targetPath.startsWith(rootPath) && !targetPath.equals(destinationRoot.getCanonicalPath())) {
                    skipTarBytes(gzip, size + ((512 - (size % 512)) % 512));
                    continue;
                }
                if (type == '5') {
                    if (!target.exists() && !target.mkdirs()) throw new IOException("Cannot create guest directory " + name);
                    skipTarBytes(gzip, size + ((512 - (size % 512)) % 512));
                    continue;
                }
                if (type == 0 || type == '0') {
                    File parent = target.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Cannot create guest directory");
                    try (OutputStream output = new FileOutputStream(target)) {
                        copyExact(gzip, output, size);
                        output.flush();
                    }
                    skipTarBytes(gzip, (512 - (size % 512)) % 512);
                } else {
                    // Symlinks, hard links, and device nodes are intentionally not
                    // materialized from an untrusted archive.
                    skipTarBytes(gzip, size + ((512 - (size % 512)) % 512));
                }
            }
        }
    }

    private boolean readTarBlock(InputStream input, byte[] block) throws IOException {
        int offset = 0;
        while (offset < block.length) {
            int count = input.read(block, offset, block.length - offset);
            if (count < 0) {
                if (offset == 0) return false;
                throw new IOException("Truncated Desktop guest archive header");
            }
            if (count == 0) continue;
            offset += count;
        }
        return true;
    }

    private String tarString(byte[] bytes, int offset, int length) {
        int end = offset;
        int limit = Math.min(bytes.length, offset + length);
        while (end < limit && bytes[end] != 0) end++;
        return new String(bytes, offset, end - offset, java.nio.charset.StandardCharsets.UTF_8);
    }

    private long tarOctal(byte[] bytes, int offset, int length) throws IOException {
        String value = tarString(bytes, offset, length).trim();
        if (value.isEmpty()) return 0;
        try { return Long.parseLong(value.replaceAll("[^0-7].*$", ""), 8); }
        catch (NumberFormatException error) { throw new IOException("Invalid Desktop guest archive entry size", error); }
    }

    private void copyExact(InputStream input, OutputStream output, long size) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long remaining = size;
        while (remaining > 0) {
            int count = input.read(buffer, 0, (int)Math.min(buffer.length, remaining));
            if (count < 0) throw new IOException("Truncated Desktop guest archive file");
            if (count == 0) continue;
            output.write(buffer, 0, count);
            remaining -= count;
        }
    }

    private void skipTarBytes(InputStream input, long size) throws IOException {
        long remaining = size;
        byte[] buffer = new byte[8192];
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped > 0) { remaining -= skipped; continue; }
            int count = input.read(buffer, 0, (int)Math.min(buffer.length, remaining));
            if (count < 0) throw new IOException("Truncated Desktop guest archive padding");
            if (count == 0) continue;
            remaining -= count;
        }
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
        @JavascriptInterface public String getCapabilities() { return "{\"native\":true,\"orientation\":true,\"fullscreen\":true,\"filesystem\":false,\"notifications\":true,\"clipboard\":true,\"externalApps\":true,\"gamepad\":true,\"filePicker\":true,\"apkInstaller\":true,\"packageInstaller\":true,\"desktopGuestBundle\":true,\"desktopGuestProfile\":\"desktop\"}"; }
        @JavascriptInterface public String getDesktopGuestStatus() {
            if (!"desktop".equals(BuildConfig.EDITION)) return "{\"state\":\"not-desktop-edition\"}";
            android.content.SharedPreferences prefs = getSharedPreferences(DESKTOP_GUEST_PREFS, MODE_PRIVATE);
            String state = prefs.getString("desktop_status", "not-imported");
            String root = prefs.getString("desktop_root", "");
            String manifest = prefs.getString("desktop_manifest", "");
            return "{\"state\":\"" + jsonSafe(state) + "\",\"root\":\"" + jsonSafe(root) + "\",\"profile\":\"desktop\",\"architecture\":\"arm64\",\"imageRuntime\":\"qemu-aarch64-virt\",\"bundledGuestCore\":true,\"manifestPresent\":" + (!manifest.isEmpty()) + "}";
        }
        @JavascriptInterface public String getArm64BootStatus() {
            String[] abis = Build.SUPPORTED_ABIS == null ? new String[0] : Build.SUPPORTED_ABIS; boolean arm64 = false;
            for (String abi : abis) if ("arm64-v8a".equalsIgnoreCase(abi) || "aarch64".equalsIgnoreCase(abi)) { arm64 = true; break; }
            String architecture = System.getProperty("os.arch", "unknown"); String abi = abis.length == 0 ? "unknown" : abis[0];
            File guest = new File(getFilesDir(), "mtp2026-desktop-guest/mtp2026-desktop-arm64-guest.tar.gz");
            String state = arm64 ? (guest.isFile() && guest.length() > 0 ? "desktop-guest-imported" : "native-arm64-ready") : "unsupported-host";
            return "{\"state\":\"" + state + "\",\"host\":\"android\",\"architecture\":\"" + jsonSafe(architecture) + "\",\"hostAbi\":\"" + jsonSafe(abi) + "\",\"physicalOsBoot\":false,\"kernelControl\":false,\"desktopGuestProfile\":\"desktop\",\"desktopGuestBundleImported\":" + (guest.isFile() && guest.length() > 0 ? "true" : "false") + "}";
        }
        @JavascriptInterface public String getDesktopGuestProfile() {
            try {
                return readAssetText(DESKTOP_GUEST_META_ASSET);
            } catch (Exception error) {
                return "{\"profile\":\"desktop\",\"status\":\"asset-unavailable\"}";
            }
        }
        @JavascriptInterface public boolean importBundledDesktopGuest() {
            try {
                copyAsset(DESKTOP_GUEST_ASSET, new File(getFilesDir(), DESKTOP_GUEST_ASSET));
                copyAsset(DESKTOP_GUEST_META_ASSET, new File(getFilesDir(), DESKTOP_GUEST_META_ASSET));
                postNotification("MTP2026 Desktop OS", "Desktop guest profile imported into native Android storage.");
                return true;
            } catch (Exception error) {
                postNotification("MTP2026 Desktop OS", "Desktop guest import failed: " + error.getMessage());
                return false;
            }
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

    private void ensureBundledDesktopGuestImported() {
        File guest = new File(getFilesDir(), DESKTOP_GUEST_ASSET);
        File metadata = new File(getFilesDir(), DESKTOP_GUEST_META_ASSET);
        File root = new File(getFilesDir(), "mtp2026/guests/desktop");
        android.content.SharedPreferences prefs = getSharedPreferences(DESKTOP_GUEST_PREFS, MODE_PRIVATE);
        if (guest.isFile() && guest.length() > 0 && new File(root, "mtp2026-desktop-arm64-linux.Image").isFile()) return;
        new Thread(() -> {
            try {
                copyAsset(DESKTOP_GUEST_ASSET, guest);
                copyAsset(DESKTOP_GUEST_META_ASSET, metadata);
                extractDesktopGuestArchive(guest, root);
                String manifest = readAssetText(DESKTOP_GUEST_META_ASSET);
                prefs.edit()
                        .putString("desktop_status", "bundled-imported")
                        .putString("desktop_root", root.getAbsolutePath())
                        .putString("desktop_manifest", manifest)
                        .putLong("desktop_imported_at", System.currentTimeMillis())
                        .remove("desktop_error")
                        .apply();
                postNotification("MTP2026 Desktop OS", "Desktop ARM64 guest files extracted into app storage.");
            } catch (Exception error) {
                prefs.edit().putString("desktop_status", "import-failed")
                        .putString("desktop_error", String.valueOf(error.getMessage())).apply();
                postNotification("MTP2026 Desktop OS", "Desktop guest import could not complete: " + error.getMessage());
            }
        }, "mtp2026-desktop-guest-import").start();
    }

    private String readAssetText(String path) throws Exception {
        try (InputStream in = getAssets().open(path)) {
            byte[] data = new byte[8192]; int n; StringBuilder out = new StringBuilder();
            while ((n = in.read(data)) != -1) out.append(new String(data, 0, n, java.nio.charset.StandardCharsets.UTF_8));
            return out.toString();
        }
    }

    private void copyAsset(String assetPath, File destination) throws Exception {
        File parent = destination.getParentFile(); if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IllegalStateException("Cannot create guest storage");
        try (InputStream in = getAssets().open(assetPath); OutputStream out = new FileOutputStream(destination)) {
            byte[] buffer = new byte[1024 * 1024]; int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            out.flush();
        }
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
