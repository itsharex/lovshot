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
        // Get all on-screen windows
        let window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID,
        );

        if window_list.is_null() {
            return None;
        }

        let windows: core_foundation::array::CFArray<CFType> =
            core_foundation::array::CFArray::wrap_under_get_rule(window_list as _);

        // Iterate through windows (front to back order)
        for i in 0..windows.len() {
            let window = windows.get(i)?;
            let dict_ref = window.as_CFTypeRef() as CFDictionaryRef;

            // Get window layer - skip windows with layer > 0 (menu bar, dock, etc.)
            let layer_key = CFString::new("kCGWindowLayer");
            let layer_ptr = core_foundation::dictionary::CFDictionaryGetValue(
                dict_ref,
                layer_key.as_CFTypeRef() as *const _,
            );
            if !layer_ptr.is_null() {
                let layer_num: CFNumber = CFNumber::wrap_under_get_rule(layer_ptr as _);
                if let Some(layer) = layer_num.to_i32() {
                    if layer != 0 {
                        continue; // Skip non-normal windows
                    }
                }
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

            // Parse bounds dictionary
            let bounds_dict = bounds_ptr as CFDictionaryRef;

            let x_key = CFString::new("X");
            let y_key = CFString::new("Y");
            let width_key = CFString::new("Width");
            let height_key = CFString::new("Height");

            let win_x = get_number_from_dict(bounds_dict, &x_key)?;
            let win_y = get_number_from_dict(bounds_dict, &y_key)?;
            let win_w = get_number_from_dict(bounds_dict, &width_key)?;
            let win_h = get_number_from_dict(bounds_dict, &height_key)?;

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

        None
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
