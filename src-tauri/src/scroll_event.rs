//! macOS scroll event listener using CGEventTap
//!
//! Listens for global scroll wheel events and triggers capture when scrolling occurs.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType, EventField,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::SharedState;
use crate::types::ScrollCaptureProgress;

/// Global flag to control the event tap
static SCROLL_LISTENER_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Perform a single scroll capture iteration
fn do_scroll_capture(
    state: &SharedState,
    expected_direction: i32,
    delta_y: f64,
    use_fixed_delta: bool,
) -> Option<ScrollCaptureProgress> {
    use crate::capture::Screen;
    use crate::commands::{generate_preview_base64, stitch_scroll_image};
    use crate::fft_match::detect_scroll_delta_fft;
    use image::RgbaImage;

    // Get required data with minimal lock time
    let (region, last_frame, scroll_stitched) = {
        let s = state.lock().ok()?;
        if !s.scroll_capturing {
            return None;
        }
        (
            s.region.clone()?,
            s.scroll_frames.last().cloned()?,
            s.scroll_stitched.clone()?,
        )
    };

    // Capture new frame
    let screens = Screen::all().ok()?;
    let screen = screens.first()?;
    let captured = screen
        .capture_area(region.x, region.y, region.width, region.height)
        .ok()?;

    let new_frame = RgbaImage::from_raw(captured.width(), captured.height(), captured.into_raw())?;

    // Detect scroll delta
    let delta_scale = delta_y.abs().max(1.0);
    let max_delta = if use_fixed_delta {
        (delta_scale * 1.5).clamp(24.0, 400.0) as i32
    } else {
        (delta_scale * 20.0).clamp(24.0, 200.0) as i32
    };
    println!(
        "[scroll_event] capture attempt: delta {:.2}, max_delta {}, dir {}",
        delta_y, max_delta, expected_direction
    );
    let scroll_delta =
        detect_scroll_delta_fft(&last_frame, &new_frame, expected_direction, Some(max_delta));
    if scroll_delta == 0 {
        println!("[scroll_event] no match (delta=0)");
        return None;
    }
    println!("[scroll_event] match delta {}", scroll_delta);

    // Stitch the image
    let stitched = stitch_scroll_image(&scroll_stitched, &new_frame, scroll_delta).ok()?;

    // Calculate new offset
    let last_offset = {
        let s = state.lock().ok()?;
        *s.scroll_offsets.last().unwrap_or(&0)
    };
    let new_offset = last_offset + scroll_delta;

    // Generate preview
    let preview = generate_preview_base64(&stitched, 600).ok()?;

    // Update state
    let mut s = state.lock().ok()?;
    if !s.scroll_capturing {
        return None;
    }

    s.scroll_frames.push(new_frame);
    s.scroll_offsets.push(new_offset);
    s.scroll_stitched = Some(stitched);

    let frame_count = s.scroll_frames.len();
    let total_height = s.scroll_stitched.as_ref()?.height();

    Some(ScrollCaptureProgress {
        frame_count,
        total_height,
        preview_base64: preview,
    })
}

