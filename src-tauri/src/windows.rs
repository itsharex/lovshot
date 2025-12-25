use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Set macOS activation policy
/// policy: 0 = Regular (normal app, shows in Dock when windows open)
///         1 = Accessory (menu bar app, no Dock icon)
#[cfg(target_os = "macos")]
pub fn set_activation_policy(policy: i64) {
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let ns_app: *mut objc::runtime::Object =
            msg_send![class!(NSApplication), sharedApplication];

        let _: () = msg_send![ns_app, setActivationPolicy: policy];

        // Set dock icon after switching to regular mode
        if policy == 0 {
            set_dock_icon();
        }
    }
}

/// Set the dock icon from bundled icon file
#[cfg(target_os = "macos")]
fn set_dock_icon() {
    use cocoa::appkit::NSImage;
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSData, NSString};
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let ns_app: id = msg_send![class!(NSApplication), sharedApplication];

        // Try to load icon from resources
        let icon_paths = [
            "icons/icon.icns",
            "icons/128x128@2x.png",
            "icons/128x128.png",
        ];

        for icon_path in &icon_paths {
            // Try bundled resource path first
            let bundle: id = msg_send![class!(NSBundle), mainBundle];
            let resource_path: id = msg_send![bundle, resourcePath];

            if resource_path != nil {
                let path_str = NSString::alloc(nil).init_str(icon_path);
                let full_path: id = msg_send![resource_path, stringByAppendingPathComponent: path_str];
                let image: id = msg_send![class!(NSImage), alloc];
                let image: id = msg_send![image, initWithContentsOfFile: full_path];

                if image != nil {
                    let _: () = msg_send![ns_app, setApplicationIconImage: image];
                    println!("[dock] Set dock icon from bundle: {}", icon_path);
                    return;
                }
            }

            // Try relative path (for dev mode)
            let cwd = std::env::current_dir().ok();
            if let Some(cwd) = cwd {
                println!("[dock] cwd: {:?}", cwd);
                // Try both with and without src-tauri prefix
                let paths_to_try = [
                    cwd.join("src-tauri").join(icon_path),
                    cwd.join(icon_path),
                ];
                for dev_path in &paths_to_try {
                    println!("[dock] Trying dev path: {:?} exists={}", dev_path, dev_path.exists());
                    if dev_path.exists() {
                        if let Ok(bytes) = std::fs::read(dev_path) {
                            let data: id = NSData::dataWithBytes_length_(
                                nil,
                                bytes.as_ptr() as *const std::os::raw::c_void,
                                bytes.len() as u64,
                            );
                            let image: id = NSImage::initWithData_(NSImage::alloc(nil), data);
                            if image != nil {
                                let _: () = msg_send![ns_app, setApplicationIconImage: image];
                                println!("[dock] Set dock icon from dev path: {:?}", dev_path);
                                return;
                            }
                        }
                    }
                }
            }
        }

        println!("[dock] Warning: Could not find icon file");
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_activation_policy(_policy: i64) {}

/// Open the settings window
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_app: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("/settings.html".into()))
        .title("Lovshot Settings")
        .inner_size(400.0, 380.0)
        .min_inner_size(320.0, 300.0)
        .resizable(true)
        .center()
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}

/// Open the GIF editor window
pub fn open_editor_window(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_app: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    // Always create a new editor window (don't reuse)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let window_label = format!("editor-{}", timestamp);

    let win = WebviewWindowBuilder::new(app, &window_label, WebviewUrl::App("/editor.html".into()))
        .title("Lovshot GIF Editor")
        .inner_size(360.0, 620.0)
        .min_inner_size(320.0, 400.0)
        .resizable(true)
        .center()
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}

/// Open the permission request window
pub fn open_permission_window(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_app: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    // Set to regular app mode so the window is visible
    set_activation_policy(0);

    if let Some(win) = app.get_webview_window("permission") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(app, "permission", WebviewUrl::App("/permission.html".into()))
        .title("Lovshot - 需要屏幕录制权限")
        .inner_size(480.0, 400.0)
        .resizable(false)
        .center()
        .focused(true)
        .closable(false)  // User must grant permission or quit
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}

