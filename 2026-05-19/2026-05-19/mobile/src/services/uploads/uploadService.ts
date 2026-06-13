import { Platform } from 'react-native';
import api from '../../api/client';

/**
 * Uploads a local photo file to the server and returns the server-relative URL.
 * If the path is already a server URL (starts with /public/), returns it as-is.
 * If upload fails, returns null (non-blocking — sync still proceeds without photo).
 */
export async function uploadPhoto(localUri: string, category: string): Promise<string | null> {
  if (!localUri) return null;
  // Already a server URL from a previous upload
  if (localUri.startsWith('/public/') || localUri.startsWith('http')) return localUri;

  try {
    const filename = localUri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      name: filename,
      type: mimeType,
    } as any);

    const response = await api.post(`/uploads/photo?category=${category}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30_000,
    });

    const serverUrl = response.data?.url;
    console.log(`[UploadService] Photo uploaded: ${category} → ${serverUrl}`);
    return serverUrl || null;
  } catch (err: any) {
    console.warn(`[UploadService] Photo upload failed (${category}):`, err?.message);
    return null;
  }
}
