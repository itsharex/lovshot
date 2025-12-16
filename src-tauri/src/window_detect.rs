use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionaryRef;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::display::{CGWindowListCopyWindowInfo, kCGWindowListOptionOnScreenOnly, kCGNullWindowID};
use serde::{Deserialize, Serialize};

use crate::Region;

/// Extended window info including titlebar height
#[derive(Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub titlebar_height: u32,
}

/// Get the window bounds under the cursor position
/// Returns None if no window found or on error
pub fn get_window_at_position(x: f64, y: f64) -> Option<Region> {
    unsafe {
        let window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
        );

        if window_list.is_null() {
            return None;
        }

        let windows: core_foundation::array::CFArray<CFType> =
            core_foundation::array::CFArray::wrap_under_get_rule(window_list as _);

        // First pass: normal windows only (layer 0)
        // Second pass: Dock (layer 20) - only if no normal window matched
        for target_layer in [0, 20] {
            for i in 0..windows.len() {
                let Some(window) = windows.get(i) else { continue };
                let dict_ref = window.as_CFTypeRef() as CFDictionaryRef;

                // Get window layer
                let layer_key = CFString::new("kCGWindowLayer");
                let layer_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                    dict_ref,
                    layer_key.as_CFTypeRef() as *const _,
                );

                let layer = if !layer_ptr.is_null() {
                    let layer_num: CFNumber = CFNumber::wrap_under_get_rule(layer_ptr as _);
                    layer_num.to_i32().unwrap_or(0)
                } else {
                    0
                };

                if layer != target_layer {
                    continue;
                }

                // Get window bounds
                let bounds_key = CFString::new("kCGWindowBounds");
                let bounds_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                    dict_ref,
                    bounds_key.as_CFTypeRef() as *const _,
                );

                if bounds_ptr.is_null() {
                    continue;
                }

                let bounds_dict = bounds_ptr as CFDictionaryRef;

                let x_key = CFString::new("X");
                let y_key = CFString::new("Y");
                let width_key = CFString::new("Width");
                let height_key = CFString::new("Height");

                let Some(win_x) = get_number_from_dict(bounds_dict, &x_key) else { continue };
                let Some(win_y) = get_number_from_dict(bounds_dict, &y_key) else { continue };
                let Some(win_w) = get_number_from_dict(bounds_dict, &width_key) else { continue };
                let Some(win_h) = get_number_from_dict(bounds_dict, &height_key) else { continue };

                // For Dock (layer 20), use actual visible region from visibleFrame
                if layer == 20 {
                    if let Some(dock_region) = get_dock_region() {
                        // Check if cursor is inside actual Dock bar
                        if x >= dock_region.x as f64
                            && x < (dock_region.x + dock_region.width as i32) as f64
                            && y >= dock_region.y as f64
                            && y < (dock_region.y + dock_region.height as i32) as f64
                        {
                            return Some(dock_region);
                        }
                    }
                    continue;
                }

                // Check if cursor is inside this window
                if x >= win_x && x < win_x + win_w && y >= win_y && y < win_y + win_h {
                    return Some(Region {
                        x: win_x as i32,
                        y: win_y as i32,
                        width: win_w as u32,
                        height: win_h as u32,
                    });
                }
            }
        }

        None
    }
}

