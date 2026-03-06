"""
이미지 매칭 확률 분석 대시보드
Sophia Hub OCR/이미지 매칭 세션 결과를 분석합니다.
포트: 8510

후처리 모드: OpenCV 템플릿 매칭으로 캡처 이미지에서 레퍼런스를 탐지합니다.
"""

import json
import os
import base64
import argparse
from pathlib import Path
from datetime import datetime
from io import BytesIO
from collections import Counter

import streamlit as st
import plotly.express as px
import pandas as pd
import numpy as np
import cv2


def cv2_imread(path: str, flags=cv2.IMREAD_COLOR) -> np.ndarray | None:
    """cv2.imread wrapper that handles Korean/Unicode file paths on Windows."""
    try:
        buf = np.fromfile(path, dtype=np.uint8)
        return cv2.imdecode(buf, flags)
    except Exception:
        return None

# --- Args ---
parser = argparse.ArgumentParser()
parser.add_argument("--session", type=str, default=None, help="세션 JSON 파일 경로")
parser.add_argument("--port", type=int, default=8510)
args, _ = parser.parse_known_args()

SESSIONS_DIR = Path.home() / ".claude" / "match-sessions"
REFS_DIR = Path.home() / ".claude" / "match-refs"

DARK_BG = "rgba(0,0,0,0)"
GRID_COLOR = "#222"
CHART_LAYOUT = dict(
    paper_bgcolor=DARK_BG, plot_bgcolor=DARK_BG,
    font=dict(color="#f0f0f0", size=14),
    margin=dict(t=20, b=60),
)

PER_PAGE = 20  # captures per page

