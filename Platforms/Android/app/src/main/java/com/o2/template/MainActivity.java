package com.o2.template;

import android.os.Build;
import android.os.Bundle;
import android.view.RoundedCorner;
import android.view.WindowInsets;
import android.view.WindowManager;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public final class MainActivity extends AppCompatActivity {
    private GLView glView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // The game draws under the cutout and the hidden system bars; the safe area tells it where they are
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }

        glView = new GLView(this, getAssets(), getFilesDir().getAbsolutePath());
        setContentView(glView);

        ViewCompat.setOnApplyWindowInsetsListener(glView, (view, insets) -> {
            reportSafeArea(insets);
            return insets;
        });

        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus)
            hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    // The cutout, the bars that stay on screen and the rounded corners, in pixels as the surface
    private void reportSafeArea(WindowInsetsCompat insets) {
        Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        int left = safe.left, top = safe.top, right = safe.right, bottom = safe.bottom;

        if (Build.VERSION.SDK_INT >= 31) {
            WindowInsets platform = insets.toWindowInsets();
            if (platform != null) {
                top = Math.max(top, Math.max(cornerInset(platform, RoundedCorner.POSITION_TOP_LEFT),
                                             cornerInset(platform, RoundedCorner.POSITION_TOP_RIGHT)));
                bottom = Math.max(bottom, Math.max(cornerInset(platform, RoundedCorner.POSITION_BOTTOM_LEFT),
                                                   cornerInset(platform, RoundedCorner.POSITION_BOTTOM_RIGHT)));
            }
        }

        final float l = left, t = top, r = right, b = bottom;
        glView.queueEvent(() -> NativeBridge.safeArea(l, t, r, b));
    }

    // How far a rounded corner reaches along the edges where a control would lose its corner to it
    private static int cornerInset(WindowInsets insets, int position) {
        if (Build.VERSION.SDK_INT < 31)
            return 0;

        RoundedCorner corner = insets.getRoundedCorner(position);
        return corner != null ? Math.round(corner.getRadius()*0.3f) : 0;
    }

    @Override
    protected void onPause() {
        super.onPause();
        glView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        glView.onResume();
    }
}
