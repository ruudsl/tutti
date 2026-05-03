import api from './client';

export interface BackupInfo {
  database: { size: number; sizeFormatted: string };
  pdfFiles: { count: number; size: number; sizeFormatted: string };
  mp3Files: { count: number; size: number; sizeFormatted: string };
  total: { size: number; sizeFormatted: string };
}

export const getBackupInfo = async (): Promise<BackupInfo> => {
  const { data } = await api.get('/backup/info');
  return data;
};

export const downloadBackup = async (): Promise<void> => {
  const response = await api.get('/backup', {
    responseType: 'blob',
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;

  const contentDisposition = response.headers['content-disposition'];
  let filename = `harmonie-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/);
    if (match) filename = match[1];
  }

  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const restoreBackup = async (file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('backup', file);
  await api.post('/backup/restore', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 minute timeout for large backups
  });
};