/// Get Dock's actual visible region using NSScreen frame vs visibleFrame
fn get_dock_region() -> Option<Region> {
    use objc::{class, msg_send, sel, sel_impl};
    use core_graphics::geometry::CGRect;

    unsafe {
        let ns_screen_class = class!(NSScreen);
        let main_screen: *mut objc::runtime::Object = msg_send![ns_screen_class, mainScreen];
        if main_screen.is_null() {
            return None;
        }

        // frame = full screen, visibleFrame = excludes menu bar and dock
        let frame: CGRect = msg_send![main_screen, frame];
        let visible_frame: CGRect = msg_send![main_screen, visibleFrame];

        let screen_height = frame.size.height;
        let screen_width = frame.size.width;

        // Dock height = difference at bottom (visibleFrame.origin.y > 0 means dock at bottom)
        // Note: macOS coordinate system has origin at bottom-left
        let dock_height = visible_frame.origin.y;

        if dock_height > 0.0 {
            // Dock is at bottom - convert to top-left origin coordinate
            Some(Region {
                x: 0,
                y: (screen_height - dock_height) as i32,
                width: screen_width as u32,
                height: dock_height as u32,
            })
        } else {
            // Dock might be on left/right or auto-hidden, check sides
            let left_dock = visible_frame.origin.x;
            let right_dock = screen_width - (visible_frame.origin.x + visible_frame.size.width);

            if left_dock > 0.0 {
                Some(Region {
                    x: 0,
                    y: 0,
                    width: left_dock as u32,
                    height: screen_height as u32,
                })
            } else if right_dock > 0.0 {
                Some(Region {
                    x: (screen_width - right_dock) as i32,
                    y: 0,
                    width: right_dock as u32,
                    height: screen_height as u32,
                })
            } else {
                None // Dock is auto-hidden
            }
        }
    }
}

unsafe fn get_number_from_dict(dict: CFDictionaryRef, key: &CFString) -> Option<f64> {
    let ptr = core_foundation::dictionary::CFDictionaryGetValue(
        dict,
        key.as_CFTypeRef() as *const _,
    );
    if ptr.is_null() {
        return None;
    }
    let num: CFNumber = CFNumber::wrap_under_get_rule(ptr as _);
    num.to_f64()
}

/// Get the PID of the window at the given position
/// Returns None if no window found
pub fn get_window_pid_at_position(x: f64, y: f64) -> Option<i32> {
    unsafe {
        let window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
        );

        if window_list.is_null() {
            return None;
        }

        let windows: core_foundation::array::CFArray<CFType> =
            core_foundation::array::CFArray::wrap_under_get_rule(window_list as _);

        for i in 0..windows.len() {
            let Some(window) = windows.get(i) else { continue };
            let dict_ref = window.as_CFTypeRef() as CFDictionaryRef;

            // Get window layer - only consider normal windows (layer 0)
            let layer_key = CFString::new("kCGWindowLayer");
            let layer_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                layer_key.as_CFTypeRef() as *const _,
            );

            let layer = if !layer_ptr.is_null() {
                let layer_num: CFNumber = CFNumber::wrap_under_get_rule(layer_ptr as _);
                layer_num.to_i32().unwrap_or(0)
            } else {
                0
            };

            if layer != 0 {
                continue;
            }

            // Get window bounds
            let bounds_key = CFString::new("kCGWindowBounds");
            let bounds_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                bounds_key.as_CFTypeRef() as *const _,
            );

            if bounds_ptr.is_null() {
                continue;
            }

            let bounds_dict = bounds_ptr as CFDictionaryRef;

            let x_key = CFString::new("X");
            let y_key = CFString::new("Y");
            let width_key = CFString::new("Width");
            let height_key = CFString::new("Height");

            let Some(win_x) = get_number_from_dict(bounds_dict, &x_key) else { continue };
            let Some(win_y) = get_number_from_dict(bounds_dict, &y_key) else { continue };
            let Some(win_w) = get_number_from_dict(bounds_dict, &width_key) else { continue };
            let Some(win_h) = get_number_from_dict(bounds_dict, &height_key) else { continue };

            // Check if cursor is inside this window
            if x >= win_x && x < win_x + win_w && y >= win_y && y < win_y + win_h {
                // Get owning application PID
                let pid_key = CFString::new("kCGWindowOwnerPID");
                let pid_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                    dict_ref,
                    pid_key.as_CFTypeRef() as *const _,
                );

                if pid_ptr.is_null() {
                    return None;
                }

                let pid_num: CFNumber = CFNumber::wrap_under_get_rule(pid_ptr as _);
                return pid_num.to_i32();
            }
        }

        None
    }
}

/// Activate an application by its PID
pub fn activate_app_by_pid(pid: i32) -> bool {
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let workspace_class = class!(NSRunningApplication);
        let running_app: *mut objc::runtime::Object = msg_send![
            workspace_class,
            runningApplicationWithProcessIdentifier: pid
        ];

        if !running_app.is_null() {
            // NSApplicationActivateIgnoringOtherApps = 1 << 1 = 2
            let result: bool = msg_send![running_app, activateWithOptions: 2_u64];
            return result;
        }

        false
    }
}