/// Start listening for global scroll events
pub fn start_scroll_listener(app: AppHandle) {
    if SCROLL_LISTENER_ACTIVE.swap(true, Ordering::SeqCst) {
        println!("[scroll_event] Listener already active");
        return;
    }

    thread::spawn(move || {
        println!("[scroll_event] Starting global scroll listener");

        // Debounce state - only process one scroll event per ~80ms
        let last_capture = Arc::new(std::sync::Mutex::new(
            Instant::now() - Duration::from_millis(200),
        ));
        let last_capture_clone = last_capture.clone();
        let app_clone = app.clone();
        let scroll_accum = Arc::new(std::sync::Mutex::new(0.0f64));
        let scroll_dir = Arc::new(std::sync::Mutex::new(0i32));
        let scroll_accum_clone = scroll_accum.clone();
        let scroll_dir_clone = scroll_dir.clone();

        // Create event tap for scroll wheel events
        let tap = CGEventTap::new(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::ScrollWheel],
            move |_proxy, _event_type, event| {
                if !SCROLL_LISTENER_ACTIVE.load(Ordering::Relaxed) {
                    return None;
                }

                // Get scroll delta
                let point_delta = event
                    .get_double_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1);
                let fixed_delta = event
                    .get_double_value_field(EventField::SCROLL_WHEEL_EVENT_FIXED_POINT_DELTA_AXIS_1);
                let is_continuous = event
                    .get_integer_value_field(EventField::SCROLL_WHEEL_EVENT_IS_CONTINUOUS);
                // Only process if there's actual vertical movement
                let (delta_y, use_fixed_delta) = if fixed_delta.abs() > 0.1 {
                    (fixed_delta, true)
                } else {
                    (point_delta, false)
                };
                let delta_sign = if delta_y < 0.0 { -1 } else { 1 };
                let threshold = if is_continuous != 0 { 2.5 } else { 1.0 };

                if delta_y.abs() > 0.1 {
                    let mut accum = scroll_accum_clone.lock().unwrap();
                    let mut dir = scroll_dir_clone.lock().unwrap();
                    if *dir != 0 && *dir != delta_sign {
                        *accum = 0.0;
                    }
                    *dir = delta_sign;
                    *accum += delta_y;
                    let accum_snapshot = *accum;
                    println!(
                        "[scroll_event] wheel point {:.2} fixed {:.2} cont {} accum {:.2}",
                        point_delta, fixed_delta, is_continuous, accum_snapshot
                    );

                    if accum_snapshot.abs() < threshold {
                        return None;
                    }
                    *accum = 0.0;

                    let mut last = last_capture_clone.lock().unwrap();
                    let now = Instant::now();

                    // Debounce: wait 80ms between captures for FFT to process
                    if now.duration_since(*last) >= Duration::from_millis(80) {
                        *last = now;
                        drop(last);

                        if let Some(state) = app_clone.try_state::<SharedState>() {
                            let expected_direction = if delta_y < 0.0 { 1 } else { -1 };
                            if let Some(progress) =
                                do_scroll_capture(&state, expected_direction, accum_snapshot, use_fixed_delta)
                            {
                                let _ = app_clone.emit("scroll-preview-update", &progress);
                                println!(
                                    "[scroll_event] Captured frame {}, height {}, delta_y {:.2}",
                                    progress.frame_count, progress.total_height, accum_snapshot
                                );
                            }
                        }
                    }
                }

                None
            },
        );

        match tap {
            Ok(tap) => {
                let source = tap
                    .mach_port
                    .create_runloop_source(0)
                    .expect("Failed to create run loop source");

                unsafe {
                    let run_loop = CFRunLoop::get_current();
                    run_loop.add_source(&source, kCFRunLoopDefaultMode);
                    tap.enable();
                    let _ = app.emit("scroll-listener-started", ());

                    println!("[scroll_event] Scroll listener started successfully");

                    while SCROLL_LISTENER_ACTIVE.load(Ordering::Relaxed) {
                        CFRunLoop::run_in_mode(
                            kCFRunLoopDefaultMode,
                            Duration::from_millis(100),
                            false,
                        );
                    }

                    run_loop.remove_source(&source, kCFRunLoopDefaultMode);
                }

                println!("[scroll_event] Scroll listener stopped");
            }
            Err(e) => {
                eprintln!("[scroll_event] Failed to create event tap: {:?}", e);
                eprintln!("[scroll_event] This requires Accessibility permission");
                SCROLL_LISTENER_ACTIVE.store(false, Ordering::Relaxed);
                let _ = app.emit("scroll-listener-failed", ());
            }
        }
    });
}

/// Stop the global scroll listener
pub fn stop_scroll_listener() {
    println!("[scroll_event] Stopping scroll listener");
    SCROLL_LISTENER_ACTIVE.store(false, Ordering::SeqCst);
}
