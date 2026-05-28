# B3 Custom Background Upload Validation

## Files Touched
- `frontend/src/app/components/background-picker/background-picker.component.ts`
- `frontend/src/app/components/background-picker/background-picker.component.html`
- `frontend/src/app/components/background-picker/background-picker.component.scss`
- `validation/B3-custom-upload.md`
- `validation/B3-picker-with-customs.png`

## Resize Ladder
- Uploads are read with `FileReader.readAsDataURL`, loaded into an `HTMLImageElement`, and drawn to an offscreen canvas.
- Images are resized to fit within `1280x720` while preserving aspect ratio and without upscaling.
- Canvas output is encoded as JPEG using the quality ladder `0.85 -> 0.7 -> 0.6 -> 0.5`.
- The first encoded data URL whose approximate binary size is `<= 1,000,000` bytes is accepted.

## FIFO Logic
- Custom IDs are stored chronologically in `meet-poc:bg:custom:index`.
- Each custom image data URL is stored at `meet-poc:bg:custom:<id>`.
- Adding a sixth custom keeps the newest five IDs and removes the oldest ID plus its data key.
- Deleting a custom removes its data key and removes the ID from the index.

## Restore Logic
- Preset selections restore by resolving `meet-poc:bg:selected` against the existing image preset IDs.
- Custom selections restore by resolving the stored asset ID against `meet-poc:bg:custom:index` and `meet-poc:bg:custom:<id>`.
- If a stored custom asset is missing, the picker clears the stale selection and falls back to `mode: none`.
- `none` and `blur` restore directly from their stored mode.

## Error Handling
- Non-image uploads are rejected with a visible upload error.
- Raw files larger than `10MB` are rejected before FileReader/canvas work.
- Images that remain larger than `1MB` after JPEG quality `0.5` are rejected with `Image too large after compression`.
- File read, image load, canvas processing, and localStorage quota failures are caught and surfaced as visible upload errors.