/// Get titlebar height for a window using Accessibility API
/// Returns the height of the titlebar in logical pixels
fn get_titlebar_height_for_window(pid: i32, win_bounds: (f64, f64, f64, f64)) -> u32 {
    use accessibility_sys::*;
    use core_foundation::base::TCFType;
    use std::ptr;

    // AXValueType constants (from macOS Accessibility API)
    const AX_VALUE_CG_POINT_TYPE: u32 = 1;
    const AX_VALUE_CG_SIZE_TYPE: u32 = 2;

    unsafe {
        // Create AXUIElement for the application
        let app_element = AXUIElementCreateApplication(pid);
        if app_element.is_null() {
            return 28; // fallback to standard macOS titlebar height
        }

        // Get the focused/frontmost window
        let mut windows_ref: core_foundation::base::CFTypeRef = ptr::null();
        let attr_name = core_foundation::string::CFString::new("AXWindows");
        let result = AXUIElementCopyAttributeValue(
            app_element,
            attr_name.as_concrete_TypeRef(),
            &mut windows_ref,
        );

        core_foundation::base::CFRelease(app_element as _);

        if result != 0 || windows_ref.is_null() {
            return 28;
        }

        let windows: core_foundation::array::CFArray<core_foundation::base::CFType> =
            core_foundation::array::CFArray::wrap_under_create_rule(windows_ref as _);

        let (win_x, win_y, win_w, win_h) = win_bounds;

        // Find the window that matches our bounds
        for i in 0..windows.len() {
            let Some(window) = windows.get(i) else { continue };
            let window_ref = window.as_CFTypeRef() as AXUIElementRef;

            // Get window position
            let mut position_ref: core_foundation::base::CFTypeRef = ptr::null();
            let pos_attr = core_foundation::string::CFString::new("AXPosition");
            if AXUIElementCopyAttributeValue(window_ref, pos_attr.as_concrete_TypeRef(), &mut position_ref) != 0 {
                continue;
            }

            let mut point = core_graphics::geometry::CGPoint { x: 0.0, y: 0.0 };
            if !AXValueGetValue(position_ref as AXValueRef, AX_VALUE_CG_POINT_TYPE, &mut point as *mut _ as *mut _) {
                core_foundation::base::CFRelease(position_ref);
                continue;
            }
            core_foundation::base::CFRelease(position_ref);

            // Get window size
            let mut size_ref: core_foundation::base::CFTypeRef = ptr::null();
            let size_attr = core_foundation::string::CFString::new("AXSize");
            if AXUIElementCopyAttributeValue(window_ref, size_attr.as_concrete_TypeRef(), &mut size_ref) != 0 {
                continue;
            }

            let mut size = core_graphics::geometry::CGSize { width: 0.0, height: 0.0 };
            if !AXValueGetValue(size_ref as AXValueRef, AX_VALUE_CG_SIZE_TYPE, &mut size as *mut _ as *mut _) {
                core_foundation::base::CFRelease(size_ref);
                continue;
            }
            core_foundation::base::CFRelease(size_ref);

            // Check if this window matches our bounds (with small tolerance)
            let tolerance = 2.0;
            if (point.x - win_x).abs() > tolerance || (point.y - win_y).abs() > tolerance {
                continue;
            }
            if (size.width - win_w).abs() > tolerance || (size.height - win_h).abs() > tolerance {
                continue;
            }

            // Found matching window, now get its content area via AXRole children
            // Try to find the toolbar or content area
            let mut role_ref: core_foundation::base::CFTypeRef = ptr::null();
            let role_attr = core_foundation::string::CFString::new("AXRole");
            if AXUIElementCopyAttributeValue(window_ref, role_attr.as_concrete_TypeRef(), &mut role_ref) == 0 {
                core_foundation::base::CFRelease(role_ref);
            }

            // Get children to find content area or toolbar
            let mut children_ref: core_foundation::base::CFTypeRef = ptr::null();
            let children_attr = core_foundation::string::CFString::new("AXChildren");
            if AXUIElementCopyAttributeValue(window_ref, children_attr.as_concrete_TypeRef(), &mut children_ref) != 0 {
                // Can't get children, use standard height
                return 28;
            }

            let children: core_foundation::array::CFArray<core_foundation::base::CFType> =
                core_foundation::array::CFArray::wrap_under_create_rule(children_ref as _);

            let mut content_top = win_y + size.height; // Start from bottom

            for j in 0..children.len() {
                let Some(child) = children.get(j) else { continue };
                let child_ref = child.as_CFTypeRef() as AXUIElementRef;

                // Check role of child
                let mut child_role_ref: core_foundation::base::CFTypeRef = ptr::null();
                if AXUIElementCopyAttributeValue(child_ref, role_attr.as_concrete_TypeRef(), &mut child_role_ref) != 0 {
                    continue;
                }

                let role_str: core_foundation::string::CFString =
                    core_foundation::string::CFString::wrap_under_create_rule(child_role_ref as _);
                let role = role_str.to_string();

                // Skip titlebar-like elements, find content areas
                // AXToolbar, AXGroup (content), AXSplitGroup, AXScrollArea are typical content elements
                if role == "AXToolbar" || role == "AXGroup" || role == "AXSplitGroup"
                   || role == "AXScrollArea" || role == "AXWebArea" {
                    // Get position of this child
                    let mut child_pos_ref: core_foundation::base::CFTypeRef = ptr::null();
                    if AXUIElementCopyAttributeValue(child_ref, pos_attr.as_concrete_TypeRef(), &mut child_pos_ref) == 0 {
                        let mut child_point = core_graphics::geometry::CGPoint { x: 0.0, y: 0.0 };
                        if AXValueGetValue(child_pos_ref as AXValueRef, AX_VALUE_CG_POINT_TYPE, &mut child_point as *mut _ as *mut _) {
                            // Track the topmost content element
                            if child_point.y < content_top {
                                content_top = child_point.y;
                            }
                        }
                        core_foundation::base::CFRelease(child_pos_ref);
                    }
                }
            }

            // Titlebar height = distance from window top to content top
            let titlebar_height = (content_top - win_y).max(0.0) as u32;

            // Sanity check: titlebar should be between 0 and 100 pixels
            if titlebar_height > 0 && titlebar_height < 100 {
                return titlebar_height;
            }
            return 28; // fallback
        }

        28 // fallback
    }
}

