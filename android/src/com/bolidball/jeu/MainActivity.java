package com.bolidball.jeu;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Coquille Android de Bolid'Ball : une WebView plein écran qui sert le jeu depuis les assets de l'APK.
 * Les fichiers sont exposés sous une origine https locale (requêtes interceptées, aucun accès réseau)
 * car les modules ES et le localStorage ne fonctionnent pas correctement en file://.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.bolidball";
    private static final String BASE = "https://" + HOST + "/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(13, 18, 48));
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new AssetClient());
        setContentView(webView);
        hideSystemBars();

        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(BASE + "index.html?nosw");
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        // le jeu se met en pause et sauvegarde via l'événement visibilitychange
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        hideSystemBars();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    /** Bouton Retour : pause en match, écran précédent dans les menus, sinon on quitte. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        String js = "(function(){var a=window.__bolid;if(!a)return false;"
                + "if(a.session&&!a.demo&&!a.resultShown){if(a.paused)a.resume();else a.pause();return true;}"
                + "if(a.resultShown){a.toMenu();return true;}"
                + "if(a.ui.current&&a.ui.current!=='menu'){a.ui.back();return true;}"
                + "return false;})()";
        webView.evaluateJavascript(js, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    private static final Map<String, String> MIME = new HashMap<String, String>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
    }

    /** Sert les fichiers du jeu depuis assets/www/ pour l'origine https locale. */
    private class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!HOST.equals(request.getUrl().getHost())) {
                // aucun accès réseau externe n'est nécessaire au jeu
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
            }
            String path = request.getUrl().getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            if (path.contains("..")) return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, null);
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            try {
                InputStream in = getAssets().open("www" + path);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                headers.put("Access-Control-Allow-Origin", BASE.substring(0, BASE.length() - 1));
                return new WebResourceResponse(mime, "utf-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !HOST.equals(request.getUrl().getHost());
        }
    }
}
