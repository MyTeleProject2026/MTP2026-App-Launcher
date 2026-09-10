package com.mytele.mtp2026.launcher;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class MainActivity extends Activity {
    private WebView webView;
    private final Set<String> allowedHosts = new HashSet<>();

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
        if (start.getHost() != null) allowedHosts.add(start.getHost().toLowerCase());
        applyImmersive(true);

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

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return route(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return route(Uri.parse(url)); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { super.onReceivedError(view, request, error); }
        });
        webView.loadUrl(BuildConfig.WEB_APP_URL);
    }

    private void applyImmersive(boolean enabled) {
        getWindow().getDecorView().setSystemUiVisibility(enabled ? IMMERSIVE_FLAGS : View.SYSTEM_UI_FLAG_VISIBLE);
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

        @JavascriptInterface public String getCapabilities() {
            return "{\"native\":true,\"orientation\":true,\"fullscreen\":true,\"filesystem\":true,\"notifications\":true,\"clipboard\":true,\"externalApps\":true,\"gamepad\":true}";
        }

        @JavascriptInterface public void enterFullscreen() { runOnUiThread(() -> applyImmersive(true)); }
        @JavascriptInterface public void exitFullscreen() { runOnUiThread(() -> applyImmersive(false)); }
        @JavascriptInterface public void openExternal(String url) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
        }
    }

    private boolean route(Uri uri) {
        String scheme = uri.getScheme(), host = uri.getHost();
        if ("https".equalsIgnoreCase(scheme) && host != null && allowedHosts.contains(host.toLowerCase())) return false;
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) { startActivity(new Intent(Intent.ACTION_VIEW, uri)); return true; }
        return true;
    }
    @Override public void onBackPressed() { if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (webView != null) { webView.loadUrl("about:blank"); webView.stopLoading(); webView.destroy(); webView = null; } super.onDestroy(); }
}