/// Get window info at cursor position including titlebar height
pub fn get_window_info_at_position(x: f64, y: f64) -> Option<WindowInfo> {
    unsafe {
        let window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
        );

        if window_list.is_null() {
            return None;
        }

        let windows: core_foundation::array::CFArray<CFType> =
            core_foundation::array::CFArray::wrap_under_get_rule(window_list as _);

        // First pass: normal windows only (layer 0)
        for i in 0..windows.len() {
            let Some(window) = windows.get(i) else { continue };
            let dict_ref = window.as_CFTypeRef() as CFDictionaryRef;

            // Get window layer
            let layer_key = CFString::new("kCGWindowLayer");
            let layer_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                layer_key.as_CFTypeRef() as *const _,
            );

            let layer = if !layer_ptr.is_null() {
                let layer_num: CFNumber = CFNumber::wrap_under_get_rule(layer_ptr as _);
                layer_num.to_i32().unwrap_or(0)
            } else {
                0
            };

            if layer != 0 {
                continue;
            }

            // Get window bounds
            let bounds_key = CFString::new("kCGWindowBounds");
            let bounds_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                bounds_key.as_CFTypeRef() as *const _,
            );

            if bounds_ptr.is_null() {
                continue;
            }

            let bounds_dict = bounds_ptr as CFDictionaryRef;

            let x_key = CFString::new("X");
            let y_key = CFString::new("Y");
            let width_key = CFString::new("Width");
            let height_key = CFString::new("Height");

            let Some(win_x) = get_number_from_dict(bounds_dict, &x_key) else { continue };
            let Some(win_y) = get_number_from_dict(bounds_dict, &y_key) else { continue };
            let Some(win_w) = get_number_from_dict(bounds_dict, &width_key) else { continue };
            let Some(win_h) = get_number_from_dict(bounds_dict, &height_key) else { continue };

            // Check if cursor is inside this window
            if x >= win_x && x < win_x + win_w && y >= win_y && y < win_y + win_h {
                // Get PID
                let pid_key = CFString::new("kCGWindowOwnerPID");
                let pid_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                    dict_ref,
                    pid_key.as_CFTypeRef() as *const _,
                );

                let titlebar_height = if !pid_ptr.is_null() {
                    let pid_num: CFNumber = CFNumber::wrap_under_get_rule(pid_ptr as _);
                    if let Some(pid) = pid_num.to_i32() {
                        get_titlebar_height_for_window(pid, (win_x, win_y, win_w, win_h))
                    } else {
                        28
                    }
                } else {
                    28
                };

                return Some(WindowInfo {
                    x: win_x as i32,
                    y: win_y as i32,
                    width: win_w as u32,
                    height: win_h as u32,
                    titlebar_height,
                });
            }
        }

        None
    }
}