# --- Page Config ---
st.set_page_config(
    page_title="이미지 매칭 분석",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    [data-testid="stSidebar"] { background: #1a1a2e; }
    .stApp { background: #0f0f1a; color: #e0e0e0; }
    h1, h2, h3 { color: #e0e0e0 !important; }
    p, span, label, div { color: #d0d0d0; }
    .stMarkdown, .stCaption, [data-testid="stCaptionContainer"] { color: #ccc !important; }
    [data-testid="stCaptionContainer"] p { color: #ccc !important; font-size: 13px !important; }
    .metric-card {
        background: #1a1a2e; border-radius: 12px; padding: 20px;
        border: 1px solid #2a2a4a; text-align: center;
    }
    .metric-value { font-size: 32px; font-weight: 700; color: #0A84FF; }
    .metric-label { font-size: 14px; color: #aaa; margin-top: 6px; }
    .ref-card {
        background: #1a1a2e; border-radius: 10px; padding: 16px;
        border: 1px solid #2a2a4a; text-align: center;
    }
    .ref-card img { border-radius: 6px; max-width: 80px; max-height: 80px; margin-bottom: 8px; }
    .ref-name { font-size: 16px; font-weight: 600; color: #e0e0e0; }
    .ref-count { font-size: 26px; font-weight: 700; color: #0A84FF; margin: 6px 0; }
    .ref-rate { font-size: 15px; color: #30D158; font-weight: 600; }
    .cap-info {
        background: #1a1a2e; border-radius: 8px; padding: 8px 10px; margin-top: 6px;
        border: 1px solid #2a2a4a; font-size: 13px; color: #ccc; line-height: 1.6;
    }
    .cap-info .run-num { font-weight: 700; color: #0A84FF; font-size: 14px; }
    .cap-info .det-item { display: inline-block; padding: 2px 6px; border-radius: 4px;
        background: #2a2a4a; margin: 2px; font-size: 12px; color: #e0e0e0; }
    /* dataframe */
    [data-testid="stDataFrame"] { color: #e0e0e0 !important; }
    /* sidebar text */
    [data-testid="stSidebar"] p, [data-testid="stSidebar"] span,
    [data-testid="stSidebar"] label { color: #ccc !important; }
    /* inputs */
    input, select, textarea { color: #e0e0e0 !important; }
</style>
""", unsafe_allow_html=True)


# ==============================================================
# 2-Stage Hybrid Engine: Template Detection → Text+Color Classification
# ==============================================================
# Stage 1: Template matching (누끼) to find card LOCATIONS
# Stage 2: OCR text + color histogram to CLASSIFY each detection
#
# This prevents false positives (stage 1 filters non-cards)
# and prevents misclassification (stage 2 identifies correctly)

import easyocr

@st.cache_resource
def get_ocr_reader():
    """Lazy-init EasyOCR reader (English only, lightweight)."""
    return easyocr.Reader(["en"], gpu=False, verbose=False)


def _refs_mtime(macro_id: str) -> float:
    """Get refs.json modification time for cache busting."""
    refs_json = REFS_DIR / macro_id / "refs.json"
    try:
        return refs_json.stat().st_mtime if refs_json.exists() else 0.0
    except Exception:
        return 0.0


@st.cache_data
def load_ref_cv_images(macro_id: str, _mtime: float = 0.0) -> list[dict]:
    """Load reference images with pre-extracted text + color fingerprints."""
    ref_dir = REFS_DIR / macro_id
    refs = []
    if not ref_dir.exists():
        return refs
    refs_json = ref_dir / "refs.json"
    if not refs_json.exists():
        return refs
    try:
        meta = json.loads(refs_json.read_text(encoding="utf-8"))
    except Exception:
        return refs

    for item in meta:
        img_path = Path(item["imagePath"])
        if not img_path.exists():
            continue
        img = cv2_imread(str(img_path))
        if img is None:
            continue

        ref_hist = compute_color_fingerprint(img)
        border_hist = compute_border_fingerprint(img)
        # Pre-compute border edge color (HSV median) for direct color comparison
        border_color = extract_border_color(img)

        refs.append({
            "id": item["id"],
            "name": item["name"],
            "image": img,
            "path": str(img_path),
            "color_hist": ref_hist,
            "border_hist": border_hist,
            "border_color": border_color,
        })
    return refs


def extract_text(img: np.ndarray, reader=None) -> str:
    """Extract text from image using EasyOCR. Returns uppercase cleaned text."""
    if reader is None:
        reader = get_ocr_reader()
    try:
        results = reader.readtext(img, detail=0, paragraph=True)
        text = " ".join(results).strip().upper()
        return "".join(c for c in text if c.isalnum() or c == " ").strip()
    except Exception:
        return ""


def compute_color_fingerprint(img: np.ndarray) -> np.ndarray:
    """Compute normalized HSV color histogram as fingerprint."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def compare_color_hist(hist_a: np.ndarray, hist_b: np.ndarray) -> float:
    """Compare two color histograms. Returns 0.0~1.0."""
    score = cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL)
    return max(0.0, score)


def compute_border_fingerprint(img: np.ndarray) -> np.ndarray:
    """Extract color fingerprint from the bottom 30% of a card image."""
    h = img.shape[0]
    bottom = img[int(h * 0.65):, :]
    return compute_color_fingerprint(bottom)


def extract_border_color(img: np.ndarray, thickness: int = 8) -> np.ndarray:
    """Extract the actual border color by sampling edge pixels of the card.
    Returns median HSV color [H, S, V] of the border strip.
    This mimics looking at the card frame color directly."""
    h, w = img.shape[:2]
    if h < thickness * 3 or w < thickness * 3:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        return np.median(hsv.reshape(-1, 3), axis=0)

    # Sample border pixels: left strip, right strip, bottom strip
    border_pixels = []
    # Left edge
    border_pixels.append(img[:, :thickness, :].reshape(-1, 3))
    # Right edge
    border_pixels.append(img[:, -thickness:, :].reshape(-1, 3))
    # Bottom edge
    border_pixels.append(img[-thickness:, :, :].reshape(-1, 3))

    all_pixels = np.vstack(border_pixels)
    # Convert to HSV
    # cv2 expects (N,1,3) for cvtColor on pixel arrays
    hsv_pixels = cv2.cvtColor(all_pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)

    # Filter out very dark pixels (shadows, not actual border)
    bright_mask = hsv_pixels[:, 2] > 40  # V > 40
    if np.any(bright_mask):
        hsv_pixels = hsv_pixels[bright_mask]

    return np.median(hsv_pixels, axis=0).astype(np.float32)


def color_distance(hsv_a: np.ndarray, hsv_b: np.ndarray) -> float:
    """Compute perceptual color distance in HSV space.
    Returns 0.0 (identical) ~ 1.0 (completely different).
    Hue is circular (0-180 in OpenCV), so we handle wraparound."""
    # Hue distance (circular, 0-180)
    h_diff = abs(float(hsv_a[0]) - float(hsv_b[0]))
    h_diff = min(h_diff, 180 - h_diff)  # Circular
    h_dist = h_diff / 90.0  # Normalize to 0~1

    # Saturation distance
    s_dist = abs(float(hsv_a[1]) - float(hsv_b[1])) / 255.0

    # Value distance
    v_dist = abs(float(hsv_a[2]) - float(hsv_b[2])) / 255.0

    # Weighted: hue is most important for color identity
    return h_dist * 0.5 + s_dist * 0.3 + v_dist * 0.2


def generate_bg_mask(img: np.ndarray, tolerance: int = 30) -> np.ndarray:
    """Generate foreground mask by sampling border pixels as background."""
    h, w = img.shape[:2]
    if h < 3 or w < 3:
        return np.ones((h, w), dtype=np.uint8) * 255
    border_pixels = []
    for x in range(w):
        border_pixels.append(img[0, x])
        border_pixels.append(img[h - 1, x])
    for y in range(1, h - 1):
        border_pixels.append(img[y, 0])
        border_pixels.append(img[y, w - 1])
    if not border_pixels:
        return np.ones((h, w), dtype=np.uint8) * 255
    bg_color = np.median(border_pixels, axis=0).astype(np.float32)
    diff = np.abs(img.astype(np.float32) - bg_color)
    max_diff = np.max(diff, axis=2)
    return np.where(max_diff > tolerance, 255, 0).astype(np.uint8)


def nms(detections: list[dict], iou_threshold: float = 0.3) -> list[dict]:
    """Non-Maximum Suppression to remove overlapping detections.
    Also removes detections whose CENTER falls inside a higher-scored box."""
    if not detections:
        return []
    detections = sorted(detections, key=lambda d: d["score"], reverse=True)
    kept = []
    for det in detections:
        cx = det["x"] + det["w"] / 2
        cy = det["y"] + det["h"] / 2
        overlaps = False
        for k in kept:
            # Check IoU overlap
            if compute_iou(det, k) > iou_threshold:
                overlaps = True
                break
            # Check if center of this det falls inside a kept box
            if (k["x"] <= cx <= k["x"] + k["w"] and
                    k["y"] <= cy <= k["y"] + k["h"]):
                overlaps = True
                break
        if not overlaps:
            kept.append(det)
    return kept


def compute_iou(a: dict, b: dict) -> float:
    ax1, ay1, ax2, ay2 = a["x"], a["y"], a["x"] + a["w"], a["y"] + a["h"]
    bx1, by1, bx2, by2 = b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


# --- Stage 1: Template matching to find card locations ---

def has_text_and_color(crop: np.ndarray, reader) -> bool:
    """Validate that a detected region contains readable text AND
    meaningful color (not just background noise).
    This filters out false positives like UI borders, empty areas, etc."""
    # Check 1: Must contain recognizable text
    try:
        results = reader.readtext(crop, detail=1)
        has_text = any(conf > 0.3 for _, _, conf in results)
    except Exception:
        has_text = False

    if not has_text:
        return False

    # Check 2: Must have meaningful color variation (not uniform background)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    s_channel = hsv[:, :, 1]  # Saturation
    v_channel = hsv[:, :, 2]  # Value/brightness
    # Cards typically have some color saturation; pure gray UI doesn't
    mean_sat = np.mean(s_channel)
    std_val = np.std(v_channel)
    # Need either some color saturation OR significant brightness variation
    has_color = mean_sat > 15 or std_val > 30

    return has_color


def stage1_find_cards(capture: np.ndarray, refs: list[dict],
                      threshold: float = 0.7,
                      region: dict | None = None,
                      max_detections: int = 0) -> list[dict]:
    """Stage 1: Use ANY reference as template to find card-shaped regions.
    Then validate each hit contains text + color before accepting.
    Returns list of {x, y, w, h, score} — location only, no identity yet."""
    full_capture = capture  # Keep reference to full image for cropping
    offset_x, offset_y = 0, 0
    scan_area = capture
    if region:
        x1, y1 = region.get("x1", 0), region.get("y1", 0)
        x2, y2 = region.get("x2", capture.shape[1]), region.get("y2", capture.shape[0])
        scan_area = capture[y1:y2, x1:x2]
        offset_x, offset_y = x1, y1

    reader = get_ocr_reader()

    all_hits = []
    for ref in refs:
        ref_img = ref["image"]
        cap_h, cap_w = scan_area.shape[:2]
        ref_h, ref_w = ref_img.shape[:2]
        if ref_h > cap_h or ref_w > cap_w:
            continue

        mask = generate_bg_mask(ref_img)
        fg_ratio = np.count_nonzero(mask) / mask.size
        if fg_ratio > 0.1:
            result = cv2.matchTemplate(scan_area, ref_img, cv2.TM_CCORR_NORMED, mask=mask)
        else:
            result = cv2.matchTemplate(scan_area, ref_img, cv2.TM_CCOEFF_NORMED)

        locations = np.where(result >= threshold)
        for pt_y, pt_x in zip(*locations):
            all_hits.append({
                "x": int(pt_x) + offset_x,
                "y": int(pt_y) + offset_y,
                "w": ref_w, "h": ref_h,
                "score": float(result[pt_y, pt_x]),
            })

    # NMS to merge overlapping hits
    candidates = nms(all_hits, iou_threshold=0.3)

    # Limit to expected number of cards (only if grid is meaningful, not 1x1)
    if max_detections > 1 and len(candidates) > max_detections:
        candidates = sorted(candidates, key=lambda d: d["score"], reverse=True)[:max_detections]

    return candidates


# --- Stage 2: Classify each detected card by text + color ---

def classify_by_border(card_locations: list[dict], capture: np.ndarray,
                       refs: list[dict], min_score: float = 0.3) -> list[dict]:
    """Classify each detected card by comparing its border edge pixel color
    against reference border colors. Uses direct HSV color distance.
    Low-confidence matches (below min_score) are skipped as (미등록)
    to avoid forcing matches on cards not in the reference set."""
    detections = []

    for i, card in enumerate(card_locations):
        x, y, w, h = card["x"], card["y"], card["w"], card["h"]
        crop = capture[y:y + h, x:x + w]
        if crop.size == 0:
            continue

        # Extract border edge pixel color (HSV median)
        card_border_color = extract_border_color(crop)

        best = None
        best_score = -1.0

        for ref in refs:
            # Direct border color comparison: similarity = 1 - distance
            dist = color_distance(card_border_color, ref["border_color"])
            similarity = 1.0 - dist
            if similarity > best_score:
                best_score = similarity
                best = ref

        # Skip low-confidence matches — don't force-match unknown cards
        is_matched = best is not None and best_score >= min_score
        det = {
            "slotIndex": i,
            "x": x, "y": y, "w": w, "h": h,
            "ref_id": best["id"] if is_matched else None,
            "ref_name": best["name"] if is_matched else "(미등록)",
            "score": best_score if best else 0.0,
            "color_score": best_score if best else 0.0,
            "slot_text": "",
        }
        detections.append(det)

    return detections


def find_local_peaks(score_map: np.ndarray, threshold: float,
                     min_distance: int = 20) -> list[tuple[int, int, float]]:
    """Find local maxima in a template matching score map.
    Only returns peaks that are higher than all neighbors within min_distance.
    Much more selective than 'all pixels above threshold'."""
    # Dilate = each pixel becomes the max in its neighborhood
    kernel_size = min_distance * 2 + 1
    dilated = cv2.dilate(score_map, np.ones((kernel_size, kernel_size)))
    # A pixel is a local max if it equals the dilated value AND exceeds threshold
    peaks = (score_map == dilated) & (score_map >= threshold)
    locations = np.where(peaks)
    results = []
    for pt_y, pt_x in zip(*locations):
        results.append((int(pt_x), int(pt_y), float(score_map[pt_y, pt_x])))
    return results


def stage1_template_detect(capture: np.ndarray, refs: list[dict],
                           threshold: float = 0.7,
                           region: dict | None = None,
                           max_detections: int = 0) -> list[dict]:
    """Template matching with local peak detection.
    Each ref matched independently → peaks found → NMS → cap at max.
    Returns [{x, y, w, h, score, ref_id, ref_name}, ...]"""
    offset_x, offset_y = 0, 0
    scan_area = capture
    if region:
        x1, y1 = region.get("x1", 0), region.get("y1", 0)
        x2, y2 = region.get("x2", capture.shape[1]), region.get("y2", capture.shape[0])
        scan_area = capture[y1:y2, x1:x2]
        offset_x, offset_y = x1, y1

    all_hits = []
    for ref in refs:
        ref_img = ref["image"]
        cap_h, cap_w = scan_area.shape[:2]
        ref_h, ref_w = ref_img.shape[:2]
        if ref_h > cap_h or ref_w > cap_w:
            continue

        # Template matching with mask
        mask = generate_bg_mask(ref_img)
        fg_ratio = np.count_nonzero(mask) / mask.size
        if fg_ratio > 0.1:
            score_map = cv2.matchTemplate(scan_area, ref_img, cv2.TM_CCORR_NORMED, mask=mask)
        else:
            score_map = cv2.matchTemplate(scan_area, ref_img, cv2.TM_CCOEFF_NORMED)

        # Find LOCAL PEAKS only (not all pixels above threshold)
        min_dist = max(ref_w, ref_h) // 2  # Min distance between peaks = half card size
        peaks = find_local_peaks(score_map, threshold, min_dist)

        for px, py, score in peaks:
            all_hits.append({
                "x": px + offset_x,
                "y": py + offset_y,
                "w": ref_w, "h": ref_h,
                "score": score,
                "ref_id": ref["id"],
                "ref_name": ref["name"],
            })

    # NMS across all refs
    results = nms(all_hits, iou_threshold=0.3)

    # Cap at max detections
    if max_detections > 1 and len(results) > max_detections:
        results = sorted(results, key=lambda d: d["score"], reverse=True)[:max_detections]

    return results


# --- Combined pipeline ---

def crop_grid_slots(capture: np.ndarray, region: dict, grid: dict,
                    padding: int = 4) -> list[dict]:
    """Crop capture into grid slots. Returns list of {slotIndex, image, x, y, w, h}."""
    x1 = region.get("x1", 0)
    y1 = region.get("y1", 0)
    x2 = region.get("x2", capture.shape[1])
    y2 = region.get("y2", capture.shape[0])
    rows = max(1, grid.get("rows", 1))
    cols = max(1, grid.get("cols", 1))
    slot_w = (x2 - x1) / cols
    slot_h = (y2 - y1) / rows
    slots = []
    idx = 0
    for r in range(rows):
        for c in range(cols):
            sx = int(x1 + c * slot_w + padding)
            sy = int(y1 + r * slot_h + padding)
            ex = int(x1 + (c + 1) * slot_w - padding)
            ey = int(y1 + (r + 1) * slot_h - padding)
            sx, sy = max(0, sx), max(0, sy)
            ex = min(capture.shape[1], ex)
            ey = min(capture.shape[0], ey)
            slot_img = capture[sy:ey, sx:ex]
            if slot_img.size > 0:
                slots.append({
                    "slotIndex": idx, "image": slot_img,
                    "x": sx, "y": sy, "w": ex - sx, "h": ey - sy,
                })
            idx += 1
    return slots


def analyze_capture_hybrid(capture_path: str, refs: list[dict],
                           template_threshold: float = 0.7,
                           region: dict | None = None,
                           grid: dict | None = None,
                           color_weight: float = 0.5,
                           min_score: float = 0.3) -> list[dict]:
    """Template matching to find cards → border color to classify grade.
    Stage 1: Local peak template detection in region
    Stage 2: Bottom border color matching against references"""
    capture = cv2_imread(capture_path)
    if capture is None:
        return []

    max_det = 0
    if grid:
        max_det = grid.get("rows", 0) * grid.get("cols", 0)

    # Stage 1: Find card locations via template matching (local peaks only)
    cards = stage1_template_detect(capture, refs, template_threshold, region, max_det)

    if not cards:
        return []

    # Stage 2: Classify each card by bottom border color
    return classify_by_border(cards, capture, refs, min_score)


@st.cache_data
def run_post_processing(session_id: str, macro_id: str, capture_paths: list[str],
                        template_threshold: float = 0.7,
                        _region: dict | None = None,
                        _grid: dict | None = None,
                        color_weight: float = 0.5,
                        min_score: float = 0.3,
                        _refs_mt: float = 0.0) -> list[dict]:
    """Run 2-stage hybrid analysis on all captures."""
    refs = load_ref_cv_images(macro_id, _refs_mtime(macro_id))
    if not refs:
        return []

    results = []
    for i, cap_path in enumerate(capture_paths):
        if not cap_path or not Path(cap_path).exists():
            results.append({"run": i + 1, "detections": []})
            continue
        detections = analyze_capture_hybrid(
            cap_path, refs, template_threshold,
            _region, _grid, color_weight, min_score
        )
        results.append({"run": i + 1, "detections": detections, "imagePath": cap_path})

    return results


def build_post_summary(pp_results: list[dict]) -> dict:
    """Build summary from post-processing results. Excludes (미등록)."""
    counts = Counter()
    total_matched = 0
    total_unregistered = 0
    for r in pp_results:
        for det in r.get("detections", []):
            name = det["ref_name"]
            counts[name] += 1
            if name == "(미등록)":
                total_unregistered += 1
            else:
                total_matched += 1

    summary = {}
    for name, count in counts.items():
        if name == "(미등록)":
            summary[name] = {"count": count, "rate": 0.0}
        else:
            summary[name] = {
                "count": count,
                "rate": count / total_matched if total_matched > 0 else 0,
            }
    return summary


def build_pp_run_df(pp_results: list[dict]) -> pd.DataFrame:
    """Build per-run DataFrame from post-processing results. Excludes (미등록)."""
    rows = []
    for r in pp_results:
        for det in r.get("detections", []):
            if det["ref_name"] == "(미등록)":
                continue
            rows.append({
                "run": r["run"],
                "ref_name": det["ref_name"],
                "score": det["score"],
                "x": det["x"],
                "y": det["y"],
                "slot_text": det.get("slot_text", ""),
            })
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def draw_detections(capture_path: str, detections: list[dict], ref_colors: dict) -> np.ndarray | None:
    """Draw bounding boxes on capture image. Gray for unregistered, colored for matched."""
    img = cv2_imread(capture_path)
    if img is None:
        return None
    for det in detections:
        name = det.get("ref_name", "?")
        if name == "(미등록)":
            color = (128, 128, 128)  # Gray for unregistered
        else:
            color = ref_colors.get(name, (0, 255, 0))
        x, y, w, h = det["x"], det["y"], det["w"], det["h"]
        cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
        # Show text + score
        slot_text = det.get("slot_text", "")
        label = f"{name} {det['score']:.0%}"
        if slot_text:
            label = f"[{slot_text}] {label}"
        cv2.putText(img, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1)
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


# ==============================================================
# Data loading helpers (original session.json based)
# ==============================================================

def load_session(path: str) -> dict | None:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        st.error(f"세션 로드 실패: {e}")
        return None


def list_sessions(limit: int = 10) -> list[dict]:
    sessions = []
    if not SESSIONS_DIR.exists():
        return sessions
    for d in sorted(SESSIONS_DIR.iterdir(), reverse=True):
        if d.is_dir():
            sp = d / "session.json"
            if sp.exists():
                try:
                    with open(sp, "r", encoding="utf-8") as f:
                        s = json.load(f)
                        s["_path"] = str(sp)
                        sessions.append(s)
                except:
                    pass
        if len(sessions) >= limit:
            break
    return sessions


def load_ref_images_b64(macro_id: str) -> dict[str, str]:
    ref_dir = REFS_DIR / macro_id
    images = {}
    if not ref_dir.exists():
        return images
    refs_json = ref_dir / "refs.json"
    if refs_json.exists():
        try:
            refs = json.loads(refs_json.read_text(encoding="utf-8"))
            for ref in refs:
                img_path = Path(ref["imagePath"])
                if img_path.exists():
                    b64 = base64.b64encode(img_path.read_bytes()).decode()
                    images[ref["name"]] = f"data:image/png;base64,{b64}"
        except:
            pass
    return images


def build_run_df(session: dict) -> pd.DataFrame:
    rows = []
    for result in session.get("results", []):
        run_num = result["run"]
        for slot in result.get("slots", []):
            rows.append({
                "run": run_num,
                "slot": slot["slotIndex"],
                "matched": slot["matchedName"],
                "ref_id": slot.get("matchedRef"),
                "similarity": slot["similarity"],
            })
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def build_per_run_summary(session: dict) -> pd.DataFrame:
    results = session.get("results", [])
    if not results:
        return pd.DataFrame()
    rows = []
    for result in results:
        counts = Counter()
        for slot in result.get("slots", []):
            counts[slot["matchedName"]] += 1
        row = {"회차": result["run"]}
        row.update(dict(counts))
        rows.append(row)
    df = pd.DataFrame(rows).fillna(0)
    for col in df.columns:
        if col != "회차":
            df[col] = df[col].astype(int)
    return df


def build_cumulative_df_from_pp(pp_results: list[dict]) -> pd.DataFrame:
    """Build cumulative probability DataFrame from post-processing results.
    Excludes (미등록) from probability calculation."""
    if not pp_results:
        return pd.DataFrame()
    all_names = set()
    for r in pp_results:
        for d in r.get("detections", []):
            if d["ref_name"] != "(미등록)":
                all_names.add(d["ref_name"])
    if not all_names:
        return pd.DataFrame()
    counts = {name: 0 for name in all_names}
    total = 0
    rows = []
    for r in pp_results:
        for d in r.get("detections", []):
            if d["ref_name"] == "(미등록)":
                continue
            counts[d["ref_name"]] += 1
            total += 1
        for name in all_names:
            rows.append({
                "run": r["run"],
                "name": name,
                "count": counts[name],
                "total": total,
                "rate": counts[name] / total if total > 0 else 0,
            })
    return pd.DataFrame(rows)


def build_cumulative_df(session: dict) -> pd.DataFrame:
    results = session.get("results", [])
    if not results:
        return pd.DataFrame()
    all_names = set()
    for r in results:
        for s in r.get("slots", []):
            all_names.add(s["matchedName"])
    counts = {name: 0 for name in all_names}
    total = 0
    rows = []
    for result in results:
        for slot in result.get("slots", []):
            name = slot["matchedName"]
            counts[name] = counts.get(name, 0) + 1
            total += 1
        for name in all_names:
            rows.append({
                "run": result["run"],
                "name": name,
                "count": counts.get(name, 0),
                "total": total,
                "rate": counts.get(name, 0) / total if total > 0 else 0,
            })
    return pd.DataFrame(rows)


def find_sample_captures(session: dict, ref_name: str, max_samples: int = 3) -> list[dict]:
    samples = []
    for result in session.get("results", []):
        for slot in result.get("slots", []):
            if slot["matchedName"] == ref_name:
                img_path = result.get("imagePath")
                if img_path and Path(img_path).exists():
                    samples.append({
                        "run": result["run"],
                        "path": img_path,
                        "similarity": slot["similarity"],
                    })
                    break
        if len(samples) >= max_samples:
            break
    return samples


# ==============================================================
# Rendering
# ==============================================================

# Color palette for bounding boxes (BGR for OpenCV)
REF_COLORS_BGR = [
    (0, 255, 0), (255, 0, 0), (0, 0, 255), (255, 255, 0),
    (255, 0, 255), (0, 255, 255), (128, 255, 0), (255, 128, 0),
    (128, 0, 255), (0, 128, 255), (255, 0, 128), (0, 255, 128),
]


def render_session(session: dict):
    macro_name = session.get("macroName", "알 수 없음")
    macro_id = session.get("macroId", "")
    total_runs = session.get("totalRuns", 0)
    started = session.get("startedAt", 0)
    completed = session.get("completedAt", 0)
    results = session.get("results", [])

    start_str = datetime.fromtimestamp(started / 1000).strftime("%Y-%m-%d %H:%M") if started else "-"
    duration_s = (completed - started) / 1000 if completed and started else 0

    st.title(f"🎯 {macro_name}")
    st.caption(f"세션: {session.get('id', '-')} · {start_str}")

    # Collect capture paths
    capture_paths = []
    for r in results:
        capture_paths.append(r.get("imagePath", ""))

    # Get region from session (or fallback: read from macro file)
    if not session.get("region"):
        macro_path = Path.home() / ".claude" / "macros" / f"{macro_id}.json"
        if macro_path.exists():
            try:
                macro_data = json.loads(macro_path.read_text(encoding="utf-8"))
                for step in macro_data.get("steps", []):
                    if step.get("type") == "ocr" and step.get("region"):
                        session["region"] = step["region"]
                        session["grid"] = step.get("grid", {"rows": 1, "cols": 1})
                        break
            except Exception:
                pass

    # Check if refs exist for post-processing
    refs = load_ref_cv_images(macro_id, _refs_mtime(macro_id))
    has_refs = len(refs) > 0
    has_captures = any(p and Path(p).exists() for p in capture_paths)

    # === Post-Processing Controls ===
    st.markdown("---")

    if has_refs and has_captures:
        st.subheader("🔬 2단계 분석 (누끼 탐지 → 테두리 색상 분류)")
        st.caption("Stage 1: 템플릿 매칭으로 카드 위치 탐지 → Stage 2: 테두리 픽셀 색상으로 등급 분류 (낮은 확신도 → 스킵)")

        # Grid setting (user override — macro grid may be wrong)
        saved_grid = session.get("grid", {})
        default_rows = saved_grid.get("rows", 0)
        default_cols = saved_grid.get("cols", 0)
        # If grid is 1x1 or not set, default to 2x5 (common gacha layout)
        if default_rows <= 1 and default_cols <= 1:
            default_rows, default_cols = 2, 5
        col_gr, col_gc, col_info = st.columns([1, 1, 2])
        with col_gr:
            grid_rows = st.number_input("그리드 행", min_value=1, max_value=10,
                                        value=default_rows,
                                        help="카드가 몇 줄로 배치되는지")
        with col_gc:
            grid_cols = st.number_input("그리드 열", min_value=1, max_value=10,
                                        value=default_cols,
                                        help="한 줄에 카드 몇 장")
        with col_info:
            st.metric("예상 카드 수/회", f"{grid_rows * grid_cols}장")

        col_tt, col_cw, col_ms, col_run = st.columns([2, 2, 2, 1])
        with col_tt:
            pp_template_threshold = st.slider("탐지 임계값", 0.5, 1.0, 0.7, 0.05,
                                              help="Stage 1: 누끼 형태 탐지 민감도")
        with col_cw:
            pp_color_weight = st.slider("색상 비중", 0.0, 1.0, 0.5, 0.1,
                                        help="픽셀 유사도 vs 색상 히스토그램 가중치 (0=픽셀만, 1=색상만)")
        with col_ms:
            pp_min_score = st.slider("최소 분류 점수", 0.0, 1.0, 0.5, 0.05,
                                     help="Stage 2: 이 점수 미만이면 스킵(미등록) — 레퍼런스에 없는 카드 강제 매칭 방지")
        with col_run:
            run_pp = st.button("▶ 분석", type="primary", use_container_width=True)

        # Run or load cached results
        grid = {"rows": grid_rows, "cols": grid_cols}
        region = session.get("region")
        pp_cache_key = f"pp_{session.get('id')}_{pp_template_threshold}_{pp_color_weight}_{pp_min_score}_{grid_rows}_{grid_cols}"
        if run_pp or pp_cache_key in st.session_state:
            if run_pp:
                max_det = grid_rows * grid_cols
                with st.spinner(f"캡처 {len(capture_paths)}장 × {max_det}카드 분석 중..."):
                    pp_results = run_post_processing(
                        session.get("id", ""),
                        macro_id,
                        capture_paths,
                        pp_template_threshold,
                        region,
                        grid,
                        pp_color_weight,
                        pp_min_score,
                        _refs_mtime(macro_id),
                    )
                    st.session_state[pp_cache_key] = pp_results
            else:
                pp_results = st.session_state[pp_cache_key]

            if pp_results:
                render_pp_results(session, pp_results, refs, macro_id)
            else:
                st.warning("분석 결과가 없습니다. 레퍼런스 이미지나 캡처를 확인하세요.")
        else:
            st.info("▶ 분석 실행 버튼을 눌러 캡처 이미지에서 레퍼런스를 탐지합니다.")
            # Show existing Electron-side results as fallback
            render_electron_results(session, macro_id)
    elif not has_refs:
        st.warning(f"레퍼런스 이미지가 없습니다. Sophia Hub에서 등록하세요.\n\n경로: `{REFS_DIR / macro_id}`")
        render_electron_results(session, macro_id)
    elif not has_captures:
        st.warning("캡처 이미지가 없습니다.")
        render_electron_results(session, macro_id)


def render_pp_results(session: dict, pp_results: list[dict], refs: list[dict], macro_id: str):
    """Render post-processing (OpenCV) analysis results."""
    total_runs = len(pp_results)
    total_slots = sum(len(r.get("detections", [])) for r in pp_results)
    total_matched = sum(
        1 for r in pp_results for d in r.get("detections", []) if d["ref_name"] != "(미등록)"
    )
    total_unregistered = total_slots - total_matched
    started = session.get("startedAt", 0)
    completed = session.get("completedAt", 0)
    duration_s = (completed - started) / 1000 if completed and started else 0

    # Metrics
    cols = st.columns(5)
    metrics = [
        ("총 캡처", f"{total_runs:,}회"),
        ("총 슬롯", f"{total_slots:,}개"),
        ("매칭됨", f"{total_matched:,}개"),
        ("미등록", f"{total_unregistered:,}개"),
        ("소요 시간", f"{duration_s:.0f}초" if duration_s > 0 else "-"),
    ]
    for col, (label, value) in zip(cols, metrics):
        col.markdown(f"""
        <div class="metric-card">
            <div class="metric-value">{value}</div>
            <div class="metric-label">{label}</div>
        </div>
        """, unsafe_allow_html=True)

    st.markdown("---")

    summary = build_post_summary(pp_results)
    if not summary:
        st.warning("탐지된 레퍼런스가 없습니다. 임계값을 낮춰보세요.")
        return

    ref_images = load_ref_images_b64(macro_id)

    # Assign colors to refs
    ref_color_map = {}
    for i, ref in enumerate(refs):
        ref_color_map[ref["name"]] = REF_COLORS_BGR[i % len(REF_COLORS_BGR)]

    # === Reference Cards ===
    st.subheader("레퍼런스별 결과")
    matched_items = [(n, i) for n, i in sorted(summary.items(), key=lambda x: -x[1]["count"]) if n != "(미등록)"]
    unregistered_info = summary.get("(미등록)")
    ref_items = matched_items  # For charts below

    if matched_items:
        card_cols = st.columns(min(len(matched_items), 6))
        for idx, (name, item) in enumerate(matched_items):
            with card_cols[idx % len(card_cols)]:
                img_tag = ""
                if name in ref_images:
                    img_tag = f'<img src="{ref_images[name]}" /><br/>'
                st.markdown(f"""
                <div class="ref-card">
                    {img_tag}
                    <div class="ref-name">{name}</div>
                    <div class="ref-count">{item['count']:,}</div>
                    <div class="ref-rate">{item['rate'] * 100:.2f}%</div>
                </div>
                """, unsafe_allow_html=True)

    if unregistered_info and unregistered_info["count"] > 0:
        st.caption(f"⚠️ 미등록 슬롯: {unregistered_info['count']:,}개 — 확률 집계에서 제외")

    st.markdown("---")

    # === Charts ===
    summary_df = pd.DataFrame([
        {"이름": name, "횟수": item["count"], "확률": f"{item['rate'] * 100:.2f}%", "rate_raw": item["rate"]}
        for name, item in ref_items
    ])

    if not summary_df.empty:
        col_pie, col_bar = st.columns(2)

        with col_pie:
            st.subheader("확률 분포")
            fig_pie = px.pie(
                summary_df, values="횟수", names="이름",
                color_discrete_sequence=px.colors.qualitative.Set2, hole=0.4,
            )
            fig_pie.update_layout(**CHART_LAYOUT, height=400, legend=dict(font=dict(size=14, color="#f0f0f0")))
            fig_pie.update_traces(textinfo="label+percent", textfont_size=14, textfont_color="#fff")
            st.plotly_chart(fig_pie, use_container_width=True)

        with col_bar:
            st.subheader("유형별 횟수")
            fig_bar = px.bar(
                summary_df, x="이름", y="횟수", color="이름",
                color_discrete_sequence=px.colors.qualitative.Set2, text="횟수",
            )
            bar_layout = {**CHART_LAYOUT, "margin": dict(t=20, b=120)}
            fig_bar.update_layout(**bar_layout, height=450, showlegend=False,
                                  xaxis=dict(gridcolor=GRID_COLOR, tickfont=dict(size=12, color="#e0e0e0"), tickangle=-30),
                                  yaxis=dict(gridcolor=GRID_COLOR, tickfont=dict(size=13, color="#e0e0e0")))
            fig_bar.update_traces(textposition="outside", textfont=dict(size=14, color="#fff"))
            st.plotly_chart(fig_bar, use_container_width=True)

    st.markdown("---")

    # === Per-Run Detail ===
    st.subheader("회차별 상세")
    per_run_rows = []
    for r in pp_results:
        matched = [d for d in r.get("detections", []) if d["ref_name"] != "(미등록)"]
        counts = Counter(d["ref_name"] for d in matched)
        row = {"회차": r["run"]}
        row.update(dict(counts))
        per_run_rows.append(row)
    per_run_df = pd.DataFrame(per_run_rows).fillna(0)
    for col_name in per_run_df.columns:
        if col_name != "회차":
            per_run_df[col_name] = per_run_df[col_name].astype(int)

    if not per_run_df.empty:
        st.dataframe(per_run_df, use_container_width=True, hide_index=True,
                      height=min(400, 40 + len(per_run_df) * 35))

        # Stacked bar chart
        pp_run_df = build_pp_run_df(pp_results)
        if not pp_run_df.empty:
            run_counts = pp_run_df.groupby(["run", "ref_name"]).size().reset_index(name="count")
            if not run_counts.empty:
                fig_stack = px.bar(
                    run_counts, x="run", y="count", color="ref_name",
                    labels={"run": "회차", "count": "탐지 수", "ref_name": "레퍼런스"},
                    color_discrete_sequence=px.colors.qualitative.Set2, barmode="stack",
                )
                fig_stack.update_layout(**CHART_LAYOUT, height=300,
                                        xaxis=dict(gridcolor=GRID_COLOR, dtick=max(1, total_runs // 20), tickfont=dict(color="#e0e0e0")),
                                        yaxis=dict(gridcolor=GRID_COLOR, tickfont=dict(color="#e0e0e0")),
                                        legend=dict(font=dict(color="#f0f0f0")))
                st.plotly_chart(fig_stack, use_container_width=True)

    st.markdown("---")

    # === Convergence ===
    st.subheader("확률 수렴 그래프")
    cum_df = build_cumulative_df_from_pp(pp_results)
    if not cum_df.empty and total_runs > 1:
        filter_names = st.multiselect(
            "표시할 유형",
            options=sorted(cum_df["name"].unique()),
            default=sorted(cum_df["name"].unique()),
        )
        filtered = cum_df[cum_df["name"].isin(filter_names)]
        fig_conv = px.line(
            filtered, x="run", y="rate", color="name",
            labels={"run": "회차", "rate": "누적 확률", "name": "유형"},
            color_discrete_sequence=px.colors.qualitative.Set2,
        )
        fig_conv.update_layout(**CHART_LAYOUT, height=400,
                               xaxis=dict(gridcolor=GRID_COLOR, title="회차", tickfont=dict(color="#e0e0e0")),
                               yaxis=dict(gridcolor=GRID_COLOR, title="누적 확률", tickformat=".1%", tickfont=dict(color="#e0e0e0")),
                               legend=dict(font=dict(size=14, color="#f0f0f0")))
        st.plotly_chart(fig_conv, use_container_width=True)

    st.markdown("---")

    # === Capture Gallery with Slot Boxes ===
    st.subheader(f"캡처 갤러리 ({total_runs}장)")
    show_boxes = st.checkbox("슬롯 영역 표시", value=True)

    total_pages = max(1, (total_runs + PER_PAGE - 1) // PER_PAGE)
    page = st.number_input("페이지", min_value=1, max_value=total_pages, value=1, step=1)
    st.caption(f"{total_pages}페이지 중 {page}페이지 · 페이지당 {PER_PAGE}장")

    start_idx = (page - 1) * PER_PAGE
    end_idx = min(start_idx + PER_PAGE, total_runs)
    page_results = pp_results[start_idx:end_idx]

    for row_start in range(0, len(page_results), 4):
        row_items = page_results[row_start:row_start + 4]
        img_cols = st.columns(4)
        for col_i, r in zip(img_cols, row_items):
            with col_i:
                cap_path = r.get("imagePath", "")
                run_num = r.get("run", "?")
                dets = r.get("detections", [])
                matched_dets = [d for d in dets if d["ref_name"] != "(미등록)"]
                det_counts = Counter(d["ref_name"] for d in matched_dets)

                if cap_path and Path(cap_path).exists():
                    if show_boxes and dets:
                        annotated = draw_detections(cap_path, dets, ref_color_map)
                        if annotated is not None:
                            st.image(annotated, use_container_width=True)
                        else:
                            st.caption(f"#{run_num} 이미지 로드 실패")
                    else:
                        st.image(cap_path, use_container_width=True)

                    # Detection info card with text/color details
                    det_items = "".join(
                        f'<span class="det-item">{n}:{c}</span>'
                        for n, c in det_counts.most_common()
                    ) if det_counts else '<span style="color:#666">매칭 없음</span>'
                    unreg_count = len(dets) - len(matched_dets)
                    unreg_tag = f' <span style="color:#888">+{unreg_count}미등록</span>' if unreg_count > 0 else ""
                    st.markdown(f"""
                    <div class="cap-info">
                        <span class="run-num">#{run_num}</span> ({len(matched_dets)}/{len(dets)}슬롯){unreg_tag}<br/>
                        {det_items}
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    st.caption(f"#{run_num} 이미지 없음")

    st.markdown("---")

    # === Export ===
    st.subheader("데이터 내보내기")
    col_ex1, col_ex2 = st.columns(2)

    with col_ex1:
        excel_buf = BytesIO()
        with pd.ExcelWriter(excel_buf, engine="openpyxl") as writer:
            if not summary_df.empty:
                summary_df[["이름", "횟수", "확률"]].to_excel(writer, sheet_name="요약", index=False)
            if not per_run_df.empty:
                per_run_df.to_excel(writer, sheet_name="회차별", index=False)
            pp_detail = build_pp_run_df(pp_results)
            if not pp_detail.empty:
                pp_detail.to_excel(writer, sheet_name="상세", index=False)
        st.download_button(
            "📊 Excel 다운로드",
            data=excel_buf.getvalue(),
            file_name=f"match_report_{session.get('id', 'unknown')}.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    with col_ex2:
        export_data = {
            "session_id": session.get("id"),
            "macro_name": session.get("macroName"),
            "total_runs": total_runs,
            "total_detections": total_slots,
            "summary": {k: v for k, v in summary.items()},
            "per_run": [
                {"run": r["run"], "detections": [
                    {"ref": d["ref_name"], "score": round(d["score"], 4), "x": d["x"], "y": d["y"]}
                    for d in r.get("detections", [])
                ]} for r in pp_results
            ],
        }
        st.download_button(
            "📋 JSON 다운로드",
            data=json.dumps(export_data, ensure_ascii=False, indent=2),
            file_name=f"pp_result_{session.get('id', 'unknown')}.json",
            mime="application/json",
        )


def render_electron_results(session: dict, macro_id: str):
    """Fallback: render results from Electron-side matching (session.json)."""
    summary = session.get("summary", {})
    results = session.get("results", [])
    total_runs = session.get("totalRuns", 0)
    total_detections = sum(len(r.get("slots", [])) for r in results)
    started = session.get("startedAt", 0)
    completed = session.get("completedAt", 0)
    duration_s = (completed - started) / 1000 if completed and started else 0

    st.caption("📌 Electron 매칭 결과 (세션 데이터 기반)")

    cols = st.columns(4)
    metrics = [
        ("총 캡처", f"{total_runs:,}회"),
        ("총 탐지", f"{total_detections:,}개"),
        ("평균 탐지/회", f"{total_detections / total_runs:.1f}" if total_runs else "-"),
        ("소요 시간", f"{duration_s:.0f}초" if duration_s > 0 else "-"),
    ]
    for col, (label, value) in zip(cols, metrics):
        col.markdown(f"""
        <div class="metric-card">
            <div class="metric-value">{value}</div>
            <div class="metric-label">{label}</div>
        </div>
        """, unsafe_allow_html=True)

    if not summary:
        st.warning("결과 데이터가 없습니다.")
        return

    ref_images = load_ref_images_b64(macro_id)

    st.markdown("---")
    st.subheader("레퍼런스별 결과")
    ref_items = [(name, item) for name, item in sorted(summary.items(), key=lambda x: -x[1]["count"])]
    matched_items = [(n, i) for n, i in ref_items if n != "(미등록)"]
    unmatched = dict(ref_items).get("(미등록)", None)

    if matched_items:
        card_cols = st.columns(min(len(matched_items), 5))
        for idx, (name, item) in enumerate(matched_items):
            with card_cols[idx % len(card_cols)]:
                img_tag = ""
                if name in ref_images:
                    img_tag = f'<img src="{ref_images[name]}" /><br/>'
                st.markdown(f"""
                <div class="ref-card">
                    {img_tag}
                    <div class="ref-name">{name}</div>
                    <div class="ref-count">{item['count']:,}</div>
                    <div class="ref-rate">{item['rate'] * 100:.2f}%</div>
                </div>
                """, unsafe_allow_html=True)

    if unmatched:
        st.caption(f"⚠️ 미등록: {unmatched['count']:,}건 ({unmatched['rate'] * 100:.1f}%) — 집계 제외")

    # Capture gallery
    st.markdown("---")
    st.subheader(f"전체 캡처 이미지 ({total_runs}장)")
    if results:
        total_pages = max(1, (total_runs + PER_PAGE - 1) // PER_PAGE)
        page = st.number_input("페이지", min_value=1, max_value=total_pages, value=1, step=1, key="electron_page")
        st.caption(f"{total_pages}페이지 중 {page}페이지")

        start_idx = (page - 1) * PER_PAGE
        end_idx = min(start_idx + PER_PAGE, total_runs)
        page_results = results[start_idx:end_idx]

        for row_start in range(0, len(page_results), 4):
            row_items = page_results[row_start:row_start + 4]
            img_cols = st.columns(4)
            for col_i, result in zip(img_cols, row_items):
                with col_i:
                    img_path = result.get("imagePath")
                    run_num = result.get("run", "?")
                    slots = result.get("slots", [])
                    det_counts = Counter(s["matchedName"] for s in slots if s["matchedName"] != "(미등록)")
                    matched_count = sum(det_counts.values())

                    if img_path and Path(img_path).exists():
                        st.image(img_path, use_container_width=True)
                        det_items = "".join(
                            f'<span class="det-item">{n}:{c}</span>'
                            for n, c in det_counts.most_common()
                        ) if det_counts else '<span style="color:#666">미등록</span>'
                        st.markdown(f"""
                        <div class="cap-info">
                            <span class="run-num">#{run_num}</span> ({matched_count}개)<br/>
                            {det_items}
                        </div>
                        """, unsafe_allow_html=True)
                    else:
                        st.caption(f"#{run_num} 이미지 없음")


# --- Main ---
def main():
    with st.sidebar:
        st.markdown("## 🎯 이미지 매칭 분석")
        st.caption("Sophia Hub · 확률 테스트 대시보드")
        st.markdown("---")

        sessions = list_sessions(limit=10)

        # Direct session mode (from Electron button)
        target_session = None
        if args.session and os.path.exists(args.session):
            target_session = load_session(args.session)

        if not sessions and not target_session:
            st.warning("세션 데이터가 없습니다.")
            st.info(f"경로: `{SESSIONS_DIR}`")
            return

        # Build session list (merge target if not in list)
        all_options = {}
        if target_session:
            label = format_session_label(target_session, current=True)
            all_options[label] = target_session

        for s in sessions:
            sid = s.get("id", "")
            if target_session and sid == target_session.get("id"):
                continue
            label = format_session_label(s)
            all_options[label] = s

        if not all_options:
            st.warning("세션 데이터가 없습니다.")
            return

        st.markdown("### 최근 세션")
        selected_label = st.radio(
            "세션 선택",
            options=list(all_options.keys()),
            label_visibility="collapsed",
        )
        selected_session = all_options.get(selected_label)

        st.markdown("---")
        st.markdown("### 레퍼런스 정보")
        if selected_session:
            macro_id = selected_session.get("macroId", "")
            refs = load_ref_cv_images(macro_id, _refs_mtime(macro_id))
            if refs:
                st.success(f"{len(refs)}개 등록됨")
                for ref in refs:
                    st.caption(f"· {ref['name']}")
            else:
                st.warning("등록된 레퍼런스 없음")

    if selected_session:
        render_session(selected_session)
    else:
        st.info("좌측에서 분석할 세션을 선택하세요.")


def format_session_label(session: dict, current: bool = False) -> str:
    name = session.get("macroName", "?")
    runs = session.get("totalRuns", 0)
    dt = ""
    if session.get("startedAt"):
        dt = datetime.fromtimestamp(session["startedAt"] / 1000).strftime("%m/%d %H:%M")
    prefix = "▶ " if current else ""
    return f"{prefix}{name} ({runs}회) · {dt}"


if __name__ == "__main__":
    main()
