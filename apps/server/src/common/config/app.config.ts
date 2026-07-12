import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.APP_PORT || 3000),
  fileStorageDriver: process.env.FILE_STORAGE_DRIVER || 'minio'
}));