/// Activate the app that owns the window under cursor
/// This makes the underlying window receive scroll events
pub fn activate_window_at_position(x: f64, y: f64) -> bool {
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
        );

        if window_list.is_null() {
            return false;
        }

        let windows: core_foundation::array::CFArray<CFType> =
            core_foundation::array::CFArray::wrap_under_get_rule(window_list as _);

        for i in 0..windows.len() {
            let Some(window) = windows.get(i) else { continue };
            let dict_ref = window.as_CFTypeRef() as CFDictionaryRef;

            // Get window layer - only consider normal windows (layer 0)
            let layer_key = CFString::new("kCGWindowLayer");
            let layer_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                layer_key.as_CFTypeRef() as *const _,
            );

            let layer = if !layer_ptr.is_null() {
                let layer_num: CFNumber = CFNumber::wrap_under_get_rule(layer_ptr as _);
                layer_num.to_i32().unwrap_or(0)
            } else {
                0
            };

            if layer != 0 {
                continue;
            }

            // Get window bounds
            let bounds_key = CFString::new("kCGWindowBounds");
            let bounds_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                bounds_key.as_CFTypeRef() as *const _,
            );

            if bounds_ptr.is_null() {
                continue;
            }

            let bounds_dict = bounds_ptr as CFDictionaryRef;

            let x_key = CFString::new("X");
            let y_key = CFString::new("Y");
            let width_key = CFString::new("Width");
            let height_key = CFString::new("Height");

            let Some(win_x) = get_number_from_dict(bounds_dict, &x_key) else { continue };
            let Some(win_y) = get_number_from_dict(bounds_dict, &y_key) else { continue };
            let Some(win_w) = get_number_from_dict(bounds_dict, &width_key) else { continue };
            let Some(win_h) = get_number_from_dict(bounds_dict, &height_key) else { continue };

            // Check if cursor is inside this window
            if x >= win_x && x < win_x + win_w && y >= win_y && y < win_y + win_h {
                // Get owning application PID
                let pid_key = CFString::new("kCGWindowOwnerPID");
                let pid_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                    dict_ref,
                    pid_key.as_CFTypeRef() as *const _,
                );

                if pid_ptr.is_null() {
                    return false;
                }

                let pid_num: CFNumber = CFNumber::wrap_under_get_rule(pid_ptr as _);
                let Some(pid) = pid_num.to_i32() else { return false };

                // Activate the application using NSRunningApplication
                let workspace_class = class!(NSRunningApplication);
                let running_app: *mut objc::runtime::Object = msg_send![
                    workspace_class,
                    runningApplicationWithProcessIdentifier: pid
                ];

                if !running_app.is_null() {
                    // NSApplicationActivateIgnoringOtherApps = 1 << 1 = 2
                    let _: bool = msg_send![running_app, activateWithOptions: 2_u64];
                    return true;
                }

                return false;
            }
        }

        false
    }
}
