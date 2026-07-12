import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  name: process.env.DB_NAME || 'bluecat_store_system',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
}));