/// Open the screenshot preview window (bottom-right corner, auto-close)
pub fn open_preview_window(app: &AppHandle, image_path: &str) -> Result<(), String> {
    println!("[preview] Opening preview window for: {}", image_path);

    // Close existing preview window if any
    if let Some(win) = app.get_webview_window("preview") {
        println!("[preview] Closing existing preview window");
        let _ = win.destroy();
    }

    // Get screen size to position window in bottom-right
    let monitors = app.available_monitors().map_err(|e| {
        println!("[preview] Failed to get monitors: {}", e);
        e.to_string()
    })?;
    let primary = monitors.into_iter().next();
    let (screen_w, screen_h) = if let Some(m) = primary {
        let size = m.size();
        let scale = m.scale_factor();
        // Convert physical pixels to logical pixels
        let logical_w = size.width as f64 / scale;
        let logical_h = size.height as f64 / scale;
        println!("[preview] Screen: {}x{} physical, {}x{} logical (scale {})",
            size.width, size.height, logical_w, logical_h, scale);
        (logical_w, logical_h)
    } else {
        println!("[preview] No monitor found, using default 1920x1080");
        (1920.0, 1080.0)
    };

    let win_w = 220.0;
    let win_h = 180.0;
    let margin = 20.0;
    let x = screen_w - win_w - margin;
    let y = screen_h - win_h - margin - 50.0; // 50px for dock
    println!("[preview] Window position: ({}, {})", x, y);

    let url = format!("/preview.html?path={}", urlencoding::encode(image_path));
    println!("[preview] URL: {}", url);

    let win = WebviewWindowBuilder::new(app, "preview", WebviewUrl::App(url.into()))
        .title("")
        .inner_size(win_w, win_h)
        .position(x, y)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| {
            println!("[preview] Failed to create window: {}", e);
            e.to_string()
        })?;

    println!("[preview] Window created, showing...");

    // On macOS, we need to ensure the window is visible without activating the app
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_win: *mut objc::runtime::Object = win.ns_window().unwrap() as *mut _;
            // Set window level to floating (above normal windows)
            let _: () = msg_send![ns_win, setLevel: 3_i64]; // NSFloatingWindowLevel
            let _: () = msg_send![ns_win, orderFrontRegardless];
        }
    }

    let _ = win.show();

    // Auto-close after 3 seconds
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        if let Some(win) = app_clone.get_webview_window("preview") {
            println!("[preview] Auto-closing preview window");
            let _ = win.destroy();
        }
    });

    Ok(())
}

/// Open the about window
pub fn open_about_window(app: AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_app: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    if let Some(win) = app.get_webview_window("about") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, "about", WebviewUrl::App("/about.html".into()))
        .title("About Lovshot")
        .inner_size(400.0, 360.0)
        .resizable(false)
        .center()
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}

/// Open the caption preview window (centered, with input for description)
pub fn open_caption_window(app: &AppHandle, image_path: &str) -> Result<(), String> {
    println!("[caption] Opening caption window for: {}", image_path);

    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        unsafe {
            let ns_app: *mut objc::runtime::Object =
                msg_send![class!(NSApplication), sharedApplication];
            let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
        }
    }

    // Use unique label to avoid conflicts
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let window_label = format!("caption-{}", timestamp);

    let win_w = 480.0;
    let win_h = 400.0;

    let url = format!("/preview.html?path={}&mode=caption", urlencoding::encode(image_path));
    println!("[caption] URL: {}", url);

    let win = WebviewWindowBuilder::new(app, &window_label, WebviewUrl::App(url.into()))
        .title("添加描述")
        .inner_size(win_w, win_h)
        .min_inner_size(360.0, 300.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .center()
        .focused(true)
        .build()
        .map_err(|e| {
            println!("[caption] Failed to create window: {}", e);
            e.to_string()
        })?;

    let _ = win.show();
    let _ = win.set_focus();

    Ok(())
}
