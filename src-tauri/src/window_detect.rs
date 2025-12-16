use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionaryRef;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::display::{CGWindowListCopyWindowInfo, kCGWindowListOptionOnScreenOnly, kCGNullWindowID};

use crate::Region;

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
