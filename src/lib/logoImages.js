import { prepareImage } from './menuImages.js';

export async function prepareLogo(file) {
  const logo = await prepareImage(file);
  const bitmap = await createImageBitmap(logo);
  try {
    const icons = {};
    for (const size of [192,512]) {
      const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size);
      const scale = size * 0.84 / Math.max(bitmap.width, bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
      icons[size] = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!icons[size]) throw Error('Unable to prepare app icons. Please choose another image.');
    }
    return { logo, icons };
  } finally { bitmap.close(); }
}
