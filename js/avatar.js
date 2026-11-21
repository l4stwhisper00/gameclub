const MAX_FILE_SIZE = 10 * 1024 * 1024;
const OUTPUT_SIZE = 200;

function validateImageFile(file) {
  if (!file) throw new Error("Сначала выберите изображение.");
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Поддерживаются изображения JPG, PNG, WebP и GIF.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("Размер изображения не должен превышать 10 МБ.");
}

export function bindAvatarCropper({
  fileInput,
  viewport,
  image,
  cropper,
  zoomInput,
  saveButton,
  cancelButton,
  onSave,
  onCancel,
  onError
}) {
  let objectUrl = null;
  let loadedImage = false;
  let zoom = 1;
  let offsetX = 0;
  let offsetY = 0;
  let baseScale = 1;
  let renderedWidth = 0;
  let renderedHeight = 0;
  let baseLeft = 0;
  let baseTop = 0;
  let dragState = null;

  function geometry() {
    const size = viewport.clientWidth;
    baseScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const scale = baseScale * zoom;
    renderedWidth = image.naturalWidth * scale;
    renderedHeight = image.naturalHeight * scale;
    baseLeft = (size - renderedWidth) / 2;
    baseTop = (size - renderedHeight) / 2;
    const minX = size - renderedWidth - baseLeft;
    const minY = size - renderedHeight - baseTop;
    offsetX = Math.max(minX, Math.min(0, offsetX));
    offsetY = Math.max(minY, Math.min(0, offsetY));
    image.style.width = `${renderedWidth}px`;
    image.style.height = `${renderedHeight}px`;
    image.style.left = `${baseLeft + offsetX}px`;
    image.style.top = `${baseTop + offsetY}px`;
  }

  function clearImage() {
    loadedImage = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    image.removeAttribute("src");
  }

  function closeCropper() {
    cropper.hidden = true;
    fileInput.value = "";
    clearImage();
  }

  function handleFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      validateImageFile(file);
      clearImage();
      zoom = 1;
      offsetX = 0;
      offsetY = 0;
      zoomInput.value = "1";
      objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        loadedImage = true;
        geometry();
        cropper.hidden = false;
      };
      image.onerror = () => {
        clearImage();
        onError?.("Не удалось открыть это изображение.");
      };
      image.src = objectUrl;
    } catch (error) {
      fileInput.value = "";
      onError?.(error.message);
    }
  }

  function handleZoom() {
    if (!loadedImage) return;
    const oldZoom = zoom;
    zoom = Number(zoomInput.value);
    const factor = (zoom - oldZoom) * Math.max(viewport.clientWidth / 2, 1);
    offsetX -= Math.sign(offsetX || 1) * factor * 0.35;
    offsetY -= Math.sign(offsetY || 1) * factor * 0.35;
    geometry();
  }

  function pointerDown(event) {
    if (!loadedImage) return;
    dragState = { x: event.clientX, y: event.clientY, offsetX, offsetY };
    viewport.setPointerCapture?.(event.pointerId);
  }

  function pointerMove(event) {
    if (!dragState) return;
    offsetX = dragState.offsetX + event.clientX - dragState.x;
    offsetY = dragState.offsetY + event.clientY - dragState.y;
    geometry();
  }

  function pointerUp() {
    dragState = null;
  }

  function saveCrop() {
    if (!loadedImage) return;
    try {
      const size = viewport.clientWidth;
      const scale = baseScale * zoom;
      const left = baseLeft + offsetX;
      const top = baseTop + offsetY;
      const sx = Math.max(0, -left / scale);
      const sy = Math.max(0, -top / scale);
      const sourceSize = size / scale;
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог обработать изображение.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        sx, sy, sourceSize, sourceSize,
        0, 0, OUTPUT_SIZE, OUTPUT_SIZE
      );
      const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
      onSave?.(dataUrl);
      closeCropper();
    } catch (error) {
      onError?.(error.message || "Не удалось обработать изображение.");
    }
  }

  fileInput.addEventListener("change", handleFile);
  zoomInput.addEventListener("input", handleZoom);
  viewport.addEventListener("pointerdown", pointerDown);
  viewport.addEventListener("pointermove", pointerMove);
  viewport.addEventListener("pointerup", pointerUp);
  viewport.addEventListener("pointercancel", pointerUp);
  saveButton.addEventListener("click", saveCrop);
  cancelButton.addEventListener("click", () => {
    closeCropper();
    onCancel?.();
  });

  return {
    openFilePicker() {
      fileInput.click();
    },
    close() {
      closeCropper();
    },
    destroy() {
      fileInput.removeEventListener("change", handleFile);
      zoomInput.removeEventListener("input", handleZoom);
      viewport.removeEventListener("pointerdown", pointerDown);
      viewport.removeEventListener("pointermove", pointerMove);
      viewport.removeEventListener("pointerup", pointerUp);
      viewport.removeEventListener("pointercancel", pointerUp);
      saveButton.removeEventListener("click", saveCrop);
      clearImage();
    }
  };
}
